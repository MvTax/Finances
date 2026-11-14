// commun.js (v200) — petits outils partagés par les calculs de v200 : montants lisibles, dépenses du quotidien.

import { formatEuros } from '../../money.js';
import { estDepenseQuotidienne } from '../../calculs.js';
import { contributionDepense } from '../../categories.js';

/** « 12 € » pour un montant rond, « 12,30 € » sinon (toujours positif : le sens est dit par la phrase). */
export const eur = (centimes) => formatEuros(Math.abs(Math.trunc(centimes || 0)), { sansCentimes: true });

/** Arrondi aux 10 centimes les plus proches (0,05 € → 0,10 €). */
export const arrondi10 = (centimes) => Math.round(centimes / 10) * 10;

/** Une dépense du quotidien (celle qui entame la part du jour), au montant positif. */
export const estQuotidienne = (t) => t.sens === 'debit' && !t.ajustement && estDepenseQuotidienne(t) && contributionDepense(t) > 0;

/** Premier jour connu : la plus ancienne opération (avant, l'app ne sait rien). */
export function premierJourConnu(etat) {
  let min = null;
  for (const t of etat.transactions || []) if (t.date && (!min || t.date < min)) min = t.date;
  return min;
}

/** Médiane d'une liste de centimes (moyenne des deux du milieu, arrondie). */
export function mediane(valeurs) {
  if (!valeurs.length) return null;
  const s = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
