// risques.js (v200) — le risque du mois en un mot (calme, attention, risque) et une phrase simple.
// Trois sources, toutes calculées sur le téléphone :
//  - la prévision de fin de mois (stats.js) : chance de finir sans dépasser, à ton rythme récent ;
//  - la projection du compte courant jusqu'au salaire (calculs.js) : un prélèvement que le solde ne couvre pas ;
//  - les charges fixes encore à payer avant le salaire.
// Fonctions pures : l'état et la journée de budget sont passés en paramètres.

import { periodeBudget, projectionDecouvert, chargesFixesPeriode } from '../../calculs.js';
import { previsionMois, JOURS_FIABLES } from './stats.js';
import { diffJours, formatDateCourte } from '../../dates.js';
import { eur } from './commun.js';

/** Sous 50 % de chances de finir sans dépasser : risque ; sous 80 % : attention. */
export const SEUIL_RISQUE = 0.5;
export const SEUIL_ATTENTION = 0.8;

/** Charges fixes pas encore payées d'ici le salaire (aujourd'hui compris). */
export function chargesAvantSalaire(etat, auj, periode = periodeBudget(auj, etat.profil || {}, { reference: auj })) {
  const liste = chargesFixesPeriode(etat, periode).filter((c) => !c.payee && c.date >= auj && c.date <= periode.fin);
  return { liste, totalCentimes: liste.reduce((s, c) => s + c.montantPrevuCentimes, 0) };
}

/**
 * @returns {{ niveau: 'calme'|'attention'|'risque'|'pas-assez', phrase, details: { probaTenir, fiable, joursRestants,
 *   attenduCentimes, rythmeCentimes, rythmeMaxCentimes, charges: { nb, totalCentimes }, decouvert: { date, libelle, manqueCentimes } | null } }}
 */
export function risqueDuMois(etat, auj) {
  const periode = periodeBudget(auj, etat.profil || {}, { reference: auj });
  const prev = previsionMois(etat, auj);
  const jours = Math.max(0, diffJours(auj, periode.fin)); // jusqu'à la veille du salaire
  const proj = projectionDecouvert(etat, auj, { jours, inclureRythme: false });
  const charges = chargesAvantSalaire(etat, auj, periode);
  const nc = proj?.chargeNonCouverte || null;
  const decouvert = nc ? { date: nc.date, libelle: nc.libelle, manqueCentimes: -nc.soldeApresCentimes } : null;
  const details = {
    probaTenir: prev.probaTenir, fiable: prev.fiable, joursRestants: prev.joursRestants, attenduCentimes: prev.attenduCentimes,
    rythmeCentimes: prev.rythmeCentimes, rythmeMaxCentimes: prev.rythmeMaxCentimes,
    charges: { nb: charges.liste.length, totalCentimes: charges.totalCentimes }, decouvert,
  };
  const chargesTexte = charges.liste.length
    ? ` Encore ${charges.liste.length === 1 ? `« ${charges.liste[0].libelle} »` : `${charges.liste.length} charges`} à payer avant le salaire : ${eur(charges.totalCentimes)}.`
    : '';

  // Un prélèvement que ton compte ne couvre pas : c'est sûr, pas besoin de statistiques
  if (decouvert) {
    return { niveau: 'risque', details, phrase: `Ton compte ne couvre pas « ${decouvert.libelle} » le ${formatDateCourte(decouvert.date)} : il manquera ${eur(decouvert.manqueCentimes)}.` };
  }
  if (!prev.fiable) {
    return { niveau: 'pas-assez', details, phrase: `Pas encore assez de jours notés pour prévoir la fin du mois (il en faut ${JOURS_FIABLES}).${chargesTexte}` };
  }
  if (prev.joursRestants === 0) {
    // Veille du salaire : plus de prévision, seulement ce qui reste
    return prev.resteCentimes >= 0
      ? { niveau: 'calme', details, phrase: `Dernier jour avant le salaire : il te reste ${eur(prev.resteCentimes)}.${chargesTexte}` }
      : { niveau: 'risque', details, phrase: `Dernier jour avant le salaire : le mois est dépassé de ${eur(prev.resteCentimes)}.${chargesTexte}` };
  }
  if (prev.probaTenir < SEUIL_RISQUE) {
    const parJour = prev.rythmeMaxCentimes > 0 ? ` Pour tenir, vise ${eur(prev.rythmeMaxCentimes)} par jour.` : '';
    return { niveau: 'risque', details, phrase: `À ton rythme (${eur(prev.rythmeCentimes)} par jour), tu dépasserais d’environ ${eur(prev.attenduCentimes)} d’ici le salaire.${parJour}${chargesTexte}` };
  }
  if (prev.probaTenir < SEUIL_ATTENTION) {
    return { niveau: 'attention', details, phrase: `Ça passe juste : garde au plus ${eur(prev.rythmeMaxCentimes)} par jour jusqu’au salaire.${chargesTexte}` };
  }
  return { niveau: 'calme', details, phrase: `Ça tient : à ton rythme, il te resterait environ ${eur(Math.max(0, prev.attenduCentimes))} le jour du salaire.${chargesTexte}` };
}
