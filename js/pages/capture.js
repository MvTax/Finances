// capture.js (page) — « Depuis une capture d'écran » : une ou plusieurs captures → liste d'opérations à vérifier,
// cocher, corriger, puis ajouter. Lecture sur le téléphone par défaut ; Gemini en option (avec indication d'envoi).

import { h, icone, vibrer } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { bouton, champMontant, selectionner } from '../ui/composants.js';
import { toast, toastErreur } from '../ui/toast.js';
import { etat } from '../store.js';
import { formatEuros } from '../money.js';
import { aujourdhui, formatDate, estIso } from '../dates.js';
import { categoriesDepense, categoriesEntree } from '../categories.js';
import { nouvelleTransaction, ajouterTransaction, compteCourant } from '../actions.js';
import { iaDisponible } from '../gemini.js';
import { analyserCaptureIA } from '../ia.js';
import { compresserImage } from '../camera.js';
import { indicationEnvoiGemini } from './communs.js';
import { lireCapture, extraireOperations, fusionnerCaptures, dejaPresente, devinerBanque } from '../capture.js';

/** Choix d'une ou plusieurs images (photothèque, fichiers ou appareil photo). */
function choisirImages() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr' });
    input.addEventListener('change', () => { resolve([...(input.files || [])]); input.remove(); }, { once: true });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); }, { once: true });
    document.body.append(input);
    input.click();
  });
}

