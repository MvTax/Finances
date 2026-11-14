// jour.js (v200) — ce que montre l'écran Aujourd'hui : la bulle (ce que tu peux encore dépenser) et UNE phrase du jour.
// Fonctions pures : l'état et la journée de budget (aujourdhui(), de 5 h à 5 h) sont passés en paramètres.
// Les chiffres viennent des calculs communs (jaugeDuJour, preventions, partage du reste) : rien n'est recalculé autrement.

import { jaugeDuJour } from '../../calculs.js';
import { serieJours, estSaisie } from '../../jeu.js';
import { partageDuReste } from '../../v100/strategie/explications.js';
import { preventions } from './resume.js';
import { eur } from './commun.js';

/** Préventions assez urgentes pour passer avant la série et le partage du soir. */
const URGENTES = ['prelevement-non-couvert', 'charge-proche'];

/**
 * La bulle du jour.
 * @returns {{ etat: 'vide'|'ok'|'jour-depasse'|'mois-depasse', montantCentimes: number, part: number, parJourCentimes: number, jauge }}
 *   part : ce qui reste de la part du jour (1 = intacte, 0 = rien ou dépassée), pour le soleil.
 */
export function bulleDuJour(etat, auj) {
  const j = jaugeDuJour(etat, auj, etat.meta?.jauge || null);
  const r = j.reste;
  if (!r.revenus.totalCentimes && !(etat.transactions || []).length) return { etat: 'vide', montantCentimes: 0, part: 1, parJourCentimes: 0, jauge: j };
  const dispo = j.restantAujourdhuiCentimes;
  if (r.resteCentimes < 0) return { etat: 'mois-depasse', montantCentimes: -r.resteCentimes, part: 0, parJourCentimes: j.parJourCentimes, jauge: j };
  if (dispo < 0) return { etat: 'jour-depasse', montantCentimes: -dispo, part: 0, parJourCentimes: j.parJourCentimes, jauge: j };
  const part = j.parJourCentimes > 0 ? Math.min(1, dispo / j.parJourCentimes) : 0;
  return { etat: 'ok', montantCentimes: dispo, part, parJourCentimes: j.parJourCentimes, jauge: j };
}

/** Une dépense notée à la main ou une privation aujourd'hui (ce qui allume la flamme du jour). */
export function noteAujourdhui(etat, auj) {
  return (etat.transactions || []).some((t) => t.date === auj && estSaisie(t))
    || (etat.privations || []).some((p) => p.date === auj && !p.auto && p.source !== 'resteJour');
}

/** « Sécurité, Prêt et Envie » (seulement les pots qui reçoivent quelque chose). */
function listePots(noms) {
  if (noms.length <= 1) return noms.join('');
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

/**
 * La phrase du jour, une seule, par ordre d'importance :
 *  1. un prélèvement non couvert ou une charge qui passe dans les 4 jours ;
 *  2. la série de flammes à garder (rien noté aujourd'hui) ;
 *  3. ce que le reste de la journée apportera ce soir (Sécurité, Prêt, Envie) ;
 *  4. une autre prévention (jour cher demain, envie presque atteinte) ;
 *  5. la série (déjà notée aujourd'hui) ; sinon une invitation à noter.
 * @returns {{ type: string, emoji: string, phrase: string } | null}  null quand l'app n'a encore aucune donnée.
 */
export function phraseDuJour(etat, auj) {
  const b = bulleDuJour(etat, auj);
  if (b.etat === 'vide') return null;
  const prev = preventions(etat, auj);
  const urgente = prev.find((p) => URGENTES.includes(p.type));
  if (urgente) return { type: urgente.type, emoji: urgente.type === 'prelevement-non-couvert' ? '⚠️' : '📅', phrase: urgente.phrase };

  const serie = serieJours(etat, auj);
  const note = noteAujourdhui(etat, auj);
  if (serie >= 1 && !note) return { type: 'serie-a-garder', emoji: '🔥', phrase: `${serie} jour${serie > 1 ? 's' : ''} de suite : note une dépense aujourd’hui pour garder ta série.` };

  if (b.etat === 'ok' && b.montantCentimes > 0) {
    const pt = partageDuReste(etat, auj, b.montantCentimes);
    const noms = [pt.securiteCentimes > 0 ? 'Sécurité' : null, pt.pretCentimes > 0 ? 'Prêt' : null, pt.envieCentimes > 0 ? 'Envie' : null].filter(Boolean);
    const total = pt.securiteCentimes + pt.pretCentimes + pt.envieCentimes;
    if (noms.length && total > 0) return { type: 'ce-soir', emoji: '🌙', phrase: `Ce soir, ${eur(total)} ${total >= 200 ? 'iront' : 'ira'} à ${listePots(noms)}, si tu ne dépenses plus rien.` };
  }

  const autre = prev[0];
  if (autre) return { type: autre.type, emoji: autre.type.startsWith('envie') ? '🎁' : '📅', phrase: autre.phrase };
  if (serie >= 1) return { type: 'serie', emoji: '🔥', phrase: `${serie} jour${serie > 1 ? 's' : ''} de suite. Continue comme ça\u202f!` };
  return { type: 'inviter', emoji: '✍️', phrase: 'Note ce que tu dépenses : deux gestes suffisent.' };
}
