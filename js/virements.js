// virements.js — le virement vers l'épargne, tous les 3 jours. Le mois (de salaire à salaire) est découpé en tranches
// de 3 jours (salaire le 5 → 5/6/7, 8/9/10…) ; chaque tranche est virée le lendemain de son dernier jour (le 8, le 11…),
// une fois les restes du jour de ses 3 jours ajoutés à 5 h. Libellé proposé : « Epargne 5/6/7 nov ». Chaque virement regroupe
//  - la part de l'épargne du mois (ce qui reste à mettre, réparti sur les virements restants),
//  - les arrondis en attente,
//  - les repas à la maison et les privations pas encore virés.
// Le montant est aussi réparti par poche (prêt / sécurité), pour savoir quoi mettre où.

import { fluxEnvies, retenueAvance, repartirReste } from './envies.js';
import { resteADepenser, cagnotteArrondis } from './calculs.js';
import { epargneNettePeriode, repartirVersement, arrondiTransaction, debutArrondis } from './epargne.js';
import { formatEuros } from './money.js';
import { jourBudgetaire, resteDuJourPasse } from './restes.js';
import { bilanPrivations } from './privations.js';
import { ajouterJours } from './dates.js';

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
  // Un virement tous les 3 jours. Chaque virement couvre une tranche : du lendemain du virement précédent (ou du salaire) à sa date.
  // Sa part de l'épargne du mois est calculée au début de la tranche, puis on retire ce qui a déjà été viré pendant la tranche :
  // une fois le virement fait, le montant tombe à 0 jusqu'à la tranche suivante.
  const dates = datesVirements(per);
  let k = dates.findIndex((d) => d >= dateIso);
  const apresDernier = k < 0;
  if (apresDernier) k = dates.length - 1;
  const debutT = k === 0 ? per.debut : ajouterJours(dates[k - 1], 1);
  const dejaAvant = viree(per.debut, ajouterJours(debutT, -1));
  const restants = dates.length - k;
  const restantDebut = Math.max(0, moisCible - dejaAvant);
  const partTranche = Math.ceil(restantDebut / restants / 100) * 100;
  const moisSemaine = Math.max(0, Math.min(moisRestant, partTranche - viree(debutT, per.fin)));
  const semaines = restants;
  const ar = etat.profil?.arrondi;
  const arrondis = ar?.actif ? cagnotteArrondis(etat, dateIso).total : 0;
  const auto = r.privationsAuto || [];
  // Restes du jour : la part des envies reste sur le compte ; une avance d'envie est reprise sur ce qui reste (envies.js)
  const flux = fluxEnvies(etat, { auto, aujourdhuiIso: dateIso });
  const privationsBrutes = bilanPrivations(etat, per, auto).aVirerCentimes;
  const enviesGarde = Math.min(privationsBrutes, flux.gardeAVirerCentimes);
  const retenue = retenueAvance(flux, privationsBrutes - enviesGarde);
  const privations = privationsBrutes - enviesGarde - retenue;

  // Répartition par épargne, montant par montant (exactement comme ils seront enregistrés au virement)
  const parPoche = new Map();
  const detailPoche = new Map();
  let source = 'mois';
  const ajouter = (id, c) => {
    if (!id || !(c > 0)) return;
    parPoche.set(id, (parPoche.get(id) || 0) + c);
    const d = detailPoche.get(id) || { mois: 0, arrondis: 0, reste: 0 };
    d[source] += c; detailPoche.set(id, d);
  };
  const repartir = (c) => { for (const x of repartirVersement(c, etat.poches || [])) ajouter(x.pocheId, x.montantCentimes); };
  repartir(moisSemaine);
  source = 'arrondis';
  const efforts = pocheDesEfforts(etat);
  if (efforts) ajouter(efforts.id, arrondis); else repartir(arrondis);
  // Reste de la journée (restes, repas à la maison, privations) : 40 % prêt / 30 % sécurité (envies.js, PARTS_RESTE)
  source = 'reste';
  const partsReste = repartirReste(privations, etat.poches || []);
  if (partsReste) for (const x of partsReste) ajouter(x.pocheId, x.montantCentimes);
  else if (efforts) ajouter(efforts.id, privations); else repartir(privations);

  // Date du virement : celle de la tranche ; passée et pas faite → aujourd'hui ; faite → le virement suivant
  const semaine = moisSemaine + arrondis + privations;
  // Virement précédent oublié (rien viré pendant sa tranche) : à faire aujourd'hui, avec la part reportée
  let ceJour = dates[k];
  if (k > 0 && !apresDernier && moisCible > 0) {
    const debutPrec = k - 1 === 0 ? per.debut : ajouterJours(dates[k - 2], 1);
    if (viree(debutPrec, dates[k - 1]) === 0 && viree(per.debut, ajouterJours(debutPrec, -1)) < moisCible) ceJour = dates[k - 1];
  }
  const enRetard = semaine > 0 && ceJour < dateIso;
  const suivant = dates[k + 1] || ajouterJours(ajouterJours(per.fin, 1), JOURS_PAR_VIREMENT);
  const dateVirement = semaine > 0 ? (enRetard ? dateIso : ceJour) : (ceJour >= dateIso && !apresDernier && viree(debutT, per.fin) === 0 && moisRestant > 0 ? ceJour : suivant);
  return {
    semaineCentimes: semaine, dateVirement, datePrevue: ceJour, enRetard, numeroVirement: k + 1, numeroProchain: semaine > 0 ? k + 1 : (dates.indexOf(dateVirement) + 1 || 1), nbVirements: dates.length,
    // Jours couverts par ce virement (y compris un virement oublié : les tranches en retard s'ajoutent)
    joursCouverts: (() => { const kk = semaine > 0 ? k : Math.max(0, dates.indexOf(dateVirement)); const premier = enRetard && ceJour !== dates[k] ? Math.max(0, dates.indexOf(ceJour)) : kk; const j = []; for (let i = premier; i <= kk; i++) j.push(...joursDuVirement(per, i)); return j; })(), datesVirements: dates,
    totalCentimes: moisRestant + arrondis + privations,
    moisCibleCentimes: moisCible, moisDejaCentimes: moisDeja, moisRestantCentimes: moisRestant, moisSemaineCentimes: moisSemaine,
    arrondisCentimes: arrondis, privationsCentimes: privations,
    enviesCentimes: enviesGarde, retenueAvanceCentimes: retenue, avanceRestanteCentimes: flux.avanceRestanteCentimes,
    semainesRestantes: semaines, finPeriode: per.fin,
    parPoche: [...parPoche.entries()].map(([pocheId, montantCentimes]) => ({ pocheId, montantCentimes, detail: detailPoche.get(pocheId) })),
    privationsAuto: auto,
  };
}

