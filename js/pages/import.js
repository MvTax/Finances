// import.js — import de relevés (PDF LCL/Revolut, CSV) et restauration de sauvegarde, avec écran de revue.

import { h, icone, mt } from '../ui/dom.js';
import { carte, bouton, champ, selectionner, etatVide, pastillesCategories, interrupteur, ligneTransaction } from '../ui/composants.js';
import { ouvrirFeuille, confirmer } from '../ui/sheet.js';
import { toast, toastErreur } from '../ui/toast.js';
import { etat, majParametres, remplacerTout, enregistrerLot } from '../store.js';
import { aller } from '../router.js';
import { extrairePages } from '../import/pdf-loader.js';
import { parserLCL, estReleveLCL } from '../import/lcl-pdf.js';
import { parserRevolut, estReleveRevolut } from '../import/revolut-pdf.js';
import { analyserCSV, parserGenerique } from '../import/csv.js';
import { preparerImport, validerImport } from '../actions.js';
import { lireSauvegarde, fusionner } from '../sauvegarde.js';
import { categoriesDepense, categoriesEntree, categorie } from '../categories.js';
import { formatDate } from '../dates.js';
import { formatEuros } from '../money.js';
import { iaDisponible } from '../gemini.js';
import { categoriserInconnus, analyserRelevePDF } from '../ia.js';
import { indicationEnvoiGemini } from './communs.js';

export function rendreImport(vue) {
  const input = h('input', { type: 'file', accept: '.pdf,.csv,.json,application/pdf,text/csv,application/json', multiple: true, class: 'sr', id: 'fichiers-import', onchange: (e) => traiter([...e.target.files]) });
  vue.replaceChildren(
    h('button', { class: 'lien retour', type: 'button', onclick: () => aller('reglages') }, icone('retour'), 'Réglages'),
    h('h1', { class: 'titre-page' }, 'Importer'),
    carte('Relevés bancaires', h('div', {},
      h('p', {}, 'PDF LCL (relevé mensuel), PDF Revolut (« Relevé personnalisé »), exports CSV LCL ou Revolut, ou tout autre CSV. Tout est analysé sur ton iPhone : rien n’est envoyé.'),
      h('label', { for: 'fichiers-import', class: 'btn btn-principal btn-large' }, icone('importer'), h('span', {}, 'Choisir des fichiers')), input,
      h('p', { class: 'petit' }, 'Réimporter le même relevé n’ajoute rien (dédoublonnage). Les opérations déjà saisies à la main sont rapprochées, pas dupliquées.'))),
    carte('Restaurer une sauvegarde', h('p', {}, 'Choisis un fichier .json exporté depuis l’app (ou ton fichier d’import privé) avec le même bouton.')));
}

async function traiter(fichiers) {
  if (!fichiers.length) return;
  const resultats = [];
  for (const f of fichiers) {
    try {
      if (/\.json$/i.test(f.name) || f.type === 'application/json') { await restaurer(f); return; }
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') resultats.push(await lirePDF(f));
      else resultats.push(await lireCSVFichier(f));
    } catch (e) { toastErreur(`${f.name} : ${e.message}`); }
  }
  const valides = resultats.filter(Boolean);
  if (valides.length) await revueReconciliation(valides);
}

async function lirePDF(f) {
  const donnees = new Uint8Array(await f.arrayBuffer());
  const attente = toast(`Lecture de ${f.name}…`, { duree: 60000 });
  let pages;
  try { pages = await extrairePages(donnees.slice()); } finally { attente?.fermer(); }
  if (estReleveLCL(pages)) return { nom: f.name, resultat: parserLCL(pages) };
  if (estReleveRevolut(pages)) return { nom: f.name, resultat: parserRevolut(pages) };
  return repliGemini(f, donnees);
}

/** Format inconnu : envoi à Gemini UNIQUEMENT après consentement explicite (jamais par défaut). */
async function repliGemini(f, donnees) {
  const ia = iaDisponible();
  if (!ia.ok) throw new Error('Format de relevé non reconnu. Utilise un export CSV (écran de correspondance des colonnes).');
  const ok = await confirmer({ titre: 'Format non reconnu', message: `Ce relevé contient ton IBAN, ton adresse, ton nom et tes opérations. Avec ton accord, le PDF entier sera envoyé à Google (Gemini) pour en extraire les opérations. Sinon, utilise un export CSV : rien ne sera envoyé.`, ok: 'Envoyer à Gemini', annuler: 'Ne pas envoyer' });
  if (!ok) return null;
  let b = ''; for (let i = 0; i < donnees.length; i += 0x8000) b += String.fromCharCode(...donnees.subarray(i, i + 0x8000));
  const r = await analyserRelevePDF(btoa(b));
  return { nom: f.name, resultat: { banque: 'autre', titulaire: null, operations: r.operations.map((o) => ({ ...o, dateComptable: o.date, libellePrincipal: o.libelle, libelleBrut: o.libelle, lignes: [o.libelle] })), releves: [{ periode: {}, controle: { ok: false, message: 'Lu par Gemini : aucun contrôle de solde possible, vérifie les lignes.' } }], erreurs: [] } };
}

