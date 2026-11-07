// prevision.js — « À ce rythme, il te restera environ X € d'ici le salaire » (ou « tu dépasseras de X € »).
// Rythme = dépenses du quotidien par jour depuis le salaire (jours passés seulement). Fiable à partir de 3 jours ;
// l'alerte (prévision sous 0) s'affiche à partir du 5e jour après le salaire, pour ne pas sonner sur 2 jours chargés.

import { resteADepenser, rythmeQuotidien, depensesVariables } from './calculs.js';
import { ajouterJours, diffJours } from './dates.js';

export const JOURS_MIN_FIABLE = 3;
export const JOURS_MIN_ALERTE = 5;

/**
 * @returns {{ fiable, rythmeCentimes, previsionCentimes, partMaxCentimes, dateSalaire, joursEcoules, joursRestants, alerte }}
 */
export function previsionFinDeMois(etat, dateIso) {
  const r = resteADepenser(etat, dateIso);
  const per = r.periode;
  const dateSalaire = per.salaireAttenduLe || ajouterJours(per.fin, 1);
  const joursEcoules = Math.max(0, diffJours(per.debut, dateIso)); // jours entièrement passés depuis le salaire
  const joursApres = Math.max(0, diffJours(dateIso, per.fin));     // jours après aujourd'hui
  const joursRestants = joursApres + 1;
  const rythme = rythmeQuotidien(etat, dateIso);
  const depJour = depensesVariables(etat, dateIso, dateIso);
  // Ce qui sera encore dépensé : le reste d'aujourd'hui (si le rythme n'est pas déjà atteint) + les jours suivants
  const futur = rythme * joursApres + Math.max(0, rythme - depJour);
  const prevision = r.resteCentimes - futur;
  const fiable = joursEcoules >= JOURS_MIN_FIABLE && r.revenus.totalCentimes > 0;
  return {
    fiable,
    rythmeCentimes: rythme,
    previsionCentimes: prevision,
    partMaxCentimes: Math.max(0, Math.floor(r.resteCentimes / joursRestants)),
    dateSalaire,
    joursEcoules,
    joursRestants,
    alerte: fiable && joursEcoules >= JOURS_MIN_ALERTE && prevision < 0,
  };
}
