// epargne.js — poches d'épargne, épargne NETTE (versements − reprises), arrondis de l'app, plan mensuel.

import { arrondiEuroSuperieur, repartir } from './money.js';
import { natureTransaction } from './categories.js';
import { ajouterJours, ajouterMois, ajouterMoisDate, diffJours, jourSemaine, prochainJourSemaine, moisDe, dateDuMois } from './dates.js';

// ---------------------------------------------------------------------------
// Poches
// ---------------------------------------------------------------------------

export function soldePoche(poche, jusquAu = '9999-12-31') {
  let s = poche.soldeInitialCentimes || 0;
  for (const m of poche.mouvements || []) {
    if (m.date > jusquAu) continue;
    s += m.sens === 'versement' ? m.montantCentimes : -m.montantCentimes;
  }
  return s;
}

export function epargneNettePoche(poche, debut = '0000-01-01', fin = '9999-12-31') {
  let v = 0; let r = 0;
  for (const m of poche.mouvements || []) {
    if (m.date < debut || m.date > fin) continue;
    if (m.sens === 'versement') v += m.montantCentimes; else r += m.montantCentimes;
  }
  return { versements: v, reprises: r, nette: v - r };
}

/**
 * Épargne nette d'une période à partir des transactions : versements (débits d'épargne, arrondi banque,
 * arrondis de l'app virés) − reprises (crédits venant de l'épargne). Jamais l'épargne brute.
 */
export function epargneNettePeriode(transactions, debut, fin) {
  const res = { versements: 0, reprises: 0, nette: 0, parType: { arrondiBanque: 0, virementLivret: 0, arrondiApp: 0 }, nbReprises: 0, reprises_: [] };
  for (const t of transactions) {
    if (natureTransaction(t) !== 'epargne') continue;
    if (t.date < debut || t.date > fin) continue;
    if (t.sens === 'debit') {
      res.versements += t.montantCentimes;
      const type = t.epargne?.type || 'virementLivret';
      res.parType[type] = (res.parType[type] || 0) + t.montantCentimes;
    } else {
      res.reprises += t.montantCentimes;
      res.nbReprises += 1;
      res.reprises_.push(t);
    }
  }
  res.nette = res.versements - res.reprises;
  return res;
}

/**
 * Répartit un versement selon l'ordre de remplissage : poches de priorité 1 (coussin) jusqu'à leur cible,
 * puis répartition réglable (parts en %) entre les poches suivantes non pleines.
 * @returns {Array<{ pocheId, montantCentimes }>}
 */
export function repartirVersement(montantCentimes, poches, soldes = {}) {
  const res = new Map();
  let reste = montantCentimes;
  const triees = [...poches].filter((p) => p.actif !== false).sort((a, b) => (a.priorite || 9) - (b.priorite || 9));
  // Coussin sans part chiffrée : il se remplit en premier. Avec une part (ex. 25 %), il partage le versement avec les autres poches.
  const prioritaires = triees.filter((p) => p.type === 'coussin' && (p.partRepartition === null || p.partRepartition === undefined));
  for (const p of prioritaires) {
    const solde = soldes[p.id] ?? soldePoche(p);
    const place = Math.max(0, (p.cibleCentimes || 0) - solde);
    const v = Math.min(place, reste);
    if (v > 0) { res.set(p.id, (res.get(p.id) || 0) + v); reste -= v; }
  }
  // Poches suivantes : répartition par parts, en reversant le surplus d'une poche pleine sur les autres
  let autres = triees.filter((p) => !prioritaires.includes(p));
  let garde = 0;
  while (reste > 0 && autres.length && garde++ < 10) {
    const parts = autres.map((p) => p.partRepartition ?? Math.round(100 / autres.length));
    const montants = repartir(reste, parts);
    let surplus = 0;
    const encore = [];
    autres.forEach((p, i) => {
      const solde = (soldes[p.id] ?? soldePoche(p)) + (res.get(p.id) || 0);
      const place = p.cibleCentimes ? Math.max(0, p.cibleCentimes - solde) : Infinity;
      const v = Math.min(place, montants[i]);
      if (v > 0) res.set(p.id, (res.get(p.id) || 0) + v);
      surplus += montants[i] - v;
      if (place - v > 0) encore.push(p);
    });
    reste = surplus;
    autres = encore;
  }
  const secours = prioritaires[0] || triees.find((p) => p.type === 'coussin') || triees[0];
  if (reste > 0 && secours) res.set(secours.id, (res.get(secours.id) || 0) + reste);
  return [...res.entries()].map(([pocheId, montantCentimes]) => ({ pocheId, montantCentimes }));
}

