// jeu.js — la couche « jeu » du style Joyeux : points (XP), niveaux, série de jours, quêtes du jour.
// Tout est recalculé depuis les données (rien à tricher, rien à perdre) à partir du début du jeu
// (le salaire du mois où le style Joyeux a été découvert).
//
// Points :
//  +5   par dépense notée à la main (au plus 6 par jour)          +10 par jour où tu as noté au moins une dépense
//  +10  par « Je me suis privé »                                    +15 par jour fini sous ta part (reste du jour à 5 h)
//  +40  par journée sans dépense tenue                              +25 par jour de virement vers l'épargne
// Série : jours d'affilée où tu es passé dans l'app ou as noté quelque chose (aujourd'hui compte dès que c'est fait).

import { jaugeDuJour } from './calculs.js';
import { ajouterJours, diffJours } from './dates.js';

export const NIVEAUX = [
  { xp: 0, nom: 'Petite pièce', emoji: '🪙' },
  { xp: 150, nom: 'Tirelire', emoji: '🐷' },
  { xp: 400, nom: 'Écureuil malin', emoji: '🐿️' },
  { xp: 800, nom: 'Coffre-fort', emoji: '🔐' },
  { xp: 1400, nom: 'Gardien du trésor', emoji: '💎' },
  { xp: 2200, nom: 'Légende de l’épargne', emoji: '🏆' },
];

export const POINTS = { saisie: 5, saisiesMaxJour: 6, jourNote: 10, privation: 10, resteDuJour: 15, sansDepense: 40, virement: 25 };
const SOURCES_MAIN = new Set(['saisie', 'manuel', 'texte', 'voix', 'phrase', 'photo', 'capture', 'express', 'clavier', 'ia']);

/** Une dépense notée par la personne (pas un relevé importé, pas un ajustement, pas un virement). Une saisie rapprochée d'un relevé
 *  garde sa source d'origine dans sourceInitiale : elle compte toujours. */
export const estSaisie = (t) => t.sens === 'debit' && !t.ajustement && !t.epargne?.estEpargne && !t.virementInterne?.estInterne && SOURCES_MAIN.has(t.sourceInitiale || t.source);

/** Les jours « actifs » : app ouverte (meta.joursVus) ou dépense notée. */
function joursActifs(etat) {
  const jours = new Set(etat.meta?.joursVus || []);
  for (const t of etat.transactions || []) if (estSaisie(t)) jours.add(t.date);
  for (const p of etat.privations || []) if (!p.auto && p.source !== 'resteJour') jours.add(p.date);
  return jours;
}

/**
 * Points, niveau, série.
 * @returns {{ xp, niveau, prochain, progression (0..1), serie, details: Record<string, number>, depuis }}
 */
