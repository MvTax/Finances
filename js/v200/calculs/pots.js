// pots.js (v200) — l'onglet Épargne en trois pots : Sécurité (poche « coussin »), Prêt (poche « remboursementAnticipe »)
// et Envie (l'envie en cours). Pour chaque pot : ce qu'il y a dedans, l'objectif, ce qui manque, et le rythme récent,
// en 2 ou 3 phrases simples. Plus le virement à faire (aVirerEpargne) et une phrase sur les arrondis du mois.
// Les chiffres viennent des calculs existants (soldePoche, aVirerEpargne, fluxEnvies, arrondisPeriode) : rien n'est
// recalculé autrement. Fonctions pures : l'état et la journée de budget sont passés en paramètres.

import { soldePoche } from '../../epargne.js';
import { aVirerEpargne, compteDesEpargnes, nomCompteEpargne } from '../../virements.js';
import { fluxEnvies } from '../../envies.js';
import { arrondisPeriode, periodeBudget } from '../../calculs.js';
import { ajouterJours, diffJours, formatJourLong, formatMois, moisDe } from '../../dates.js';
import { eur } from './commun.js';

/** Le rythme se mesure sur les 90 derniers jours (au moins 21 jours d'historique pour en parler). */
export const JOURS_RYTHME = 90;
export const JOURS_RYTHME_MIN = 21;
/** Une envie : rythme sur les 4 dernières semaines. */
export const JOURS_RYTHME_ENVIE = 28;
/** Au-delà de 10 ans, on ne donne pas de date : ce ne serait pas parlant. */
export const MOIS_MAX_ESTIMATION = 120;

const pourcent = (s, c) => (c > 0 ? Math.max(0, Math.min(100, Math.floor((s * 100) / c))) : 0);

/**
 * Rythme d'une poche : ce qui y est entré (versements − reprises) sur les 90 derniers jours, ramené à 30 jours.
 * @returns {number|null} centimes par mois, ou null si trop peu d'historique ou rien de versé
 */
export function rythmePoche(poche, auj) {
  const mvts = (poche?.mouvements || []).filter((m) => m.date <= auj);
  if (!mvts.length) return null;
  const premier = mvts.reduce((m, x) => (x.date < m ? x.date : m), mvts[0].date);
  const depuis = ajouterJours(auj, -(JOURS_RYTHME - 1));
  const debut = premier > depuis ? premier : depuis;
  const jours = diffJours(debut, auj) + 1;
  if (jours < JOURS_RYTHME_MIN) return null;
  let net = 0;
  for (const m of mvts) if (m.date >= debut) net += m.sens === 'versement' ? m.montantCentimes : -m.montantCentimes;
  const parMois = Math.round((net * 30) / jours);
  return parMois > 0 ? parMois : null;
}

/** « vers mars 2027 » : quand le pot serait plein, à ce rythme (null si trop loin ou pas de rythme). */
export function finEstimee(resteCentimes, parMoisCentimes, auj) {
  if (!(resteCentimes > 0) || !(parMoisCentimes > 0)) return null;
  const mois = Math.ceil(resteCentimes / parMoisCentimes);
  if (mois > MOIS_MAX_ESTIMATION) return null;
  return moisDe(ajouterJours(auj, Math.ceil((resteCentimes * 30) / parMoisCentimes)));
}

function potPoche(id, nom, emoji, poche, enAttente, auj) {
  const vire = soldePoche(poche);
  const solde = vire + enAttente;
  const cible = poche.cibleCentimes > 0 ? poche.cibleCentimes : null;
  const reste = cible ? Math.max(0, cible - solde) : null;
  const complet = !!cible && reste === 0;
  const rythme = rythmePoche(poche, auj);
  const fin = cible ? finEstimee(reste, rythme, auj) : null;
  const phrases = [];
  phrases.push(solde > 0
    ? `Il y a ${eur(solde)} dans ton pot ${nom}${enAttente > 0 ? `, dont ${eur(enAttente)} encore à virer` : ''}.`
    : `Ton pot ${nom} est encore vide : il se remplit à chaque virement.`);
  if (cible) phrases.push(complet ? `Objectif atteint : ${eur(cible)} 🎉` : `Encore ${eur(reste)} pour atteindre ${eur(cible)}.`);
  if (!complet) {
    if (rythme && fin) phrases.push(`À ton rythme (environ ${eur(rythme)} par mois), il sera plein vers ${formatMois(fin)}.`);
    else if (rythme) phrases.push(`Ces derniers temps, il grandit d’environ ${eur(rythme)} par mois.`);
    else phrases.push('Chaque virement vers l’épargne le fait grandir.');
  }
  return { id, nom, emoji, poche, envie: null, soldeCentimes: solde, vireCentimes: vire, enAttenteCentimes: enAttente, cibleCentimes: cible, resteCentimes: reste,
    pourcent: cible ? pourcent(solde, cible) : (solde > 0 ? 100 : 0), complet, rythme: rythme ? { montantCentimes: rythme, par: 'mois' } : null, finMois: fin, phrases };
}

