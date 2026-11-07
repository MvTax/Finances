// virements.js — « À virer cette semaine » vers l'épargne : un seul virement par semaine, qui regroupe
//  - la part de la semaine de l'épargne du mois (ce qui reste à mettre, réparti sur les semaines jusqu'au salaire),
//  - les arrondis en attente,
//  - les repas à la maison et les privations pas encore virés.
// Le montant est aussi réparti par poche (prêt / sécurité), pour savoir quoi mettre où.

import { resteADepenser, cagnotteArrondis } from './calculs.js';
import { epargneNettePeriode, repartirVersement, arrondiTransaction, debutArrondis } from './epargne.js';
import { formatEuros } from './money.js';
import { jourBudgetaire, resteDuJourPasse } from './restes.js';
import { bilanPrivations } from './privations.js';
import { diffJours, debutSemaine, maxIso, ajouterJours, prochainJourSemaine } from './dates.js';

/** Valeur du réglage « arrondis, repas et privations » qui les partage entre les épargnes (comme l'épargne du mois). */
export const PARTAGE = 'partage';

/** Poche qui reçoit les efforts (arrondis, repas, privations), ou null s'ils sont partagés entre les épargnes. */
export function pocheDesEfforts(etat) {
  const actives = (etat.poches || []).filter((p) => p.actif !== false);
  const id = etat.profil?.arrondi?.pocheId;
  if (id === PARTAGE) return null;
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
  const arrondis = ar?.actif ? cagnotteArrondis(etat, dateIso).total : 0;
  const auto = r.privationsAuto || [];
  const privations = bilanPrivations(etat, per, auto).aVirerCentimes;

  // Répartition par épargne, montant par montant (exactement comme ils seront enregistrés au virement)
  const parPoche = new Map();
  const ajouter = (id, c) => { if (id && c > 0) parPoche.set(id, (parPoche.get(id) || 0) + c); };
  const repartir = (c) => { for (const x of repartirVersement(c, etat.poches || [])) ajouter(x.pocheId, x.montantCentimes); };
  repartir(moisSemaine);
  const efforts = pocheDesEfforts(etat);
  if (efforts) ajouter(efforts.id, arrondis + privations);
  else { repartir(arrondis); repartir(privations); }

  // Date du virement : le jour réglé (jeudi par défaut) de cette semaine ; passé et pas fait → aujourd'hui ; fait → semaine prochaine
  const jour = etat.profil?.arrondi?.jourVirement || 4;
  const ceJour = prochainJourSemaine(debutSemaine(dateIso), jour, true);
  const semaine = moisSemaine + arrondis + privations;
  const enRetard = semaine > 0 && ceJour < dateIso;
  const dateVirement = semaine > 0 ? (enRetard ? dateIso : ceJour) : prochainJourSemaine(dateIso, jour, false);

  return {
    semaineCentimes: semaine, dateVirement, datePrevue: ceJour, enRetard, jourVirement: jour,
    totalCentimes: moisRestant + arrondis + privations,
    moisCibleCentimes: moisCible, moisDejaCentimes: moisDeja, moisRestantCentimes: moisRestant, moisSemaineCentimes: moisSemaine,
    arrondisCentimes: arrondis, privationsCentimes: privations,
    semainesRestantes: semaines, finPeriode: per.fin,
    parPoche: [...parPoche.entries()].map(([pocheId, montantCentimes]) => ({ pocheId, montantCentimes })),
    privationsAuto: auto,
  };
}

/** Compte où se trouve une épargne, en clair (« Revolut », « Livret A LCL »), ou null. */
export function compteEpargne(poche) {
  const c = poche?.compteSupport;
  return c && !/^compte épargne sans intérêts$/i.test(c) ? c : null;
}

/**
 * Historique de la cagnotte du mois : chaque ajout, d'où il vient, et s'il est viré.
 * Sources : arrondi d'une sortie du compte, repas à la maison, privation, épargne du mois.
 * @returns {{ lignes: Array<{ date, source, libelle, detail, montantCentimes, vireLe }>, aVirerCentimes, vireCentimes, periode }}
 */
