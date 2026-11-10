// s-pret.js (v100) — Stratégie → Plan du prêt : où j'en suis, ce que coûte de ne rien faire, les plans comparés,
// ce que rapporte 100 € remboursés aujourd'hui, et « durée ou mensualité » avant le début des mensualités.

import { h, estMasque } from '../../ui/dom.js';
import { etat } from '../../store.js';
import { soldePoche } from '../../epargne.js';
import { aVirerEpargne } from '../../virements.js';
import { aujourdhui, formatDate, formatMois } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { courbes } from '../ui/graphes.js';
import { entete, panneau, kpi, reglette, parImage } from '../ui/blocs.js';
import { creditPrincipal, planPret, dureeOuMensualite } from '../strategie/pret.js';
import { projeter } from '../strategie/projection.js';

const eur = (c) => (estMasque() ? '•••,•• €' : formatEuros(c));
const rond = (c) => (estMasque() ? '••• €' : formatEuros(c, { sansCentimes: true }));
const moisDe = (iso) => formatMois(iso.slice(0, 7), true);

export function rendre(vue) {
  const auj = aujourdhui();
  const credit = creditPrincipal(etat);
  if (!credit) {
    vue.replaceChildren(h('div', { class: 'st' }, entete('Plan du prêt', 'Aucun prêt avec taux et mensualité n’est enregistré. Ajoute-le dans Réglages, Crédits et prêts.')));
    return;
  }
  const poches = (etat.poches || []).filter((p) => p.actif !== false);
  const pochePret = poches.find((p) => p.type === 'remboursementAnticipe');
  const pocheSecu = poches.find((p) => p.type === 'coussin');
  const v = aVirerEpargne(etat, auj);
  const attente = (p) => (p ? soldePoche(p) + (v.parPoche.find((x) => x.pocheId === p.id)?.montantCentimes || 0) : 0);
  // Ce que l'épargne prêt reçoit par mois : moyenne des 6 prochains mois de la projection
  let versementDefaut = 0;
  try { const L = projeter(etat, auj, { nbMois: 7 }).lignes.filter((l) => !l.enCours); versementDefaut = Math.round(L.reduce((s, l) => s + l.versPretCentimes, 0) / Math.max(1, L.length) / 1000) * 1000; } catch { versementDefaut = 0; }
  let versement = versementDefaut;
  let montantChoix = 100000;
  const zonePlans = h('div', {});
  const zoneChoix = h('div', {});

  const dessinerPlans = () => {
    const p = planPret(credit, auj, { pocheCentimes: attente(pochePret), versementMensuelCentimes: versement, palierCentimes: pochePret?.palierCentimes || 50000,
      tauxEpargnePourcent: etat.profil?.epargneSansInterets ? 0 : (etat.profil?.tauxEpargnePourcent || 0), coussinCentimes: attente(pocheSecu), coussinCibleCentimes: pocheSecu?.cibleCentimes || 0 });
    const meilleur = p.plans.find((x) => x.id === p.meilleurId);
    const base = p.base;
    const n = base.lignes.length;
    const serie = (plan) => base.lignes.map((_, i) => (plan.lignes[i] ? plan.lignes[i].capitalFinCentimes : 0));
    const series = [{ nom: 'Sans rien faire', classe: 'serie-1', valeurs: serie(base) }];
    if (meilleur.id !== 'base') series.push({ nom: meilleur.titre, classe: 'serie-2', valeurs: serie(meilleur) });
    zonePlans.replaceChildren(
      h('div', { class: 'plans' }, p.plans.map((x) => h('div', { class: `plan ${x.id === p.meilleurId && x.id !== 'base' ? 'meilleur' : ''}` },
        h('div', { class: 'plan-tete' }, h('strong', {}, x.titre), x.id === p.meilleurId && x.id !== 'base' ? h('span', { class: 'plan-badge' }, 'le moins cher') : null),
        h('p', { class: 'note' }, x.detail),
        h('div', { class: 'plan-chiffres' },
          h('p', {}, h('small', {}, 'FINI EN'), h('b', {}, moisDe(x.finLe))),
          h('p', {}, h('small', {}, 'COÛT RESTANT'), h('b', {}, rond(x.coutCentimes))),
          h('p', {}, h('small', {}, 'GAIN'), h('b', { class: x.economieCentimes > 0 ? 'gain' : '' }, x.id === 'base' ? '—' : rond(x.economieCentimes)), x.moisGagnes ? h('em', {}, `${x.moisGagnes} mois plus tôt`) : null))))),
      n > 1 ? courbes({ series, etiquettes: base.lignes.map((l) => moisDe(l.date)), format: rond, formatAxe: (c) => `${Math.round(c / 100)}`, titre: 'Capital restant dû, en euros', reperes: p.enDiffere ? [{ index: base.lignes.findIndex((l) => !l.differe), texte: 'début des mensualités' }] : [] }) : null);
    return p;
  };

  const horsAssurance = () => (p.assuranceCentimes ? h('em', {}, 'hors assurance') : null);
  const dessinerChoix = () => {
    const d = dureeOuMensualite(credit, auj, montantChoix);
    zoneChoix.replaceChildren(h('div', { class: 'plans' },
      h('div', { class: 'plan' }, h('div', { class: 'plan-tete' }, h('strong', {}, 'Garder la mensualité, finir plus tôt')),
        h('div', { class: 'plan-chiffres' },
          h('p', {}, h('small', {}, 'MENSUALITÉ'), h('b', {}, eur(d.duree.mensualiteCentimes)), horsAssurance()),
          h('p', {}, h('small', {}, 'FINI EN'), h('b', {}, moisDe(d.duree.finLe)), d.duree.moisGagnes ? h('em', {}, `${d.duree.moisGagnes} mois plus tôt`) : null),
          h('p', {}, h('small', {}, 'INTÉRÊTS EN MOINS'), h('b', { class: 'gain' }, eur(d.duree.economieCentimes))))),
      d.mensualite ? h('div', { class: 'plan' }, h('div', { class: 'plan-tete' }, h('strong', {}, 'Garder la durée, payer moins chaque mois')),
        h('div', { class: 'plan-chiffres' },
          h('p', {}, h('small', {}, 'MENSUALITÉ'), h('b', { class: 'gain' }, `${eur(d.mensualite.mensualiteCentimes)}`), horsAssurance()),
          h('p', {}, h('small', {}, 'EN MOINS PAR MOIS'), h('b', { class: 'gain' }, eur(d.mensualite.baisseMensuelleCentimes))),
          h('p', {}, h('small', {}, 'INTÉRÊTS EN MOINS'), h('b', {}, eur(d.mensualite.economieCentimes)))),
        h('p', { class: 'note' }, 'Ce recalcul n’est pas automatique : il faut le demander à ta banque au moment du remboursement.')) : null));
  };

  const majPlans = parImage(() => dessinerPlans());
  const p = dessinerPlans();
  dessinerChoix();
  const cout100 = p.gain100.economieCentimes;
  vue.replaceChildren(h('div', { class: 'st' },
    entete('Plan du prêt', `${credit.libelle || 'Ton prêt'} : ${String(credit.tauxPourcent).replace('.', ',')} % par an.`),
    h('div', { class: 'kpis' },
      kpi('CAPITAL RESTANT', rond(p.capitalCentimes), `sur ${rond(credit.capitalCentimes)}`),
      kpi('COÛT RESTANT', rond(p.base.coutCentimes), 'intérêts et assurance, si tu ne fais rien'),
      kpi('FIN PRÉVUE', moisDe(p.base.finLe), `${p.base.nbEcheances} échéances`),
      kpi(p.enDiffere ? 'MENSUALITÉ DÈS LE' : 'MENSUALITÉ', p.enDiffere ? formatDate(p.debutAmortissement).slice(0, 5) + '/' + p.debutAmortissement.slice(2, 4) : eur(p.mensualiteCentimes + p.assuranceCentimes), p.enDiffere ? `${eur(p.mensualiteCentimes + p.assuranceCentimes)} par mois ensuite` : 'assurance comprise')),
    panneau(p.conseil.titre, ...p.conseil.raisons.map((x) => h('p', { class: 'note' }, x))),
    panneau('Comparer les plans',
      reglette({ libelle: 'L’épargne prêt reçoit par mois', min: 0, max: 100000, pas: 1000, valeur: Math.min(100000, versement), format: (c) => `${Math.round(c / 100)} €`,
        onChange: (x) => { versement = x; majPlans(); }, note: `D’après ta projection : environ ${Math.round(versementDefaut / 100)} € par mois. Glisse pour voir l’effet d’un autre rythme.` }),
      zonePlans),
    panneau('100 € remboursés aujourd’hui',
      h('p', {}, cout100 > 0 ? `font économiser ${eur(cout100)} d’intérêts d’ici la fin du prêt.` : 'ne changent presque rien au coût : le prêt est déjà presque fini.'),
      h('p', { class: 'note' }, `Aujourd’hui le prêt te coûte ${eur(p.interetsMoisCentimes)} d’intérêts par mois, soit ${eur(p.conseil.coutPar1000Centimes)} par mois pour 1 000 € non remboursés.`)),
    p.enDiffere ? panneau('Rembourser avant le début des mensualités',
      h('p', { class: 'note' }, `Tes mensualités de ${eur(p.mensualiteCentimes + p.assuranceCentimes)} commencent le ${formatDate(p.debutAmortissement)}. Un remboursement fait avant peut raccourcir le prêt, ou alléger chaque mensualité.`),
      reglette({ libelle: 'Je rembourse en avance', min: 10000, max: Math.max(10000, Math.floor(p.capitalCentimes / 10000) * 10000), pas: 10000, valeur: montantChoix, format: (c) => `${Math.round(c / 100)} €`, onChange: (x) => { montantChoix = x; dessinerChoix(); } }),
      zoneChoix) : null,
    h('p', { class: 'note' }, 'Simulation mois par mois avec le taux, la mensualité et l’assurance enregistrés. Les règles exactes d’un remboursement anticipé (frais, recalcul) sont celles de ton contrat : vérifie-les auprès de ta banque avant de décider.')));
}
