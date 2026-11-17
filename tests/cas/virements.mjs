// virements.mjs — « Reste à virer vers l'épargne » : un virement par semaine (épargne du mois + arrondis + privations).
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { aVirerEpargne, historiqueCagnotte, compteEpargne } from '../../js/virements.js';
import * as store from '../../js/store.js';
import { formatEuros } from '../../js/money.js';
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
    egal(pret - secu, 60 + (571 - 429), 'arrondis sur le prêt, épargne du mois en 50/50, reste de la journée 40/30 (571 / 429)');
    egal(v.totalCentimes, v.moisRestantCentimes + 1060);
  } },
  { nom: 'à virer : un virement tous les 3 jours ; une fois fait, plus rien jusqu’à la tranche suivante', fn: () => {
    const e = etat();
    const v0 = aVirerEpargne(e, '2026-11-07');
    egal(v0.datesVirements.slice(0, 4).join(' '), '2026-11-08 2026-11-11 2026-11-14 2026-11-17', 'salaire le 5 : le 8, le 11, le 14…');
    egal(v0.nbVirements, 10);
    egal(v0.numeroVirement, 1); egal(v0.dateVirement, '2026-11-08');
    egal(v0.joursCouverts.join(' '), '2026-11-05 2026-11-06 2026-11-07', 'le virement du 8 couvre le 5, le 6 et le 7');
    egal(v0.moisSemaineCentimes, Math.ceil(v0.moisCibleCentimes / 10 / 100) * 100, 'un dixième de l’épargne du mois');
    e.transactions.push(tx({ date: '2026-11-08', montant: v0.moisSemaineCentimes, categorie: 'epargne', epargne: true, typeEpargne: 'virementLivret' }));
    const v1 = aVirerEpargne(e, '2026-11-08');
    egal(v1.moisSemaineCentimes, 0); egal(v1.dateVirement, '2026-11-11'); egal(v1.numeroProchain, 2);
    const v2 = aVirerEpargne(e, '2026-11-09');
    vrai(v2.moisSemaineCentimes > 0, 'tranche 2'); egal(v2.dateVirement, '2026-11-11'); egal(v2.enRetard, false);
    egal(v2.joursCouverts.join(' '), '2026-11-08 2026-11-09 2026-11-10');
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
    vrai(Math.abs(pret - secu - (571 - 429)) <= 2, `arrondis et épargne du mois 50/50, reste de la journée 40/30 (${pret} / ${secu})`);
  } },
  { nom: 'date du virement : celle de la tranche ; virement oublié → aujourd’hui, avec la part reportée', fn: () => {
    const e = etat();
    egal(aVirerEpargne(e, '2026-11-06').dateVirement, '2026-11-08');
    const oublie = aVirerEpargne(e, '2026-11-10');
    egal(oublie.enRetard, true); egal(oublie.dateVirement, '2026-11-10'); egal(oublie.datePrevue, '2026-11-08');
    egal(oublie.moisSemaineCentimes, Math.ceil(oublie.moisCibleCentimes / 9 / 100) * 100, 'reste réparti sur les 9 virements restants');
    egal(oublie.joursCouverts[0], '2026-11-05', 'le libellé reprend les jours oubliés');
    egal(aVirerEpargne(e, '2026-12-04').enRetard, true, 'au dernier jour, ce qui reste est à faire');
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
    const hst = historiqueCagnotte(e, '2026-11-10', new Date('2026-11-10T20:00:00+01:00'));
    const v = aVirerEpargne(e, '2026-11-10');
    egal(hst.aVirerCentimes, v.semaineCentimes);
    const arr = hst.lignes.filter((l) => l.source === 'arrondi');
    egal(arr.length, 2); egal(arr.find((l) => l.libelle === 'Streaming').montantCentimes, 93);
    vrai(/12,07.*13,00/.test(arr.find((l) => l.libelle === 'Streaming').detail));
    egal(hst.lignes.filter((l) => l.source === 'privation').length, 1);
    egal(hst.lignes.filter((l) => l.source === 'mois').length, 1);
    egal(hst.lignes[0].date, '2026-11-10', 'le plus récent d’abord');
  } },
  { nom: 'historique de la cagnotte : arrondis d’avant le salaire une ligne chacun, à leur date ; la somme à virer = le virement', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-10-28', montant: 420, marchand: 'BOUTIQUE TEST' }), tx({ date: '2026-11-03', montant: 910 }), tx({ id: 'vire', date: '2026-11-02', montant: 150 }),
      tx({ date: '2026-11-09', montant: 340 })],
      privations: [{ id: 'p', date: '2026-11-09', libelle: 'Menu', montantCentimes: 1000, vireLe: null }] });
    e.profil.debutSuivi = '2026-10-20';
    e.cagnotteArrondis = [{ transactionId: 'vire', vireLe: '2026-11-04' }];
    const v = aVirerEpargne(e, '2026-11-10');
    egal(v.arrondisCentimes, 80 + 90 + 60, 'arrondis d’octobre et début novembre non virés + celui du 09/11');
    const hst = historiqueCagnotte(e, '2026-11-10', new Date('2026-11-10T20:00:00+01:00'));
    egal(hst.lignes.filter((l) => l.avantSalaire).length, 0, 'plus de ligne groupée');
    const avant = hst.lignes.filter((l) => l.source === 'arrondi' && l.date < hst.periode.debut);
    egal(avant.map((l) => `${l.date}:${l.montantCentimes}`).join(' '), '2026-11-03:90 2026-10-28:80', 'une ligne par arrondi, le plus récent d’abord');
    egal(avant[1].libelle, 'BOUTIQUE TEST'); egal(avant[1].detail, `${formatEuros(420)} arrondi à ${formatEuros(500)}`, 'même détail que les arrondis du mois');
    vrai(avant.every((l) => !l.vireLe), 'à virer');
    egal(hst.lignes.filter((l) => l.date === '2026-11-02').length, 0, 'l’arrondi déjà viré d’avant le salaire n’y est pas');
    const aVirer = hst.lignes.filter((l) => !l.vireLe && !l.enCours).reduce((s, l) => s + l.montantCentimes, 0);
    egal(aVirer, v.semaineCentimes, 'somme des lignes à virer = montant à virer de la page');
    egal(hst.aVirerCentimes, v.semaineCentimes);
    vrai(v.totalCentimes > v.semaineCentimes, 'le total du mois n’est pas le virement en cours');
  } },
  { nom: 'historique de la cagnotte : salaire et CAF en « début du mois », affichés mais jamais comptés', fn: () => {
    const base = () => [tx({ date: '2026-10-28', montant: 420 }), tx({ date: '2026-11-09', montant: 340 })];
    const sans = etat({ transactions: base() });
    sans.profil.debutSuivi = '2026-10-20';
    const avec = etat({ transactions: [...base(),
      tx({ id: 'sal', date: '2026-11-05', montant: 150000, sens: 'credit', categorie: 'salaire', marchand: 'SALAIRE TEST' }),
      tx({ id: 'caf', date: '2026-11-04', montant: 12300, sens: 'credit', categorie: 'prime-activite', marchand: 'CAF TEST' }),
      tx({ id: 'loin', date: '2026-10-20', montant: 5000, sens: 'credit', categorie: 'prime-activite', marchand: 'CAF TEST' })] });
    avec.profil.debutSuivi = '2026-10-20';
    const instant = new Date('2026-11-10T20:00:00+01:00');
    const h0 = historiqueCagnotte(sans, '2026-11-10', instant);
    const h1 = historiqueCagnotte(avec, '2026-11-10', instant);
    egal(h1.periode.debut, '2026-11-05');
    const dep = h1.lignes.filter((l) => l.depart);
    egal(dep.map((l) => `${l.type}:${l.date}:${l.libelle}:${l.montantCentimes}`).join(' '), 'salaire:2026-11-05:SALAIRE TEST:150000 caf:2026-11-04:CAF TEST:12300', 'salaire puis CAF, la CAF trop loin du salaire n’y est pas');
    vrai(dep.every((l) => l.source === 'depart' && !l.vireLe), 'source à part, rien de viré');
    egal(h1.aVirerCentimes, h0.aVirerCentimes, 'les lignes de départ ne changent pas « À virer »');
    egal(h1.aVirerCentimes, aVirerEpargne(avec, '2026-11-10').semaineCentimes);
    egal(h1.vireCentimes, h0.vireCentimes);
    const i = (f) => h1.lignes.findIndex(f);
    vrai(i((l) => l.type === 'salaire') < i((l) => l.date === '2026-10-28'), 'les arrondis d’avant le salaire sont rangés sous le salaire');
    vrai(i((l) => l.date === '2026-11-09') < i((l) => l.type === 'salaire'), 'les opérations du mois au-dessus');
    egal(historiqueCagnotte(avec, '2026-11-04', instant).lignes.filter((l) => l.depart && l.type === 'salaire').length, 0, 'pas de salaire futur affiché');
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
