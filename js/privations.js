// privations.js — « Je me suis privé » : quand tu renonces à manger dehors (ou à un VTC, un café…), le montant
// que tu aurais dépensé part à l'épargne. Les montants proposés sont ceux que tu paies d'habitude.

import { aujourdhui, ajouterJours } from './dates.js';

/** Ce à quoi on peut renoncer, avec un montant par défaut quand l'historique ne dit rien. */
export const RENONCEMENTS = [
  { id: 'restauration-rapide', categorie: 'restauration-rapide', libelle: 'Un menu au fast-food', defautCentimes: 1000 },
  { id: 'livraison', categorie: 'livraison', libelle: 'Une livraison de repas', defautCentimes: 1800 },
  { id: 'restaurants', categorie: 'restaurants', libelle: 'Un resto', defautCentimes: 1500, min: 500 },
  { id: 'cafe', categorie: 'restaurants', libelle: 'Un café ou une boisson', defautCentimes: 250, max: 499 },
  { id: 'vtc', categorie: 'vtc', libelle: 'Un VTC (j’ai pris les transports)', defautCentimes: 1200 },
];

const mediane = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

/**
 * Montants habituels sur les 90 derniers jours (médiane des paiements de chaque catégorie), arrondis à 10 centimes,
 * et le marchand le plus fréquent. @returns [{ id, libelle, montantCentimes, habituel: bool, marchand }]
 */
export function montantsHabituels(etat, auj = aujourdhui()) {
  const depuis = ajouterJours(auj, -90);
  return RENONCEMENTS.map((r) => {
    const tx = (etat.transactions || []).filter((t) => t.categorie === r.categorie && t.sens === 'debit' && !t.ajustement && t.date >= depuis && t.date <= auj
      && t.montantCentimes > 0 && t.montantCentimes >= (r.min || 0) && t.montantCentimes <= (r.max ?? Infinity));
    if (tx.length < 2) return { ...r, montantCentimes: r.defautCentimes, habituel: false, marchand: null };
    const freq = new Map(); for (const t of tx) freq.set(t.marchand, (freq.get(t.marchand) || 0) + 1);
    const marchand = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return { ...r, montantCentimes: Math.round(mediane(tx.map((t) => t.montantCentimes)) / 10) * 10, habituel: true, marchand };
  });
}

/** Bilan des privations : ce mois-ci, à virer, depuis le début. */
export function bilanPrivations(etat, periode) {
  const toutes = etat.privations || [];
  const duMois = toutes.filter((p) => p.date >= periode.debut && p.date <= periode.fin);
  const somme = (l) => l.reduce((s, p) => s + p.montantCentimes, 0);
  return { nbMois: duMois.length, moisCentimes: somme(duMois), aVirer: toutes.filter((p) => !p.vireLe), aVirerCentimes: somme(toutes.filter((p) => !p.vireLe)), totalCentimes: somme(toutes) };
}
