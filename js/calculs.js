// calculs.js — formules de l'Accueil : revenus du mois, reste à dépenser, jauge du jour,
// position globale, projection de découvert. Fonctions pures sur l'état de l'app.

import { natureTransaction, contributionDepense, montantSigne } from './categories.js';
import { ajouterJours, ajouterMois, diffJours, dateDuMois, moisDe, joursDansMois, aujourdhui } from './dates.js';
import { echeancesEntre } from './dettes.js';
import { cagnotteEnAttente, epargneNettePeriode } from './epargne.js';
import { divArrondiBancaire } from './money.js';

export const HEURES_MENSUELLES_DEFAUT = 151.67;
export const COMMISSION_INTERVENTION_CENTIMES = 800; // tarif courant d'une commission d'intervention (paramétrable)

/**
 * Période budgétaire : du jour de salaire au veille du salaire suivant (« novembre » = 05/11 → 04/12).
 * Avec un jour de salaire au 1er, c'est le mois calendaire.
 */
export function periodeBudget(dateIso, profil = {}) {
  const js = Math.min(Math.max(Number(profil.jourSalaireHabituel) || 1, 1), 28);
  let mois = moisDe(dateIso);
  if (Number(dateIso.slice(8, 10)) < js) mois = ajouterMois(mois, -1);
  const debut = dateDuMois(mois, js);
  const fin = ajouterJours(dateDuMois(ajouterMois(mois, 1), js), -1);
  return { mois, debut, fin, nbJours: diffJours(debut, fin) + 1 };
}

/** Revenus réels d'un mois : salaire exact + prime d'activité exacte + autres entrées. Jamais l'aide au logement. */
export function revenusDuMois(etat, mois) {
  const liste = [...(etat.revenusMensuels || [])].sort((a, b) => (a.mois < b.mois ? -1 : 1));
  const entree = liste.find((r) => r.mois === mois);
  const total = (r) => (r.salaireCentimes || 0) + (r.primeActiviteCentimes || 0) + (r.autresEntrees || []).reduce((s, e) => s + (e.montantCentimes || 0), 0);
  if (entree && entree.statut === 'confirme') return { ...entree, totalCentimes: total(entree), statut: 'confirme', source: 'saisie' };
  // Mois non confirmé : montants du dernier mois connu, affichés « attendu »
  const precedent = [...liste].reverse().find((r) => r.mois < mois && (r.salaireCentimes || r.primeActiviteCentimes));
  const base = entree && (entree.salaireCentimes || entree.primeActiviteCentimes) ? entree : precedent;
  if (!base) return { mois, salaireCentimes: 0, primeActiviteCentimes: 0, autresEntrees: [], totalCentimes: 0, statut: 'attendu', source: 'aucune' };
  return { mois, salaireCentimes: base.salaireCentimes || 0, primeActiviteCentimes: base.primeActiviteCentimes || 0, autresEntrees: entree?.autresEntrees || [], totalCentimes: total({ ...base, autresEntrees: entree?.autresEntrees || [] }), statut: 'attendu', source: base === entree ? 'detection' : 'moisPrecedent', moisSource: base.mois };
}

/** Taux horaire net du mois (centimes par heure). */
export function tauxHoraire(etat, mois) {
  const r = revenusDuMois(etat, mois);
  const heures = Number(etat.profil?.heuresMensuelles) || HEURES_MENSUELLES_DEFAUT;
  return r.salaireCentimes ? Math.round(r.salaireCentimes / heures) : 0;
}

