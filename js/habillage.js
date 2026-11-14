// habillage.js — quelle app est affichée dans la page : l'app d'origine (styles Classique / Joyeux), v100 (le Cockpit)
// ou v200 (la nouvelle app joyeuse). Le choix est posé sur <html data-app> par aiguillage.js, avant le premier affichage.
// Les trois apps partagent les mêmes données : seul l'habillage et quelques écrans changent.

/** @returns {'origine'|'v100'|'v200'} */
export function appCourante() {
  const a = typeof document !== 'undefined' ? document.documentElement.dataset.app : null;
  return a === 'v100' || a === 'v200' ? a : 'origine';
}

/** v100, le Cockpit (sombre). */
export const estCockpit = () => appCourante() === 'v100';

/** v200, la nouvelle app (claire et joyeuse). */
export const estV200 = () => appCourante() === 'v200';
