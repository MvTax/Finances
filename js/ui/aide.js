// aide.js — le petit « ? » à côté d'un chiffre : un toucher explique d'où il vient, en deux lignes, avec ton calcul.

import { h, mt } from './dom.js';
import { ouvrirFeuille } from './sheet.js';

/**
 * @param {string} titre  le chiffre expliqué
 * @param {() => { texte: string, lignes?: Array<[libelle, centimes|string, classe?]> }} contenu  calculé au toucher (chiffres à jour)
 * @param {{ clair?: boolean }} o  clair : pour un fond sombre (bloc du jour)
 */
export function aide(titre, contenu, o = {}) {
  return h('button', {
    type: 'button', class: `aide-q ${o.clair ? 'clair' : ''}`, 'aria-label': `D’où vient ce chiffre : ${titre}`,
    onclick: (e) => {
      e.stopPropagation(); e.preventDefault();
      const c = contenu();
      ouvrirFeuille({
        titre,
        contenu: h('div', { class: 'aide-contenu' },
          h('p', {}, c.texte),
          c.lignes?.length ? h('div', { class: 'liste-cles' }, c.lignes.filter(Boolean).map(([l, v, cls]) => h('div', { class: `ligne-cle ${cls || ''}` }, h('span', {}, l), typeof v === 'number' ? mt(v) : h('span', {}, v)))) : null,
          c.note ? h('p', { class: 'petit' }, c.note) : null),
      });
    },
  }, '?');
}