export function historiqueCagnotte(etat, dateIso, instant = new Date()) {
  const r = resteADepenser(etat, dateIso);
  const per = r.periode;
  const lignes = [];
  // Arrondis : toutes les sorties du compte depuis le début du mois (ou du suivi)
  const ar = etat.profil?.arrondi;
  if (ar?.actif) {
    const depuis = debutArrondis(ar, etat.profil?.debutSuivi || etat.profil?.premierImportLe, per.debut);
    const vires = new Map((etat.cagnotteArrondis || []).filter((c) => c.vireLe).map((c) => [c.transactionId, c.vireLe]));
    for (const t of etat.transactions || []) {
      if (t.date < per.debut || t.date > per.fin || t.date < depuis) continue;
      const a = arrondiTransaction(t, ar);
      if (!a) continue;
      lignes.push({ date: t.date, source: 'arrondi', libelle: t.marchand || t.libelle || 'Dépense', detail: `${formatEuros(t.montantCentimes)} arrondi à ${formatEuros(t.montantCentimes + a)}`, montantCentimes: a, vireLe: vires.get(t.id) || null });
    }
  }
  // Repas à la maison (automatiques) et privations
  for (const p of [...(etat.privations || []).filter((x) => x.date >= per.debut && x.date <= per.fin), ...(r.privationsAuto || [])]) {
    if (p.source === 'resteJour') { lignes.push({ date: p.date, source: 'reste', libelle: 'Reste du jour', detail: 'part du jour non dépensée, ajoutée à 5 h le lendemain', montantCentimes: p.montantCentimes, vireLe: p.vireLe || null }); continue; }
    const repas = p.auto || /repas à la maison/i.test(p.libelle || '');
    lignes.push({ date: p.date, source: repas ? 'repas' : 'privation', libelle: repas ? 'Repas à la maison' : p.libelle, detail: repas ? (p.libelle || 'pas de repas dehors noté') : 'Je me suis privé', montantCentimes: p.montantCentimes, vireLe: p.vireLe || null });
  }
  // Épargne du mois : virements déjà faits, puis la part de cette semaine
  for (const t of etat.transactions || []) {
    if (t.date < per.debut || t.date > per.fin || !t.epargne?.estEpargne || t.sens !== 'debit' || (t.epargne.type || 'virementLivret') !== 'virementLivret') continue;
    lignes.push({ date: t.date, source: 'mois', libelle: 'Épargne du mois', detail: t.marchand || t.libelle || 'Virement vers l’épargne', montantCentimes: t.montantCentimes, vireLe: t.date });
  }
  const v = aVirerEpargne(etat, dateIso);
  if (v.moisSemaineCentimes) lignes.push({ date: dateIso, source: 'mois', libelle: 'Épargne du mois', detail: `part de cette semaine (reste ${formatEuros(v.moisRestantCentimes)} ce mois-ci)`, montantCentimes: v.moisSemaineCentimes, vireLe: null });
  // Restes du jour : une ligne par jour, même à 0 €. La journée en cours (jusqu'à 5 h le lendemain) est estimée.
  if (etat.profil?.restesDuJour?.actif !== false) {
    const depuis = etat.meta?.restesJour?.depuis;
    const ouvert = jourBudgetaire(instant);
    const avecReste = new Set(lignes.filter((l) => l.source === 'reste').map((l) => l.date));
    if (depuis) {
      for (let d = depuis > per.debut ? depuis : per.debut; d < ouvert && d <= per.fin; d = ajouterJours(d, 1)) {
        if (!avecReste.has(d)) lignes.push({ date: d, source: 'reste', libelle: 'Reste du jour', detail: 'rien à ajouter : la part du jour a été utilisée (dépenses, arrondis, privations, repas)', montantCentimes: 0, vireLe: null });
      }
    }
    if (ouvert >= per.debut && ouvert <= per.fin && !avecReste.has(ouvert)) {
      const estime = resteDuJourPasse(etat, ouvert);
      const lendemain = ajouterJours(ouvert, 1);
      const quand = lendemain === dateIso ? 'ce matin' : 'demain matin';
      lignes.push({ date: ouvert, source: 'reste', libelle: 'Reste du jour', detail: `ajouté à 5 h ${quand}. Si la journée s’arrêtait maintenant : ${formatEuros(estime)}`, montantCentimes: estime, vireLe: null, enCours: true, aHeure: '5 h' });
    }
  }
  lignes.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.enCours ? 1 : 0) - (a.enCours ? 1 : 0) || (a.vireLe ? 1 : 0) - (b.vireLe ? 1 : 0)));
  const somme = (l) => l.reduce((s, x) => s + x.montantCentimes, 0);
  return { lignes, aVirerCentimes: somme(lignes.filter((x) => !x.vireLe && !x.enCours)), vireCentimes: somme(lignes.filter((x) => x.vireLe)), periode: per };
}
