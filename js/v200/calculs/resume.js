// resume.js (v200) — les résumés : le mois en cours, l'année (12 dernières périodes), et les préventions du jour.
// « Mois » = période budgétaire, d'un salaire au suivant. Seules les dépenses du quotidien comptent pour « où part
// l'argent » (le loyer, les abonnements et les charges fixes sont à part). Les fonctions renvoient des données et des
// phrases courtes, jamais du HTML. Fonctions pures : l'état et la journée de budget sont passés en paramètres.

import { periodeBudget, depensesVariables, estDepenseQuotidienne, resteADepenser, projectionDecouvert, chargesFixesPeriode } from '../../calculs.js';
import { contributionDepense, nomCategorie } from '../../categories.js';
import { epargneNettePeriode } from '../../epargne.js';
import { serieJours } from '../../jeu.js';
import { fluxEnvies } from '../../envies.js';
import { statsDepenses } from './stats.js';
import { ajouterJours, diffJours, formatMois, formatDateCourte, jourSemaine, JOURS_LONGS } from '../../dates.js';
import { eur, premierJourConnu, mediane } from './commun.js';

export const NB_PERIODES_ANNEE = 12;
export const MAX_PREVENTIONS = 3;
export const JOURS_CHARGE_PROCHE = 4;
/** Un jour « habituellement cher » : sa moyenne dépasse d'au moins 20 % la moyenne de tous les jours. */
export const SURCOUT_JOUR_CHER_POURCENT = 20;
/** Une envie « presque atteinte » : au moins 80 % de côté. */
export const ENVIE_PRESQUE_POURCENT = 80;

const per = (etat, date, auj) => periodeBudget(date, etat.profil || {}, { reference: auj });
const quand = (n) => (n <= 0 ? 'aujourd’hui' : n === 1 ? 'demain' : `dans ${n} jours`);
const liste = (mots) => (mots.length <= 1 ? mots.join('') : `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`);

/** Épargne d'une période : nette (versée − reprise), versée, reprise. */
function epargneDe(etat, debut, fin) {
  const e = epargneNettePeriode(etat.transactions || [], debut, fin);
  return { epargneCentimes: e.nette, epargneVerseeCentimes: e.versements, epargneRepriseCentimes: e.reprises };
}

/** Dépenses du quotidien par catégorie entre deux dates, triées (montants positifs seulement). */
function parCategorie(etat, debut, fin) {
  const m = new Map();
  for (const t of etat.transactions || []) {
    if (t.date < debut || t.date > fin || t.ajustement || !estDepenseQuotidienne(t)) continue;
    const c = contributionDepense(t);
    if (c) m.set(t.categorie || 'autres', (m.get(t.categorie || 'autres') || 0) + c);
  }
  return [...m.entries()].filter(([, v]) => v > 0).map(([categorie, montantCentimes]) => ({ categorie, nom: nomCategorie(categorie), montantCentimes }))
    .sort((a, b) => b.montantCentimes - a.montantCentimes || (a.categorie < b.categorie ? -1 : 1));
}

/**
 * Le mois en cours (depuis le salaire) : où part l'argent, comparaison avec la même date du mois dernier,
 * série de jours notés et jours sans dépense, épargne.
 * top : les 3 plus grosses catégories ; toutes : toutes les catégories du mois, de la plus grosse à la plus petite.
 */
