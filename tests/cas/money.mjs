import { egal, vrai } from '../outils/assert.mjs';
import { parseMontant, formatEuros, arrondiEuroSuperieur, extraireMontantPhrase, divArrondiBancaire, repartir, motsVersNombre } from '../../js/money.js';

const NBSP = /[  ]/g;
export default [
  { nom: 'money : « 4,89 », « 4.89 », « 1,70 », « 12 », « 1 234,56 »', fn: () => {
    egal(parseMontant('4,89'), 489); egal(parseMontant('4.89'), 489); egal(parseMontant('1,70'), 170); egal(parseMontant('12'), 1200);
    egal(parseMontant('1 234,56'), 123456); egal(parseMontant('1 234,56 €'), 123456); egal(parseMontant('1.234,56'), 123456); egal(parseMontant('1,234.56'), 123456);
    egal(parseMontant('-14,00€'), -1400); egal(parseMontant('0,1'), 10); egal(parseMontant('+3'), 300);
  } },
  { nom: 'money : textes invalides → null (jamais NaN)', fn: () => {
    for (const s of ['', 'abc', '4,899', '1,2,3', null, undefined, '12a']) egal(parseMontant(s), null, `« ${s} »`);
  } },
  { nom: 'money : aucune erreur flottante (0,1 + 0,2 en centimes)', fn: () => {
    egal(parseMontant('0,10') + parseMontant('0,20'), 30);
    egal(parseMontant('19,99') * 3, 5997);
  } },
  { nom: 'money : formatage fr-FR « 1 234,56 € »', fn: () => {
    egal(formatEuros(123456).replace(NBSP, ' '), '1 234,56 €');
    egal(formatEuros(-2296).replace(NBSP, ' '), '−22,96 €');
    egal(formatEuros(5).replace(NBSP, ' '), '0,05 €');
    egal(formatEuros(100000, { sansCentimes: true }).replace(NBSP, ' '), '1 000 €');
  } },
  { nom: 'money : arrondi à l’euro supérieur', fn: () => {
    egal(arrondiEuroSuperieur(489), 11); egal(arrondiEuroSuperieur(1200), 50); egal(arrondiEuroSuperieur(0), 0); egal(arrondiEuroSuperieur(1), 99); egal(arrondiEuroSuperieur(1599), 1);
  } },
  { nom: 'money : montants parlés (« deux fois 3,20 », « quatre euros cinquante », « 20 balles »)', fn: () => {
    egal(extraireMontantPhrase('deux fois 3,20 café').centimes, 640);
    egal(extraireMontantPhrase('quatre euros cinquante de pain').centimes, 450);
    egal(extraireMontantPhrase("j'ai reçu 20 balles de ma sœur").centimes, 2000);
    egal(extraireMontantPhrase('3 euros 20 au tabac').centimes, 320);
    egal(extraireMontantPhrase('1,70 métro').centimes, 170);
    egal(extraireMontantPhrase('2 x 1,50').centimes, 300);
    egal(motsVersNombre('quatre-vingt-dix-neuf'), 99);
  } },
  { nom: 'money : arrondi bancaire et répartition sans perte de centime', fn: () => {
    egal(divArrondiBancaire(5, 2), 2); egal(divArrondiBancaire(7, 2), 4); egal(divArrondiBancaire(-7, 2), -4); egal(divArrondiBancaire(10, 3), 3);
    const r = repartir(1001, [50, 50]);
    egal(r[0] + r[1], 1001); vrai(Math.abs(r[0] - r[1]) <= 1);
  } },
];
