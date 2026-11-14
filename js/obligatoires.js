// obligatoires.js — reconnaître une dépense obligatoire (loyer, facture, abonnement) au moment où tu la notes.
// Une dépense obligatoire compte dans le mois, pas dans ta part du jour : un loyer noté à la main ne doit pas
// faire dire « dépassé aujourd'hui ». Fonctions pures : l'état et la date du jour sont passés en paramètres.
//
// Trois façons de la reconnaître, dans cet ordre :
//  1. une charge fixe active, pas encore payée dans la période, de catégorie compatible, au même montant à 10 % près
//     et à 7 jours près de son échéance → sûr (la dépense est rattachée à la charge : elle la marque payée) ;
//  2. un abonnement repéré (listerAbonnements) au même montant à 10 % près, même nom ou même type → sûr ;
//  3. une catégorie de dépense obligatoire (logement, énergie, téléphonie, abonnements, impôts, crédits)
//     d'au moins 3 fois la part du jour → probable (l'interface te demande de confirmer).
// Une catégorie « Autres » (ou vide) au montant et à la date d'une charge fixe → probable aussi.

import { chargesFixesPeriode, periodeBudget, jaugeDuJour, estDepenseQuotidienne } from './calculs.js';
import { listerAbonnements, reconnaitre } from './abonnements.js';
import { contributionDepense, natureTransaction, nomCategorie } from './categories.js';
import { diffJours, formatDateCourte } from './dates.js';
import { normaliserTexte } from './rules.js';
import { formatEuros } from './money.js';

export const TOLERANCE_POURCENT = 10;
export const TOLERANCE_JOURS = 7;
export const FACTEUR_PART_DU_JOUR = 3;
export const CATEGORIES_OBLIGATOIRES = new Set(['logement', 'energie', 'telephonie', 'abonnements', 'impots', 'credits']);
const CATEGORIES_ABONNEMENT = new Set(['abonnements', 'telephonie', 'sport']);
/** Catégories voisines : une charge « Énergie » notée en « Logement » reste la même charge. */
const VOISINES = { logement: ['energie'], energie: ['logement'], telephonie: ['abonnements'], abonnements: ['telephonie', 'sport'], sport: ['abonnements'] };
const SANS_CATEGORIE = new Set([null, undefined, '', 'autres']);
/** Noms donnés par l'app à une saisie sans libellé : ils ne disent rien du commerçant. */
const NOMS_VIDES = new Set(['', 'DEPENSE', 'INCONNU']);

/** Montant à 10 % près (calcul en entiers : |a − b| × 100 ≤ b × 10). */
export function montantProche(centimes, referenceCentimes, pourcent = TOLERANCE_POURCENT) {
  if (!(referenceCentimes > 0)) return false;
  return Math.abs(centimes - referenceCentimes) * 100 <= referenceCentimes * pourcent;
}

/** 'meme' (même catégorie ou voisine), 'inconnue' (Autres ou vide), ou null (incompatible). */
function compatibilite(categorieCharge, categorieTx) {
  if (SANS_CATEGORIE.has(categorieTx)) return 'inconnue';
  if (categorieCharge === categorieTx || (VOISINES[categorieCharge] || []).includes(categorieTx)) return 'meme';
  return null;
}

const nomUtile = (t) => { const n = normaliserTexte(t.marchand || ''); return NOMS_VIDES.has(n) ? '' : n; };

/** Seulement une vraie sortie d'argent : pas un virement interne, de l'épargne, un prêt ou un ajustement. */
function estSortieCandidate(tx) {
  if (!tx || tx.sens !== 'debit' || tx.ajustement || !(tx.montantCentimes > 0)) return false;
  const n = natureTransaction(tx);
  return n === 'depense' || n === 'dette';
}

/**
 * Cette dépense est-elle obligatoire ?
 * @param etat  l'état de l'app (la dépense n'y est pas encore enregistrée)
 * @param tx    la dépense notée
 * @param auj   la journée de budget (aujourdhui())
 * @param options.partDuJourCentimes  la part du jour déjà calculée (sinon calculée ici)
 * @returns {{ niveau: 'sur'|'probable'|null, chargeFixeId?: string, abonnement?: string, raison: string|null }}
 */
