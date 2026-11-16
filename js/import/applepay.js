// applepay.js — paiements Apple Pay notés automatiquement.
// Un Raccourci iOS (automatisation « Quand je paie avec Cartes ») ajoute une ligne par paiement dans un fichier
// texte d'iCloud Drive. L'app lit ce fichier et propose d'ajouter les paiements qu'elle ne connaît pas encore.
//
// Format d'une ligne (version 1) :
//   AP1|<horodatage>|<montant>|<carte>|<nom>|<commerçant>
//   - horodatage « 2026-11-16T12:34:56+01:00 » (sans décalage : heure de Paris ; secondes facultatives)
//   - montant tel qu'affiché par Cartes (« 12,50 € », « USD 8.00 », « -4,00 € » pour un remboursement)
//   - commerçant en dernier : tout ce qui suit le 5e « | » lui appartient ; vide → le champ « nom ».
// Lignes vides et commentaires « # … » ignorés ; « AP2| » et plus : format plus récent que l'app.
//
// Fonctions pures (ni DOM ni base) : l'état, la journée de budget et l'heure sont passés en paramètres.

import { parseMontant } from '../money.js';
import { jourBudgetDeHorodatage, ajouterJours, diffJours } from '../dates.js';
import { normaliserTexte, normaliserMarchand, marchandProche, trierRegles, REGLES_DEFAUT } from '../rules.js';
import { categoriser, empreinte, nouvelId } from './pipeline.js';

export const FORMAT_LIGNE = 'AP1';
/** Montant jusqu'auquel un paiement est sans doute une vérification de carte (station, péage, hôtel…). */
export const SEUIL_VERIFICATION_CENTIMES = 100;

/**
 * Commerçants qui débitent d'abord une somme provisoire (pré-autorisation), corrigée ensuite par la banque :
 * stations, péages, parkings, hôtels, loueurs. Seulement des mots génériques et de grandes enseignes nationales.
 */
export const MOTS_PROVISOIRES = new RegExp([
  'STATIONS?', 'CARBURANTS?', 'ESSENCE', 'FUEL', 'AUTOROUTES?', 'PEAGES?', 'PARKING', 'HOTELS?', 'LOCATION', 'RENT', 'LOUEUR',
  'TOTAL ?ENERGIES', 'TOTAL ACCESS', 'ESSO', 'SHELL', 'AVIA', 'DYNEFF', 'AGIP',
  'VINCI', 'SANEF', 'APRR', 'ASF', 'ESCOTA', 'COFIROUTE', 'BIP ?& ?GO', 'ULYS',
  'INDIGO', 'EFFIA', 'SAEMES', 'ONEPARK', 'ZENPARK', 'Q-PARK',
  'HERTZ', 'AVIS', 'EUROPCAR', 'SIXT', 'ENTERPRISE', 'GETAROUND', 'UBEEQO', 'LEASYS',
  'IBIS', 'NOVOTEL', 'MERCURE', 'B&B HOTELS?', 'CAMPANILE', 'KYRIAD', 'PREMIERE CLASSE',
].map((m) => `(?:^|[^A-Z0-9])${m}(?=$|[^A-Z0-9])`).join('|'));

/** Catégories qu'un paiement « à vérifier » ne doit pas recevoir d'une règle par défaut (charge obligatoire par erreur). */
const GARDE_FOU_PROVISOIRE = new Set(['energie', 'telephonie']);

const DEVISES_SYMBOLES = [[/€/, 'EUR'], [/\$/, 'USD'], [/£/, 'GBP']];
const ESPACES_SPECIAUX = /[\u00A0\u202F\u2009\u2007]/g;

/**
 * Montant tel que l'affiche Cartes → centimes entiers (toujours positifs), sens et devise.
 * « 12,50 € », « €12.50 », « 1 234,56 € », « USD 8.00 », « -4,00 € » (remboursement → credit).
 * devise : 'EUR', un code à 3 lettres, ou '?' (aucune devise écrite). null si illisible.
 * @returns {{ centimes: number, sens: 'debit'|'credit', devise: string }|null}
 */
