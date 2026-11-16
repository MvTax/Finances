// obligatoires.mjs — dépenses obligatoires reconnues à la saisie (js/obligatoires.js) : comptées dans le mois,
// pas dans la part du jour. Dates fixes, montants inventés.
import { egal, vrai, egalProfond } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { estNode } from '../outils/env.mjs';
import { reconnaitreObligatoire, appliquerObligatoire, reponseObligatoire, montantProche, transactionPaiementCharge, relierFusionnee, echeancesCreditPeriode } from '../../js/obligatoires.js';
import { resteADepenser, jaugeDuJour, chargesFixesPeriode, depensesVariables, estDepenseQuotidienne, paiementsImplicites, prelevementsHorsCharges, periodeBudget } from '../../js/calculs.js';
import { dedoublonner, fusionnerRapprochement, empreinte, rattacherChargesFixes } from '../../js/import/pipeline.js';
import { construireExport, lireSauvegarde } from '../../js/sauvegarde.js';
import { forcerAujourdhui, ajouterJours } from '../../js/dates.js';
import { genererSauvegarde, REFERENCE_DEFAUT } from '../outils/generer-sauvegarde.mjs';

// Période du 5 novembre au 4 décembre (salaire le 5) ; le 9 novembre, il reste 26 jours.
// Revenus 1 200 €, loyer 230 € prévu le 10, 300 € réservés pour la vie courante : part du jour ≈ 12 €.
const A = '2026-11-09';
const copie = (x) => JSON.parse(JSON.stringify(x));
const etat = (o = {}) => {
  const e = etatBase({
    revenusMensuels: [{ mois: '2026-11', salaireCentimes: 120000, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' }],
    chargesFixes: [
      { id: 'loyer', libelle: 'Loyer', montantCentimes: 23000, jourPrelevement: 10, actif: true, compteId: 'courant', categorie: 'logement', estLoyer: true },
      { id: 'forfait', libelle: 'Forfait mobile', montantCentimes: 1500, jourPrelevement: 20, actif: true, compteId: 'courant', categorie: 'telephonie' },
    ],
    privations: [], depensesPrevues: [], ...o,
  });
  e.profil.loyerAPayerCentimes = null;
  e.profil.repasAuto = { actif: false };
  e.profil.parametresPlan = { vieMinCentimes: 30000, margeMinCentimes: 1000, arrondisEstimesCentimes: 0 };
  e.meta = {};
  return e;
};
/** Une dépense notée à la main sans libellé (comme nouvelleTransaction : marchand « Dépense »). */
const saisie = (montant, categorie, date = A, o = {}) => tx({ date, montant, categorie, marchand: 'Dépense', ...o });

/** Comme ajouterTransaction : reconnaissance puis ajout dans l'état. */
function noter(e, t, auj = A) {
  const r = reconnaitreObligatoire(e, t, auj);
  appliquerObligatoire(t, r);
  e.transactions.push(t);
  return r;
}

/** La ligne du relevé qui complète une saisie (comme fusionnerRapprochement) : libellé bancaire, source import. */
const completeeParReleve = (t, libelle) => ({ ...t, libellePrincipal: libelle, libelleBrut: libelle, importId: 'imp1', sourceInitiale: t.source, source: 'import' });
const periodeA = (e) => periodeBudget(A, e.profil, { reference: A });
/** Un crédit synthétique : une échéance de 120 € le 9 novembre. */
const credit = (o = {}) => ({ id: 'cr1', libelle: 'Crédit exemple', type: 'instantane', actif: true, motifDetection: 'CREDIT EXEMPLE', echeancier: [{ date: '2026-11-09', montantCentimes: 12000, payee: false }], ...o });

const nouveaux = [
  { nom: 'loyer noté à la main sans charge (avant 1.41) puis complété par « PRLV … » : payé une fois, même part du jour qu’un loyer relié', fn: () => {
    forcerAujourdhui(A);
    try {
      const relie = etat(); relie.transactions.push(saisie(23000, 'logement', '2026-11-08', { id: 'l1', marchand: 'Loyer', chargeFixeId: 'loyer' }));
      const implicite = etat(); implicite.transactions.push(completeeParReleve(saisie(23000, 'logement', '2026-11-08', { id: 'l1', marchand: 'Loyer' }), 'PRLV SEPA BAILLEUR EXEMPLE'));
      const per = periodeA(implicite);
      egalProfond(paiementsImplicites(implicite, per), [{ chargeFixeId: 'loyer', transactionId: 'l1', montantCentimes: 23000, date: '2026-11-08' }]);
      const loyer = chargesFixesPeriode(implicite, per).find((c) => c.id === 'loyer');
      vrai(loyer.payee && loyer.payeeImplicite); egal(loyer.transactionId, 'l1'); egal(loyer.montantPrevuCentimes, 23000);
      egal(prelevementsHorsCharges(implicite, per.debut, per.fin).length, 0, 'pas compté une 2e fois avec les prélèvements');
      const r1 = resteADepenser(relie, A); const r2 = resteADepenser(implicite, A);
      egal(r2.chargesCentimes, r1.chargesCentimes); egal(r2.resteCentimes, r1.resteCentimes);
      egal(jaugeDuJour(implicite, A, null).parJourCentimes, jaugeDuJour(relie, A, null).parJourCentimes, 'même part du jour');
      // Ancien calcul (sans paiement implicite) : la charge restait à payer ET le prélèvement était compté → 230 € de trop
      egal(r2.chargesCentimes, 23000 + 1500);
      // Rien n'est écrit : la dépense n'a toujours pas de charge rattachée
      egal(implicite.transactions[0].chargeFixeId, null);
    } finally { forcerAujourdhui(null); }
  } },
  { nom: 'paiement implicite : dépense obligatoire reconnue (horsPartDuJour) sans charge, et nom de la charge dans le libellé', fn: () => {
    forcerAujourdhui(A);
    try {
      const e = etat(); e.transactions.push(saisie(23500, 'logement', '2026-11-11', { id: 'h1', extra: { horsPartDuJour: true } }));
      const per = periodeA(e);
      egal(paiementsImplicites(e, per)[0]?.transactionId, 'h1', 'horsPartDuJour + même catégorie + montant à 10 %');
      egal(chargesFixesPeriode(e, per).find((c) => c.id === 'loyer').montantPrevuCentimes, 23500, 'au montant réel');
      // Catégorie « Autres » mais le nom de la charge dans le libellé bancaire
      const e2 = etat(); e2.chargesFixes[0].motifDetection = 'BAILLEUR EXEMPLE';
      e2.transactions.push(completeeParReleve(saisie(23000, 'autres', '2026-11-10', { id: 'm1' }), 'PRLV SEPA BAILLEUR EXEMPLE ECH NOV'));
      egal(paiementsImplicites(e2, periodeA(e2))[0]?.chargeFixeId, 'loyer');
      // Montant de détection : il faut le montant exact
      const e3 = etat(); Object.assign(e3.chargesFixes[1], { motifDetection: 'OPERATEUR EXEMPLE', montantDetection: 1500 });
      e3.transactions.push(tx({ id: 'f1', date: '2026-11-20', montant: 1520, categorie: 'telephonie', marchand: 'Operateur Exemple', libellePrincipal: 'PRLV SEPA OPERATEUR EXEMPLE' }));
      egal(paiementsImplicites(e3, periodeA(e3)).length, 0, '15,20 € ≠ 15,00 € de détection');
    } finally { forcerAujourdhui(null); }
  } },
  { nom: 'paiement implicite : pas de faux positif (montant ×2, 20 jours, catégorie incompatible, du quotidien, « non »)', fn: () => {
    forcerAujourdhui(A);
    try {
      const prlv = (montant, date, categorie, o = {}) => completeeParReleve(saisie(montant, categorie, date, o), 'PRLV SEPA SOCIETE EXEMPLE');
      const cas = [
        ['montant ×2', prlv(46000, '2026-11-10', 'logement')],
        ['20 jours après l’échéance', prlv(23000, '2026-11-30', 'logement')],
        ['catégorie incompatible, nom absent', prlv(23000, '2026-11-10', 'courses')],
        ['dépense du quotidien (pas de PRLV)', saisie(23000, 'logement', '2026-11-10')],
        ['tu as répondu « non »', prlv(23000, '2026-11-10', 'logement', { extra: { horsPartDuJour: false } })],
        ['envie', prlv(23000, '2026-11-10', 'logement', { extra: { envieId: 'e1' } })],
        ['virement d’épargne', prlv(23000, '2026-11-10', 'logement', { epargne: true })],
      ];
      for (const [nom, t] of cas) {
        const e = etat(); e.transactions.push(t);
        const per = periodeA(e);
        egal(paiementsImplicites(e, per).length, 0, nom);
        vrai(!chargesFixesPeriode(e, per).find((c) => c.id === 'loyer').payee, nom);
      }
    } finally { forcerAujourdhui(null); }
  } },
  { nom: 'paiement implicite : deux opérations possibles → une seule paie la charge (la plus proche en montant, puis en date)', fn: () => {
    forcerAujourdhui(A);
    try {
      const e = etat();
      e.transactions.push(
        completeeParReleve(saisie(23100, 'logement', '2026-11-10', { id: 'p1' }), 'PRLV SEPA SOCIETE EXEMPLE'),
        completeeParReleve(saisie(23000, 'logement', '2026-11-14', { id: 'p2' }), 'PRLV SEPA SOCIETE EXEMPLE'),
        completeeParReleve(saisie(23000, 'logement', '2026-11-12', { id: 'p3' }), 'PRLV SEPA SOCIETE EXEMPLE'));
      const per = periodeA(e);
      const imp = paiementsImplicites(e, per);
      egal(imp.length, 1); egal(imp[0].transactionId, 'p3', 'montant exact, 2 jours de l’échéance');
      egalProfond(prelevementsHorsCharges(e, per.debut, per.fin).map((x) => x.transactionId).sort(), ['p1', 'p2'], 'les autres restent comptées');
      egal(resteADepenser(e, A).chargesCentimes, 23100 + 23000 + 23000 + 1500, 'chaque prélèvement compté une fois');
    } finally { forcerAujourdhui(null); }
  } },
  { nom: 'échéance de crédit notée en « Autres » : probable, puis « oui » → Crédits (comptée une fois) ; « non » → détachée', fn: () => {
    forcerAujourdhui(A);
    try {
      const e = etat({ creditsBancaires: [credit()] });
      const sans = resteADepenser(e, A);
      const t = saisie(12000, 'autres', '2026-11-09', { id: 'c1' });
      const r = reconnaitreObligatoire(e, t, A);
      egal(r.niveau, 'probable'); egal(r.creditId, 'cr1'); vrai(/Crédit exemple/.test(r.raison) && /dettes du mois/.test(r.raison), r.raison);
      appliquerObligatoire(t, r);
      egal(t.creditId, 'cr1'); egal(t.obligatoireProbable, true); egal(t.categorie, 'autres', 'pas changée avant ta réponse');
      const oui = reponseObligatoire(t, true);
      egal(oui.categorie, 'credits'); egal(oui.creditId, 'cr1'); egal(oui.obligatoireProbable, undefined);
      const avecOui = etat({ creditsBancaires: [credit()], transactions: [oui] });
      egal(resteADepenser(avecOui, A).resteCentimes, sans.resteCentimes, 'l’échéance était déjà comptée dans les dettes : pas deux fois');
      egal(depensesVariables(avecOui, '2026-11-05', '2026-12-04'), 0);
      vrai(echeancesCreditPeriode(avecOui, periodeA(avecOui))[0].payee, 'échéance payée');
      // Ancien comportement : « Autres » comptée en dépense ET en dette
      const ancien = etat({ creditsBancaires: [credit()], transactions: [saisie(12000, 'autres', '2026-11-09')] });
      egal(resteADepenser(ancien, A).resteCentimes, sans.resteCentimes - 12000);
      const non = reponseObligatoire(t, false);
      egal(non.creditId, undefined); egal(non.horsPartDuJour, false); egal(non.categorie, 'autres');
      // Nom du crédit dans le libellé : sûr, classée « Crédits »
      const t2 = completeeParReleve(saisie(12000, 'autres', '2026-11-10'), 'CREDIT EXEMPLE ECH 0911');
      const r2 = reconnaitreObligatoire(e, t2, A);
      egal(r2.niveau, 'sur'); appliquerObligatoire(t2, r2); egal(t2.categorie, 'credits'); egal(t2.creditId, 'cr1'); egal(t2.horsPartDuJour, undefined);
      // Hors tolérance, échéance déjà payée, catégorie du quotidien : rien
      egal(reconnaitreObligatoire(e, saisie(15000, 'autres', '2026-11-09'), A).creditId, undefined, 'montant à plus de 10 %');
      egal(reconnaitreObligatoire(e, saisie(12000, 'autres', '2026-11-25'), A).creditId, undefined, '16 jours après');
      egal(reconnaitreObligatoire(e, saisie(12000, 'courses', '2026-11-09'), A).creditId, undefined, 'des courses');
      const payee = etat({ creditsBancaires: [credit({ echeancier: [{ date: '2026-11-09', montantCentimes: 12000, payee: true }] })] });
      egal(reconnaitreObligatoire(payee, saisie(12000, 'autres', '2026-11-09'), A).creditId, undefined, 'déjà payée');
    } finally { forcerAujourdhui(null); }
  } },
  { nom: 'saisie complétée par le relevé : reliée à la charge (libellé), sinon reconnaissance sûre seulement ; jamais après « non »', fn: () => {
    forcerAujourdhui(A);
    try {
      const e = etat({ creditsBancaires: [credit()] }); e.chargesFixes[0].motifDetection = 'BAILLEUR EXEMPLE';
      const f = completeeParReleve(saisie(23000, 'autres', '2026-11-10', { id: 'r1' }), 'PRLV SEPA BAILLEUR EXEMPLE');
      e.transactions.push(f);
      egal(relierFusionnee(e, f, A).chargeFixeId, 'loyer', 'nom de la charge dans le libellé');
      const e2 = etat(); const g = saisie(23000, 'logement', '2026-11-09', { id: 'r2' }); e2.transactions.push(g);
      egal(relierFusionnee(e2, g, A).chargeFixeId, 'loyer', 'reconnaissance sûre (même catégorie, montant, date ; elle-même mise de côté)');
      egal(relierFusionnee(e, g, A).chargeFixeId, null, 'loyer déjà payé par le prélèvement du relevé : pas relié deux fois');
      egal(relierFusionnee(e, saisie(23000, 'autres', '2026-11-09'), A).chargeFixeId, null, 'probable seulement : pas relié');
      egal(relierFusionnee(e, { ...f, horsPartDuJour: false }, A).chargeFixeId, null, '« non » : jamais relié');
      const c = relierFusionnee(e, completeeParReleve(saisie(12000, 'autres', '2026-11-09'), 'CREDIT EXEMPLE ECH 0911'), A);
      egal(c.categorie, 'credits'); egal(c.creditId, 'cr1');
      egal(relierFusionnee(e, saisie(23000, 'logement', '2026-11-09'), A, e.chargesFixes, { avecReconnaissance: false }).chargeFixeId, null, 'sans reconnaissance : seulement le libellé');
    } finally { forcerAujourdhui(null); }
  } },
  { nom: 'bouton « Payé » : transactionPaiementCharge (montant prévu, date, charge, catégorie, compte) puis null', fn: () => {
    const e = etat();
    const t = transactionPaiementCharge(e, 'loyer', A, { id: 'x1', maintenant: `${A}T10:00:00.000Z` });
    egal(t.id, 'x1'); egal(t.montantCentimes, 23000); egal(t.date, A, 'échéance (le 10) pas encore arrivée : aujourd’hui');
    egal(t.chargeFixeId, 'loyer'); egal(t.categorie, 'logement'); egal(t.compteId, 'courant'); egal(t.source, 'confirmation'); egal(t.sens, 'debit');
    egal(t.importId, null); vrai(!estDepenseQuotidienne(t));
    egal(transactionPaiementCharge(e, 'loyer', '2026-11-20').date, '2026-11-10', 'échéance passée : sa date');
    e.profil.loyerAPayerCentimes = 21000;
    egal(transactionPaiementCharge(e, 'loyer', A).montantCentimes, 21000, 'loyer à payer du profil');
    e.transactions.push(t);
    egal(transactionPaiementCharge(e, 'loyer', A), null, 'déjà payée');
    egal(transactionPaiementCharge(e, 'inconnue', A), null);
    // Déjà payée sans y être rattachée (prélèvement du relevé) : null aussi
    const e2 = etat(); e2.transactions.push(completeeParReleve(saisie(23000, 'logement', '2026-11-10'), 'PRLV SEPA SOCIETE EXEMPLE'));
    egal(transactionPaiementCharge(e2, 'loyer', A), null);
  } },
  { nom: 'dans l’app (base en mémoire) : payerChargeFixe puis annuler ; payerEcheanceCredit puis annuler', fn: async () => {
    if (!estNode) return; // Dans Safari, la vraie base contient tes données : ce test ne tourne que sous Node
    const { fausseIndexedDB } = await import('../outils/fausse-idb.mjs');
    const avantIdb = globalThis.indexedDB;
    globalThis.indexedDB = fausseIndexedDB();
    forcerAujourdhui(A);
    const store = await import('../../js/store.js');
    const actions = await import('../../js/actions.js');
    try {
      await store.effacerTout();
      await store.remplacerTout(copie(etat({ creditsBancaires: [credit()] })));
      const r = await actions.payerChargeFixe('loyer', { auj: A });
      egal(r.transaction.montantCentimes, 23000); egal(r.transaction.chargeFixeId, 'loyer'); vrai(!!r.transaction.empreinteDedoublonnage);
      egal(store.etat.transactions.length, 1);
      egal(await actions.payerChargeFixe('loyer', { auj: A }), null, 'déjà payée : rien de plus');
      await r.annuler();
      egal(store.etat.transactions.length, 0);
      const c = await actions.payerEcheanceCredit('cr1', '2026-11-09');
      egal(c.transaction.categorie, 'credits'); egal(c.transaction.creditId, 'cr1');
      egal(store.etat.creditsBancaires[0].echeancier[0].payee, true);
      await c.annuler();
      egal(store.etat.creditsBancaires[0].echeancier[0].payee, false); egal(store.etat.transactions.length, 0);
    } finally {
      await store.effacerTout();
      forcerAujourdhui(null);
      if (avantIdb === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = avantIdb;
    }
  } },
];

export default [
  { nom: 'montant à 10 % près, en entiers', fn: () => {
    vrai(montantProche(23000, 23000)); vrai(montantProche(25300, 23000)); vrai(montantProche(20700, 23000));
    vrai(!montantProche(25301, 23000)); vrai(!montantProche(20699, 23000)); vrai(!montantProche(100, 0));
  } },
  { nom: 'loyer noté sans libellé : rattaché à la charge, compté une seule fois, part du jour inchangée', fn: () => {
    forcerAujourdhui(A);
    try {
      const e = etat();
      const avant = jaugeDuJour(e, A, null);
      const resteAvant = resteADepenser(e, A);
      egal(avant.parJourCentimes, 1212, 'part du jour ≈ 12 €');
      const t = saisie(23000, 'logement');
      const r = noter(e, t);
      egal(r.niveau, 'sur'); egal(r.chargeFixeId, 'loyer'); egal(t.chargeFixeId, 'loyer');
      vrai(/Loyer/.test(r.raison) && /pas dans ta part du jour/.test(r.raison), r.raison);
      vrai(!estDepenseQuotidienne(t), 'hors de la journée');
      const apres = jaugeDuJour(e, A, avant.instantane);
      egal(apres.parJourCentimes, avant.parJourCentimes, 'part du jour inchangée');
      egal(apres.restantAujourdhuiCentimes, avant.restantAujourdhuiCentimes, 'pas « dépassé de 218 € »');
      egal(apres.depensesDuJourCentimes, 0);
      const per = resteADepenser(e, A);
      egal(per.resteCentimes, resteAvant.resteCentimes, 'le mois comptait déjà le loyer prévu');
      const loyer = chargesFixesPeriode(e, per.periode).find((c) => c.id === 'loyer');
      vrai(loyer.payee); egal(loyer.montantPrevuCentimes, 23000, 'compté une fois, au montant payé');
      egal(depensesVariables(e, per.periode.debut, per.periode.fin), 0, 'pas dans les dépenses du quotidien');
      // Sans la reconnaissance (ancien comportement) : 230 € dans la journée ET la charge encore à payer
      const ancien = etat(); ancien.transactions.push(saisie(23000, 'logement'));
      const j0 = jaugeDuJour(ancien, A, null);
      egal(j0.restantAujourdhuiCentimes, 1212 - 23000, 'l’ancien calcul disait « dépassé de 217,88 € »');
      egal(resteADepenser(ancien, A).resteCentimes, resteAvant.resteCentimes - 23000, 'et comptait le loyer deux fois dans le mois');
    } finally { forcerAujourdhui(null); }
  } },
  { nom: 'loyer un peu différent (à 10 % près, à 7 jours de l’échéance) : rattaché, compté au montant payé', fn: () => {
    forcerAujourdhui(A);
    try {
      const e = etat();
      const t = saisie(24000, 'logement', '2026-11-04'); // la veille du salaire : période précédente, loyer du 10 octobre déjà loin
      egal(reconnaitreObligatoire(e, t, A).chargeFixeId, undefined, 'hors période de l’échéance : pas rattaché à la charge');
      const t2 = saisie(24000, 'logement', '2026-11-16');
      const r = noter(e, t2);
      egal(r.niveau, 'sur'); egal(t2.chargeFixeId, 'loyer');
      const loyer = chargesFixesPeriode(e, resteADepenser(e, A).periode).find((c) => c.id === 'loyer');
      egal(loyer.montantPrevuCentimes, 24000);
    } finally { forcerAujourdhui(null); }
  } },
  { nom: 'hors tolérance (montant ou date) et catégorie du quotidien : dépense normale', fn: () => {
    forcerAujourdhui(A);
    try {
      const e = etat();
      // 260 € en logement : plus de 10 % d'écart → pas la charge, mais grosse dépense de logement → probable
      egal(reconnaitreObligatoire(e, saisie(26000, 'logement'), A).chargeFixeId, undefined);
      // Bon montant mais 8 jours après l'échéance
      egal(reconnaitreObligatoire(e, saisie(23000, 'logement', '2026-11-18'), A).chargeFixeId, undefined);
      // Bon montant, bonne date, mais des courses : rien
      const c = saisie(23000, 'courses');
      const r = noter(e, c);
      egal(r.niveau, null); egal(c.chargeFixeId, null); egal(c.horsPartDuJour, undefined);
      vrai(estDepenseQuotidienne(c));
      egal(jaugeDuJour(e, A, null).depensesDuJourCentimes, 23000, 'compte dans la journée');
      // Petite dépense de téléphonie (sous 3 parts du jour, loin du forfait) : du quotidien
      egal(reconnaitreObligatoire(e, saisie(800, 'telephonie'), A).niveau, null);
      // Une entrée, un virement d'épargne, une envie : jamais
      egal(reconnaitreObligatoire(e, saisie(23000, 'logement', A, { sens: 'credit' }), A).niveau, null);
      egal(reconnaitreObligatoire(e, saisie(23000, 'logement', A, { epargne: true }), A).niveau, null);
      egal(reconnaitreObligatoire(e, saisie(23000, 'logement', A, { extra: { envieId: 'e1' } }), A).niveau, null);
    } finally { forcerAujourdhui(null); }
  } },
  { nom: 'probable : grosse dépense d’une catégorie obligatoire sans charge, hors journée, puis ta réponse', fn: () => {
    forcerAujourdhui(A);
    try {
      const e = etat();
      const avant = jaugeDuJour(e, A, null);
      const t = saisie(9000, 'energie'); // 90 € ≥ 3 × 12,12 €
      const r = noter(e, t);
      egal(r.niveau, 'probable'); egal(r.chargeFixeId, undefined);
      vrai(/3 fois ta part du jour/.test(r.raison), r.raison);
      egal(t.horsPartDuJour, true); egal(t.obligatoireProbable, true);
      const j = jaugeDuJour(e, A, avant.instantane);
      egal(j.depensesDuJourCentimes, 0, 'pas dans la journée');
      const rd = resteADepenser(e, A);
      vrai(rd.charges.some((c) => c.transactionId === t.id && c.montantPrevuCentimes === 9000), 'comptée avec les charges du mois');
      // Sous le seuil : rien
      egal(reconnaitreObligatoire(e, saisie(3500, 'energie'), A).niveau, null, '35 € < 3 parts du jour');
      // Oui → reste hors journée, la question disparaît ; Non → redevient une dépense du quotidien
      const oui = reponseObligatoire(t, true);
      egal(oui.horsPartDuJour, true); egal(oui.obligatoireProbable, undefined);
      const non = reponseObligatoire(t, false);
      egal(non.horsPartDuJour, false); egal(non.obligatoireProbable, undefined); vrai(estDepenseQuotidienne(non));
      // Catégorie « Autres » au montant et à la date du loyer : probable, la charge est proposée puis détachée si « non »
      const a = saisie(23000, 'autres');
      const ra = reconnaitreObligatoire(e, a, A);
      egal(ra.niveau, 'probable'); egal(ra.chargeFixeId, 'loyer');
      appliquerObligatoire(a, ra);
      egal(a.chargeFixeId, 'loyer'); egal(a.obligatoireProbable, true);
      const an = reponseObligatoire(a, false);
      egal(an.chargeFixeId, null); vrai(estDepenseQuotidienne(an));
    } finally { forcerAujourdhui(null); }
  } },
  { nom: 'abonnement repéré (téléphonie au montant du forfait) : sûr, la charge est marquée payée', fn: () => {
    forcerAujourdhui(A);
    try {
      const e = etat();
      const t = saisie(1550, 'telephonie'); // 15,50 € à 10 % du forfait de 15 €, loin de son échéance du 20
      const r = noter(e, t);
      egal(r.niveau, 'sur'); egal(r.chargeFixeId, 'forfait'); vrai(/Forfait mobile/.test(r.raison), r.raison);
      // Abonnement sans charge fixe, retrouvé par son nom dans les paiements « abonnements »
      const e2 = etat({ transactions: [tx({ date: '2026-10-12', montant: 999, categorie: 'abonnements', marchand: 'Musique Exemple' })] });
      const t2 = tx({ date: A, montant: 999, categorie: 'loisirs', marchand: 'Musique Exemple' });
      const r2 = noter(e2, t2);
      egal(r2.niveau, 'sur'); egal(t2.horsPartDuJour, true); egal(t2.chargeFixeId, null);
      // Même montant, autre nom, catégorie du quotidien : rien
      egal(reconnaitreObligatoire(e2, tx({ date: A, montant: 999, categorie: 'loisirs', marchand: 'Cinema Exemple' }), A).niveau, null);
    } finally { forcerAujourdhui(null); }
  } },
  { nom: 'import qui retrouve la même opération : chargeFixeId et horsPartDuJour gardés', fn: () => {
    const loyer = saisie(23000, 'logement', A, { extra: { chargeFixeId: 'loyer' } });
    loyer.chargeFixeId = 'loyer';
    const facture = saisie(9000, 'energie', A, { extra: { horsPartDuJour: true, obligatoireProbable: true } });
    for (const t of [loyer, facture]) t.empreinteDedoublonnage = empreinte(t);
    const ligne = (montant, date) => { const t = tx({ date, montant, categorie: 'autres', marchand: 'PRLV EXEMPLE BAILLEUR', source: 'import' }); t.importId = 'imp1'; t.empreinteDedoublonnage = empreinte(t); return t; };
    const { nouvelles, rapprochees } = dedoublonner([ligne(23000, '2026-11-10'), ligne(9000, '2026-11-11')], [loyer, facture]);
    egal(nouvelles.length, 0); egal(rapprochees.length, 2);
    const fusion = rapprochees.map(({ existante, importee }) => fusionnerRapprochement(existante, importee));
    egal(fusion[0].chargeFixeId, 'loyer'); egal(fusion[0].source, 'import');
    egal(fusion[1].horsPartDuJour, true); egal(fusion[1].obligatoireProbable, true);
    // Le rattachement des nouvelles lignes ne touche pas une opération déjà rattachée
    rattacherChargesFixes(fusion, [{ id: 'autre', motifDetection: 'PRLV EXEMPLE BAILLEUR', actif: true }]);
    egal(fusion[0].chargeFixeId, 'loyer');
  } },
  { nom: 'sauvegarde : export → lecture garde les champs (aucune migration, contenu inchangé)', fn: () => {
    const e = etat();
    const t1 = saisie(23000, 'logement'); t1.chargeFixeId = 'loyer';
    const t2 = saisie(9000, 'energie', A, { extra: { horsPartDuJour: true, obligatoireProbable: true } });
    const t3 = saisie(5000, 'impots', A, { extra: { horsPartDuJour: false } });
    e.transactions.push(t1, t2, t3);
    const exp = construireExport(e, { maintenant: `${A}T18:00:00.000Z` });
    const lu = lireSauvegarde(copie(exp));
    vrai(lu.ok, lu.erreurs?.join(' ; ')); egal(lu.migrations.length, 0);
    const parId = new Map(lu.contenu.transactions.map((t) => [t.id, t]));
    egal(parId.get(t1.id).chargeFixeId, 'loyer');
    egal(parId.get(t2.id).horsPartDuJour, true); egal(parId.get(t2.id).obligatoireProbable, true);
    egal(parId.get(t3.id).horsPartDuJour, false);
    egalProfond(Object.keys(exp.contenu).sort(), Object.keys(construireExport(etat(), { maintenant: `${A}T18:00:00.000Z` }).contenu).sort(), 'mêmes rubriques');
  } },
  { nom: 'dans l’app (base en mémoire) : ajouterTransaction rattache le loyer, confirmerObligatoire, restauration puis rechargement', fn: async () => {
    if (!estNode) return; // Dans Safari, la vraie base contient tes données : ce test ne tourne que sous Node
    const { fausseIndexedDB } = await import('../outils/fausse-idb.mjs');
    const avantIdb = globalThis.indexedDB;
    globalThis.indexedDB = fausseIndexedDB();
    forcerAujourdhui(A);
    const store = await import('../../js/store.js');
    const actions = await import('../../js/actions.js');
    try {
      await store.effacerTout();
      await store.remplacerTout(copie(etat()));
      const avant = jaugeDuJour(store.etat, A, null);
      const loyer = actions.nouvelleTransaction({ sens: 'debit', montantCentimes: 23000, categorie: 'logement', date: A });
      egal(loyer.marchand, 'Dépense', 'sans libellé');
      await actions.ajouterTransaction(loyer);
      egal(loyer.chargeFixeId, 'loyer');
      const apres = jaugeDuJour(store.etat, A, avant.instantane);
      egal(apres.restantAujourdhuiCentimes, avant.restantAujourdhuiCentimes, 'part du jour intacte');
      const facture = actions.nouvelleTransaction({ sens: 'debit', montantCentimes: 9000, categorie: 'energie', date: A });
      await actions.ajouterTransaction(facture);
      egal(facture.obligatoireProbable, true);
      const non = await actions.confirmerObligatoire(facture.id, false);
      egal(non.horsPartDuJour, false);
      egal(jaugeDuJour(store.etat, A, null).depensesDuJourCentimes, 9000, '« non » : dans la journée');
      await actions.confirmerObligatoire(facture.id, true);
      const exp = construireExport(store.etat, { maintenant: `${A}T18:00:00.000Z` });
      await store.effacerTout();
      const lu = lireSauvegarde(copie(exp));
      await store.remplacerTout(lu.contenu);
      await store.charger();
      const parId = new Map(store.etat.transactions.map((t) => [t.id, t]));
      egal(parId.get(loyer.id).chargeFixeId, 'loyer');
      egal(parId.get(facture.id).horsPartDuJour, true); egal(parId.get(facture.id).obligatoireProbable, undefined);
      egal(jaugeDuJour(store.etat, A, null).depensesDuJourCentimes, 0, 'après restauration : toujours hors journée');
    } finally {
      await store.effacerTout();
      forcerAujourdhui(null);
      if (avantIdb === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = avantIdb;
    }
  } },
  { nom: 'sauvegarde synthétique : reste du mois et part du jour identiques à avant la livraison (rien n’est concerné)', fn: () => {
    // Chiffres relevés avec la version 1.40.0 sur la sauvegarde inventée (graine 42) : aucune opération n'a horsPartDuJour,
    // les calculs de l'app d'origine ne doivent pas bouger.
    const c = genererSauvegarde().contenu;
    const R = REFERENCE_DEFAUT;
    const attendus = [[R, 6101, 69113, 27543, 11000, 377, -1823], [ajouterJours(R, -20), -49844, 69113, 81671, 0, -3796, -4296], [ajouterJours(R, -40), -35799, 64816, 81470, 0, -34049, -35799]];
    try {
      for (const [d, reste, charges, variables, epargne, part, restant] of attendus) {
        forcerAujourdhui(d);
        const r = resteADepenser(c, d); const j = jaugeDuJour(c, d, null);
        egalProfond([r.resteCentimes, r.chargesCentimes, r.depensesVariablesCentimes, r.epargneCibleCentimes, j.parJourCentimes, j.restantAujourdhuiCentimes], [reste, charges, variables, epargne, part, restant], d);
        // horsPartDuJour: false partout ne change rien non plus
        const c2 = { ...c, transactions: c.transactions.map((t) => ({ ...t, horsPartDuJour: false })) };
        egal(resteADepenser(c2, d).resteCentimes, reste); egal(jaugeDuJour(c2, d, null).restantAujourdhuiCentimes, restant);
      }
    } finally { forcerAujourdhui(null); }
  } },
  ...nouveaux,
];