export function reconnaitreObligatoire(etat, tx, auj, { partDuJourCentimes = null } = {}) {
  const aucun = { niveau: null, raison: null };
  if (!estSortieCandidate(tx) || tx.envieId) return aucun;
  if (tx.chargeFixeId) {
    const c = (etat.chargesFixes || []).find((x) => x.id === tx.chargeFixeId);
    return { niveau: 'sur', chargeFixeId: tx.chargeFixeId, raison: `C’est ta charge « ${c?.libelle || 'fixe'} » : elle compte dans le mois, pas dans ta part du jour.` };
  }

  // 1. Charge fixe pas encore payée dans la période
  const periode = periodeBudget(tx.date, etat.profil || {}, { reference: auj });
  const charges = chargesFixesPeriode(etat, periode)
    .filter((c) => !c.payee && Math.abs(diffJours(c.date, tx.date)) <= TOLERANCE_JOURS)
    .map((c) => ({ c, compat: compatibilite(c.categorie, tx.categorie), ecart: Math.min(Math.abs(tx.montantCentimes - c.montantPrevuCentimes), Math.abs(tx.montantCentimes - c.montantCentimes)) }))
    .filter((x) => x.compat && (montantProche(tx.montantCentimes, x.c.montantPrevuCentimes) || montantProche(tx.montantCentimes, x.c.montantCentimes)))
    .sort((a, b) => (a.compat === b.compat ? 0 : a.compat === 'meme' ? -1 : 1) || a.ecart - b.ecart || Math.abs(diffJours(a.c.date, tx.date)) - Math.abs(diffJours(b.c.date, tx.date)));
  if (charges.length) {
    const { c, compat } = charges[0];
    const phrase = `Ça ressemble à ta charge « ${c.libelle} » (${formatEuros(c.montantPrevuCentimes)}, prévue le ${formatDateCourte(c.date)}).`;
    if (compat === 'meme') return { niveau: 'sur', chargeFixeId: c.id, raison: `${phrase} Elle compte dans le mois, pas dans ta part du jour.` };
    return { niveau: 'probable', chargeFixeId: c.id, raison: `${phrase} Si c’est bien elle, elle compte dans le mois, pas dans ta part du jour.` };
  }

  // 2. Abonnement repéré
  const nom = nomUtile(tx);
  const service = reconnaitre(`${tx.marchand || ''} ${tx.libelle || ''}`);
  const abo = listerAbonnements(etat, auj).liste.find((a) => montantProche(tx.montantCentimes, a.montantCentimes) && (
    (service && a.service && service.cle === a.service.cle)
    || (nom && normaliserTexte(a.nom || '') === nom)
    || (CATEGORIES_ABONNEMENT.has(tx.categorie) && compatibilite(a.categorie, tx.categorie) === 'meme')));
  if (abo) {
    // Abonnement suivi comme charge fixe et pas encore payé dans la période : la dépense le marque payé
    const charge = abo.chargeFixeId && chargesFixesPeriode(etat, periode).find((c) => c.id === abo.chargeFixeId && !c.payee);
    return { niveau: 'sur', ...(charge ? { chargeFixeId: charge.id } : {}), abonnement: abo.cle, raison: `Ça ressemble à ton abonnement « ${abo.nom} » (${formatEuros(abo.montantCentimes)}). Il compte dans le mois, pas dans ta part du jour.` };
  }

  // 3. Grosse dépense d'une catégorie obligatoire (seulement si elle entamerait la journée)
  if (!CATEGORIES_OBLIGATOIRES.has(tx.categorie) || !estDepenseQuotidienne(tx) || contributionDepense(tx) <= 0) return aucun;
  let part = partDuJourCentimes;
  if (part === null || part === undefined) {
    const j = jaugeDuJour(etat, auj, etat.meta?.jauge || null);
    part = j.parJourCentimes > 0 ? j.parJourCentimes : Math.max(0, j.reste.partPrevueCentimes || 0);
  }
  const seuil = FACTEUR_PART_DU_JOUR * Math.max(0, part);
  if (tx.montantCentimes < seuil) return aucun;
  const comparaison = part > 0 ? `plus de ${FACTEUR_PART_DU_JOUR} fois ta part du jour (${formatEuros(part)})` : 'plus que ta part du jour';
  return { niveau: 'probable', raison: `${formatEuros(tx.montantCentimes)} en « ${nomCategorie(tx.categorie)} », c’est ${comparaison}. Si c’est une dépense obligatoire, elle compte dans le mois, pas dans ta journée.` };
}

/**
 * Pose sur la dépense ce que la reconnaissance a trouvé (modifie tx et le renvoie) :
 * sûr → rattachée à la charge fixe (ou horsPartDuJour s'il n'y a pas de charge) ;
 * probable → horsPartDuJour + obligatoireProbable (et la charge fixe proposée) : l'interface pose la question.
 */
export function appliquerObligatoire(tx, r) {
  if (!r?.niveau) return tx;
  if (r.chargeFixeId) tx.chargeFixeId = r.chargeFixeId;
  if (r.niveau === 'sur' && !r.chargeFixeId) tx.horsPartDuJour = true;
  if (r.niveau === 'probable') { tx.horsPartDuJour = true; tx.obligatoireProbable = true; }
  return tx;
}

/**
 * Ta réponse à « C'est une dépense obligatoire ? » (renvoie une copie).
 * oui → hors part du jour ; non → dépense du quotidien (la charge fixe proposée par l'app est détachée).
 */
export function reponseObligatoire(tx, oui) {
  const { obligatoireProbable, ...reste } = tx;
  if (oui) return { ...reste, horsPartDuJour: true };
  return { ...reste, horsPartDuJour: false, chargeFixeId: obligatoireProbable ? null : (tx.chargeFixeId ?? null) };
}