async function lireCSVFichier(f) {
  const texte = await f.text();
  const a = analyserCSV(texte, etat.parametres.mappingsCSV || {});
  if (a.resultat) return { nom: f.name, resultat: a.resultat };
  return correspondance(f.name, a);
}

/** Écran de correspondance des colonnes (CSV générique), mémorisé pour les prochains imports. */
function correspondance(nom, a) {
  return new Promise((resolve) => {
    const cols = a.lignes[0].map((c, i) => [String(i), `${i + 1}. ${c.slice(0, 24) || '(vide)'}`]);
    const sans = [['', '—'], ...cols];
    const m = { date: '0', libelle: '1', montant: '2', debit: '', credit: '', formatDate: 'JJ/MM/AAAA', decimal: ',', entete: true, banque: 'autre' };
    const apercu = h('div', { class: 'apercu-csv' });
    const majApercu = () => {
      const r = parserGenerique(a.lignes, { ...m, date: +m.date, libelle: +m.libelle, montant: m.montant === '' ? null : +m.montant, debit: m.debit === '' ? null : +m.debit, credit: m.credit === '' ? null : +m.credit });
      apercu.replaceChildren(h('p', { class: 'petit' }, `${r.operations.length} opérations reconnues. Exemples :`), ...r.operations.slice(0, 3).map((o) => h('p', { class: 'petit' }, `${formatDate(o.date)} · ${o.libellePrincipal} · ${o.sens === 'debit' ? '−' : '+'}${formatEuros(o.montantCentimes)}`)));
      return r;
    };
    const sel = (cle, opts) => selectionner(opts, m[cle], (v) => { m[cle] = v; majApercu(); });
    let res = null;
    const f = ouvrirFeuille({
      titre: `Colonnes de ${nom}`, plein: true,
      contenu: h('div', { class: 'formulaire' },
        champ('Date', sel('date', cols)), champ('Libellé', sel('libelle', cols)),
        champ('Montant signé', sel('montant', sans), 'Ou bien choisis deux colonnes Débit / Crédit ci-dessous.'),
        h('div', { class: 'deux-colonnes' }, champ('Débit', sel('debit', sans)), champ('Crédit', sel('credit', sans))),
        champ('Format de date', sel('formatDate', [['JJ/MM/AAAA', 'JJ/MM/AAAA'], ['AAAA-MM-JJ', 'AAAA-MM-JJ'], ['MM/JJ/AAAA', 'MM/JJ/AAAA']])),
        champ('Séparateur décimal', sel('decimal', [[',', 'Virgule (1 234,56)'], ['.', 'Point (1,234.56)']])),
        champ('Banque', sel('banque', [['autre', 'Autre'], ['lcl', 'LCL'], ['revolut', 'Revolut']])),
        interrupteur('La première ligne contient les en-têtes', m.entete, (v) => { m.entete = v; majApercu(); }),
        apercu),
      actions: [bouton('Annuler', () => f.fermer()), bouton('Utiliser ces colonnes', async () => {
        res = majApercu();
        const mm = { ...m, date: +m.date, libelle: +m.libelle, montant: m.montant === '' ? null : +m.montant, debit: m.debit === '' ? null : +m.debit, credit: m.credit === '' ? null : +m.credit };
        await majParametres({ mappingsCSV: { ...(etat.parametres.mappingsCSV || {}), [a.cle]: mm } });
        f.fermer();
      }, { classe: 'btn-principal' })],
      onFermer: () => resolve(res ? { nom, resultat: res } : null),
    });
    majApercu();
  });
}

