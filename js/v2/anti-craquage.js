// anti-craquage.js (V2) — bouton anti-craquage livraison : 3 idées d'en-cas avec les placards (via le pont Repas
// ou une photo analysée par Gemini, prompt PROMPT_FRIGO), et rappel du coût de la commande évitée.

/** Coût évité d'une commande de livraison au panier moyen observé. */
export function coutEvite(panierMoyenCentimes, fraisLivraisonCentimes = 0) {
  return panierMoyenCentimes + fraisLivraisonCentimes;
}

/** Choisit 3 idées parmi les repas possibles (ingrédients disponibles d'abord). */
export function troisIdees(repasPossibles) {
  return [...repasPossibles].sort((a, b) => (a.ingredients?.length || 0) - (b.ingredients?.length || 0)).slice(0, 3);
}
