// simulation.js — « Et si j'achète ? » : l'effet d'un achat avant de le faire.
// Comme chaque reste du jour part à l'épargne à 5 h, attendre quelques jours dans le mois ne libère pas d'argent :
// soit l'achat passe dès aujourd'hui sans casser le mois, soit il vaut mieux le faire après le salaire (budget suivant).

import { resteADepenser, jaugeDuJour } from './calculs.js';
import { verdictMois } from './verdict.js';
import { ajouterJours } from './dates.js';

/** En dessous de 75 % de la part actuelle des jours suivants, l'achat n'est pas « sans risque ». */
export const BAISSE_MAX_PART = 0.25;

/**
 * @param {{ montantCentimes, categorie? ('plaisir' par défaut : un achat évitable) }} achat
 * @returns {{ avant, apres, sansRisque, dateSansRisque, raisons: string[] }}
 */
export function simulerAchat(etat, dateIso, { montantCentimes, categorie = 'plaisir' }) {
  const tx = { id: 'simulation-achat', date: dateIso, sens: 'debit', montantCentimes, categorie, compteId: (etat.comptes.find((c) => c.type === 'courant') || etat.comptes[0])?.id, source: 'simulation', libelle: 'Achat simulé' };
  const hypo = { ...etat, transactions: [...(etat.transactions || []), tx] };
  const restesActifs = etat.profil?.restesDuJour?.actif !== false;
  const mesure = (e) => {
    const r = resteADepenser(e, dateIso);
    const j = jaugeDuJour(e, dateIso, null);
    const v = verdictMois(e, dateIso);
    const restant = j.restantAujourdhuiCentimes;
    // Jours suivants : ce qui reste du mois, moins le reste d'aujourd'hui qui part à l'épargne à 5 h (s'il en reste)
    const joursApres = j.joursRestants - 1;
    const pourLaSuite = r.resteCentimes - (restesActifs ? Math.max(0, restant) : 0);
    return {
      aujourdhuiCentimes: restant,
      partSuivantsCentimes: joursApres > 0 ? Math.floor(pourLaSuite / joursApres) : null,
      epargneCentimes: r.epargneCibleCentimes,
      resteDuJourCentimes: restesActifs ? Math.max(0, restant) : 0,
      resteMoisCentimes: r.resteCentimes, couleur: v.couleur, periode: r.periode,
    };
  };
  const avant = mesure(etat);
  const apres = mesure(hypo);
  const raisons = [];
  // Ce que l'épargne perd : l'épargne du mois réduite + le reste du jour qui ne partira plus à 5 h
  const epargnePerdue = (avant.epargneCentimes - apres.epargneCentimes) + (avant.resteDuJourCentimes - apres.resteDuJourCentimes);
  if (apres.couleur === 'rouge' && avant.couleur !== 'rouge') raisons.push('ta pastille passerait au rouge');
  if (apres.epargneCentimes < avant.epargneCentimes) raisons.push(`ton épargne du mois baisserait de ${eur(avant.epargneCentimes - apres.epargneCentimes)}`);
  if (avant.partSuivantsCentimes !== null && apres.partSuivantsCentimes !== null && apres.partSuivantsCentimes < avant.partSuivantsCentimes * (1 - BAISSE_MAX_PART)) {
    raisons.push(`ta part des jours suivants baisserait de ${Math.round((1 - apres.partSuivantsCentimes / Math.max(1, avant.partSuivantsCentimes)) * 100)} %`);
  }
  if (apres.resteMoisCentimes < 0) raisons.push('le budget du mois serait dépassé');
  const sansRisque = raisons.length === 0;
  const salaire = avant.periode.salaireAttenduLe || ajouterJours(avant.periode.fin, 1);
  return { avant, apres, sansRisque, dateSansRisque: sansRisque ? dateIso : salaire, raisons, epargnePerdueCentimes: Math.max(0, epargnePerdue) };
}

function eur(c) {
  return `${(Math.abs(c) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
