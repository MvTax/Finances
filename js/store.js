// store.js — état de l'app en mémoire, persistance IndexedDB et notifications de changement.

import * as db from './db.js';
import { datesDeSalaire, periodeBudget } from './calculs.js';
import { aujourdhui, HEURE_DEBUT_JOUR } from './dates.js';
import { tousLesStores, SCHEMA_VERSION } from './migrations.js';
import { nouvelId } from './import/pipeline.js';

const COLLECTIONS = Object.keys(tousLesStores()).filter((k) => !['meta', 'profil', 'parametres'].includes(k));
const CLE = { revenusMensuels: 'mois', planMensuel: 'mois', joursSansDepense: 'date', checkins: 'date' };

export const PROFIL_DEFAUT = {
  cle: 'profil',
  prenomAffichage: '',
  nomTitulaire: '',
  jourSalaireHabituel: 1,
  loyerAPayerCentimes: 0,
  loyerBrutCentimes: null,
  aideLogementCentimes: null,
  jourLoyer: null,
  heuresMensuelles: 151.67,
  objectifEpargneCentimes: 0,
  arrondi: { actif: true, frequence: 'hebdomadaire', jourVirement: 4, jourDuMois: 6, inclureChargesFixes: false, depuis: null, premierVirement: null, pocheId: 'partage' },
  regleRevolut: { actif: true, minCentimes: 1000, maxCentimes: 1800 },
  emetteursSalaire: [],
  parametresPlan: {},
  repartitionVoiturePret: 50,
  // Repas à la maison épargnés automatiquement (2 par jour) : « depuis » est fixé au premier lancement
  repasAuto: { actif: true, depuis: null, repasParJour: 2 },
};

export const PARAMETRES_DEFAUT = {
  cle: 'parametres',
  theme: 'auto',
  style: 'classique',
  mode100Local: false,
  modeleGemini: null,
  cleGemini: '',
  masquageMontants: false,
  derniereSauvegarde: null,
  onboarding: { termine: false, etape: 0, prerempli: false },
  commissionInterventionCentimes: 800,
  tauxLivretA: 1.7,
  tauxLEP: 2.5,
  plafondLEPCentimes: 1000000,
  appelsIA: { date: null, nb: 0 },
  fonctionnalitesV2: { gamelle: false, radarVente: false, joursSansDepense: false, freinAchat: false, modeRayon: false, antiCraquage: false, checkinSoir: false, bilanDimanche: false },
};

export const etat = { profil: { ...PROFIL_DEFAUT }, parametres: { ...PARAMETRES_DEFAUT }, meta: {} };
for (const c of COLLECTIONS) etat[c] = [];

const ecouteurs = new Set();
export function surChangement(fn) { ecouteurs.add(fn); return () => ecouteurs.delete(fn); }
let planifie = false;
export function notifier(raison = 'change') {
  majDatesSalaire();
  if (planifie) return;
  planifie = true;
  queueMicrotask(() => { planifie = false; majDatesSalaire(); for (const fn of ecouteurs) { try { fn(raison); } catch (e) { console.error(e); } } });
}

/** Le mois budgétaire va d'un salaire réel au suivant : les dates sont recalculées à chaque changement. */
function majDatesSalaire() { etat.profil.datesSalaire = datesDeSalaire(etat); }

const maintenant = () => new Date().toISOString();

/** Crée les objets par défaut au premier lancement (comptes, poches génériques). */
function initialiserDefauts() {
  const m = maintenant();
  if (!etat.comptes.length) {
    etat.comptes = [
      { id: 'courant', nom: 'Compte courant', type: 'courant', banque: 'autre', soldeInitialCentimes: 0, dateSoldeInitial: null, soldeReference: null, creeLe: m, modifieLe: m },
    ];
  }
  if (!etat.poches.length) {
    etat.poches = [
      { id: 'poche-coussin', nom: 'Coussin de sécurité', type: 'coussin', cibleCentimes: 100000, priorite: 1, partRepartition: null, soldeInitialCentimes: 0, mouvements: [], compteSupport: 'Livret A', tauxAnnuel: null, actif: true, creeLe: m, modifieLe: m },
      { id: 'poche-projet', nom: 'Projet', type: 'projet', cibleCentimes: 200000, priorite: 2, partRepartition: 50, soldeInitialCentimes: 0, mouvements: [], compteSupport: 'Livret A', tauxAnnuel: null, actif: true, creeLe: m, modifieLe: m },
      { id: 'poche-pret', nom: 'Remboursement anticipé', type: 'remboursementAnticipe', cibleCentimes: null, palierCentimes: 50000, priorite: 2, partRepartition: 50, soldeInitialCentimes: 0, mouvements: [], compteSupport: 'Livret A', tauxAnnuel: null, actif: false, creeLe: m, modifieLe: m },
    ];
  }
  return [
    ...etat.comptes.map((v) => ({ store: 'comptes', valeur: v })),
    ...etat.poches.map((v) => ({ store: 'poches', valeur: v })),
  ];
}

