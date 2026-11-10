// s-coach.js (v100) — Stratégie → Brief du jour : les priorités classées, les six voyants expliqués,
// les économies possibles chiffrées, et le raisonnement du mois (constat, pourquoi, donc).

import { h, icone, estMasque } from '../../ui/dom.js';
import { etat } from '../../store.js';
import { aller } from '../../router.js';
import { aujourdhui } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { entete, panneau, kpi } from '../ui/blocs.js';
import { briefDuJour } from '../strategie/brief.js';
import { creditPrincipal } from '../strategie/pret.js';
import { lignePriorite } from './cockpit.js';

const eur = (c) => (estMasque() ? '•••,•• €' : formatEuros(c));
const rond = (c) => (estMasque() ? '••• €' : formatEuros(c, { sansCentimes: true }));
const ACTIONS = { supprimer: 'Supprimer', eviter: 'Éviter', remplacer: 'Remplacer', reduire: 'Réduire', garder: 'Garder' };
const ETATS = { ok: 'OK', attention: 'À SURVEILLER', critique: 'ALERTE', eteint: 'ÉTEINT' };

export function rendre(vue) {
  const auj = aujourdhui();
  const b = briefDuJour(etat, auj);
  const credit = creditPrincipal(etat);
  const mensualite = credit ? (credit.mensualiteCentimes || 0) + (credit.assuranceMensuelleCentimes || 0) : 0;
  const eco = b.economies;
  vue.replaceChildren(h('div', { class: 'st' }, ...[
    entete('Brief du jour', b.phrase || b.titre),
    panneau('Tes priorités', b.priorites.length ? h('div', { class: 'priorites' }, b.priorites.map((p) => lignePriorite(p))) : h('p', { class: 'note' }, 'Rien d’urgent aujourd’hui.')),
    panneau('Les voyants', h('div', { class: 'priorites' }, b.voyants.map((v) => h('button', { type: 'button', class: `priorite priorite-${v.etat === 'ok' ? 'bien' : v.etat === 'eteint' ? 'info' : v.etat}`, onclick: () => { if (v.route) aller(v.route); } },
      h('span', { class: 'priorite-point', 'aria-hidden': 'true' }), h('span', {}, h('span', { class: 'priorite-etat' }, ETATS[v.etat]), h('strong', {}, v.nom), h('small', {}, v.texte)), v.route ? icone('suivant') : h('span', {}))))),
    eco.cartes.length ? panneau('Économies possibles',
      h('div', { class: 'kpis' },
        kpi('PAR MOIS', rond(eco.mensuelCentimes), 'si tu suis toutes les pistes', 'vert'),
        kpi('PAR AN', rond(eco.annuelCentimes), mensualite ? `= ${Math.floor(eco.annuelCentimes / mensualite)} mensualités du prêt` : null, 'vert')),
      h('div', { class: 'plans' }, eco.cartes.map((c) => h('div', { class: 'eco' },
        h('span', { class: 'eco-action' }, ACTIONS[c.action] || c.action),
        h('div', { class: 'eco-tete' }, h('strong', {}, c.marchand), h('b', {}, `${eur(c.economieMensuelleCentimes)} / mois`)),
        h('small', {}, c.constat), h('small', {}, c.consigne)))),
      h('p', { class: 'note' }, 'Calculé sur tes trois derniers mois, marchand par marchand. Ce sont des pistes : toi seul sais ce qui compte pour toi.')) : null,
    panneau('Abonnements',
      h('div', { class: 'kpis' }, kpi('PAR MOIS', rond(b.abonnements.mensuelCentimes), `${b.abonnements.nb} abonnement${b.abonnements.nb > 1 ? 's' : ''}`), kpi('PAR AN', rond(b.abonnements.annuelCentimes), b.abonnements.aLimiterAnnuelCentimes ? `dont ${rond(b.abonnements.aLimiterAnnuelCentimes)} à revoir` : null)),
      h('button', { type: 'button', class: 'btn btn-secondaire', onclick: () => aller('abonnements') }, 'Voir chaque abonnement')),
    b.constats.length ? panneau('Le raisonnement du mois', ...b.constats.map((p) => h('details', { class: 'details-discret' }, h('summary', {}, p.titre),
      p.constat ? h('p', { class: 'note' }, p.constat) : null, p.pourquoi ? h('p', { class: 'note' }, p.pourquoi) : null, p.donc ? h('p', {}, p.donc) : null))) : null,
    h('p', { class: 'note' }, 'Tout est calculé sur ton téléphone, par règles, sans intelligence artificielle ni envoi de données.'),
  ].filter(Boolean)));
}