export function lireMontantApplePay(texte) {
  let s = String(texte ?? '').replace(ESPACES_SPECIAUX, ' ').replace(/\beuros?\b/gi, 'EUR').trim();
  if (!s) return null;
  let devise = '?';
  const code = s.match(/(?:^|[^A-Za-z])([A-Za-z]{3})(?=$|[^A-Za-z])/);
  if (code) { devise = code[1].toUpperCase(); s = s.replace(code[1], ' '); }
  for (const [re, d] of DEVISES_SYMBOLES) if (re.test(s)) { if (devise === '?') devise = d; s = s.replace(re, ' '); }
  s = s.trim();
  let sens = 'debit';
  if (/^[-−–]/.test(s)) { sens = 'credit'; s = s.replace(/^[-−–]\s*/, ''); } else s = s.replace(/^\+\s*/, '');
  if (!/^[0-9][0-9 .,]*$/.test(s)) return null;
  const centimes = parseMontant(s);
  if (centimes === null || centimes < 0) return null;
  return { centimes, sens, devise };
}

/** Horodatage d'un paiement → journée de budget (5 h – 5 h, Paris) et heure. Voir jourBudgetDeHorodatage. */
export function lireHorodatage(texte) { return jourBudgetDeHorodatage(texte); }

/** Horodatage stable pour l'empreinte : l'instant UTC s'il y a un décalage, sinon l'heure de Paris écrite. */
function horodatageNormalise(texte, lu) {
  if (lu.instant) return lu.secondes ? lu.instant.slice(0, 19) + 'Z' : lu.instant.slice(0, 16) + 'Z';
  const m = String(texte).trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?/);
  return `${m[1]}T${m[2]}${lu.secondes ? m[3] : ''}`;
}

/**
 * Une ligne du fichier.
 * statut : 'ok' | 'vide' | 'commentaire' | 'cassee' (raison) | 'devise' (autre devise que l'euro, jamais convertie)
 *        | 'sans-montant' (montant vide ou nul) | 'format-recent' (« AP2| »… : mets l'app à jour).
 */
export function analyserLigne(ligne) {
  const brute = String(ligne ?? '').replace(/^\uFEFF/, '').trim();
  if (!brute) return { statut: 'vide' };
  if (brute.startsWith('#')) return { statut: 'commentaire' };
  const champs = brute.split('|');
  const version = champs[0].trim().toUpperCase();
  const v = version.match(/^AP(\d+)$/);
  if (v && Number(v[1]) > 1) return { statut: 'format-recent', raison: 'Ligne d’une version plus récente du Raccourci : mets l’app à jour.' };
  if (version !== FORMAT_LIGNE) return { statut: 'cassee', raison: 'Ce n’est pas une ligne de paiement Apple Pay.' };
  if (champs.length < 5) return { statut: 'cassee', raison: 'Il manque des informations sur la ligne.' };
  const [, texteHeure, texteMontant, carte, nom] = champs.map((c) => c.trim());
  const commercant = (champs.slice(5).join('|').trim() || nom || '').replace(/\s+/g, ' ');
  const lu = jourBudgetDeHorodatage(texteHeure);
  if (!lu) return { statut: 'cassee', raison: 'Date ou heure illisible.' };
  const base = { date: lu.date, heure: lu.heure, horodatage: horodatageNormalise(texteHeure, lu), sansSecondes: !lu.secondes, carte: carte || '', nom: nom || '', commercant };
  if (!texteMontant) return { statut: 'sans-montant', ...base, centimes: null, sens: 'debit', devise: 'EUR' };
  const m = lireMontantApplePay(texteMontant);
  if (!m) return { statut: 'cassee', raison: 'Montant illisible.' };
  const devise = m.devise === '?' ? 'EUR' : m.devise;
  if (m.centimes === 0) return { statut: 'sans-montant', ...base, centimes: null, sens: m.sens, devise };
  return { statut: devise === 'EUR' ? 'ok' : 'devise', ...base, centimes: m.centimes, sens: m.sens, devise, ...(devise === 'EUR' ? {} : { montantDevise: texteMontant }) };
}

