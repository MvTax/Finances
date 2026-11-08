// actions.js — opérations métier déclenchées par l'interface (saisie, confirmation, virements, échéances, import).

import { fluxEnvies, retenueAvance, repartirRetenue, repartirReste } from './envies.js';
import { etat, enregistrer, enregistrerLot, supprimerObjet, majProfil, nouvelId, reinitialiserJauge, ecrireMeta } from './store.js';
import { cloturerJours } from './restes.js';
import { normaliserMarchand, regleDepuisCorrection, trierRegles, trouverRegle, REGLES_DEFAUT, normaliserTexte } from './rules.js';
import { categoriser, empreinte, traiterImport, detecterChargesFixes, rattacherChargesFixes, recalculerAjustement } from './import/pipeline.js';
import { aujourdhui, dateDuMois, ajouterJours, moisDe } from './dates.js';
import { cagnotteEnAttente, repartirVersement, soldePoche, recalculerPlan } from './epargne.js';
import { revenusDuMois, chargesFixesPeriode, dettesPeriode, periodeBudget, cagnotteArrondis } from './calculs.js';

const M = () => new Date().toISOString();

export function compteCourant() { return etat.comptes.find((c) => c.type === 'courant' && c.banque && c.banque !== 'autre') || etat.comptes.find((c) => c.type === 'courant') || etat.comptes[0]; }
export function compteParBanque(banque) { return etat.comptes.find((c) => c.banque === banque); }

/** Transaction saisie à la main (clavier, voix, photo). Non enregistrée tant que l'utilisateur n'a pas confirmé. */
export function nouvelleTransaction({ sens = 'debit', montantCentimes, libelle = '', categorie = null, date = aujourdhui(), compteId, source = 'texte', articles = [], drapeaux = {}, arrondiDesactive = false, sousLibelle = null }) {
  const marchand = libelle ? normaliserMarchand(libelle) : (sens === 'credit' ? 'Entrée' : 'Dépense');
  const tx = {
    id: nouvelId('tx'), creeLe: M(), modifieLe: M(),
    date, dateComptable: date, montantCentimes, sens,
    marchand: libelle ? (marchand === 'Inconnu' ? libelle : marchand) : marchand,
    libelle: libelle || marchand, libellePrincipal: libelle || marchand, libelleBrut: libelle || marchand,
    categorie, compteId: compteId || compteCourant()?.id, source, articles, drapeaux,
    virementInterne: { estInterne: false, transactionLieeId: null }, epargne: { estEpargne: false, type: null },
    remboursementDe: null, pretId: null, chargeFixeId: null, importId: null, aQualifier: false, arrondiDesactive, sousLibelle,
  };
  if (!tx.categorie) {
    categoriser([tx], etat.reglesCategorie);
    if (tx.categorie === 'autres-entrees' && sens === 'credit') tx.aQualifier = false;
  }
  tx.empreinteDedoublonnage = empreinte(tx);
  return tx;
}

/** Catégories les plus utilisées en premier (90 derniers jours). */
export function categoriesFrequentes(sens = 'debit', toutes) {
  const depuis = ajouterJours(aujourdhui(), -90);
  const n = new Map();
  for (const t of etat.transactions) if (t.sens === sens && t.date >= depuis && t.categorie) n.set(t.categorie, (n.get(t.categorie) || 0) + 1);
  return [...toutes].sort((a, b) => (n.get(b) || 0) - (n.get(a) || 0));
}

export async function ajouterTransaction(tx) {
  // Rattachement à une charge fixe connue (ex. abonnement saisi à la main)
  const cf = etat.chargesFixes.find((c) => c.actif && c.motifDetection === normaliserTexte(tx.marchand) && (!c.montantDetection || c.montantDetection === tx.montantCentimes));
  if (cf && tx.sens === 'debit') tx.chargeFixeId = cf.id;
  await enregistrer('transactions', tx);
  return tx;
}

export async function supprimerTransaction(tx) {
  await supprimerObjet('transactions', tx.id);
  return async () => enregistrer('transactions', tx); // annulation
}

