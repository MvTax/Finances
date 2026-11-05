// frein-achat.js (V2) — frein d'achat : besoin ou envie, coût en heures de travail, liste d'envies (règle des 7 jours).

import { ajouterJours, diffJours } from '../dates.js';

export const DELAI_JOURS = 7;

/** Évaluation d'un achat envisagé. */
export function evaluerAchat({ montantCentimes, besoin, tauxHoraireCentimes, resteADepenserCentimes }) {
  const heures = tauxHoraireCentimes ? montantCentimes / tauxHoraireCentimes : null;
  const partReste = resteADepenserCentimes > 0 ? montantCentimes / resteADepenserCentimes : 1;
  const verdict = besoin ? (partReste > 0.5 ? 'reporter' : 'ok') : 'listeEnvies';
  return { heures, partReste, verdict };
}

/** Ajoute une envie avec une date de réexamen à +7 jours. */
export function nouvelleEnvie({ id, nom, montantCentimes, date }) {
  return { id, nom, montantCentimes, ajouteeLe: date, reexamenLe: ajouterJours(date, DELAI_JOURS), statut: 'enAttente' };
}

/** Envies dont le délai de 7 jours est écoulé (à reconsidérer). */
export function enviesMures(envies, aujourdhuiIso) {
  return envies.filter((e) => e.statut === 'enAttente' && diffJours(e.reexamenLe, aujourdhuiIso) >= 0);
}
