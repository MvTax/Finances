// saisie.js — analyse locale d'une phrase tapée ou dictée au clavier (sans IA).
// « 4,89 Lidl », « deux fois 3,20 café hier », « j'ai reçu 20 balles de ma sœur », « 12 € Uber samedi dernier ».

import { extraireMontantPhrase } from './money.js';
import { extraireDatePhrase, aujourdhui } from './dates.js';

const MOTS_CREDIT = /\b(re[çc]u|recu|reçois|rembours[ée]e? par|m'a (donn[ée]|rendu|vir[ée]|envoy[ée]|rembours[ée])|salaire|prime|gagn[ée]|vendu|vente|entr[ée]e)\b/i;
const MOTS_VIDES = /\b(j'ai|jai|j ai|d[ée]pens[ée]|pay[ée]|achet[ée]|pris|un|une|des|de|du|le|la|les|l'|au|aux|à|a|en|pour|chez|ce|cet|cette|matin|midi|soir|euros?|balles?|€|re[çc]u|recu|m'a|ma|mon|mes|sa|son|ses|fois|x|et)\b/gi;

export function analyserPhrase(texte, ref = aujourdhui()) {
  const brut = String(texte || '').trim();
  if (!brut) return null;
  const m = extraireMontantPhrase(brut);
  const d = extraireDatePhrase(brut, ref);
  let reste = brut;
  if (m) reste = (' ' + reste + ' ').slice(0, m.debut + 1) + ' ' + (' ' + reste + ' ').slice(m.fin + 1);
  if (d) reste = reste.replace(d.motif, ' ');
  const chez = reste.match(/\b(?:chez|au|à la|a la|à|de)\s+([A-Za-zÀ-ÿ'’&.-]+(?:\s+[A-Za-zÀ-ÿ'’&.-]+){0,2})/i);
  let libelle = (chez ? chez[1] : reste).replace(MOTS_VIDES, ' ').replace(/[,;:!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!libelle && chez) libelle = chez[1];
  libelle = libelle.replace(/^./, (c) => c.toUpperCase());
  return {
    sens: MOTS_CREDIT.test(brut) ? 'credit' : 'debit',
    montantCentimes: m ? m.centimes : null,
    libelle,
    date: d ? d.date : ref,
    confiance: m ? (libelle ? 'haute' : 'moyenne') : 'basse',
  };
}
