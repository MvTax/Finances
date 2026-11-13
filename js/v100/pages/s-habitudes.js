// s-habitudes.js (v100) — Stratégie → Mes habitudes : les statistiques de tes dépenses du quotidien
// (moyenne, médiane, régularité, jours de la semaine, répartition, tendance, prévision de fin de mois).

import { h, estMasque } from '../../ui/dom.js';
import { etat } from '../../store.js';
import { jaugeDuJour } from '../../calculs.js';
import { nomCategorie } from '../../categories.js';
import { aujourdhui, formatDateCourte, JOURS_COURTS, JOURS_LONGS } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { courbes, barres, fourchette, barreRepere } from '../ui/graphes.js';
import { entete, panneau, kpi } from '../ui/blocs.js';
import { statsDepenses } from '../strategie/stats.js';

const eur = (c) => (estMasque() ? '•••,•• €' : formatEuros(c));
const rond = (c) => (estMasque() ? '••• €' : formatEuros(c, { sansCentimes: true }));
const court = (c) => (estMasque() ? '••' : `${Math.round(c / 100)} €`);
// [min, max en centimes, étiquette sous la barre, la même tranche dans une phrase]
const TRANCHES = [[0, 0, '0 €', 'à 0 €'], [1, 500, '≤ 5 €', 'à 5 € ou moins'], [501, 1000, '≤ 10 €', 'entre 5 et 10 €'], [1001, 2000, '≤ 20 €', 'entre 10 et 20 €'],
  [2001, 4000, '≤ 40 €', 'entre 20 et 40 €'], [4001, Infinity, '> 40 €', 'à plus de 40 €']];

