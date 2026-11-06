// saisie.js (page) — bouton + central : voix par défaut, clavier prioritaire, ticket photo. Ajout en < 5 s.

import { h, icone, mt, annoncer, vibrer } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { champ, champMontant, pastillesCategories, segment, bouton, interrupteur, selectionner } from '../ui/composants.js';
import { toast, toastErreur } from '../ui/toast.js';
import { etat } from '../store.js';
import { formatEuros, arrondiEuroSuperieur, versChamp } from '../money.js';
import { aujourdhui, estIso, ajouterJours, diffJours, formatDateCourte } from '../dates.js';
import { categoriesDepense, categoriesEntree, categorie } from '../categories.js';
import { nouvelleTransaction, ajouterTransaction, supprimerTransaction, categoriesFrequentes } from '../actions.js';
import { tauxHoraire, equivalentTravail, periodeBudget } from '../calculs.js';
import { coutAnnuelRecurrent } from '../detecteurs.js';
import { analyserPhrase } from '../saisie.js';
import { iaDisponible } from '../gemini.js';
import { analyserVoix, analyserTexteIA, analyserTicket, mettreEnFile } from '../ia.js';
import { demarrerEnregistrement, voixDisponible, messageErreurMicro, blobEnBase64, DUREE_MAX_MS } from '../voice.js';
import { choisirPhoto, compresserImage } from '../camera.js';
import { indicationEnvoiGemini } from './communs.js';
import { estEligibleArrondi } from '../epargne.js';
import { importerCapture } from './capture.js';
import { feuillePrivation } from './privation.js';