/**
 * Modifie une transaction. Si la catégorie change, crée une règle utilisateur et renvoie les transactions
 * similaires à recatégoriser (à proposer, jamais appliqué sans confirmation).
 */
export async function modifierTransaction(tx, changements) {
  const ancienne = { ...tx };
  const maj = { ...tx, ...changements, categorieVerrouillee: changements.categorie ? true : tx.categorieVerrouillee };
  if (changements.libelle !== undefined && changements.libelle !== tx.libelle && tx.source !== 'import') maj.marchand = normaliserMarchand(changements.libelle) === 'Inconnu' ? changements.libelle : normaliserMarchand(changements.libelle);
  maj.empreinteDedoublonnage = tx.source === 'import' ? tx.empreinteDedoublonnage : empreinte(maj);
  await enregistrer('transactions', maj);
  let similaires = [];
  if (changements.categorie && changements.categorie !== ancienne.categorie && maj.marchand) {
    const regle = regleDepuisCorrection(maj, changements.categorie, nouvelId('regle'));
    const existante = etat.reglesCategorie.find((r) => r.origine === 'utilisateur' && r.motif === regle.motif && r.sens === regle.sens);
    if (existante) await enregistrer('reglesCategorie', { ...existante, categorie: changements.categorie });
    else await enregistrer('reglesCategorie', regle);
    similaires = etat.transactions.filter((t) => t.id !== maj.id && t.marchand === maj.marchand && t.sens === maj.sens && t.categorie !== changements.categorie && !t.virementInterne?.estInterne && !t.epargne?.estEpargne);
  }
  return { transaction: maj, similaires };
}

export async function recategoriser(transactions, categorie) {
  await enregistrerLot(transactions.map((t) => ({ collection: 'transactions', valeur: { ...t, categorie, categorieVerrouillee: true, aQualifier: false } })));
}

// ---------------------------------------------------------------------------
// Revenus du mois
// ---------------------------------------------------------------------------

/**
 * Confirme le salaire et la prime d'activité EXACTS du mois. Crée les lignes d'entrée sur le compte courant
 * si elles ne sont pas déjà importées (elles seront rapprochées du relevé plus tard, sans doublon),
 * puis recalcule le plan du mois.
 */
export async function confirmerRevenus(mois, { salaireCentimes, primeActiviteCentimes, autresEntrees }, { creerLignes = true } = {}) {
  const existant = etat.revenusMensuels.find((r) => r.mois === mois) || { mois, autresEntrees: [] };
  const rev = { ...existant, id: mois, mois, salaireCentimes, primeActiviteCentimes, autresEntrees: autresEntrees ?? existant.autresEntrees ?? [], statut: 'confirme', source: 'saisie', confirmeLe: M() };
  const ops = [{ collection: 'revenusMensuels', valeur: rev }];
  if (creerLignes) {
    const js = etat.profil.jourSalaireHabituel || 1;
    const date = mois === moisDe(aujourdhui()) && Number(aujourdhui().slice(8, 10)) < js ? aujourdhui() : dateDuMois(mois, js);
    const dejaLa = (cat) => etat.transactions.find((t) => t.categorie === cat && t.sens === 'credit' && moisDe(t.date) === mois);
    const compte = compteCourant();
    for (const [cat, montant, lib] of [['salaire', salaireCentimes, 'Salaire'], ['prime-activite', primeActiviteCentimes, "Prime d'activité"]]) {
      if (!montant) continue;
      const d = dejaLa(cat);
      if (d) { if (d.source !== 'import' && d.montantCentimes !== montant) ops.push({ collection: 'transactions', valeur: { ...d, montantCentimes: montant } }); continue; }
      const tx = nouvelleTransaction({ sens: 'credit', montantCentimes: montant, libelle: lib, categorie: cat, date: date > aujourdhui() ? aujourdhui() : date, compteId: compte.id, source: 'confirmation' });
      tx.marchand = lib; tx.libelle = lib;
      ops.push({ collection: 'transactions', valeur: tx });
    }
  }
  // Plan du mois recalculé (jamais de découvert projeté)
  const plan = etat.planMensuel.find((p) => p.mois === mois);
  if (plan) {
    const per = periodeBudget(dateDuMois(mois, etat.profil.jourSalaireHabituel || 1), etat.profil);
    const charges = chargesFixesPeriode(etat, per).reduce((s, c) => s + c.montantPrevuCentimes, 0);
    const dettes = dettesPeriode(etat, per).reduce((s, d) => s + d.montantCentimes, 0);
    const total = salaireCentimes + primeActiviteCentimes + (rev.autresEntrees || []).reduce((s, e) => s + e.montantCentimes, 0);
    ops.push({ collection: 'planMensuel', valeur: recalculerPlan(plan, { revenusCentimes: total, chargesFixesCentimes: charges, dettesCentimes: dettes }, etat.profil.parametresPlan) });
  }
  await reinitialiserJauge();
  await enregistrerLot(ops);
  return rev;
}

