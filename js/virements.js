// virements.js — « À virer cette semaine » vers l'épargne : un seul virement par semaine, qui regroupe
//  - la part de la semaine de l'épargne du mois (ce qui reste à mettre, réparti sur les semaines jusqu'au salaire),
//  - les arrondis en attente,
//  - les repas à la maison et les privations pas encore virés.
// Le montant est aussi réparti par poche (prêt / sécurité), pour savoir quoi mettre où.

import { resteADepenser } from './calculs.js';
import { epargneNettePeriode, cagnotteEnAttente, repartirVersement } from './epargne.js';
import { bilanPrivations } from './privations.js';
import { diffJours, debutSemaine, maxIso, ajouterJours } from './dates.js';

/** Poche qui reçoit les efforts (arrondis, repas, privations) : réglage des arrondis, sinon le prêt, sinon la première active. */
export function pocheDesEfforts(etat) {
  const actives = (etat.poches || []).filter((p) => p.actif !== false);
  const id = etat.profil?.arrondi?.pocheId;
  return actives.find((p) => p.id === id) || actives.find((p) => p.type === 'remboursementAnticipe') || actives[0] || null;
}

/**
 * Ce qu'il reste à virer vers l'épargne.
 * @returns {{ semaineCentimes, totalCentimes, moisCibleCentimes, moisDejaCentimes, moisRestantCentimes, moisSemaineCentimes,
 *   arrondisCentimes, privationsCentimes, semainesRestantes, finPeriode, parPoche: Array<{ pocheId, montantCentimes }>, privationsAuto }}
 */
export function aVirerEpargne(etat, dateIso) {
  const r = resteADepenser(etat, dateIso);
  const per = r.periode;
  // L'épargne du mois déjà virée : les virements vers l'épargne (pas les arrondis ni les privations, comptés à part)
  const viree = (debut, fin) => (debut > fin ? 0 : epargneNettePeriode(etat.transactions || [], debut, fin).parType.virementLivret || 0);
  const moisDeja = viree(per.debut, per.fin);
  const moisCible = Math.max(0, r.epargneCibleCentimes || 0);
  const moisRestant = Math.max(0, moisCible - moisDeja);
  // Part de la semaine : calculée au début de la semaine (lundi, ou début de période), puis on retire ce qui a déjà été viré
  // cette semaine. Ainsi, une fois le virement fait, le montant de la semaine tombe à 0 jusqu'à lundi.
  const debutS = maxIso(debutSemaine(dateIso), per.debut);
  const dejaAvant = viree(per.debut, ajouterJours(debutS, -1));
  const semaines = Math.max(1, Math.ceil((diffJours(debutS, per.fin) + 1) / 7));
  const restantDebut = Math.max(0, moisCible - dejaAvant);
  const partSemaine = Math.ceil(restantDebut / semaines / 100) * 100;
  const moisSemaine = Math.max(0, Math.min(moisRestant, partSemaine - viree(debutS, per.fin)));
  const ar = etat.profil?.arrondi;
  const arrondis = ar?.actif ? cagnotteEnAttente(etat.transactions || [], ar, etat.cagnotteArrondis || [], { debutSuivi: etat.profil?.debutSuivi || etat.profil?.premierImportLe }).total : 0;
  const auto = r.privationsAuto || [];
  const privations = bilanPrivations(etat, per, auto).aVirerCentimes;

  const parPoche = new Map();
  const ajouter = (id, c) => { if (id && c > 0) parPoche.set(id, (parPoche.get(id) || 0) + c); };
  for (const x of repartirVersement(moisSemaine, etat.poches || [])) ajouter(x.pocheId, x.montantCentimes);
  ajouter(pocheDesEfforts(etat)?.id, arrondis + privations);

  return {
    semaineCentimes: moisSemaine + arrondis + privations,
    totalCentimes: moisRestant + arrondis + privations,
    moisCibleCentimes: moisCible, moisDejaCentimes: moisDeja, moisRestantCentimes: moisRestant, moisSemaineCentimes: moisSemaine,
    arrondisCentimes: arrondis, privationsCentimes: privations,
    semainesRestantes: semaines, finPeriode: per.fin,
    parPoche: [...parPoche.entries()].map(([pocheId, montantCentimes]) => ({ pocheId, montantCentimes })),
    privationsAuto: auto,
  };
}
