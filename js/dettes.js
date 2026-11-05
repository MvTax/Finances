// dettes.js — crédits bancaires (amortissables, crédits instantanés) et dettes envers des proches.
// Calculs en centimes entiers, intérêts mensuels arrondis au centime (arrondi bancaire).
// Taux exprimés en pourcentage annuel (ex. 7 pour 7 %), convertis en points de base entiers.

import { divArrondiBancaire } from './money.js';
import { ajouterMoisDate, diffJours } from './dates.js';

const pb = (tauxPourcent) => Math.round(Number(tauxPourcent || 0) * 100); // 7,25 % → 725 points de base

/** Intérêts d'un mois sur un capital : capital × taux / 12 (arrondi bancaire). */
export function interetsMensuels(capitalCentimes, tauxPourcent) {
  return divArrondiBancaire(capitalCentimes * pb(tauxPourcent), 120000);
}

/** Mensualité constante d'un prêt amortissable (formule actuarielle, arrondie au centime supérieur). */
export function mensualiteConstante(capitalCentimes, tauxPourcent, dureeMois) {
  if (dureeMois <= 0) throw new Error('Durée invalide');
  const r = pb(tauxPourcent) / 120000;
  if (r === 0) return Math.ceil(capitalCentimes / dureeMois);
  const m = (capitalCentimes * r) / (1 - Math.pow(1 + r, -dureeMois));
  return Math.ceil(m - 1e-9);
}

/** Durée (en mois) nécessaire pour rembourser un capital avec une mensualité donnée ; Infinity si impossible. */
export function dureePourMensualite(capitalCentimes, tauxPourcent, mensualiteCentimes) {
  let capital = capitalCentimes;
  for (let n = 1; n <= 1200; n++) {
    const i = interetsMensuels(capital, tauxPourcent);
    if (mensualiteCentimes <= i) return Infinity;
    capital -= mensualiteCentimes - i;
    if (capital <= 0) return n;
  }
  return Infinity;
}

/**
 * Tableau d'amortissement à mensualité constante.
 * @param {{ capitalCentimes, tauxPourcent, dureeMois?, mensualiteCentimes?, dateDebut, assuranceMensuelleCentimes? }} p
 * @returns {Array<{ numero, date, mensualiteCentimes, capitalCentimes, interetsCentimes, assuranceCentimes, capitalRestantCentimes }>}
 */
export function tableauAmortissement(p) {
  const mensualite = p.mensualiteCentimes || mensualiteConstante(p.capitalCentimes, p.tauxPourcent, p.dureeMois);
  const assurance = p.assuranceMensuelleCentimes || 0;
  const jour = Number(p.dateDebut.slice(8, 10));
  const lignes = [];
  let restant = p.capitalCentimes;
  let n = 0;
  while (restant > 0 && n < 1200) {
    const interets = interetsMensuels(restant, p.tauxPourcent);
    let capital = mensualite - interets;
    if (capital <= 0) throw new Error('Mensualité insuffisante pour couvrir les intérêts');
    let paiement = mensualite;
    if (capital >= restant || (p.dureeMois && n === p.dureeMois - 1)) { capital = restant; paiement = capital + interets; }
    restant -= capital;
    lignes.push({
      numero: n + 1,
      date: ajouterMoisDate(p.dateDebut, n, jour),
      mensualiteCentimes: paiement,
      capitalCentimes: capital,
      interetsCentimes: interets,
      assuranceCentimes: assurance,
      capitalRestantCentimes: restant,
    });
    n++;
  }
  return lignes;
}

export function totalInterets(tableau) { return tableau.reduce((s, l) => s + l.interetsCentimes, 0); }

/** Capital restant dû à une date (après les échéances dont la date est ≤ date). */
export function capitalRestantDu(tableau, date, capitalInitial) {
  let restant = capitalInitial ?? (tableau[0] ? tableau[0].capitalRestantCentimes + tableau[0].capitalCentimes : 0);
  for (const l of tableau) if (l.date <= date) restant = l.capitalRestantCentimes;
  return restant;
}

/**
 * Remboursement anticipé partiel à mensualité constante (réduction de durée).
 * Indemnité : aucune si le total remboursé par anticipation sur 12 mois ≤ 10 000 € (crédit à la consommation).
 * @returns {{ nouveauTableau, interetsEconomises, ancienneFin, nouvelleFin, moisGagnes, sansIndemnite, capitalApres }}
 */
export function simulerRemboursementAnticipe(p, versement) {
  const ancien = tableauAmortissement(p);
  const apres = ancien.filter((l) => l.date <= versement.date);
  const restantAvant = apres.length ? apres[apres.length - 1].capitalRestantCentimes : p.capitalCentimes;
  const montant = Math.min(versement.montantCentimes, restantAvant);
  const capitalApres = restantAvant - montant;
  const mensualite = p.mensualiteCentimes || ancien[0]?.mensualiteCentimes;
  const prochaine = ancien.find((l) => l.date > versement.date);
  let suite = [];
  if (capitalApres > 0 && prochaine) {
    suite = tableauAmortissement({ capitalCentimes: capitalApres, tauxPourcent: p.tauxPourcent, mensualiteCentimes: mensualite, dateDebut: prochaine.date, assuranceMensuelleCentimes: p.assuranceMensuelleCentimes })
      .map((l, i) => ({ ...l, numero: apres.length + i + 1 }));
  }
  const nouveau = apres.concat(suite);
  const deja12Mois = (versement.dejaRembourse12MoisCentimes || 0) + montant;
  return {
    nouveauTableau: nouveau,
    interetsEconomises: totalInterets(ancien) - totalInterets(nouveau),
    ancienneFin: ancien[ancien.length - 1]?.date,
    nouvelleFin: nouveau[nouveau.length - 1]?.date || versement.date,
    moisGagnes: ancien.length - nouveau.length,
    sansIndemnite: deja12Mois <= 1000000,
    capitalApres,
    montantCentimes: montant,
  };
}

