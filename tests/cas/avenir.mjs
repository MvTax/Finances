// avenir.mjs — dépenses à venir : dépenses prévues réservées dans le budget, retrouvées quand elles sont payées.
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { resteADepenser, depensesPrevuesPeriode, periodeBudget, projectionDecouvert } from '../../js/calculs.js';

const revenus = (mois, c) => ({ mois, salaireCentimes: c, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' });
const base = (prevues, transactions = []) => etatBase({ revenusMensuels: [revenus('2026-11', 150000)], depensesPrevues: prevues, transactions });

export default [
  { nom: 'dépense prévue : retirée du budget du jour et de l’épargne visée dès qu’elle est ajoutée', fn: () => {
    const sans = resteADepenser(base([]), '2026-11-10');
    const avec = resteADepenser(base([{ id: 'p1', libelle: 'Anniversaire', montantCentimes: 5000, date: '2026-11-20', categorie: 'loisirs' }]), '2026-11-10');
    egal(avec.prevuesCentimes, 5000);
    egal(sans.epargneViseeCentimes - avec.epargneViseeCentimes, 5000, 'l’épargne visée baisse d’autant');
    egal(avec.resteCentimes, sans.resteCentimes, 'le budget du quotidien reste le même : l’épargne absorbe la dépense prévue');
  } },
  { nom: 'dépense prévue retrouvée dans les opérations (montant à 10 %, 7 jours, même catégorie) : plus réservée, jamais comptée deux fois', fn: () => {
    const prevue = { id: 'p1', libelle: 'Billet de train', montantCentimes: 4500, date: '2026-11-20', categorie: 'train' };
    const avant = resteADepenser(base([prevue]), '2026-11-18');
    const e = base([prevue], [tx({ date: '2026-11-18', montant: 4790, categorie: 'train', marchand: 'SNCF' })]);
    const p = depensesPrevuesPeriode(e, periodeBudget('2026-11-18', e.profil));
    vrai(p[0].realisee); egal(p[0].transactionId, e.transactions[0].id);
    const apres = resteADepenser(e, '2026-11-18');
    egal(apres.prevuesCentimes, 0);
    egal(avant.prevuesCentimes + avant.depensesVariablesCentimes, 4500);
    egal(apres.depensesVariablesCentimes, 4790, 'la vraie dépense compte une fois, à son vrai montant');
  } },
  { nom: 'une dépense sans rapport (autre catégorie, autre libellé) ne « consomme » pas la dépense prévue', fn: () => {
    const e = base([{ id: 'p1', libelle: 'Cadeau', montantCentimes: 2000, date: '2026-11-20', categorie: 'loisirs' }], [tx({ date: '2026-11-19', montant: 2000, categorie: 'restaurants', marchand: 'Resto' })]);
    vrai(!depensesPrevuesPeriode(e, periodeBudget('2026-11-19', e.profil))[0].realisee);
  } },
  { nom: 'dépense prévue « déjà payée » ou d’un autre mois : pas réservée ce mois-ci', fn: () => {
    const r = resteADepenser(base([
      { id: 'a', libelle: 'Payée', montantCentimes: 3000, date: '2026-11-12', categorie: 'autres', faite: true },
      { id: 'b', libelle: 'Décembre', montantCentimes: 9000, date: '2026-12-15', categorie: 'autres' },
    ]), '2026-11-10');
    egal(r.prevuesCentimes, 0);
  } },
  { nom: 'dépense prévue dans les 7 jours : comptée dans la projection du compte courant', fn: () => {
    const e = base([{ id: 'p1', libelle: 'Réparation', montantCentimes: 8000, date: '2026-11-12', categorie: 'maison' }]);
    const p = projectionDecouvert(e, '2026-11-10', { jours: 7, inclureRythme: false });
    vrai(p.evenements.some((x) => x.type === 'prevue' && x.montantCentimes === -8000));
  } },
];