/** Un virement tous les 3 jours : chaque tranche de 3 jours est virée le lendemain de son dernier jour. */
export const JOURS_PAR_VIREMENT = 3;

/** Dates des virements d'une période (salaire à salaire) : salaire + 3, + 6… ; le dernier tombe au plus tard la veille du salaire. */
export function datesVirements(per) {
  const dates = [];
  for (let d = ajouterJours(per.debut, JOURS_PAR_VIREMENT); d <= per.fin; d = ajouterJours(d, JOURS_PAR_VIREMENT)) dates.push(d);
  if (!dates.length || dates[dates.length - 1] < per.fin) dates.push(per.fin);
  return dates;
}

/** Jours couverts par le virement numéro k (0 = premier) : du lendemain du précédent (ou du salaire) à la veille du virement. */
export function joursDuVirement(per, k) {
  const dates = datesVirements(per);
  const debut = k === 0 ? per.debut : dates[k - 1];
  const fin = k === dates.length - 1 && dates[k] === per.fin ? per.fin : ajouterJours(dates[k], -1);
  const jours = [];
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) jours.push(d);
  return jours;
}

const MOIS_COURTS = ['jan', 'fev', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec'];

/**
 * Libellé du virement pour l'appli bancaire, sans accents (accepté partout) : « Epargne 5/6/7 nov »,
 * « Epargne 30 nov/1/2 dec » à cheval sur deux mois ; suivi du nom court de l'épargne (« Pret », « Securite »).
 */
export function libelleVirement(jours, poche = null) {
  const parMois = [];
  for (const d of jours) {
    const m = MOIS_COURTS[Number(d.slice(5, 7)) - 1];
    const dernier = parMois[parMois.length - 1];
    if (dernier && dernier.m === m) dernier.j.push(Number(d.slice(8))); else parMois.push({ m, j: [Number(d.slice(8))] });
  }
  const dates = parMois.map((x) => `${x.j.join('/')} ${x.m}`).join('/');
  const suffixe = !poche ? '' : poche.type === 'remboursementAnticipe' ? ' Pret' : poche.type === 'coussin' ? ' Securite' : ` ${String(poche.nom).normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 12)}`;
  return `Epargne ${dates}${suffixe}`;
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
  const flux = fluxEnvies(etat, { auto: r.privationsAuto || [], aujourdhuiIso: dateIso });
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
    if (p.source === 'resteJour') {
      // La part gardée pour une envie reste sur le compte : seule la part de l'épargne va dans la cagnotte
      const garde = p.vireLe ? (p.envieGardeCentimes || 0) : (flux.parReste.get(p.id)?.garde || 0);
      const envie = garde ? flux.envies.find((e) => e.id === (p.envieId || flux.parReste.get(p.id)?.envieId)) : null;
      lignes.push({ date: p.date, source: 'reste', libelle: 'Reste du jour', detail: `part du jour non dépensée, ajoutée à 5 h le lendemain${garde ? ` (${formatEuros(p.montantCentimes)}, dont ${formatEuros(garde)} pour ${envie?.nom || 'ton envie'})` : ''}`, montantCentimes: p.montantCentimes - garde, vireLe: p.vireLe || null });
      continue;
    }
    const repas = p.auto || /repas à la maison/i.test(p.libelle || '');
    const gardeP = p.vireLe ? (p.envieGardeCentimes || 0) : (flux.parReste.get(p.id)?.garde || 0);
    const envieP = gardeP ? flux.envies.find((e) => e.id === (p.envieId || flux.parReste.get(p.id)?.envieId)) : null;
    lignes.push({ date: p.date, source: repas ? 'repas' : 'privation', libelle: repas ? 'Repas à la maison' : p.libelle, detail: `${repas ? (p.libelle || 'pas de repas dehors noté') : 'Je me suis privé'}${gardeP ? ` (${formatEuros(p.montantCentimes)}, dont ${formatEuros(gardeP)} pour ${envieP?.nom || 'ton envie'})` : ''}`, montantCentimes: p.montantCentimes - gardeP, vireLe: p.vireLe || null });
  }
  // Épargne du mois : virements déjà faits, puis la part du prochain virement
  for (const t of etat.transactions || []) {
    if (t.date < per.debut || t.date > per.fin || !t.epargne?.estEpargne || t.sens !== 'debit' || (t.epargne.type || 'virementLivret') !== 'virementLivret') continue;
    lignes.push({ date: t.date, source: 'mois', libelle: 'Épargne du mois', detail: t.marchand || t.libelle || 'Virement vers l’épargne', montantCentimes: t.montantCentimes, vireLe: t.date });
  }
  const v = aVirerEpargne(etat, dateIso);
  if (v.retenueAvanceCentimes) lignes.push({ date: dateIso, source: 'avance', libelle: 'Avance d’une envie reprise', detail: `achetée avant d’être complète : ${formatEuros(v.avanceRestanteCentimes)} à reprendre en tout, au plus la moitié à chaque virement`, montantCentimes: -v.retenueAvanceCentimes, vireLe: null });
  if (v.moisSemaineCentimes) lignes.push({ date: dateIso, source: 'mois', libelle: 'Épargne du mois', detail: `part de ce virement (reste ${formatEuros(v.moisRestantCentimes)} ce mois-ci)`, montantCentimes: v.moisSemaineCentimes, vireLe: null });
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