/**
 * Dès qu'un vrai compte bancaire existe, les comptes génériques créés au démarrage (« Compte courant », « Espèces »)
 * disparaissent : leurs opérations passent sur le compte bancaire principal (sans doublon à ±3 jours),
 * et tout ce qui y était rattaché (charges, virements…) aussi.
 * @returns {Array} opérations d'écriture à passer à db.ecrireLot
 */
export function rangerComptes() {
  const principal = etat.comptes.find((c) => c.type === 'courant' && c.banque && c.banque !== 'autre');
  if (!principal) return [];
  // Seuls les comptes créés d'office (ids « courant » et « especes ») : un compte ajouté à la main reste.
  const generiques = etat.comptes.filter((c) => (c.id === 'courant' || c.id === 'especes') && c.id !== principal.id && (!c.banque || c.banque === 'autre'));
  if (!generiques.length) return [];
  const ids = new Set(generiques.map((c) => c.id));
  const ops = [];
  const jours = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  const gardees = [];
  for (const t of etat.transactions) {
    if (!ids.has(t.compteId)) { gardees.push(t); continue; }
    const doublon = t.ajustement || etat.transactions.some((x) => x.compteId === principal.id && x.sens === t.sens && x.montantCentimes === t.montantCentimes && jours(x.date, t.date) <= 3);
    if (doublon) { ops.push({ store: 'transactions', supprimer: true, cle: t.id }); continue; }
    const v = { ...t, compteId: principal.id, modifieLe: maintenant() };
    gardees.push(v);
    ops.push({ store: 'transactions', valeur: v });
  }
  etat.transactions = gardees;
  // Le loyer saisi au démarrage sur le compte par défaut fait doublon avec celui du compte bancaire
  const loyerBanque = etat.chargesFixes.some((c) => c.actif !== false && c.estLoyer && !ids.has(c.compteId));
  if (loyerBanque) {
    const doublons = etat.chargesFixes.filter((c) => c.estLoyer && ids.has(c.compteId));
    for (const c of doublons) ops.push({ store: 'chargesFixes', supprimer: true, cle: c.id });
    etat.chargesFixes = etat.chargesFixes.filter((c) => !doublons.includes(c));
  }
  for (const c of COLLECTIONS) {
    if (c === 'transactions' || c === 'comptes') continue;
    etat[c] = (etat[c] || []).map((o) => {
      if (!o || !ids.has(o.compteId)) return o;
      const v = { ...o, compteId: principal.id };
      ops.push({ store: c, valeur: v });
      return v;
    });
  }
  etat.comptes = etat.comptes.filter((c) => !ids.has(c.id));
  for (const c of generiques) ops.push({ store: 'comptes', supprimer: true, cle: c.id });
  return ops;
}

/** Épargne automatique des repas : démarre le jour où elle est découverte, jamais rétroactivement. @returns true si le profil a changé */
function assurerRepasAuto() {
  const avant = JSON.stringify(etat.profil.repasAuto || null);
  etat.profil.repasAuto = { ...PROFIL_DEFAUT.repasAuto, ...(etat.profil.repasAuto || {}) };
  if (etat.profil.repasAuto.actif && !etat.profil.repasAuto.depuis) etat.profil.repasAuto.depuis = maintenant().slice(0, 10);
  return JSON.stringify(etat.profil.repasAuto) !== avant;
}

/**
 * Une seule fois : l'épargne se limite à deux poches, Sécurité et le remboursement du prêt.
 * Dès qu'un prêt amortissable existe : la poche du prêt est activée (ou créée) et reliée au prêt, les poches
 * « projet » vides sont supprimées (une poche projet avec de l'argent est gardée), répartition 50/50,
 * arrondis, repas et privations vers le prêt.
 * @returns {Array} opérations d'écriture
 */