/** Rythme d'une envie : ce qui y est entré les 4 dernières semaines, par semaine. */
export function rythmeEnvie(envie, auj) {
  const depuis = ajouterJours(auj, -(JOURS_RYTHME_ENVIE - 1));
  const premier = (envie.contributions || [])[0]?.date;
  if (!premier) return null;
  const debut = premier > depuis ? premier : depuis;
  const jours = diffJours(debut, auj) + 1;
  if (jours < 7) return null;
  const somme = envie.contributions.filter((c) => c.date >= debut && c.date <= auj).reduce((s, c) => s + c.montantCentimes, 0);
  const parSemaine = Math.round((somme * 7) / jours);
  return parSemaine > 0 ? parSemaine : null;
}

function potEnvie(flux, auj) {
  const e = flux.active;
  if (!e || !(e.cibleCentimes > 0)) {
    return { id: 'envie', nom: 'Envie', emoji: '🎁', poche: null, envie: null, soldeCentimes: 0, enAttenteCentimes: 0, cibleCentimes: null, resteCentimes: null, pourcent: 0, complet: false, rythme: null, finMois: null,
      phrases: ['Pas encore d’envie en cours.', 'Choisis un petit plaisir : une part de chaque journée réussie le remplira.'] };
  }
  const solde = Math.min(e.cumulCentimes, e.cibleCentimes);
  const reste = e.resteCentimes;
  const rythme = rythmeEnvie(e, auj);
  const phrases = [];
  if (e.complete) {
    phrases.push(`C’est bon pour « ${e.nom} » : ${eur(e.cibleCentimes)} de côté 🎉`);
    phrases.push(e.achat ? 'Acheté, et entièrement remboursé.' : 'Tu peux te faire plaisir sans culpabiliser.');
  } else {
    phrases.push(solde > 0 ? `Il y a ${eur(solde)} pour « ${e.nom} » dans ton pot Envie.` : `Ton pot Envie attend « ${e.nom} ».`);
    phrases.push(e.achat ? `Déjà acheté en avance : encore ${eur(reste)} à remettre.` : `Encore ${eur(reste)} pour l’avoir (${eur(e.cibleCentimes)}).`);
    if (rythme) {
      const semaines = Math.ceil(reste / rythme);
      phrases.push(semaines <= 1 ? `À ce rythme (${eur(rythme)} par semaine), c’est pour la semaine prochaine.` : semaines <= 52
        ? `À ce rythme (${eur(rythme)} par semaine), encore environ ${semaines} semaines.` : `Ces derniers temps, ${eur(rythme)} par semaine.`);
    } else phrases.push('Chaque journée où il te reste de l’argent le remplit un peu.');
  }
  return { id: 'envie', nom: 'Envie', emoji: '🎁', poche: null, envie: e, soldeCentimes: solde, enAttenteCentimes: 0, cibleCentimes: e.cibleCentimes, resteCentimes: reste,
    pourcent: pourcent(solde, e.cibleCentimes), complet: e.complete, rythme: rythme ? { montantCentimes: rythme, par: 'semaine' } : null, finMois: null, phrases };
}

/**
 * Le virement vers l'épargne : à faire (montant > 0) ou à jour.
 * @returns {{ montantCentimes, date, aFaire: boolean, aujourdhui: boolean, enRetard: boolean, phrase, details }}
 */
export function virementDuJour(etat, auj, v = aVirerEpargne(etat, auj)) {
  const m = v.semaineCentimes || 0;
  const ajd = v.dateVirement <= auj;
  const quand = ajd ? 'aujourd’hui' : v.dateVirement === ajouterJours(auj, 1) ? 'demain' : `le ${formatJourLong(v.dateVirement)}`;
  const phrase = m > 0 ? `À faire ${quand}${v.enRetard ? ' (il a pris un peu de retard)' : ''}.`
    : `Tout est viré ✨ Prochain virement ${quand}.`;
  return { montantCentimes: m, date: v.dateVirement, aFaire: m > 0, aujourdhui: ajd, enRetard: !!v.enRetard, phrase, details: v };
}

