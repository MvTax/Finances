// pipeline.js — traitement commun après parsing (PDF ou CSV), sans IA.
// 1. Normalisation du marchand   2. Dédoublonnage idempotent (empreinte, date ±1 j, multiensemble)
// 3. Virements internes et épargne   4. Remboursements   5. Catégorisation par règles
// 6. Détection des charges fixes et des revenus   7. Ajustements de solde
// Toutes les fonctions sont pures (pas d'accès au DOM ni à la base) : testables sous Node.

import { normaliserMarchand, normaliserTexte, trierRegles, trouverRegle, REGLES_DEFAUT } from '../rules.js';
import { natureTransaction, montantSigne } from '../categories.js';
import { diffJours, moisDe, ajouterJours } from '../dates.js';

export const ORIGINE_IMPORT = 'import';
const CIVILITES = /^(MR OU MME|M OU MME|M ET MME|MR ET MME|MADEMOISELLE|MADAME|MONSIEUR|MLLE|MLE|MME|MR|M)\b\.?\s*/;
const MOTS_SOCIETE = /\b(SAS|SARL|SA|SASU|EURL|SNC|TELECOM|MOBILE|CAF|CPAM|DGFIP|TRESOR|ASSURANCE|BANQUE|BANK|SOCIETE|STE|GROUP|FRANCE|SERVICES?|EUROPE|LTD|GMBH|BV|INC|URSSAF|POLE EMPLOI|FRANCE TRAVAIL|MUTUELLE|IMPOTS?)\b/;