/** Date d'atteinte projetée d'une poche au rythme mensuel donné. */
export function dateAtteinte(poche, versementMensuelCentimes, depuisMois) {
  const manque = (poche.cibleCentimes || 0) - soldePoche(poche);
  if (manque <= 0) return { atteinte: true, mois: depuisMois };
  if (!versementMensuelCentimes || versementMensuelCentimes <= 0) return { atteinte: false, mois: null };
  const n = Math.ceil(manque / versementMensuelCentimes);
  return { atteinte: false, mois: ajouterMois(depuisMois, n - 1), nbMois: n };
}

// ---------------------------------------------------------------------------
// Arrondis de l'app (cagnotte « Arrondis à virer »)
// ---------------------------------------------------------------------------

/**
 * Une transaction génère-t-elle un arrondi ? Tout ce qui sort du compte : dépenses, charges fixes, abonnements,
 * prélèvements, échéances de crédit, remboursements à des proches. Sauf les virements entre tes comptes et
 * les virements vers l'épargne (l'argent ne sort pas vraiment), et les dépenses où l'arrondi a été désactivé.
 */
export function estEligibleArrondi(tx, reglage = {}) {
  if (tx.sens !== 'debit' || tx.ajustement || tx.arrondiDesactive) return false;
  const n = natureTransaction(tx);
  return n !== 'interne' && n !== 'epargne' && n !== 'ajustement';
}

export function arrondiTransaction(tx, reglage = {}) {
  return estEligibleArrondi(tx, reglage) ? arrondiEuroSuperieur(tx.montantCentimes) : 0;
}

/**
 * Premier jour compté pour les arrondis : jamais sur l'historique importé (début du suivi au plus tôt),
 * mais toujours depuis le début du mois en cours (de salaire à salaire) : tout ce qui est déjà sorti ce mois-ci est arrondi.
 */
export function debutArrondis(reglage, debutSuivi = null, debutPeriode = null) {
  const suivi = [reglage?.depuis, debutSuivi].filter(Boolean).sort().pop() || '0000-01-01';
  return debutPeriode && debutPeriode < suivi ? debutPeriode : suivi;
}

/**
 * Cagnotte en attente : arrondis des dépenses depuis l'activation, non encore virés.
 * Les arrondis System'Épargne de la banque sont un montant DISTINCT (ligne TOTAL OPTION) : aucun double comptage.
 */
export function cagnotteEnAttente(transactions, reglage, cagnotte = [], { debutSuivi = null, debutPeriode = null } = {}) {
  if (!reglage?.actif) return { total: 0, lignes: [] };
  const vires = new Set(cagnotte.filter((c) => c.vireLe).map((c) => c.transactionId));
  const depuis = debutArrondis(reglage, debutSuivi, debutPeriode);
  const lignes = [];
  for (const t of transactions) {
    if (t.date < depuis || vires.has(t.id)) continue;
    const a = arrondiTransaction(t, reglage);
    if (a > 0) lignes.push({ transactionId: t.id, montantCentimes: a, date: t.date });
  }
  return { total: lignes.reduce((s, l) => s + l.montantCentimes, 0), lignes };
}

/** Prochaine date de virement des arrondis selon la fréquence (hebdomadaire par défaut). */
export function prochainVirementArrondis(reglage, aujourdhuiIso, dernierVirementIso = null) {
  const freq = reglage.frequence || 'hebdomadaire';
  const jour = reglage.jourVirement || 4; // jeudi
  if (freq === 'hebdomadaire') {
    if (!dernierVirementIso) return reglage.premierVirement && reglage.premierVirement >= aujourdhuiIso ? reglage.premierVirement : prochainJourSemaine(aujourdhuiIso, jour, true);
    const d = prochainJourSemaine(dernierVirementIso, jour);
    return d < aujourdhuiIso ? aujourdhuiIso : d;
  }
  if (freq === 'quinzaine') {
    const base = dernierVirementIso ? ajouterJours(dernierVirementIso, 14) : (reglage.premierVirement || prochainJourSemaine(aujourdhuiIso, jour, true));
    return base < aujourdhuiIso ? aujourdhuiIso : base;
  }
  // mensuelle : jourVirement = jour du mois
  const jm = reglage.jourDuMois || 6;
  const base = dernierVirementIso ? ajouterMoisDate(dernierVirementIso, 1, jm) : dateDuMois(moisDe(aujourdhuiIso), jm);
  return base < aujourdhuiIso ? (dernierVirementIso ? aujourdhuiIso : dateDuMois(ajouterMois(moisDe(aujourdhuiIso), 1), jm)) : base;
}

