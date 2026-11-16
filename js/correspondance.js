// correspondance.js — reconnaître qu'une opération correspond à une charge fixe ou à une échéance de crédit :
// tolérances communes (montant à 10 % près, date à 7 jours près), catégories voisines, motif retrouvé dans le libellé.
// Partagé par calculs.js, obligatoires.js et import/pipeline.js (aucun import en retour : pas de boucle). Fonctions pures.

import { normaliserTexte } from './rules.js';

export const TOLERANCE_POURCENT = 10;
export const TOLERANCE_JOURS = 7;

/** Catégories voisines : une charge « Énergie » notée en « Logement » reste la même charge. */
const VOISINES = { logement: ['energie'], energie: ['logement'], telephonie: ['abonnements'], abonnements: ['telephonie', 'sport'], sport: ['abonnements'] };
export const SANS_CATEGORIE = new Set([null, undefined, '', 'autres']);

/** Montant à 10 % près (calcul en entiers : |a − b| × 100 ≤ b × 10). */
export function montantProche(centimes, referenceCentimes, pourcent = TOLERANCE_POURCENT) {
  if (!(referenceCentimes > 0)) return false;
  return Math.abs(centimes - referenceCentimes) * 100 <= referenceCentimes * pourcent;
}

/** Même catégorie ou catégorie voisine. */
export function categorieVoisine(categorieCharge, categorieTx) {
  if (!categorieCharge || !categorieTx) return false;
  return categorieCharge === categorieTx || (VOISINES[categorieCharge] || []).includes(categorieTx);
}

/** 'meme' (même catégorie ou voisine), 'inconnue' (Autres ou vide), ou null (incompatible). */
export function compatibilite(categorieCharge, categorieTx) {
  if (SANS_CATEGORIE.has(categorieTx)) return 'inconnue';
  return categorieVoisine(categorieCharge, categorieTx) ? 'meme' : null;
}

/** Texte comparable mot à mot : majuscules sans accents, ponctuation remplacée par des espaces. */
const mots = (s) => ` ${normaliserTexte(s).replace(/[^A-Z0-9]+/g, ' ').trim()} `;

/**
 * Le motif d'une charge (son nom de commerçant, ex. « BAILLEUR EXEMPLE ») se retrouve-t-il dans le libellé bancaire
 * de l'opération (« PRLV SEPA BAILLEUR EXEMPLE REF… ») ? Mots entiers seulement, motif d'au moins 3 lettres.
 */
export function motifDansLibelle(motif, t) {
  const m = mots(motif || '');
  if (m.trim().length < 3) return false;
  return [t?.libellePrincipal, t?.libelleBrut].some((l) => l && mots(l).includes(m));
}
