// sansdepense.js — journées sans dépense : on l'annonce le matin, l'app la suit, et à 5 h le lendemain
// toute la part du jour part à l'épargne (reste du jour). Le calendrier montre les journées tenues et ce qu'elles ont rapporté.
// Stockage : etat.meta.sansDepense = { jours: { 'AAAA-MM-JJ': { annonceLe } } }.

import { depensesVariables, resteADepenser, jaugeDuJour } from './calculs.js';
import { ajouterJours, debutSemaine, diffJours } from './dates.js';

export const estAnnoncee = (etat, jour) => !!etat.meta?.sansDepense?.jours?.[jour];

/** Ce qu'une journée a mis de côté : privations, reste du jour (5 h) et repas à la maison automatiques. */
function misDeCote(etat, jour, auto) {
  const priv = (etat.privations || []).filter((p) => p.date === jour).reduce((s, p) => s + p.montantCentimes, 0);
  const repas = (auto || []).filter((p) => p.date === jour).reduce((s, p) => s + p.montantCentimes, 0);
  return priv + repas;
}

/**
 * Bilan d'une journée.
 * @returns {{ jour, annoncee, depensesCentimes, statut: 'tenue'|'rompue'|'enCours'|'futur'|'libre'|'sansDepense', misDeCoteCentimes }}
 */
export function bilanJour(etat, jour, aujourdhuiIso, auto = []) {
  const annoncee = estAnnoncee(etat, jour);
  if (jour > aujourdhuiIso) return { jour, annoncee, depensesCentimes: 0, statut: 'futur', misDeCoteCentimes: 0 };
  const dep = depensesVariables(etat, jour, jour);
  const mis = misDeCote(etat, jour, auto);
  let statut;
  if (jour === aujourdhuiIso) statut = annoncee ? (dep > 0 ? 'rompue' : 'enCours') : 'libre';
  else if (annoncee) statut = dep > 0 ? 'rompue' : 'tenue';
  else statut = dep > 0 ? 'libre' : 'sansDepense';
  return { jour, annoncee, depensesCentimes: dep, statut, misDeCoteCentimes: mis };
}

/**
 * Calendrier des dernières semaines (lundi → dimanche) et totaux des journées annoncées.
 * @returns {{ semaines: Array<Array<bilan>>, nbAnnoncees, nbTenues, rapporteCentimes, enCours, partDuJourCentimes }}
 */
export function calendrierSansDepense(etat, aujourdhuiIso, nbSemaines = 5) {
  const r = resteADepenser(etat, aujourdhuiIso);
  const auto = r.privationsAuto || [];
  const debut = ajouterJours(debutSemaine(aujourdhuiIso), -7 * (nbSemaines - 1));
  const semaines = [];
  let nbAnnoncees = 0; let nbTenues = 0; let rapporte = 0;
  for (let s = 0; s < nbSemaines; s++) {
    const ligne = [];
    for (let j = 0; j < 7; j++) {
      const jour = ajouterJours(debut, s * 7 + j);
      const b = bilanJour(etat, jour, aujourdhuiIso, auto);
      if (b.annoncee && b.statut !== 'futur') nbAnnoncees += 1;
      if (b.statut === 'tenue') { nbTenues += 1; rapporte += b.misDeCoteCentimes; }
      ligne.push(b);
    }
    semaines.push(ligne);
  }
  // Toutes les journées annoncées (même plus anciennes que le calendrier)
  for (const jour of Object.keys(etat.meta?.sansDepense?.jours || {})) {
    if (jour >= debut || jour >= aujourdhuiIso) continue;
    nbAnnoncees += 1;
    const b = bilanJour(etat, jour, aujourdhuiIso, auto);
    if (b.statut === 'tenue') { nbTenues += 1; rapporte += b.misDeCoteCentimes; }
  }
  const j = jaugeDuJour(etat, aujourdhuiIso, etat.meta?.jauge || null);
  return { semaines, nbAnnoncees, nbTenues, rapporteCentimes: rapporte, enCours: bilanJour(etat, aujourdhuiIso, aujourdhuiIso, auto), partDuJourCentimes: Math.max(0, j.parJourCentimes) };
}

/** Série en cours : journées tenues d'affilée (annoncées), jusqu'à hier (aujourd'hui compte s'il est encore tenu). */
export function serieSansDepense(etat, aujourdhuiIso) {
  let n = 0;
  const auj = bilanJour(etat, aujourdhuiIso, aujourdhuiIso);
  if (auj.statut === 'enCours') n = 1;
  for (let d = ajouterJours(aujourdhuiIso, -1); diffJours(d, aujourdhuiIso) < 400; d = ajouterJours(d, -1)) {
    if (bilanJour(etat, d, aujourdhuiIso).statut !== 'tenue') break;
    n += 1;
  }
  return n;
}