/** « 1 h 20 » de travail pour un montant. */
export function equivalentTravail(centimes, tauxHoraireCentimes) {
  if (!tauxHoraireCentimes || centimes <= 0) return null;
  const minutes = Math.round((centimes * 60) / tauxHoraireCentimes);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Charges fixes de la période, avec date d'échéance et statut payé (montant réel si payé). */
export function chargesFixesPeriode(etat, periode) {
  const res = [];
  const loyer = etat.profil?.loyerAPayerCentimes;
  for (const c of etat.chargesFixes || []) {
    if (!c.actif) continue;
    if (c.finLe && c.finLe < periode.debut) continue;   // ex. différé de prêt remplacé par la vraie mensualité
    if (c.debutLe && c.debutLe > periode.fin) continue;
    const date = c.periodiciteJours && c.derniereDate ? dateCyclique(periode, c.derniereDate, c.periodiciteJours) : dateDansPeriode(periode, c.jourPrelevement);
    if (!date) continue;
    const paiements = (etat.transactions || []).filter((t) => t.chargeFixeId === c.id && t.date >= periode.debut && t.date <= periode.fin);
    let montant = c.estLoyer && loyer ? loyer : c.montantCentimes;
    if (paiements.length) montant = paiements.reduce((s, t) => s + t.montantCentimes, 0);
    res.push({ ...c, date, montantPrevuCentimes: montant, payee: paiements.length > 0 });
  }
  return res.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Charge à périodicité fixe (ex. tous les 28 jours) : première occurrence dans la période, ou null. */
function dateCyclique(periode, derniere, pas) {
  let d = derniere;
  while (d < periode.debut) d = ajouterJours(d, pas);
  return d <= periode.fin ? d : null;
}

function dateDansPeriode(periode, jour) {
  const j = Number(jour) || 1;
  const d1 = dateDuMois(moisDe(periode.debut), j);
  if (d1 >= periode.debut && d1 <= periode.fin) return d1;
  return dateDuMois(moisDe(periode.fin), j);
}

/** Dettes datées de la période (échéances de crédits bancaires + remboursements à des proches). */
export function dettesPeriode(etat, periode) {
  return echeancesEntre(etat, periode.debut, periode.fin).filter((e) => e.type === 'credit' || e.sens === 'empruntéParMoi');
}

/** Dépenses variables de la période : hors internes, épargne, prêts, dettes, charges fixes ; remboursements nettés. */
export function depensesVariables(etat, debut, fin, filtre = () => true) {
  let total = 0;
  for (const t of etat.transactions || []) {
    if (t.date < debut || t.date > fin) continue;
    if (t.chargeFixeId) continue;
    if (!filtre(t)) continue;
    total += contributionDepense(t);
  }
  return total;
}

/** Épargne cible du mois : allocations du plan (arrondis estimés inclus) ou objectif du profil. */
export function epargneCible(etat, mois) {
  const plan = (etat.planMensuel || []).find((p) => p.mois === mois);
  if (plan) return (plan.allocationsPoches || []).reduce((s, a) => s + a.montantCentimes, 0) + (plan.arrondisEstimesCentimes || 0);
  return etat.profil?.objectifEpargneCentimes || 0;
}

/**
 * Reste à dépenser de la période budgétaire :
 * revenus réels − épargne cible − charges fixes − dettes du mois − dépenses variables.
 * Les arrondis sont inclus dans l'épargne cible : ils ne sont pas retirés une deuxième fois.
 */
export function resteADepenser(etat, dateIso = aujourdhui()) {
  const periode = periodeBudget(dateIso, etat.profil);
  const revenus = revenusDuMois(etat, periode.mois);
  const charges = chargesFixesPeriode(etat, periode);
  const dettes = dettesPeriode(etat, periode);
  const cible = epargneCible(etat, periode.mois);
  const variables = depensesVariables(etat, periode.debut, periode.fin);
  const totalCharges = charges.reduce((s, c) => s + c.montantPrevuCentimes, 0);
  const totalDettes = dettes.reduce((s, d) => s + d.montantCentimes, 0);
  const reste = revenus.totalCentimes - cible - totalCharges - totalDettes - variables;
  return { periode, revenus, charges, dettes, epargneCibleCentimes: cible, chargesCentimes: totalCharges, dettesCentimes: totalDettes, depensesVariablesCentimes: variables, resteCentimes: reste };
}

/**
 * Jauge « Aujourd'hui » : reste à dépenser (hors dépenses du jour) ÷ jours restants (jour courant inclus),
 * figée à la première ouverture de la journée, puis diminuée des dépenses du jour.
 * @param instantane { date, parJourCentimes } stocké, ou null
 * @returns { parJourCentimes, restantAujourdhuiCentimes, depensesDuJourCentimes, joursRestants, instantane }
 */
export function jaugeDuJour(etat, dateIso = aujourdhui(), instantane = null) {
  const r = resteADepenser(etat, dateIso);
  const depJour = depensesVariables(etat, dateIso, dateIso);
  const joursRestants = diffJours(dateIso, r.periode.fin) + 1;
  let snap = instantane && instantane.date === dateIso && instantane.mois === r.periode.mois ? instantane : null;
  if (!snap) {
    const resteAvantJour = r.resteCentimes + depJour;
    snap = { date: dateIso, mois: r.periode.mois, parJourCentimes: joursRestants > 0 ? divArrondiBancaire(resteAvantJour, joursRestants) : resteAvantJour };
  }
  return {
    parJourCentimes: snap.parJourCentimes,
    restantAujourdhuiCentimes: snap.parJourCentimes - depJour,
    depensesDuJourCentimes: depJour,
    joursRestants,
    critique: snap.parJourCentimes - depJour < 500,
    instantane: snap,
    reste: r,
  };
}

/** Soldes de chaque compte à une date et position globale (courant + néobanque + espèces). */
export function soldes(etat, dateIso = '9999-12-31') {
  const res = [];
  for (const c of etat.comptes || []) {
    let s = c.soldeInitialCentimes || 0;
    for (const t of etat.transactions || []) {
      if (t.compteId !== c.id) continue;
      const d = t.dateComptable || t.date;
      if (d > dateIso) continue;
      if (c.dateSoldeInitial && d <= c.dateSoldeInitial && !t.ajustement) continue;
      s += montantSigne(t);
    }
    res.push({ compte: c, soldeCentimes: s });
  }
  const global = res.filter((r) => r.compte.type !== 'epargne').reduce((s, r) => s + r.soldeCentimes, 0);
  const courant = res.find((r) => r.compte.type === 'courant');
  const neo = res.filter((r) => r.compte.type === 'neobanque');
  const abri = neo.reduce((s, r) => s + Math.max(0, r.soldeCentimes), 0);
  return {
    comptes: res,
    globalCentimes: global,
    alerteAbri: courant && courant.soldeCentimes < 0 && abri > 0 ? { courantCentimes: courant.soldeCentimes, abriCentimes: abri, rapatriableCentimes: Math.min(abri, -courant.soldeCentimes) } : null,
  };
}

/** Coût du découvert sur une période : frais d'incident, commissions, frais de crédit instantané. */
export function coutDecouvert(etat, debut, fin) {
  let frais = 0; let nb = 0;
  for (const t of etat.transactions || []) {
    if (t.date < debut || t.date > fin || t.categorie !== 'frais-bancaires') continue;
    if (/incident|commission|credit instant|crédit instant|agios|interets debiteurs/i.test(`${t.marchand} ${t.libelleBrut}`)) {
      frais += t.sens === 'debit' ? t.montantCentimes : -t.montantCentimes; nb += 1;
    }
  }
  return { fraisCentimes: frais, nbLignes: nb };
}

/** Rythme moyen de dépenses variables par jour sur les n derniers jours (centimes). */
export function rythmeQuotidien(etat, dateIso, n = 28) {
  const debut = ajouterJours(dateIso, -n);
  const fin = ajouterJours(dateIso, -1);
  return Math.max(0, Math.round(depensesVariables(etat, debut, fin) / n));
}

/**
 * Projection du solde du compte courant sur `jours` jours :
 * solde actuel − charges fixes et dettes à venir (dates connues) − virements d'épargne prévus − rythme de dépense.
 * Les revenus NON confirmés ne sont pas comptés (un salaire attendu n'est pas encore là).
 */
export function projectionDecouvert(etat, dateIso = aujourdhui(), { jours = 7, rythmeCentimes = null, inclureRythme = true } = {}) {
  const courant = (etat.comptes || []).find((c) => c.type === 'courant');
  if (!courant) return null;
  const solde0 = soldes(etat, dateIso).comptes.find((r) => r.compte.id === courant.id).soldeCentimes;
  const fin = ajouterJours(dateIso, jours);
  const evenements = [];
  // Charges fixes et dettes (sur la période courante et la suivante pour couvrir la fenêtre)
  const p1 = periodeBudget(dateIso, etat.profil);
  const p2 = periodeBudget(ajouterJours(p1.fin, 1), etat.profil);
  for (const p of [p1, p2]) {
    for (const c of chargesFixesPeriode(etat, p)) {
      if (c.payee || c.compteId !== courant.id) continue;
      if (c.date >= dateIso && c.date <= fin) evenements.push({ date: c.date, libelle: c.libelle, montantCentimes: -c.montantPrevuCentimes, type: 'charge', estLoyer: !!c.estLoyer });
    }
    for (const d of dettesPeriode(etat, p)) {
      if (d.payee) continue;
      if (d.date >= dateIso && d.date <= fin) evenements.push({ date: d.date, libelle: d.libelle, montantCentimes: -d.montantCentimes, type: d.type === 'credit' ? 'credit' : 'proche' });
    }
  }
  for (const v of etat.virementsPrevus || []) {
    if (v.fait || v.date < dateIso || v.date > fin) continue;
    evenements.push({ date: v.date, libelle: v.libelle, montantCentimes: -v.montantCentimes, type: 'epargne' });
  }
  const rythme = inclureRythme ? (rythmeCentimes ?? rythmeQuotidien(etat, dateIso)) : 0;
  const jourParJour = [];
  let solde = solde0;
  let premierNegatif = null;
  let premierChargeNonCouverte = null;
  const nonCouverts = [];
  let soldeSansRythme = solde0;
  for (let k = 0; k <= jours; k++) {
    const d = ajouterJours(dateIso, k);
    const evs = evenements.filter((e) => e.date === d);
    for (const e of evs) {
      solde += e.montantCentimes; soldeSansRythme += e.montantCentimes;
      if (soldeSansRythme < 0) {
        nonCouverts.push({ ...e, soldeApresCentimes: soldeSansRythme });
        if (!premierChargeNonCouverte) premierChargeNonCouverte = { ...e, soldeApresCentimes: soldeSansRythme };
      }
    }
    if (k > 0) solde -= rythme;
    jourParJour.push({ date: d, soldeCentimes: solde, evenements: evs });
    if (!premierNegatif && solde < 0) premierNegatif = { date: d, soldeCentimes: solde, evenements: evs };
  }
  // Solde après la plus grosse échéance de la fenêtre (affiché quand tout est couvert)
  const apresCharges = solde0 + evenements.reduce((s, e) => s + e.montantCentimes, 0);
  return {
    compte: courant,
    soldeActuelCentimes: solde0,
    rythmeCentimes: rythme,
    evenements: evenements.sort((a, b) => (a.date < b.date ? -1 : 1)),
    jourParJour,
    premierNegatif,
    chargeNonCouverte: premierChargeNonCouverte,
    nonCouverts,
    loyerNonCouvert: nonCouverts.find((e) => e.estLoyer) || null,
    loyer: evenements.find((e) => e.estLoyer) || null,
    soldeApresChargesCentimes: apresCharges,
    risque: !!(premierNegatif || premierChargeNonCouverte),
    commissionCentimes: etat.parametres?.commissionInterventionCentimes || COMMISSION_INTERVENTION_CENTIMES,
  };
}

/** Épargne du mois affichée sur l'Accueil : réelle (nette) + cagnotte d'arrondis en attente + objectif. */
export function epargneDuMois(etat, dateIso = aujourdhui()) {
  const periode = periodeBudget(dateIso, etat.profil);
  const nette = epargneNettePeriode(etat.transactions || [], periode.debut, periode.fin);
  const cagnotte = cagnotteEnAttente(etat.transactions || [], etat.profil?.arrondi, etat.cagnotteArrondis || []);
  const cible = epargneCible(etat, periode.mois);
  return { periode, nette, cagnotteCentimes: cagnotte.total, cagnotteLignes: cagnotte.lignes, cibleCentimes: cible, projectionCentimes: nette.nette + cagnotte.total };
}

/** Dépenses par catégorie sur une période (remboursements nettés), triées décroissant. */
export function depensesParCategorie(etat, debut, fin, { inclureEtalees = true } = {}) {
  const m = new Map();
  for (const t of etat.transactions || []) {
    if (t.date < debut || t.date > fin) continue;
    let c = contributionDepense(t);
    // Dépense étalée (ex. console payée à un proche en plusieurs fois) : comptée dans sa catégorie au fil des remboursements
    if (!c && inclureEtalees && t.pretId && t.sens === 'debit' && t.depenseEtalee) c = t.montantCentimes;
    if (!c) continue;
    m.set(t.categorie, (m.get(t.categorie) || 0) + c);
  }
  return [...m.entries()].map(([categorie, montantCentimes]) => ({ categorie, montantCentimes })).sort((a, b) => b.montantCentimes - a.montantCentimes);
}

export function nbJoursMois(mois) { return joursDansMois(mois); }
export { natureTransaction };
