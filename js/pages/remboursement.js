// remboursement.js — « Plus de détails » de la poche du prêt : ce que change un remboursement en avance.
// Rien ne s'affiche tant qu'on ne l'ouvre pas.

import { h, icone, mt } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { champ, champMontant } from '../ui/composants.js';
import { etat } from '../store.js';
import { soldePoche } from '../epargne.js';
import { tableauAmortissement, totalInterets, capitalRestantDu, simulerRemboursementAnticipe } from '../dettes.js';
import { aVirerEpargne, compteEpargne } from '../virements.js';
import { aujourdhui, formatDate } from '../dates.js';
import { formatEuros, versChamp } from '../money.js';

/** Le prêt relié à la poche (ou le premier prêt amortissable actif). */
export function pretDeLaPoche(poche) {
  const credits = (etat.creditsBancaires || []).filter((c) => c.type === 'amortissable' && c.actif !== false);
  return credits.find((c) => c.id === poche?.creditId) || credits[0] || null;
}

/** Résultat d'un remboursement anticipé de « montant » à la date donnée (null si impossible). */
export function effetRemboursement(credit, montantCentimes, dateIso) {
  if (!credit || !(montantCentimes > 0)) return null;
  try { return simulerRemboursementAnticipe(credit, { date: dateIso, montantCentimes }); } catch { return null; }
}

export function feuilleRemboursement(poche) {
  const credit = pretDeLaPoche(poche);
  const auj = aujourdhui();
  const vire = soldePoche(poche);
  const enAttente = aVirerEpargne(etat, auj).parPoche.find((x) => x.pocheId === poche.id)?.montantCentimes || 0;
  const compte = compteEpargne(poche);
  if (!credit) {
    return ouvrirFeuille({ titre: poche.nom, contenu: h('p', {}, 'Aucun prêt n’est relié à cette poche. Ajoute ton prêt dans Épargne → Prêts pour voir ce que changerait un remboursement en avance.') });
  }
  let tableau = null;
  try { tableau = tableauAmortissement(credit); } catch { /* données du prêt incomplètes */ }
  const dateRemb = auj > credit.dateDebut ? auj : credit.dateDebut;
  const restant = tableau ? capitalRestantDu(tableau, auj, credit.capitalCentimes) : credit.capitalCentimes;
  const fin = tableau?.[tableau.length - 1]?.date;
  const interets = tableau ? totalInterets(tableau) : null;
  const palier = poche.palierCentimes || 50000;

  let montant = Math.max(palier, Math.floor(vire / 10000) * 10000);
  const resultat = h('div', { 'aria-live': 'polite' });
  const dessiner = () => {
    const r = effetRemboursement(credit, montant, dateRemb);
    if (!r) { resultat.replaceChildren(h('p', { class: 'petit' }, 'Indique un montant.')); return; }
    resultat.replaceChildren(
      h('div', { class: 'remb-resultat' },
        h('div', {}, h('small', {}, 'Intérêts en moins'), h('strong', { class: 'vert-texte' }, mt(r.interetsEconomises))),
        h('div', {}, h('small', {}, 'Mensualités en moins'), h('strong', {}, String(r.moisGagnes)))),
      h('div', { class: 'liste-cles' },
        h('div', { class: 'ligne-cle' }, h('span', {}, 'Fin du prêt'), h('span', {}, `${formatDate(r.nouvelleFin)}`, h('small', { class: 'petit' }, ` au lieu du ${formatDate(r.ancienneFin)}`))),
        h('div', { class: 'ligne-cle' }, h('span', {}, 'Reste à rembourser ensuite'), mt(r.capitalApres)),
        h('div', { class: 'ligne-cle' }, h('span', {}, 'Frais de remboursement anticipé'), h('span', {}, r.sansIndemnite ? 'aucun (moins de 10 000 € sur 12 mois)' : 'possibles : vérifie ton contrat'))),
      montant > vire ? h('p', { class: 'petit' }, icone('info'), ` Il y a ${formatEuros(vire)} sur ${compte ? `ton ${compte}` : 'la poche'} aujourd’hui${enAttente ? ` (plus ${formatEuros(enAttente)} à virer)` : ''} : il manque ${formatEuros(montant - vire)} pour ce montant.`) : null);
  };
  const champM = champMontant({ valeur: montant, label: 'Montant remboursé en avance', onValeur: (v) => { montant = v || 0; dessiner(); } });

  // Comparatif rapide : quelques montants ronds jusqu'au capital restant
  const paliers = [...new Set([palier, 100000, 200000, 400000, restant].filter((m) => m > 0 && m <= restant))].sort((a, b) => a - b);
  const comparatif = h('div', { class: 'liste-cles' }, paliers.map((m) => {
    const r = effetRemboursement(credit, m, dateRemb);
    return r ? h('button', { type: 'button', class: 'ligne-cle remb-palier', onclick: () => { montant = m; champM.value = versChamp(m); dessiner(); resultat.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } },
      h('span', {}, m === restant ? `Tout (${formatEuros(m, { sansCentimes: true })})` : formatEuros(m, { sansCentimes: true }), h('small', {}, ` fin le ${formatDate(r.nouvelleFin)}`)),
      h('span', { class: 'vert-texte' }, '−', mt(r.interetsEconomises))) : null;
  }));

  dessiner();
  return ouvrirFeuille({
    titre: 'Rembourser en avance',
    plein: true,
    contenu: h('div', { class: 'formulaire remb' },
      h('div', { class: 'liste-cles' },
        h('div', { class: 'ligne-cle' }, h('span', {}, credit.libelle || 'Prêt'), mt(credit.capitalCentimes)),
        h('div', { class: 'ligne-cle' }, h('span', {}, 'Encore dû aujourd’hui'), mt(restant)),
        h('div', { class: 'ligne-cle' }, h('span', {}, 'Mensualité'), h('span', {}, mt(credit.mensualiteCentimes || 0), credit.dateDebut > auj ? h('small', { class: 'petit' }, ` à partir du ${formatDate(credit.dateDebut)}`) : null)),
        interets !== null ? h('div', { class: 'ligne-cle' }, h('span', {}, `Intérêts prévus (${String(credit.tauxPourcent).replace('.', ',')} %)`), mt(interets)) : null,
        fin ? h('div', { class: 'ligne-cle' }, h('span', {}, 'Fin prévue'), h('span', {}, formatDate(fin))) : null,
        h('div', { class: 'ligne-cle forte' }, h('span', {}, `Dans la poche${compte ? ` (${compte})` : ''}`), h('span', {}, mt(vire), enAttente ? h('small', { class: 'petit' }, ` + ${formatEuros(enAttente)} à virer`) : null))),
      h('h3', { class: 'sous-titre' }, 'Et si je rembourse…'),
      champ('Montant', champM, `Simulé le ${formatDate(dateRemb)}${credit.dateDebut > auj ? ' (début du prêt)' : ''}, avec la même mensualité : le prêt se termine plus tôt.`),
      resultat,
      h('h3', { class: 'sous-titre' }, 'En un coup d’œil'),
      comparatif,
      h('p', { class: 'petit' }, 'Rembourser en avance réduit les intérêts que tu paies sur le prêt. Pour le faire : virement du Livret A vers ton compte courant, puis demande écrite à LCL (messagerie ou lettre) en précisant « réduction de durée, mensualité inchangée ».')),
  });
}
