// tresorerie.js (v100) — le solde du compte courant jour par jour jusqu'au prochain salaire : deux trajectoires
// (en dépensant exactement ta part du jour, et à ton rythme réel), les prélèvements à venir, et le point le plus bas.

import { projectionDecouvert, periodeBudget, jaugeDuJour, rythmeQuotidien } from '../../calculs.js';
import { diffJours } from '../../dates.js';

export function tresorerie(etat, auj) {
  const per = periodeBudget(auj, etat.profil);
  const jours = Math.max(1, diffJours(auj, per.fin));
  const part = Math.max(0, jaugeDuJour(etat, auj, null).parJourCentimes);
  const reel = Math.max(0, rythmeQuotidien(etat, auj));
  const plan = projectionDecouvert(etat, auj, { jours, rythmeCentimes: part });
  if (!plan) return null;
  const rythme = projectionDecouvert(etat, auj, { jours, rythmeCentimes: reel });
  const points = plan.jourParJour.map((p, i) => ({ date: p.date, planCentimes: p.soldeCentimes, rythmeCentimes: rythme.jourParJour[i].soldeCentimes, evenements: p.evenements }));
  const min = (cle) => points.reduce((m, p) => (p[cle] < m[cle] ? p : m), points[0]);
  const bas = min('planCentimes'); const basRythme = min('rythmeCentimes');
  return {
    compte: plan.compte, soldeActuelCentimes: plan.soldeActuelCentimes, finLe: per.fin, salaireLe: per.salaireAttenduLe || null,
    partDuJourCentimes: part, rythmeReelCentimes: reel, points, evenements: plan.evenements,
    totalPrelevementsCentimes: -plan.evenements.reduce((s, e) => s + e.montantCentimes, 0),
    plusBas: { date: bas.date, soldeCentimes: bas.planCentimes }, plusBasRythme: { date: basRythme.date, soldeCentimes: basRythme.rythmeCentimes },
    finPlanCentimes: points[points.length - 1].planCentimes, finRythmeCentimes: points[points.length - 1].rythmeCentimes,
    risque: basRythme.rythmeCentimes < 0 ? 'decouvert' : bas.planCentimes < 5000 || basRythme.rythmeCentimes < 5000 ? 'juste' : 'ok',
  };
}
