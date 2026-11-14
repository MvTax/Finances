// tuiles.js (v200) — choisir une catégorie d'un toucher : tes 6 catégories favorites (categoriesFavorites) et « Autre »,
// qui ouvre la liste complète en grille. Une tuile = un emoji et un nom ; de vrais boutons, assez grands pour le pouce.

import { h, icone } from '../../ui/dom.js';
import { categoriesDepense, nomCategorie } from '../../categories.js';

/** Un emoji par catégorie (seulement pour l'affichage ; les catégories elles-mêmes ne changent pas). */
const EMOJI = {
  courses: '🛒', 'restauration-rapide': '🍔', livraison: '🛵', restaurants: '🍽️', vtc: '🚕', transports: '🚇', velo: '🚲', train: '🚆',
  voyages: '✈️', logement: '🏠', energie: '⚡', telephonie: '📱', abonnements: '🔁', sante: '🩺', pharmacie: '💊', beaute: '🧴',
  coiffeur: '💇', vetements: '👕', 'achats-en-ligne': '📦', maison: '🛠️', loisirs: '🎟️', sport: '🏃', dons: '🤝', impots: '📄',
  'frais-bancaires': '🏦', credits: '🔑', especes: '💶', plaisir: '⭐', autres: '🏷️',
};
export const emojiCategorie = (id) => EMOJI[id] || '🏷️';

/** Les catégories qu'on peut noter comme dépense (pas l'épargne ni les virements entre tes comptes). */
const toutes = () => categoriesDepense().filter((c) => !['epargne', 'virements-internes'].includes(c.id));

function tuile({ id, nom, emoji, classe = '', onclick }) {
  return h('button', { type: 'button', class: `v2-tuile ${classe}`.trim(), 'data-categorie': id, onclick },
    h('span', { class: 'v2-tuile-emoji', 'aria-hidden': 'true' }, emoji), h('span', { class: 'v2-tuile-nom' }, nom));
}

/**
 * @param {{ favorites: Array<{ categorie: string, nom?: string }>, onChoix: (id: string) => void, question?: string }} o
 * @returns {HTMLElement}
 */
export function tuilesCategories({ favorites, onChoix, question = 'C’était quoi ?' }) {
  const zone = h('div', { class: 'v2-tuiles-zone' });
  const titre = h('h3', { class: 'v2-question' }, question);
  const grille = h('div', { class: 'v2-tuiles', role: 'group', 'aria-label': question });
  const favoris = () => {
    titre.textContent = question;
    grille.classList.remove('toutes');
    grille.replaceChildren(
      ...favorites.slice(0, 6).map((f) => tuile({ id: f.categorie, nom: nomCategorie(f.categorie), emoji: emojiCategorie(f.categorie), onclick: () => onChoix(f.categorie) })),
      tuile({ id: 'autre', nom: 'Autre catégorie', emoji: icone('plus'), classe: 'v2-tuile-autre', onclick: () => liste() }));
  };
  const liste = () => {
    titre.textContent = 'Toutes les catégories';
    grille.classList.add('toutes');
    grille.replaceChildren(
      tuile({ id: 'retour', nom: 'Revenir à mes favorites', emoji: icone('retour'), classe: 'v2-tuile-autre', onclick: () => { favoris(); grille.querySelector('button')?.focus(); } }),
      ...toutes().map((c) => tuile({ id: c.id, nom: nomCategorie(c.id), emoji: emojiCategorie(c.id), onclick: () => onChoix(c.id) })));
    grille.querySelector('button')?.focus({ preventScroll: true });
  };
  favoris();
  zone.append(titre, grille);
  return zone;
}