/** Étape 1 : tableau de réconciliation ; un écart bloque la validation silencieuse. */
function revueReconciliation(liste) {
  const lignes = [];
  let probleme = false;
  for (const { nom, resultat } of liste) {
    for (const r of resultat.releves || []) {
      const c = r.controle || {};
      if (!c.ok) probleme = true;
      lignes.push(h('tr', { class: c.ok ? '' : 'ligne-erreur' },
        h('th', { scope: 'row' }, `${resultat.banque.toUpperCase()}${r.numero ? ` n° ${r.numero}` : ''}`, h('small', {}, ` ${nom}`)),
        h('td', {}, r.periode?.debut ? `${formatDate(r.periode.debut)} → ${formatDate(r.periode.fin)}` : '—'),
        h('td', {}, c.sommeDebits !== undefined ? mt(c.sommeDebits) : '—'),
        h('td', {}, c.sommeCredits !== undefined ? mt(c.sommeCredits) : '—'),
        h('td', {}, c.ok ? h('span', { class: 'vert-texte' }, icone('ok'), ' 0,00 €') : h('span', { class: 'negatif-texte' }, c.message || 'écart'))));
      for (const an of r.anomalies || []) lignes.push(h('tr', { class: 'ligne-erreur' }, h('td', { colspan: '5' }, `Page ${an.page} : ${an.raison} — « ${an.texte} »`)));
      for (const lf of (c.lignesFausses || []).slice(0, 10)) lignes.push(h('tr', { class: 'ligne-erreur' }, h('td', { colspan: '5' }, `${formatDate(lf.date)} ${lf.description} : solde lu ${formatEuros(lf.lu)}, attendu ${formatEuros(lf.attendu)}`)));
    }
  }
  const nbOps = liste.reduce((s, x) => s + x.resultat.operations.length, 0);
  const f = ouvrirFeuille({
    titre: 'Contrôle des relevés', plein: true,
    contenu: h('div', {},
      h('p', {}, `${nbOps} opérations lues. Chaque relevé est réconcilié au centime (totaux et soldes).`),
      h('div', { class: 'tableau-defile' }, h('table', { class: 'tableau' }, h('caption', { class: 'sr' }, 'Réconciliation'), h('thead', {}, h('tr', {}, ['Relevé', 'Période', 'Débits', 'Crédits', 'Écart'].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, lignes))),
      probleme ? h('p', { class: 'avertissement', role: 'alert' }, icone('alerte'), ' Un relevé ne se réconcilie pas : les lignes suspectes sont listées. Tu peux importer quand même et corriger à la main, ou annuler.') : null),
    actions: [bouton('Annuler', () => f.fermer()), bouton(probleme ? 'Importer quand même' : 'Continuer', () => { f.fermer(); revueImport(liste.map((x) => x.resultat)); }, { classe: probleme ? 'btn-danger' : 'btn-principal' })],
  });
}

/** Étape 2 : revue avant validation (nouvelles, internes, doublons, catégories à confirmer). */
function revueImport(resultats) {
  let prep;
  try { prep = preparerImport(resultats); } catch (e) { toastErreur(`Import impossible : ${e.message}`); return; }
  const corrections = {};
  const aConfirmer = prep.nouvelles.filter((t) => t.aQualifier || t.categorie === 'autres' || t.confiance === 'moyenne');
  const zoneConfirm = h('div', { class: 'liste' });
  const dessinerConfirm = () => zoneConfirm.replaceChildren(...aConfirmer.slice(0, 60).map((t) => {
    const cat = corrections[t.id] || t.categorie;
    return h('div', { class: 'a-confirmer-ligne' }, ligneTransaction({ ...t, categorie: cat }, () => choisirCategorie(t)), t.aQualifier ? h('p', { class: 'petit' }, 'À qualifier : prêt, remboursement, commande ?') : null);
  }), aConfirmer.length > 60 ? h('p', { class: 'petit' }, `… et ${aConfirmer.length - 60} autres, modifiables ensuite dans Dépenses.`) : null);
  const choisirCategorie = (t) => {
    const ids = (t.sens === 'credit' ? [...categoriesEntree(), ...categoriesDepense()] : categoriesDepense()).map((c) => c.id).concat(['prets-proches', 'virements-internes']);
    const fc = ouvrirFeuille({ titre: t.libelle, contenu: pastillesCategories(ids, corrections[t.id] || t.categorie, (id) => {
      for (const x of aConfirmer.filter((y) => y.marchand === t.marchand && y.sens === t.sens)) corrections[x.id] = id; // un geste = tout le marchand
      fc.fermer(); dessinerConfirm();
    }) });
  };
  dessinerConfirm();
  const ia = iaDisponible();
  const inconnues = prep.nouvelles.filter((t) => t.categorie === 'autres');
  const btnIA = ia.ok && inconnues.length ? h('div', { class: 'bloc-ia' }, indicationEnvoiGemini(`${new Set(inconnues.filter((t) => !t.personne).map((t) => t.marchand)).size} noms de marchands normalisés avec leur montant moyen et leur nombre de passages. Aucun libellé complet, aucune personne.`),
    bouton('Catégoriser les inconnus avec Gemini', async (e) => {
      e.currentTarget.disabled = true;
      try { const r = await categoriserInconnus(inconnues); for (const t of inconnues) if (r.get(t.marchand)) corrections[t.id] = r.get(t.marchand); dessinerConfirm(); toast(`${r.size} marchands catégorisés : vérifie avant de valider.`); }
      catch (err) { toastErreur(err.message); }
    }, { icone: 'ia' })) : null;
  const n = (x) => h('strong', {}, String(x));
  const f = ouvrirFeuille({
    titre: 'Revue avant import', plein: true,
    contenu: h('div', {},
      h('div', { class: 'resume-import' },
        h('p', {}, n(prep.nouvelles.length), ' nouvelles opérations'),
        h('p', {}, n(prep.internes.length), ' virements internes détectés (exclus des dépenses et revenus)'),
        h('p', {}, n(prep.doublons.length), ' doublons écartés'),
        h('p', {}, n(prep.rapprochees.length), ' saisies manuelles rapprochées'),
        h('p', {}, n(prep.nouvelles.filter((t) => t.regleRevolut).length), ' virements Revolut 10–18 € classés « Uber Eats via un tiers »'),
        h('p', {}, n(aConfirmer.length), ' catégories à confirmer (un geste corrige tout le marchand et crée une règle)')),
      btnIA,
      aConfirmer.length ? h('h3', {}, 'À confirmer') : null, zoneConfirm),
    actions: [bouton('Annuler', () => f.fermer()), bouton('Valider l’import', async () => {
      try {
        const r = await validerImport(prep, { corrections });
        // Une correction = une règle mémorisée par marchand
        const regles = new Map();
        for (const t of prep.nouvelles) if (corrections[t.id] && corrections[t.id] !== t.categorie) regles.set(`${t.marchand}|${t.sens}`, { t, cat: corrections[t.id] });
        if (regles.size) {
          const { regleDepuisCorrection } = await import('../rules.js');
          const { nouvelId } = await import('../store.js');
          await enregistrerLot([...regles.values()].map(({ t, cat }) => ({ collection: 'reglesCategorie', valeur: regleDepuisCorrection(t, cat, nouvelId('regle')) })));
        }
        f.fermer();
        toast(`${r.nouvelles} opérations importées${r.chargesAjoutees ? `, ${r.chargesAjoutees} charges fixes détectées (à confirmer)` : ''}.`, { type: 'succes' });
        aller('accueil');
      } catch (e) { toastErreur(`Import échoué : ${e.message}`); }
    }, { classe: 'btn-principal' })],
  });
}

/** Restauration : validation, aperçu, choix fusionner / remplacer. */
async function restaurer(fichier) {
  let objet;
  try { objet = JSON.parse(await fichier.text()); } catch { toastErreur('Ce fichier n’est pas un JSON valide.'); return; }
  const r = lireSauvegarde(objet);
  if (!r.ok) { toastErreur(r.erreurs.join(' ')); return; }
  const a = r.apercu;
  const f = ouvrirFeuille({
    titre: 'Restaurer une sauvegarde',
    contenu: h('div', {},
      h('p', {}, `${a.transactions.toLocaleString('fr-FR')} transactions, ${a.regles} règles, ${a.chargesFixes} charges fixes, ${a.comptes} comptes, ${a.poches} poches, ${a.credits} crédits, ${a.prets} prêts, ${a.mois} mois de revenus.`),
      a.du ? h('p', { class: 'petit' }, `Opérations du ${formatDate(a.du)} au ${formatDate(a.au)}${a.exporteLe ? ` · exportée le ${formatDate(a.exporteLe.slice(0, 10))}` : ''}.`) : null,
      r.migrations.length ? h('p', { class: 'petit' }, `Sauvegarde d'une version antérieure : migrée automatiquement (schéma ${r.migrations.join(', ')}).`) : null,
      h('p', { class: 'petit' }, 'Fusionner : ajoute ce qui manque sans rien écraser. Remplacer : efface les données actuelles (ta clé Gemini et ton code PIN sont conservés).')),
    actions: [
      bouton('Fusionner', async () => { const res = fusionner(etatCourant(), r.contenu); await remplacerTout(res); f.fermer(); toast('Sauvegarde fusionnée.', { type: 'succes' }); aller('accueil'); }),
      bouton('Remplacer', async () => {
        const ok = await confirmer({ titre: 'Remplacer toutes les données ?', message: 'Les données actuelles de l’app seront effacées et remplacées par la sauvegarde.', ok: 'Remplacer', danger: true });
        if (!ok) return;
        await remplacerTout(r.contenu); f.fermer(); toast('Sauvegarde restaurée.', { type: 'succes' });
        aller(etat.parametres.onboarding?.termine ? 'accueil' : 'onboarding');
      }, { classe: 'btn-principal' }),
    ],
  });
}

function etatCourant() {
  const { profil, parametres, meta, ...reste } = etat;
  return { profil, parametres, ...reste };
}

export { etatVide, categorie };
