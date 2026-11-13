// generer-sauvegarde.mjs — fabrique une sauvegarde SYNTHÉTIQUE complète (même forme qu'un vrai export de l'app),
// pour afficher et vérifier l'app sans aucune donnée réelle. Tout est inventé : libellés « EXEMPLE », montants tirés au sort.
// Déterministe : même date de référence et même graine → même fichier.
//
// Usage : node tests/outils/generer-sauvegarde.mjs <sortie.json> [--aujourdhui AAAA-MM-JJ] [--graine N]
//
// Habitudes imitées (volontairement arrondies) : salaire vers le 4-6 du mois (~1 300 €), loyer vers le 8 ;
// dépenses du quotidien par jour : médiane ~12 €, moyenne ~25 €, ~25 % de jours sans dépense, quelques gros jours ;
// lundis et mardis plus chers, samedis les moins chers ; beaucoup de VTC et de restauration rapide.

import { SCHEMA_VERSION } from '../../js/migrations.js';
import { FORMAT } from '../../js/sauvegarde.js';
import { datesDeSalaire } from '../../js/calculs.js';
import { ajouterJours, jourSemaine, dateDuMois, ajouterMois, moisDe, diffJours } from '../../js/dates.js';
import { versionApp } from '../../js/version.js';

export const REFERENCE_DEFAUT = '2026-11-13';
export const GRAINE_DEFAUT = 42;

/** Générateur pseudo-aléatoire à graine (mulberry32). */
function hasard(graine) {
  let a = graine >>> 0;
  const suivant = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const entre = (min, max) => min + Math.floor(suivant() * (max - min + 1));
  const choix = (liste) => liste[Math.floor(suivant() * liste.length)];
  const pondere = (liste) => { const tot = liste.reduce((s, x) => s + x[1], 0); let r = suivant() * tot; for (const x of liste) { r -= x[1]; if (r < 0) return x[0]; } return liste[liste.length - 1][0]; };
  return { suivant, entre, choix, pondere, proba: (p) => suivant() < p };
}

// Dépenses du quotidien : [catégorie, poids, min €, max €, libellés]
const QUOTIDIEN = [
  ['vtc', 24, 4, 13, ['VTC EXEMPLE', 'VTC EXEMPLE TRIP']],
  ['restauration-rapide', 20, 4, 10, ['BURGER EXEMPLE', 'KEBAB EXEMPLE', 'SANDWICH EXEMPLE']],
  ['restaurants', 9, 8, 24, ['RESTAURANT EXEMPLE', 'CAFE EXEMPLE', 'BRASSERIE EXEMPLE']],
  ['courses', 13, 2, 18, ['SUPERMARCHE EXEMPLE', 'EPICERIE EXEMPLE', 'SUPERETTE EXEMPLE']],
  ['velo', 16, 1, 3, ['TROTTINETTE EXEMPLE', 'VELO PARTAGE EXEMPLE']],
  ['achats-en-ligne', 5, 8, 50, ['BOUTIQUE EN LIGNE EXEMPLE', 'MARKETPLACE EXEMPLE']],
  ['vetements', 3, 15, 60, ['VETEMENTS EXEMPLE', 'BASKETS EXEMPLE']],
  ['especes', 2, 20, 50, ['RETRAIT DAB EXEMPLE']],
  ['transports', 2, 2, 16, ['TICKET TRANSPORT EXEMPLE']],
  ['beaute', 2, 5, 25, ['PARFUMERIE EXEMPLE']],
  ['coiffeur', 1, 12, 25, ['COIFFEUR EXEMPLE']],
  ['loisirs', 2, 8, 30, ['CINEMA EXEMPLE', 'JEUX EXEMPLE']],
  ['pharmacie', 1, 4, 18, ['PHARMACIE EXEMPLE']],
  ['maison', 1, 6, 30, ['BAZAR EXEMPLE']],
  ['autres', 1, 3, 20, ['COMMERCE EXEMPLE']],
];
const GROS_ACHATS = [['vetements', 'VETEMENTS EXEMPLE'], ['achats-en-ligne', 'MARKETPLACE EXEMPLE'], ['voyages', 'BILLET AVION EXEMPLE'], ['loisirs', 'CONCERT EXEMPLE'], ['train', 'TRAIN EXEMPLE']];
// Lundi … dimanche : chance d'une journée sans dépense, et multiplicateur des montants
const JOUR = { 1: [0.14, 1.35], 2: [0.16, 1.3], 3: [0.25, 1], 4: [0.25, 1], 5: [0.24, 1.05], 6: [0.42, 0.6], 7: [0.32, 0.8] };

const COLLECTIONS_VIDES = ['mouvementsEnveloppes', 'cagnotteArrondis', 'evenements', 'gamelles', 'joursSansDepense', 'listeEnvies', 'checkins', 'bridgeRecus', 'depensesPrevues', 'fileAttenteIA'];

/**
 * @param {{ aujourdhui?: string, graine?: number }} o
 * @returns l'objet sauvegarde complet { format, schemaVersion, exporteLe, application, contenu }
 */
