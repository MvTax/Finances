// depenses.js (v200) — ce que montre l'onglet Dépenses : une liste par jour, très simple, et UNE phrase en haut.
// Chaque ligne dit seulement : quoi (emoji de catégorie + nom court), combien, et si c'est une charge « du mois ».
// Fonctions pures : l'état et la journée de budget (aujourdhui(), de 5 h à 5 h) sont passés en paramètres.

import { periodeBudget, estDepenseQuotidienne } from '../../calculs.js';
import { natureTransaction, contributionDepense, nomCategorie } from '../../categories.js';
import { diffJours, jourSemaine, ajouterJours, JOURS_LONGS, MOIS_LONGS } from '../../dates.js';
import { eur } from './commun.js';

/** Longueur maximale d'un nom court (le reste est coupé proprement, avec « … »). */
export const NOM_COURT_MAX = 26;

/** Ce qui n'a rien à faire dans la liste des dépenses : virements entre tes comptes, vers l'épargne, ajustements de solde. */
export function estVisible(t) {
  if (!t || t.ajustement) return false;
  const n = natureTransaction(t);
  return n !== 'interne' && n !== 'epargne' && n !== 'ajustement';
}

/**
 * La nature d'une ligne, pour l'affichage :
 *  'entree' (de l'argent qui rentre), 'probable' (peut-être une charge du mois : une question oui / non),
 *  'du-mois' (loyer, facture, abonnement, crédit : compté dans le mois, pas dans la journée),
 *  'envie' (payé avec l'argent mis de côté pour une envie), sinon 'quotidien'.
 */
export function natureLigne(t) {
  const n = natureTransaction(t);
  if (t.sens === 'credit') return n === 'remboursement' ? 'quotidien' : 'entree';
  if (t.obligatoireProbable) return 'probable';
  if (t.envieId) return 'envie';
  if (n === 'dette' || !estDepenseQuotidienne(t)) return 'du-mois';
  return 'quotidien';
}

/** Ce qu'une ligne pèse dans « Depuis le salaire » : une dépense (ou une mensualité) +, un remboursement d'achat −, sinon 0. */
export function montantDepense(t) {
  if (natureTransaction(t) === 'dette') return t.montantCentimes;
  return contributionDepense(t);
}

const PREFIXES = /^(PRLV( SEPA)?|CB|CARTE|PAIEMENT( PAR)? CB|ACHAT( CB)?|VIR( SEPA)?( INST)?|VIREMENT( SEPA)?|PRELEVEMENT)\s+/i;
const DATE_FIN = /\s+\d{2}[/.]\d{2}([/.]\d{2,4})?$/;

/** « PRLV SEPA OPERATEUR EXEMPLE » → « Operateur exemple » ; rien de lisible → le nom de la catégorie. */
export function nomCourt(t) {
  let s = String(t.marchand && !/^(inconnu|d[ée]pense|entr[ée]e)$/i.test(t.marchand) ? t.marchand : (t.libelle || '')).trim();
  s = s.replace(PREFIXES, '').replace(DATE_FIN, '').replace(/\s+/g, ' ').trim();
  if (!s || /^(inconnu|d[ée]pense|entr[ée]e)$/i.test(s)) s = nomCategorie(t.categorie);
  // Tout en majuscules (relevé bancaire) : en minuscules, première lettre en majuscule
  if (/[A-Z]/.test(s) && s === s.toUpperCase()) s = s.toLowerCase();
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.length > NOM_COURT_MAX ? `${s.slice(0, NOM_COURT_MAX - 1).trimEnd()}…` : s;
}

/** Titre d'un jour : « Aujourd'hui », « Hier », « mardi 10 » (même mois), « mardi 10 octobre », « mardi 10 octobre 2025 ». */
export function titreJour(iso, auj) {
  const d = diffJours(iso, auj);
  if (d === 0) return 'Aujourd’hui';
  if (d === 1) return 'Hier';
  if (d === -1) return 'Demain';
  const j = Number(iso.slice(8, 10));
  const base = `${JOURS_LONGS[jourSemaine(iso) - 1]} ${j === 1 ? '1er' : j}`;
  if (iso.slice(0, 7) === auj.slice(0, 7)) return base;
  const mois = MOIS_LONGS[Number(iso.slice(5, 7)) - 1];
  return iso.slice(0, 4) === auj.slice(0, 4) ? `${base} ${mois}` : `${base} ${mois} ${iso.slice(0, 4)}`;
}

const ordre = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.creeLe || '') < (b.creeLe || '') ? 1 : (a.creeLe || '') > (b.creeLe || '') ? -1 : 0);

/**
 * Les jours d'une période, du plus récent au plus ancien, avec leurs lignes (les plus récentes d'abord).
 * @returns {Array<{ date, titre, lignes: Array<{ tx, nature, nom, montantCentimes }> }>}
 */
export function joursDepenses(etat, debut, fin, auj) {
  const parJour = new Map();
  for (const t of [...(etat.transactions || [])].filter((x) => x.date >= debut && x.date <= fin && estVisible(x)).sort(ordre)) {
    if (!parJour.has(t.date)) parJour.set(t.date, []);
    parJour.get(t.date).push({ tx: t, nature: natureLigne(t), nom: nomCourt(t), montantCentimes: t.montantCentimes });
  }
  return [...parJour.entries()].map(([date, lignes]) => ({ date, titre: titreJour(date, auj), lignes }));
}

/** La période d'avant celle-ci (d'un salaire au précédent). */
export function periodePrecedente(etat, periode, auj) {
  return periodeBudget(ajouterJours(periode.debut, -1), etat.profil || {}, { reference: auj });
}

/** Plus ancienne opération visible (pour savoir s'il y a encore des mois à montrer). */
export function premiereDate(etat) {
  let min = null;
  for (const t of etat.transactions || []) if (estVisible(t) && t.date && (!min || t.date < min)) min = t.date;
  return min;
}

/**
 * « Depuis le salaire : X, dont Y du mois. »
 * @returns {{ periode, totalCentimes, duMoisCentimes, quotidienCentimes, phrase }}
 */
export function depuisSalaire(etat, auj) {
  const periode = periodeBudget(auj, etat.profil || {}, { reference: auj });
  let total = 0; let duMois = 0;
  for (const t of etat.transactions || []) {
    if (t.date < periode.debut || t.date > auj || !estVisible(t)) continue;
    const m = montantDepense(t);
    if (!m) continue;
    total += m;
    const n = natureLigne(t);
    if (n === 'du-mois' || n === 'probable') duMois += m;
  }
  total = Math.max(0, total);
  const quotidien = Math.max(0, total - duMois);
  const phrase = total <= 0 ? 'Depuis le salaire : rien de dépensé pour l’instant.'
    : `Depuis le salaire : ${eur(total)}${duMois > 0 && duMois < total ? `, dont ${eur(duMois)} du mois` : duMois >= total ? ', seulement des charges du mois' : ''}.`;
  return { periode, totalCentimes: total, duMoisCentimes: duMois, quotidienCentimes: quotidien, phrase };
}
