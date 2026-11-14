// obligatoires.mjs — dépenses obligatoires reconnues à la saisie (js/obligatoires.js) : comptées dans le mois,
// pas dans la part du jour. Dates fixes, montants inventés.
import { egal, vrai, egalProfond } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { estNode } from '../outils/env.mjs';
import { reconnaitreObligatoire, appliquerObligatoire, reponseObligatoire, montantProche } from '../../js/obligatoires.js';
import { resteADepenser, jaugeDuJour, chargesFixesPeriode, depensesVariables, estDepenseQuotidienne } from '../../js/calculs.js';
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
];