let compteurId = 0;
export function nouvelId(prefixe = 'id') {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  compteurId += 1;
  return `${prefixe}-${Date.now().toString(36)}-${compteurId}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Mots significatifs d'un nom de titulaire (« M. DUPONT JEAN » → ['DUPONT','JEAN']). */
export function jetonsTitulaire(nom) {
  if (!nom) return [];
  return normaliserTexte(nom).replace(CIVILITES, '').split(/[\s.-]+/).filter((m) => m.length >= 3);
}

/** Le libellé désigne-t-il le titulaire lui-même ? (tous les jetons présents, dans n'importe quel ordre) */
export function designeTitulaire(texte, jetons) {
  if (!jetons || jetons.length < 2) return false;
  const t = ' ' + normaliserTexte(texte).replace(/[^A-Z0-9 ]/g, ' ') + ' ';
  return jetons.every((j) => t.includes(' ' + j + ' '));
}

/** Extrait un nom de personne d'un libellé de virement, sinon null. */
export function extrairePersonne(libelle, jetons = []) {
  const s = normaliserTexte(libelle);
  const m = s.match(/^(?:VIR INST|VIREMENT|VIR SEPA|VIR|TO|VIREMENT A ?:|VIREMENT DE ?:|PAIEMENT ENVOYE PAR)\s+(.+)$/);
  if (!m) return null;
  let nom = m[1].replace(/^(A|DE)\s*:\s*/, '').trim();
  if (MOTS_SOCIETE.test(nom)) return null;
  if (/^(VIREMENT|VIR|PAIEMENT|TRANSFERT|EPARGNE|LIVRET A?)$/.test(nom)) return null;
  const aCivilite = CIVILITES.test(nom);
  nom = nom.replace(CIVILITES, '').trim();
  if (!nom || /\d{3,}/.test(nom)) return null;
  const mots = nom.split(/\s+/);
  if (!aCivilite && (mots.length > 5)) return null;
  if (designeTitulaire(nom, jetons)) return null;
  return nom;
}

/**
 * Transforme les opérations d'un parseur en transactions de l'app.
 * @param {object} resultat  sortie de parserLCL / parserRevolut / parserCSV
 * @param {object} ctx { compteId, importId, maintenant }
 */
export function operationsVersTransactions(resultat, ctx) {
  const maintenant = ctx.maintenant || new Date().toISOString();
  return resultat.operations.map((op) => {
    const libellePrincipal = op.libellePrincipal || op.lignes?.[0] || op.description || '';
    const tx = {
      id: nouvelId('tx'),
      creeLe: maintenant,
      modifieLe: maintenant,
      date: op.date,
      dateComptable: op.dateComptable || op.date,
      montantCentimes: op.montantCentimes,
      sens: op.sens,
      marchand: normaliserMarchand(libellePrincipal),
      libellePrincipal,
      libelleBrut: op.libelleBrut || libellePrincipal,
      libelle: '',
      categorie: null,
      compteId: ctx.compteId,
      source: 'import',
      banque: resultat.banque,
      categorieBanque: op.categorieRevolut || null,
      articles: [],
      drapeaux: {},
      virementInterne: { estInterne: false, transactionLieeId: null },
      epargne: { estEpargne: false, type: null },
      remboursementDe: null,
      pretId: null,
      chargeFixeId: null,
      importId: ctx.importId,
      optionSystemEpargneCentimes: op.optionSystemEpargneCentimes || 0,
      estAvoirCarte: !!op.estAvoirCarte,
      fraisCentimes: op.fraisCentimes || 0,
      aQualifier: false,
      confiance: 'haute',
    };
    tx.libelle = tx.marchand;
    tx.empreinteDedoublonnage = empreinte(tx);
    return tx;
  });
}

/** Empreinte stable : compte | sens | montant | marchand normalisé (la date est comparée à ±1 jour). */
export function empreinte(tx) {
  return `${tx.compteId}|${tx.sens}|${tx.montantCentimes}|${normaliserTexte(tx.marchand)}`;
}

/**
 * Dédoublonnage idempotent. Chaque transaction existante ne peut absorber qu'UNE nouvelle (multiensemble) :
 * trois cafés identiques le même jour restent trois cafés, mais réimporter le même relevé n'ajoute rien.
 * Les saisies manuelles (voix, texte, photo, confirmation de salaire) sont rapprochées des lignes importées
 * (même compte, sens et montant, date ±3 jours) : la ligne bancaire complète la saisie au lieu de la dupliquer.
 * @returns {{ nouvelles: Array, doublons: Array, rapprochees: Array<{ existante, importee }> }}
 */
export function dedoublonner(entrantes, existantes) {
  const parCle = new Map();
  for (const e of existantes) {
    if (e.ajustement) continue;
    const k = e.empreinteDedoublonnage || empreinte(e);
    if (!parCle.has(k)) parCle.set(k, []);
    parCle.get(k).push(e);
  }
  const utilisees = new Set();
  const nouvelles = [];
  const doublons = [];
  const rapprochees = [];
  const manuelles = existantes.filter((e) => e.source !== 'import' && !e.ajustement && e.compteId);
  for (const t of entrantes) {
    const candidats = parCle.get(t.empreinteDedoublonnage || empreinte(t)) || [];
    const trouve = candidats
      .filter((c) => !utilisees.has(c.id) && Math.abs(diffJours(c.date, t.date)) <= 1)
      .sort((a, b) => Math.abs(diffJours(a.date, t.date)) - Math.abs(diffJours(b.date, t.date)))[0];
    if (trouve) { utilisees.add(trouve.id); doublons.push(t); continue; }
    const manuelle = manuelles
      .filter((m) => !utilisees.has(m.id) && m.compteId === t.compteId && m.sens === t.sens && m.montantCentimes === t.montantCentimes && Math.abs(diffJours(m.date, t.date)) <= 3)
      .sort((a, b) => Math.abs(diffJours(a.date, t.date)) - Math.abs(diffJours(b.date, t.date)))[0];
    if (manuelle) { utilisees.add(manuelle.id); rapprochees.push({ existante: manuelle, importee: t }); continue; }
    nouvelles.push(t);
  }
  return { nouvelles, doublons, rapprochees };
}

/** Fusionne une ligne importée dans la saisie manuelle correspondante (la catégorie choisie est conservée). */
export function fusionnerRapprochement(existante, importee) {
  return {
    ...existante,
    dateComptable: importee.dateComptable,
    libellePrincipal: importee.libellePrincipal,
    libelleBrut: importee.libelleBrut,
    empreinteDedoublonnage: importee.empreinteDedoublonnage,
    marchand: existante.marchand || importee.marchand,
    importId: importee.importId,
    sourceInitiale: existante.source,
    source: 'import',
    modifieLe: importee.modifieLe,
  };
}

// ---------------------------------------------------------------------------
// Classification structurelle : interne, épargne, revenus, crédits, proches
// ---------------------------------------------------------------------------

/**
 * Pose les drapeaux structurels d'une transaction selon son libellé.
 * ctx : { jetons (titulaire), comptes, regleRevolut: { minCentimes, maxCentimes } }
 */
export function classerStructure(tx, ctx) {
  classerStructureBrute(tx, ctx);
  if (tx.epargne?.estEpargne) {
    tx.marchand = tx.epargne.type === 'arrondiBanque' ? "Arrondi System'Épargne" : (tx.sens === 'debit' ? "Virement vers l'épargne" : "Retrait de l'épargne");
  } else if (tx.virementInterne?.estInterne) {
    tx.marchand = { versRevolut: 'Recharge Revolut', depuisLCL: 'Recharge Revolut', versLCL: 'Virement Revolut → LCL', depuisRevolut: 'Virement Revolut → LCL' }[tx.role] || 'Virement interne';
  } else if (tx.personne) {
    tx.marchand = nomPersonneAffiche(tx.personne);
  }
  tx.libelle = tx.marchand;
  tx.empreinteDedoublonnage = tx.empreinteDedoublonnage || empreinte(tx);
  return tx;
}

/** « JEAN DUPONT » → « Jean Dupont » */
export function nomPersonneAffiche(nom) {
  return String(nom).toLowerCase().replace(/(^|[\s'-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
}

function classerStructureBrute(tx, ctx) {
  const L = normaliserTexte(tx.libellePrincipal);
  const B = normaliserTexte(tx.libelleBrut);
  const banque = tx.banque;
  const jetons = ctx.jetons || [];
  tx.role = null;

  if (banque === 'lcl') {
    if (/^TOTAL OPTION SYSTEM'?\s?EPARGNE/.test(L)) { tx.epargne = { estEpargne: true, type: 'arrondiBanque' }; tx.categorie = 'epargne'; return tx; }
    if (/^VIR\.?\s?PERMANENT\b/.test(L) && (designeTitulaire(L, jetons) || /LIVRET|LDD|LEP|EPARGNE/.test(B))) { tx.epargne = { estEpargne: true, type: 'virementLivret' }; tx.categorie = 'epargne'; return tx; }
    if (/^CB REVOLUT/.test(L)) { tx.virementInterne = { estInterne: true, transactionLieeId: null }; tx.role = 'versRevolut'; tx.categorie = 'virements-internes'; return tx; }
    if (/^VIR INST\b/.test(L) && tx.sens === 'debit' && /REVOLUT/.test(L)) { tx.virementInterne = { estInterne: true, transactionLieeId: null }; tx.role = 'versRevolut'; tx.categorie = 'virements-internes'; return tx; }
    if (tx.sens === 'credit' && /ENVOYE DEPUIS REVOLUT/.test(B)) { tx.virementInterne = { estInterne: true, transactionLieeId: null }; tx.role = 'depuisRevolut'; tx.categorie = 'virements-internes'; return tx; }
    if (/^(VIR SEPA|VIR INST|VIREMENT|VIR)\b/.test(L) && designeTitulaire(L, jetons)) {
      // Virement de / vers soi-même hors Revolut : compte d'épargne (SAVG = provient de l'épargne)
      tx.epargne = { estEpargne: true, type: 'virementLivret' };
      tx.categorie = 'epargne';
      return tx;
    }
  }

  if (banque === 'revolut') {
    if (/^RECHARGE SUR APPLE PAY|^RECHARGE\b/.test(L) || (/^PAIEMENT ENVOYE PAR\b/.test(L) && designeTitulaire(L, jetons))) {
      tx.virementInterne = { estInterne: true, transactionLieeId: null }; tx.role = 'depuisLCL'; tx.categorie = 'virements-internes'; return tx;
    }
    if (tx.sens === 'debit' && /^(TO|VIREMENT A ?:?)\s/.test(L)) {
      const nom = L.replace(/^(TO|VIREMENT A ?:?)\s+/, '');
      if (designeTitulaire(nom, jetons) || /\b(MOI|LCL|MON COMPTE|MES COMPTES)\b/.test(nom)) {
        tx.virementInterne = { estInterne: true, transactionLieeId: null }; tx.role = 'versLCL'; tx.categorie = 'virements-internes'; return tx;
      }
      tx.role = 'versParticulier';
      tx.personne = extrairePersonne(tx.libellePrincipal, jetons) || nom;
      return tx;
    }
    if (tx.sens === 'credit' && /^(VIREMENT DE ?:?|PAIEMENT ENVOYE PAR)\s/.test(L)) {
      tx.role = 'depuisParticulier';
      tx.personne = extrairePersonne(tx.libellePrincipal, jetons);
      return tx;
    }
  }

  // Virements génériques de / vers des particuliers (toutes banques)
  if (/^(VIR INST|VIREMENT|VIR SEPA)\b/.test(L) && !/^VIREMENT CAF\b/.test(L)) {
    const p = extrairePersonne(tx.libellePrincipal, jetons);
    if (p) { tx.role = tx.sens === 'debit' ? 'versParticulier' : 'depuisParticulier'; tx.personne = p; }
  }
  return tx;
}

/** Revenus : « VIREMENT CAF » en DÉBUT de libellé seulement ; salaire = « Paie »/« SALAIRE » ou virement récurrent d'employeur. */
export function detecterRevenus(transactions, ctx = {}) {
  const jetons = ctx.jetons || [];
  const credits = transactions.filter((t) => t.sens === 'credit' && !t.virementInterne?.estInterne && !t.epargne?.estEpargne && !t.ajustement);
  const emetteursSalaire = new Set(ctx.emetteursSalaire || []);
  for (const t of credits) {
    const L = normaliserTexte(t.libellePrincipal);
    const B = normaliserTexte(t.libelleBrut);
    if (/^VIREMENT CAF\b/.test(L)) { t.categorie = 'prime-activite'; t.role = 'revenu'; continue; }
    if (/^VERSEMENT ALS/.test(L)) { t.categorie = 'entree-exceptionnelle'; t.role = 'aideLogement'; continue; }
    if (/^VIREMENT\b/.test(L) && /\b(PAIE|SALAIRE|PAYE|REMUNERATION)\b/.test(B) && !designeTitulaire(L, jetons)) {
      emetteursSalaire.add(L);
    }
  }
  // Virements d'un même émetteur (non particulier), ≥ 500 €, reçus entre le 1er et le 10 sur au moins deux mois distincts
  const parEmetteur = new Map();
  for (const t of credits) {
    const L = normaliserTexte(t.libellePrincipal);
    if (!/^VIREMENT\s/.test(L) || /^VIREMENT CAF\b/.test(L) || designeTitulaire(L, jetons)) continue;
    if (CIVILITES.test(L.replace(/^VIREMENT\s+/, ''))) continue; // un particulier n'est pas un employeur
    if (t.montantCentimes < 50000 || Number(t.date.slice(8, 10)) > 10) continue;
    if (!parEmetteur.has(L)) parEmetteur.set(L, new Set());
    parEmetteur.get(L).add(moisDe(t.date));
  }
  for (const [L, mois] of parEmetteur) if (mois.size >= 2) emetteursSalaire.add(L);
  for (const t of credits) {
    if (emetteursSalaire.has(normaliserTexte(t.libellePrincipal))) { t.categorie = 'salaire'; t.role = 'revenu'; t.personne = null; }
  }
  return [...emetteursSalaire];
}

/**
 * Appariement des virements internes entre comptes : motif + montant identique + date à ±3 jours.
 * Jamais par numéro de carte (il change au renouvellement).
 */
export function appairerInternes(transactions) {
  const paires = [['versRevolut', 'depuisLCL'], ['versLCL', 'depuisRevolut']];
  let nb = 0;
  for (const [a, b] of paires) {
    const sources = transactions.filter((t) => t.role === a && !t.virementInterne.transactionLieeId);
    const cibles = transactions.filter((t) => t.role === b && !t.virementInterne.transactionLieeId);
    for (const s of sources) {
      const c = cibles
        .filter((x) => !x.virementInterne.transactionLieeId && x.montantCentimes === s.montantCentimes && x.compteId !== s.compteId && Math.abs(diffJours(s.date, x.date)) <= 3)
        .sort((x, y) => Math.abs(diffJours(s.date, x.date)) - Math.abs(diffJours(s.date, y.date)))[0];
      if (c) { s.virementInterne.transactionLieeId = c.id; c.virementInterne.transactionLieeId = s.id; nb++; }
    }
  }
  // Un « To X » Revolut sans nom reconnu mais qui correspond exactement à un crédit LCL « Envoyé depuis Revolut » est interne
  const restantsLCL = transactions.filter((t) => t.role === 'depuisRevolut' && !t.virementInterne.transactionLieeId);
  for (const c of restantsLCL) {
    const s = transactions
      .filter((t) => t.role === 'versParticulier' && t.banque === 'revolut' && t.montantCentimes === c.montantCentimes && Math.abs(diffJours(t.date, c.date)) <= 3)
      .sort((x, y) => Math.abs(diffJours(x.date, c.date)) - Math.abs(diffJours(y.date, c.date)))[0];
    if (s) {
      s.role = 'versLCL'; s.personne = null; s.categorie = 'virements-internes';
      s.virementInterne = { estInterne: true, transactionLieeId: c.id };
      c.virementInterne.transactionLieeId = s.id; nb++;
    }
  }
  return nb;
}

/**
 * Règle Revolut (précision 1) : virement vers un particulier entre min et max (10,00–18,00 € par défaut)
 * → Livraison de repas « Uber Eats via un tiers ». Confiance haute si précédé d'une recharge du même
 * montant (±2 €) dans les 48 h, sinon moyenne. Hors fourchette → à qualifier.
 */
export function appliquerRegleRevolut(transactions, regle = { minCentimes: 1000, maxCentimes: 1800, actif: true }) {
  if (!regle.actif) return 0;
  const recharges = transactions.filter((t) => t.role === 'depuisLCL');
  let nb = 0;
  for (const t of transactions) {
    if (t.banque !== 'revolut' || t.role !== 'versParticulier' || t.categorie) continue;
    if (t.montantCentimes >= regle.minCentimes && t.montantCentimes <= regle.maxCentimes) {
      const prec = recharges.some((r) => Math.abs(r.montantCentimes - t.montantCentimes) <= 200 && diffJours(r.date, t.date) >= 0 && diffJours(r.date, t.date) <= 2);
      t.categorie = 'livraison';
      t.marchand = 'Uber Eats via un tiers';
      t.libelle = 'Uber Eats via un tiers';
      t.sousLibelle = 'Uber Eats via un tiers';
      t.confiance = prec ? 'haute' : 'moyenne';
      t.regleRevolut = true;
      nb++;
    } else {
      t.aQualifier = true;
      t.confiance = 'basse';
    }
  }
  return nb;
}

/** Remboursements / avoirs carte : rattachés à l'achat d'origine (même marchand, ≤ 60 jours avant, montant ≥). */
export function appairerRemboursements(transactions) {
  let nb = 0;
  const achats = transactions.filter((t) => t.sens === 'debit' && !t.virementInterne?.estInterne && !t.epargne?.estEpargne);
  const deja = new Map();
  for (const r of transactions) {
    if (r.sens !== 'credit' || r.remboursementDe) continue;
    const B = normaliserTexte(r.libelleBrut);
    const estAvoir = r.estAvoirCarte || /\bREMBOURSEMENT\b|^REGUL FACTURE|\bAVOIR\b|\bREFUND\b/.test(B);
    if (!estAvoir || r.role === 'depuisParticulier') continue;
    let marchand = r.marchand;
    if (/^REGUL FACTURE/.test(normaliserTexte(r.libellePrincipal))) {
      const ligne2 = (r.libelleBrut.split('|')[1] || '').trim();
      if (ligne2) { marchand = normaliserMarchand(ligne2); r.marchand = marchand; }
    }
    const cands = achats
      .filter((a) => normaliserTexte(a.marchand) === normaliserTexte(marchand) && diffJours(a.date, r.date) >= 0 && diffJours(a.date, r.date) <= 60 && a.montantCentimes >= r.montantCentimes)
      .map((a) => ({ a, reste: a.montantCentimes - (deja.get(a.id) || 0) }))
      .filter((x) => x.reste >= r.montantCentimes)
      .sort((x, y) => (x.a.montantCentimes === r.montantCentimes ? 0 : 1) - (y.a.montantCentimes === r.montantCentimes ? 0 : 1) || diffJours(y.a.date, x.a.date));
    r.estRemboursement = true;
    if (cands[0]) {
      const a = cands[0].a;
      r.remboursementDe = a.id;
      deja.set(a.id, (deja.get(a.id) || 0) + r.montantCentimes);
      if (!r.categorie && a.categorie) r.categorie = a.categorie;
      nb++;
    }
  }
  return nb;
}

/** Catégorisation par règles (utilisateur → import → défaut) des transactions sans catégorie. */
export function categoriser(transactions, regles = [], { forcer = false } = {}) {
  const triees = trierRegles([...regles, ...REGLES_DEFAUT]);
  const inconnues = [];
  for (const t of transactions) {
    if (t.ajustement) continue;
    if (t.categorie && !forcer) continue;
    if (t.categorieVerrouillee) continue;
    const estParticulier = t.role === 'versParticulier' || t.role === 'depuisParticulier';
    const r = trouverRegle(t, estParticulier ? triees.filter((x) => x.origine !== 'defaut') : triees);
    if (r) {
      t.categorie = r.categorie;
      if (r.marchandNormalise) t.marchand = r.marchandNormalise;
      t.regleId = r.id;
    } else {
      if (t.role === 'versParticulier' || t.role === 'depuisParticulier') { t.categorie = 'prets-proches'; }
      else if (t.sens === 'credit') { t.categorie = 'autres-entrees'; t.aQualifier = true; }
      else { t.categorie = 'autres'; inconnues.push(t); }
    }
  }
  // Les remboursements prennent la catégorie de l'achat d'origine
  const parId = new Map(transactions.map((t) => [t.id, t]));
  for (const t of transactions) if (t.remboursementDe && parId.get(t.remboursementDe)) t.categorie = parId.get(t.remboursementDe).categorie;
  return inconnues;
}

// ---------------------------------------------------------------------------
// Charges fixes
// ---------------------------------------------------------------------------
const CATEGORIES_CHARGES = new Set(['logement', 'energie', 'telephonie', 'abonnements', 'sport', 'transports', 'frais-bancaires', 'credits']);

/**
 * Détecte les charges fixes : même marchand (tous comptes confondus), passages réguliers (intervalle médian
 * de 25 à 35 jours, ≥ 60 % des intervalles à ±6 jours), au plus ~1 passage par mois, au moins 3 passages
 * (ou 2 dans les 70 derniers jours). Les abonnements carte à montants multiples (ex. Apple) sont séparés
 * par montant. Active si le prochain passage attendu (dernier + période + 7 j) n'est pas dépassé.
 */
export function detecterChargesFixes(transactions, { dateReference } = {}) {
  const debits = transactions.filter((t) => t.sens === 'debit' && !t.virementInterne?.estInterne && !t.epargne?.estEpargne && !t.ajustement && !t.pretId);
  const ref = dateReference || debits.reduce((m, t) => (t.dateComptable > m ? t.dateComptable : m), '0000-00-00');
  const candidats = debits.filter((t) => {
    const L = normaliserTexte(t.libellePrincipal);
    if (/CREDIT INSTANT|^ANNULATION/.test(L)) return false; // échéancier spécifique (module dettes)
    if (normaliserTexte(t.marchand) === "FRAIS D'INCIDENT") return false;
    return CATEGORIES_CHARGES.has(t.categorie) || /^PRLV\b/.test(L);
  });
  const parMarchand = new Map();
  for (const t of candidats) {
    if (!parMarchand.has(t.marchand)) parMarchand.set(t.marchand, []);
    parMarchand.get(t.marchand).push(t);
  }
  const charges = [];
  const evaluer = (liste, libelle) => {
    liste = [...liste].sort((a, b) => (a.dateComptable < b.dateComptable ? -1 : 1));
    if (liste.length < 2) return null;
    const dates = liste.map((t) => t.dateComptable);
    const intervalles = dates.slice(1).map((d, i) => diffJours(dates[i], d));
    const tri = [...intervalles].sort((a, b) => a - b);
    const mediane = tri[Math.floor(tri.length / 2)];
    if (mediane < 25 || mediane > 35) return null;
    const reguliers = intervalles.filter((x) => Math.abs(x - mediane) <= 6).length / intervalles.length;
    const recents = dates.filter((d) => diffJours(d, ref) <= 70).length;
    if (liste.length < 3 && recents < 2) return null;
    if (reguliers < 0.6 && liste.length >= 3) return null;
    const moisDistincts = new Set(dates.map(moisDe)).size;
    if (liste.length > moisDistincts * 1.5) return null;
    const derniere = liste[liste.length - 1];
    const montants = liste.slice(-6).map((t) => t.montantCentimes);
    const min = Math.min(...montants); const max = Math.max(...montants);
    // 29 à 32 jours = mensuel (jour fixe du mois) ; 25 à 28 jours = cycle de 4 semaines (ex. salle de sport)
    const periode = mediane >= 29 && mediane <= 32 ? 30 : mediane;
    return {
      id: nouvelId('cf'),
      libelle,
      montantCentimes: derniere.montantCentimes,
      montantVariable: max - min > Math.max(100, Math.round(max * 0.05)),
      montantMinCentimes: min,
      montantMaxCentimes: max,
      jourPrelevement: Number(derniere.dateComptable.slice(8, 10)),
      periodiciteJours: periode === 30 ? null : periode,
      compteId: derniere.compteId,
      categorie: derniere.categorie,
      motifDetection: normaliserTexte(derniere.marchand),
      montantDetection: null,
      actif: diffJours(derniere.dateComptable, ref) <= mediane + 7,
      derniereDate: derniere.dateComptable,
      occurrences: liste.length,
      origine: 'detection',
    };
  };
  for (const [marchand, liste] of parMarchand) {
    const c = evaluer(liste, marchand);
    if (c) { charges.push(c); continue; }
    // Plusieurs abonnements chez le même marchand : un groupe par montant
    const parMontant = new Map();
    for (const t of liste) { if (!parMontant.has(t.montantCentimes)) parMontant.set(t.montantCentimes, []); parMontant.get(t.montantCentimes).push(t); }
    if (parMontant.size < 2) continue;
    for (const [montant, sous] of parMontant) {
      const cm = evaluer(sous, `${marchand} (${(montant / 100).toFixed(2).replace('.', ',')} €)`);
      if (cm) { cm.montantDetection = montant; charges.push(cm); }
    }
  }
  return charges.sort((a, b) => a.jourPrelevement - b.jourPrelevement);
}

/** Rattache chaque transaction à la charge fixe active correspondante (évite le double comptage). */
export function rattacherChargesFixes(transactions, charges) {
  for (const t of transactions) {
    if (t.sens !== 'debit' || t.chargeFixeId) continue;
    const c = charges.find((c) => c.actif !== false && normaliserTexte(t.marchand) === c.motifDetection && (!c.montantDetection || c.montantDetection === t.montantCentimes))
      || charges.find((c) => normaliserTexte(t.marchand) === c.motifDetection && (!c.montantDetection || c.montantDetection === t.montantCentimes));
    if (c) t.chargeFixeId = c.id;
  }
}

// ---------------------------------------------------------------------------
// Soldes et ajustements
// ---------------------------------------------------------------------------

/** Solde d'un compte à une date (incluse) = solde initial + somme signée des transactions. */
export function soldeCompte(compte, transactions, jusquAu = '9999-12-31') {
  let s = compte.soldeInitialCentimes || 0;
  for (const t of transactions) {
    if (t.compteId !== compte.id) continue;
    const d = t.dateComptable || t.date; // le solde bancaire suit la date comptable
    if (d > jusquAu) continue;
    if (compte.dateSoldeInitial && d <= compte.dateSoldeInitial && !t.ajustement) continue;
    s += montantSigne(t);
  }
  return s;
}

/**
 * Ajustement « opérations non importées » : une seule ligne par compte, datée du jour de référence,
 * telle que le solde calculé à cette date égale exactement le solde réel déclaré.
 * Recalculé à chaque import : quand les opérations manquantes arrivent, l'ajustement se réduit (sans doublon).
 */
export function recalculerAjustement(compte, transactions, maintenant = new Date().toISOString()) {
  const ref = compte.soldeReference;
  const autres = transactions.filter((t) => !(t.ajustement && t.compteId === compte.id));
  if (!ref) return { transactions: autres.concat(transactions.filter((t) => t.ajustement && t.compteId === compte.id)), ajustement: null };
  const calcule = soldeCompte(compte, autres, ref.date);
  const ecart = ref.centimes - calcule;
  const existant = transactions.find((t) => t.ajustement && t.compteId === compte.id);
  if (ecart === 0) return { transactions: autres, ajustement: null };
  const aj = {
    ...(existant || {}),
    id: existant?.id || nouvelId('aj'),
    creeLe: existant?.creeLe || maintenant,
    modifieLe: maintenant,
    date: ref.date,
    dateComptable: ref.date,
    montantCentimes: Math.abs(ecart),
    sens: ecart > 0 ? 'credit' : 'debit',
    marchand: 'Ajustement de solde',
    libelle: 'Ajustement de solde (opérations non importées)',
    libellePrincipal: 'Ajustement de solde (opérations non importées)',
    libelleBrut: 'Ajustement de solde (opérations non importées)',
    categorie: 'ajustement',
    compteId: compte.id,
    source: 'ajustement',
    ajustement: true,
    articles: [], drapeaux: {},
    virementInterne: { estInterne: false, transactionLieeId: null },
    epargne: { estEpargne: false, type: null },
  };
  return { transactions: autres.concat([aj]), ajustement: aj };
}

/**
 * Pipeline complet pour un lot importé.
 * @param {Array} resultats  [{ resultat (parseur), compteId }]
 * @param {object} etat      { transactions, regles, comptes, profil }
 */
export function traiterImport(resultats, etat, options = {}) {
  const importId = options.importId || nouvelId('imp');
  const maintenant = options.maintenant || new Date().toISOString();
  // Jetons du nom du titulaire (profil, sinon en-tête du relevé) : au moins deux mots
  const ctx = { jetons: choisirJetons(resultats, etat.profil?.nomTitulaire) || [] };
  let entrantes = [];
  for (const { resultat, compteId } of resultats) entrantes = entrantes.concat(operationsVersTransactions(resultat, { compteId, importId, maintenant }));
  const { nouvelles, doublons, rapprochees } = dedoublonner(entrantes, etat.transactions || []);
  // On classe sur l'ensemble (existantes + nouvelles) pour pouvoir apparier avec des opérations déjà en base
  const existantes = (etat.transactions || []).map((t) => ({ ...t, virementInterne: { ...(t.virementInterne || {}) } }));
  for (const t of nouvelles) classerStructure(t, ctx);
  const tout = existantes.concat(nouvelles);
  const emetteurs = detecterRevenus(nouvelles, { jetons: ctx.jetons, emetteursSalaire: etat.profil?.emetteursSalaire || [] });
  appairerInternes(tout);
  appliquerRegleRevolut(nouvelles, etat.profil?.regleRevolut);
  appairerRemboursements(tout);
  const inconnues = categoriser(nouvelles, etat.regles || []);
  return {
    importId,
    nouvelles,
    doublons,
    rapprochees,
    inconnues,
    emetteursSalaire: emetteurs,
    jetonsTitulaire: ctx.jetons,
    internes: nouvelles.filter((t) => t.virementInterne.estInterne),
    aQualifier: nouvelles.filter((t) => t.aQualifier),
    transactionsMisesAJour: existantes.filter((t, i) => JSON.stringify(t.virementInterne) !== JSON.stringify(etat.transactions[i].virementInterne)),
  };
}

function choisirJetons(resultats, nomProfil) {
  const noms = [nomProfil, ...resultats.map((r) => r.resultat.titulaire)].filter(Boolean);
  for (const n of noms) { const j = jetonsTitulaire(n); if (j.length >= 2) return j; }
  return null;
}

/** Résumé chiffré d'un import pour l'écran de revue. */
export function resumeImport(res) {
  const n = (t) => natureTransaction(t);
  return {
    nouvelles: res.nouvelles.length,
    doublons: res.doublons.length,
    rapprochees: res.rapprochees.length,
    internes: res.nouvelles.filter((t) => n(t) === 'interne').length,
    epargne: res.nouvelles.filter((t) => n(t) === 'epargne').length,
    aQualifier: res.aQualifier.length,
    inconnues: res.inconnues.length,
  };
}
