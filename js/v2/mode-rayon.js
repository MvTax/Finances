// mode-rayon.js (V2) — mode rayon : photo d'un produit → « Garde » / « Repose » avec justification budget + nutrition.
// Le prompt suivra le format de prompts.js ; la décision locale ci-dessous sert de repli sans IA.

/** Décision locale à partir d'un produit déjà identifié. */
export function decider({ prixCentimes, sucre, interditsNutrition = [], resteDuJourCentimes }) {
  const interditSucre = sucre && interditsNutrition.some((x) => /sucr/i.test(x));
  if (interditSucre) return { verdict: 'repose', raison: 'Interdit par ton profil nutrition.' };
  if (prixCentimes > resteDuJourCentimes) return { verdict: 'repose', raison: 'Dépasse ce qu’il te reste aujourd’hui.' };
  return { verdict: 'garde', raison: 'Dans ton budget du jour.' };
}
