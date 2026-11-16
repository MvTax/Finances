// jour.js (v200) — ce que montre l'écran Aujourd'hui : la bulle (ce que tu peux encore dépenser) et UNE phrase du jour.
// Fonctions pures : l'état et la journée de budget (aujourdhui(), de 5 h à 5 h) sont passés en paramètres.
// Les chiffres viennent des calculs communs (jaugeDuJour, preventions, partage du reste) : rien n'est recalculé autrement.

import { jaugeDuJour, soldes } from '../../calculs.js';
import { ajouterJours } from '../../dates.js';
import { risqueDuMois } from './risques.js';
import { serieJours, estSaisie } from '../../jeu.js';
import { partageDuReste } from './explications.js';
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

/**
 * Le reste du mois jusqu'au salaire, avec une couleur et une phrase courte.
 * Montant : le reste à dépenser de la période (resteADepenser), celui de la jauge si elle est donnée.
 * Couleur : rouge si le mois est dépassé ou si le risque du mois est « risque » ; orange si « attention » ou si
 * l'épargne visée du mois est entamée ; sinon vert. Pas assez de jours notés : seuls le dépassement et l'épargne
 * entamée comptent (le risque n'est pas encore fiable).
 * @param jauge  jaugeDuJour(etat, auj, …) déjà calculée (sinon calculée ici)
 * @returns {{ montantCentimes, couleur: 'vert'|'orange'|'rouge', depasse, joursRestants, salaireLe, phrase }}
 */
export function resteDuMois(etat, auj, jauge = null) {
  const j = jauge || jaugeDuJour(etat, auj, etat.meta?.jauge || null);
  const r = j.reste;
  const montant = r.resteCentimes;
  const depasse = montant < 0;
  const niveau = risqueDuMois(etat, auj).niveau;
  const fiable = niveau !== 'pas-assez';
  const epargneEntamee = r.epargneCibleCentimes < r.epargneViseeCentimes;
  const salaireLe = r.periode.salaireAttenduLe || ajouterJours(r.periode.fin, 1);
  let couleur = 'vert';
  let phrase = 'Ça tient jusqu’au salaire.';
  if (depasse) { couleur = 'rouge'; phrase = `Mois dépassé de ${eur(-montant)}.`; }
  else if (fiable && niveau === 'risque') { couleur = 'rouge'; phrase = 'Ça risque de coincer avant le salaire.'; }
  else if (epargneEntamee) { couleur = 'orange'; phrase = 'Attention : ton épargne du mois est entamée.'; }
  else if (fiable && niveau === 'attention') { couleur = 'orange'; phrase = 'Attention : ça passe juste jusqu’au salaire.'; }
  return { montantCentimes: montant, couleur, depasse, joursRestants: j.joursRestants, salaireLe, phrase };
}

/** Comptes de dépense : le compte courant et la néobanque (pas l'épargne, pas les espèces). */
export const TYPES_COMPTES_DEPENSE = ['courant', 'neobanque'];

/**
 * Ce qu'il y a en ce moment sur tes comptes de dépense : la somme des soldes du compte courant et de la néobanque,
 * calculés comme partout dans l'app (soldes() de calculs.js : solde de départ, opérations jusqu'au jour, ajustement
 * de solde compris). L'épargne et les poches ne comptent pas.
 * @returns {{ soldeCentimes: number, negatif: boolean, comptes: Array<{ compte, soldeCentimes }> }}
 */
export function soldeComptesDepense(etat, auj) {
  const comptes = soldes(etat, auj).comptes.filter((c) => TYPES_COMPTES_DEPENSE.includes(c.compte.type));
  const solde = comptes.reduce((s, c) => s + c.soldeCentimes, 0);
  return { soldeCentimes: solde, negatif: solde < 0, comptes };
}

/**
 * Les mots de la bulle, doux et justes. Mois dépassé : pas de gros chiffre rouge, mais le montant exact dans la phrase.
 * @param fmt mise en forme d'un montant (eur, ou « ••• » quand les montants sont masqués)
 * @returns {{ titre: string|null, avant: string|null, montant: string|null, apres: string|null, suite: string|null }}
 */
export function texteBulle(b, fmt = eur) {
  const dernierJour = (b.jauge?.joursRestants ?? 2) <= 1;
  if (b.etat === 'ok') return { titre: null, avant: 'Tu peux encore dépenser', montant: fmt(b.montantCentimes), apres: 'aujourd’hui', suite: null };
  if (b.etat === 'jour-depasse') {
    return { titre: null, avant: 'Aujourd’hui, tu as dépassé de', montant: fmt(b.montantCentimes), apres: null,
      suite: dernierJour ? 'Demain, un nouveau mois commence.' : 'Demain, c’est une nouvelle journée.' };
  }
  if (b.etat === 'mois-depasse') {
    return { titre: 'Ta part du mois est déjà utilisée', avant: null, montant: null, apres: null,
      suite: `${fmt(b.montantCentimes)} de plus que prévu. Vise zéro dépense aujourd’hui${dernierJour ? ' : demain, un nouveau mois commence' : ''}.` };
  }
  return { titre: null, avant: null, montant: null, apres: null, suite: null };
}

/** La ligne « ta journée » de la carte après une saisie : { texte, ton: ''|'attention' }. */
export function ligneDuJour(b, fmt = eur) {
  if (b.etat === 'mois-depasse') return { texte: `Ta part du mois est déjà utilisée : ${fmt(b.montantCentimes)} de plus que prévu.`, ton: 'attention' };
  if (b.etat === 'jour-depasse') return { texte: `Tu as dépassé de ${fmt(b.montantCentimes)} aujourd’hui.`, ton: 'attention' };
  return { texte: `Il te reste ${fmt(b.montantCentimes)} aujourd’hui.`, ton: '' };
}

/**
 * Après une dépense obligatoire (charge du mois, hors part du jour) : ce qu'elle change vraiment pour la journée.
 * Elle compte dans le mois ; d'habitude c'est l'épargne visée qui baisse, mais quand le mois n'a plus de marge elle est
 * répartie sur les jours qui restent (et le dernier jour avant le salaire, elle compte en entier).
 * @param txId la dépense déjà enregistrée dans etat
 * @returns {{ texte: string, baisseCentimes: number }}
 */
export function ligneCharge(etat, txId, auj, fmt = eur) {
  const sans = { ...etat, transactions: (etat.transactions || []).filter((t) => t.id !== txId) };
  const b0 = bulleDuJour(sans, auj); const b1 = bulleDuJour(etat, auj);
  const baisse = b0.jauge.restantAujourdhuiCentimes - b1.jauge.restantAujourdhuiCentimes;
  const jr = b1.jauge.joursRestants;
  if (b1.etat === 'mois-depasse') return { texte: `Charge du mois. Ta part du mois est déjà utilisée : ${fmt(b1.montantCentimes)} de plus que prévu.`, baisseCentimes: baisse };
  if (baisse <= 0) return { texte: 'Charge du mois, pas comptée dans ta journée.', baisseCentimes: 0 };
  if (jr <= 1) return { texte: 'Charge du mois. C’est le dernier jour avant ton salaire : elle compte aussi aujourd’hui.', baisseCentimes: baisse };
  return { texte: `Charge du mois, répartie sur les ${jr} jours qui restent : ${fmt(baisse)} de moins aujourd’hui.`, baisseCentimes: baisse };
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