export function rangerPoches() {
  if (etat.meta.pochesRangees) return [];
  const credit = (etat.creditsBancaires || []).find((c) => c.type === 'amortissable' && c.actif !== false && c.capitalCentimes);
  if (!credit) return [];
  const ops = [];
  const m = maintenant();
  const solde = (p) => (p.soldeInitialCentimes || 0) + (p.mouvements || []).reduce((s, x) => s + (x.sens === 'versement' ? x.montantCentimes : -x.montantCentimes), 0);
  for (const p of etat.poches.filter((x) => x.type === 'projet' && !solde(x) && !(x.mouvements || []).length)) ops.push({ store: 'poches', supprimer: true, cle: p.id });
  const supprimees = new Set(ops.map((o) => o.cle));
  etat.poches = etat.poches.filter((p) => !supprimees.has(p.id));
  const nomPret = `Prêt ${Math.round(credit.capitalCentimes / 100).toLocaleString('fr-FR')} €`;
  let pret = etat.poches.find((p) => p.type === 'remboursementAnticipe');
  pret = { ...(pret || { id: 'poche-pret', type: 'remboursementAnticipe', soldeInitialCentimes: 0, mouvements: [], palierCentimes: 50000, creeLe: m }),
    nom: pret && pret.actif !== false && !/^Remboursement anticipé$/.test(pret.nom) ? pret.nom : nomPret, cibleCentimes: credit.capitalCentimes, creditId: credit.id,
    priorite: 1, partRepartition: 50, actif: true, compteSupport: pret?.compteSupport || 'Compte épargne sans intérêts', tauxAnnuel: pret?.tauxAnnuel ?? 0, modifieLe: m };
  const secu = etat.poches.find((p) => p.type === 'coussin');
  const autres = etat.poches.filter((p) => p.id !== pret.id && p.id !== secu?.id);
  etat.poches = [...(secu ? [{ ...secu, priorite: 2, partRepartition: 50, modifieLe: m }] : []), pret, ...autres];
  for (const p of etat.poches) if (p.id === pret.id || p.id === secu?.id) ops.push({ store: 'poches', valeur: p });
  // Arrondis, repas et privations : partagés entre les deux épargnes (sauf choix déjà fait d'une poche encore active)
  if (etat.profil.arrondi?.pocheId !== 'partage' && !etat.poches.some((p) => p.id === etat.profil.arrondi?.pocheId && p.actif !== false && p.type !== 'projet')) etat.profil.arrondi = { ...etat.profil.arrondi, pocheId: 'partage' };
  ops.push({ store: 'profil', valeur: etat.profil });
  etat.meta.pochesRangees = m;
  ops.push({ store: 'meta', valeur: { cle: 'pochesRangees', valeur: m } });
  return ops;
}

/**
 * Une seule fois : arrondis, repas et privations partagés entre les deux épargnes (comme l'épargne du mois),
 * au lieu d'aller tous sur une seule poche. Réglable ensuite dans « Mon système d'épargne ».
 */
export function partagerEfforts() {
  if (etat.meta.effortsPartages) return [];
  const m = maintenant();
  etat.profil.arrondi = { ...etat.profil.arrondi, pocheId: 'partage' };
  etat.meta.effortsPartages = m;
  return [{ store: 'profil', valeur: etat.profil }, { store: 'meta', valeur: { cle: 'effortsPartages', valeur: m } }];
}

/**
 * Une seule fois : où est rangée chaque épargne. Avec un compte LCL et un compte Revolut :
 * la Sécurité est sur le compte Revolut, la poche du prêt sur le Livret A LCL.
 */
export function placerEpargnes() {
  if (etat.meta.supportsEpargne) return [];
  const banques = new Set((etat.comptes || []).map((c) => c.banque || (/revolut/i.test(c.nom) ? 'revolut' : /lcl/i.test(c.nom) ? 'lcl' : null)));
  if (!banques.has('lcl') || !banques.has('revolut')) return [];
  const m = maintenant();
  const ops = [];
  etat.poches = etat.poches.map((p) => {
    const support = p.actif === false ? null : p.type === 'coussin' ? 'Revolut' : p.type === 'remboursementAnticipe' ? 'Livret A LCL' : null;
    if (!support || p.compteSupport === support) return p;
    const q = { ...p, compteSupport: support, tauxAnnuel: 0, modifieLe: m };
    ops.push({ store: 'poches', valeur: q });
    return q;
  });
  etat.meta.supportsEpargne = m;
  ops.push({ store: 'meta', valeur: { cle: 'supportsEpargne', valeur: m } });
  return ops;
}

