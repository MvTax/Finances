// coach.js — plan d'action « Supprimer / Éviter / Réduire / Remplacer / Garder ».
// Version locale par règles (mode 100 % local ou sans clé) + préparation des agrégats anonymisés pour Gemini.

import { analyser } from './detecteurs.js';
import { ajouterJours, diffJours, moisDe } from './dates.js';
import { formatEuros } from './money.js';
import { nomCategorie } from './categories.js';
import { epargneCible, periodeBudget } from './calculs.js';

const eur = (c) => formatEuros(c);
const parMois = (total, nbMois) => Math.round(total / Math.max(1, nbMois));

function carte(action, marchand, constat, consigne, economieMensuelleCentimes, priorite, cle) {
  const eco = Math.max(0, Math.round(economieMensuelleCentimes));
  return { id: `regle:${cle || action + ':' + marchand}`, action, marchand, constat, consigne, economieMensuelleCentimes: eco, economieAnnuelleCentimes: eco * 12, priorite, source: 'regles' };
}

/**
 * Plan d'action par règles sur une fenêtre (par défaut les 3 derniers mois de données).
 * @returns {Array} cartes triées par priorité puis économie
 */
export function planActionLocal(etat, { fin, nbMois = 3 } = {}) {
  const tx = etat.transactions || [];
  const derniere = fin || tx.reduce((m, t) => (t.date > m ? t.date : m), '0000-00-00');
  const debut = ajouterJours(derniere, -Math.round(nbMois * 30.44) + 1);
  const mois = Math.max(1, diffJours(debut, derniere) / 30.44);
  const a = analyser(etat, debut, derniere);
  const cartes = [];

  // 1. Crédit instantané : priorité absolue
  const ci = a.creditInstant;
  if (ci.nbDeblocages > 0) {
    const encours = (etat.creditsBancaires || []).filter((c) => c.type === 'instantane').reduce((s, c) => s + (c.echeancier || []).filter((e) => !e.payee).reduce((x, e) => x + e.montantCentimes, 0), 0);
    cartes.push(carte('supprimer', 'Crédit instant',
      `${ci.nbDeblocages} déblocage(s) pour ${eur(ci.totalDebloqueCentimes)} sur la période, ${eur(ci.fraisCentimes)} de frais${encours ? `, ${eur(encours)} encore à rembourser` : ''}.`,
      "Plus aucun nouveau crédit instant. Les échéances restantes passent avant toute épargne ; le coussin de sécurité sert ensuite à ne plus jamais en avoir besoin.",
      parMois(ci.fraisCentimes, mois) + 800, 1, 'credit-instant'));
  }
  // 2. Frais bancaires évitables
  const evitables = a.frais.parType.filter(([k]) => /incident|commission|crédit instant|retrait/i.test(k));
  const totalEvitable = evitables.reduce((s, [, v]) => s + v, 0);
  if (totalEvitable > 0) {
    cartes.push(carte('eviter', 'Frais bancaires', `${eur(totalEvitable)} de frais évitables (${evitables.map(([k, v]) => `${k} ${eur(v)}`).join(', ')}).`,
      'Zéro découvert : vérifie la projection à 7 jours avant chaque dépense et rapatrie l’argent de Revolut avant les prélèvements. Retire au distributeur de ta banque uniquement.',
      parMois(totalEvitable, mois), 1, 'frais'));
  }
  // 3. Livraison de repas (direct + via un tiers)
  const lv = a.livraison;
  if (lv.commandes >= 4) {
    const mensuel = parMois(lv.totalCentimes, mois);
    const cible = Math.max(2, Math.round(lv.commandes / mois / 3));
    cartes.push(carte('reduire', 'Uber Eats',
      `${lv.commandes} commandes en ${Math.round(mois)} mois pour ${eur(lv.totalCentimes)} (dont ${lv.nbTiers} via un tiers pour ${eur(lv.tiersCentimes)}), panier moyen ${eur(lv.panierMoyenCentimes)}.`,
      `Maximum ${cible} commandes par mois, le vendredi soir. Les autres soirs : plat maison ou courses.`,
      mensuel - cible * lv.panierMoyenCentimes, 2, 'livraison'));
  }
  // 4. VTC vs pass transport
  const v = a.vtc;
  if (v.nb >= 6) {
    const mensuel = parMois(v.totalCentimes, mois);
    const top = v.parMarchand.slice(0, 2).map(([m]) => m).join(' et ');
    if (v.passTransport.length) {
      cartes.push(carte('remplacer', top || 'VTC', `${v.nb} trajets VTC pour ${eur(v.totalCentimes)} alors que tu paies déjà ${v.passTransport.map((p) => `${p.libelle} (${eur(p.montantCentimes)})`).join(', ')}.`,
        'Remplace les VTC par ton pass transport : VTC seulement après minuit ou à plusieurs.', mensuel * 0.75, 2, 'vtc'));
    } else {
      cartes.push(carte('reduire', top || 'VTC', `${v.nb} trajets VTC pour ${eur(v.totalCentimes)} (${eur(mensuel)} par mois).`,
        'Maximum 4 trajets par mois. Compare avec un forfait Navigo mensuel : au-delà de 10 trajets, le pass est rentable.', mensuel * 0.6, 2, 'vtc'));
    }
  }
  // 5. Restauration rapide : marchand principal
  const rr = a.restaurationRapide;
  if (rr.nb >= 6) {
    const [marchand, total] = rr.parMarchand[0];
    const passages = (etat.transactions || []).filter((t) => t.marchand === marchand && t.date >= debut && t.date <= derniere && t.sens === 'debit').length;
    cartes.push(carte('eviter', marchand, `${eur(total)} chez ${marchand} en ${passages} passages (${eur(rr.totalCentimes)} de restauration rapide au total).`,
      `Évite ${marchand} : maximum 1 fois par semaine, et jamais deux fois le même jour.`, parMois(total, mois) * 0.6, 3, 'rr'));
  }
  // 6. Abonnements en doublon
  for (const d of a.doublons) {
    if (d.type === 'telephonie') {
      const tri = [...d.elements].sort((x, y) => y.mois - x.mois || y.mensuelCentimes - x.mensuelCentimes);
      const garde = tri[0]; const suppr = tri.slice(1);
      for (const s of suppr) cartes.push(carte('supprimer', s.marchand, `${s.marchand} prélevé ${s.mois} mois (${eur(s.mensuelCentimes)}/mois) en plus de ${garde.marchand}.`, `Supprime ${s.marchand} : tu as déjà ${garde.marchand}.`, s.mensuelCentimes, 2, 'tel:' + s.marchand));
    } else if (d.type === 'ia') {
      const tri = [...d.elements].sort((x, y) => y.mensuelCentimes - x.mensuelCentimes);
      for (const s of tri.slice(1)) cartes.push(carte('supprimer', s.marchand, `${tri.length} abonnements IA en parallèle.`, `Garde un seul abonnement IA ; supprime ${s.marchand}.`, s.mensuelCentimes, 3, 'ia:' + s.marchand));
    } else if (d.type === 'apple') {
      cartes.push(carte('reduire', 'Apple', `Prélèvements Apple de ${d.elements[0].montants.length} montants différents.`, 'Ouvre Réglages → ton nom → Abonnements sur l’iPhone et résilie ce que tu n’utilises plus.', Math.round(d.elements[0].mensuelCentimes * 0.4), 3, 'apple'));
    }
  }
  // 7. Vélo : pénalités probables
  if (a.velo.suspectes >= 2) {
    cartes.push(carte('eviter', "Vélib'", `${a.velo.suspectes} débits identiques le même jour (${eur(a.velo.suspectesCentimes)}) : probables dépassements de durée.`, 'Repose le vélo avant 30 ou 45 minutes (selon ton forfait) et reprends-en un nouveau si besoin.', parMois(a.velo.suspectesCentimes, mois), 4, 'velo'));
  }
  // 8. Espèces non justifiées
  if (a.especes.totalCentimes >= 20000) {
    cartes.push(carte('reduire', 'Espèces', `${a.especes.nb} retraits pour ${eur(a.especes.totalCentimes)}${a.especes.fraisCentimes ? ` (dont ${eur(a.especes.fraisCentimes)} de frais)` : ''}, sans justification.`, 'Fixe un budget espèces mensuel et note chaque dépense en espèces dans l’app (bouton +).', parMois(a.especes.totalCentimes, mois) * 0.3, 3, 'especes'));
  }
  // 9. Shopping (vêtements, beauté, achats en ligne)
  const sh = a.shopping;
  if (sh.nb >= 6) {
    cartes.push(carte('reduire', sh.parMarchand.slice(0, 3).map(([m]) => m).join(', '), `${sh.nb} achats vêtements/beauté/en ligne pour ${eur(sh.totalCentimes)}.`, 'Règle des 7 jours : tout achat non vital attend une semaine dans ta liste d’envies. Budget mensuel fixe.', parMois(sh.totalCentimes, mois) * 0.4, 4, 'shopping'));
  }
  // 10. Épargne reprise
  if (a.epargne.nbReprises >= 2) {
    cartes.push(carte('garder', 'Épargne', `${a.epargne.nbReprises} reprises d'épargne pour ${eur(a.epargne.repriseCentimes)} (épargne nette ${eur(a.epargne.nette)}).`, 'Vire moins mais garde-le : 150 € qui restent valent mieux que 600 € qui reviennent. Avant de reprendre, puise dans l’enveloppe Plaisir ou réduis une enveloppe non vitale.', 0, 2, 'reprises'));
  }
  // 11. À garder : charges utiles (salle de sport, opérateur principal)
  for (const c of (etat.chargesFixes || []).filter((x) => x.actif && ['sport', 'transports'].includes(x.categorie)).slice(0, 2)) {
    cartes.push(carte('garder', c.libelle, `${eur(c.montantCentimes)} par mois.`, c.categorie === 'sport' ? 'Garde-la si tu y vas au moins 2 fois par semaine ; sinon passe à une salle à bas prix.' : 'Garde ton pass : il remplace les VTC.', 0, 5, 'garder:' + c.libelle));
  }

  return cartes.sort((x, y) => x.priorite - y.priorite || y.economieMensuelleCentimes - x.economieMensuelleCentimes);
}

