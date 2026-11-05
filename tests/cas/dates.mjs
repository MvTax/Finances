import { egal } from '../outils/assert.mjs';
import { parseDateRevolut, parseDateLCL, parseDateSlash, ajouterMoisDate, jourSemaine, debutSemaine, formatDate, extraireDatePhrase, prochainJourSemaine } from '../../js/dates.js';

export default [
  { nom: 'dates : mois abrégés français de Revolut', fn: () => {
    const cas = { '18 nov. 2025': '2025-11-18', '5 janv. 2026': '2026-01-05', '10 févr. 2026': '2026-02-10', '3 mars 2026': '2026-03-03', '1 avr. 2026': '2026-04-01', '7 mai 2026': '2026-05-07', '9 juin 2026': '2026-06-09', '14 juil. 2026': '2026-07-14', '3 août 2026': '2026-08-03', '19 sept. 2003': '2003-09-19', '21 oct. 2026': '2026-10-21', '2 déc. 2025': '2025-12-02' };
    for (const [s, iso] of Object.entries(cas)) egal(parseDateRevolut(s), iso, s);
    egal(parseDateRevolut('31 févr. 2026'), null);
  } },
  { nom: 'dates : passage d’année LCL (ANCIEN SOLDE 31.12 dans le relevé de janvier)', fn: () => {
    egal(parseDateLCL('31.12', '2026-01-30'), '2025-12-31');
    egal(parseDateLCL('02.01', '2026-01-30'), '2026-01-02');
    egal(parseDateLCL('30.01', '2026-02-27'), '2026-01-30');
    egal(parseDateLCL('30.12', '2027-01-29'), '2026-12-30');
  } },
  { nom: 'dates : date d’achat « 30/09/26 », calcul de mois borné, semaine du lundi', fn: () => {
    egal(parseDateSlash('30/09/26'), '2026-09-30'); egal(parseDateSlash('05.10.26'), '2026-10-05');
    egal(ajouterMoisDate('2026-01-31', 1), '2026-02-28');
    egal(jourSemaine('2026-11-05'), 4); egal(debutSemaine('2026-11-08'), '2026-11-02');
    egal(formatDate('2026-11-05'), '05/11/2026');
    egal(prochainJourSemaine('2026-11-05', 4), '2026-11-12');
  } },
  { nom: 'dates : « hier », « avant-hier », « samedi dernier »', fn: () => {
    egal(extraireDatePhrase('hier chez Lidl', '2026-11-05').date, '2026-11-04');
    egal(extraireDatePhrase('avant-hier', '2026-11-05').date, '2026-11-03');
    egal(extraireDatePhrase('samedi dernier', '2026-11-05').date, '2026-10-31');
    egal(extraireDatePhrase('le 3', '2026-11-05').date, '2026-11-03');
  } },
];
