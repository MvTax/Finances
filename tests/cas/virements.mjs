// virements.mjs — « Reste à virer vers l'épargne » : un virement par semaine (épargne du mois + arrondis + privations).
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { aVirerEpargne, historiqueCagnotte, compteEpargne } from '../../js/virements.js';
import * as store from '../../js/store.js';
import { resteADepenser, jaugeDuJour } from '../../js/calculs.js';

const revenus = (mois, c) => ({ mois, salaireCentimes: c, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' });
const poches = () => [
  { id: 'secu', nom: 'Sécurité', type: 'coussin', cibleCentimes: 100000, priorite: 2, partRepartition: 50, soldeInitialCentimes: 0, mouvements: [], actif: true },
  { id: 'pret', nom: 'Prêt 8 000 €', type: 'remboursementAnticipe', cibleCentimes: 800000, priorite: 1, partRepartition: 50, soldeInitialCentimes: 0, mouvements: [], actif: true },
];
const etat = (extra = {}) => {
  const e = etatBase({ revenusMensuels: [revenus('2026-11', 150000)], poches: poches(), privations: [], ...extra });
  e.profil.arrondi.pocheId = 'pret';
  e.profil.arrondi.actif = true;
  e.profil.repasAuto = { actif: false };
  return e;
};

export default [
  { nom: 'à virer : part de la semaine de l’épargne du mois, arrondis et privations, répartis par poche', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-11-09', montant: 340 })], privations: [{ id: 'p', date: '2026-11-09', libelle: 'Menu', montantCentimes: 1000, vireLe: null }] });
    const v = aVirerEpargne(e, '2026-11-10');
    vrai(v.moisCibleCentimes > 0, 'une épargne est visée');
    egal(v.arrondisCentimes, 60);
    egal(v.privationsCentimes, 1000);
    egal(v.semaineCentimes, v.moisSemaineCentimes + 60 + 1000);
    vrai(v.moisSemaineCentimes > 0 && v.moisSemaineCentimes < v.moisRestantCentimes, 'une partie seulement cette semaine');
    egal(v.moisSemaineCentimes % 100, 0, 'arrondi à l’euro');
    egal(v.parPoche.reduce((s, x) => s + x.montantCentimes, 0), v.semaineCentimes, 'rien ne se perd');
    const pret = v.parPoche.find((x) => x.pocheId === 'pret').montantCentimes;
    const secu = v.parPoche.find((x) => x.pocheId === 'secu').montantCentimes;
    egal(pret - secu, 1060, 'efforts sur le prêt, épargne du mois en 50/50');
    egal(v.totalCentimes, v.moisRestantCentimes + 1060);
  } },
  { nom: 'à virer : une fois le virement de la semaine fait, plus rien jusqu’à lundi, puis la part suivante', fn: () => {
    const e = etat();
    const v0 = aVirerEpargne(e, '2026-11-10');
    e.transactions.push(tx({ date: '2026-11-10', montant: v0.moisSemaineCentimes, categorie: 'epargne', epargne: true, typeEpargne: 'virementLivret' }));
    const v1 = aVirerEpargne(e, '2026-11-11');
    egal(v1.moisSemaineCentimes, 0);
    egal(v1.moisRestantCentimes, v0.moisRestantCentimes - v0.moisSemaineCentimes);
    const v2 = aVirerEpargne(e, '2026-11-16');
    vrai(v2.moisSemaineCentimes > 0, 'nouvelle semaine');
  } },
  { nom: 'à virer : rien quand l’épargne du mois est faite et que tout est viré', fn: () => {
    const e = etat();
    const v0 = aVirerEpargne(e, '2026-11-10');
    e.transactions.push(tx({ date: '2026-11-06', montant: v0.moisCibleCentimes, categorie: 'epargne', epargne: true, typeEpargne: 'virementLivret' }));
    const v = aVirerEpargne(e, '2026-11-10');
    egal(v.semaineCentimes, 0); egal(v.totalCentimes, 0); egal(v.parPoche.length, 0);
  } },
  { nom: 'à virer : arrondis et privations partagés entre les deux épargnes (réglage « partage »)', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-11-09', montant: 300 })], privations: [{ id: 'p', date: '2026-11-09', libelle: 'Menu', montantCentimes: 1000, vireLe: null }] });
    e.profil.arrondi.pocheId = 'partage';
    const v = aVirerEpargne(e, '2026-11-10');
    egal(v.arrondisCentimes, 50, '3,00 € rond : 0,50 €');
    const pret = v.parPoche.find((x) => x.pocheId === 'pret').montantCentimes;
    const secu = v.parPoche.find((x) => x.pocheId === 'secu').montantCentimes;
    egal(pret + secu, v.semaineCentimes);
    vrai(Math.abs(pret - secu) <= 2, `partage 50/50 (${pret} / ${secu})`);
  } },
  { nom: 'date du virement : jeudi de la semaine, aujourd’hui si en retard, semaine suivante si fait', fn: () => {
    const e = etat();
    const mardi = aVirerEpargne(e, '2026-11-10');
    egal(mardi.dateVirement, '2026-11-12'); egal(mardi.enRetard, false);
    const vendredi = aVirerEpargne(e, '2026-11-13');
    egal(vendredi.dateVirement, '2026-11-13'); egal(vendredi.enRetard, true); egal(vendredi.datePrevue, '2026-11-12');
    e.transactions.push(tx({ date: '2026-11-13', montant: vendredi.moisSemaineCentimes, categorie: 'epargne', epargne: true, typeEpargne: 'virementLivret' }));
    const apres = aVirerEpargne(e, '2026-11-13');
    egal(apres.semaineCentimes, 0); egal(apres.dateVirement, '2026-11-19');
    e.profil.arrondi.jourVirement = 1;
    egal(aVirerEpargne(etat(), '2026-11-10').dateVirement, '2026-11-12', 'jeudi par défaut');
  } },
  { nom: 'arrondis : tout ce qui sort est arrondi (abonnement, charge fixe, échéance, proche), sauf virements internes et épargne', fn: () => {
    const e = etat({ transactions: [
      tx({ date: '2026-11-06', montant: 1399, categorie: 'abonnements', chargeFixeId: 'netflix' }),
      tx({ date: '2026-11-06', montant: 45020, categorie: 'loyer', chargeFixeId: 'loyer' }),
      tx({ date: '2026-11-07', montant: 22314, categorie: 'credits' }),
      tx({ date: '2026-11-07', montant: 2000, categorie: 'prets-proches' }),
      tx({ date: '2026-11-07', montant: 5055, interne: true }),
      tx({ date: '2026-11-07', montant: 3333, categorie: 'epargne', epargne: true, typeEpargne: 'virementLivret' }),
    ] });
    egal(aVirerEpargne(e, '2026-11-10').arrondisCentimes, 1 + 80 + 86 + 50);
  } },
  { nom: 'arrondis : comptés depuis le début du mois (salaire), même si le suivi a commencé après', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-11-05', montant: 420 }), tx({ date: '2026-11-08', montant: 910 }), tx({ date: '2026-10-30', montant: 199 })] });
    e.profil.arrondi.depuis = '2026-11-08';
    egal(aVirerEpargne(e, '2026-11-10').arrondisCentimes, 80 + 90, 'le 05/11 compté, pas octobre');
  } },
  { nom: 'arrondis : ils sortent du budget (reste et part du jour), comme l’argent qui part à l’épargne', fn: () => {
    const e = etat();
    const r0 = resteADepenser(e, '2026-11-10');
    const j0 = jaugeDuJour(e, '2026-11-10');
    e.transactions.push(tx({ date: '2026-11-10', montant: 1399 }));
    const r1 = resteADepenser(e, '2026-11-10');
    egal(r1.arrondisCentimes, 1);
    const j1 = jaugeDuJour(e, '2026-11-10', j0.instantane);
    egal(j1.parJourCentimes, j0.parJourCentimes, 'la part du jour ne bouge pas');
    egal(j1.depensesDuJourCentimes - j0.depensesDuJourCentimes, 1399 + 1, 'dépense du jour + son arrondi');
    vrai(r1.resteCentimes <= r0.resteCentimes);
  } },
  { nom: 'historique de la cagnotte : chaque ajout avec sa source, le total à virer = le virement de la semaine', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-11-06', montant: 1207, categorie: 'abonnements', marchand: 'Streaming' }), tx({ date: '2026-11-09', montant: 340, marchand: 'Boulangerie' })],
      privations: [{ id: 'p', date: '2026-11-09', libelle: 'Un menu au fast-food', montantCentimes: 1000, vireLe: null }] });
    const hst = historiqueCagnotte(e, '2026-11-10');
    const v = aVirerEpargne(e, '2026-11-10');
    egal(hst.aVirerCentimes, v.semaineCentimes);
    const arr = hst.lignes.filter((l) => l.source === 'arrondi');
    egal(arr.length, 2); egal(arr.find((l) => l.libelle === 'Streaming').montantCentimes, 93);
    vrai(/12,07.*13,00/.test(arr.find((l) => l.libelle === 'Streaming').detail));
    egal(hst.lignes.filter((l) => l.source === 'privation').length, 1);
    egal(hst.lignes.filter((l) => l.source === 'mois').length, 1);
    egal(hst.lignes[0].date, '2026-11-10', 'le plus récent d’abord');
  } },
  { nom: 'épargnes rangées : Sécurité sur Revolut, prêt sur le Livret A LCL (une fois, si les deux banques sont là)', fn: () => {
    store.etat.meta = {};
    store.etat.comptes = [{ id: 'lcl', nom: 'LCL', banque: 'lcl' }, { id: 'revolut', nom: 'Revolut', banque: 'revolut' }];
    store.etat.poches = poches();
    store.etat.poches.push({ id: 'old', type: 'projet', actif: false, compteSupport: 'Livret A' });
    vrai(store.placerEpargnes().length > 0);
    egal(store.etat.poches.find((p) => p.id === 'secu').compteSupport, 'Revolut');
    egal(store.etat.poches.find((p) => p.id === 'pret').compteSupport, 'Livret A LCL');
    egal(store.etat.poches.find((p) => p.id === 'old').compteSupport, 'Livret A');
    egal(store.placerEpargnes().length, 0);
    egal(compteEpargne({ compteSupport: 'Compte épargne sans intérêts' }), null);
  } },
];