/**
 * Une seule fois : les dépenses notées entre minuit et 5 h du matin appartiennent à la veille (la journée de budget
 * commence à 5 h). Avant la 1.37.1, elles étaient datées du nouveau jour et comptaient dans sa part.
 * Seules les saisies dont la date n'a pas été changée à la main (date = jour calendaire de la saisie) sont recalées.
 */
export function recalerSaisiesNuit() {
  if (etat.meta.saisiesNuitRecalees) return [];
  const m = maintenant();
  etat.meta.saisiesNuitRecalees = m;
  const ops = [{ store: 'meta', valeur: { cle: 'saisiesNuitRecalees', valeur: m } }];
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const manuelles = new Set(['saisie', 'manuel', 'texte', 'voix', 'phrase', 'photo', 'capture', 'express', 'clavier', 'ia']);
  etat.transactions = etat.transactions.map((t) => {
    if (!t.creeLe || !manuelles.has(t.source)) return t;
    const p = Object.fromEntries(fmt.formatToParts(new Date(t.creeLe)).map((x) => [x.type, x.value]));
    const jourCal = `${p.year}-${p.month}-${p.day}`;
    if (Number(p.hour) >= HEURE_DEBUT_JOUR || t.date !== jourCal) return t;
    const veille = new Date(`${jourCal}T12:00:00Z`); veille.setUTCDate(veille.getUTCDate() - 1);
    const d = veille.toISOString().slice(0, 10);
    const v = { ...t, date: d, dateComptable: t.dateComptable === t.date ? d : t.dateComptable, modifieLe: m };
    ops.push({ store: 'transactions', valeur: v });
    return v;
  });
  return ops;
}

/**
 * Une seule fois : la première envie, GTA 6 à 79,99 € (sortie le 19 novembre 2026), comptée depuis le salaire du mois.
 * Si une envie existe déjà, rien n'est ajouté ; supprimée ensuite, elle ne revient pas.
 */
export function amorcerEnvies() {
  if (etat.meta.enviesAmorcees || !etat.parametres.onboarding?.termine) return [];
  const m = maintenant();
  etat.meta.enviesAmorcees = m;
  const ops = [{ store: 'meta', valeur: { cle: 'enviesAmorcees', valeur: m } }];
  if ((etat.profil.envies?.liste || []).length) return ops;
  const auj = aujourdhui();
  etat.profil = { ...etat.profil, envies: { depuis: etat.profil.envies?.depuis || periodeBudget(auj, etat.profil).debut,
    liste: [{ id: 'envie-gta6', nom: 'GTA 6', type: 'jeu', montantCentimes: 7999, sortieLe: '2026-11-19', creeLe: auj, achat: null }] } };
  ops.push({ store: 'profil', valeur: etat.profil });
  return ops;
}

/** Charge tout l'état depuis IndexedDB. */
export async function charger() {
  await db.ouvrirBase();
  const [profil, parametres, meta] = await Promise.all([db.lireUn('profil', 'profil'), db.lireUn('parametres', 'parametres'), db.lireTout('meta')]);
  etat.profil = { ...PROFIL_DEFAUT, ...(profil || {}), arrondi: { ...PROFIL_DEFAUT.arrondi, ...(profil?.arrondi || {}) }, regleRevolut: { ...PROFIL_DEFAUT.regleRevolut, ...(profil?.regleRevolut || {}) } };
  etat.parametres = { ...PARAMETRES_DEFAUT, ...(parametres || {}), onboarding: { ...PARAMETRES_DEFAUT.onboarding, ...(parametres?.onboarding || {}) } };
  etat.meta = Object.fromEntries((meta || []).map((x) => [x.cle, x.valeur]));
  const listes = await Promise.all(COLLECTIONS.map((c) => db.lireTout(c)));
  COLLECTIONS.forEach((c, i) => { etat[c] = listes[i] || []; });
  // Anciennes règles importées avec un cache « _re » devenu un objet vide : nettoyées une fois pour toutes
  const abimees = (etat.reglesCategorie || []).filter((r) => '_re' in r);
  for (const r of abimees) delete r._re;
  const ops = initialiserDefauts();
  ops.push(...rangerComptes());
  if (assurerRepasAuto()) ops.push({ store: 'profil', valeur: etat.profil });
  ops.push(...rangerPoches());
  ops.push(...partagerEfforts());
  ops.push(...placerEpargnes());
  ops.push(...amorcerEnvies());
  ops.push(...recalerSaisiesNuit());
  for (const r of abimees) ops.push({ store: 'reglesCategorie', valeur: r });
  if (!profil) ops.push({ store: 'profil', valeur: etat.profil });
  if (!parametres) ops.push({ store: 'parametres', valeur: etat.parametres });
  const hist = db.migrationsDeCetteSession();
  if (hist.length) ops.push({ store: 'meta', valeur: { cle: 'migrations', valeur: [...(etat.meta.migrations || []), ...hist] } });
  ops.push({ store: 'meta', valeur: { cle: 'schemaVersion', valeur: SCHEMA_VERSION } });
  await db.ecrireLot(ops);
  etat.meta.schemaVersion = SCHEMA_VERSION;
  notifier('chargement');
  return etat;
}