// ---------------------------------------------------------------------------
// Épargne : virements, arrondis, reprises
// ---------------------------------------------------------------------------

/** Enregistre un virement d'épargne réel (bouton « C'est fait ») et le répartit dans les poches. */
export async function enregistrerVirementEpargne({ montantCentimes, pocheId = null, repartition: repartitionImposee = null, date = aujourdhui(), type = 'virementLivret', libelle = "Virement vers l'épargne", virementPrevuId = null, lignesArrondis = [] }) {
  const compte = compteCourant();
  const tx = nouvelleTransaction({ sens: 'debit', montantCentimes, libelle, categorie: 'epargne', date, compteId: compte.id, source: 'confirmation' });
  tx.marchand = libelle; tx.libelle = libelle; tx.epargne = { estEpargne: true, type };
  const ops = [{ collection: 'transactions', valeur: tx }];
  const repartition = repartitionImposee || (pocheId ? [{ pocheId, montantCentimes }] : repartirVersement(montantCentimes, etat.poches));
  for (const a of repartition) {
    const p = etat.poches.find((x) => x.id === a.pocheId);
    if (!p) continue;
    ops.push({ collection: 'poches', valeur: { ...p, mouvements: [...(p.mouvements || []), { id: nouvelId('mv'), date, montantCentimes: a.montantCentimes, sens: 'versement', motif: libelle, transactionId: tx.id }] } });
  }
  for (const l of lignesArrondis) ops.push({ collection: 'cagnotteArrondis', valeur: { id: nouvelId('arr'), transactionId: l.transactionId, montantCentimes: l.montantCentimes, periode: l.date, vireLe: date, virementId: tx.id } });
  if (virementPrevuId) { const v = etat.virementsPrevus.find((x) => x.id === virementPrevuId); if (v) ops.push({ collection: 'virementsPrevus', valeur: { ...v, fait: true, faitLe: date, transactionId: tx.id } }); }
  await enregistrerLot(ops);
  return tx;
}

/**
 * Restes du jour : à partir de 5 h du matin, ce qui restait de la part de la veille part à l'épargne (voir restes.js).
 * Appelé à l'ouverture de l'app, à 5 h si elle est ouverte, et quand elle revient au premier plan.
 * @returns les nouvelles lignes créées
 */
export async function cloturerJoursPasses(instant = new Date()) {
  if (etat.profil?.restesDuJour?.actif === false) return [];
  const { ops, meta, nouveaux } = cloturerJours(etat, instant);
  const avant = etat.meta.restesJour;
  if (!avant || avant.depuis !== meta.depuis || avant.dernier !== meta.dernier) await ecrireMeta('restesJour', meta);
  if (ops.length) await enregistrerLot(ops);
  return nouveaux;
}

/** « Je me suis privé » : le montant non dépensé est mis de côté pour l'épargne (à virer sur le livret). */
export async function ajouterPrivation({ categorie, libelle, montantCentimes, date = aujourdhui() }) {
  const p = { id: nouvelId('priv'), date, categorie: categorie || 'autres', libelle, montantCentimes, vireLe: null };
  await enregistrer('privations', p);
  return p;
}

