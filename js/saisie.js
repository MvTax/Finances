// saisie.js — analyse locale d'une phrase tapée ou dictée au clavier (sans IA).
// « 4,89 Lidl », « deux fois 3,20 café hier », « j'ai reçu 20 balles de ma sœur », « 12 € Uber samedi dernier ».

import { extraireMontantPhrase } from './money.js';
import { extraireDatePhrase, aujourdhui } from './dates.js';
import { MOT_REVOLUT } from './revolut.js';

const MOTS_CREDIT = /\b(re[çc]u|recu|reçois|rembours[ée]e? par|m'a (donn[ée]|rendu|vir[ée]|envoy[ée]|rembours[ée])|salaire|prime|gagn[ée]|vendu|vente|entr[ée]e)\b/i;
// Limites de mot « unicode » : sans elles, « ma » serait retiré de « cinéma » (le é n'est pas une lettre pour \b)
const MOTS_VIDES = /(?<![\p{L}'])(j'ai|jai|j ai|d[ée]pens[ée]|pay[ée]|achet[ée]|pris|un|une|des|de|du|le|la|les|l'|au|aux|à|a|en|pour|chez|ce|cet|cette|matin|midi|soir|euros?|balles?|€|re[çc]u|recu|m'a|ma|mon|mes|sa|son|ses|fois|x|et)(?![\p{L}])/giu;

export function analyserPhrase(texte, ref = aujourdhui()) {
  const original = String(texte || '').trim();
  if (!original) return null;
  // « revolut » : payé avec Revolut. Remplacé par des espaces de même longueur (les positions du montant restent justes)
  const revolut = MOT_REVOLUT.test(original);
  const brut = original.replace(new RegExp(MOT_REVOLUT.source, 'giu'), (x) => ' '.repeat(x.length));
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
    dateExplicite: !!d,
    revolut,
    confiance: m ? (libelle ? 'haute' : 'moyenne') : 'basse',
  };
}

/**
 * Plusieurs opérations dans une phrase : « Vélib' 3 €, menu 9,50 et pain 1,20 » → 3 opérations.
 * Séparateurs : « , » suivi d'un espace (la virgule des centimes n'en a pas), « ; », « et », « puis », « plus », « + », retour à la ligne.
 * Une date dite une fois (« hier ») vaut pour toutes les opérations sans date.
 * @returns {Array} les opérations avec un montant (peut être vide)
 */
export function analyserPhrases(texte, ref = aujourdhui()) {
  const morceaux = String(texte || '')
    .split(/\s*(?:;|\n|,\s+|\s\+\s|\s(?:et|puis|plus|ensuite)\s)\s*/i)
    .map((x) => x.trim()).filter(Boolean);
  const ops = morceaux.map((m) => analyserPhrase(m, ref)).filter((o) => o && o.montantCentimes);
  const dateCommune = ops.find((o) => o.dateExplicite)?.date;
  if (dateCommune) for (const o of ops) if (!o.dateExplicite) o.date = dateCommune;
  // Un morceau sans montant juste avant un montant seul (« pain, 1,20 ») : on rapproche le libellé
  return ops;
}
