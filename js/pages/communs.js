// communs.js — feuilles et actions partagées entre plusieurs pages.

import { h, icone, mt } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { champ, champMontant, bouton } from '../ui/composants.js';
import { toast, toastErreur } from '../ui/toast.js';
import { etat, majParametres } from '../store.js';
import { construireExport, nomFichierExport, csvOperations } from '../sauvegarde.js';
import { nomCategorie } from '../categories.js';
import { versionApp } from '../version.js';
import { revenusDuMois } from '../calculs.js';
import { confirmerRevenus } from '../actions.js';
import { aujourdhui, formatMois } from '../dates.js';
import { formatEuros } from '../money.js';
import { chiffrer, dechiffrer, estChiffre } from '../chiffrement.js';

/** Export JSON complet : feuille de partage iOS (fichier) avec repli téléchargement. */
/** Feuille de partage iOS (« Enregistrer dans Fichiers », AirDrop…), avec repli téléchargement. false si annulé. */
async function partagerFichier(texte, nom, type, titre) {
  const fichier = new File([texte], nom, { type });
  if (navigator.canShare?.({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: titre }); return true; } catch (e) { if (e?.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(fichier);
  const a = h('a', { href: url, download: nom });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

/** Export complet (JSON) : toutes les données et l'historique, sans les secrets. Chiffré si un mot de passe est réglé. */
export async function exporterSauvegarde() {
  try {
    const donnees = construireExport(etat, { version: versionApp });
    const mdp = etat.parametres.motDePasseSauvegarde;
    const texte = mdp ? JSON.stringify(await chiffrer(JSON.stringify(donnees), mdp)) : JSON.stringify(donnees);
    const nom = mdp ? nomFichierExport(aujourdhui()).replace(/\.json$/, '-chiffree.json') : nomFichierExport(aujourdhui());
    if (!await partagerFichier(texte, nom, 'application/json', 'Sauvegarde Budget')) return false;
    await majParametres({ derniereSauvegarde: new Date().toISOString() });
    toast(`Sauvegarde${mdp ? ' chiffrée' : ''} exportée : ${donnees.contenu.transactions.length.toLocaleString('fr-FR')} opérations et tout le reste.`, { type: 'succes' });
    return true;
  } catch (e) {
    toastErreur(`Export impossible : ${e.message}`);
    return false;
  }
}

/** Toutes les opérations en tableau (CSV pour Numbers ou Excel). Jamais chiffré : c'est un fichier à lire, pas à restaurer. */
export async function exporterTableur() {
  try {
    const texte = csvOperations(etat, nomCategorie);
    if (!await partagerFichier(texte, `budget-operations-${aujourdhui()}.csv`, 'text/csv', 'Opérations Budget')) return false;
    toast(`Tableau exporté : ${etat.transactions.length.toLocaleString('fr-FR')} opérations.`, { type: 'succes' });
    return true;
  } catch (e) {
    toastErreur(`Export impossible : ${e.message}`);
    return false;
  }
}

/**
 * Lit un fichier JSON choisi par l'utilisateur ; s'il s'agit d'une sauvegarde chiffrée, essaie le mot de passe enregistré,
 * puis le demande. @returns l'objet, ou null (annulé / illisible : un message a été affiché)
 */
export async function lireFichierJson(fichier) {
  let objet;
  try { objet = JSON.parse(await fichier.text()); } catch { toastErreur('Ce fichier n’est pas un JSON valide.'); return null; }
  if (!estChiffre(objet)) return objet;
  const essayer = async (mdp) => { try { return JSON.parse(await dechiffrer(objet, mdp)); } catch { return null; } };
  if (etat.parametres.motDePasseSauvegarde) { const o = await essayer(etat.parametres.motDePasseSauvegarde); if (o) return o; }
  return new Promise((resolve) => {
    let mdp = ''; let fini = false;
    const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true });
    const f = ouvrirFeuille({
      titre: 'Sauvegarde chiffrée',
      contenu: h('div', { class: 'formulaire' }, h('p', {}, 'Ce fichier est chiffré. Tape le mot de passe choisi au moment de la sauvegarde.'),
        h('input', { class: 'input', type: 'password', autocomplete: 'current-password', 'aria-label': 'Mot de passe de la sauvegarde', oninput: (e) => { mdp = e.target.value; } }), erreur),
      actions: [bouton('Annuler', () => f.fermer()), bouton('Ouvrir', async () => {
        const o = await essayer(mdp);
        if (!o) { erreur.hidden = false; erreur.textContent = 'Mot de passe incorrect.'; return; }
        fini = true; f.fermer(); resolve(o);
      }, { classe: 'btn-principal' })],
      onFermer: () => { if (!fini) resolve(null); },
    });
  });
}

/** Feuille « Revenus du mois » : salaire exact et prime d'activité exacte, au centime. */
export function feuilleRevenus(mois) {
  const r = revenusDuMois(etat, mois);
  let salaire = r.salaireCentimes || null;
  let prime = r.primeActiviteCentimes ?? null;
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true });
  const total = h('p', { class: 'total-revenus', 'aria-live': 'polite' });
  const majTotal = () => { total.textContent = `Total du mois : ${formatEuros((salaire || 0) + (prime || 0))}`; };
  majTotal();
  const fSal = champMontant({ valeur: salaire, onValeur: (c) => { salaire = c; majTotal(); }, autofocus: true });
  const fPrime = champMontant({ valeur: prime, onValeur: (c) => { prime = c; majTotal(); } });
  const f = ouvrirFeuille({
    titre: `Revenus de ${formatMois(mois)}`,
    contenu: h('div', { class: 'formulaire' },
      h('p', { class: 'texte-feuille' }, r.statut === 'attendu' ? `Montants pré-remplis avec ${r.moisSource ? formatMois(r.moisSource) : 'le dernier mois connu'} : confirme ou corrige au centime près.` : 'Montants confirmés : tu peux les corriger.'),
      champ('Salaire net reçu', fSal, 'Montant exact du virement de paie.'),
      champ("Prime d'activité (CAF)", fPrime, "L'aide au logement versée au bailleur n'est jamais comptée ici."),
      total, erreur),
    actions: [
      bouton('Annuler', () => f.fermer('annuler')),
      bouton('Confirmer', async () => {
        if (salaire === null || salaire < 0 || prime === null || prime < 0) { erreur.hidden = false; erreur.textContent = 'Saisis deux montants valides (0 si tu n’as rien reçu).'; return; }
        try {
          await confirmerRevenus(mois, { salaireCentimes: salaire, primeActiviteCentimes: prime });
          f.fermer('ok');
          toast('Revenus confirmés : reste à dépenser et plan recalculés.', { type: 'succes' });
        } catch (e) { erreur.hidden = false; erreur.textContent = e.message; }
      }, { classe: 'btn-principal' }),
    ],
  });
  return f;
}

/** Indique clairement ce qui part vers Gemini AVANT l'envoi. */
export function indicationEnvoiGemini(texte) {
  return h('div', { class: 'envoi-gemini', role: 'note' }, icone('envoi'), h('span', {}, h('strong', {}, 'Envoi à Gemini : '), texte));
}

export function ligneCle(libelle, valeur) {
  return h('div', { class: 'ligne-cle' }, h('span', {}, libelle), h('span', { class: 'ligne-cle-valeur' }, typeof valeur === 'number' ? mt(valeur) : valeur));
}
