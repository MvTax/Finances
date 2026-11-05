// checkin-soir.js (V2) — check-in du soir en 30 s : confirme les dépenses du jour, signale celles qui manquent.

/** Résumé du jour pour le check-in (dépenses saisies, reste du jour). */
export function resumeDuJour({ depensesDuJourCentimes, parJourCentimes, nbSaisies }) {
  return { depensesDuJourCentimes, resteDuJourCentimes: parJourCentimes - depensesDuJourCentimes, nbSaisies, aRien: nbSaisies === 0 };
}
