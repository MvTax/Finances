// strategie.js (v100) — l'onglet Stratégie : le score, la trajectoire sur 12 mois et l'accès aux outils
// (plan du prêt, projection et scénarios, brief, catégories, répartition, trésorerie). #strategie/<outil> ouvre l'outil.

import { h, icone, estMasque } from '../../ui/dom.js';
import { etat } from '../../store.js';
import { aller } from '../../router.js';
import { aujourdhui, formatMois } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { anneau, courbes, barreRepere } from '../ui/graphes.js';
import { entete, panneau } from '../ui/blocs.js';
import { scoreBudget } from '../strategie/score.js';
import { projeter } from '../strategie/projection.js';

export const titre = 'Stratégie';

const OUTILS = {
  pret: () => import('./s-pret.js'),
  projection: () => import('./s-projection.js'),
  coach: () => import('./s-coach.js'),
  categories: () => import('./s-categories.js'),
  repartition: () => import('./s-repartition.js'),
  tresorerie: () => import('./s-tresorerie.js'),
};
let jeton = 0;

export function rendre(vue, params = []) {
  const outil = OUTILS[params[0]];
  if (outil) {
    const moi = jeton += 1;
    outil().then((m) => { if (moi === jeton) m.rendre(vue, params.slice(1)); }).catch((e) => { vue.replaceChildren(h('div', { class: 'etat-vide' }, h('h2', {}, 'Cet outil n’a pas pu s’afficher'), h('p', {}, e.message))); });
    return;
  }
  jeton += 1;
  const auj = aujourdhui();
  const score = scoreBudget(etat, auj);
  const etatAxe = (a) => (a.points >= 15 ? 'bien' : a.points >= 8 ? 'ok' : 'attention');
  const scoreBloc = panneau('Score Budget',
    h('div', { class: 'score-tete' },
      h('div', { class: 'score-anneau' }, anneau({ part: score.total / 100, etat: score.total >= 65 ? 'bien' : score.total >= 35 ? 'ok' : 'attention', description: `Score de ${score.total} sur 100` }), h('strong', {}, String(score.total)), h('small', {}, 'SUR 100')),
      h('div', {}, h('p', { class: 'score-niveau' }, score.niveau.nom), h('p', { class: 'note' }, `Cinq cadrans de 20 points. Le plus bas aujourd’hui : ${score.pointFaible.nom.toLowerCase()}.`))),
    h('div', { class: 's-axes' }, score.axes.map((a) => h('div', { class: 's-axe' },
      h('span', { class: 's-axe-nom' }, a.nom), h('span', { class: 's-axe-points' }, String(a.points), h('small', {}, ` / ${a.max}`)),
      barreRepere({ part: a.points / a.max, etat: etatAxe(a), description: `${a.nom} : ${a.points} sur ${a.max}` }),
      h('p', { class: 's-axe-texte' }, a.constat, ' ', h('b', {}, a.conseil))))));

  let trajectoire = null;
  try {
    const p = projeter(etat, auj, { nbMois: 12 });
    const L = p.lignes;
    const fmt = (c) => (estMasque() ? '•••' : formatEuros(c, { sansCentimes: true }));
    const series = [];
    if (L.some((l) => l.capitalPretCentimes > 0)) series.push({ nom: 'Prêt restant', classe: 'serie-1', valeurs: L.map((l) => l.capitalPretCentimes) });
    series.push({ nom: 'Sécurité', classe: 'serie-4', valeurs: L.map((l) => l.soldeSecuCentimes) });
    trajectoire = panneau('Trajectoire 12 mois',
      courbes({ series, etiquettes: L.map((l) => formatMois(l.mois, true)), format: fmt, formatAxe: (v) => `${Math.round(v / 100)}`, titre: 'Prêt restant et épargne sécurité, en euros' }),
      p.jalons.length ? h('ol', { class: 'jalons' }, p.jalons.map((x) => h('li', { class: `jalon jalon-${x.type}` }, h('span', { class: 'jalon-mois' }, formatMois(x.mois, true)), h('span', { class: 'jalon-titre' }, x.titre)))) : null,
      h('button', { type: 'button', class: 'btn btn-secondaire', onclick: () => aller('strategie/projection') }, 'Changer les hypothèses'));
  } catch (e) { console.warn('Trajectoire', e?.message); }

  const outilBouton = (ic, nom, sous, action) => h('button', { type: 'button', class: 'outil', onclick: action }, icone(ic), h('strong', {}, nom), h('small', {}, sous));
  const outils = h('section', { 'aria-label': 'Outils' }, h('div', { class: 'outils' },
    outilBouton('banque', 'Plan du prêt', 'Date de fin, coût, meilleur rythme', () => aller('strategie/pret')),
    outilBouton('graphique', 'Projection', '12 mois et scénarios « et si »', () => aller('strategie/projection')),
    outilBouton('eclair', 'Brief du jour', 'Priorités, voyants, économies', () => aller('strategie/coach')),
    outilBouton('liste', 'Catégories', 'Plafonds, rythme, leviers', () => aller('strategie/categories')),
    outilBouton('tirelire', 'Répartition', 'Où va chaque euro mis de côté', () => aller('strategie/repartition')),
    outilBouton('calendrier', 'Trésorerie', 'Ton compte jusqu’au salaire', () => aller('strategie/tresorerie')),
    outilBouton('boucle', 'Abonnements', 'Coût par mois et par an', () => aller('abonnements')),
    outilBouton('etoile', 'Statistiques', 'Les mois passés, poste par poste', () => aller('statistiques')),
    outilBouton('ok', 'Recalcul complet', 'Compare avec tes banques', async () => { const { feuilleRecalcul } = await import('../../pages/recalcul.js'); feuilleRecalcul(); }),
    outilBouton('coeur', 'Et si j’achète ?', 'L’effet d’un achat avant de payer', async () => { const { feuilleSimulateurAchat } = await import('../../pages/simulateur-achat.js'); feuilleSimulateurAchat(); })));

  vue.replaceChildren(h('div', { class: 'st' }, ...[entete('Stratégie', 'Où tu en es, où tu vas, et quoi faire pour y arriver plus vite.', { retour: null }), scoreBloc, trajectoire, outils].filter(Boolean)));
}