/** Période couverte par un virement d'arrondis (pour l'historique). */
export function libellePeriodeArrondis(freq) {
  return { hebdomadaire: 'de la semaine', quinzaine: 'des 15 derniers jours', mensuelle: 'du mois' }[freq] || '';
}

// ---------------------------------------------------------------------------
// Plan mensuel
// ---------------------------------------------------------------------------

export const PARAMETRES_PLAN_DEFAUT = {
  vieMinCentimes: 37500,      // plancher de vie courante (≈ 12,50 €/jour)
  vieCibleCentimes: 45000,    // vie courante confortable
  margeMinCentimes: 1000,     // marge de sécurité visée quand c'est possible
  arrondisEstimesCentimes: 2000,
};

const plancher = (c, pas) => Math.floor(c / pas) * pas;

/**
 * Propose l'allocation d'un mois. L'épargne passe APRÈS les dépenses obligatoires :
 *  - disponible = revenus − charges fixes − dettes du mois (crédits + proches) ;
 *  - vie courante obligatoire = besoins vitaux mesurés (courses, transports, santé…), jamais sous le plancher ;
 *  - épargne = tout ce qui reste au-delà, moins une petite marge, par paliers de 10 € (arrondis inclus) :
 *    pas d'objectif fixe, le maximum possible ; 0 si les obligations prennent tout ;
 *  - jamais de marge négative.
 */
export function proposerAllocation({ revenusCentimes, chargesFixesCentimes, dettesCentimes, besoinsVitauxCentimes = 0 }, parametres = {}) {
  const P = { ...PARAMETRES_PLAN_DEFAUT, ...parametres };
  const dispo = revenusCentimes - chargesFixesCentimes - dettesCentimes;
  const vieObligatoire = Math.max(P.vieMinCentimes, besoinsVitauxCentimes || 0);
  const total = Math.max(0, plancher(dispo - vieObligatoire - P.margeMinCentimes, 1000));
  const arrondis = Math.min(P.arrondisEstimesCentimes, total);
  const vie = total > 0 ? vieObligatoire : Math.max(0, Math.min(dispo, vieObligatoire));
  const mode = dispo <= vieObligatoire ? 'survie' : total > 0 ? 'maximum' : 'minimum';
  return { mode, disponibleCentimes: dispo, epargneCentimes: total - arrondis, arrondisCentimes: arrondis, epargneTotaleCentimes: total, vieCouranteCentimes: vie, vieObligatoireCentimes: vieObligatoire, margeCentimes: dispo - total - vie };
}

/**
 * Recalcule un plan existant après saisie des revenus exacts ou dépassement : garde les allocations si la marge
 * reste ≥ 0, sinon réduit d'abord la vie courante jusqu'au plancher, puis l'épargne (jamais de découvert projeté).
 */
export function recalculerPlan(plan, { revenusCentimes, chargesFixesCentimes, dettesCentimes }, parametres = {}) {
  const P = { ...PARAMETRES_PLAN_DEFAUT, ...parametres };
  const dispo = revenusCentimes - chargesFixesCentimes - dettesCentimes;
  const allocations = plan.allocationsPoches.map((a) => ({ ...a }));
  const totalEpargne = () => allocations.reduce((s, a) => s + a.montantCentimes, 0);
  let vie = plan.vieCouranteCentimes;
  let marge = dispo - totalEpargne() - vie;
  if (marge < 0) {
    const baisseVie = Math.min(-marge, Math.max(0, vie - P.vieMinCentimes));
    vie -= baisseVie; marge += baisseVie;
  }
  // On réduit l'épargne en partant des poches les moins prioritaires (fin de liste)
  for (let i = allocations.length - 1; i >= 0 && marge < 0; i--) {
    const baisse = Math.min(-marge, allocations[i].montantCentimes);
    allocations[i].montantCentimes -= baisse; marge += baisse;
  }
  if (marge < 0) { const b = Math.min(-marge, vie); vie -= b; marge += b; }
  return {
    ...plan,
    revenusCentimes,
    chargesFixesCentimes,
    dettesDuMoisCentimes: dettesCentimes,
    disponibleCentimes: dispo,
    allocationsPoches: allocations,
    vieCouranteCentimes: vie,
    margeCentimes: dispo - totalEpargne() - vie,
  };
}

/**
 * Projection mois par mois des poches et du prêt jusqu'à l'atteinte des cibles.
 * @param {object} p { moisDepart, mois: [{ mois, epargneCentimes }], poches, scenario: 'repartition'|'voiture'|'pret', credit (amortissable) }
 */
