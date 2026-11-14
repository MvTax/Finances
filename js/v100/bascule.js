// bascule.js — passer d'une app à l'autre (origine, v100 le Cockpit, v200 la nouvelle app). Le choix est gardé sur l'appareil ;
// les données sont communes. En ouvrant v200, l'app quittée est retenue pour « Revenir à… ».

import { toastErreur } from '../ui/toast.js';
import { appCourante, estCockpit } from '../habillage.js';

export const estV100 = estCockpit;

const NOMS = { origine: 'l’app d’origine', v100: 'v100, le Cockpit' };

/** L'app à proposer pour revenir depuis v200 (celle d'où l'on vient, sinon l'app d'origine). */
export function appPrecedente() {
  let a = null;
  try { a = localStorage.getItem('budget-app-precedente'); } catch { a = null; }
  return a === 'v100' ? 'v100' : 'origine';
}
export const nomApp = (app) => NOMS[app] || NOMS.origine;

/** @param {'v100'|'v200'|'origine'} app */
export function basculer(app) {
  try {
    if (app === 'v200' && appCourante() !== 'v200') localStorage.setItem('budget-app-precedente', appCourante());
    localStorage.setItem('budget-app', app);
  } catch { toastErreur('Impossible de retenir ce choix : le stockage du navigateur est bloqué.'); return; }
  if (location.hash !== '#accueil') history.replaceState(null, '', '#accueil');
  location.reload();
}