/** Une phrase sur les arrondis du mois (depuis le salaire, virés ou non). */
export function phraseArrondis(etat, auj) {
  const ar = etat.profil?.arrondi;
  if (!ar?.actif) return { actif: false, centimes: 0, phrase: 'Les arrondis sont éteints. Tu peux les allumer dans les réglages.' };
  const periode = periodeBudget(auj, etat.profil || {}, { reference: auj });
  const c = arrondisPeriode(etat, { ...periode, fin: auj });
  return { actif: true, centimes: c, phrase: c > 0 ? `Tes arrondis ce mois-ci : ${eur(c)} mis de côté sans y penser.` : 'Pas encore d’arrondi ce mois-ci : il viendra avec tes prochaines dépenses.' };
}

/**
 * Phrase après « Recalculer l'épargne » : le total à virer avant et après le recalcul.
 * « Mis à jour : 12,40 € → 14,10 € à virer » si ça a changé, sinon « Déjà à jour : X à virer ».
 * @param {number} avantCentimes  total à virer lu juste avant le recalcul
 * @param {number} apresCentimes  total à virer après le recalcul
 * @param {{ masque?: boolean }} o  masque : montants remplacés par •••
 */
export function phraseRecalcul(avantCentimes, apresCentimes, { masque = false } = {}) {
  const a = Math.max(0, Math.trunc(avantCentimes || 0));
  const b = Math.max(0, Math.trunc(apresCentimes || 0));
  const m = (c) => (masque ? '•••' : eur(c));
  if (a === b) return b > 0 ? `Déjà à jour : ${m(b)} à virer.` : 'Déjà à jour : rien à virer.';
  if (masque) return 'Mis à jour : ••• à virer.';
  return b > 0 ? `Mis à jour : ${m(a)} → ${m(b)} à virer.` : `Mis à jour : ${m(a)} → rien à virer.`;
}

/**
 * Une seule épargne sur un seul compte, suivie en deux parts : « Tout est sur ton Livret A LCL : 120 € pour l’épargne prêt
 * (sur 8 000 €), 80 € pour l’épargne sécurité. » Montants = ceux des pots (déjà viré + part en attente).
 * Sans compte renseigné : « Tes épargnes : … ». Aucun pot Prêt ni Sécurité : null.
 * @param {Array} pots  pots de potsEpargne
 * @param {{ masque?: boolean }} o  masque : montants remplacés par •••
 * @returns {{ compte, pretCentimes, securiteCentimes, phrase } | null}
 */
export function repartitionEpargnes(etat, pots, { masque = false } = {}) {
  const pret = pots.find((p) => p.id === 'pret');
  const secu = pots.find((p) => p.id === 'securite');
  if (!pret && !secu) return null;
  const m = (c) => (masque ? '•••' : eur(c));
  const compte = compteDesEpargnes(etat);
  const parts = [];
  if (pret) parts.push(`${m(pret.soldeCentimes)} pour l’épargne prêt${pret.cibleCentimes ? ` (sur ${eur(pret.cibleCentimes)})` : ''}`);
  if (secu) parts.push(`${m(secu.soldeCentimes)} pour l’épargne sécurité`);
  const debut = compte ? `Tout est sur ${nomCompteEpargne(compte)}` : 'Tes épargnes';
  return { compte, pretCentimes: pret?.soldeCentimes || 0, securiteCentimes: secu?.soldeCentimes || 0, phrase: `${debut} : ${parts.join(', ')}.` };
}

/**
 * Les trois pots, dans l'ordre Sécurité, Prêt, Envie (un pot sans poche n'est pas montré ; l'Envie l'est toujours).
 * @returns {{ pots: Array<pot>, virement, arrondis }}
 */
export function potsEpargne(etat, auj) {
  const v = aVirerEpargne(etat, auj);
  const attente = (id) => v.parPoche.find((x) => x.pocheId === id)?.montantCentimes || 0;
  const actives = (etat.poches || []).filter((p) => p.actif !== false);
  const secu = actives.find((p) => p.type === 'coussin');
  const pret = actives.find((p) => p.type === 'remboursementAnticipe');
  const pots = [
    secu ? potPoche('securite', 'Sécurité', '🛟', secu, attente(secu.id), auj) : null,
    pret ? potPoche('pret', 'Prêt', '🔑', pret, attente(pret.id), auj) : null,
    potEnvie(fluxEnvies(etat, { aujourdhuiIso: auj, auto: v.privationsAuto }), auj),
  ].filter(Boolean);
  return { pots, virement: virementDuJour(etat, auj, v), arrondis: phraseArrondis(etat, auj), repartition: repartitionEpargnes(etat, pots) };
}
