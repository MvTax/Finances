// bascule.js — passer de l'app d'origine à v100 (Cockpit) et retour. Le choix est gardé sur l'appareil ; les données sont communes.

import { toastErreur } from '../ui/toast.js';

export const estV100 = () => document.documentElement.dataset.app === 'v100';

/** @param {'v100'|'origine'} app */
export function basculer(app) {
  try { localStorage.setItem('budget-app', app); } catch { toastErreur('Impossible de retenir ce choix : le stockage du navigateur est bloqué.'); return; }
  if (location.hash !== '#accueil') history.replaceState(null, '', '#accueil');
  location.reload();
}
