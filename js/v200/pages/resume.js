// resume.js (v200) — l'onglet Résumé, à lire d'un coup d'œil :
//  - en haut, la météo du mois (risqueDuMois) : soleil, nuage ou orage, un titre court et sa phrase ;
//  - bascule « Ce mois-ci / Cette année » ;
//    mois : où part l'argent (3 catégories, petites barres arrondies), comparaison avec le mois d'avant,
//           série et jours sans dépense, épargne ;
//    année : 12 pastilles de périodes (calme / moyen / chargé, légende en mots), épargne, le mois le plus calme ;
//  - jusqu'à 3 préventions en cartes douces ;
//  - un seul « Voir le détail » (facultatif) : l'ancienne page des mois passés.
// Les calculs sont dans js/v200/calculs/resume.js et risques.js (testés) ; ici, seulement l'affichage.

import { h, icone, estMasque } from '../../ui/dom.js';
import { etat } from '../../store.js';
import { aujourdhui, formatMois, MOIS_LONGS } from '../../dates.js';
import { periodeBudget } from '../../calculs.js';
import { eur } from '../calculs/commun.js';
import { risqueDuMois } from '../calculs/risques.js';
import { resumeMois, resumeAnnee, preventions, meteoDuMois, phrasesMois, phrasesAnnee, NIVEAUX_ANNEE } from '../calculs/resume.js';
import { emojiCategorie } from '../ui/tuiles.js';
import { meteo, pastille } from '../ui/dessins.js';

export const titre = 'Résumé';

let vueChoisie = 'mois'; // 'mois' | 'annee'

/** « 5 novembre », « 1er décembre » */
const jourMois = (iso) => `${Number(iso.slice(8, 10)) === 1 ? '1er' : Number(iso.slice(8, 10))} ${MOIS_LONGS[Number(iso.slice(5, 7)) - 1]}`;
const masquer = (texte) => (estMasque() ? texte.replace(/\d[\d   ]*(,\d+)?\s?€/g, '••• €') : texte);
const EMOJI_PREVENTION = { 'prelevement-non-couvert': '⚠️', 'charge-proche': '📅', 'jour-cher': '🛍️', 'envie-presque': '🎁', 'envie-prete': '🎁' };
const LEGENDE_DESSIN = { soleil: 'Soleil', nuage: 'Soleil et nuage', orage: 'Nuage d’orage', voile: 'Ciel voilé' };

function phrase(p, enfant = null) {
  if (!p) return null;
  return h('section', { class: 'v2-res-phrase' },
    h('span', { class: 'v2-phrase-emoji', 'aria-hidden': 'true' }, p.emoji),
    h('div', { class: 'v2-res-phrase-corps' }, h('p', {}, masquer(p.texte)), enfant));
}

function barres(top) {
  if (!top.length) return null;
  const max = top[0].montantCentimes || 1;
  return h('ul', { class: 'v2-res-barres', role: 'list' }, top.map((c) => h('li', { class: 'v2-res-barre' },
    h('span', { class: 'v2-res-barre-emoji', 'aria-hidden': 'true' }, emojiCategorie(c.categorie)),
    h('span', { class: 'v2-res-barre-nom' }, c.nom),
    h('span', { class: 'v2-res-barre-montant' }, estMasque() ? '•••' : eur(c.montantCentimes)),
    h('span', { class: 'v2-res-barre-piste', 'aria-hidden': 'true' }, h('span', { class: 'v2-res-barre-plein', style: { '--l': `${Math.max(6, Math.round((c.montantCentimes * 100) / max))}%` } })))));
}

function vueMois(auj) {
  const m = resumeMois(etat, auj);
  const p = phrasesMois(m);
  return [phrase(p.ouPart, barres(m.top)), phrase(p.comparaison), phrase(p.serie), phrase(p.epargne)].filter(Boolean);
}