/** Virement des privations en attente sur le livret (« C'est fait ») : versement dans la poche choisie. */
export async function virerPrivations(pocheId = null, auto = []) {
  const aVirer = [...(etat.privations || []), ...auto].filter((p) => !p.vireLe);
  const brut = aVirer.reduce((s, p) => s + p.montantCentimes, 0);
  if (!brut) return null;
  const date = aujourdhui();
  // Envies : la part des restes du jour gardée pour une envie n'est pas virée ; une avance d'envie est reprise ici
  const flux = fluxEnvies(etat, { auto });
  const garde = Math.min(brut, flux.gardeAVirerCentimes);
  const retenue = retenueAvance(flux, brut - garde);
  const total = brut - garde - retenue;
  const figer = (p) => { const x = flux.parReste.get(p.id); return x ? { envieId: x.envieId, partEnvieCentimes: x.part, envieGardeCentimes: x.garde, superFlamme: x.superFlamme } : {}; };
  if (retenue) {
    const parts = repartirRetenue(flux, retenue);
    const liste = (etat.profil.envies?.liste || []).map((e) => { const r = parts.find((x) => x.envieId === e.id); return r && e.achat ? { ...e, achat: { ...e.achat, retenues: [...(e.achat.retenues || []), { date, montantCentimes: r.montantCentimes }] } } : e; });
    await majProfil({ envies: { ...etat.profil.envies, liste } });
  }
  if (total <= 0) {
    // Tout reste sur le compte (envie, avance) : les lignes sont figées sans virement
    await enregistrerLot(aVirer.map((p) => ({ collection: 'privations', valeur: { ...p, id: p.auto ? nouvelId('priv') : p.id, vireLe: date, virementId: null, ...figer(p) } })));
    return null;
  }
  // Même poche que les arrondis (réglable dans « Mon système d'épargne »)
  // Partagées entre les épargnes (réglage « partage ») : pocheId null → répartition comme l'épargne du mois
  const cible = pocheId || (etat.profil.arrondi?.pocheId === 'partage' ? null : etat.poches.find((p) => p.id === etat.profil.arrondi?.pocheId && p.actif !== false)?.id || etat.poches.find((p) => p.type === 'remboursementAnticipe' && p.actif !== false)?.id || etat.poches.find((p) => p.type === 'coussin' && p.actif !== false)?.id || null);
  // Reste de la journée : 40 % prêt / 30 % sécurité (les 30 % de l'envie sont restés sur le compte)
  const parts = repartirReste(total, etat.poches || []);
  const tx = await enregistrerVirementEpargne({ montantCentimes: total, pocheId: parts ? null : cible, repartition: parts, type: 'privation', libelle: 'Reste de la journée viré sur l’épargne' });
  // Les repas automatiques virés sont enregistrés : leur jour est figé, une dépense ajoutée ensuite ne les change plus
  await enregistrerLot(aVirer.map((p) => ({ collection: 'privations', valeur: { ...p, id: p.auto ? nouvelId('priv') : p.id, vireLe: date, virementId: tx.id, ...figer(p) } })));
  return tx;
}

/**
 * « J'ai fait le virement de la semaine » : enregistre en une fois les arrondis, les repas et privations,
 * et la part de l'épargne du mois (répartie entre les poches).
 * @returns le total enregistré
 */
export async function virerSemaine({ epargneMoisCentimes = 0, auto = [] } = {}) {
  let total = 0;
  const arr = await virerArrondis();
  if (arr) total += arr.montantCentimes;
  const priv = await virerPrivations(null, auto);
  if (priv) total += priv.montantCentimes;
  if (epargneMoisCentimes > 0) {
    await enregistrerVirementEpargne({ montantCentimes: epargneMoisCentimes, type: 'virementLivret', libelle: 'Épargne du mois' });
    total += epargneMoisCentimes;
  }
  return total;
}

