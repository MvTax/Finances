// gamelle.js (V2) — compteur « Gamelle maison » : chaque repas fait maison au lieu d'un achat ≈ 8 € économisés.

export const ECONOMIE_PAR_REPAS_CENTIMES = 800;

/** @param {Array<{ date: string, repas: number }>} gamelles @returns {{ repas, economieCentimes }} */
export function bilanGamelles(gamelles, debut = '0000-01-01', fin = '9999-12-31', parRepas = ECONOMIE_PAR_REPAS_CENTIMES) {
  const repas = gamelles.filter((g) => g.date >= debut && g.date <= fin).reduce((s, g) => s + (g.repas || 1), 0);
  return { repas, economieCentimes: repas * parRepas };
}
