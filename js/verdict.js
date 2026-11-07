// verdict.js — couleur de la fin de mois, à côté du solde sur l'Accueil :
//  vert   : bonne lancée (pas de dépassement prévu, épargne du mois tenue, peu de dépenses évitables) ;
//  orange : ça passe, mais sans marge (épargne réduite, beaucoup de dépenses évitables, prévision juste) ;
//  rouge  : mauvaise lancée (mois dépassé, dépassement prévu, découvert en vue, compte à découvert).

import { resteADepenser, soldes, projectionDecouvert, depensesVariables } from './calculs.js';
import { previsionFinDeMois } from './prevision.js';

/** Dépenses évitables : repas dehors, livraisons, VTC, plaisirs, achats en ligne. */
export const CATS_EVITABLES = new Set(['restauration-rapide', 'livraison', 'restaurants', 'vtc', 'plaisir', 'achats-en-ligne', 'loisirs']);
export const SEUIL_EVITABLES = 0.25; // au-delà de 25 % des dépenses du quotidien : orange
export const MIN_POUR_JUGER = 3000;  // en dessous de 30 € dépensés depuis le salaire, la part n'est pas parlante

/**
 * @returns {{ couleur: 'vert'|'orange'|'rouge', titre, raisons: string[], soldeCompteCentimes, compte, evitablesPart }}
 */
export function verdictMois(etat, dateIso) {
  const r = resteADepenser(etat, dateIso);
  const per = r.periode;
  const s = soldes(etat, dateIso);
  const courant = s.comptes.find((c) => c.compte.type === 'courant') || s.comptes.find((c) => c.compte.type !== 'epargne');
  const prev = previsionFinDeMois(etat, dateIso);
  const proj = projectionDecouvert(etat, dateIso, { jours: 7 });
  const variables = depensesVariables(etat, per.debut, dateIso);
  const evitables = depensesVariables(etat, per.debut, dateIso, (t) => CATS_EVITABLES.has(t.categorie));
  const part = variables > 0 ? evitables / variables : 0;
  const rouges = []; const oranges = []; const verts = [];

  if (r.revenus.totalCentimes <= 0) oranges.push('Revenus du mois pas encore saisis : le calcul n’est pas sûr.');
  if (r.resteCentimes < 0) rouges.push('Le budget du mois est déjà dépassé.');
  if (prev.fiable && prev.previsionCentimes < 0) rouges.push(`À ce rythme, dépassement d’environ ${eur(-prev.previsionCentimes)} avant le salaire.`);
  if (courant && courant.soldeCentimes < 0) rouges.push(`${courant.compte.nom} est à découvert.`);
  else if (proj && (proj.chargeNonCouverte || proj.premierNegatif)) rouges.push(`${proj.compte.nom} passe sous 0 € dans les 7 jours.`);

  const vise = r.epargneViseeCentimes ?? r.epargneCibleCentimes;
  if (vise > 0 && r.epargneCibleCentimes < vise) oranges.push(`Épargne du mois réduite : ${eur(r.epargneCibleCentimes)} au lieu de ${eur(vise)}.`);
  else if (vise > 0) verts.push(`Épargne du mois tenue : ${eur(r.epargneCibleCentimes)}.`);
  else oranges.push('Pas d’épargne possible ce mois-ci après les dépenses obligatoires.');
  if (variables >= MIN_POUR_JUGER && part > SEUIL_EVITABLES) oranges.push(`Dépenses évitables (repas dehors, livraisons, VTC, plaisirs) : ${Math.round(part * 100)} % de tes dépenses du quotidien.`);
  else if (variables >= MIN_POUR_JUGER) verts.push(`Peu de dépenses évitables : ${Math.round(part * 100)} % de tes dépenses du quotidien.`);
  if (prev.fiable && prev.previsionCentimes >= 0) {
    // Marge faible : moins de 2 jours de budget de côté à la fin du mois
    if (prev.previsionCentimes < 2 * prev.partMaxCentimes) oranges.push(`Fin de mois juste : environ ${eur(prev.previsionCentimes)} de marge.`);
    else verts.push(`À ce rythme, environ ${eur(prev.previsionCentimes)} de plus pour l’épargne.`);
  }

  const couleur = rouges.length ? 'rouge' : oranges.length ? 'orange' : 'vert';
  const titre = { vert: 'Très bonne lancée', orange: 'Ça passe, sans grande marge', rouge: 'Mauvaise lancée' }[couleur];
  return { couleur, titre, raisons: couleur === 'rouge' ? rouges : couleur === 'orange' ? [...oranges, ...verts] : verts, soldeCompteCentimes: courant?.soldeCentimes ?? 0, compte: courant?.compte || null, evitablesPart: part };
}

function eur(c) {
  const v = Math.abs(Math.round(c)) / 100;
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