/** Total d'économie potentielle des cartes non ignorées. */
export function totalEconomies(cartes) {
  return cartes.filter((c) => c.statut !== 'ignore').reduce((s, c) => s + (c.economieMensuelleCentimes || 0), 0);
}

/**
 * Agrégats ANONYMISÉS envoyés au coach Gemini : marchands normalisés, totaux, passages, tendances.
 * Les particuliers deviennent « Virement à un particulier n°k ». Jamais de libellé brut, d'IBAN ni de nom.
 */
export function agregatsPourCoach(etat, { fin, nbMois = 3 } = {}) {
  const tx = etat.transactions || [];
  const derniere = fin || tx.reduce((m, t) => (t.date > m ? t.date : m), '0000-00-00');
  const debut = ajouterJours(derniere, -Math.round(nbMois * 30.44) + 1);
  const a = analyser(etat, debut, derniere);
  const alias = new Map();
  const anonymiser = (m) => {
    const t = tx.find((x) => x.marchand === m && x.personne);
    if (!t) return m;
    if (!alias.has(m)) alias.set(m, `Virement à un particulier n°${alias.size + 1}`);
    return alias.get(m);
  };
  return {
    periode: { debut, fin: derniere, nbMois },
    revenusMensuelsCentimes: Math.round(a.mensuel.reduce((s, m) => s + m.revenus, 0) / Math.max(1, a.mensuel.length)),
    chargesFixes: (etat.chargesFixes || []).filter((c) => c.actif).map((c) => ({ libelle: c.libelle, montantCentimes: c.montantCentimes, categorie: nomCategorie(c.categorie) })),
    // L'épargne passe après les dépenses obligatoires : montant possible ce mois-ci, pas un objectif fixe
    epargnePossibleCeMoisCentimes: epargneCible(etat, periodeBudget(derniere, etat.profil || {}).mois, periodeBudget(derniere, etat.profil || {})),
    marchands: a.topMarchands.map((m) => ({ marchand: anonymiser(m.marchand), categorie: nomCategorie(m.categorie), totalCentimes: m.montantCentimes, passages: m.passages })),
    livraison: { commandes: a.livraison.commandes, totalCentimes: a.livraison.totalCentimes, viaTiers: a.livraison.nbTiers },
    vtc: { trajets: a.vtc.nb, totalCentimes: a.vtc.totalCentimes, passTransport: a.vtc.passTransport.length > 0 },
    weekend: a.weekend,
    fraisBancaires: { totalCentimes: a.frais.totalCentimes, types: a.frais.parType.map(([k, v]) => ({ type: k, centimes: v })) },
    creditInstant: { deblocages: a.creditInstant.nbDeblocages, debloqueCentimes: a.creditInstant.totalDebloqueCentimes, fraisCentimes: a.creditInstant.fraisCentimes },
    especes: { retraits: a.especes.nb, totalCentimes: a.especes.totalCentimes },
    reprisesEpargne: { nb: a.epargne.nbReprises, totalCentimes: a.epargne.repriseCentimes },
    doublons: a.doublons.map((d) => ({ type: d.libelle, marchands: d.elements.map((e) => e.marchand) })),
  };
}

