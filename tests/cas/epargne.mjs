import { egal, vrai } from '../outils/assert.mjs';
import { tx } from '../outils/etat.mjs';
import { cagnotteEnAttente, arrondiTransaction, prochainVirementArrondis, soldePoche, epargneNettePoche, epargneNettePeriode, repartirVersement, proposerAllocation, recalculerPlan, simulerLivret } from '../../js/epargne.js';

const poches = () => [
  { id: 'c', type: 'coussin', cibleCentimes: 100000, priorite: 1, soldeInitialCentimes: 0, mouvements: [] },
  { id: 'v', type: 'projet', cibleCentimes: 250000, priorite: 2, partRepartition: 50, soldeInitialCentimes: 0, mouvements: [] },
  { id: 'r', type: 'remboursementAnticipe', cibleCentimes: 800000, priorite: 2, partRepartition: 50, soldeInitialCentimes: 0, mouvements: [] },
];

export default [
  { nom: 'arrondis : toutes les sorties, charges fixes comprises (ni virements internes, ni épargne, ni entrées)', fn: () => {
    const reg = { actif: true, depuis: '2026-01-01', inclureChargesFixes: false };
    const txs = [tx({ id: 'a', date: '2026-01-02', montant: 489 }), tx({ id: 'b', date: '2026-01-02', montant: 1200 }), tx({ id: 'c', date: '2026-01-03', montant: 1999, interne: true }),
      tx({ id: 'd', date: '2026-01-03', montant: 750, chargeFixeId: 'x' }), tx({ id: 'e', date: '2026-01-03', montant: 2252, epargne: true, typeEpargne: 'arrondiBanque' }), tx({ id: 'f', date: '2026-01-04', montant: 1001, sens: 'credit', categorie: 'salaire' })];
    const c = cagnotteEnAttente(txs, reg, []);
    egal(c.total, 11 + 50 + 50, '12,00 € déjà rond : 0,50 € ; charge fixe 7,50 € : 0,50 €'); egal(c.lignes.length, 3);
    egal(arrondiTransaction({ ...txs[0], arrondiDesactive: true }, reg), 0);
  } },
  { nom: 'arrondis : pas de double comptage avec l’arrondi bancaire ; une fois virés, ils sortent de la cagnotte', fn: () => {
    const reg = { actif: true, depuis: '2026-01-01' };
    const txs = [tx({ id: 'a', date: '2026-01-02', montant: 489, extra: { optionSystemEpargneCentimes: 11 } })];
    egal(cagnotteEnAttente(txs, reg, []).total, 11, 'l’option banque ne modifie pas l’arrondi de l’app');
    egal(cagnotteEnAttente(txs, reg, [{ transactionId: 'a', montantCentimes: 11, vireLe: '2026-01-08' }]).total, 0);
  } },
  { nom: 'arrondis : fréquences hebdomadaire (jeudi), quinzaine, mensuelle', fn: () => {
    egal(prochainVirementArrondis({ frequence: 'hebdomadaire', jourVirement: 4, premierVirement: '2026-11-12' }, '2026-11-05', null), '2026-11-12');
    egal(prochainVirementArrondis({ frequence: 'hebdomadaire', jourVirement: 4 }, '2026-11-13', '2026-11-12'), '2026-11-19');
    egal(prochainVirementArrondis({ frequence: 'quinzaine', jourVirement: 4 }, '2026-11-13', '2026-11-12'), '2026-11-26');
    egal(prochainVirementArrondis({ frequence: 'mensuelle', jourDuMois: 6 }, '2026-11-13', '2026-11-06'), '2026-12-06');
  } },
  { nom: 'poches : épargne nette = versements − reprises ; reprise visible', fn: () => {
    const p = { soldeInitialCentimes: 1000, mouvements: [{ date: '2026-10-05', montantCentimes: 60000, sens: 'versement' }, { date: '2026-10-07', montantCentimes: 10000, sens: 'reprise' }, { date: '2026-10-15', montantCentimes: 51456, sens: 'reprise' }] };
    egal(soldePoche(p), 1000 - 1456); egal(epargneNettePoche(p).nette, -1456);
    const txs = [tx({ date: '2026-10-05', montant: 60000, epargne: true }), tx({ date: '2026-10-15', montant: 2252, epargne: true, typeEpargne: 'arrondiBanque' }),
      tx({ date: '2026-10-07', montant: 10000, sens: 'credit', epargne: true }), tx({ date: '2026-10-15', montant: 53456, sens: 'credit', epargne: true })];
    const n = epargneNettePeriode(txs, '2026-10-01', '2026-10-31');
    egal(n.versements, 62252); egal(n.reprises, 63456); egal(n.nette, -1204); egal(n.nbReprises, 2);
  } },
  { nom: 'poches : ordre de remplissage (Coussin jusqu’à sa cible, puis 50/50 réglable)', fn: () => {
    const p = poches();
    egal(JSON.stringify(repartirVersement(30000, p)), JSON.stringify([{ pocheId: 'c', montantCentimes: 30000 }]));
    const r = repartirVersement(50000, p, { c: 74000, v: 20000, r: 10000 });
    egal(r.find((x) => x.pocheId === 'c').montantCentimes, 26000); egal(r.find((x) => x.pocheId === 'v').montantCentimes, 12000); egal(r.find((x) => x.pocheId === 'r').montantCentimes, 12000);
    const p2 = p.map((x) => (x.id === 'v' ? { ...x, partRepartition: 100 } : x.id === 'r' ? { ...x, partRepartition: 0 } : x));
    egal(repartirVersement(50000, p2, { c: 100000, v: 0, r: 0 }).find((x) => x.pocheId === 'v').montantCentimes, 50000);
  } },
  { nom: 'poches : Coussin avec une part chiffrée, versement partagé (25 / 15 / 60) et surplus reversé', fn: () => {
    const p = poches().map((x) => ({ ...x, partRepartition: x.id === 'c' ? 25 : x.id === 'v' ? 15 : 60 }));
    const r = repartirVersement(10000, p);
    egal(r.find((x) => x.pocheId === 'c').montantCentimes, 2500); egal(r.find((x) => x.pocheId === 'v').montantCentimes, 1500); egal(r.find((x) => x.pocheId === 'r').montantCentimes, 6000);
    // Coussin presque plein : il ne prend que sa place, le reste repart sur les autres poches
    const r2 = repartirVersement(10000, p, { c: 99000, v: 0, r: 0 });
    egal(r2.find((x) => x.pocheId === 'c').montantCentimes, 1000);
    egal(r2.reduce((t, x) => t + x.montantCentimes, 0), 10000);
  } },
  { nom: 'plan mensuel : l’épargne passe après les obligations, le maximum possible, sans plafond à 500 €', fn: () => {
    const R = 151234; const C = 35111;
    const m1 = proposerAllocation({ revenusCentimes: R, chargesFixesCentimes: C, dettesCentimes: 65500 });
    egal(m1.mode, 'maximum'); egal(m1.disponibleCentimes, 50623); egal(m1.epargneTotaleCentimes, 12000); egal(m1.arrondisCentimes, 2000); egal(m1.epargneCentimes, 10000); egal(m1.vieCouranteCentimes, 37500); egal(m1.margeCentimes, 1123);
    const m6 = proposerAllocation({ revenusCentimes: 160000, chargesFixesCentimes: 50000, dettesCentimes: 0 });
    egal(m6.epargneTotaleCentimes, 71000, 'pas de plafond : tout ce qui dépasse les obligations'); egal(m6.margeCentimes, 160000 - 50000 - 71000 - 37500);
    const m7 = proposerAllocation({ revenusCentimes: 160000, chargesFixesCentimes: 50000, dettesCentimes: 0, besoinsVitauxCentimes: 60000 });
    egal(m7.vieCouranteCentimes, 60000, 'les besoins vitaux mesurés passent avant'); egal(m7.epargneTotaleCentimes, 49000); egal(m7.margeCentimes, 1000);
    const m8 = proposerAllocation({ revenusCentimes: 100000, chargesFixesCentimes: 62000, dettesCentimes: 0 });
    egal(m8.mode, 'minimum'); egal(m8.epargneTotaleCentimes, 0); egal(m8.vieCouranteCentimes, 37500); egal(m8.margeCentimes, 500);
    const m5 = proposerAllocation({ revenusCentimes: 100000, chargesFixesCentimes: 70000, dettesCentimes: 0 });
    egal(m5.mode, 'survie'); egal(m5.epargneTotaleCentimes, 0); egal(m5.margeCentimes, 0);
    for (const m of [m1, m5, m6, m7, m8]) vrai(m.margeCentimes >= 0, 'jamais de découvert projeté');
  } },
  { nom: 'plan mensuel : recalcul après saisie des revenus exacts (vie courante puis épargne, jamais négatif)', fn: () => {
    const plan = { mois: '2026-11', allocationsPoches: [{ pocheId: 'c', montantCentimes: 10000 }], vieCouranteCentimes: 37500 };
    const r = recalculerPlan(plan, { revenusCentimes: 150000, chargesFixesCentimes: 36190, dettesCentimes: 70900 });
    egal(r.disponibleCentimes, 42910); egal(r.margeCentimes, 42910 - 10000 - 37500 >= 0 ? 42910 - 10000 - 37500 : 0);
    vrai(r.margeCentimes >= 0); egal(r.allocationsPoches[0].montantCentimes + r.vieCouranteCentimes + r.margeCentimes, 42910);
    const r2 = recalculerPlan(plan, { revenusCentimes: 130000, chargesFixesCentimes: 36190, dettesCentimes: 70900 });
    vrai(r2.margeCentimes >= 0); egal(r2.allocationsPoches[0].montantCentimes + r2.vieCouranteCentimes, 22910);
  } },
  { nom: 'simulateur Livret A : intérêts par quinzaine, capitalisés au 31 décembre', fn: () => {
    egal(simulerLivret({ capitalInitialCentimes: 100000, versementMensuelCentimes: 0, tauxPourcent: 1.7, moisDepart: '2027-01', nbMois: 12 }).lignes[0].interetsCentimes, 1700);
    const s = simulerLivret({ capitalInitialCentimes: 0, versementMensuelCentimes: 10000, jourVersement: 6, tauxPourcent: 2.4, moisDepart: '2027-01', nbMois: 12 });
    egal(s.lignes[0].versesCentimes, 120000); vrai(s.lignes[0].interetsCentimes > 0 && s.lignes[0].interetsCentimes < 2880);
  } },
];