/** Hachage cyrb53 (synchrone, sans dépendance) → 14 caractères hexadécimaux. */
function cyrb53(texte, graine = 0) {
  let h1 = 0xdeadbeef ^ graine; let h2 = 0x41c6ce57 ^ graine;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x9E3779B1);
    h2 = Math.imul(h2 ^ c, 0x5F356495);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 0x85EBCA6B) ^ Math.imul(h2 ^ (h2 >>> 13), 0xC2B2AE35);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 0x85EBCA6B) ^ Math.imul(h1 ^ (h1 >>> 13), 0xC2B2AE35);
  return (0x100000000 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const cleEmpreinte = (p) => `${p.horodatage}|${p.centimes ?? ''}|${p.devise || 'EUR'}|${normaliserTexte(p.commercant)}`;

/**
 * Empreinte d'un paiement : horodatage normalisé | centimes | devise | commerçant normalisé (la carte n'entre pas :
 * renommer la carte dans Cartes ne fait pas revenir les paiements). occurrence : rang du même paiement dans la même
 * minute quand les secondes manquent (deux cafés à 8 h 02 = deux paiements).
 */
export function empreintePaiement(p, occurrence = 0) {
  return cyrb53(`${cleEmpreinte(p)}#${occurrence}`);
}

/**
 * Lit tout le fichier. Les paiements futurs (après demain) sont écartés ; deux lignes identiques avec secondes
 * ne comptent qu'une fois ; sans secondes, chaque ligne est un paiement (numéro d'occurrence).
 * @returns {{ paiements: Array, comptes: { lues, vides, cassees, devises, sansMontant, futures, doublesDansFichier, formatRecent }, erreurs: Array<{ numero, raison }> }}
 */
export function analyserFichier(texte, { auj }) {
  const comptes = { lues: 0, vides: 0, cassees: 0, devises: 0, sansMontant: 0, futures: 0, doublesDansFichier: 0, formatRecent: 0 };
  const erreurs = [];
  const paiements = [];
  const vus = new Map();
  const limite = ajouterJours(auj, 1);
  // Une ligne par paiement ; deux lignes collées (« …AP1|… ») sont séparées devant chaque « AP<n>| »
  const lignes = String(texte ?? '').replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)
    .flatMap((l, i) => l.split(/(?=AP\d+\|)/).map((morceau) => [morceau, i]));
  lignes.forEach(([ligne, i]) => {
    const a = analyserLigne(ligne);
    if (a.statut === 'vide' || a.statut === 'commentaire') { comptes.vides += 1; return; }
    comptes.lues += 1;
    if (a.statut === 'format-recent') { comptes.formatRecent += 1; erreurs.push({ numero: i + 1, raison: a.raison }); return; }
    if (a.statut === 'cassee') { comptes.cassees += 1; erreurs.push({ numero: i + 1, raison: a.raison }); return; }
    if (a.date > limite) { comptes.futures += 1; return; }
    const cle = cleEmpreinte(a);
    const rang = vus.get(cle) || 0;
    if (rang && !a.sansSecondes) { comptes.doublesDansFichier += 1; return; }
    vus.set(cle, rang + 1);
    if (a.statut === 'devise') comptes.devises += 1;
    if (a.statut === 'sans-montant') comptes.sansMontant += 1;
    paiements.push({ ...a, numero: i + 1, empreinte: empreintePaiement(a, a.sansSecondes ? rang : 0) });
  });
  return { paiements, comptes, erreurs };
}

/**
 * Paiement sans doute provisoire (le montant final arrivera avec le relevé) : station, péage, parking, hôtel, loueur,
 * un de tes mots (profil.applePay.motsProvisoires), ou une petite somme (≤ 1 €) qui ressemble à une vérification de carte.
 * @returns {{ provisoire: boolean, raison: 'mot-cle'|'verification-carte'|null }}
 */