export function resumeMois(etat, auj) {
  const p = per(etat, auj, auj);
  const premier = premierJourConnu(etat);
  const cats = parCategorie(etat, p.debut, auj);
  const totalPositif = cats.reduce((s, c) => s + c.montantCentimes, 0);
  const total = depensesVariables(etat, p.debut, auj);
  const toutes = cats.map((c) => ({ ...c, part: totalPositif ? Math.round((c.montantCentimes * 100) / totalPositif) : 0 }));
  const top = toutes.slice(0, 3);

  // Même nombre de jours depuis le salaire, le mois d'avant (seulement si l'app le connaît en entier)
  const prec = per(etat, ajouterJours(p.debut, -1), auj);
  const ecoules = diffJours(p.debut, auj);
  const finComparable = [ajouterJours(prec.debut, ecoules), prec.fin].sort()[0];
  let comparaison = null;
  if (premier && premier <= prec.debut) {
    const avant = depensesVariables(etat, prec.debut, finComparable);
    comparaison = { mois: prec.mois, precedentCentimes: avant, ecartCentimes: total - avant };
  }

  // Jours clos depuis le salaire (et depuis le début du suivi) sans aucune dépense du quotidien
  const debutClos = premier && premier > p.debut ? premier : p.debut;
  let joursClos = 0; let sansDepense = 0;
  if (premier) for (let d = debutClos; d < auj; d = ajouterJours(d, 1)) { joursClos += 1; if (depensesVariables(etat, d, d) <= 0) sansDepense += 1; }
  const flammes = serieJours(etat, auj);

  // Épargne : virée vers l'épargne, reprise sur l'épargne, et mise de côté pas encore virée (privations, restes du jour)
  const ep = epargneNettePeriode(etat.transactions || [], p.debut, auj);
  const aVirer = (etat.privations || []).filter((x) => x.date >= p.debut && x.date <= auj && !x.vireLe).reduce((s, x) => s + x.montantCentimes, 0);
  const visee = resteADepenser(etat, auj).epargneViseeCentimes;
  const epargne = { verseeCentimes: ep.versements, repriseCentimes: ep.reprises, netteCentimes: ep.nette, aVirerCentimes: aVirer, misDeCoteCentimes: ep.versements + aVirer, viseeCentimes: visee };

  const phrases = [];
  phrases.push(top.length ? `Ton argent part surtout en ${liste(top.map((c) => `${c.nom} (${eur(c.montantCentimes)})`))}.` : 'Aucune dépense du quotidien notée depuis le salaire.');
  if (comparaison && (total > 0 || comparaison.precedentCentimes > 0)) {
    const e = comparaison.ecartCentimes;
    phrases.push(e === 0 ? 'Autant qu’à la même date le mois dernier.' : `C’est ${eur(e)} de ${e < 0 ? 'moins' : 'plus'} qu’à la même date le mois dernier.`);
  }
  if (flammes >= 2) phrases.push(`Série en cours : ${flammes} jours d’affilée.`);
  if (sansDepense > 0) phrases.push(`${sansDepense} jour${sansDepense > 1 ? 's' : ''} sans dépense depuis le salaire.`);
  if (epargne.misDeCoteCentimes > 0) phrases.push(`Ce mois-ci, tu as mis ${eur(epargne.misDeCoteCentimes)} de côté${epargne.repriseCentimes > 0 ? ` et repris ${eur(epargne.repriseCentimes)}` : ''}.`);
  else if (epargne.repriseCentimes > 0) phrases.push(`Ce mois-ci, tu as repris ${eur(epargne.repriseCentimes)} sur ton épargne.`);

  return { periode: p, totalCentimes: total, top, toutes, comparaison, flammes, joursSansDepense: sansDepense, joursClos, epargne, phrases };
}

/**
 * L'année : les 12 dernières périodes (la période en cours comprise, marquée enCours), du plus ancien au plus récent.
 * Niveau de chaque période selon sa dépense du quotidien par jour, comparée à la médiane des périodes complètes :
 * calme (10 % de moins ou mieux), chargé (10 % de plus ou pire), sinon moyen. Moins de 2 périodes : tout est « moyen ».
 */
