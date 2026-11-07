// envies.mjs — « Mes envies » : part des restes du jour, super flammes, achat en avance (exception) et reprise.
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { fluxEnvies, retenueAvance, estimationDuJour, journeesPourFinir, estSuperFlamme } from '../../js/envies.js';
import { aVirerEpargne } from '../../js/virements.js';
import { depensesVariables } from '../../js/calculs.js';

const revenus = { mois: '2026-11', salaireCentimes: 150000, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' };
const reste = (date, montant) => ({ id: `reste-${date}`, date, source: 'resteJour', montantCentimes: montant, libelle: 'Reste du jour' });
const etat = ({ transactions = [], privations = [], liste = [] } = {}) => {
  const e = etatBase({ revenusMensuels: [revenus], transactions, privations });
  e.profil.repasAuto = { actif: false };
  e.profil.envies = { depuis: '2026-11-05', liste };
  e.meta = {};
  return e;
};
const gta = (o = {}) => ({ id: 'gta', nom: 'GTA 6', type: 'jeu', montantCentimes: 8000, creeLe: '2026-11-07', ...o });

export default [
  { nom: 'envies : 50 % du reste une journée sans dépense, 20 % sinon ; l’épargne garde le reste', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-11-06', montant: 846 })], privations: [reste('2026-11-05', 1346), reste('2026-11-06', 500)], liste: [gta()] });
    vrai(estSuperFlamme(e, '2026-11-05')); vrai(!estSuperFlamme(e, '2026-11-06'));
    const f = fluxEnvies(e, { auto: [], aujourdhuiIso: '2026-11-08' });
    egal(f.envies[0].cumulCentimes, 673 + 100);
    egal(f.envies[0].resteCentimes, 8000 - 773);
    egal(f.gardeAVirerCentimes, 773, 'avant l’achat, la part reste sur le compte');
    const v = aVirerEpargne(e, '2026-11-07');
    egal(v.privationsCentimes, 1846 - 773, 'l’épargne reçoit le reste');
    egal(v.enviesCentimes, 773);
    egal(f.envies[0].contributions.map((c) => c.superFlamme).join(' '), 'true false');
  } },
  { nom: 'envies : sans envie, rien ne change ; le surplus d’un jour passe à l’envie suivante', fn: () => {
    const sans = etat({ privations: [reste('2026-11-05', 1346)] });
    egal(aVirerEpargne(sans, '2026-11-07').privationsCentimes, 1346);
    const e = etat({ transactions: [tx({ date: '2026-11-06', montant: 846 })], privations: [reste('2026-11-05', 1346), reste('2026-11-06', 500)], liste: [gta({ id: 'a', montantCentimes: 700 }), gta({ id: 'b', nom: 'Baskets', montantCentimes: 5000 })] });
    const f = fluxEnvies(e, { auto: [], aujourdhuiIso: '2026-11-08' });
    egal(f.envies.map((x) => x.cumulCentimes).join(' '), '700 73');
    vrai(f.envies[0].complete); egal(f.active.id, 'b');
  } },
  { nom: 'envies : repas à la maison et privations du jour comptent aussi ; la journée en cours n’est pas une super flamme', fn: () => {
    const e = etat({ privations: [reste('2026-11-05', 56), { id: 'auto-2026-11-05', date: '2026-11-05', auto: true, montantCentimes: 1290 }, { id: 'p1', date: '2026-11-08', montantCentimes: 950, libelle: 'McDo' }], liste: [gta()] });
    const f = fluxEnvies(e, { auto: [], aujourdhuiIso: '2026-11-08' });
    egal(f.envies[0].contributions.map((c) => `${c.date}:${c.montantCentimes}:${c.superFlamme}`).join(' '), '2026-11-05:673:true 2026-11-08:190:false');
    egal(f.parReste.get('reste-2026-11-05').garde, 56, 'le reste du jour d’abord');
    egal(f.parReste.get('auto-2026-11-05').garde, 617);
  } },
  { nom: 'envies : achat en avance (exception), avance reprise sur la moitié des virements, la barre continue', fn: () => {
    const achat = { date: '2026-11-07', montantCentimes: 8000, exception: true, retenues: [] };
    const e = etat({
      transactions: [tx({ date: '2026-11-06', montant: 846 }), { ...tx({ date: '2026-11-07', montant: 8000, categorie: 'loisirs' }), envieId: 'gta', source: 'envie' }],
      privations: [reste('2026-11-05', 1346), reste('2026-11-06', 500), reste('2026-11-07', 1346)],
      liste: [gta({ achat })],
    });
    egal(depensesVariables(e, '2026-11-07', '2026-11-07'), 0, 'l’achat d’envie ne compte pas dans le budget du jour');
    vrai(estSuperFlamme(e, '2026-11-07'), 'acheter l’envie ne casse pas la super flamme');
    const f = fluxEnvies(e, { auto: [], aujourdhuiIso: '2026-11-08' });
    const g = f.envies[0];
    egal(g.cumulCentimes, 773 + 673, 'la barre continue après l’achat');
    egal(g.avanceCentimes, 8000 - 773);
    egal(f.gardeAVirerCentimes, 773, 'après l’achat, la part de l’envie part à l’épargne (elle rembourse)');
    const v = aVirerEpargne(e, '2026-11-08');
    const net = 1346 + 500 + 1346 - 773;
    egal(v.retenueAvanceCentimes, Math.floor(net / 2));
    egal(v.privationsCentimes, net - Math.floor(net / 2));
    egal(retenueAvance({ avanceRestanteCentimes: 100 }, 5000), 100, 'jamais plus que l’avance');
    const e2 = etat({ ...e, transactions: e.transactions, privations: e.privations, liste: [gta({ achat: { ...achat, retenues: [{ date: '2026-11-08', montantCentimes: 7227 }] } })] });
    egal(fluxEnvies(e2, { auto: [], aujourdhuiIso: '2026-11-08' }).avanceRestanteCentimes, 0);
  } },
  { nom: 'envies : estimation du soir et journées sans dépense restantes', fn: () => {
    egal(estimationDuJour(1346, 0, 1346).montantCentimes, 673);
    egal(estimationDuJour(500, 846, 1346).montantCentimes, 100);
    egal(journeesPourFinir(8000 - 773, 1346), 11);
  } },
];