export function estProvisoire(p, motsUtilisateur = []) {
  if (p.sens === 'credit') return { provisoire: false, raison: null };
  const nom = normaliserTexte(`${p.commercant || ''} ${p.nom && p.nom !== p.commercant ? p.nom : ''}`);
  if (MOTS_PROVISOIRES.test(nom)) return { provisoire: true, raison: 'mot-cle' };
  for (const m of motsUtilisateur || []) { const n = normaliserTexte(m); if (n && nom.includes(n)) return { provisoire: true, raison: 'mot-cle' }; }
  if (Number.isInteger(p.centimes) && p.centimes > 0 && p.centimes <= SEUIL_VERIFICATION_CENTIMES) return { provisoire: true, raison: 'verification-carte' };
  return { provisoire: false, raison: null };
}

/**
 * Compte d'une carte : ton choix enregistré (profil.applePay.cartes), sinon le compte dont la banque (ou le nom)
 * apparaît dans le nom de la carte, sinon le compte courant.
 */
export function compteDeCarte(carte, profilApplePay, comptes = []) {
  const choix = profilApplePay?.cartes?.[carte];
  if (choix && comptes.some((c) => c.id === choix)) return choix;
  const nomCarte = normaliserTexte(carte).replace(/[^A-Z0-9]+/g, ' ');
  if (nomCarte) {
    for (const c of comptes) {
      const noms = [c.banque && c.banque !== 'autre' ? c.banque : '', c.nom || ''].map((x) => normaliserTexte(x).replace(/[^A-Z0-9]+/g, ' ').trim()).filter((x) => x.length >= 3);
      if (noms.some((n) => ` ${nomCarte} `.includes(` ${n} `))) return c.id;
    }
  }
  const courant = comptes.find((c) => c.type === 'courant' && c.banque && c.banque !== 'autre') || comptes.find((c) => c.type === 'courant') || comptes[0];
  return courant?.id ?? null;
}

/** Catégorie la plus fréquente des opérations passées chez ce commerçant (hors « Autres »), ou null. */
export function categorieParHistorique(transactions, marchand) {
  const cible = normaliserTexte(marchand);
  if (!cible) return null;
  const n = new Map();
  for (const t of transactions || []) {
    if (t.ajustement || !t.categorie || ['autres', 'autres-entrees'].includes(t.categorie) || t.virementInterne?.estInterne || t.epargne?.estEpargne) continue;
    if (normaliserTexte(t.marchand) !== cible) continue;
    const x = n.get(t.categorie) || { nb: 0, dernier: '' };
    x.nb += 1; if ((t.date || '') > x.dernier) x.dernier = t.date || '';
    n.set(t.categorie, x);
  }
  let meilleur = null;
  for (const [cat, x] of n) if (!meilleur || x.nb > meilleur.nb || (x.nb === meilleur.nb && x.dernier > meilleur.dernier)) meilleur = { cat, ...x };
  return meilleur?.cat ?? null;
}

/**
 * Transaction prête à enregistrer (comme une saisie à la main, source 'applepay').
 * Classement : tes règles > règles par défaut > même commerçant dans ton historique > « à classer » (Autres).
 * Garde-fou : un paiement « à vérifier » classé Énergie ou Téléphonie par une règle par défaut reste « à classer ».
 * applePay.classement : 'regle' | 'defaut' | 'historique' | 'a-classer'.
 */
