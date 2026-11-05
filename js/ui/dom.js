// dom.js — création d'éléments sans innerHTML pour les données (aucune injection possible), formats affichés.

import { formatEuros } from '../money.js';

/**
 * h('button', { class: 'btn', onclick: fn, 'aria-label': '…' }, enfant1, 'texte', …)
 * Les attributs « on… » deviennent des écouteurs ; `false`/`null` sont ignorés.
 */
export function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value' || k === 'textContent') el[k] = v;
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  ajouter(el, enfants);
  return el;
}

function ajouter(el, enfants) {
  for (const e of enfants.flat(Infinity)) {
    if (e === null || e === undefined || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
}

/** Icône du sprite. */
export function icone(nom, classe = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', `ic ${classe}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `#i-${nom}`);
  svg.append(use);
  return svg;
}

let masque = false;
export function definirMasquage(v) { masque = !!v; document.documentElement.classList.toggle('montants-masques', masque); }
export function estMasque() { return masque; }

/** Montant formaté, masqué si l'option est active (VoiceOver lit « montant masqué »). */
export function mt(centimes, options = {}) {
  if (masque && !options.toujours) {
    return h('span', { class: 'mt masque', 'aria-label': 'Montant masqué' }, '•••,•• €');
  }
  return h('span', { class: `mt ${options.classe || ''}`.trim() }, formatEuros(centimes, options));
}

export function vider(el) { while (el.firstChild) el.firstChild.remove(); return el; }

export function remplacer(el, ...enfants) { vider(el); ajouter(el, enfants); return el; }

/** Annonce vocale (VoiceOver) via la région aria-live. */
export function annoncer(texte) {
  const r = document.getElementById('annonces');
  if (!r) return;
  r.textContent = '';
  setTimeout(() => { r.textContent = texte; }, 50);
}

export function vibrer(ms = 10) { try { navigator.vibrate?.(ms); } catch { /* iOS ne vibre pas : sans effet */ } }

export const reduitMouvement = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fait défiler un nombre jusqu'à sa valeur (désactivé si mouvement réduit). */
export function animerMontant(el, de, a, rendu) {
  if (reduitMouvement() || masque || de === a) { el.textContent = rendu(a); return; }
  const debut = performance.now(); const duree = 380;
  const pas = (t) => {
    const p = Math.min(1, (t - debut) / duree);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = rendu(Math.round(de + (a - de) * e));
    if (p < 1) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}