function cleDe(collection, obj) { return obj[CLE[collection] || 'id']; }

/** Ajoute ou remplace un objet dans une collection. */
export async function enregistrer(collection, obj, { silencieux = false } = {}) {
  const m = maintenant();
  const cle = CLE[collection] || 'id';
  if (!obj[cle]) obj[cle] = nouvelId(collection);
  obj.creeLe = obj.creeLe || m;
  obj.modifieLe = m;
  const liste = etat[collection];
  const i = liste.findIndex((x) => cleDe(collection, x) === obj[cle]);
  if (i >= 0) liste[i] = obj; else liste.push(obj);
  await db.ecrire(collection, obj);
  if (!silencieux) notifier(collection);
  return obj;
}

/** Enregistre plusieurs objets (une seule transaction IndexedDB). */
export async function enregistrerLot(elements) {
  const m = maintenant();
  const ops = [];
  const supprimes = [];
  for (const { collection, valeur, supprimer: suppr } of elements) {
    const cle = CLE[collection] || 'id';
    if (suppr) {
      const avant = etat[collection].find((x) => x[cle] === valeur[cle]);
      if (avant) supprimes.push({ collection, objet: avant });
      etat[collection] = etat[collection].filter((x) => x[cle] !== valeur[cle]);
      ops.push({ store: collection, supprimer: true, cle: valeur[cle] });
      continue;
    }
    if (!valeur[cle]) valeur[cle] = nouvelId(collection);
    valeur.creeLe = valeur.creeLe || m;
    valeur.modifieLe = m;
    const i = etat[collection].findIndex((x) => x[cle] === valeur[cle]);
    if (i >= 0) etat[collection][i] = valeur; else etat[collection].push(valeur);
    ops.push({ store: collection, valeur });
  }
  ops.push(...rangerComptes());
  await db.ecrireLot(ops);
  if (supprimes.length) await memoriserSuppressions(supprimes);
  notifier('lot');
}

export async function supprimerObjet(collection, cleValeur) {
  const cle = CLE[collection] || 'id';
  const avant = etat[collection].find((x) => x[cle] === cleValeur);
  etat[collection] = etat[collection].filter((x) => x[cle] !== cleValeur);
  await db.supprimer(collection, cleValeur);
  if (avant) await memoriserSuppressions([{ collection, objet: avant }]);
  notifier(collection);
}

/** Mémorise les objets supprimés (identifiant + clé naturelle) : une mise à jour depuis le fichier ne les recrée pas. */
async function memoriserSuppressions(liste) {
  const { cleNaturelle } = await import('./miseajour.js');
  const s = structuredClone(etat.meta.supprimes || {});
  for (const { collection, objet } of liste) {
    const cle = CLE[collection] || 'id';
    const t = s[collection] || (s[collection] = { ids: [], naturelles: [] });
    t.ids.push(objet[cle]);
    const n = cleNaturelle(collection, objet);
    if (n) t.naturelles.push(`${n}#0`);
    t.ids = t.ids.slice(-3000); t.naturelles = t.naturelles.slice(-3000);
  }
  etat.meta.supprimes = s;
  await db.ecrire('meta', { cle: 'supprimes', valeur: s });
}

/**
 * Applique une mise à jour calculée par planifierMiseAJour (miseajour.js) : écrit les objets TELS QUELS
 * (sans changer leur date de modification, pour reconnaître plus tard ce qui vient du fichier).
 */
