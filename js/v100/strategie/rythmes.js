// rythmes.js (v100) — ce que tes journées mettent vraiment de côté, mesuré sur les jours déjà clos du mois :
// la base des projections (« si tu continues comme ça »).

import { resteADepenser, jaugeDuJour, depensesVariables, arrondisPeriode } from '../../calculs.js';
import { ajouterJours, diffJours } from '../../dates.js';

/** Sans assez de jours observés, on suppose qu'un quart de la part du jour n'est pas dépensé. */
export const TAUX_PAR_DEFAUT = 0.25;
export const JOURS_MIN = 5;

/**
 * @returns {{ partDuJourCentimes, joursObserves, misDeCoteCentimes, resteMoyenCentimes, tauxNonDepense, fiable,
 *   depenseMoyenneJourCentimes, arrondisParMoisCentimes, joursSansDepense }}
 */
export function rythmes(etat, auj) {
  const r = resteADepenser(etat, auj);
  const per = r.periode;
  const j = jaugeDuJour(etat, auj, null);
  const depuisRestes = etat.meta?.restesJour?.depuis || per.debut;
  const debut = depuisRestes > per.debut ? depuisRestes : per.debut;
  const hier = ajouterJours(auj, -1);
  const auto = r.privationsAuto || [];
  let jours = 0; let total = 0; let sans = 0;
  for (let d = debut; d <= hier; d = ajouterJours(d, 1)) {
    jours += 1;
    total += (etat.privations || []).filter((p) => p.date === d).reduce((s, p) => s + p.montantCentimes, 0)
      + auto.filter((p) => p.date === d).reduce((s, p) => s + p.montantCentimes, 0);
    if (depensesVariables(etat, d, d) <= 0) sans += 1;
  }
  const part = Math.max(0, j.parJourCentimes);
  const resteMoyen = jours ? Math.round(total / jours) : 0;
  const fiable = jours >= JOURS_MIN && part > 0;
  const taux = fiable ? Math.max(0, Math.min(1, resteMoyen / part)) : TAUX_PAR_DEFAUT;
  const ecoules = Math.max(1, diffJours(per.debut, auj) + 1);
  const il30 = ajouterJours(auj, -30);
  return {
    partDuJourCentimes: part, joursObserves: jours, misDeCoteCentimes: total, resteMoyenCentimes: resteMoyen,
    tauxNonDepense: Math.round(taux * 100) / 100, fiable, joursSansDepense: sans,
    depenseMoyenneJourCentimes: Math.round(depensesVariables(etat, il30, hier) / 30),
    arrondisParMoisCentimes: Math.round((arrondisPeriode(etat, per) / ecoules) * 30),
  };
}