export function resumeAnnee(etat, auj) {
  const premier = premierJourConnu(etat);
  const periodes = [];
  if (premier) {
    let p = per(etat, auj, auj);
    for (let k = 0; k < NB_PERIODES_ANNEE && p.fin >= premier; k += 1) {
      const fin = p.fin < auj ? p.fin : auj;
      const debut = p.debut > premier ? p.debut : premier;
      const jours = diffJours(debut, fin) + 1;
      const total = depensesVariables(etat, p.debut, fin);
      periodes.unshift({ mois: p.mois, nom: formatMois(p.mois), debut: p.debut, fin: p.fin, jours, enCours: auj <= p.fin, complete: auj > p.fin && debut === p.debut,
        depenseCentimes: total, parJourCentimes: Math.round(total / jours), ...epargneDe(etat, p.debut, fin), niveau: 'moyen' });
      p = per(etat, ajouterJours(p.debut, -1), auj);
    }
  }
  const completes = periodes.filter((x) => x.complete);
  const reference = mediane((completes.length ? completes : periodes).map((x) => x.parJourCentimes));
  if (periodes.length >= 2 && reference > 0) {
    for (const x of periodes) x.niveau = x.parJourCentimes * 10 <= reference * 9 ? 'calme' : x.parJourCentimes * 10 >= reference * 11 ? 'charge' : 'moyen';
  }
  const plusCalme = completes.length ? [...completes].sort((a, b) => a.parJourCentimes - b.parJourCentimes || (a.debut < b.debut ? 1 : -1))[0] : null;
  const somme = (k) => periodes.reduce((s, x) => s + x[k], 0);
  const totalEpargne = somme('epargneCentimes');
  const totalDepense = somme('depenseCentimes');
  const verse = somme('epargneVerseeCentimes'); const repris = somme('epargneRepriseCentimes');
  const phrases = [];
  if (!periodes.length) phrases.push('Pas encore de dépenses notées : ton année se remplira au fil des mois.');
  else {
    const mois = `${periodes.length} mois`;
    if (verse > 0 && repris > 0) phrases.push(`Sur ${mois}, tu as mis ${eur(verse)} de côté et repris ${eur(repris)}.`);
    else if (verse > 0) phrases.push(`Sur ${mois}, tu as mis ${eur(verse)} de côté.`);
    else phrases.push(repris > 0 ? `Sur ${mois}, tu as repris ${eur(repris)} sur ton épargne.` : `Sur ${mois}, rien n’a encore été mis de côté.`);
    if (plusCalme && completes.length >= 2) phrases.push(`Ton mois le plus calme : ${plusCalme.nom} (${eur(plusCalme.parJourCentimes)} par jour).`);
  }
  return { periodes, totalDepenseCentimes: totalDepense, totalEpargneCentimes: totalEpargne, totalVerseCentimes: verse, totalReprisCentimes: repris, referenceParJourCentimes: reference, plusCalme, phrases };
}

/**
 * Ce qui mérite d'être dit aujourd'hui, 3 au plus, toujours dans cet ordre :
 *  1. un prélèvement avant le salaire que ton solde ne couvre pas ;
 *  2. une charge fixe dans 4 jours ou moins ;
 *  3. demain, ton jour habituellement le plus cher ;
 *  4. une envie presque atteinte (ou prête).
 * @returns {Array<{ type, phrase, date?, montantCentimes?, manqueCentimes? }>}
 */