/** Point d'entrée : choisit les captures puis ouvre la revue. */
export async function importerCapture() {
  const fichiers = await choisirImages();
  if (!fichiers.length) return;
  const corps = h('div', { class: 'capture' });
  const f = ouvrirFeuille({ titre: fichiers.length > 1 ? `${fichiers.length} captures d’écran` : 'Capture d’écran', contenu: corps, plein: true, onFermer: () => apercus.forEach((u) => URL.revokeObjectURL(u)) });
  const apercus = fichiers.map((x) => URL.createObjectURL(x));
  const ia = iaDisponible();

  const attente = (texte, avecGemini = false) => corps.replaceChildren(h('div', { class: 'vue-attente' },
    avecGemini ? indicationEnvoiGemini(`${fichiers.length > 1 ? 'les captures recompressées' : 'la capture recompressée'} (sans métadonnées), la date du jour et la liste des catégories. Rogne avant ce que tu ne veux pas envoyer (nom, IBAN…).`) : h('p', { class: 'petit' }, 'Lecture sur ton téléphone : rien n’est envoyé.'),
    h('div', { class: 'spinner', role: 'progressbar', 'aria-label': 'Lecture en cours' }),
    h('p', { 'aria-live': 'polite' }, texte)));

  async function lireSurTelephone() {
    const listes = []; const lignesToutes = [];
    try {
      for (let i = 0; i < fichiers.length; i++) {
        const lignes = await lireCapture(fichiers[i], { surProgres: (t) => attente(fichiers.length > 1 ? `${t} (${i + 1}/${fichiers.length})` : t) });
        lignesToutes.push(...lignes);
        listes.push(extraireOperations(lignes, aujourdhui()).operations);
      }
    } catch (e) {
      console.error(e);
      revue([], { erreur: `La lecture sur le téléphone a échoué (${e?.message || e}).` });
      return;
    }
    revue(fusionnerCaptures(listes), { banque: devinerBanque(lignesToutes), source: 'telephone' });
  }

  async function lireAvecGemini() {
    attente('Lecture par Gemini…', true);
    const listes = []; let banque = null;
    try {
      for (const fichier of fichiers) {
        const image = await compresserImage(fichier, { max: 1600, qualite: 0.85 });
        const r = await analyserCaptureIA(image);
        banque = banque || r.banque;
        listes.push(r.operations);
      }
    } catch (e) {
      revue([], { erreur: e.message || 'Gemini n’a pas pu lire la capture.' });
      return;
    }
    revue(fusionnerCaptures(listes), { banque, source: 'gemini' });
  }

  function revue(operations, { banque = null, erreur = null, source } = {}) {
    const comptes = etat.comptes.filter((c) => c.actif !== false);
    let compteId = (banque && comptes.find((c) => c.banque === banque)?.id) || compteCourant()?.id;
    const lignes = operations.map((o) => {
      const apercu = nouvelleTransaction({ sens: o.sens, montantCentimes: o.montantCentimes, libelle: o.libelle, date: o.date, categorie: o.categorie || null });
      const deja = dejaPresente(etat, o);
      return { ...o, libelle: o.libelle, categorie: apercu.categorie, coche: !deja, deja };
    });

    const bouttonAjouter = h('button', { type: 'button', class: 'btn btn-principal btn-large' });
    const majBouton = () => {
      const n = lignes.filter((l) => l.coche && l.montantCentimes > 0).length;
      bouttonAjouter.disabled = !n || null;
      bouttonAjouter.textContent = n ? `Ajouter ${n} opération${n > 1 ? 's' : ''}` : 'Coche au moins une opération';
    };
    bouttonAjouter.addEventListener('click', async () => {
      const choisies = lignes.filter((l) => l.coche && l.montantCentimes > 0);
      for (const l of choisies) {
        const tx = nouvelleTransaction({ sens: l.sens, montantCentimes: l.montantCentimes, libelle: l.libelle, categorie: l.categorie, date: estIso(l.date) ? l.date : aujourdhui(), compteId, source: 'capture' });
        await ajouterTransaction(tx);
      }
      vibrer(15);
      f.fermer();
      toast(`${choisies.length} opération${choisies.length > 1 ? 's ajoutées' : ' ajoutée'}.`, { type: 'succes' });
    });

    const ligneUI = (l) => {
      const cats = (l.sens === 'debit' ? categoriesDepense() : categoriesEntree()).map((c) => [c.id, c.nom]);
      const montant = champMontant({ valeur: l.montantCentimes, onValeur: (c) => { l.montantCentimes = c || 0; majBouton(); }, label: l.sens === 'debit' ? 'Montant de la dépense' : 'Montant reçu' });
      const art = h('article', { class: `capture-op ${l.coche ? '' : 'decochee'}` },
        h('input', { type: 'checkbox', class: 'capture-coche', checked: l.coche || null, 'aria-label': `Ajouter ${l.libelle}`, onchange: (e) => { l.coche = e.target.checked; art.classList.toggle('decochee', !l.coche); majBouton(); } }),
        h('div', { class: 'capture-champs' },
          h('div', { class: 'capture-ligne1' },
            h('input', { class: 'input', value: l.libelle, 'aria-label': 'Libellé', oninput: (e) => { l.libelle = e.target.value; } }),
            h('label', { class: `capture-montant ${l.sens}` }, h('span', { 'aria-hidden': 'true' }, l.sens === 'debit' ? '−' : '+'), montant, h('span', { 'aria-hidden': 'true' }, '€'))),
          h('div', { class: 'capture-ligne2' },
            h('input', { class: 'input', type: 'date', value: l.date, max: aujourdhui(), 'aria-label': 'Date', onchange: (e) => { l.date = e.target.value; } }),
            selectionner(cats, l.categorie, (v) => { l.categorie = v; }, { aria: 'Catégorie' })),
          l.deja ? h('p', { class: 'capture-note' }, icone('info'), ` Déjà dans l’app : ${l.deja.libelle || l.deja.marchand}, ${formatEuros(l.deja.montantCentimes)} le ${formatDate(l.deja.date)}. Décochée pour éviter un doublon.`) : null,
          l.incertain ? h('p', { class: 'capture-note capture-incertain' }, icone('alerte'), ' Lecture incertaine : vérifie le montant sur la capture.') : null,
          l.dateDevinee ? h('p', { class: 'capture-note' }, 'Pas de date sur la capture : aujourd’hui par défaut.') : null));
      return art;
    };

    const relire = ia.ok && source !== 'gemini' ? bouton('Relire avec Gemini', () => lireAvecGemini(), { classe: 'btn-secondaire' }) : null;
    const apercuCaptures = h('details', { class: 'capture-apercu' }, h('summary', {}, fichiers.length > 1 ? 'Voir les captures' : 'Voir la capture'),
      ...apercus.map((u) => h('img', { src: u, alt: 'Capture importée' })));

    if (!lignes.length) {
      corps.replaceChildren(h('div', { class: 'capture-vide' },
        h('p', {}, erreur || 'Je n’ai trouvé aucun montant en euros sur cette capture.'),
        h('p', { class: 'petit' }, 'Une capture de la liste des opérations de ton appli bancaire, ou d’un reçu avec son total, marche le mieux.'),
        relire,
        bouton('Saisir à la main', async () => { f.fermer(); const { ouvrirSaisie } = await import('./saisie.js'); ouvrirSaisie('clavier'); }, { classe: 'btn-secondaire' }),
        apercuCaptures));
      return;
    }
    const nbDeja = lignes.filter((l) => l.deja).length;
    corps.replaceChildren(h('div', {},
      h('p', { class: 'capture-resume' }, `${lignes.length} opération${lignes.length > 1 ? 's trouvées' : ' trouvée'}. Vérifie les montants et les dates avant d’ajouter.${nbDeja ? ` ${nbDeja} ${nbDeja > 1 ? 'sont' : 'est'} déjà dans l’app.` : ''}`),
      comptes.length > 1 ? h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Sur le compte'), selectionner(comptes.map((c) => [c.id, c.nom]), compteId, (v) => { compteId = v; }, { aria: 'Compte' })) : null,
      h('div', { class: 'capture-liste' }, lignes.map(ligneUI)),
      apercuCaptures,
      h('div', { class: 'capture-actions' }, bouttonAjouter, relire)));
    majBouton();
  }

  attente('Lecture de la capture…');
  await lireSurTelephone();
}
