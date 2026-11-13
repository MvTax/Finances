// s-score.js (v100) — Stratégie → Score Budget : le total sur 100 et ses cinq cadrans de 20 points,
// chacun avec son constat et ce qu'il faut faire pour gagner des points.

import { h } from '../../ui/dom.js';
import { etat } from '../../store.js';
import { aujourdhui } from '../../dates.js';
import { anneau, barreRepere } from '../ui/graphes.js';
import { entete, panneau } from '../ui/blocs.js';
import { scoreBudget } from '../strategie/score.js';

export function rendre(vue) {
  const score = scoreBudget(etat, aujourdhui());
  const etatAxe = (a) => (a.points >= 15 ? 'bien' : a.points >= 8 ? 'ok' : 'attention');
  vue.replaceChildren(h('div', { class: 'st' },
    entete('Score Budget', 'Un tableau de bord, recalculé à chaque ouverture. Ce n’est pas une note de ta banque.'),
    panneau(null,
      h('div', { class: 'score-tete' },
        h('div', { class: 'score-anneau' }, anneau({ part: score.total / 100, etat: score.total >= 65 ? 'bien' : score.total >= 35 ? 'ok' : 'attention', description: `Score de ${score.total} sur 100` }), h('strong', {}, String(score.total)), h('small', {}, 'SUR 100')),
        h('div', {}, h('p', { class: 'score-niveau' }, score.niveau.nom), h('p', { class: 'note' }, `Le plus bas aujourd’hui : ${score.pointFaible.nom.toLowerCase()}. C’est là que tu gagnes des points le plus vite.`)))),
    panneau('Les cinq cadrans', h('div', { class: 's-axes' }, score.axes.map((a) => h('div', { class: 's-axe' },
      h('span', { class: 's-axe-nom' }, a.nom), h('span', { class: 's-axe-points' }, String(a.points), h('small', {}, ` / ${a.max}`)),
      barreRepere({ part: a.points / a.max, etat: etatAxe(a), description: `${a.nom} : ${a.points} sur ${a.max}` }),
      h('p', { class: 's-axe-texte' }, a.constat, ' ', h('b', {}, a.conseil)))))),
    panneau('Comment il est calculé', h('p', { class: 'note' }, 'Budget du jour : mois pas dépassé (10 points) et part des jours finis sous ta part (10). Épargne : 10 % des revenus mis de côté donnent 20. Sécurité : ton coussin par rapport à son objectif. Dettes : 10 % des revenus ou moins donnent 20, 40 % ou plus donnent 0. Régularité : 7 jours de flamme (10), soldes vérifiés (5), sauvegarde récente (5).'))));
}
