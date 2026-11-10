// s-projection.js (v100) — Stratégie → Projection : les prochains mois, et des scénarios « et si » comparés au plan de base.

import { h, estMasque } from '../../ui/dom.js';
import { bouton } from '../../ui/composants.js';
import { etat } from '../../store.js';
import { aujourdhui, formatMois, ajouterMois } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { courbes } from '../ui/graphes.js';
import { entete, panneau, kpi, reglette, pucesChoix, parImage } from '../ui/blocs.js';
import { projeter, comparer } from '../strategie/projection.js';

const rond = (c) => (estMasque() ? '••• €' : formatEuros(c, { sansCentimes: true }));
const eur = (c) => (estMasque() ? '•••,•• €' : formatEuros(c));
const entier = (c) => (estMasque() ? '••• €' : `${Math.round(c / 100).toLocaleString('fr-FR')} €`);
const ml = (m) => (m ? formatMois(m, true) : null);
const signe = (c, f = rond) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${f(Math.abs(c))}`;

export function rendre(vue) {
  const auj = aujourdhui();
  let nbMois = 12;
  let base = projeter(etat, auj, { nbMois });
  const plancherJour = Math.round(((etat.profil?.parametresPlan?.vieMinCentimes) || 37500) / 30 / 50) * 50;
  const defaut = () => ({ vieParJour: plancherJour, taux: Math.round(base.tauxNonDepense * 100), economie: 0, salaire: 0, depense: 0, depenseMois: ajouterMois(base.lignes[0].mois, 2), difficile: 0, difficileMois: ajouterMois(base.lignes[0].mois, 3) });
  let hyp = defaut();
  let vueTable = 'epargne';
  const resultat = h('div', { class: 'st' });
  const sommaire = h('div', { class: 'st' });

  const scenario = () => {
    const sc = {};
    if (hyp.vieParJour !== plancherJour) sc.vieParJourCentimes = hyp.vieParJour;
    if (hyp.taux !== Math.round(base.tauxNonDepense * 100)) sc.tauxNonDepense = hyp.taux / 100;
    if (hyp.economie) sc.economieMensuelleCentimes = hyp.economie;
    if (hyp.salaire) { sc.salaireDeltaPourcent = hyp.salaire; sc.salaireDepuisMois = ajouterMois(base.lignes[0].mois, 1); }
    if (hyp.depense) sc.depenses = [{ mois: hyp.depenseMois, montantCentimes: hyp.depense, libelle: 'Grosse dépense' }];
    if (hyp.difficile) sc.moisDifficile = { mois: hyp.difficileMois, baissePourcent: hyp.difficile };
    return sc;
  };

  const dessiner = () => {
    const sc = scenario();
    const modifie = Object.keys(sc).length > 0;
    const p = modifie ? projeter(etat, auj, { nbMois, scenario: sc }) : base;
    const L = p.lignes;
    const jl = (type) => p.jalons.find((x) => x.type === type);
    const pret = L.some((l) => l.capitalPretCentimes > 0);
    const cibleSecu = (etat.poches || []).find((x) => x.actif !== false && x.type === 'coussin')?.cibleCentimes || 0;
    const series = [];
    if (pret) series.push({ nom: 'Prêt restant', classe: 'serie-1', valeurs: L.map((l) => l.capitalPretCentimes) });
    series.push({ nom: 'Sécurité', classe: 'serie-4', valeurs: L.map((l) => l.soldeSecuCentimes) });
    const c = modifie ? comparer(base, p) : null;
    const ecart = (libelle, valeur, mieux, texte) => h('div', { class: `ecart ${valeur === 0 || valeur === null ? '' : mieux ? 'mieux' : 'pire'}` }, h('small', {}, libelle), h('strong', {}, texte));
    const ecartMois = (x) => (x.scenario === x.base ? 'pareil' : x.ecartMois === null ? (x.scenario ? `en ${ml(x.scenario)}` : 'hors période') : `${x.ecartMois > 0 ? '+' : '−'}${Math.abs(x.ecartMois)} mois`);
    sommaire.replaceChildren(...[
      h('div', { class: 'kpis' },
        pret ? kpi('PRÊT SOLDÉ', jl('pretSolde') ? ml(jl('pretSolde').mois) : `après ${ml(L[L.length - 1].mois)}`, jl('pretSolde') ? null : `reste ${rond(p.resume.capitalPretCentimes)}`, jl('pretSolde') ? 'or' : '') : null,
        kpi('SÉCURITÉ PLEINE', jl('coussin') ? ml(jl('coussin').mois) : cibleSecu && L[0].soldeSecuCentimes >= cibleSecu ? 'déjà' : `après ${ml(L[L.length - 1].mois)}`, `${rond(p.resume.soldeSecuCentimes)} en ${ml(L[L.length - 1].mois)}`, jl('coussin') ? 'vert' : ''),
        kpi('PART DU JOUR', `${eur(p.resume.partMinCentimes)}`, p.resume.partMinCentimes === p.resume.partMaxCentimes ? 'tous les mois' : `au plus bas ; jusqu’à ${eur(p.resume.partMaxCentimes)}`, p.resume.moisSurvie ? 'rouge' : ''),
        kpi('MIS DE CÔTÉ', rond(L.reduce((t, l) => t + l.versSecuCentimes + l.versPretCentimes + l.versEnvieCentimes, 0)), `en ${L.length} mois : sécurité, prêt et envies`)),
      c ? panneau('Par rapport au plan de base',
        h('div', { class: 'ecarts' },
          pret ? ecart('PRÊT SOLDÉ', c.pretSolde.ecartMois ?? (c.pretSolde.scenario !== c.pretSolde.base ? 1 : 0), (c.pretSolde.ecartMois ?? 0) < 0 || (!c.pretSolde.base && !!c.pretSolde.scenario), ecartMois(c.pretSolde)) : null,
          ecart('SÉCURITÉ PLEINE', c.coussin.ecartMois ?? (c.coussin.scenario !== c.coussin.base ? 1 : 0), (c.coussin.ecartMois ?? 0) < 0 || (!c.coussin.base && !!c.coussin.scenario), ecartMois(c.coussin)),
          ecart('ÉPARGNE À LA FIN', c.epargneFinCentimes - c.capitalPretCentimes, c.epargneFinCentimes - c.capitalPretCentimes > 0, signe(c.epargneFinCentimes - c.capitalPretCentimes)),
          ecart('PART DU JOUR AU PLUS BAS', c.partMinCentimes, c.partMinCentimes > 0, signe(c.partMinCentimes, eur))),
        c.moisSurvie > 0 ? h('p', { class: 'note' }, `${p.resume.moisSurvie} mois passeraient sous ton plancher de vie courante.`) : null) : null,
    ].filter(Boolean));
    resultat.replaceChildren(...[
      panneau('La trajectoire',
        courbes({ series, etiquettes: L.map((l) => ml(l.mois)), format: rond, formatAxe: (v) => `${Math.round(v / 100)}`, titre: 'Prêt restant et épargne sécurité, en euros' }),
        courbes({ series: [{ nom: 'Part du jour', classe: 'serie-3', valeurs: L.map((l) => l.partDuJourCentimes) }], etiquettes: L.map((l) => ml(l.mois)), format: eur, formatAxe: (v) => `${(v / 100).toFixed(0)}`, titre: 'Part du jour, en euros', hauteur: 150 })),
      p.jalons.length ? panneau('Les étapes', h('ol', { class: 'jalons' }, p.jalons.map((x) => h('li', { class: `jalon jalon-${x.type}` }, h('span', { class: 'jalon-mois' }, ml(x.mois)),
        h('span', { class: 'jalon-titre' }, x.titre, x.type === 'pretDemarre' ? h('small', {}, `${eur(x.montantCentimes)} par mois, pris sur l’épargne du mois`) : null))))) : null,
      panneau('Mois par mois',
        pucesChoix([['epargne', 'Épargne et prêt'], ['budget', 'Budget du mois']], vueTable, (v) => { vueTable = v; dessiner(); }, 'Colonnes du tableau'),
        h('div', { class: 'defilement-horizontal' }, h('table', { class: 'tableau-mois' },
          h('thead', {}, h('tr', {}, (vueTable === 'budget' ? ['Mois', 'Revenus', 'Charges', 'Crédits', 'Vie'] : ['Mois', 'Mis de côté', 'Sécurité', 'Prêt restant']).map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, L.map((l) => h('tr', { class: l.mode === 'survie' ? 'survie' : '' },
            h('th', { scope: 'row' }, ml(l.mois)),
            ...(vueTable === 'budget'
              ? [l.revenusCentimes, l.chargesCentimes, l.mensualitePretCentimes + l.autresDettesCentimes, l.vieCentimes]
              : [l.versSecuCentimes + l.versPretCentimes + l.versEnvieCentimes, l.soldeSecuCentimes, l.capitalPretCentimes]).map((c) => h('td', {}, entier(c)))))))),
          vueTable === 'budget' ? h('p', { class: 'note' }, '« Crédits » : la mensualité du prêt et tes autres remboursements. « Vie » : ce que tu dépenses au quotidien.') : h('p', { class: 'note' }, '« Mis de côté » : ce qui part ce mois-là vers la sécurité, le prêt et tes envies.')),
    ].filter(Boolean));
  };
  const maj = parImage(dessiner);

  const moisOptions = base.lignes.slice(1, 9).map((l) => [l.mois, ml(l.mois)]);
  const hypotheses = () => panneau('Et si…',
    reglette({ libelle: 'Je vis avec, par jour', min: 800, max: 3000, pas: 50, valeur: hyp.vieParJour, format: (c) => `${(c / 100).toFixed(2).replace('.', ',')} €`, onChange: (x) => { hyp.vieParJour = x; maj(); }, note: `Ton plancher est ${(plancherJour / 100).toFixed(2).replace('.', ',')} € ; ta moyenne des 30 derniers jours : ${eur(base.rythmes.depenseMoyenneJourCentimes)}. Plus tu vis large, moins il reste pour l’épargne.` }),
    reglette({ libelle: 'Part de mon budget du jour que je ne dépense pas', min: 0, max: 100, pas: 5, valeur: hyp.taux, format: (x) => `${x} %`, onChange: (x) => { hyp.taux = x; maj(); }, note: base.rythmes.fiable ? `Mesuré sur ${base.rythmes.joursObserves} jours ce mois-ci.` : 'Pas encore assez de jours mesurés : 25 % par défaut.' }),
    reglette({ libelle: 'Charges en moins chaque mois', min: 0, max: 20000, pas: 500, valeur: hyp.economie, format: (c) => `${Math.round(c / 100)} €`, onChange: (x) => { hyp.economie = x; maj(); }, note: 'Un abonnement résilié, une assurance renégociée…' }),
    reglette({ libelle: 'Salaire, à partir du mois prochain', min: -20, max: 20, pas: 1, valeur: hyp.salaire, format: (x) => `${x > 0 ? '+' : ''}${x} %`, onChange: (x) => { hyp.salaire = x; maj(); } }),
    reglette({ libelle: 'Une grosse dépense', min: 0, max: 200000, pas: 5000, valeur: hyp.depense, format: (c) => `${Math.round(c / 100)} €`, onChange: (x) => { hyp.depense = x; maj(); } }),
    pucesChoix(moisOptions, hyp.depenseMois, (m) => { hyp.depenseMois = m; maj(); }, 'Mois de la grosse dépense'),
    reglette({ libelle: 'Un mois difficile : revenus en baisse de', min: 0, max: 80, pas: 5, valeur: hyp.difficile, format: (x) => `${x} %`, onChange: (x) => { hyp.difficile = x; maj(); } }),
    pucesChoix(moisOptions, hyp.difficileMois, (m) => { hyp.difficileMois = m; maj(); }, 'Mois difficile'),
    bouton('Revenir au plan de base', () => { hyp = defaut(); zoneHyp.replaceChildren(hypotheses()); dessiner(); }, { classe: 'btn-secondaire btn-petit' }));
  const zoneHyp = h('div', {}, hypotheses());

  dessiner();
  vue.replaceChildren(h('div', { class: 'st' },
    entete('Projection', 'Tes prochains mois si tu continues comme aujourd’hui. Bouge une réglette : tout se recalcule.'),
    pucesChoix([[12, '12 mois'], [24, '24 mois']], nbMois, (n) => { nbMois = n; base = projeter(etat, auj, { nbMois }); dessiner(); }, 'Durée de la projection'),
    sommaire, zoneHyp, resultat,
    h('p', { class: 'note' }, 'Une projection répète tes revenus, tes charges et tes habitudes d’aujourd’hui : elle montre une direction, pas une promesse. Les remboursements à tes proches et les crédits s’arrêtent aux dates enregistrées.')));
}
