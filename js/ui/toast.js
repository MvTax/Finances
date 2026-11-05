// toast.js — messages éphémères (aria-live), avec action « Annuler » optionnelle.

import { h } from './dom.js';

let courant = null;

/**
 * @param {string} message
 * @param {{ action?: { libelle, fn }, duree?: number, type?: 'info'|'erreur'|'succes' }} o
 */
export function toast(message, o = {}) {
  const zone = document.getElementById('toasts');
  if (!zone) return;
  if (courant) courant.fermer();
  const duree = o.duree ?? (o.action ? 5000 : 3200);
  const el = h('div', { class: `toast toast-${o.type || 'info'}`, role: o.type === 'erreur' ? 'alert' : 'status' },
    h('span', { class: 'toast-texte' }, message),
    o.action ? h('button', { class: 'toast-action', type: 'button', onclick: () => { o.action.fn(); fermer(); } }, o.action.libelle) : null);
  zone.append(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  let minuteur = setTimeout(() => fermer(), duree);
  el.addEventListener('touchstart', () => clearTimeout(minuteur), { passive: true });
  el.addEventListener('touchend', () => { minuteur = setTimeout(() => fermer(), 2000); });
  function fermer() {
    clearTimeout(minuteur);
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 250);
    if (courant?.el === el) courant = null;
  }
  courant = { el, fermer };
  return courant;
}

export const toastErreur = (m) => toast(m, { type: 'erreur', duree: 6000 });
