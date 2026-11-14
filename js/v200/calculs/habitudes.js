// habitudes.js (v200) — ce que tu notes le plus souvent, pour noter une dépense en deux touchers :
// tes catégories favorites, les montants qui reviennent, et le montant proposé au départ.
// Appris sur tes 90 derniers jours, dépenses du quotidien seulement (pas le loyer, les abonnements, l'épargne).
// Fonctions pures : l'état et la journée de budget sont passés en paramètres.

import { ajouterJours } from '../../dates.js';
import { nomCategorie, categorie as infoCategorie } from '../../categories.js';
import { estQuotidienne, arrondi10, mediane } from './commun.js';

export const JOURS_HABITUDES = 90;

/** Sans historique : les catégories du quotidien les plus courantes, dans cet ordre (catégories par défaut de l'app). */
export const CATEGORIES_REPLI = ['courses', 'restauration-rapide', 'restaurants', 'transports', 'vtc', 'loisirs', 'pharmacie', 'vetements', 'autres'];

/** Tes dépenses du quotidien des 90 derniers jours (aujourd'hui compris). */
function recentes(etat, auj) {
  const depuis = ajouterJours(auj, -JOURS_HABITUDES);
  return (etat.transactions || []).filter((t) => t.date >= depuis && t.date <= auj && estQuotidienne(t));
}

/**
 * Tes catégories les plus fréquentes (nombre de dépenses, puis montant total).
 * Avec peu de données, la liste est complétée par les catégories courantes (habituelle: false).
 * @returns {Array<{ categorie, nom, nb, habituelle }>}
 */
export function categoriesFavorites(etat, auj, n = 6) {
  const parCat = new Map();
  for (const t of recentes(etat, auj)) {
    const id = t.categorie || 'autres';
    const g = parCat.get(id) || { nb: 0, total: 0 };
    g.nb += 1; g.total += t.montantCentimes;
    parCat.set(id, g);
  }
  const vues = [...parCat.entries()]
    .sort((a, b) => b[1].nb - a[1].nb || b[1].total - a[1].total || (a[0] < b[0] ? -1 : 1))
    .map(([id, g]) => ({ categorie: id, nom: nomCategorie(id), nb: g.nb, habituelle: true }));
  const res = vues.slice(0, n);
  for (const id of CATEGORIES_REPLI) {
    if (res.length >= n) break;
    if (res.some((x) => x.categorie === id) || infoCategorie(id).id !== id) continue;
    res.push({ categorie: id, nom: nomCategorie(id), nb: 0, habituelle: false });
  }
  return res;
}

/** Les montants d'une catégorie sur 90 jours, arrondis à 0,10 €. */
function montantsCategorie(etat, categorie, auj) {
  return recentes(etat, auj).filter((t) => (t.categorie || 'autres') === categorie).map((t) => arrondi10(t.montantCentimes)).filter((m) => m > 0);
}

/**
 * Les montants qui reviennent le plus dans cette catégorie (arrondis à 0,10 €), du plus petit au plus grand.
 * Seulement des montants vraiment payés : sans historique, la liste est vide.
 * @returns {Array<{ montantCentimes, nb }>}
 */
export function montantsRapides(etat, categorie, auj, n = 4) {
  const freq = new Map();
  for (const m of montantsCategorie(etat, categorie, auj)) freq.set(m, (freq.get(m) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, n)
    .map(([montantCentimes, nb]) => ({ montantCentimes, nb }))
    .sort((a, b) => a.montantCentimes - b.montantCentimes);
}

/** Le montant proposé au départ : la médiane de la catégorie sur 90 jours, arrondie à 0,10 € (null sans historique). */
export function montantDepart(etat, categorie, auj) {
  const m = mediane(montantsCategorie(etat, categorie, auj));
  return m === null ? null : arrondi10(m);
}