/** Virement de la cagnotte d'arrondis (« Vire X € sur ton Livret » → « C'est fait »). */
export async function virerArrondis() {
  const c = cagnotteArrondis(etat);
  if (!c.total) return null;
  const tx = await enregistrerVirementEpargne({ montantCentimes: c.total, pocheId: etat.profil.arrondi.pocheId === 'partage' ? null : (etat.profil.arrondi.pocheId || 'poche-coussin'), type: 'arrondiApp', libelle: 'Arrondis virés sur l’épargne', lignesArrondis: c.lignes });
  await majProfil({ arrondi: { ...etat.profil.arrondi, dernierVirement: aujourdhui() } });
  return tx;
}

/** Reprise d'épargne (retrait) : enregistre l'évènement et débite une poche (Coussin par défaut). */
export async function enregistrerReprise(tx, pocheId = 'poche-coussin', motif = 'Reprise') {
  const p = etat.poches.find((x) => x.id === pocheId) || etat.poches[0];
  if (!p) return;
  if ((p.mouvements || []).some((m) => m.transactionId === tx.id)) return;
  await enregistrerLot([
    { collection: 'poches', valeur: { ...p, mouvements: [...(p.mouvements || []), { id: nouvelId('mv'), date: tx.date, montantCentimes: tx.montantCentimes, sens: 'reprise', motif, transactionId: tx.id }] } },
    { collection: 'evenements', valeur: { id: `reprise:${tx.id}`, type: 'reprise', date: tx.date, montantCentimes: tx.montantCentimes, pocheId: p.id, vu: false } },
  ]);
}

// ---------------------------------------------------------------------------
// Dettes : échéances payées
// ---------------------------------------------------------------------------

export async function payerEcheanceCredit(creditId, date) {
  const c = etat.creditsBancaires.find((x) => x.id === creditId);
  if (!c) return;
  const e = (c.echeancier || []).find((x) => x.date === date);
  const montant = e?.montantCentimes ?? c.mensualiteCentimes;
  const tx = nouvelleTransaction({ sens: 'debit', montantCentimes: montant, libelle: `Échéance ${c.libelle}`, categorie: 'credits', date: aujourdhui() < date ? aujourdhui() : date, source: 'confirmation' });
  tx.marchand = c.type === 'instantane' ? 'Crédit instant' : 'Prêt personnel'; tx.libelle = `Échéance ${c.libelle}`; tx.creditId = c.id;
  const echeancier = (c.echeancier || []).map((x) => (x.date === date ? { ...x, payee: true, transactionId: tx.id } : x));
  const payees = c.echeancier?.length ? c.payees : [...(c.payees || []), date];
  await enregistrerLot([{ collection: 'transactions', valeur: tx }, { collection: 'creditsBancaires', valeur: { ...c, echeancier, payees } }]);
}

export async function payerEcheancePret(pretId, date) {
  const p = etat.prets.find((x) => x.id === pretId);
  if (!p) return;
  const e = p.echeancier.find((x) => x.date === date);
  if (!e) return;
  const emprunte = p.sens === 'empruntéParMoi';
  const tx = nouvelleTransaction({ sens: emprunte ? 'debit' : 'credit', montantCentimes: e.montantCentimes, libelle: emprunte ? `Remboursement à ${p.personneAlias}` : `Remboursement de ${p.personneAlias}`, categorie: p.categorieDepense || 'prets-proches', date: aujourdhui(), source: 'confirmation' });
  tx.pretId = p.id; tx.depenseEtalee = !!p.depenseEtalee; tx.marchand = tx.libelle;
  const echeancier = p.echeancier.map((x) => (x.date === date ? { ...x, payee: true, transactionId: tx.id } : x));
  const remboursements = [...(p.remboursements || []), { date: aujourdhui(), montantCentimes: e.montantCentimes, transactionId: tx.id }];
  const statut = echeancier.every((x) => x.payee) ? 'solde' : 'enCours';
  await enregistrerLot([{ collection: 'transactions', valeur: tx }, { collection: 'prets', valeur: { ...p, echeancier, remboursements, statut } }]);
}

