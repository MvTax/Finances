// habillage.js — quelle app est affichée dans la page : v200 (la nouvelle app joyeuse, par défaut) ou l'app d'origine
// (styles Classique / Joyeux). Le choix est posé sur <html data-app> par aiguillage.js, avant le premier affichage.
// Les deux apps partagent les mêmes données : seul l'habillage et quelques écrans changent.

import { toastErreur } from './ui/toast.js';

/** @returns {'origine'|'v200'} */
export function appCourante() {
  const a = typeof document !== 'undefined' ? document.documentElement.dataset.app : null;
  return a === 'v200' ? 'v200' : 'origine';
}

/** v200, la nouvelle app (claire et joyeuse). */
export const estV200 = () => appCourante() === 'v200';

/** Passer à l'autre app (choix gardé sur l'appareil, données communes), puis recharger sur l'accueil. @param {'v200'|'origine'} app */
export function basculer(app) {
  try { localStorage.setItem('budget-app', app === 'origine' ? 'origine' : 'v200'); localStorage.removeItem('budget-app-precedente'); } catch { toastErreur('Impossible de retenir ce choix : le stockage du navigateur est bloqué.'); return; }
  if (location.hash !== '#accueil') history.replaceState(null, '', '#accueil');
  location.reload();
}
