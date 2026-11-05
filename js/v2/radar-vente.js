// radar-vente.js (V2) — « Radar fin de mois » : quand la jauge passe sous un seuil, suggère de vendre un objet.

/** @returns {{ declencher: boolean, manqueCentimes: number }} */
export function radarFinDeMois({ parJourCentimes, joursRestants, seuilParJourCentimes = 500 }) {
  const manque = Math.max(0, (seuilParJourCentimes - parJourCentimes) * joursRestants);
  return { declencher: parJourCentimes < seuilParJourCentimes, manqueCentimes: manque };
}