// ---------------------------------------------------------------------------
// Import de relevés
// ---------------------------------------------------------------------------

/** Associe (ou crée) le compte correspondant à la banque du relevé. */
export function compteDuResultat(resultat) {
  const banque = resultat.banque;
  let c = etat.comptes.find((x) => x.banque === banque);
  if (c) return { compte: c, nouveau: false };
  if (banque === 'lcl') {
    // Le compte courant générique devient le compte LCL s'il est encore vierge
    const generique = etat.comptes.find((x) => x.id === 'courant' && x.banque === 'autre');
    const vierge = generique && !etat.transactions.some((t) => t.compteId === generique.id && t.source === 'import');
    const r0 = resultat.releves?.[0];
    if (vierge) return { compte: { ...generique, nom: 'LCL', banque: 'lcl', soldeInitialCentimes: generique.soldeInitialCentimes || r0?.ancienSolde?.centimes || 0, dateSoldeInitial: generique.dateSoldeInitial || r0?.ancienSolde?.date || null }, nouveau: false, modifie: true };
    return { compte: { id: nouvelId('cpt'), nom: 'LCL', type: 'courant', banque: 'lcl', soldeInitialCentimes: r0?.ancienSolde?.centimes || 0, dateSoldeInitial: r0?.ancienSolde?.date || null, soldeReference: null }, nouveau: true };
  }
  if (banque === 'revolut') return { compte: { id: nouvelId('cpt'), nom: 'Revolut', type: 'neobanque', banque: 'revolut', soldeInitialCentimes: resultat.soldeOuverture || 0, dateSoldeInitial: resultat.periode?.debut ? ajouterJours(resultat.periode.debut, -1) : null, soldeReference: null }, nouveau: true };
  return { compte: compteCourant(), nouveau: false };
}

/** Prépare un import (aucune écriture) : pipeline complet, pour l'écran de revue. */
export function preparerImport(resultats) {
  const lots = resultats.map((r) => { const { compte } = compteDuResultat(r); return { resultat: r, compteId: compte.id, compte }; });
  const res = traiterImport(lots, { transactions: etat.transactions, regles: etat.reglesCategorie, profil: etat.profil });
  return { ...res, lots };
}

/** Valide l'import après revue : écrit les transactions, met à jour charges fixes, ajustements, profil. */
export async function validerImport(prep, { corrections = {} } = {}) {
  const ops = [];
  for (const { compte } of prep.lots) ops.push({ collection: 'comptes', valeur: compte });
  const nouvelles = prep.nouvelles.map((t) => (corrections[t.id] ? { ...t, categorie: corrections[t.id], categorieVerrouillee: true, aQualifier: false } : t));
  // Rapprochements saisie manuelle ↔ relevé
  for (const { existante, importee } of prep.rapprochees) ops.push({ collection: 'transactions', valeur: { ...existante, dateComptable: importee.dateComptable, libellePrincipal: importee.libellePrincipal, libelleBrut: importee.libelleBrut, importId: importee.importId, sourceInitiale: existante.source, source: 'import', empreinteDedoublonnage: importee.empreinteDedoublonnage } });
  for (const t of prep.transactionsMisesAJour) ops.push({ collection: 'transactions', valeur: t });
  // Charges fixes : détection sur l'ensemble, on n'ajoute que les nouvelles (par motif)
  const toutes = [...etat.transactions, ...nouvelles];
  const detectees = detecterChargesFixes(toutes);
  const connues = new Set(etat.chargesFixes.map((c) => `${c.motifDetection}|${c.montantDetection || ''}`));
  const ajout = detectees.filter((c) => !connues.has(`${c.motifDetection}|${c.montantDetection || ''}`)).map((c) => ({ ...c, aConfirmer: true }));
  const charges = [...etat.chargesFixes, ...ajout];
  rattacherChargesFixes(nouvelles, charges);
  for (const c of ajout) ops.push({ collection: 'chargesFixes', valeur: c });
  for (const t of nouvelles) ops.push({ collection: 'transactions', valeur: t });
  ops.push({ collection: 'imports', valeur: { id: prep.importId, date: M(), fichiers: prep.lots.map((l) => ({ banque: l.resultat.banque, releves: (l.resultat.releves || []).map((r) => ({ numero: r.numero, debut: r.periode?.debut, fin: r.periode?.fin, ok: r.controle?.ok })) })), nouvelles: nouvelles.length, doublons: prep.doublons.length, rapprochees: prep.rapprochees.length } });
  await reinitialiserJauge();
  await enregistrerLot(ops);
  // Reprises d'épargne importées → évènement visible
  for (const t of nouvelles) if (t.epargne?.estEpargne && t.sens === 'credit' && t.date >= ajouterJours(aujourdhui(), -45)) await enregistrerReprise(t);
  // Ajustements de solde recalculés (aucun doublon quand les opérations manquantes arrivent)
  await recalculerTousAjustements();
  const profilMaj = {};
  if (!etat.profil.nomTitulaire && prep.jetonsTitulaire?.length >= 2) profilMaj.nomTitulaire = prep.jetonsTitulaire.join(' ');
  if (prep.emetteursSalaire?.length) profilMaj.emetteursSalaire = [...new Set([...(etat.profil.emetteursSalaire || []), ...prep.emetteursSalaire])];
  if (!etat.profil.premierImportLe) profilMaj.premierImportLe = aujourdhui();
  if (!etat.profil.arrondi?.depuis) profilMaj.arrondi = { ...etat.profil.arrondi, depuis: aujourdhui() };
  if (Object.keys(profilMaj).length) await majProfil(profilMaj);
  return { nouvelles: nouvelles.length, chargesAjoutees: ajout.length };
}