function vueAnnee(auj) {
  const a = resumeAnnee(etat, auj);
  const p = phrasesAnnee(a);
  const mots = Object.fromEntries(NIVEAUX_ANNEE);
  const pastilles = a.periodes.length ? h('section', { class: 'v2-res-annee', 'aria-label': 'Tes mois, du plus ancien au plus récent' },
    h('ol', { class: 'v2-res-pastilles', role: 'list' }, a.periodes.map((x) => h('li', { class: 'v2-res-pastille', 'aria-label': `${formatMois(x.mois)} : ${mots[x.niveau]}${x.enCours ? ', en cours' : ''}` },
      pastille(x.niveau, { enCours: x.enCours }),
      h('span', { class: 'v2-res-pastille-mois', 'aria-hidden': 'true' }, formatMois(x.mois, true).replace(/ \d+$/, ''))))),
    h('p', { class: 'v2-res-legende', 'aria-hidden': 'true' }, NIVEAUX_ANNEE.map(([id, mot]) => h('span', { class: 'v2-res-legende-item' }, pastille(id), mot)))) : null;
  return [pastilles, phrase(p.epargne), phrase(p.calme)].filter(Boolean);
}

function bascule(onChoix) {
  const options = [['mois', 'Ce mois-ci'], ['annee', 'Cette année']];
  return h('div', { class: 'v2-bascule', role: 'group', 'aria-label': 'Période du résumé' },
    options.map(([v, t]) => h('button', { type: 'button', class: `v2-bascule-btn ${vueChoisie === v ? 'actif' : ''}`, 'aria-pressed': String(vueChoisie === v), onclick: () => { if (vueChoisie !== v) { vueChoisie = v; onChoix(); } } }, t)));
}

export function rendre(vue) {
  const auj = aujourdhui();
  const r = risqueDuMois(etat, auj);
  const mt = meteoDuMois(r);

  const ciel = h('section', { class: `v2-meteo-carte v2-ciel-${mt.dessin}`, 'aria-labelledby': 'v2-meteo-t' },
    meteo(mt.dessin, LEGENDE_DESSIN[mt.dessin]),
    h('h2', { id: 'v2-meteo-t', class: 'v2-meteo-titre' }, mt.titre),
    mt.phrase ? h('p', { class: 'v2-meteo-phrase' }, masquer(mt.phrase)) : null);

  const zone = h('div', { class: 'v2-res-zone' });
  const dessiner = () => {
    zone.replaceChildren(bascule(dessiner), ...(vueChoisie === 'annee' ? vueAnnee(auj) : vueMois(auj)));
    zone.querySelector('.v2-bascule-btn.actif')?.focus({ preventScroll: true });
  };
  zone.replaceChildren(bascule(dessiner), ...(vueChoisie === 'annee' ? vueAnnee(auj) : vueMois(auj)));

  const prev = preventions(etat, auj);
  const cartes = prev.length ? h('section', { class: 'v2-res-preventions', 'aria-label': 'À prévoir' },
    h('h2', { class: 'v2-res-soustitre' }, 'À prévoir'),
    h('ul', { class: 'v2-res-prev-liste', role: 'list' }, prev.map((x) => h('li', { class: `v2-res-prev ${x.type}` },
      h('span', { class: 'v2-phrase-emoji', 'aria-hidden': 'true' }, EMOJI_PREVENTION[x.type] || '📌'),
      h('p', {}, masquer(x.phrase)))))) : null;

  vue.replaceChildren(h('div', { class: 'v2-res' },
    h('header', { class: 'v2-tete' }, h('div', {}, h('h1', { class: 'v2-titre' }, 'Mon résumé'), h('p', { class: 'v2-date' }, `Depuis le salaire du ${jourMois(periodeBudget(auj, etat.profil || {}, { reference: auj }).debut)}`))),
    ciel, zone, cartes,
    h('a', { class: 'v2-lien-doux', href: '#historique' }, h('span', {}, 'Voir le détail'), icone('suivant'))));
}
