// s-tresorerie.js (v100) — Stratégie → Trésorerie : le compte courant jour par jour jusqu'au salaire.

import { h, estMasque } from '../../ui/dom.js';
import { etat } from '../../store.js';
import { aujourdhui, formatDateCourte } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { courbes } from '../ui/graphes.js';
import { entete, panneau, kpi } from '../ui/blocs.js';
import { tresorerie } from '../strategie/tresorerie.js';

const eur = (c) => (estMasque() ? '•••,•• €' : formatEuros(c));
const rond = (c) => (estMasque() ? '••• €' : formatEuros(c, { sansCentimes: true }));

export function rendre(vue) {
  const auj = aujourdhui();
  const t = tresorerie(etat, auj);
  if (!t) { vue.replaceChildren(h('div', { class: 'st' }, entete('Trésorerie', 'Aucun compte courant n’est enregistré.'))); return; }
  const memeRythme = Math.abs(t.partDuJourCentimes - t.rythmeReelCentimes) < 50;
  const series = [{ nom: 'En dépensant ta part du jour', classe: 'serie-1', valeurs: t.points.map((p) => p.planCentimes) }];
  if (!memeRythme) series.push({ nom: 'À ton rythme des derniers jours', classe: 'serie-2', valeurs: t.points.map((p) => p.rythmeCentimes) });
  const bas = Math.min(t.plusBas.soldeCentimes, t.plusBasRythme.soldeCentimes);
  vue.replaceChildren(h('div', { class: 'st' },
    entete('Trésorerie', `${t.compte.nom}, d’ici le ${formatDateCourte(t.finLe)}${t.salaireLe ? ` (salaire attendu le ${formatDateCourte(t.salaireLe)})` : ''}.`),
    h('div', { class: 'kpis' },
      kpi('AUJOURD’HUI', rond(t.soldeActuelCentimes)),
      kpi('AU PLUS BAS', rond(bas), `le ${formatDateCourte(t.plusBasRythme.soldeCentimes < t.plusBas.soldeCentimes ? t.plusBasRythme.date : t.plusBas.date)}`, bas < 0 ? 'rouge' : bas < 5000 ? 'or' : 'vert'),
      kpi('PRÉLÈVEMENTS', rond(t.totalPrelevementsCentimes), `${t.evenements.length} opération${t.evenements.length > 1 ? 's' : ''}`),
      kpi('LA VEILLE DU SALAIRE', rond(t.finPlanCentimes), memeRythme ? 'avec ta part du jour' : `${rond(t.finRythmeCentimes)} à ton rythme`)),
    panneau('Jour par jour',
      courbes({ series, etiquettes: t.points.map((p) => formatDateCourte(p.date)), format: rond, formatAxe: (v) => `${Math.round(v / 100)}`, titre: 'Solde du compte, en euros' }),
      h('p', { class: 'note' }, `Ta part du jour : ${eur(t.partDuJourCentimes)}. Ton rythme réel ces derniers jours : ${eur(t.rythmeReelCentimes)} par jour.${t.risque === 'decouvert' ? ' À ce rythme, le compte passe sous zéro : regarde les prélèvements ci-dessous.' : ''}`)),
    panneau('Ce qui part d’ici le salaire', t.evenements.length ? h('div', { class: 'evenements' }, t.evenements.map((e) => h('div', { class: 'evenement' },
      h('span', {}, formatDateCourte(e.date)), h('span', {}, e.libelle), h('strong', {}, eur(Math.abs(e.montantCentimes)))))) : h('p', { class: 'note' }, 'Plus aucun prélèvement prévu avant le salaire.')),
    h('p', { class: 'note' }, 'Le solde part de ce que Budget calcule aujourd’hui. Les virements vers l’épargne et les envies ne sont pas retirés ici : ils restent sur le compte tant que tu ne les as pas faits.')));
}
