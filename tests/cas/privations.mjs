// privations.mjs — « Je me suis privé » : le montant non dépensé part à l'épargne.
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { resteADepenser, periodeBudget, jaugeDuJour } from '../../js/calculs.js';
import { montantsHabituels, bilanPrivations } from '../../js/privations.js';

const revenus = (mois, c) => ({ mois, salaireCentimes: c, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' });

export default [
  { nom: 'privation : le montant quitte le budget du jour comme une dépense, mais part à l’épargne', fn: () => {
    const sans = resteADepenser(etatBase({ revenusMensuels: [revenus('2026-11', 150000)] }), '2026-11-10');
    const e = etatBase({ revenusMensuels: [revenus('2026-11', 150000)], privations: [{ id: 'a', date: '2026-11-08', categorie: 'restauration-rapide', libelle: 'Un menu au fast-food', montantCentimes: 1140, vireLe: null }] });
    const avec = resteADepenser(e, '2026-11-10');
    egal(avec.privationsCentimes, 1140);
    egal(sans.resteCentimes - avec.resteCentimes, 1140);
    egal(avec.depensesVariablesCentimes, sans.depensesVariablesCentimes, 'ce n’est pas une dépense');
    egal(avec.epargneCibleCentimes, sans.epargneCibleCentimes, 'l’épargne visée ne baisse pas : la privation s’y ajoute');
  } },
  { nom: 'privation du jour : sort de la part d’aujourd’hui (comme le menu l’aurait fait), pas des jours suivants', fn: () => {
    const e = etatBase({ revenusMensuels: [revenus('2026-11', 150000)] });
    const j0 = jaugeDuJour(e, '2026-11-10');
    e.privations = [{ id: 'a', date: '2026-11-10', categorie: 'restauration-rapide', libelle: 'Menu', montantCentimes: 950, vireLe: null }];
    const j1 = jaugeDuJour(e, '2026-11-10', j0.instantane);
    egal(j1.parJourCentimes, j0.parJourCentimes, 'la part du jour ne change pas');
    egal(j1.restantAujourdhuiCentimes, j0.restantAujourdhuiCentimes - 950);
  } },
  { nom: 'privation : montants habituels (médiane sur 90 jours) et marchand le plus fréquent', fn: () => {
    const e = etatBase({ transactions: [
      tx({ date: '2026-10-01', montant: 1090, categorie: 'restauration-rapide', marchand: 'McDonald’s' }),
      tx({ date: '2026-10-10', montant: 1140, categorie: 'restauration-rapide', marchand: 'McDonald’s' }),
      tx({ date: '2026-10-20', montant: 950, categorie: 'restauration-rapide', marchand: 'KFC' }),
    ] });
    const m = montantsHabituels(e, '2026-11-06');
    const ff = m.find((x) => x.id === 'restauration-rapide');
    egal(ff.montantCentimes, 1090); vrai(ff.habituel); egal(ff.marchand, 'McDonald’s');
    const liv = m.find((x) => x.id === 'livraison');
    egal(liv.montantCentimes, 1800); vrai(!liv.habituel, 'sans historique : montant par défaut');
  } },
  { nom: 'privation : bilan du mois, à virer, total', fn: () => {
    const e = etatBase({ privations: [
      { id: 'a', date: '2026-11-06', montantCentimes: 1000, vireLe: null },
      { id: 'b', date: '2026-11-07', montantCentimes: 500, vireLe: '2026-11-08' },
      { id: 'c', date: '2026-10-20', montantCentimes: 300, vireLe: null },
    ] });
    const b = bilanPrivations(e, periodeBudget('2026-11-10', e.profil));
    egal(b.nbMois, 2); egal(b.moisCentimes, 1500); egal(b.aVirerCentimes, 1300); egal(b.totalCentimes, 1800);
  } },
];