export async function appliquerMiseAJour(plan, { estampille, baseProfil, baseParametres, bases }) {
  const ops = [];
  for (const { collection, cle: v } of plan.suppressions) {
    const cle = CLE[collection] || 'id';
    etat[collection] = etat[collection].filter((x) => x[cle] !== v);
    ops.push({ store: collection, supprimer: true, cle: v });
  }
  for (const { collection, valeur } of plan.ecritures) {
    const cle = CLE[collection] || 'id';
    const i = etat[collection].findIndex((x) => x[cle] === valeur[cle]);
    if (i >= 0) etat[collection][i] = valeur; else etat[collection].push(valeur);
    ops.push({ store: collection, valeur });
  }
  etat.profil = { ...plan.profil, cle: 'profil' };
  assurerRepasAuto();
  etat.parametres = { ...plan.parametres, cle: 'parametres' };
  ops.push({ store: 'profil', valeur: etat.profil }, { store: 'parametres', valeur: etat.parametres });
  ops.push(...rangerComptes());
  const estampilles = [...new Set([...(etat.meta.estampillesFichier || []), estampille].filter(Boolean))];
  const meta = { estampillesFichier: estampilles, baseProfil, baseParametres, baseFichier: bases || null, derniereMiseAJour: { le: maintenant(), totaux: plan.totaux }, jauge: null };
  for (const [k, v] of Object.entries(meta)) { etat.meta[k] = v; ops.push({ store: 'meta', valeur: { cle: k, valeur: v } }); }
  await db.ecrireLot(ops);
  notifier('miseAJour');
}

export async function majProfil(partiel) {
  etat.profil = { ...etat.profil, ...partiel, cle: 'profil', modifieLe: maintenant() };
  await db.ecrire('profil', etat.profil);
  notifier('profil');
}

export async function majParametres(partiel) {
  etat.parametres = { ...etat.parametres, ...partiel, cle: 'parametres' };
  await db.ecrire('parametres', etat.parametres);
  notifier('parametres');
}

/** L'instantané de la jauge est recalculé après un changement de fond (restauration, revenus, import). */
export async function reinitialiserJauge() { if (etat.meta.jauge) await ecrireMeta('jauge', null); }

export async function ecrireMeta(cle, valeur, { avertir = false } = {}) {
  etat.meta[cle] = valeur;
  await db.ecrire('meta', { cle, valeur });
  if (avertir) notifier('meta');
}

/** Remplace toutes les données par un contenu de sauvegarde (secrets locaux conservés). */
export async function remplacerTout(contenu) {
  const secrets = { cleGemini: etat.parametres.cleGemini, pinHash: etat.parametres.pinHash, pinSel: etat.parametres.pinSel, pinIterations: etat.parametres.pinIterations, motDePasseSauvegarde: etat.parametres.motDePasseSauvegarde };
  await db.vider([...COLLECTIONS, 'profil', 'parametres']);
  const ops = [];
  for (const c of COLLECTIONS) {
    etat[c] = Array.isArray(contenu[c]) ? contenu[c] : [];
    for (const v of etat[c]) ops.push({ store: c, valeur: v });
  }
  etat.profil = { ...PROFIL_DEFAUT, ...(contenu.profil || {}), cle: 'profil' };
  assurerRepasAuto();
  etat.parametres = { ...PARAMETRES_DEFAUT, ...(contenu.parametres || {}), ...Object.fromEntries(Object.entries(secrets).filter(([, v]) => v)), cle: 'parametres' };
  ops.push({ store: 'profil', valeur: etat.profil }, { store: 'parametres', valeur: etat.parametres });
  ops.push(...initialiserDefauts());
  ops.push(...rangerComptes());
  etat.meta.jauge = null;
  ops.push({ store: 'meta', valeur: { cle: 'jauge', valeur: null } });
  const { basesDepuisContenu } = await import('./miseajour.js');
  for (const [k, v] of Object.entries({ baseProfil: contenu.profil || null, baseParametres: contenu.parametres || null, baseFichier: basesDepuisContenu(contenu), supprimes: {} })) { etat.meta[k] = v; ops.push({ store: 'meta', valeur: { cle: k, valeur: v } }); }
  await db.ecrireLot(ops);
  notifier('restauration');
}

/** Efface tout (double confirmation gérée par l'interface). */
export async function effacerTout() {
  await db.supprimerBase();
  for (const c of COLLECTIONS) etat[c] = [];
  etat.profil = { ...PROFIL_DEFAUT };
  etat.parametres = { ...PARAMETRES_DEFAUT };
  etat.meta = {};
}

export { COLLECTIONS, nouvelId };
