// calculs.js — formules de l'Accueil : revenus du mois, reste à dépenser, jauge du jour,
// position globale, projection de découvert. Fonctions pures sur l'état de l'app.

import { natureTransaction, contributionDepense, montantSigne, categorie } from './categories.js';
import { ajouterJours, ajouterMois, diffJours, dateDuMois, moisDe, joursDansMois, aujourdhui } from './dates.js';
import { echeancesEntre } from './dettes.js';
import { cagnotteEnAttente, epargneNettePeriode, PARAMETRES_PLAN_DEFAUT } from './epargne.js';
import { divArrondiBancaire } from './money.js';
import { listerAbonnements } from './abonnements.js';
import { normaliserTexte } from './rules.js';

export const HEURES_MENSUELLES_DEFAUT = 151.67;
export const COMMISSION_INTERVENTION_CENTIMES = 800; // tarif courant d'une commission d'intervention (paramétrable)

/**
 * Période budgétaire : d'un salaire au suivant (« novembre » = du salaire de novembre à la veille du salaire de décembre).
 * Dates réelles de salaire (profil.datesSalaire) quand elles sont connues, sinon le jour habituel.
 * Un salaire attendu mais pas encore arrivé prolonge la période en cours (7 jours au plus) : le mois change
 * au moment où le salaire arrive. Avec un jour de salaire au 1er et sans dates réelles, c'est le mois calendaire.
 */