export function genererSauvegarde({ aujourdhui = REFERENCE_DEFAUT, graine = GRAINE_DEFAUT } = {}) {
  const R = hasard(graine);
  const auj = aujourdhui;
  const debut = ajouterJours(auj, -364);
  const debutSuivi = ajouterJours(auj, -45);
  const horodatage = (date, h = 10, m = 0) => `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
  let n = 0;
  const id = (prefixe) => `${prefixe}-${(++n).toString(36).padStart(4, '0')}`;
  const centimes = (minEuros, maxEuros, mult = 1) => Math.max(50, Math.round((minEuros * 100 + R.suivant() * (maxEuros - minEuros) * 100) * mult));
  const transactions = [];
  const importId = 'import-synthetique';

  /** Opération importée d'un relevé (forme d'un import LCL ou Revolut). */
  const importee = (o) => {
    const banque = o.compteId === 'revolut' ? 'revolut' : 'lcl';
    const libelle = o.libelle;
    const t = {
      id: id('tx'), creeLe: horodatage(o.creeLe || debutSuivi, 9, 30), modifieLe: horodatage(o.creeLe || debutSuivi, 9, 30), date: o.date,
      dateComptable: o.dateComptable || (banque === 'lcl' && o.sens === 'debit' && R.proba(0.5) ? ajouterJours(o.date, 1) : o.date),
      montantCentimes: o.montant, sens: o.sens || 'debit', marchand: o.marchand || libelle, libellePrincipal: o.libellePrincipal || (o.sens === 'credit' ? libelle : `CB ${libelle}`),
      libelleBrut: o.libelleBrut || `${o.sens === 'credit' ? '' : 'CB '}${libelle} ${o.date.slice(8, 10)}/${o.date.slice(5, 7)}`, libelle,
      categorie: o.categorie, compteId: o.compteId || 'lcl', source: 'import', banque,
      categorieBanque: banque === 'revolut' ? (o.categorieBanque || 'Commerçant') : null,
      articles: [], drapeaux: {}, virementInterne: { estInterne: !!o.interne, transactionLieeId: o.lieeId || null },
      epargne: { estEpargne: !!o.epargne, type: o.epargne || null }, remboursementDe: o.remboursementDe || null, pretId: null, chargeFixeId: o.chargeFixeId || null, importId,
      optionSystemEpargneCentimes: banque === 'lcl' && (o.sens || 'debit') === 'debit' && !o.interne && !o.epargne && R.proba(0.4) ? R.entre(1, 99) : 0,
      estAvoirCarte: !!o.avoir, fraisCentimes: 0, aQualifier: !!o.aQualifier, confiance: o.confiance || 'haute',
      empreinteDedoublonnage: `${banque}|${o.sens || 'debit'}|${o.montant}|${libelle}`, role: o.role ?? null,
    };
    if (o.personne) t.personne = o.personne;
    if (o.regleId) t.regleId = o.regleId;
    if (o.regleRevolut) { t.regleRevolut = true; t.sousLibelle = 'Envoyé depuis l’app'; }
    if (o.avoir) t.estRemboursement = true;
    if (o.verrouillee) t.categorieVerrouillee = true;
    transactions.push(t);
    return t;
  };

  /** Opération saisie dans l'app (texte, ou confirmation d'une proposition). */
  const saisie = (o) => {
    const t = {
      id: id('tx'), creeLe: horodatage(o.date, o.heure ?? 12, 15), modifieLe: horodatage(o.date, o.heure ?? 12, 15), date: o.date, dateComptable: o.date,
      montantCentimes: o.montant, sens: o.sens || 'debit', marchand: o.libelle, libellePrincipal: o.libelle, libelleBrut: o.libelle, libelle: o.libelle,
      sousLibelle: o.sousLibelle || '', categorie: o.categorie, compteId: o.compteId || 'lcl', source: o.source || 'texte',
      articles: [], drapeaux: {}, virementInterne: { estInterne: false, transactionLieeId: null }, epargne: { estEpargne: !!o.epargne, type: o.epargne || null },
      remboursementDe: null, pretId: null, chargeFixeId: o.chargeFixeId || null, importId: null, aQualifier: false, empreinteDedoublonnage: `saisie|${o.date}|${o.montant}`,
      arrondiDesactive: false,
    };
    if (o.depenseEtalee) t.depenseEtalee = true;
    transactions.push(t);
    return t;
  };

  // ---------------- Charges fixes, crédits, poches ----------------
  const jourPaye = (mois, jour, jitter = 1) => dateDuMois(mois, Math.max(1, jour + R.entre(-jitter, jitter)));
  const CHARGES = [
    { cle: 'loyer', libelle: 'Loyer', motif: 'BAILLEUR EXEMPLE', categorie: 'logement', montant: 52000, jour: 8, estLoyer: true, variable: false },
    { cle: 'musique', libelle: 'Musique (exemple)', motif: 'MUSIQUE EXEMPLE', categorie: 'abonnements', montant: 1199, jour: 12 },
    { cle: 'video', libelle: 'Vidéo (exemple)', motif: 'VIDEO EXEMPLE', categorie: 'abonnements', montant: 1349, jour: 20, compteId: 'revolut' },
    { cle: 'mobile', libelle: 'Forfait mobile (exemple)', motif: 'OPERATEUR EXEMPLE', categorie: 'telephonie', montant: 1599, jour: 10 },
    { cle: 'sport', libelle: 'Salle de sport (exemple)', motif: 'SPORT EXEMPLE', categorie: 'sport', montant: 2999, jour: 15, periodicite: 28 },
    { cle: 'carte', libelle: 'Cotisation carte', motif: 'COTISATION CARTE EXEMPLE', categorie: 'frais-bancaires', montant: 250, jour: 2 },
    { cle: 'transport', libelle: 'Passe transport (exemple)', motif: 'PASSE TRANSPORT EXEMPLE', categorie: 'transports', montant: 4320, jour: 3, debutMois: ajouterMois(moisDe(auj), -6) },
    { cle: 'energie', libelle: 'Électricité (exemple)', motif: 'ENERGIE EXEMPLE', categorie: 'energie', montant: 3800, jour: 18, tousLes: 4 },
    { cle: 'cloud', libelle: 'Stockage en ligne (exemple)', motif: 'CLOUD EXEMPLE', categorie: 'abonnements', montant: 299, jour: 3 },
  ];
  const chargesFixes = CHARGES.map((c) => ({
    creeLe: horodatage(debutSuivi), modifieLe: horodatage(debutSuivi), id: `charge-${c.cle}`, libelle: c.libelle, montantCentimes: c.montant,
    montantVariable: !!c.variable, jourPrelevement: c.jour, compteId: c.compteId || 'lcl', categorie: c.categorie, motifDetection: c.motif, actif: true,
    origine: c.periodicite || c.estLoyer ? 'detection' : 'import', occurrences: 0,
    ...(c.periodicite || c.estLoyer ? { montantMinCentimes: c.montant, montantMaxCentimes: c.montant, periodiciteJours: c.periodicite || null, montantDetection: null, derniereDate: null } : {}),
    ...(c.estLoyer ? { estLoyer: true, aConfirmer: false } : {}),
  }));
  // Prêt personnel amortissable (différé : petite mensualité jusqu'en 2027) et crédit instantané en 3 fois
  const debutPret = ajouterJours(auj, -150);
  const creditsBancaires = [
    { creeLe: horodatage(debutSuivi), modifieLe: horodatage(debutSuivi), id: 'credit-instantane', libelle: 'Crédit instantané 900 €', type: 'instantane', capitalCentimes: 90000, fraisCentimes: 2700,
      dateDeblocage: ajouterJours(auj, -100), motifDetection: 'CREDIT INSTANTANE EXEMPLE',
      echeancier: [1, 2, 3].map((k) => ({ date: ajouterJours(auj, -100 + 30 * k), montantCentimes: 30900, payee: ajouterJours(auj, -100 + 30 * k) <= auj })), actif: true, note: 'Exemple : remboursé en 3 fois.' },
    { creeLe: horodatage(debutSuivi), modifieLe: horodatage(debutSuivi), id: 'credit-pret-perso', libelle: 'Prêt personnel 6 000 €', type: 'amortissable', capitalCentimes: 600000, tauxPourcent: 1.5,
      mensualiteCentimes: 17500, assuranceMensuelleCentimes: 300, dureeMois: 36, dateDebut: ajouterMois(moisDe(auj), 3) + '-22', dateFin: ajouterMois(moisDe(auj), 38) + '-22',
      differe: { jusquAu: ajouterMois(moisDe(auj), 2) + '-28', mensualiteCentimes: 1050 }, dureesAnnonceesMois: [36], aConfirmer: [], source: 'Exemple synthétique', motifDetection: 'ECHEANCE PRET EXEMPLE',
      payees: [], remboursementsAnticipes: [], actif: true },
  ];

  // ---------------- Mois par mois : salaire, charges, épargne ----------------
  const revenusMensuels = [];
  const premierMois = moisDe(debut);
  for (let m = premierMois; m <= moisDe(auj); m = ajouterMois(m, 1)) {
    const index = diffJours(`${premierMois}-01`, `${m}-01`);
    // Salaire vers le 4-6 (le mois d'avant la date de début n'est pas dans l'export)
    const dSal = jourPaye(m, 5, 1);
    if (dSal >= debut && dSal <= auj) {
      const salaire = 128000 + R.entre(-40, 40) * 100 + R.entre(0, 99);
      importee({ date: dSal, dateComptable: dSal, montant: salaire, sens: 'credit', libelle: 'VIR SALAIRE EMPLOYEUR EXEMPLE', libellePrincipal: 'VIR SEPA EMPLOYEUR EXEMPLE', categorie: 'salaire', role: 'revenu', personne: 'EMPLOYEUR EXEMPLE' });
      const prime = index % 2 === 0 ? 12000 + R.entre(0, 30) * 100 : 0;
      if (prime) importee({ date: ajouterJours(dSal, 1), montant: prime, sens: 'credit', libelle: 'VIR PRIME ACTIVITE EXEMPLE', categorie: 'prime-activite', role: 'revenu' });
      const ref = m === moisDe(auj);
      revenusMensuels.push({ creeLe: horodatage(dSal), modifieLe: horodatage(dSal), mois: m, salaireCentimes: salaire, primeActiviteCentimes: prime, autresEntrees: [], statut: 'confirme', source: 'import', id: m,
        ...(ref ? { confirmeLe: horodatage(dSal, 18), recuLe: dSal } : {}) });
    }
    for (const c of CHARGES) {
      if (c.debutMois && m < c.debutMois) continue;
      if (c.tousLes && index % c.tousLes !== 0) continue;
      const d = c.periodicite ? null : jourPaye(m, c.jour, c.estLoyer ? 1 : 0);
      if (!d || d < debut || d > auj) continue;
      importee({ date: d, montant: c.montant, libelle: `PRLV SEPA ${c.motif}`, marchand: c.motif, libellePrincipal: `PRLV SEPA ${c.motif}`, categorie: c.categorie, chargeFixeId: `charge-${c.cle}`, compteId: c.compteId || 'lcl',
        categorieBanque: c.compteId === 'revolut' ? 'Commerçant' : undefined });
    }
    // Arrondis de la banque (option d'épargne) : un total par mois
    const dOpt = dateDuMois(m, 28);
    if (dOpt >= debut && dOpt <= auj) importee({ date: dOpt, montant: R.entre(1200, 2600), libelle: 'TOTAL OPTION EPARGNE EXEMPLE', libellePrincipal: 'TOTAL OPTION EPARGNE EXEMPLE', categorie: 'epargne', epargne: 'arrondiBanque' });
  }
  // Salle de sport tous les 28 jours
  for (let d = ajouterJours(debut, 9); d <= auj; d = ajouterJours(d, 28)) importee({ date: d, montant: 2999, libelle: 'PRLV SEPA SPORT EXEMPLE', marchand: 'SPORT EXEMPLE', categorie: 'sport', chargeFixeId: 'charge-sport' });
  // Échéances : crédit instantané, différé du prêt personnel
  for (const e of creditsBancaires[0].echeancier) if (e.payee) importee({ date: e.date, montant: e.montantCentimes, libelle: 'ECHEANCE CREDIT INSTANTANE EXEMPLE', libellePrincipal: 'PRLV SEPA CREDIT INSTANTANE EXEMPLE', categorie: 'credits' });
  for (let k = 1; k <= 4; k++) { const d = ajouterJours(debutPret, 30 * k + 2); if (d <= auj) importee({ date: d, montant: 1050, libelle: 'ECHEANCE PRET EXEMPLE', libellePrincipal: 'PRLV SEPA ECHEANCE PRET EXEMPLE', categorie: 'credits' }); }
  importee({ date: creditsBancaires[0].dateDeblocage, montant: 90000, sens: 'credit', libelle: 'CREDIT INSTANTANE EXEMPLE', categorie: 'deblocage-credit' });
  importee({ date: debutPret, montant: 600000, sens: 'credit', libelle: 'DEBLOCAGE PRET EXEMPLE', categorie: 'deblocage-credit' });
  // Aide au logement (deux versements exceptionnels)
  for (const k of [200, 80]) importee({ date: ajouterJours(auj, -k), montant: 18000 + R.entre(0, 40) * 100, sens: 'credit', libelle: 'VERSEMENT ALS EXEMPLE', categorie: 'entree-exceptionnelle', role: 'aideLogement' });
  // Épargne : virements vers le livret, et retours du livret vers le compte
  const versements = [];
  for (let k = 0; k < 16; k++) { const d = ajouterJours(debut, 10 + k * 22); if (d <= auj) versements.push(importee({ date: d, montant: R.entre(3, 15) * 1000, libelle: 'VIR VERS LIVRET EXEMPLE', libellePrincipal: 'VIR SEPA LIVRET EXEMPLE', categorie: 'epargne', epargne: 'virementLivret' })); }
  for (let k = 0; k < 70; k++) { const d = ajouterJours(debut, 3 + Math.floor(k * 5.2)); if (d <= auj) importee({ date: d, montant: R.entre(2, 12) * 1000, sens: 'credit', libelle: 'VIR DEPUIS LIVRET EXEMPLE', libellePrincipal: 'VIR SEPA LIVRET EXEMPLE', categorie: 'epargne', epargne: 'virementLivret' }); }

  // ---------------- Virements entre tes comptes (LCL ↔ Revolut), liés deux à deux ----------------
  const interne = (date, montant, versRevolut) => {
    const a = importee({ date, montant, libelle: versRevolut ? 'VIR VERS REVOLUT EXEMPLE' : 'VIR VERS LCL EXEMPLE', compteId: versRevolut ? 'lcl' : 'revolut', categorie: 'virements-internes', interne: true, role: versRevolut ? 'versRevolut' : 'versLCL', categorieBanque: versRevolut ? undefined : 'Autres', dateComptable: date });
    const b = importee({ date, montant, sens: 'credit', libelle: versRevolut ? 'RECHARGE DEPUIS LCL EXEMPLE' : 'VIR DEPUIS REVOLUT EXEMPLE', compteId: versRevolut ? 'revolut' : 'lcl', categorie: 'virements-internes', interne: true, role: versRevolut ? 'depuisLCL' : 'depuisRevolut', categorieBanque: versRevolut ? 'Rechargez' : undefined, lieeId: a.id, dateComptable: date });
    a.virementInterne.transactionLieeId = b.id;
  };
  for (let d = ajouterJours(debut, 1), k = 0; d <= auj; d = ajouterJours(d, R.entre(2, 4)), k++) interne(d, R.entre(2, 8) * 1000, true);
  for (let k = 0; k < 9; k++) interne(ajouterJours(debut, 20 + k * 38), R.entre(1, 5) * 1000, false);

  // ---------------- Particuliers (prêts entre proches) et livraisons payées à un particulier ----------------
  const PERSONNES = ['AMI EXEMPLE A', 'AMI EXEMPLE B', 'PROCHE EXEMPLE C'];
  for (let k = 0; k < 34; k++) importee({ date: ajouterJours(debut, 4 + k * 10), montant: R.entre(1, 8) * 500, libelle: 'VIR PARTICULIER EXEMPLE', libellePrincipal: 'VIR SEPA PARTICULIER EXEMPLE', categorie: 'prets-proches', role: 'versParticulier', personne: R.choix(PERSONNES), aQualifier: k < 3 });
  for (let k = 0; k < 66; k++) importee({ date: ajouterJours(debut, 2 + Math.floor(k * 5.4)), montant: R.entre(1, 10) * 500, sens: 'credit', libelle: 'VIR DE PARTICULIER EXEMPLE', libellePrincipal: 'VIR SEPA PARTICULIER EXEMPLE', categorie: 'prets-proches', role: 'depuisParticulier', personne: R.choix(PERSONNES) });
  for (let k = 0; k < 12; k++) importee({ date: ajouterJours(debut, 15 + k * 29), montant: R.entre(1, 6) * 500, sens: 'credit', libelle: 'PAIEMENT DE PARTICULIER EXEMPLE', compteId: 'revolut', categorieBanque: k < 3 ? 'Rechargez' : 'Autres', categorie: 'prets-proches', role: 'depuisParticulier', personne: R.choix(PERSONNES) });
  for (let k = 0; k < 4; k++) importee({ date: ajouterJours(debut, 40 + k * 80), montant: R.entre(2, 6) * 500, libelle: 'PAIEMENT A PARTICULIER EXEMPLE', compteId: 'revolut', categorieBanque: 'Autres', categorie: 'prets-proches', role: 'versParticulier', personne: R.choix(PERSONNES), confiance: 'basse', verrouillee: true });

  // ---------------- Le quotidien, jour par jour (jusqu'à avant-hier : les derniers jours sont saisis à la main) ----------------
  const depensesCarte = [];
  // Quelques gros jours (150 à 300 €) : un toutes les 4 semaines environ, en semaine, plutôt un lundi ou un mardi
  const grosJours = new Set();
  for (let d = ajouterJours(debut, 7); d <= ajouterJours(auj, -7); d = ajouterJours(d, 28)) grosJours.add(ajouterJours(d, R.pondere([[0, 3], [1, 3], [2, 1], [3, 1], [4, 1]]) + 1 - jourSemaine(d)));
  for (let d = debut; d <= ajouterJours(auj, -2); d = ajouterJours(d, 1)) {
    const [pVide, mult] = JOUR[jourSemaine(d)];
    if (R.proba(pVide)) continue;
    const nb = R.pondere([[1, 50], [2, 28], [3, 14], [4, 8]]);
    for (let i = 0; i < nb; i++) {
      const [categorie, , min, max, libelles] = R.pondere(QUOTIDIEN.map((q) => [q, q[1]]));
      const libelle = R.choix(libelles);
      const montant = categorie === 'especes' ? R.choix([2000, 3000, 4000, 5000]) : centimes(min, max, mult);
      const revolut = R.proba(0.13);
      depensesCarte.push(importee({ date: d, montant, libelle, categorie, compteId: revolut ? 'revolut' : 'lcl', categorieBanque: revolut ? 'Commerçant' : undefined, regleId: R.proba(0.6) ? `defaut:${categorie}` : undefined }));
    }
    // Livraison réglée à un particulier sur Revolut (10 à 18 €) : rangée en « livraison » par la règle Revolut
    if (R.proba(0.2 * mult)) importee({ date: d, montant: R.entre(10, 18) * 100, libelle: 'PAIEMENT A LIVREUR EXEMPLE', compteId: 'revolut', categorieBanque: 'Autres', categorie: 'livraison', role: 'versParticulier', personne: 'LIVREUR EXEMPLE', regleRevolut: true, confiance: 'moyenne' });
    if (grosJours.has(d)) { const [categorie, libelle] = R.choix(GROS_ACHATS); depensesCarte.push(importee({ date: d, montant: centimes(150, 300), libelle, categorie })); }
  }
  // Frais bancaires ponctuels (commission d'intervention, frais de paiement à l'étranger)
  for (let k = 0; k < 15; k++) importee({ date: ajouterJours(debut, 11 + k * 23), montant: R.choix([800, 800, 120, 250]), libelle: 'FRAIS BANCAIRES EXEMPLE', libellePrincipal: 'COMMISSION EXEMPLE', categorie: 'frais-bancaires' });
  // Remboursements d'achats (avoirs carte)
  for (let k = 0; k < 12; k++) {
    const o = R.choix(depensesCarte.filter((t) => ['vtc', 'achats-en-ligne', 'train', 'maison'].includes(t.categorie) && t.compteId === 'lcl'));
    importee({ date: ajouterJours(o.date, R.entre(2, 6)), montant: o.montantCentimes, sens: 'credit', libelle: `AVOIR ${o.libelle}`, categorie: o.categorie, remboursementDe: o.id, avoir: true });
  }

  // ---------------- Saisies à la main : les derniers jours (dont aujourd'hui) ----------------
  const recentes = [
    [-1, 'Burger exemple', 'restauration-rapide', 1150, 13], [-1, 'VTC exemple', 'vtc', 1480, 19], [-1, 'Café exemple', 'restaurants', 420, 9],
    [0, 'Sandwich exemple', 'restauration-rapide', 890, 12], [0, 'VTC exemple', 'vtc', 1260, 8],
    [-3, 'Trottinette exemple', 'velo', 240, 18], [-4, 'Restaurant exemple', 'restaurants', 2350, 20], [-6, 'Bazar exemple', 'autres', 680, 16],
    [-9, 'Abonnement appli exemple', 'abonnements', 499, 11], [-12, 'Kebab exemple', 'restauration-rapide', 950, 21], [-15, 'Vélo partagé exemple', 'velo', 180, 17],
    [-18, 'Remboursement ami exemple', 'autres-entrees', 1500, 18, 'credit'], [-25, 'Remboursement collègue exemple', 'autres-entrees', 1000, 18, 'credit'], [-33, 'Vente objet exemple', 'autres-entrees', 2500, 14, 'credit'],
    [-36, 'Abonnement jeu exemple', 'abonnements', 799, 10], [-38, 'Cinéma exemple', 'loisirs', 1150, 21], [-40, 'Pizza exemple', 'restaurants', 1600, 20], [-41, 'Logement exemple', 'logement', 1500, 9], [-43, 'Divers exemple', 'autres', 300, 15],
  ];
  for (const [k, libelle, categorie, montant, heure, sens] of recentes) saisie({ date: ajouterJours(auj, k), libelle, categorie, montant, heure, sens });
  // Achat d'envie en avance (exception) : un jeu, il y a deux jours
  const achatEnvie = saisie({ date: ajouterJours(auj, -2), libelle: 'Jeu vidéo exemple', categorie: 'loisirs', montant: 6999, heure: 17, source: 'confirmation' });
  saisie({ date: ajouterJours(auj, -2), libelle: 'VTC exemple', categorie: 'vtc', montant: 1690, heure: 21, source: 'confirmation' });
  saisie({ date: ajouterJours(auj, -20), libelle: 'Épargne exemple', categorie: 'epargne', montant: 2000, source: 'confirmation', epargne: 'virementLivret' });
  saisie({ date: ajouterJours(auj, -30), libelle: 'Prêt ami exemple', categorie: 'prets-proches', montant: 1000, source: 'confirmation' });
  saisie({ date: ajouterJours(auj, -60), libelle: 'Console exemple', categorie: 'loisirs', montant: 24000, source: 'confirmation', depenseEtalee: true });
  saisie({ date: ajouterJours(auj, -61), libelle: 'Casque exemple', categorie: 'loisirs', montant: 6000, source: 'confirmation', depenseEtalee: true });
  saisie({ date: ajouterJours(auj, -70), libelle: 'Recharge téléphone exemple', categorie: 'telephonie', montant: 1000, source: 'confirmation' });
  saisie({ date: ajouterJours(auj, -71), libelle: 'Ticket exemple', categorie: 'transports', montant: 250, source: 'confirmation' });
  // Ajustements de solde
  for (const [k, compteId, montant, sens] of [[-44, 'lcl', 1234, 'credit'], [-44, 'revolut', 567, 'debit']]) {
    const date = ajouterJours(auj, k);
    transactions.push({ id: id('ajust'), creeLe: horodatage(date, 20), modifieLe: horodatage(date, 20), date, dateComptable: date, montantCentimes: montant, sens, marchand: 'Ajustement de solde', libellePrincipal: 'Ajustement de solde',
      libelleBrut: 'Ajustement de solde', libelle: 'Ajustement de solde', categorie: 'ajustement', compteId, source: 'ajustement', articles: [], drapeaux: {}, virementInterne: { estInterne: false, transactionLieeId: null }, epargne: { estEpargne: false, type: null }, ajustement: true });
  }
  // Quelques opérations encore « en cours » à la banque
  for (const t of transactions.filter((x) => x.source === 'import' && x.date >= ajouterJours(auj, -3)).slice(0, 5)) t.drapeaux = { enCoursDeTraitement: true };
  transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));

  // ---------------- Comptes : solde de référence cohérent avec les opérations ----------------
  const soldeFinal = (compteId, initial) => transactions.filter((t) => t.compteId === compteId && t.dateComptable > ajouterJours(debut, -1)).reduce((s, t) => s + (t.sens === 'credit' ? t.montantCentimes : -t.montantCentimes), initial);
  const comptes = [
    { creeLe: horodatage(debutSuivi), modifieLe: horodatage(debutSuivi), id: 'lcl', nom: 'LCL', type: 'courant', banque: 'lcl', soldeInitialCentimes: 25000, dateSoldeInitial: ajouterJours(debut, -1), soldeReference: null },
    { creeLe: horodatage(debutSuivi), modifieLe: horodatage(debutSuivi), id: 'revolut', nom: 'Revolut', type: 'neobanque', banque: 'revolut', soldeInitialCentimes: 4000, dateSoldeInitial: ajouterJours(debut, -1), soldeReference: null },
  ];
  for (const c of comptes) c.soldeReference = { date: ajouterJours(auj, -3), centimes: soldeFinal(c.id, c.soldeInitialCentimes), note: 'Solde du relevé (exemple)' };
  for (const c of chargesFixes) {
    const paiements = transactions.filter((t) => t.chargeFixeId === c.id);
    c.occurrences = paiements.length;
    if ('derniereDate' in c) c.derniereDate = paiements.length ? paiements[paiements.length - 1].date : null;
  }

  // ---------------- Épargne : deux poches (sécurité, prêt) ----------------
  const premierVersement = versements[versements.length - 1];
  const poches = [
    { id: 'poche-coussin', nom: 'Sécurité', type: 'coussin', cibleCentimes: 150000, priorite: 2, partRepartition: 50, soldeInitialCentimes: 0,
      mouvements: premierVersement ? [{ id: 'mvt-0001', date: premierVersement.date, montantCentimes: premierVersement.montantCentimes, sens: 'versement', motif: 'Virement vers Sécurité', transactionId: premierVersement.id }] : [],
      compteSupport: 'Revolut', tauxAnnuel: 0, actif: true, creeLe: horodatage(debutSuivi), modifieLe: horodatage(debutSuivi) },
    { id: 'poche-pret', nom: 'Prêt 6 000 €', type: 'remboursementAnticipe', cibleCentimes: 600000, palierCentimes: 50000, priorite: 1, partRepartition: 50, soldeInitialCentimes: 0, mouvements: [],
      compteSupport: 'Livret A LCL', tauxAnnuel: 0, actif: true, creeLe: horodatage(debutSuivi), modifieLe: horodatage(debutSuivi), note: 'Exemple : pour rembourser le prêt plus tôt', creditId: 'credit-pret-perso' },
  ];

  // ---------------- Profil ----------------
  const etatPourDates = { transactions, revenusMensuels };
  const dates = datesDeSalaire(etatPourDates);
  const debutPeriode = dates.filter((d) => d <= auj).pop() || debutSuivi;
  const profil = {
    cle: 'profil', prenomAffichage: 'Exemple', nomTitulaire: 'TITULAIRE EXEMPLE', jourSalaireHabituel: 5, loyerAPayerCentimes: 52000, loyerBrutCentimes: null, aideLogementCentimes: null,
    jourLoyer: 8, heuresMensuelles: 151.67, objectifEpargneCentimes: 15000,
    arrondi: { actif: true, frequence: 'hebdomadaire', jourVirement: 4, jourDuMois: 6, inclureChargesFixes: false, depuis: null, premierVirement: null, pocheId: 'partage' },
    regleRevolut: { actif: true, minCentimes: 1000, maxCentimes: 1800 }, emetteursSalaire: [], parametresPlan: {}, repartitionVoiturePret: 50,
    repasAuto: { actif: true, depuis: ajouterJours(auj, -40), repasParJour: 2 },
    modifieLe: horodatage(ajouterJours(auj, -1), 21), premierImportLe: horodatage(debutSuivi, 9), datesSalaire: dates, debutSuivi,
    envies: { depuis: ajouterJours(auj, -20), liste: [{ id: 'envie-jeu', nom: 'Jeu exemple', type: 'jeu', montantCentimes: 6999, sortieLe: ajouterJours(auj, 6), creeLe: ajouterJours(auj, -20),
      achat: { date: achatEnvie.date, montantCentimes: achatEnvie.montantCentimes, txId: achatEnvie.id, exception: true, retenues: [] } }] },
  };
  const parametres = {
    cle: 'parametres', theme: 'sombre', style: 'joyeux', mode100Local: false, modeleGemini: null, masquageMontants: false, derniereSauvegarde: horodatage(ajouterJours(auj, -7), 20),
    onboarding: { termine: true, etape: 4, prerempli: false }, commissionInterventionCentimes: 800, tauxLivretA: 1.7, tauxLEP: 2.5, plafondLEPCentimes: 1000000,
    appelsIA: { date: ajouterJours(auj, -8), nb: 3 },
    fonctionnalitesV2: { gamelle: false, radarVente: false, joursSansDepense: false, freinAchat: false, modeRayon: false, antiCraquage: false, checkinSoir: false, bilanDimanche: false },
  };

  // ---------------- Le reste des collections ----------------
  const ENVELOPPES = [
    ['env-courses', 'courses', ['courses'], 16000, true, false], ['env-repas', 'restauration-rapide', ['restauration-rapide', 'livraison', 'restaurants'], 20000, false, false],
    ['env-transports', 'transports', ['transports', 'velo', 'vtc', 'train'], 22000, true, false], ['env-hygiene', 'beaute', ['beaute', 'pharmacie', 'sante', 'coiffeur', 'maison', 'telephonie', 'autres'], 6000, true, false],
    ['env-imprevus', 'vetements', ['vetements', 'achats-en-ligne', 'impots', 'dons', 'voyages', 'especes', 'frais-bancaires', 'abonnements', 'sport', 'energie'], 9000, false, false],
    ['env-plaisir', 'plaisir', ['plaisir', 'loisirs'], 4000, false, true],
  ];
  const enveloppes = ENVELOPPES.map(([eid, categorie, categories, plafond, vitale, sanct]) => ({ id: eid, nom: categorie, categories, categorie, plafondMensuelCentimes: plafond, vitale, sanctuarisee: sanct, report: false, creeLe: horodatage(debutSuivi), modifieLe: horodatage(debutSuivi) }));
  const regles = [...QUOTIDIEN.flatMap(([categorie, , , , libelles]) => libelles.map((l) => [l, categorie])), ['LIVRET EXEMPLE', 'epargne'], ['EMPLOYEUR EXEMPLE', 'salaire'], ['PRIME ACTIVITE EXEMPLE', 'prime-activite'], ['BAILLEUR EXEMPLE', 'logement']];
  const reglesCategorie = regles.map(([motif, categorie], i) => ({ id: `regle-${String(i + 1).padStart(3, '0')}`, motif: `\\| ${motif.replace(/ /g, '\\s+')}`, type: 'regex', categorie,
    ...(['salaire', 'prime-activite'].includes(categorie) ? { sens: 'credit' } : {}), origine: i % 7 === 6 ? 'utilisateur' : 'import', priorite: i % 7 === 6 ? 10 : 50, creeLe: horodatage(debutSuivi), modifieLe: horodatage(debutSuivi) }));
  const mois = moisDe(debutPeriode);
  const planMensuel = [3, 2, 1, 0].map((k) => {
    const m = ajouterMois(mois, -k);
    const r = revenusMensuels.find((x) => x.mois === m);
    const revenus = r ? r.salaireCentimes + r.primeActiviteCentimes : 128000;
    return { mois: m, revenusCentimes: revenus, chargesFixesCentimes: 66000, dettesDuMoisCentimes: 1050, disponibleCentimes: revenus - 67050, allocationsPoches: [{ pocheId: 'poche-coussin', montantCentimes: 5000 }, { pocheId: 'poche-pret', montantCentimes: 5000 }],
      arrondisEstimesCentimes: 0, vieCouranteCentimes: revenus - 77050, margeCentimes: 0, mode: 'croisiere', statut: 'accepte', id: m, creeLe: horodatage(`${m}-06`), modifieLe: horodatage(`${m}-06`),
      ...(k === 0 ? { periode: { mois: m, debut: debutPeriode, fin: ajouterJours(dateDuMois(ajouterMois(m, 1), 5), -1), nbJours: diffJours(debutPeriode, ajouterJours(dateDuMois(ajouterMois(m, 1), 5), -1)) + 1 } } : {}) };
  });
  const planAction = [['vtc', 'VTC EXEMPLE', 'Beaucoup de courses en VTC', 'Prendre le vélo pour les petits trajets', 4000], ['restauration-rapide', 'BURGER EXEMPLE', 'Restauration rapide plusieurs fois par semaine', 'Préparer une gamelle deux jours sur cinq', 3000],
    ['abonnements', 'VIDEO EXEMPLE', 'Deux abonnements vidéo', 'En garder un seul', 1349]].map(([action, marchand, constat, consigne, eco], i) => ({
    creeLe: horodatage(debutSuivi, 11), modifieLe: horodatage(debutSuivi, 11), id: `action-${i + 1}`, action, marchand, constat, consigne, economieMensuelleCentimes: eco, economieAnnuelleCentimes: eco * 12, priorite: i + 1, source: 'analyse', statut: i === 0 ? 'enCours' : 'propose' }));
  const imports = [{ creeLe: horodatage(debutSuivi, 9), modifieLe: horodatage(debutSuivi, 9), id: importId, date: debutSuivi,
    fichiers: [{ nom: 'releve-lcl-exemple.pdf', banque: 'lcl', releves: [{ numero: 1, debut, fin: ajouterJours(auj, -3), ok: true, sommeDebits: 0, sommeCredits: 0, ecartSolde: 0 }] },
      { nom: 'releve-revolut-exemple.pdf', banque: 'revolut', releves: [{ numero: 1, debut, fin: ajouterJours(auj, -3), ok: true, sommeDebits: 0, sommeCredits: 0, ecartSolde: 0 }] }],
    nouvelles: transactions.filter((t) => t.importId === importId).length, doublons: 0 }];
  const questions = [
    { creeLe: horodatage(debutSuivi, 9), modifieLe: horodatage(debutSuivi, 9), id: 'question-1', type: 'credit', titre: 'Ce prélèvement est-il un crédit ?', texte: 'ECHEANCE PRET EXEMPLE revient chaque mois.', reponseProposee: { classement: 'credit' }, statut: 'repondue', reponse: { ok: true }, creditId: 'credit-pret-perso' },
    { creeLe: horodatage(debutSuivi, 9), modifieLe: horodatage(debutSuivi, 9), id: 'question-2', type: 'particulier', titre: 'Virement à un proche', texte: 'Est-ce un prêt ?', reponseProposee: { classement: 'pret' }, statut: 'ouverte', transactionIds: transactions.filter((t) => t.aQualifier).map((t) => t.id) },
  ];
  const virementsPrevus = [
    { id: 'vp-epargne-1', mois, date: ajouterJours(auj, 2), rappelLe: ajouterJours(auj, 2), libelle: 'Virement Revolut vers Sécurité', montantCentimes: 5000, pocheId: 'poche-coussin', fait: false, type: 'epargne', creeLe: horodatage(debutPeriode), modifieLe: horodatage(debutPeriode) },
    { creeLe: horodatage(debutPeriode), modifieLe: horodatage(debutPeriode), id: `vp-efforts-${mois}`, date: ajouterJours(auj, 1), libelle: 'Virement épargne (sécurité, prêt)', montantCentimes: 1800, pocheId: null, compteId: 'lcl', fait: false, rappelLe: ajouterJours(auj, 1), type: 'epargne' },
  ];
  const privations = [
    { id: 'priv-0001', date: ajouterJours(auj, -1), categorie: 'restauration-rapide', libelle: 'Pas de burger ce midi', montantCentimes: 900, vireLe: null, creeLe: horodatage(ajouterJours(auj, -1), 13), modifieLe: horodatage(ajouterJours(auj, -1), 13) },
  ];
  const s = (d) => horodatage(d, 6);
  const meta = {
    restesJour: { depuis: ajouterJours(auj, -20), dernier: ajouterJours(auj, -1) },
    jeu: { depuis: ajouterJours(auj, -20), niveauVu: 2 },
    joursVus: [-5, -4, -3, -2, -1, 0].map((k) => ajouterJours(auj, k)),
    effortsPartages: s(ajouterJours(auj, -30)), enviesAmorcees: s(ajouterJours(auj, -20)), saisiesNuitRecalees: s(ajouterJours(auj, -15)),
    pochesRangees: s(ajouterJours(auj, -30)), supportsEpargne: s(ajouterJours(auj, -12)), derniereVerification: ajouterJours(auj, -1),
  };

  const contenu = {
    profil, parametres, revenusMensuels, comptes, transactions, chargesFixes, enveloppes, poches, planMensuel, creditsBancaires,
    prets: [
      { id: 'pret-proche-1', personneAlias: 'Proche A', sens: 'empruntéParMoi', montantCentimes: 30000, objet: '', date: ajouterJours(auj, -90), echeancier: [{ date: ajouterJours(auj, 30), montantCentimes: 30000, payee: false }], remboursements: [], statut: 'enCours', creeLe: horodatage(debutSuivi), modifieLe: horodatage(debutSuivi) },
      { creeLe: horodatage(debutSuivi), modifieLe: horodatage(debutSuivi), id: 'pret-proche-2', personneAlias: 'Proche B', sens: 'empruntéParMoi', montantCentimes: 15000, objet: 'Dépannage', date: ajouterJours(auj, -200), echeancier: [{ date: ajouterJours(auj, -150), montantCentimes: 15000, payee: true }], remboursements: [], statut: 'solde' },
      { creeLe: horodatage(debutSuivi), modifieLe: horodatage(debutSuivi), id: 'pret-proche-3', personneAlias: 'Proche C', sens: 'empruntéParMoi', montantCentimes: 24000, objet: 'Console', categorieDepense: 'loisirs', depenseEtalee: true, date: ajouterJours(auj, -60), echeancier: [{ date: ajouterJours(auj, 20), montantCentimes: 12000, payee: false }, { date: ajouterJours(auj, 50), montantCentimes: 12000, payee: false }], remboursements: [], statut: 'enCours' },
    ],
    reglesCategorie, planAction, imports, questions, virementsPrevus, privations, meta,
  };
  for (const c of COLLECTIONS_VIDES) contenu[c] = [];
  return { format: FORMAT, schemaVersion: SCHEMA_VERSION, exporteLe: horodatage(auj, 18), application: { nom: 'Budget', version: versionApp }, contenu };
}

// ---------------- En ligne de commande ----------------
const estNode = typeof process !== 'undefined' && !!process.versions?.node;
if (estNode && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const val = (nom) => (args.includes(nom) ? args[args.indexOf(nom) + 1] : null);
  const sortie = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!sortie) { console.error('Usage : node tests/outils/generer-sauvegarde.mjs <sortie.json> [--aujourdhui AAAA-MM-JJ] [--graine N]'); process.exit(2); }
  const aujourdhui = val('--aujourdhui') || REFERENCE_DEFAUT;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(aujourdhui)) { console.error('Date attendue : AAAA-MM-JJ'); process.exit(2); }
  const s = genererSauvegarde({ aujourdhui, graine: Number(val('--graine') ?? GRAINE_DEFAUT) });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(sortie, JSON.stringify(s, null, 1));
  console.log(`✓ Sauvegarde synthétique écrite : ${sortie} (${s.contenu.transactions.length} opérations, du ${s.contenu.transactions[0].date} au ${aujourdhui}).`);
}
