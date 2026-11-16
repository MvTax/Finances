// obligatoires.js — reconnaître une dépense obligatoire (loyer, facture, abonnement) au moment où tu la notes.
// Une dépense obligatoire compte dans le mois, pas dans ta part du jour : un loyer noté à la main ne doit pas
// faire dire « dépassé aujourd'hui ». Fonctions pures : l'état et la date du jour sont passés en paramètres.
//
// Trois façons de la reconnaître, dans cet ordre :
//  1. une charge fixe active, pas encore payée dans la période, de catégorie compatible, au même montant à 10 % près
//     et à 7 jours près de son échéance → sûr (la dépense est rattachée à la charge : elle la marque payée) ;
//  1 bis. une échéance de crédit pas encore payée, au même montant à 10 % près et à 7 jours près → sûr si le nom du
//     crédit est dans le libellé (ou déjà en « Crédits »), probable si la dépense est en « Autres » (creditId proposé) ;
//  2. un abonnement repéré (listerAbonnements) au même montant à 10 % près, même nom ou même type → sûr ;
//  3. une catégorie de dépense obligatoire (logement, énergie, téléphonie, abonnements, impôts, crédits)
//     d'au moins 3 fois la part du jour → probable (l'interface te demande de confirmer).
// Une catégorie « Autres » (ou vide) au montant et à la date d'une charge fixe → probable aussi.

import { chargesFixesPeriode, periodeBudget, jaugeDuJour, estDepenseQuotidienne, dettesPeriode } from './calculs.js';
import { listerAbonnements, reconnaitre } from './abonnements.js';
import { contributionDepense, natureTransaction, nomCategorie } from './categories.js';
import { diffJours, formatDateCourte } from './dates.js';
import { normaliserTexte } from './rules.js';
import { formatEuros } from './money.js';
import { TOLERANCE_POURCENT, TOLERANCE_JOURS, SANS_CATEGORIE, montantProche, compatibilite, motifDansLibelle } from './correspondance.js';
import { chargeDuLibelle } from './import/pipeline.js';