export function rendre(vue) {
  const auj = aujourdhui();
  const st = statsDepenses(etat, auj);
  if (!st.jours) {
    vue.replaceChildren(h('div', { class: 'st' }, entete('Mes habitudes', 'Pas encore de journée terminée à analyser. Note tes dépenses : les statistiques arrivent dès demain.')));
    return;
  }
  const part = jaugeDuJour(etat, auj, etat.meta?.jauge || null).parJourCentimes;
  const p = st.prevision;
  const regularite = st.recents.cv <= 0.6 ? 'régulier' : st.recents.cv <= 1.1 ? 'variable' : 'en dents de scie';
  const dern = st.serie.slice(-28);
  const glissante = dern.map((_, i) => { const f = dern.slice(Math.max(0, i - 6), i + 1); return Math.round(f.reduce((t, x) => t + x.centimes, 0) / f.length); });
  const histo = TRANCHES.map(([min, max, nom, phrase]) => ({ nom, phrase, valeur: st.serie.filter((x) => x.centimes >= min && x.centimes <= max).length }));
  const plusFrequent = [...histo].sort((a, b) => b.valeur - a.valeur)[0];
  const tendance = st.tendance.sens === 'stable' ? 'stable' : `${st.tendance.sens === 'hausse' ? '+' : '−'}${eur(Math.abs(st.tendance.parSemaineCentimes))}`;
  vue.replaceChildren(h('div', { class: 'st' },
    entete('Mes habitudes', `Tes dépenses du quotidien sur ${st.jours} jours terminés${st.fiable ? '' : ' (peu de jours : les chiffres vont s’affiner)'}.`),
    h('div', { class: 'kpis' },
      kpi('EN MOYENNE', eur(st.recents.moyenne), 'par jour, sur 4 semaines', part > 0 && st.recents.moyenne > part ? 'or' : 'vert'),
      kpi('UN JOUR NORMAL', eur(st.recents.mediane), 'la médiane : un jour sur deux est en dessous'),
      kpi('RÉGULARITÉ', regularite, `écart-type ${eur(st.recents.ecartType)}`),
      kpi('TENDANCE', tendance, st.tendance.sens === 'stable' ? 'sur 4 semaines' : 'par jour, chaque semaine', st.tendance.sens === 'hausse' ? 'or' : st.tendance.sens === 'baisse' ? 'vert' : '')),
    panneau('Jour après jour',
      courbes({ series: [{ nom: 'Dépense du jour', classe: 'serie-1', valeurs: dern.map((x) => x.centimes) }, { nom: 'Moyenne sur 7 jours', classe: 'serie-3', valeurs: glissante }],
        etiquettes: dern.map((x) => formatDateCourte(x.date)), format: eur, formatAxe: (v) => `${Math.round(v / 100)}`, titre: 'Dépenses du quotidien, en euros' }),
      h('p', { class: 'note' }, `Le plus gros jour : ${eur(st.global.max)}. ${st.joursSansDepense} jour${st.joursSansDepense > 1 ? 's' : ''} sans dépense sur ${st.jours}. Les trois quarts de tes jours sont sous ${eur(st.global.q3)}.`)),
    panneau('Par jour de la semaine',
      barres({ valeurs: st.parJourSemaine.map((x) => ({ nom: JOURS_COURTS[x.jour - 1].replace('.', ''), valeur: x.moyenneCentimes, vide: !x.n, fort: st.jourCher?.jour === x.jour })), format: court,
        repere: part > 0 ? { valeur: part, texte: `ta part : ${court(part)}` } : null, description: 'Dépense moyenne par jour de la semaine' }),
      st.jourCher ? h('p', { class: 'note' }, `Le plus cher : le ${JOURS_LONGS[st.jourCher.jour - 1]}, ${eur(st.jourCher.moyenneCentimes)} en moyenne. Le plus sage : le ${JOURS_LONGS[st.jourSage.jour - 1]}, ${eur(st.jourSage.moyenneCentimes)}.`) : null),
    panneau('À quoi ressemble une journée',
      barres({ valeurs: histo.map((x) => ({ ...x, fort: x === plusFrequent })), format: (n) => `${n} j`, description: `Nombre de jours par tranche de dépense : ${histo.map((x) => `${x.nom}, ${x.valeur} jours`).join(' ; ')}`, hauteur: 140, classe: 'barres-lisibles' }),
      h('p', { class: 'note' }, `Le cas le plus fréquent : une journée ${plusFrequent.phrase} (${plusFrequent.valeur} jour${plusFrequent.valeur > 1 ? 's' : ''} sur ${st.jours}).`)),
    st.categories.length ? panneau('Où ça part', h('div', { class: 'habitudes-cats' }, st.categories.map((c) => h('div', { class: 'habitudes-cat' },
      h('span', {}, nomCategorie(c.categorie)), h('b', {}, `${rond(c.montantCentimes)}`), h('small', {}, `${c.part} %`),
      barreRepere({ part: c.part / 100, etat: 'ok', description: `${nomCategorie(c.categorie)} : ${c.part} % des dépenses du quotidien` }))))) : null,
    p.joursRestants > 0 ? panneau('Fin de mois, à ce rythme',
      fourchette({ bas: p.basCentimes, attendu: p.attenduCentimes, haut: p.hautCentimes, format: rond, description: `Fin de mois probable : ${formatEuros(p.attenduCentimes)}, entre ${formatEuros(p.basCentimes)} et ${formatEuros(p.hautCentimes)}` }),
      h('p', { class: 'note' }, `Il reste ${eur(p.resteCentimes)} pour ${p.joursRestants} jours après aujourd’hui. À ${eur(p.rythmeCentimes)} par jour, tu finirais vers ${eur(p.attenduCentimes)}. Pour ne pas dépasser : ${eur(p.rythmeMaxCentimes)} par jour au plus. Chances de tenir : ${Math.round(p.probaTenir * 100)} %.`)) : null,
    panneau('Comment c’est calculé', h('p', { class: 'note' }, 'Chaque jour terminé compte, même à 0 €, sur 90 jours au plus. La médiane est le jour du milieu : elle ne bouge pas à cause d’un seul gros achat, contrairement à la moyenne. L’écart-type mesure à quel point tes jours se ressemblent. La tendance est la pente d’une droite tracée sur la moyenne glissante des 4 dernières semaines. La fourchette de fin de mois couvre 8 cas sur 10, en supposant que tes prochains jours ressemblent aux derniers.'))));
}