/** Ouvre la feuille de saisie. vueInitiale : 'voix' | 'clavier' | 'photo'. */
export function ouvrirSaisie(vueInitiale, donneesInitiales = null) {
  const ia = iaDisponible();
  const corps = h('div', { class: 'saisie-vues' });
  const f = ouvrirFeuille({ titre: 'Nouvelle opération', contenu: corps, plein: true, onFermer: () => enreg?.annuler?.() });
  let enreg = null;
  const montrer = (vue, donnees) => {
    corps.classList.add('transition');
    setTimeout(() => corps.classList.remove('transition'), 320);
    if (vue === 'voix') corps.replaceChildren(vueVoix());
    else corps.replaceChildren(vueClavier(donnees || {}));
  };

  // ------------------------------------------------------------------ Vue voix
  function vueVoix() {
    const etatTexte = h('p', { class: 'voix-etat', 'aria-live': 'polite' }, ia.ok ? 'Touche le micro et dis par exemple « 4,50 boulangerie » ou « reçu 20 € de ma sœur ».' : ia.raison);
    const micro = h('button', { class: 'micro', type: 'button', 'aria-label': 'Démarrer l’enregistrement', disabled: !ia.ok || !voixDisponible() || null }, h('span', { class: 'micro-onde', 'aria-hidden': 'true' }), icone('micro'));
    const annuler = h('button', { class: 'btn btn-secondaire', type: 'button', hidden: true }, 'Annuler');
    let debut = 0; let minuteur = 0;
    const arretUI = () => { micro.classList.remove('enregistre'); micro.setAttribute('aria-label', 'Démarrer l’enregistrement'); annuler.hidden = true; clearInterval(minuteur); micro.style.setProperty('--niveau', 0); };
    micro.addEventListener('click', async () => {
      if (enreg) { // arrêt → analyse
        const e = enreg; enreg = null; arretUI();
        etatTexte.textContent = 'Analyse en cours…';
        const r = await e.arreter();
        if (!r || r.blob.size < 800) { etatTexte.textContent = 'Enregistrement trop court : réessaie.'; return; }
        try {
          const res = await analyserVoix(r.blob, r.mime);
          vibrer(15);
          montrer('clavier', { ...res, source: 'voix', confirmation: true });
        } catch (err) {
          if (err.mettreEnFile) { await mettreEnFile('voix', { base64: await blobEnBase64(r.blob), mime: r.mime }); etatTexte.textContent = err.message; }
          else { etatTexte.textContent = err.message; }
        }
        return;
      }
      try {
        enreg = await demarrerEnregistrement({ surNiveau: (n) => micro.style.setProperty('--niveau', n.toFixed(2)), surFin: () => { if (enreg) micro.click(); } });
        debut = performance.now();
        micro.classList.add('enregistre'); micro.setAttribute('aria-label', 'Arrêter et analyser'); annuler.hidden = false; vibrer(10);
        minuteur = setInterval(() => { const s = Math.round((performance.now() - debut) / 1000); etatTexte.textContent = `Je t'écoute… ${s} s / ${DUREE_MAX_MS / 1000} s. Touche à nouveau pour terminer.`; }, 250);
      } catch (err) { enreg = null; arretUI(); etatTexte.textContent = messageErreurMicro(err); }
    });
    annuler.addEventListener('click', () => { enreg?.annuler(); enreg = null; arretUI(); etatTexte.textContent = 'Enregistrement annulé.'; });
    return h('div', { class: 'vue-voix' },
      ia.ok ? indicationEnvoiGemini('l’enregistrement audio (30 s max), la date du jour et la liste des catégories. Rien n’est ajouté sans ta confirmation.') : null,
      micro, etatTexte, annuler,
      h('button', { class: 'btn btn-principal btn-large', type: 'button', onclick: () => { enreg?.annuler(); enreg = null; montrer('clavier'); } }, icone('clavier'), h('span', {}, 'Je ne peux pas parler, écrire')),
      h('button', { class: 'btn btn-secondaire', type: 'button', onclick: () => { enreg?.annuler(); enreg = null; montrer('clavier', { passee: true }); } }, icone('calendrier'), h('span', {}, 'Déclarer une dépense passée')),
      h('button', { class: 'btn btn-secondaire', type: 'button', onclick: () => privation() }, icone('tirelire'), h('span', {}, 'Je me suis privé → épargne')),
      h('button', { class: 'btn btn-secondaire', type: 'button', onclick: () => photoTicket() }, icone('camera'), h('span', {}, 'Photographier un ticket')),
      h('button', { class: 'btn btn-secondaire', type: 'button', onclick: () => depuisCapture() }, icone('importer'), h('span', {}, 'Depuis une capture d’écran')));
  }

  // Une ou plusieurs dépenses lues sur une capture (la feuille de saisie laisse la place à la revue)
  // « Je me suis privé » : la feuille de saisie laisse la place au choix de ce à quoi on a renoncé
  function privation() { enreg?.annuler?.(); enreg = null; f.fermer(); feuillePrivation(); }

  function depuisCapture() { enreg?.annuler?.(); enreg = null; f.fermer(); importerCapture(); }

  // ------------------------------------------------------------------ Vue clavier / confirmation
  function vueClavier(d) {
    let sens = d.sens || 'debit';
    let montant = d.montantCentimes ?? null;
    let libelle = d.libelle || '';
    let cat = d.categorie || null;
    const hier = ajouterJours(aujourdhui(), -1);
    let date = d.date || (d.passee ? hier : aujourdhui());
    let compteId = d.compteId || (etat.comptes.find((c) => c.type === 'courant') || etat.comptes[0])?.id;
    let sansArrondi = false;
    const source = d.source || 'texte';
    const th = tauxHoraire(etat, periodeBudget(aujourdhui(), etat.profil).mois);

    const impact = h('p', { class: 'impact', 'aria-live': 'polite' });
    const arrondiInfo = h('div', { class: 'arrondi-info' });
    const recurrent = h('p', { class: 'cout-annuel', hidden: true });
    const champM = champMontant({ valeur: montant, onValeur: (c) => { montant = c; maj(); }, autofocus: !d.confirmation, label: 'Montant' });
    champM.classList.add('input-montant-geant');
    const pas = (delta) => { montant = Math.max(0, (montant || 0) + delta); champM.value = versChamp(montant); maj(); };
    const ajusteurs = h('div', { class: 'ajusteurs' }, [[-100, '−1'], [-10, '−0,10'], [10, '+0,10'], [100, '+1']].map(([v, l]) => h('button', { type: 'button', class: 'ajusteur', onclick: () => pas(v), 'aria-label': `${v > 0 ? 'Ajouter' : 'Retirer'} ${formatEuros(Math.abs(v))}` }, l)));
    const libInput = h('input', { class: 'input', value: libelle, placeholder: sens === 'debit' ? 'Où ? (Lidl, boulangerie…)' : 'De qui ? (vente, remboursement…)', autocomplete: 'off', enterkeyhint: 'done', oninput: (e) => { libelle = e.target.value; devinerCategorie(); majRecurrent(); } });
    // Les plus utilisées d'abord, puis toutes les catégories rangées par famille
    const zoneFrequentes = h('div');
    const zoneToutes = h('div');
    const zoneCats = h('div', { class: 'zone-categories' }, zoneFrequentes,
      h('details', { class: 'toutes-categories' }, h('summary', {}, 'Toutes les catégories'), zoneToutes));
    const rendreCats = () => {
      const toutes = (sens === 'debit' ? categoriesDepense() : categoriesEntree()).map((c) => c.id);
      const freq = categoriesFrequentes(sens, toutes).slice(0, 6);
      if (cat && !freq.includes(cat)) freq[freq.length - 1] = cat;
      const choisir = (id) => { cat = id; rendreCats(); };
      zoneFrequentes.replaceChildren(pastillesCategories(freq, cat, choisir));
      zoneToutes.replaceChildren(pastillesCategories(toutes, cat, choisir, { grouper: true }));
    };
    const devinerCategorie = () => {
      if (d.categorie || !libelle) return;
      const t = nouvelleTransaction({ sens, montantCentimes: montant || 1, libelle });
      if (t.categorie && !['autres', 'autres-entrees'].includes(t.categorie) && t.categorie !== cat) { cat = t.categorie; rendreCats(); }
    };
    const majRecurrent = () => {
      const t = libelle ? nouvelleTransaction({ sens, montantCentimes: montant || 1, libelle }) : null;
      const r = t ? coutAnnuelRecurrent(etat, t.marchand, aujourdhui()) : null;
      recurrent.hidden = !r || sens !== 'debit';
      if (r) recurrent.textContent = `${t.marchand} : ${formatEuros(r.moyenCentimes)} × ${String(r.parSemaine).replace('.', ',')} fois/semaine = ${formatEuros(r.annuelCentimes)}/an`;
    };
    function maj() {
      if (sens === 'debit' && montant > 0) {
        const tr = equivalentTravail(montant, th);
        impact.textContent = tr ? `Cet achat représente ${tr} de travail.` : '';
        const a = arrondiEuroSuperieur(montant);
        const actif = etat.profil.arrondi?.actif && a > 0;
        arrondiInfo.replaceChildren(actif ? interrupteur(`+${formatEuros(a)} dans ta cagnotte d'arrondis`, !sansArrondi, (v) => { sansArrondi = !v; }) : '');
      } else { impact.textContent = ''; arrondiInfo.replaceChildren(); }
    }
    const segZone = h('div');
    const rendreSeg = () => segZone.replaceChildren(segment([['debit', 'Dépense'], ['credit', 'Entrée']], sens, (v) => { sens = v; cat = null; rendreCats(); maj(); libInput.placeholder = v === 'debit' ? 'Où ? (Lidl, boulangerie…)' : 'De qui ?'; }, 'Type d’opération'));
    rendreSeg();

    // Phrase rapide (compatible dictée du clavier iOS) : parseur local, Gemini en option
    const phrase = h('input', { class: 'input', placeholder: '« 2 fois 3,20 café hier »', autocomplete: 'off', enterkeyhint: 'go', 'aria-label': 'Décris l’opération en une phrase' });
    const analyserPhraseLocale = () => {
      const r = analyserPhrase(phrase.value);
      if (!r) return;
      appliquer(r);
      annoncer('Champs remplis à partir de la phrase.');
    };
    const appliquer = (r) => {
      if (r.sens !== sens) { sens = r.sens; cat = null; rendreSeg(); }
      if (r.montantCentimes) { montant = r.montantCentimes; champM.value = versChamp(montant); }
      if (r.libelle) { libelle = r.libelle; libInput.value = libelle; }
      if (r.date) { date = r.date; dateInput.value = date; }
      if (r.categorie) cat = r.categorie;
      rendreCats(); devinerCategorie(); maj(); majRecurrent();
    };
    phrase.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); analyserPhraseLocale(); } });
    const btnIA = ia.ok ? h('button', { type: 'button', class: 'btn btn-secondaire btn-petit', onclick: async () => {
      if (!phrase.value.trim()) return;
      btnIA.disabled = true;
      try { appliquer(await analyserTexteIA(phrase.value)); }
      catch (e) { if (e.mettreEnFile) await mettreEnFile('texte', { texte: phrase.value }); toastErreur(e.message); analyserPhraseLocale(); }
      finally { btnIA.disabled = false; }
    } }, icone('ia'), 'Gemini') : null;

    const notePassee = h('p', { class: 'petit note-passee', 'aria-live': 'polite' });
    const majNotePassee = () => {
      const per = periodeBudget(aujourdhui(), etat.profil);
      notePassee.textContent = !estIso(date) ? '' : date < per.debut
        ? `Avant ton dernier salaire (${formatDateCourte(per.debut)}) : elle comptera dans les statistiques de ce mois-là, pas dans ton budget actuel.`
        : date === aujourdhui() ? 'C’est aujourd’hui : elle compte dans ta part du jour.'
          : `Elle compte dans ton mois en cours : ta part du jour est recalculée sur les ${diffJours(aujourdhui(), per.fin) + 1} jours qui restent.`;
    };
    const dateInput = h('input', { class: 'input', type: 'date', value: date, max: aujourdhui(), oninput: (e) => { date = e.target.value; majNotePassee(); majPuces(); } });
    // Dépense passée : choix rapide du jour, ou n'importe quelle date
    const puces = h('div', { class: 'puces-date', role: 'group', 'aria-label': 'Jour de la dépense', style: { '--c': 'var(--accent)' } });
    const majPuces = () => puces.replaceChildren(...[[hier, 'Hier'], [ajouterJours(aujourdhui(), -2), 'Avant-hier']].map(([v, l]) => h('button', { type: 'button', class: `pastille ${date === v ? 'active' : ''}`, 'aria-pressed': String(date === v), onclick: () => { date = v; dateInput.value = v; majNotePassee(); majPuces(); } }, l)));
    const blocPassee = d.passee ? h('div', { class: 'bloc-passee' },
      h('p', { class: 'bloc-passee-titre' }, icone('calendrier'), ' Dépense passée : quel jour ?'),
      puces, champ('Ou choisis la date', dateInput), notePassee) : null;
    if (d.passee) { majPuces(); majNotePassee(); }
    const passerEnPassee = () => montrer('clavier', { ...d, sens, montantCentimes: montant, libelle, categorie: cat, compteId, passee: true, date: hier });
    const compteSel = selectionner(etat.comptes.map((c) => [c.id, c.nom]), compteId, (v) => { compteId = v; });
    const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true });

    const ajouter = async () => {
      if (!montant || montant <= 0) { erreur.hidden = false; erreur.textContent = 'Indique un montant.'; champM.focus(); return; }
      if (!estIso(date)) { erreur.hidden = false; erreur.textContent = 'Date invalide.'; return; }
      const tx = nouvelleTransaction({ sens, montantCentimes: montant, libelle: libelle.trim(), categorie: cat, date, compteId, source, arrondiDesactive: sansArrondi, drapeaux: d.sucre ? { sucre: true } : {}, articles: d.articles || [] });
      if (d.sousLibelle) tx.sousLibelle = d.sousLibelle;
      if (d.sucre && interditSucre()) {
        const ok = await alerteReposeLe(tx);
        if (!ok) return;
      }
      await ajouterTransaction(tx);
      f.fermer('ajout');
      vibrer(15);
      const arr = estEligibleArrondi(tx, etat.profil.arrondi) && etat.profil.arrondi?.actif ? arrondiEuroSuperieur(tx.montantCentimes) : 0;
      toast(`${sens === 'debit' ? 'Dépense' : 'Entrée'}${date !== aujourdhui() ? ` du ${formatDateCourte(date)}` : ''} ajoutée : ${formatEuros(montant)}${arr ? ` (+${formatEuros(arr)} d'arrondi)` : ''}`, { action: { libelle: 'Annuler', fn: () => supprimerTransaction(tx) }, duree: 5000 });
    };

    rendreCats(); maj(); majRecurrent();
    return h('form', { class: 'vue-clavier formulaire', onsubmit: (e) => { e.preventDefault(); ajouter(); } },
      d.confirmation ? h('p', { class: 'confirmation-ia' }, icone('ok'), ` Vérifie puis ajoute${d.confiance !== undefined && d.confiance < 0.7 ? ' (je ne suis pas sûr de tout)' : ''}.`) : null,
      segZone,
      blocPassee,
      d.confirmation || d.passee ? null : h('div', { class: 'liens-saisie' },
        h('button', { type: 'button', class: 'lien-capture', onclick: () => passerEnPassee() }, icone('calendrier'), h('span', {}, 'Déclarer une dépense passée')),
        h('button', { type: 'button', class: 'lien-capture', onclick: () => privation() }, icone('tirelire'), h('span', {}, 'Je me suis privé → épargne')),
        h('button', { type: 'button', class: 'lien-capture', onclick: () => depuisCapture() }, icone('importer'), h('span', {}, 'Importer une capture d’écran'))),
      h('div', { class: 'montant-bloc' }, champM, ajusteurs, impact, arrondiInfo, recurrent),
      champ('Libellé', libInput),
      h('div', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Catégorie'), zoneCats),
      d.passee ? champ('Compte', compteSel) : h('div', { class: 'deux-colonnes' }, champ('Date', dateInput), champ('Compte', compteSel)),
      h('details', { class: 'phrase-rapide' }, h('summary', {}, 'Saisie en une phrase'), h('div', { class: 'ligne-phrase' }, phrase, h('button', { type: 'button', class: 'btn btn-secondaire btn-petit', onclick: analyserPhraseLocale }, 'Remplir'), btnIA), h('small', { class: 'aide' }, 'Tu peux utiliser le micro du clavier iOS : la phrase est analysée sur l’iPhone.')),
      erreur,
      h('div', { class: 'actions-saisie' },
        h('button', { type: 'submit', class: 'btn btn-principal btn-large' }, icone('ok'), h('span', {}, 'Ajouter')),
        ia.ok && voixDisponible() ? h('button', { type: 'button', class: 'btn btn-secondaire', onclick: () => montrer('voix') }, icone('micro'), h('span', {}, 'Revenir à la voix')) : null,
        h('button', { type: 'button', class: 'btn btn-secondaire', onclick: () => photoTicket() }, icone('camera'), h('span', {}, 'Ticket'))));
  }

  // ------------------------------------------------------------------ Ticket photo
  async function photoTicket() {
    const fichier = await choisirPhoto();
    if (!fichier) return;
    let image;
    try { image = await compresserImage(fichier); } catch (e) { toastErreur(`Photo illisible : ${e.message}`); return; }
    if (!ia.ok) { toast('Sans Gemini, saisis le total du ticket à la main.'); montrer('clavier', { source: 'photo' }); return; }
    corps.replaceChildren(h('div', { class: 'vue-attente' }, indicationEnvoiGemini(`la photo du ticket recompressée (${image.largeur}×${image.hauteur}, sans métadonnées ni position GPS).`), h('div', { class: 'spinner', role: 'progressbar', 'aria-label': 'Analyse du ticket' }), h('p', {}, 'Lecture du ticket…')));
    try {
      const t = await analyserTicket(image);
      corps.replaceChildren(vueTicket(t));
    } catch (e) {
      if (e.mettreEnFile) await mettreEnFile('photo', { base64: image.base64, mime: image.mime });
      toastErreur(e.message);
      montrer('clavier', { source: 'photo' });
    }
  }

  function vueTicket(t) {
    const ecart = t.ecartCentimes;
    const lignes = t.articles.map((a) => h('div', { class: 'ligne-cle' }, h('span', {}, `${a.quantite > 1 ? a.quantite + ' × ' : ''}${a.nom}`, a.sucre ? h('span', { class: 'etiquette' }, 'sucré') : null, a.typeMarque === 'nationale' ? h('span', { class: 'etiquette' }, 'marque nationale') : null), mt(a.prixCentimes)));
    return h('div', { class: 'vue-ticket' },
      h('h3', {}, t.marchand, ' · ', mt(t.totalCentimes)),
      ecart ? h('p', { class: 'avertissement', role: 'alert' }, icone('alerte'), ` La somme des articles (${formatEuros(t.sommeArticlesCentimes)}) ne correspond pas au total (${formatEuros(t.totalCentimes)}) : écart de ${formatEuros(ecart)}. Vérifie avant d'ajouter.`) : h('p', { class: 'ok-texte' }, icone('ok'), ' Somme des articles = total.'),
      t.economieDistributeurCentimes ? h('p', { class: 'arbitrage' }, icone('ampoule'), ` En marques distributeur, ce ticket aurait coûté environ ${formatEuros(t.economieDistributeurCentimes)} de moins.`) : null,
      h('div', { class: 'liste-cles' }, lignes),
      h('div', { class: 'actions-saisie' }, h('button', { type: 'button', class: 'btn btn-principal btn-large', onclick: () => montrer('clavier', { sens: 'debit', montantCentimes: t.totalCentimes, libelle: t.marchand, date: t.date, source: 'photo', articles: t.articles, sucre: t.articles.some((a) => a.sucre), confirmation: true, categorie: dominante(t.articles) }) }, 'Continuer')));
  }

  if (donneesInitiales) montrer('clavier', donneesInitiales);
  else montrer(vueInitiale || (ia.ok && voixDisponible() ? 'voix' : 'clavier'));
  if (vueInitiale === 'photo') photoTicket();
  return f;
}

function dominante(articles) {
  const m = new Map();
  for (const a of articles) m.set(a.categorie, (m.get(a.categorie) || 0) + a.prixCentimes);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'courses';
}

function interditSucre() {
  const p = etat.parametres.profilNutrition;
  return !!p?.interdits?.some((x) => /sucr/i.test(x));
}

/** Alerte « Repose-le » : justification diététique ET financière. */
function alerteReposeLe(tx) {
  return new Promise((resolve) => {
    const recurrent = coutAnnuelRecurrent(etat, tx.marchand, aujourdhui());
    let rep = false;
    const f = ouvrirFeuille({
      titre: 'Repose-le',
      contenu: h('div', {}, h('p', {}, 'Ton profil nutrition (app Repas) interdit les produits sucrés.'),
        h('p', {}, `Côté budget : ${formatEuros(tx.montantCentimes)}${recurrent ? `, et ${formatEuros(recurrent.annuelCentimes)} par an au rythme actuel chez ${tx.marchand}` : ''}.`)),
      actions: [bouton('Je le repose', () => f.fermer()), bouton('Ajouter quand même', () => { rep = true; f.fermer(); }, { classe: 'btn-principal' })],
      onFermer: () => resolve(rep),
    });
  });
}

export { categorie };