export function preventions(etat, auj) {
  const res = [];
  const p = per(etat, auj, auj);

  // 1. Prélèvement non couvert d'ici la veille du salaire
  const proj = projectionDecouvert(etat, auj, { jours: Math.max(0, diffJours(auj, p.fin)), inclureRythme: false });
  const nc = proj?.chargeNonCouverte;
  if (nc) {
    res.push({ type: 'prelevement-non-couvert', date: nc.date, montantCentimes: -nc.montantCentimes, manqueCentimes: -nc.soldeApresCentimes,
      phrase: `« ${nc.libelle} » (${eur(nc.montantCentimes)}) passe ${quand(diffJours(auj, nc.date))} : ton compte n’aura pas assez, il manquera ${eur(nc.soldeApresCentimes)}.` });
  }

  // 2. Charges fixes proches (cette période et le début de la suivante)
  const p2 = per(etat, ajouterJours(p.fin, 1), auj);
  const proches = [...chargesFixesPeriode(etat, p), ...(p2.debut !== p.debut ? chargesFixesPeriode(etat, p2) : [])]
    .filter((c) => !c.payee && c.date >= auj && diffJours(auj, c.date) <= JOURS_CHARGE_PROCHE && !(nc && nc.date === c.date && nc.libelle === c.libelle))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.montantPrevuCentimes - a.montantPrevuCentimes));
  for (const c of proches) {
    res.push({ type: 'charge-proche', date: c.date, montantCentimes: c.montantPrevuCentimes, phrase: `« ${c.libelle} » (${eur(c.montantPrevuCentimes)}) passe ${quand(diffJours(auj, c.date))}.` });
  }

  // 3. Demain, le jour de la semaine où tu dépenses le plus d'habitude
  if (res.length < MAX_PREVENTIONS) {
    const st = statsDepenses(etat, auj);
    const demain = ajouterJours(auj, 1);
    const jc = st.jourCher;
    if (st.fiable && jc && jc.jour === jourSemaine(demain) && st.global.moyenne > 0 && jc.moyenneCentimes * 100 >= st.global.moyenne * (100 + SURCOUT_JOUR_CHER_POURCENT)) {
      res.push({ type: 'jour-cher', date: demain, montantCentimes: jc.moyenneCentimes,
        phrase: `Demain, c’est ${JOURS_LONGS[jc.jour - 1]} : d’habitude ton jour le plus cher (${eur(jc.moyenneCentimes)} en moyenne).` });
    }
  }

  // 4. Envie presque atteinte, ou prête
  if (res.length < MAX_PREVENTIONS) {
    const e = fluxEnvies(etat, { aujourdhuiIso: auj }).active;
    if (e && e.cibleCentimes > 0 && !e.achat) {
      if (e.complete) res.push({ type: 'envie-prete', montantCentimes: e.cibleCentimes, phrase: `C’est bon pour « ${e.nom} » : l’argent est de côté.` });
      else if (e.cumulCentimes * 100 >= e.cibleCentimes * ENVIE_PRESQUE_POURCENT) res.push({ type: 'envie-presque', montantCentimes: e.resteCentimes, phrase: `Plus que ${eur(e.resteCentimes)} pour « ${e.nom} ».` });
    }
  }
  return res.slice(0, MAX_PREVENTIONS);
}

// ---------------------------------------------------------------------------
// Pour l'écran Résumé : la météo du mois et des phrases très courtes (une idée par phrase)
// ---------------------------------------------------------------------------

/** Météo du risque : un dessin et un titre court ; la phrase détaillée reste celle de risqueDuMois. */
export const METEO = {
  calme: { dessin: 'soleil', titre: 'Tu devrais tenir jusqu’au salaire' },
  attention: { dessin: 'nuage', titre: 'Ça passe, mais tout juste' },
  risque: { dessin: 'orage', titre: 'Attention, ça risque de coincer' },
  'pas-assez': { dessin: 'voile', titre: 'Encore un peu tôt pour prévoir' },
};

/**
 * Une phrase courte et douce sous la météo (la phrase complète de risqueDuMois reste disponible : phraseComplete).
 * Les charges à venir sont dites par les préventions, pas ici.
 */
function phraseCourte(r) {
  const d = r?.details;
  if (!r || !d) return '';
  if (d.decouvert) return `Ton compte ne couvre pas « ${d.decouvert.libelle} » : il manquera ${eur(d.decouvert.manqueCentimes)}.`;
  if (r.niveau === 'pas-assez') return 'Note tes dépenses quelques jours de plus : la prévision arrivera.';
  if (d.joursRestants === 0) return r.phrase.split(/(?<=\.) Encore /)[0];
  if (r.niveau === 'calme') return `À ton rythme, il te resterait environ ${eur(Math.max(0, d.attenduCentimes))} le jour du salaire.`;
  if (r.niveau === 'attention') return `Garde au plus ${eur(d.rythmeMaxCentimes)} par jour jusqu’au salaire.`;
  return d.rythmeMaxCentimes > 0 ? `Pour tenir, vise ${eur(d.rythmeMaxCentimes)} par jour jusqu’au salaire.` : 'Le mois est serré : chaque jour sans dépense aide.';
}
export const meteoDuMois = (risque) => ({ ...(METEO[risque?.niveau] || METEO['pas-assez']), niveau: risque?.niveau || 'pas-assez', phrase: phraseCourte(risque), phraseComplete: risque?.phrase || '' });

