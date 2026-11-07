// revolut.js — « Payé avec Revolut » : repérer le compte Revolut et suivre ses dépenses à part (en plus de la liste).

import { periodeBudget, soldes } from './calculs.js';
import { contributionDepense } from './categories.js';

/** Le compte Revolut (banque « revolut », ou nom qui le contient), ou null. */
export function compteRevolut(etat) {
  return (etat.comptes || []).find((c) => c.banque === 'revolut' || /revolut/i.test(c.nom || '')) || null;
}

/** Le compte du quotidien par défaut (courant LCL). */
export function compteParDefaut(etat) {
  return (etat.comptes || []).find((c) => c.type === 'courant') || (etat.comptes || [])[0] || null;
}

/** « … revolut » dans une phrase : payé avec Revolut. */
export const MOT_REVOLUT = /(?<![\p{L}])(?:avec |par |sur |via )?revolut(?![\p{L}])/iu;

/** Suivi Revolut du mois : dépenses depuis le salaire, nombre, solde, dernières opérations. */
export function suiviRevolut(etat, dateIso) {
  const c = compteRevolut(etat);
  if (!c) return null;
  const per = periodeBudget(dateIso, etat.profil);
  const ops = (etat.transactions || []).filter((t) => t.compteId === c.id && t.date >= per.debut && t.date <= dateIso && !t.ajustement)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const depenses = ops.reduce((s, t) => s + Math.max(0, contributionDepense(t)), 0);
  const solde = soldes(etat, dateIso).comptes.find((x) => x.compte.id === c.id)?.soldeCentimes ?? null;
  return { compte: c, depensesCentimes: depenses, nbDepenses: ops.filter((t) => contributionDepense(t) > 0).length, soldeCentimes: solde, operations: ops, periode: per };
}