/** Validation stricte d'une carte renvoyée par l'IA. */
export function validerCarteIA(c) {
  const actions = ['supprimer', 'eviter', 'reduire', 'remplacer', 'garder'];
  if (!c || typeof c !== 'object') return null;
  if (!actions.includes(c.action)) return null;
  if (typeof c.marchand !== 'string' || typeof c.constat !== 'string' || typeof c.consigne !== 'string') return null;
  const m = Number.isInteger(c.economieMensuelleCentimes) ? c.economieMensuelleCentimes : 0;
  return {
    id: `ia:${c.action}:${c.marchand}`.slice(0, 120),
    action: c.action,
    marchand: c.marchand.slice(0, 80),
    constat: c.constat.slice(0, 400),
    consigne: c.consigne.slice(0, 400),
    economieMensuelleCentimes: Math.max(0, m),
    economieAnnuelleCentimes: Math.max(0, Number.isInteger(c.economieAnnuelleCentimes) ? c.economieAnnuelleCentimes : m * 12),
    priorite: Math.min(5, Math.max(1, Number(c.priorite) || 3)),
    source: 'gemini',
  };
}

export const LIBELLES_ACTIONS = { supprimer: 'Supprimer', eviter: 'Éviter', reduire: 'Réduire', remplacer: 'Remplacer', garder: 'Garder' };
export { moisDe };
