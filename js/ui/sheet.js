// sheet.js — feuille modale (bottom sheet) : animation à ressort, fermeture par glissement, bouton ou Échap,
// focus piégé dans la feuille et rendu au déclencheur à la fermeture (VoiceOver).

import { h, icone, reduitMouvement } from './dom.js';

const pile = [];

/**
 * Ouvre une feuille.
 * @param {object} o { titre, contenu (Node), actions (Node), onFermer, plein (bool), etiquette }
 * @returns {{ fermer, corps, element }}
 */
export function ouvrirFeuille(o) {
  const declencheur = document.activeElement;
  const titreId = `feuille-titre-${Date.now()}`;
  const corps = h('div', { class: 'feuille-corps' }, o.contenu || null);
  const fermerBtn = h('button', { class: 'btn-icone feuille-fermer', type: 'button', 'aria-label': 'Fermer' }, icone('fermer'));
  const poignee = h('div', { class: 'feuille-poignee', 'aria-hidden': 'true' });
  const entete = h('div', { class: 'feuille-entete' }, poignee, h('h2', { id: titreId, class: 'feuille-titre' }, o.titre || ''), fermerBtn);
  const feuille = h('div', { class: `feuille ${o.plein ? 'feuille-pleine' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titreId, tabindex: '-1' }, entete, corps, o.actions ? h('div', { class: 'feuille-actions' }, o.actions) : null);
  const voile = h('div', { class: 'voile' });
  const racine = h('div', { class: 'feuille-racine' }, voile, feuille);
  document.body.append(racine);
  document.documentElement.classList.add('feuille-ouverte');
  for (const autre of document.querySelectorAll('#app, .feuille-racine')) if (autre !== racine) autre.setAttribute('aria-hidden', 'true');

  let ferme = false;
  const fermer = (raison) => {
    if (ferme) return;
    ferme = true;
    feuille.classList.remove('visible');
    voile.classList.remove('visible');
    const fin = () => {
      racine.remove();
      pile.splice(pile.indexOf(api), 1);
      const precedente = pile[pile.length - 1];
      if (precedente) precedente.racine.removeAttribute('aria-hidden');
      else { document.getElementById('app')?.removeAttribute('aria-hidden'); document.documentElement.classList.remove('feuille-ouverte'); }
      if (declencheur && document.contains(declencheur)) declencheur.focus({ preventScroll: true });
      o.onFermer?.(raison);
      if (!pile.length) document.dispatchEvent(new CustomEvent('feuille-fermee')); // une mise à jour en attente peut s'appliquer
    };
    if (reduitMouvement()) fin(); else setTimeout(fin, 260);
  };

  fermerBtn.addEventListener('click', () => fermer('bouton'));
  voile.addEventListener('click', () => fermer('voile'));
  feuille.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); fermer('echap'); }
    if (e.key === 'Tab') pieger(e, feuille);
  });

  // Glisser vers le bas pour fermer (depuis l'en-tête ou quand le contenu est en haut)
  let y0 = null; let dy = 0; let t0 = 0;
  const debut = (e) => {
    if (e.target.closest('input, textarea, select, button:not(.feuille-poignee)') && !e.target.closest('.feuille-entete')) return;
    if (corps.scrollTop > 0 && !e.target.closest('.feuille-entete')) return;
    y0 = e.touches[0].clientY; dy = 0; t0 = performance.now();
    feuille.style.transition = 'none';
  };
  const bouge = (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0) { feuille.style.transform = `translateY(${dy}px)`; if (e.cancelable) e.preventDefault(); }
  };
  const finGeste = () => {
    if (y0 === null) return;
    const vitesse = dy / Math.max(1, performance.now() - t0);
    feuille.style.transition = '';
    feuille.style.transform = '';
    if (dy > 120 || vitesse > 0.6) fermer('glissement');
    y0 = null;
  };
  feuille.addEventListener('touchstart', debut, { passive: true });
  feuille.addEventListener('touchmove', bouge, { passive: false });
  feuille.addEventListener('touchend', finGeste);
  feuille.addEventListener('touchcancel', finGeste);

  const api = { fermer, corps, element: feuille, racine };
  pile.push(api);
  requestAnimationFrame(() => {
    feuille.classList.add('visible');
    voile.classList.add('visible');
    const premier = o.focus ? feuille.querySelector(o.focus) : null;
    (premier || feuille).focus({ preventScroll: true });
  });
  return api;
}

function pieger(e, conteneur) {
  const f = [...conteneur.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const premier = f[0]; const dernier = f[f.length - 1];
  if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
  else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
}

export function fermerToutes() { for (const f of [...pile].reverse()) f.fermer('programme'); }

/** Boîte de confirmation (feuille) : renvoie une promesse booléenne. */
export function confirmer({ titre, message, ok = 'Confirmer', annuler = 'Annuler', danger = false }) {
  return new Promise((resolve) => {
    let rep = false;
    const f = ouvrirFeuille({
      titre,
      contenu: h('p', { class: 'texte-feuille' }, message),
      actions: [
        h('button', { class: 'btn btn-secondaire', type: 'button', onclick: () => f.fermer('annuler') }, annuler),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-principal'}`, type: 'button', onclick: () => { rep = true; f.fermer('ok'); } }, ok),
      ],
      onFermer: () => resolve(rep),
    });
  });
}