export function transactionDepuisPaiement(p, { compteId = null, regles = [], historique = [], maintenant, motsProvisoires = [] } = {}) {
  const commercant = p.commercant || p.nom || '';
  const normalise = commercant ? normaliserMarchand(commercant) : 'Inconnu';
  const marchand = normalise === 'Inconnu' ? (commercant || 'Apple Pay') : normalise;
  const prov = estProvisoire(p, motsProvisoires);
  // Heure du paiement quand elle est connue exactement (avec décalage) : les lignes d'un jour gardent leur ordre
  const instant = /Z$/.test(p.horodatage || '') ? new Date(p.horodatage) : null;
  const tx = {
    id: nouvelId('tx'), creeLe: instant && !Number.isNaN(instant.getTime()) ? instant.toISOString() : maintenant, modifieLe: maintenant,
    date: p.date, dateComptable: p.date, montantCentimes: p.centimes, sens: p.sens || 'debit',
    marchand, libelle: marchand, libellePrincipal: commercant || marchand, libelleBrut: commercant || marchand,
    categorie: null, compteId, source: 'applepay', articles: [], drapeaux: {},
    virementInterne: { estInterne: false, transactionLieeId: null }, epargne: { estEpargne: false, type: null },
    remboursementDe: null, pretId: null, chargeFixeId: null, importId: null, aQualifier: false, arrondiDesactive: false, sousLibelle: null,
    applePay: {
      empreinte: p.empreinte, horodatage: p.horodatage, heure: p.heure || null, carte: p.carte || '', commercant,
      montantInitialCentimes: p.centimes ?? null, devise: p.devise || 'EUR', ...(p.montantDevise ? { montantDevise: p.montantDevise } : {}),
      provisoire: prov.provisoire, raisonProvisoire: prov.raison, verifieLe: null, classement: 'a-classer',
    },
  };
  categoriser([tx], regles);
  const regle = tx.regleId ? trierRegles([...regles, ...REGLES_DEFAUT]).find((r) => r.id === tx.regleId) : null;
  if (regle) {
    tx.applePay.classement = regle.origine === 'defaut' ? 'defaut' : 'regle';
    if (prov.provisoire && regle.origine === 'defaut' && GARDE_FOU_PROVISOIRE.has(tx.categorie)) {
      tx.categorie = tx.sens === 'credit' ? 'autres-entrees' : 'autres';
      delete tx.regleId;
      tx.applePay.classement = 'a-classer';
    }
  } else {
    const cat = categorieParHistorique(historique, tx.marchand);
    if (cat) { tx.categorie = cat; tx.applePay.classement = 'historique'; }
  }
  tx.aQualifier = false;
  tx.empreinteDedoublonnage = empreinte(tx);
  return tx;
}

const SOURCES_SANS_SAISIE = new Set(['import', 'applepay', 'ajustement']);
const estMouvementBudget = (t) => !t.ajustement && !t.virementInterne?.estInterne && !t.epargne?.estEpargne;
const nomDe = (t) => [t.marchand, t.libelle, t.libellePrincipal].filter(Boolean);
const proche = (p, t) => nomDe(t).some((n) => marchandProche(p.commercant || p.nom || '', n));

/**
 * Que faire de chaque paiement du fichier ?
 *  - déjà vu (empreinte dans meta.applePayVues ou sur une opération) ou avant profil.applePay.depuis → ignoré (compté) ;
 *  - autre devise ou sans montant → aCompleter (jamais converti : tu tapes le montant en euros) ;
 *  - ligne de relevé déjà là (même sens, même montant, 1 jour avant à 4 jours après, nom proche) → dejaLa ;
 *    même chose sans nom proche → aConfirmer 'releve-sans-nom' ; paiement à vérifier dont le relevé a un autre
 *    montant (0 à 7 jours après, nom proche) → aConfirmer 'releve-montant' ;
 *  - saisie à la main du même jour (±1 jour entre 4 h et 6 h), même sens et montant → aConfirmer 'saisie-main'
 *    (jamais fusionné d'office ; une saisie ne répond qu'à un paiement) ;
 *  - sinon → aAjouter.
 * @param analyse  résultat d'analyserFichier
 * @param etat     { transactions, comptes, profil, reglesCategorie, meta }
 * @param options  { auj, vues (liste d'empreintes, par défaut etat.meta.applePayVues), maintenant }
 * @returns {{ aAjouter: Array<tx>, aConfirmer: Array<{ tx, existante, raison }>, dejaLa: Array<{ tx, existante }>,
 *             aCompleter: Array<{ tx, raison: 'devise'|'sans-montant' }>, ignorees: { dejaVues, avantDebut }, comptes }}
 */
