// communs.js — feuilles et actions partagées entre plusieurs pages.

import { h, icone, mt } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { champ, champMontant, bouton } from '../ui/composants.js';
import { toast, toastErreur } from '../ui/toast.js';
import { etat, majParametres } from '../store.js';
import { construireExport, nomFichierExport } from '../sauvegarde.js';
import { revenusDuMois } from '../calculs.js';
import { confirmerRevenus } from '../actions.js';
import { aujourdhui, formatMois } from '../dates.js';
import { formatEuros } from '../money.js';

/** Export JSON complet : feuille de partage iOS (fichier) avec repli téléchargement. */
export async function exporterSauvegarde() {
  try {
    const donnees = construireExport(etat);
    const texte = JSON.stringify(donnees);
    const nom = nomFichierExport(aujourdhui());
    const fichier = new File([texte], nom, { type: 'application/json' });
    let partage = false;
    if (navigator.canShare?.({ files: [fichier] })) {
      try { await navigator.share({ files: [fichier], title: 'Sauvegarde Budget' }); partage = true; } catch (e) { if (e?.name === 'AbortError') return false; }
    }
    if (!partage) {
      const url = URL.createObjectURL(fichier);
      const a = h('a', { href: url, download: nom });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    await majParametres({ derniereSauvegarde: new Date().toISOString() });
    toast(`Sauvegarde exportée : ${donnees.contenu.transactions.length.toLocaleString('fr-FR')} transactions.`, { type: 'succes' });
    return true;
  } catch (e) {
    toastErreur(`Export impossible : ${e.message}`);
    return false;
  }
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
