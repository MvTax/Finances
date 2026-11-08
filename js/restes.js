// restes.js — ce qui reste de la part du jour part à l'épargne, à 5 h du matin le lendemain.
// Exemple : le 7, il reste 1,23 € de la part du jour ; à 5 h le 8, 1,23 € s'ajoutent à la cagnotte.
// La journée budgétaire se termine à 5 h : une dépense notée à 1 h du matin le 8 est datée du 8 (comme sur le relevé),
// mais le 7 n'est clos qu'à 5 h. Chaque reste est une ligne « privation » (source « resteJour ») : elle sort du budget,
// part dans le virement de la semaine et dans l'historique de la cagnotte. Tant qu'elle n'est pas virée, elle est
// recalculée à chaque ouverture (une dépense oubliée, ajoutée après coup sur ce jour, la fait baisser).

import { jaugeDuJour, resteADepenser, privationsAuto } from './calculs.js';
import { ajouterJours, isoDepuisDate, aujourdhui, HEURE_DEBUT_JOUR } from './dates.js';

export const HEURE_CLOTURE = HEURE_DEBUT_JOUR;
export const SOURCE_RESTE = 'resteJour';
const MAX_JOURS = 62;

/** Jour budgétaire d'un instant : avant 5 h, c'est encore la veille. */
export function jourBudgetaire(instant = new Date()) {
  return isoDepuisDate(new Date(instant.getTime() - HEURE_CLOTURE * 3600 * 1000));
}

/** Dernier jour clos à cet instant (la veille du jour budgétaire). */
export function dernierJourClos(instant = new Date()) {
  return ajouterJours(jourBudgetaire(instant), -1);
}

/** Prochaine clôture (instant de 5 h du matin à venir), pour programmer la mise à jour quand l'app reste ouverte. */
export function prochaineCloture(instant = new Date()) {
  const d = new Date(instant);
  d.setHours(HEURE_CLOTURE, 0, 30, 0);
  if (d <= instant) d.setDate(d.getDate() + 1);
  return d;
}

export const estReste = (p) => p?.source === SOURCE_RESTE;
export const idReste = (jour) => `reste-${jour}`;

/** L'état tel qu'il était à la fin du jour (rien de daté après ; sans le reste de ce jour-là). */
function etatAu(etat, jour) {
  return {
    ...etat,
    transactions: (etat.transactions || []).filter((t) => t.date <= jour),
    privations: (etat.privations || []).filter((p) => p.date <= jour && !(estReste(p) && p.date === jour)),
  };
}

/**
 * Ce qui restait de la part du jour à la fin de ce jour : part du jour − dépenses, arrondis et privations du jour
 * − repas à la maison automatiques du jour (ils passent avant). Jamais négatif.
 */
export function resteDuJourPasse(etat, jour) {
  const e = etatAu(etat, jour);
  const j = jaugeDuJour(e, jour);
  const r = resteADepenser(e, jour);
  const repas = privationsAuto(e, r.periode, ajouterJours(jour, 1), r.partPrevueCentimes).find((p) => p.date === jour);
  return Math.max(0, j.parJourCentimes - j.depensesDuJourCentimes - (repas?.montantCentimes || 0));
}

/**
 * Clôt les jours terminés : crée (ou recalcule, tant qu'elle n'est pas virée) la ligne « reste du jour ».
 * @param {object} etat
 * @param {Date} instant
 * @returns {{ ops: Array<{ collection, valeur, supprimer? }>, meta: { depuis, dernier }, nouveaux: Array }}
 */
export function cloturerJours(etat, instant = new Date()) {
  const fin = dernierJourClos(instant);
  const cfg = etat.meta?.restesJour || { depuis: jourBudgetaire(instant), dernier: null };
  const meta = { ...cfg, dernier: cfg.dernier && cfg.dernier > fin ? cfg.dernier : fin };
  const jours = new Set();
  // Restes pas encore virés : recalculés (une dépense oubliée peut avoir été ajoutée sur ce jour)
  for (const p of etat.privations || []) if (estReste(p) && !p.vireLe && p.date >= cfg.depuis && p.date <= fin) jours.add(p.date);
  // Jours terminés depuis la dernière clôture
  let d = cfg.dernier && cfg.dernier >= cfg.depuis ? ajouterJours(cfg.dernier, 1) : cfg.depuis;
  for (let n = 0; d <= fin && n < MAX_JOURS; n++, d = ajouterJours(d, 1)) jours.add(d);
  const courant = { ...etat, privations: [...(etat.privations || [])] };
  const ops = [];
  const nouveaux = [];
  for (const jour of [...jours].sort()) {
    const id = idReste(jour);
    const i = courant.privations.findIndex((p) => p.id === id);
    const avant = i >= 0 ? courant.privations[i] : null;
    if (avant?.vireLe) continue;
    const montant = resteDuJourPasse(courant, jour);
    if (montant > 0) {
      if (avant && avant.montantCentimes === montant) continue;
      const valeur = { ...(avant || {}), id, date: jour, jour, source: SOURCE_RESTE, categorie: 'autres', libelle: 'Reste du budget du jour', montantCentimes: montant, vireLe: null };
      if (i >= 0) courant.privations[i] = valeur; else courant.privations.push(valeur);
      ops.push({ collection: 'privations', valeur });
      if (!avant) nouveaux.push(valeur);
    } else if (avant) {
      courant.privations.splice(i, 1);
      ops.push({ collection: 'privations', valeur: { id }, supprimer: true });
    }
  }
  return { ops, meta, nouveaux };
}

export { aujourdhui };