export function projeterPoches({ moisDepart, plansConnus = {}, epargneParDefautCentimes, poches, scenario = 'repartition', maxMois = 72 }) {
  const etat = Object.fromEntries(poches.map((p) => [p.id, soldePoche(p)]));
  const lignes = [];
  const atteintes = {};
  for (let k = 0; k < maxMois; k++) {
    const mois = ajouterMois(moisDepart, k);
    const plan = plansConnus[mois];
    let allocations;
    if (plan?.allocationsPoches) allocations = plan.allocationsPoches;
    else {
      const montant = plan?.epargneCentimes ?? epargneParDefautCentimes;
      const pochesScenario = poches.map((p) => {
        if (p.type === 'coussin') return p;
        if (scenario === 'voiture') return { ...p, partRepartition: p.type === 'projet' ? 100 : 0 };
        if (scenario === 'pret') return { ...p, partRepartition: p.type === 'remboursementAnticipe' ? 100 : 0 };
        return p;
      }).filter((p) => p.type === 'coussin' || p.partRepartition !== 0);
      allocations = repartirVersement(montant, pochesScenario, etat);
    }
    for (const a of allocations) etat[a.pocheId] = (etat[a.pocheId] || 0) + a.montantCentimes;
    lignes.push({ mois, allocations, soldes: { ...etat } });
    for (const p of poches) if (!atteintes[p.id] && p.cibleCentimes && etat[p.id] >= p.cibleCentimes) atteintes[p.id] = mois;
    if (poches.every((p) => !p.cibleCentimes || atteintes[p.id])) break;
  }
  return { lignes, atteintes };
}

/** Rappel de virement d'épargne : le lendemain du jour de salaire. */
export function dateVirementEpargne(dateSalaireIso) { return ajouterJours(dateSalaireIso, 1); }

export function joursAvant(aujourdhuiIso, dateIso) { return diffJours(aujourdhuiIso, dateIso); }
export { jourSemaine };

/**
 * Simulateur de livret réglementé (Livret A, LEP) avec la règle des quinzaines :
 * un versement porte intérêt à partir de la quinzaine suivante (1er ou 16), intérêts capitalisés au 31 décembre.
 * @param {{ capitalInitialCentimes, versementMensuelCentimes, jourVersement, tauxPourcent, plafondCentimes?, moisDepart (AAAA-MM), nbMois }} p
 * @returns {{ lignes: Array<{ annee, versesCentimes, interetsCentimes, soldeFinCentimes }>, soldeFinalCentimes, interetsTotalCentimes }}
 */
export function simulerLivret(p) {
  const taux = Math.round(Number(p.tauxPourcent || 0) * 100); // points de base
  const plafond = p.plafondCentimes || Infinity;
  let solde = p.capitalInitialCentimes || 0;
  let interetsAnnee = 0; let numerateur = 0; // intérêts en « centimes × 1/(24 × 10000) » pour éviter les flottants
  let versesAnnee = 0;
  const lignes = [];
  let interetsTotal = 0;
  for (let k = 0; k < p.nbMois; k++) {
    const mois = ajouterMois(p.moisDepart, k);
    const annee = Number(mois.slice(0, 4));
    // 1re quinzaine : le versement du mois (jour ≤ 15 → compte dès la 2e quinzaine ; jour > 15 → mois suivant)
    const avant = solde;
    let verse = 0;
    if (p.versementMensuelCentimes > 0) verse = Math.max(0, Math.min(p.versementMensuelCentimes, plafond - solde));
    const tot = (p.jourVersement || 6) <= 15;
    numerateur += avant * taux; // 1re quinzaine
    solde += verse; versesAnnee += verse;
    numerateur += (tot ? solde : avant) * taux; // 2e quinzaine
    if (mois.slice(5) === '12' || k === p.nbMois - 1) {
      interetsAnnee = divArrondiBancaireLocal(numerateur, 240000);
      if (mois.slice(5) === '12') { solde += interetsAnnee; }
      interetsTotal += interetsAnnee;
      lignes.push({ annee, versesCentimes: versesAnnee, interetsCentimes: interetsAnnee, soldeFinCentimes: solde, capitalise: mois.slice(5) === '12' });
      numerateur = 0; versesAnnee = 0;
    }
  }
  return { lignes, soldeFinalCentimes: solde, interetsTotalCentimes: interetsTotal };
}

function divArrondiBancaireLocal(num, den) {
  const q = Math.floor(num / den); const r = num - q * den;
  return 2 * r > den || (2 * r === den && q % 2 === 1) ? q + 1 : q;
}