export async function recalculerTousAjustements() {
  let txs = etat.transactions;
  const ops = [];
  for (const c of etat.comptes) {
    const avant = txs.find((t) => t.ajustement && t.compteId === c.id);
    const r = recalculerAjustement(c, txs);
    txs = r.transactions;
    if (r.ajustement && (!avant || avant.montantCentimes !== r.ajustement.montantCentimes || avant.sens !== r.ajustement.sens)) ops.push({ collection: 'transactions', valeur: r.ajustement });
    if (!r.ajustement && avant) ops.push({ collection: 'transactions', valeur: avant, supprimer: true });
  }
  if (ops.length) await enregistrerLot(ops);
}

/** Déclare le solde réel d'un compte aujourd'hui (crée/ajuste la ligne d'ajustement). */
/** Virement entre deux de tes comptes (ex. LCL → Revolut) : une sortie et une entrée liées, hors budget. */
export async function enregistrerVirementInterne({ deId, versId, montantCentimes, date = aujourdhui() }) {
  const de = etat.comptes.find((c) => c.id === deId);
  const vers = etat.comptes.find((c) => c.id === versId);
  if (!de || !vers || !(montantCentimes > 0)) return null;
  const sortie = nouvelleTransaction({ sens: 'debit', montantCentimes, libelle: `Virement vers ${vers.nom}`, categorie: 'virements-internes', date, compteId: de.id, source: 'confirmation' });
  const entree = nouvelleTransaction({ sens: 'credit', montantCentimes, libelle: `Virement depuis ${de.nom}`, categorie: 'virements-internes', date, compteId: vers.id, source: 'confirmation' });
  sortie.virementInterne = { estInterne: true, transactionLieeId: entree.id };
  entree.virementInterne = { estInterne: true, transactionLieeId: sortie.id };
  await enregistrerLot([{ collection: 'transactions', valeur: sortie }, { collection: 'transactions', valeur: entree }]);
  return [sortie, entree];
}

export async function declarerSolde(compteId, centimes, date = ajouterJours(aujourdhui(), -1)) {
  const c = etat.comptes.find((x) => x.id === compteId);
  if (!c) return;
  await enregistrer('comptes', { ...c, soldeReference: { date, centimes } });
  await recalculerTousAjustements();
}

export { soldePoche, revenusDuMois, trierRegles, trouverRegle, REGLES_DEFAUT };
