// plan.js — « Mon plan » : allocation du mois et projection mois par mois jusqu'à l'atteinte des cibles.

import { periodeBudget, revenusDuMois, chargesFixesPeriode, prelevementsHorsCharges, abonnementsAVenir, depensesPrevuesPeriode, dettesPeriode, besoinsVitaux } from './calculs.js';
import { proposerAllocation, repartirVersement, soldePoche } from './epargne.js';
import { simulerPretAvecPoche, echeancesEntre } from './dettes.js';
import { ajouterMois, dateDuMois, ajouterJours, aujourdhui } from './dates.js';

function periodeDuMois(etat, mois) {
  return periodeBudget(dateDuMois(mois, etat.profil.jourSalaireHabituel || 1), etat.profil);
}

/** Entrées du plan pour un mois (revenus, charges fixes, dettes, présence de crédits courts). */
export function entreesDuMois(etat, mois) {
  const per = periodeDuMois(etat, mois);
  const revenus = revenusDuMois(etat, mois).totalCentimes;
  // Mêmes charges que le budget du jour : charges fixes + prélèvements payés sans charge correspondante
  const charges = [...chargesFixesPeriode(etat, per), ...prelevementsHorsCharges(etat, per.debut, per.fin), ...abonnementsAVenir(etat, per)].reduce((s, c) => s + c.montantPrevuCentimes, 0)
    + depensesPrevuesPeriode(etat, per).filter((d) => !d.realisee).reduce((s, d) => s + d.montantCentimes, 0); // dépenses prévues : réservées comme une charge
  const dettes = dettesPeriode(etat, per);
  const totalDettes = dettes.reduce((s, d) => s + d.montantCentimes, 0);
  // Les échéances d'un prêt amortissable sont des charges de long terme, pas des dettes « court terme »
  const court = dettes.filter((d) => d.court || d.type === 'proche');
  const futur = echeancesEntre(etat, ajouterJours(per.fin, 1), '9999-12-31').filter((d) => !d.payee && (d.court || (d.type === 'proche' && d.sens === 'empruntéParMoi')));
  return {
    periode: per, revenusCentimes: revenus, chargesFixesCentimes: charges, dettesCentimes: totalDettes,
    besoinsVitauxCentimes: besoinsVitaux(etat).centimes,
    creditCourtEnCours: dettes.some((d) => d.court),
    dettesCourtTermeRestantes: court.length > 0 || futur.length > 0,
  };
}

/**
 * Plan sur n mois : mois déjà planifiés (stockés) puis propositions de l'algorithme, avec soldes de poches cumulés.
 * @returns {Array<{ mois, stocke, plan, soldes }>}
 */
export function planDesMois(etat, depuisMois, nbMois = 24) {
  const soldes = Object.fromEntries(etat.poches.map((p) => [p.id, soldePoche(p)]));
  const res = [];
  for (let k = 0; k < nbMois; k++) {
    const mois = ajouterMois(depuisMois, k);
    // Les mois déjà planifiés gardent leurs notes ; les montants suivent toujours la règle « l'épargne passe après »
    const stocke = etat.planMensuel.find((p) => p.mois === mois);
    const e = entreesDuMois(etat, mois);
    const a = proposerAllocation(e, etat.profil.parametresPlan || {});
    const actives = etat.poches.filter((p) => p.actif !== false);
    const allocations = repartirVersement(a.epargneTotaleCentimes, actives, soldes);
    for (const x of allocations) soldes[x.pocheId] = (soldes[x.pocheId] || 0) + x.montantCentimes;
    const plan = {
      ...(stocke ? { note: stocke.note, objectif: stocke.objectif, vieDetail: stocke.vieDetail } : {}),
      mois, revenusCentimes: e.revenusCentimes, chargesFixesCentimes: e.chargesFixesCentimes, dettesDuMoisCentimes: e.dettesCentimes,
      disponibleCentimes: a.disponibleCentimes, allocationsPoches: allocations, arrondisEstimesCentimes: 0, vieCouranteCentimes: a.vieCouranteCentimes,
      besoinsVitauxCentimes: a.vieObligatoireCentimes, margeCentimes: a.margeCentimes, mode: a.mode, statut: stocke?.statut || 'propose', periode: e.periode,
    };
    res.push({ mois, stocke: !!stocke, plan, soldes: { ...soldes } });
  }
  return res;
}

/** Mois d'atteinte de chaque poche dans la projection. */
export function atteintes(etat, projection) {
  const r = {};
  for (const p of etat.poches) {
    if (!p.cibleCentimes) continue;
    const l = projection.find((x) => (x.soldes[p.id] || 0) >= p.cibleCentimes);
    r[p.id] = l ? l.mois : null;
  }
  return r;
}

/**
 * Scénarios d'affectation de l'épargne après le Coussin : tout voiture / répartition / tout prêt.
 * Renvoie la date de fin du prêt et les intérêts pour chacun (remboursement anticipé à chaque palier).
 */
export function scenariosPret(etat, depuisMois, nbMois = 48) {
  const credit = etat.creditsBancaires.find((c) => c.type === 'amortissable' && c.dateDebut && c.capitalCentimes && c.mensualiteCentimes && c.tauxPourcent !== undefined);
  const pochePret = etat.poches.find((p) => p.type === 'remboursementAnticipe');
  const pocheProjet = etat.poches.find((p) => p.type === 'projet');
  if (!credit || !pochePret) return null;
  const palier = pochePret.palierCentimes || 50000;
  const base = planDesMois(etat, depuisMois, nbMois);
  const resultat = {};
  for (const sc of ['projet', 'repartition', 'pret']) {
    let projet = soldePoche(pocheProjet || { soldeInitialCentimes: 0 });
    const parMois = new Map();
    for (const l of base) {
      const total = l.plan.allocationsPoches.filter((a) => a.pocheId === pochePret.id || a.pocheId === pocheProjet?.id).reduce((s, a) => s + a.montantCentimes, 0);
      let versPret;
      if (l.stocke) versPret = l.plan.allocationsPoches.filter((a) => a.pocheId === pochePret.id).reduce((s, a) => s + a.montantCentimes, 0);
      else if (sc === 'pret') versPret = total;
      else if (sc === 'projet') { const place = pocheProjet?.cibleCentimes ? Math.max(0, pocheProjet.cibleCentimes - projet) : 0; versPret = Math.max(0, total - place); }
      else {
        // Répartition réglée entre la poche projet (achats) et la poche prêt
        const place = pocheProjet?.cibleCentimes ? Math.max(0, pocheProjet.cibleCentimes - projet) : 0;
        const pp = pocheProjet?.partRepartition ?? 50; const pr = pochePret.partRepartition ?? 50;
        const versProjet = Math.min(place, Math.round(total * (pp + pr ? pp / (pp + pr) : 0.5)));
        versPret = total - versProjet;
      }
      projet += total - versPret;
      parMois.set(l.mois, versPret);
    }
    resultat[sc] = simulerPretAvecPoche(credit, (m) => parMois.get(m) || 0, palier);
  }
  resultat.sansAnticipe = simulerPretAvecPoche(credit, () => 0, palier);
  resultat.credit = credit;
  return resultat;
}

export function moisCourant(etat) { return periodeBudget(aujourdhui(), etat.profil).mois; }