/** Les niveaux d'une période, en mots (légende des pastilles de l'année). */
export const NIVEAUX_ANNEE = [['calme', 'calme'], ['moyen', 'moyen'], ['charge', 'chargé']];

/**
 * Les phrases illustrées du mois (une idée chacune ; null quand il n'y a rien à dire).
 * @param m résultat de resumeMois
 * @returns {{ ouPart, comparaison, serie, epargne }} chacune { emoji, texte } | null
 */
export function phrasesMois(m) {
  const noms = m.top.map((c) => (/^.[a-zà-ÿ]/.test(c.nom) ? c.nom.charAt(0).toLowerCase() + c.nom.slice(1) : c.nom)); // « VTC » reste en majuscules
  const ouPart = m.top.length ? { emoji: '🧭', texte: `Ton argent part surtout en ${noms[0]}.` } : { emoji: '🌱', texte: 'Rien de dépensé au quotidien depuis le salaire.' };
  let comparaison = null;
  const c = m.comparaison;
  if (c && (m.totalCentimes > 0 || c.precedentCentimes > 0)) {
    const e = c.ecartCentimes;
    comparaison = e < 0 ? { emoji: '🎉', texte: `${eur(e)} de moins que le mois dernier à la même date.` }
      : e > 0 ? { emoji: '👀', texte: `${eur(e)} de plus que le mois dernier à la même date.` }
        : { emoji: '🤝', texte: 'Pareil que le mois dernier à la même date.' };
  }
  const f = m.flammes; const s = m.joursSansDepense;
  const morceaux = [f >= 2 ? `${f} jours notés d’affilée` : null, s > 0 ? `${s} jour${s > 1 ? 's' : ''} sans dépense` : null].filter(Boolean);
  const serie = morceaux.length ? { emoji: f >= 2 ? '🔥' : '🌙', texte: `${morceaux.join(' et ').replace(/^./, (x) => x.toUpperCase())}.` } : null;
  const ep = m.epargne;
  const epargne = ep.misDeCoteCentimes > 0 ? { emoji: '🫙', texte: `Tu as mis ${eur(ep.misDeCoteCentimes)} de côté depuis le salaire.` }
    : ep.repriseCentimes > 0 ? { emoji: '🫙', texte: `Tu as repris ${eur(ep.repriseCentimes)} sur ton épargne ce mois-ci.` } : null;
  return { ouPart, comparaison, serie, epargne };
}

/**
 * Les phrases de l'année.
 * @param a résultat de resumeAnnee
 * @returns {{ epargne, calme }} chacune { emoji, texte } | null
 */
export function phrasesAnnee(a) {
  if (!a.periodes.length) return { epargne: { emoji: '🌱', texte: 'Ton année se remplira au fil des mois.' }, calme: null };
  const n = a.periodes.length;
  const sur = n === 1 ? 'Ce mois-ci' : `Sur ${n} mois`;
  const epargne = a.totalVerseCentimes > 0 ? { emoji: '🫙', texte: `${sur}, tu as mis ${eur(a.totalVerseCentimes)} de côté${a.totalReprisCentimes > 0 ? ` (et repris ${eur(a.totalReprisCentimes)})` : ''}.` }
    : { emoji: '🫙', texte: a.totalReprisCentimes > 0 ? `${sur}, tu as repris ${eur(a.totalReprisCentimes)} sur ton épargne.` : `${sur}, rien n’a encore été mis de côté.` };
  const pc = a.plusCalme;
  const calme = pc && a.periodes.filter((x) => x.complete).length >= 2 ? { emoji: '🌿', texte: `Ton mois le plus calme : ${pc.nom} (${eur(pc.parJourCentimes)} par jour).` } : null;
  return { epargne, calme };
}
