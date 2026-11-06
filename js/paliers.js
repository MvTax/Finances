// paliers.js — paliers de réussite d'une poche d'épargne, chacun avec sa couleur.
// Sécurité : 10 %, 25 %, 50 %, 75 % et 100 % de l'objectif (arrondis à 10 €).

const NIVEAUX = [
  { part: 0.10, nom: 'Premier pas', classe: 'palier-1' },
  { part: 0.25, nom: 'Bon départ', classe: 'palier-2' },
  { part: 0.50, nom: 'Mi-chemin', classe: 'palier-3' },
  { part: 0.75, nom: 'Presque', classe: 'palier-4' },
  { part: 1.00, nom: 'Objectif atteint', classe: 'palier-5' },
];

/**
 * Paliers d'une poche (pour l'instant la Sécurité, type « coussin », avec un objectif).
 * @returns null ou { liste: [{ montantCentimes, nom, classe, atteint }], courant, prochain, resteCentimes }
 */
export function paliersPoche(poche, soldeCentimes) {
  if (!poche || poche.type !== 'coussin' || !(poche.cibleCentimes > 0)) return null;
  const liste = NIVEAUX.map((n, i) => {
    const montant = i === NIVEAUX.length - 1 ? poche.cibleCentimes : Math.max(1000, Math.round((poche.cibleCentimes * n.part) / 1000) * 1000);
    return { montantCentimes: montant, nom: n.nom, classe: n.classe, atteint: soldeCentimes >= montant };
  });
  const atteints = liste.filter((p) => p.atteint);
  const prochain = liste.find((p) => !p.atteint) || null;
  return { liste, courant: atteints[atteints.length - 1] || null, prochain, resteCentimes: prochain ? prochain.montantCentimes - soldeCentimes : 0 };
}

/** Palier franchi entre deux soldes (pour féliciter après un versement), ou null. */
export function palierFranchi(poche, avantCentimes, apresCentimes) {
  const p = paliersPoche(poche, apresCentimes);
  if (!p) return null;
  return [...p.liste].reverse().find((x) => avantCentimes < x.montantCentimes && apresCentimes >= x.montantCentimes) || null;
}
