// blocs.js (v100) — petits blocs communs aux pages Stratégie : en-tête avec retour, indicateurs, réglette, panneau.

import { h, icone } from '../../ui/dom.js';
import { aller } from '../../router.js';

let compteur = 0;

/** En-tête d'une page de stratégie : retour vers le sommaire, titre, phrase d'introduction. */
export function entete(titre, intro, { retour = 'strategie', libelleRetour = 'Stratégie' } = {}) {
  return h('header', { class: 'st-tete' },
    retour ? h('button', { type: 'button', class: 'st-retour', onclick: () => aller(retour) }, icone('suivant'), libelleRetour) : null,
    h('h1', { class: 'st-titre' }, titre),
    intro ? h('p', { class: 'st-intro' }, intro) : null);
}

export function panneau(titre, ...enfants) {
  const id = `pan-${compteur += 1}`;
  return h('section', { class: 'panneau', 'aria-labelledby': titre ? id : null }, titre ? h('h2', { id, class: 'panneau-titre' }, titre) : null, ...enfants.flat().filter(Boolean));
}

/** Un indicateur : petit libellé, grande valeur, note. */
export function kpi(libelle, valeur, note = null, classe = '') {
  return h('div', { class: `kpi ${classe}` }, h('small', {}, libelle), h('strong', {}, valeur), note ? h('em', {}, note) : null);
}

/**
 * Réglette (curseur) avec sa valeur affichée. onChange est appelé pendant le glissement.
 * @param {{ libelle, min, max, pas, valeur, format: (v) => string, onChange: (v) => void, note? }} o
 */
export function reglette({ libelle, min, max, pas = 1, valeur, format, onChange, note = null }) {
  const id = `reg-${compteur += 1}`;
  const sortie = h('output', { for: id }, format(valeur));
  const champ = h('input', { id, type: 'range', min: String(min), max: String(max), step: String(pas), value: String(valeur), 'aria-valuetext': format(valeur),
    oninput: (e) => { const v = Number(e.target.value); sortie.textContent = format(v); e.target.setAttribute('aria-valuetext', format(v)); onChange(v); } });
  return h('div', { class: 'reglette' }, h('div', { class: 'reglette-tete' }, h('label', { for: id }, libelle), sortie), champ, note ? h('small', {}, note) : null);
}

/** Choix unique parmi quelques valeurs (puces). */
export function pucesChoix(options, valeur, onChange, libelle) {
  const groupe = h('div', { class: 'puces-choix', role: 'radiogroup', 'aria-label': libelle });
  const rendre = (v) => groupe.replaceChildren(...options.map(([val, nom]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(val === v), class: `puce-choix ${val === v ? 'actif' : ''}`, onclick: () => { rendre(val); onChange(val); } }, nom)));
  rendre(valeur);
  return groupe;
}

/** Appelle fn au plus une fois par image (pour recalculer pendant qu'on glisse une réglette). */
export function parImage(fn) {
  let prevu = false;
  return () => { if (prevu) return; prevu = true; requestAnimationFrame(() => { prevu = false; fn(); }); };
}