export function profilJeu(etat, aujourdhuiIso) {
  const depuis = etat.meta?.jeu?.depuis || aujourdhuiIso;
  const details = { saisies: 0, joursNotes: 0, privations: 0, restes: 0, sansDepense: 0, virements: 0 };
  const parJour = new Map();
  for (const t of etat.transactions || []) {
    if (t.date < depuis || t.date > aujourdhuiIso || !estSaisie(t)) continue;
    parJour.set(t.date, (parJour.get(t.date) || 0) + 1);
  }
  for (const n of parJour.values()) { details.saisies += Math.min(n, POINTS.saisiesMaxJour) * POINTS.saisie; details.joursNotes += POINTS.jourNote; }
  for (const p of etat.privations || []) {
    if (p.date < depuis || p.date > aujourdhuiIso || p.auto) continue;
    if (p.source === 'resteJour') { if (p.montantCentimes > 0) details.restes += POINTS.resteDuJour; } else details.privations += POINTS.privation;
  }
  const annonces = etat.meta?.sansDepense?.jours || {};
  for (const jour of Object.keys(annonces)) {
    if (jour < depuis || jour >= aujourdhuiIso) continue;
    const dep = (etat.transactions || []).some((t) => t.date === jour && t.sens === 'debit' && !t.ajustement && !t.epargne?.estEpargne && !t.virementInterne?.estInterne && !t.chargeFixeId && t.categorie !== 'abonnements');
    if (!dep) details.sansDepense += POINTS.sansDepense;
  }
  const joursVirement = new Set((etat.transactions || []).filter((t) => t.date >= depuis && t.date <= aujourdhuiIso && t.epargne?.estEpargne && t.sens === 'debit').map((t) => t.date));
  details.virements = joursVirement.size * POINTS.virement;
  const xp = Object.values(details).reduce((s, x) => s + x, 0);
  let i = 0;
  while (i + 1 < NIVEAUX.length && xp >= NIVEAUX[i + 1].xp) i += 1;
  const niveau = { ...NIVEAUX[i], numero: i + 1 };
  const prochain = NIVEAUX[i + 1] ? { ...NIVEAUX[i + 1], numero: i + 2 } : null;
  const progression = prochain ? (xp - niveau.xp) / (prochain.xp - niveau.xp) : 1;
  return { xp, niveau, prochain, progression, serie: serieJours(etat, aujourdhuiIso), details, depuis };
}

/** Série : jours d'affilée actifs, jusqu'à aujourd'hui (ou hier si aujourd'hui n'est pas encore fait). */
export function serieJours(etat, aujourdhuiIso) {
  const actifs = joursActifs(etat);
  let d = actifs.has(aujourdhuiIso) ? aujourdhuiIso : ajouterJours(aujourdhuiIso, -1);
  let n = 0;
  while (actifs.has(d) && n < 1000) { n += 1; d = ajouterJours(d, -1); }
  return n;
}

/**
 * Les 3 quêtes du jour.
 * @returns {Array<{ id, titre, aide, xp, faite: boolean, enCours?: boolean }>}
 */
export function quetesDuJour(etat, aujourdhuiIso) {
  const saisies = (etat.transactions || []).filter((t) => t.date === aujourdhuiIso && estSaisie(t)).length;
  const annonce = !!etat.meta?.sansDepense?.jours?.[aujourdhuiIso];
  const privee = (etat.privations || []).some((p) => p.date === aujourdhuiIso && !p.auto && p.source !== 'resteJour');
  const j = jaugeDuJour(etat, aujourdhuiIso, etat.meta?.jauge || null);
  const sous = j.restantAujourdhuiCentimes >= 0;
  return [
    { id: 'noter', titre: annonce && !saisies ? 'Journée sans dépense annoncée' : 'Note ce que tu dépenses', aide: saisies ? `${saisies} dépense${saisies > 1 ? 's' : ''} notée${saisies > 1 ? 's' : ''}` : annonce ? 'Rien à noter si tu tiens' : 'Même 1 €, ça compte', xp: POINTS.jourNote, faite: saisies > 0 || annonce },
    { id: 'tenir', titre: 'Reste sous ta part du jour', aide: sous ? 'Validée à 5 h demain si ça tient' : 'Raté pour aujourd’hui, demain ça repart', xp: POINTS.resteDuJour, faite: false, enCours: sous, ratee: !sous },
    { id: 'piece', titre: 'Mets une pièce de côté', aide: privee ? 'Bien joué !' : '« Je me suis privé » d’un café, d’un menu…', xp: POINTS.privation, faite: privee },
  ];
}

/** Humeur de la mascotte selon ce qui reste aujourd'hui (rapport à la part du jour). */
export function humeur(restantCentimes, partCentimes) {
  if (restantCentimes < 0) return 'triste';
  if (partCentimes <= 0) return 'inquiete';
  const r = restantCentimes / partCentimes;
  return r >= 0.66 ? 'ravie' : r >= 0.33 ? 'contente' : r > 0 ? 'inquiete' : 'pile';
}

export { diffJours };
