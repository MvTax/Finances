// jours-sans-depense.js (V2) — calendrier des jours sans dépense variable et séries.

import { contributionDepense } from '../categories.js';
import { ajouterJours } from '../dates.js';

/** Ensemble des jours (AAAA-MM-JJ) sans aucune dépense variable entre debut et fin. */
export function joursSansDepense(transactions, debut, fin) {
  const avecDepense = new Set(transactions.filter((t) => !t.chargeFixeId && contributionDepense(t) > 0).map((t) => t.date));
  const res = [];
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) if (!avecDepense.has(d)) res.push(d);
  return res;
}

/** Série en cours (jours consécutifs sans dépense se terminant à `jusquAu`) et meilleure série. */
export function series(jours, jusquAu) {
  const set = new Set(jours);
  let courante = 0;
  for (let d = jusquAu; set.has(d); d = ajouterJours(d, -1)) courante++;
  let meilleure = 0; let n = 0; let prec = null;
  for (const d of [...jours].sort()) { n = prec && ajouterJours(prec, 1) === d ? n + 1 : 1; meilleure = Math.max(meilleure, n); prec = d; }
  return { courante, meilleure };
}