export { TOLERANCE_POURCENT, TOLERANCE_JOURS, montantProche };
export const FACTEUR_PART_DU_JOUR = 3;
export const CATEGORIES_OBLIGATOIRES = new Set(['logement', 'energie', 'telephonie', 'abonnements', 'impots', 'credits']);
const CATEGORIES_ABONNEMENT = new Set(['abonnements', 'telephonie', 'sport']);
/** Noms donnés par l'app à une saisie sans libellé : ils ne disent rien du commerçant. */
const NOMS_VIDES = new Set(['', 'DEPENSE', 'INCONNU']);

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
  if (!estSortieCandidate(tx) || tx.envieId || tx.creditId) return aucun;
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

  // 1 bis. Échéance de crédit pas encore payée (ex. « CREDIT INSTANT ECH … » noté en « Autres »)
  const echeance = echeancesCreditPeriode(etat, periode)
    .filter((e) => !e.payee && Math.abs(diffJours(e.date, tx.date)) <= TOLERANCE_JOURS && montantProche(tx.montantCentimes, e.montantCentimes))
    .map((e) => ({ e, motif: motifCredit(e, tx) }))
    .filter((x) => x.motif || tx.categorie === 'credits' || SANS_CATEGORIE.has(tx.categorie))
    .sort((a, b) => (b.motif - a.motif) || Math.abs(tx.montantCentimes - a.e.montantCentimes) - Math.abs(tx.montantCentimes - b.e.montantCentimes) || Math.abs(diffJours(a.e.date, tx.date)) - Math.abs(diffJours(b.e.date, tx.date)))[0];
  if (echeance) {
    const { e, motif } = echeance;
    const phrase = `Ça ressemble à l’échéance de ton crédit « ${e.libelle} » (${formatEuros(e.montantCentimes)}, prévue le ${formatDateCourte(e.date)}).`;
    if (motif || tx.categorie === 'credits') return { niveau: 'sur', creditId: e.creditId, raison: `${phrase} Elle compte dans tes dettes du mois, pas dans ta part du jour.` };
    return { niveau: 'probable', creditId: e.creditId, raison: `${phrase} Si c’est bien elle, elle compte dans tes dettes du mois, pas dans ta part du jour.` };
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

/** Le nom du crédit (motif de détection, sinon son libellé) est-il dans le libellé de la dépense ? */
function motifCredit(e, tx) {
  const motif = e.motifDetection || '';
  if (!motif) return false;
  return normaliserTexte(tx.marchand || '') === normaliserTexte(motif) || motifDansLibelle(motif, tx);
}

/**
 * Échéances de crédits bancaires de la période (pas les prêts entre proches), avec leur statut payé :
 * marquée payée, ou une opération rattachée au crédit (creditId) à 7 jours près, ou une opération « Crédits »
 * au même montant à 10 % près et à 7 jours près. Une opération ne paie qu'une échéance.
 * @returns [{ ...echeance, payee, transactionId? }]
 */
export function echeancesCreditPeriode(etat, periode) {
  const liste = dettesPeriode(etat, periode).filter((e) => e.type === 'credit');
  const prises = new Set();
  const ops = (etat.transactions || []).filter((t) => t.sens === 'debit' && !t.ajustement && t.montantCentimes > 0);
  const proche = (e, t) => Math.abs(diffJours(e.date, t.date)) <= TOLERANCE_JOURS;
  const res = liste.map((e) => ({ ...e }));
  // D'abord les opérations rattachées au crédit, puis celles en « Crédits » au bon montant
  for (const e of res) {
    if (e.payee) continue;
    const t = ops.filter((x) => !prises.has(x.id) && x.creditId === e.creditId && proche(e, x)).sort((a, b) => Math.abs(diffJours(e.date, a.date)) - Math.abs(diffJours(e.date, b.date)))[0];
    if (t) { prises.add(t.id); e.payee = true; e.transactionId = t.id; }
  }
  for (const e of res) {
    if (e.payee) continue;
    const t = ops.filter((x) => !prises.has(x.id) && !x.creditId && x.categorie === 'credits' && proche(e, x) && montantProche(x.montantCentimes, e.montantCentimes))
      .sort((a, b) => Math.abs(a.montantCentimes - e.montantCentimes) - Math.abs(b.montantCentimes - e.montantCentimes) || Math.abs(diffJours(e.date, a.date)) - Math.abs(diffJours(e.date, b.date)))[0];
    if (t) { prises.add(t.id); e.payee = true; e.transactionId = t.id; }
  }
  return res;
}

/**
 * Pose sur la dépense ce que la reconnaissance a trouvé (modifie tx et le renvoie) :
 * sûr → rattachée à la charge fixe (ou horsPartDuJour s'il n'y a pas de charge), ou classée « Crédits » et rattachée
 * au crédit ; probable → horsPartDuJour + obligatoireProbable (et la charge fixe ou le crédit proposés) : l'interface
 * pose la question.
 */
export function appliquerObligatoire(tx, r) {
  if (!r?.niveau) return tx;
  if (r.chargeFixeId) tx.chargeFixeId = r.chargeFixeId;
  if (r.creditId) tx.creditId = r.creditId;
  if (r.niveau === 'sur' && r.creditId) { tx.categorie = 'credits'; return tx; }
  if (r.niveau === 'sur' && !r.chargeFixeId) tx.horsPartDuJour = true;
  if (r.niveau === 'probable') { tx.horsPartDuJour = true; tx.obligatoireProbable = true; }
  return tx;
}

/**
 * Ta réponse à « C'est une dépense obligatoire ? » (renvoie une copie).
 * oui → hors part du jour (échéance de crédit proposée : classée « Crédits ») ;
 * non → dépense du quotidien (la charge fixe ou le crédit proposés par l'app sont détachés).
 */
export function reponseObligatoire(tx, oui) {
  const { obligatoireProbable, ...reste } = tx;
  if (oui) return tx.creditId ? { ...reste, categorie: 'credits', horsPartDuJour: true } : { ...reste, horsPartDuJour: true };
  const res = { ...reste, horsPartDuJour: false, chargeFixeId: obligatoireProbable ? null : (tx.chargeFixeId ?? null) };
  if (obligatoireProbable && tx.creditId) delete res.creditId;
  return res;
}

/**
 * Le bouton « Payé » d'une charge fixe : la dépense à enregistrer (fonction pure, rien n'est écrit).
 * Montant prévu de la charge (loyer : le loyer à payer réglé dans le profil), datée du jour de l'échéance ou
 * d'aujourd'hui si l'échéance n'est pas encore arrivée ; rattachée à la charge, sa catégorie et son compte.
 * @param o.id, o.maintenant  identifiant et horodatage de la dépense (donnés par l'appelant)
 * @returns la dépense, ou null si la charge n'existe pas, n'est pas dans la période ou est déjà payée
 */
export function transactionPaiementCharge(etat, chargeId, auj, { id = null, maintenant = null } = {}) {
  const periode = periodeBudget(auj, etat.profil || {}, { reference: auj });
  const c = chargesFixesPeriode(etat, periode).find((x) => x.id === chargeId);
  if (!c || c.payee || !(c.montantPrevuCentimes > 0)) return null;
  const date = c.date < auj ? c.date : auj;
  const nom = c.libelle || 'Charge fixe';
  return {
    id, creeLe: maintenant, modifieLe: maintenant,
    date, dateComptable: date, montantCentimes: c.montantPrevuCentimes, sens: 'debit',
    marchand: nom, libelle: nom, libellePrincipal: nom, libelleBrut: nom,
    categorie: c.categorie || 'autres', compteId: c.compteId || null, source: 'confirmation', articles: [], drapeaux: {},
    virementInterne: { estInterne: false, transactionLieeId: null }, epargne: { estEpargne: false, type: null },
    remboursementDe: null, pretId: null, chargeFixeId: c.id, importId: null, aQualifier: false,
  };
}

/**
 * Après un rapprochement saisie ↔ relevé : relie l'opération fusionnée qui n'a pas de charge fixe (renvoie une copie).
 * D'abord par le nom de la charge dans le libellé bancaire, sinon par la reconnaissance, seulement si elle est sûre.
 * Jamais une dépense dont tu as dit « non » (horsPartDuJour === false), une envie ou une entrée.
 * @param charges  charges fixes connues (sinon celles de l'état)
 * @param o.avecReconnaissance  false : seulement le nom de la charge (état incomplet)
 */
export function relierFusionnee(etat, tx, auj, charges = etat.chargesFixes || [], { avecReconnaissance = true } = {}) {
  if (!tx || tx.sens !== 'debit' || tx.chargeFixeId || tx.creditId || tx.envieId || tx.horsPartDuJour === false || tx.ajustement) return tx;
  const c = chargeDuLibelle(tx, charges.filter((x) => x.actif !== false));
  if (c) return { ...tx, chargeFixeId: c.id };
  if (!avecReconnaissance) return tx;
  const sans = { ...etat, transactions: (etat.transactions || []).filter((t) => t.id !== tx.id) };
  const r = reconnaitreObligatoire(sans, tx, auj);
  return r.niveau === 'sur' ? appliquerObligatoire({ ...tx }, r) : tx;
}