export function planifierApplePay(analyse, etat, { auj, vues = null, maintenant = null } = {}) {
  const transactions = etat.transactions || [];
  const profilAP = etat.profil?.applePay || {};
  const dejaVues = new Set(vues || etat.meta?.applePayVues || []);
  for (const t of transactions) if (t.applePay?.empreinte) dejaVues.add(t.applePay.empreinte);
  const regles = etat.reglesCategorie || etat.regles || [];
  const instant = maintenant || `${auj}T12:00:00.000Z`;
  const plan = { aAjouter: [], aConfirmer: [], dejaLa: [], aCompleter: [], ignorees: { dejaVues: 0, avantDebut: 0 }, comptes: analyse.comptes };
  const prises = new Set();
  const libre = (t) => !prises.has(t.id) && !t.applePay?.empreinte && estMouvementBudget(t);
  for (const p of analyse.paiements || []) {
    if (dejaVues.has(p.empreinte)) { plan.ignorees.dejaVues += 1; continue; }
    if (profilAP.depuis && p.date < profilAP.depuis) { plan.ignorees.avantDebut += 1; continue; }
    dejaVues.add(p.empreinte);
    const tx = transactionDepuisPaiement(p, { compteId: compteDeCarte(p.carte, profilAP, etat.comptes || []), regles, historique: transactions, maintenant: instant, motsProvisoires: profilAP.motsProvisoires || [] });
    if (p.statut === 'devise' || p.statut === 'sans-montant' || !Number.isInteger(p.centimes)) { plan.aCompleter.push({ tx, raison: p.statut === 'devise' ? 'devise' : 'sans-montant' }); continue; }
    const tri = (a, b) => (proche(p, b) - proche(p, a)) || Math.abs(diffJours(p.date, a.date)) - Math.abs(diffJours(p.date, b.date));
    // Relevé déjà importé
    const releves = transactions.filter((t) => libre(t) && t.source === 'import' && t.sens === tx.sens && t.montantCentimes === tx.montantCentimes
      && diffJours(p.date, t.date) >= -1 && diffJours(p.date, t.date) <= 4).sort(tri);
    if (releves.length) {
      const existante = releves[0];
      prises.add(existante.id);
      if (proche(p, existante)) plan.dejaLa.push({ tx, existante });
      else plan.aConfirmer.push({ tx, existante, raison: 'releve-sans-nom' });
      continue;
    }
    if (tx.applePay.provisoire) {
      const corrige = transactions.filter((t) => libre(t) && t.source === 'import' && t.sens === tx.sens && diffJours(p.date, t.date) >= 0 && diffJours(p.date, t.date) <= 7 && proche(p, t)).sort(tri)[0];
      if (corrige) { prises.add(corrige.id); plan.aConfirmer.push({ tx, existante: corrige, raison: 'releve-montant' }); continue; }
    }
    // Saisie à la main
    const h = Number(String(p.heure || '12').slice(0, 2));
    const ecart = h >= 4 && h < 6 ? 1 : 0;
    const saisie = transactions.filter((t) => libre(t) && !SOURCES_SANS_SAISIE.has(t.source) && t.sens === tx.sens && t.montantCentimes === tx.montantCentimes
      && Math.abs(diffJours(p.date, t.date)) <= ecart).sort(tri)[0];
    if (saisie) { prises.add(saisie.id); plan.aConfirmer.push({ tx, existante: saisie, raison: 'saisie-main' }); continue; }
    plan.aAjouter.push(tx);
  }
  return plan;
}

const NOMS_VIDES = /^(d[ée]pense|entr[ée]e|inconnu)$/i;

/**
 * Le paiement Apple Pay complète ta saisie : catégorie, montant et libellé de la saisie gardés ;
 * on ajoute la trace Apple Pay et le commerçant s'il manquait.
 */
export function fusionnerPaiementDansSaisie(existante, tx) {
  const sansNom = !existante.marchand || NOMS_VIDES.test(String(existante.marchand).trim());
  const res = { ...existante, applePay: { ...tx.applePay }, modifieLe: tx.modifieLe || existante.modifieLe };
  if (sansNom) {
    res.marchand = tx.marchand;
    if (!existante.libelle || NOMS_VIDES.test(String(existante.libelle).trim())) res.libelle = tx.libelle;
    res.empreinteDedoublonnage = empreinte(res);
  }
  return res;
}