/**
 * Vérifie la cohérence « mensualité / durée » annoncée et renvoie un avertissement lisible.
 * Ex. 8 000 € à 250 €/mois ≈ 3 ans, pas 4 ou 6.
 */
export function verifierCoherencePret({ capitalCentimes, mensualiteCentimes, dureesAnnonceesMois = [], tauxMin = 5, tauxMax = 9 }) {
  const dureeMin = dureePourMensualite(capitalCentimes, tauxMin, mensualiteCentimes);
  const dureeMax = dureePourMensualite(capitalCentimes, tauxMax, mensualiteCentimes);
  const mensualitesParDuree = dureesAnnonceesMois.map((d) => ({
    dureeMois: d,
    min: mensualiteConstante(capitalCentimes, tauxMin, d),
    max: mensualiteConstante(capitalCentimes, tauxMax, d),
  }));
  const coherent = dureesAnnonceesMois.length === 0 || dureesAnnonceesMois.some((d) => d >= dureeMin - 2 && d <= dureeMax + 2);
  return { coherent, dureeMin, dureeMax, mensualitesParDuree };
}

/** Échéances (crédits bancaires + dettes envers des proches) comprises entre debut et fin inclus. */
export function echeancesEntre(etat, debut, fin) {
  const res = [];
  for (const c of etat.creditsBancaires || []) {
    if (c.actif === false) continue;
    let lignes = c.echeancier?.length ? c.echeancier : [];
    if (!lignes.length && c.type === 'amortissable' && c.dateDebut && c.capitalCentimes && (c.mensualiteCentimes || c.dureeMois)) {
      try { lignes = tableauAmortissement(c).map((l) => ({ date: l.date, montantCentimes: l.mensualiteCentimes + (l.assuranceCentimes || 0), payee: (c.payees || []).includes(l.date) })); } catch { lignes = []; }
    }
    for (const l of lignes) {
      if (l.date >= debut && l.date <= fin) res.push({ type: 'credit', court: c.type === 'instantane', creditId: c.id, libelle: c.libelle, date: l.date, montantCentimes: l.montantCentimes ?? l.mensualiteCentimes, payee: !!l.payee, motifDetection: c.motifDetection });
    }
  }
  // Une dette soldée garde ses échéances : celles de la période restent des dettes du mois (payées ou non),
  // sinon un remboursement fait disparaîtrait du calcul du reste à dépenser. La projection ignore les échéances payées.
  for (const p of etat.prets || []) {
    for (const e of p.echeancier || []) {
      if (e.date >= debut && e.date <= fin) {
        res.push({
          type: 'proche', pretId: p.id, libelle: p.sens === 'empruntéParMoi' ? `Remboursement à ${p.personneAlias}` : `${p.personneAlias} doit te rembourser`,
          date: e.date, montantCentimes: e.montantCentimes, payee: !!e.payee, sens: p.sens,
        });
      }
    }
  }
  return res.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Encours d'une dette envers un proche. */
export function resteDuPret(pret) {
  const rembourse = (pret.remboursements || []).reduce((s, r) => s + r.montantCentimes, 0);
  return Math.max(0, pret.montantCentimes - rembourse);
}

/** Encours d'un crédit bancaire (échéances non payées), ou capital restant dû pour un amortissable. */
export function encoursCredit(credit, date) {
  if (credit.type === 'amortissable' && credit.tauxPourcent && credit.dateDebut) {
    const t = tableauAmortissement(credit);
    if (date < credit.dateDebut) return credit.capitalCentimes;
    return capitalRestantDu(t, date, credit.capitalCentimes);
  }
  return (credit.echeancier || []).filter((e) => !e.payee).reduce((s, e) => s + (e.montantCentimes || 0), 0);
}

/** Jours avant la prochaine échéance non payée. */
export function prochaineEcheance(credit, aujourdhuiIso) {
  const e = (credit.echeancier || []).filter((x) => !x.payee && x.date >= aujourdhuiIso).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return e ? { ...e, dansJours: diffJours(aujourdhuiIso, e.date) } : null;
}

/**
 * Simule un prêt amortissable alimenté par une poche « remboursement anticipé » :
 * chaque mois, la poche reçoit `versements[mois]` ; dès qu'elle atteint le palier, elle est versée
 * en remboursement anticipé (réduction de durée, mensualité constante).
 * @returns {{ finLe, nbMois, interetsCentimes, remboursementsAnticipes: Array<{ date, montantCentimes }> }}
 */
export function simulerPretAvecPoche(credit, versementParMois = () => 0, palierCentimes = 50000) {
  let restant = credit.capitalCentimes;
  let poche = 0;
  let interets = 0;
  const anticipes = [];
  const jour = Number(credit.dateDebut.slice(8, 10));
  let date = credit.dateDebut;
  let n = 0;
  while (restant > 0 && n < 600) {
    date = ajouterMoisDate(credit.dateDebut, n, jour);
    const i = interetsMensuels(restant, credit.tauxPourcent);
    interets += i;
    const capital = Math.min(restant, credit.mensualiteCentimes - i);
    restant -= capital;
    poche += versementParMois(date.slice(0, 7)) || 0;
    if (restant > 0 && poche >= palierCentimes) {
      const v = Math.min(restant, poche);
      restant -= v; poche -= v;
      anticipes.push({ date, montantCentimes: v });
    }
    n++;
  }
  return { finLe: date, nbMois: n, interetsCentimes: interets, remboursementsAnticipes: anticipes, resteDansPocheCentimes: poche };
}
