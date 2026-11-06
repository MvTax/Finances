// capture.mjs — dépenses lues sur une capture d'écran (lignes telles que les rend la lecture sur le téléphone).
import { egal, vrai } from '../outils/assert.mjs';
import { extraireOperations, montantsDansLigne, dateDansTexte, fusionnerCaptures, dejaPresente, devinerBanque, estNouvelle } from '../../js/capture.js';
import { validerCapture } from '../../js/ia.js';

const AUJ = '2026-11-06'; // un vendredi
const resume = (r) => r.operations.map((o) => `${o.sens === 'debit' ? '-' : '+'}${o.montantCentimes}|${o.libelle}|${o.date}`).join(' ; ');

export default [
  { nom: 'montants : signe, milliers, décimales à point ou virgule, € avant ou après', fn: () => {
    egal(montantsDansLigne('Uber Eats -18,90 €')[0].centimes, 1890);
    egal(montantsDansLigne('Uber Eats -18,90 €')[0].signe, '-');
    egal(montantsDansLigne('CB SNCF -1 049,00 €')[0].centimes, 104900);
    egal(montantsDansLigne('Total 1.049,00 €')[0].centimes, 104900);
    egal(montantsDansLigne('Virement +20 €')[0].signe, '+');
    egal(montantsDansLigne('€12.50 Starbucks')[0].centimes, 1250);
    egal(montantsDansLigne('12:41').length, 0, 'une heure n’est pas un montant');
    egal(montantsDansLigne('05/11 réf 123456').length, 0, 'un nombre sans € n’est pas un montant');
  } },
  { nom: 'dates : relatives, jour de la semaine, « 3 novembre », « 05/11 », année précédente si futur', fn: () => {
    egal(dateDansTexte('Aujourd’hui', AUJ), AUJ);
    egal(dateDansTexte('Hier', AUJ), '2026-11-05');
    egal(dateDansTexte('Mardi', AUJ), '2026-11-03');
    egal(dateDansTexte('Vendredi', AUJ), '2026-10-30', 'aujourd’hui serait écrit « Aujourd’hui »');
    egal(dateDansTexte('Mardi 3 novembre', AUJ), '2026-11-03');
    egal(dateDansTexte('Commande du 4 nov. 2026', AUJ), '2026-11-04');
    egal(dateDansTexte('05/11', AUJ), '2026-11-05');
    egal(dateDansTexte('28/12', AUJ), '2025-12-28');
    egal(dateDansTexte('Netflix', AUJ), null);
  } },
  { nom: 'liste d’appli bancaire : en-têtes de date, heures et sous-titres ignorés, entrée reconnue', fn: () => {
    const r = extraireOperations(["Aujourd'hui", 'Uber Eats -18,90 €', '12:41', 'Franprix -6,35 €', '09:05', 'Hier', 'Navigo -2,50 €', '18:22', 'Virement de Alex +20 €', '10:00', 'Mardi 3 novembre', "McDonald's -11,40 €", '21:14', 'Netflix -13,49 €', 'Abonnement'], AUJ);
    egal(r.mode, 'liste');
    egal(resume(r), "-1890|Uber Eats|2026-11-06 ; -635|Franprix|2026-11-06 ; -250|Navigo|2026-11-05 ; +2000|Virement de Alex|2026-11-05 ; -1140|McDonald's|2026-11-03 ; -1349|Netflix|2026-11-03");
  } },
  { nom: 'relevé de banque : solde ignoré, date en début de ligne, préfixe CB collé séparé', fn: () => {
    const r = extraireOperations(['Solde disponible', '1 234,56 €', '05/11 CB CARREFOUR CITY -23,40 €', '04/11  PRLV SEPA FREE MOBILE -19,99 €', '04/11 CBLIDL -42,17 €'], AUJ);
    egal(resume(r), '-2340|CB CARREFOUR CITY|2026-11-05 ; -1999|PRLV SEPA FREE MOBILE|2026-11-04 ; -4217|CB LIDL|2026-11-04');
  } },
  { nom: 'reçu ou commande : une seule dépense, le total, avec le nom et la date du reçu', fn: () => {
    const r = extraireOperations(['Uber Eats', 'Commande du 4 novembre 2026', '1 x Menu 9,90 €', '1 x Sundae 3,20 €', 'Frais de livraison 2,49 €', 'Total 15,59 €'], AUJ);
    egal(r.mode, 'recu');
    egal(resume(r), '-1559|Uber Eats|2026-11-04');
  } },
  { nom: 'nom et montant sur deux lignes ; capture sans date → aujourd’hui, signalé', fn: () => {
    const r = extraireOperations(['Uber Eats', '-18,90 €', 'Lydia', '+5,00 €'], AUJ);
    egal(resume(r), '-1890|Uber Eats|2026-11-06 ; +500|Lydia|2026-11-06');
    vrai(r.operations.every((o) => o.dateDevinee));
  } },
  { nom: 'plusieurs captures qui se chevauchent : chaque opération une seule fois', fn: () => {
    const a = extraireOperations(['Hier', 'Navigo -2,50 €', 'Franprix -6,35 €'], AUJ).operations;
    const b = extraireOperations(['Hier', 'Franprix -6,35 €', 'Lidl -12,00 €'], AUJ).operations;
    egal(fusionnerCaptures([a, b]).length, 3);
    const flou = extraireOperations([{ texte: 'Hier', confiance: 96 }, { texte: 'Navigo 12,50 €', confiance: 70 }], AUJ).operations;
    vrai(flou[0].incertain, 'ligne mal lue signalée');
    egal(fusionnerCaptures([a, flou]).length, 2, 'la lecture incertaine d’une opération déjà lue nettement est écartée');
  } },
  { nom: 'opération déjà dans l’app (même montant à 3 jours près) repérée ; banque devinée', fn: () => {
    const etat = { transactions: [{ id: 't1', sens: 'debit', montantCentimes: 635, date: '2026-11-04', libelle: 'Franprix' }] };
    egal(dejaPresente(etat, { sens: 'debit', montantCentimes: 635, date: '2026-11-05' })?.id, 't1');
    egal(dejaPresente(etat, { sens: 'debit', montantCentimes: 636, date: '2026-11-05' }), null);
    egal(devinerBanque(['Revolut', 'Uber Eats -18,90 €']), 'revolut');
    egal(devinerBanque(['05/11 CB CARREFOUR -23,40 €']), 'lcl');
  } },
  { nom: 'réponse Gemini validée : montants invalides retirés, catégorie inconnue remplacée', fn: () => {
    const v = validerCapture({ banque: 'revolut', operations: [
      { sens: 'debit', montantCentimes: 1890, libelle: 'Uber Eats', marchand: 'Uber Eats', categorie: 'livraison', date: '2026-11-06', confiance: 0.9 },
      { sens: 'debit', montantCentimes: -5, libelle: 'X', categorie: 'courses', date: '2026-11-06' },
      { sens: 'debit', montantCentimes: 500, libelle: 'Y', categorie: 'nimporte', date: '2026-11-06' }] });
    egal(v.banque, 'revolut');
    egal(v.operations.length, 2);
    egal(v.operations[1].categorie, 'autres');
    egal(validerCapture({}), null);
  } },
  { nom: 'nouvelles dépenses : encadrées 24 h après l’ajout, puis dans la liste normale', fn: () => {
    const le = '2026-11-06T10:00:00.000Z';
    const t = { nouveauCapture: { lot: 'cap-1', le } };
    vrai(estNouvelle(t, Date.parse(le) + 3600e3));
    vrai(!estNouvelle(t, Date.parse(le) + 25 * 3600e3));
    vrai(!estNouvelle({}, Date.parse(le)), 'une dépense saisie autrement n’est jamais « nouvelle »');
  } },
];