export function periodeBudget(dateIso, profil = {}, { reference = aujourdhui() } = {}) {
  const js = Math.min(Math.max(Number(profil.jourSalaireHabituel) || 1, 1), 28);
  const reelles = [...new Set((profil.datesSalaire || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  if (!reelles.length) {
    let mois = moisDe(dateIso);
    if (Number(dateIso.slice(8, 10)) < js) mois = ajouterMois(mois, -1);
    const debut = dateDuMois(mois, js);
    const fin = ajouterJours(dateDuMois(ajouterMois(mois, 1), js), -1);
    return { mois, debut, fin, nbJours: diffJours(debut, fin) + 1, theorique: true };
  }
  // Débuts de période autour de la date : salaire réel s'il est arrivé à ± 10 jours du jour habituel, sinon jour habituel
  const centre = moisDe(dateIso);
  const debuts = [];
  let attendu = null; // salaire du mois en cours pas encore arrivé
  for (let k = -3; k <= 2; k++) {
    const m = ajouterMois(centre, k);
    const t = dateDuMois(m, js);
    const reel = reelles.filter((d) => Math.abs(diffJours(t, d)) <= 10).pop();
    if (reel) debuts.push({ date: reel, reel: true });
    else {
      // Salaire pas encore arrivé : la période précédente continue tant qu'on est à moins de 7 jours du jour habituel
      const apresDernier = t > reelles[reelles.length - 1];
      // Attente seulement pour aujourd'hui (ou une date passée) : pour une date future on ne peut pas savoir, on prend le jour habituel
      if (apresDernier && t <= dateIso && diffJours(t, dateIso) <= 7 && dateIso <= reference) attendu = t;
      // Toujours pas de salaire au bout de 7 jours : le nouveau mois commence le lendemain de l'attente (pas de retour en arrière)
      else debuts.push({ date: apresDernier && t <= dateIso && dateIso <= reference && diffJours(t, reference) > 7 ? ajouterJours(t, 8) : t, reel: false });
    }
  }
  debuts.sort((a, b) => (a.date < b.date ? -1 : 1));
  const courant = debuts.filter((d) => d.date <= dateIso).pop() || debuts[0];
  const debut = courant.date;
  const suivant = attendu && attendu > debut ? { date: attendu } : debuts.find((d) => d.date > courant.date);
  let fin = suivant ? ajouterJours(suivant.date, -1) : ajouterJours(dateDuMois(ajouterMois(moisDe(debut), 1), js), -1);
  if (fin < dateIso) fin = dateIso; // salaire en retard : la période va jusqu'à son arrivée
  const mois = moisDe(ajouterJours(debut, 10)); // un salaire versé fin octobre compte pour novembre
  return { mois, debut, fin, nbJours: diffJours(debut, fin) + 1, theorique: !courant.reel, salaireAttenduLe: suivant?.date || null };
}

/** Dates réelles de salaire : opérations « salaire » reçues et revenus confirmés avec leur date de réception. */
export function datesDeSalaire(etat) {
  const d = new Set();
  for (const t of etat.transactions || []) if (t.categorie === 'salaire' && t.sens === 'credit' && t.montantCentimes >= 30000) d.add(t.date);
  for (const r of etat.revenusMensuels || []) if (r.recuLe) d.add(r.recuLe);
  return [...d].sort();
}

/**
 * Ce qui reste du mois : avant le salaire (aperçu) et après (reste du mois précédent à verser sur l'épargne).
 * Le montant ne dépasse jamais l'argent réellement présent sur les comptes courants à la fin de la période.
 */
export function reliquat(etat, dateIso = aujourdhui()) {
  const p = periodeBudget(dateIso, etat.profil);
  const debutSuivi = etat.profil?.debutSuivi || etat.profil?.premierImportLe || null;
  const disponible = (date) => soldes(etat, date).comptes.filter((c) => c.compte.type === 'courant' || c.compte.type === 'neobanque').reduce((s, c) => s + c.soldeCentimes, 0);
  const plafond = (reste, date) => Math.max(0, Math.min(reste, disponible(date)));
  const prec = periodeBudget(ajouterJours(p.debut, -1), etat.profil);
  const suiviPrec = !debutSuivi || prec.debut >= debutSuivi;
  const restePrec = suiviPrec ? resteADepenser(etat, prec.fin).resteCentimes : 0;
  const joursRestants = diffJours(dateIso, p.fin) + 1;
  const resteCourant = resteADepenser(etat, dateIso).resteCentimes;
  return {
    periode: p,
    precedent: { mois: prec.mois, debut: prec.debut, fin: prec.fin, montantCentimes: suiviPrec ? plafond(restePrec, prec.fin) : 0 },
    courant: { montantCentimes: plafond(resteCourant, dateIso), joursRestants, prochainSalaire: p.salaireAttenduLe || ajouterJours(p.fin, 1), avantSalaire: joursRestants <= 3 },
  };
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
/**
 * Dépense « du quotidien » (celle qui entame le budget du jour) : pas une charge fixe rattachée,
 * pas un abonnement, pas un prélèvement automatique (PRLV). Ces derniers comptent dans les charges du mois.
 */
export function estDepenseQuotidienne(t) {
  if (t.chargeFixeId) return false;
  if (t.categorie === 'abonnements') return false;
  if (t.sens === 'debit' && /^PRLV\b/i.test(t.libellePrincipal || t.libelleBrut || '')) return false;
  return true;
}

/** Abonnements et prélèvements payés dans la période sans charge fixe correspondante : comptés avec les charges. */
export function prelevementsHorsCharges(etat, debut, fin) {
  const res = [];
  for (const t of etat.transactions || []) {
    if (t.date < debut || t.date > fin || t.ajustement || estDepenseQuotidienne(t) || t.chargeFixeId) continue;
    const v = contributionDepense(t);
    if (v) res.push({ id: `tx-${t.id}`, libelle: t.libelle || t.marchand, categorie: t.categorie, date: t.date, montantPrevuCentimes: v, paye: true, transactionId: t.id, horsCharges: true });
  }
  return res;
}

export function depensesVariables(etat, debut, fin, filtre = () => true) {
  let total = 0;
  for (const t of etat.transactions || []) {
    if (t.date < debut || t.date > fin) continue;
    if (!estDepenseQuotidienne(t)) continue;
    if (!filtre(t)) continue;
    total += contributionDepense(t);
  }
  return total;
}

const parametresPlan = (etat) => ({ ...PARAMETRES_PLAN_DEFAUT, ...(etat.profil?.parametresPlan || {}) });

/**
 * Dépenses OBLIGATOIRES du quotidien réservées pour le mois (courses, transports, santé) : un montant fixe,
 * réglable (375 € par défaut). Les mois passés ne servent qu'aux statistiques : le budget du mois en cours
 * se calcule avec ce mois-ci seulement (revenus, prélèvements, dettes, et ce que tu dépenses au fur et à mesure).
 */
export function besoinsVitaux(etat) {
  return { centimes: parametresPlan(etat).vieMinCentimes };
}

/**
 * Abonnements repérés dans tes opérations sans charge fixe (ex. paiement « abonnement » chaque mois) :
 * réservés pour la période s'ils doivent revenir avant la fin et n'ont pas encore été payés.
 */
export function abonnementsAVenir(etat, periode, dateIso = aujourdhui()) {
  const futur = periode.debut > dateIso; // mois à venir (plan) : chaque abonnement mensuel revient
  const ref = futur ? dateIso : dateIso > periode.fin ? periode.fin : dateIso;
  return listerAbonnements(etat, ref).liste
    .filter((a) => !a.chargeFixeId && a.frequence === 'chaque mois' && a.derniereLe && a.derniereLe < periode.debut && a.prochain && (futur || a.prochain <= periode.fin))
    .map((a) => ({ id: `abo-${a.cle}`, libelle: a.nom, categorie: 'abonnements', date: futur ? periode.debut : a.prochain < ref ? ref : a.prochain, montantPrevuCentimes: a.montantCentimes, payee: false, abonnementDetecte: true }));
}

const motsLibelle = (s) => new Set(normaliserTexte(s || '').split(/\s+/).filter((m) => m.length >= 3));

/**
 * Dépenses prévues (« Dépenses à venir », ajoutées à la main) d'une période. Chacune est réservée dans le budget
 * de son mois jusqu'à ce qu'elle soit faite : marquée « payée », ou retrouvée dans les opérations (débit au même
 * montant à 10 % près, à 7 jours près, de la même catégorie ou au libellé proche). Jamais comptée deux fois.
 * @returns [{ ...prevue, realisee, transactionId? }]
 */
export function depensesPrevuesPeriode(etat, periode) {
  const prises = new Set();
  const res = [];
  const liste = [...(etat.depensesPrevues || [])].filter((d) => d.date >= periode.debut && d.date <= periode.fin).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const d of liste) {
    if (d.faite) { res.push({ ...d, realisee: true }); continue; }
    const tol = Math.max(100, Math.round(d.montantCentimes * 0.1));
    const mots = motsLibelle(d.libelle);
    const t = (etat.transactions || []).find((x) => !prises.has(x.id) && x.sens === 'debit' && !x.ajustement && !x.chargeFixeId
      && Math.abs(diffJours(d.date, x.date)) <= 7 && Math.abs(x.montantCentimes - d.montantCentimes) <= tol
      && ((d.categorie && d.categorie !== 'autres' && x.categorie === d.categorie) || [...motsLibelle(`${x.marchand || ''} ${x.libelle || ''}`)].some((m) => mots.has(m))));
    if (t) { prises.add(t.id); res.push({ ...d, realisee: true, transactionId: t.id }); } else res.push({ ...d, realisee: false });
  }
  return res;
}

/**
 * L'épargne passe APRÈS les dépenses obligatoires : charges fixes, dettes du mois et besoins vitaux.
 * Pas de montant fixe : on met le maximum de ce qui reste (par paliers de 10 €, une petite marge gardée),
 * et rien du tout si les obligations prennent tout.
 */
export function epargnePossible(etat, periode, { revenusCentimes, chargesCentimes, dettesCentimes, prevuesCentimes = 0 }) {
  const P = parametresPlan(etat);
  const besoins = besoinsVitaux(etat);
  const libre = revenusCentimes - chargesCentimes - dettesCentimes - prevuesCentimes - besoins.centimes - P.margeMinCentimes;
  return { centimes: Math.max(0, Math.floor(libre / 1000) * 1000), besoins, libreCentimes: libre };
}

/** Période budgétaire d'un mois (« 2026-12 »), d'après le jour de salaire. */
export function periodeDuMois(etat, mois) {
  const actuelle = periodeBudget(aujourdhui(), etat.profil || {});
  if (actuelle.mois === mois) return actuelle;
  return periodeBudget(dateDuMois(mois, etat.profil?.jourSalaireHabituel || 1), etat.profil || {});
}

/** Épargne visée d'un mois : le maximum possible après les dépenses obligatoires (voir epargnePossible). */
export function epargneCible(etat, mois, periode = periodeDuMois(etat, mois)) {
  const revenus = revenusDuMois(etat, periode.mois).totalCentimes;
  const charges = [...chargesFixesPeriode(etat, periode), ...prelevementsHorsCharges(etat, periode.debut, periode.fin), ...abonnementsAVenir(etat, periode)].reduce((s, c) => s + c.montantPrevuCentimes, 0);
  const dettes = dettesPeriode(etat, periode).reduce((s, d) => s + d.montantCentimes, 0);
  const prevues = depensesPrevuesPeriode(etat, periode).filter((d) => !d.realisee).reduce((s, d) => s + d.montantCentimes, 0);
  return epargnePossible(etat, periode, { revenusCentimes: revenus, chargesCentimes: charges, dettesCentimes: dettes, prevuesCentimes: prevues }).centimes;
}

/**
 * Reste à dépenser de la période budgétaire :
 * revenus réels − charges fixes − dettes du mois − dépenses variables − épargne.
 * L'épargne visée est le maximum possible après les dépenses obligatoires (arrondis inclus) ; elle passe
 * après les dépenses : en cas de dépassement elle baisse jusqu'à 0 avant que le budget soit « dépassé ».
 */
export function resteADepenser(etat, dateIso = aujourdhui()) {
  const periode = periodeBudget(dateIso, etat.profil);
  const revenus = revenusDuMois(etat, periode.mois);
  const charges = [...chargesFixesPeriode(etat, periode), ...prelevementsHorsCharges(etat, periode.debut, periode.fin), ...abonnementsAVenir(etat, periode, dateIso)];
  const dettes = dettesPeriode(etat, periode);
  const variables = depensesVariables(etat, periode.debut, periode.fin);
  const totalCharges = charges.reduce((s, c) => s + c.montantPrevuCentimes, 0);
  const totalDettes = dettes.reduce((s, d) => s + d.montantCentimes, 0);
  const prevues = depensesPrevuesPeriode(etat, periode);
  const totalPrevues = prevues.filter((d) => !d.realisee).reduce((s, d) => s + d.montantCentimes, 0);
  const possible = epargnePossible(etat, periode, { revenusCentimes: revenus.totalCentimes, chargesCentimes: totalCharges, dettesCentimes: totalDettes, prevuesCentimes: totalPrevues });
  // L'épargne passe après les dépenses : si elles dépassent, c'est l'épargne qui baisse d'abord
  const avantEpargne = revenus.totalCentimes - totalCharges - totalDettes - totalPrevues - variables;
  const cible = Math.max(0, Math.min(possible.centimes, avantEpargne));
  const reste = avantEpargne - cible;
  return {
    periode, revenus, charges, dettes, epargneCibleCentimes: cible, epargneViseeCentimes: possible.centimes, besoinsVitauxCentimes: possible.besoins.centimes,
    chargesCentimes: totalCharges, dettesCentimes: totalDettes, prevues, prevuesCentimes: totalPrevues, depensesVariablesCentimes: variables, resteCentimes: reste,
  };
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
  // Mois en cours seulement : moyenne des jours déjà passés depuis le salaire (0 le jour du salaire)
  const per = periodeBudget(dateIso, etat.profil || {});
  const debut = [ajouterJours(dateIso, -n), per.debut].sort().pop();
  const fin = ajouterJours(dateIso, -1);
  const nb = diffJours(debut, fin) + 1;
  if (nb <= 0) return 0;
  return Math.max(0, Math.round(depensesVariables(etat, debut, fin) / nb));
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
  for (const p of p2.debut === p1.debut ? [p1] : [p1, p2]) {
    for (const c of chargesFixesPeriode(etat, p)) {
      if (c.payee || c.compteId !== courant.id) continue;
      if (c.date >= dateIso && c.date <= fin) evenements.push({ date: c.date, libelle: c.libelle, montantCentimes: -c.montantPrevuCentimes, type: 'charge', estLoyer: !!c.estLoyer });
    }
    for (const d of dettesPeriode(etat, p)) {
      if (d.payee) continue;
      if (d.date >= dateIso && d.date <= fin) evenements.push({ date: d.date, libelle: d.libelle, montantCentimes: -d.montantCentimes, type: d.type === 'credit' ? 'credit' : 'proche' });
    }
    for (const d of depensesPrevuesPeriode(etat, p)) {
      if (d.realisee || (d.compteId && d.compteId !== courant.id)) continue;
      if (d.date >= dateIso && d.date <= fin) evenements.push({ date: d.date, libelle: d.libelle, montantCentimes: -d.montantCentimes, type: 'prevue' });
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
  const cagnotte = cagnotteEnAttente(etat.transactions || [], etat.profil?.arrondi, etat.cagnotteArrondis || [], { debutSuivi: etat.profil?.debutSuivi || etat.profil?.premierImportLe });
  const cible = epargneCible(etat, periode.mois, periode);
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
