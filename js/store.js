// store.js — état de l'app en mémoire, persistance IndexedDB et notifications de changement.

import * as db from './db.js';
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
  arrondi: { actif: true, frequence: 'hebdomadaire', jourVirement: 4, jourDuMois: 6, inclureChargesFixes: false, depuis: null, premierVirement: null, pocheId: 'poche-coussin' },
  regleRevolut: { actif: true, minCentimes: 1000, maxCentimes: 1800 },
  emetteursSalaire: [],
  parametresPlan: {},
  repartitionVoiturePret: 50,
};

export const PARAMETRES_DEFAUT = {
  cle: 'parametres',
  theme: 'auto',
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
  if (planifie) return;
  planifie = true;
  queueMicrotask(() => { planifie = false; for (const fn of ecouteurs) { try { fn(raison); } catch (e) { console.error(e); } } });
}

const maintenant = () => new Date().toISOString();

/** Crée les objets par défaut au premier lancement (comptes, poches génériques). */
function initialiserDefauts() {
  const m = maintenant();
  if (!etat.comptes.length) {
    etat.comptes = [
      { id: 'courant', nom: 'Compte courant', type: 'courant', banque: 'autre', soldeInitialCentimes: 0, dateSoldeInitial: null, soldeReference: null, creeLe: m, modifieLe: m },
      { id: 'especes', nom: 'Espèces', type: 'especes', banque: 'autre', soldeInitialCentimes: 0, dateSoldeInitial: null, soldeReference: null, creeLe: m, modifieLe: m },
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

/** Charge tout l'état depuis IndexedDB. */
export async function charger() {
  await db.ouvrirBase();
  const [profil, parametres, meta] = await Promise.all([db.lireUn('profil', 'profil'), db.lireUn('parametres', 'parametres'), db.lireTout('meta')]);
  etat.profil = { ...PROFIL_DEFAUT, ...(profil || {}), arrondi: { ...PROFIL_DEFAUT.arrondi, ...(profil?.arrondi || {}) }, regleRevolut: { ...PROFIL_DEFAUT.regleRevolut, ...(profil?.regleRevolut || {}) } };
  etat.parametres = { ...PARAMETRES_DEFAUT, ...(parametres || {}), onboarding: { ...PARAMETRES_DEFAUT.onboarding, ...(parametres?.onboarding || {}) } };
  etat.meta = Object.fromEntries((meta || []).map((x) => [x.cle, x.valeur]));
  const listes = await Promise.all(COLLECTIONS.map((c) => db.lireTout(c)));
  COLLECTIONS.forEach((c, i) => { etat[c] = listes[i] || []; });
  const ops = initialiserDefauts();
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
  for (const { collection, valeur, supprimer: suppr } of elements) {
    const cle = CLE[collection] || 'id';
    if (suppr) {
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
  await db.ecrireLot(ops);
  notifier('lot');
}

export async function supprimerObjet(collection, cleValeur) {
  const cle = CLE[collection] || 'id';
  etat[collection] = etat[collection].filter((x) => x[cle] !== cleValeur);
  await db.supprimer(collection, cleValeur);
  notifier(collection);
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

export async function ecrireMeta(cle, valeur) {
  etat.meta[cle] = valeur;
  await db.ecrire('meta', { cle, valeur });
}

/** Remplace toutes les données par un contenu de sauvegarde (secrets locaux conservés). */
export async function remplacerTout(contenu) {
  const secrets = { cleGemini: etat.parametres.cleGemini, pinHash: etat.parametres.pinHash, pinSel: etat.parametres.pinSel, pinIterations: etat.parametres.pinIterations };
  await db.vider([...COLLECTIONS, 'profil', 'parametres']);
  const ops = [];
  for (const c of COLLECTIONS) {
    etat[c] = Array.isArray(contenu[c]) ? contenu[c] : [];
    for (const v of etat[c]) ops.push({ store: c, valeur: v });
  }
  etat.profil = { ...PROFIL_DEFAUT, ...(contenu.profil || {}), cle: 'profil' };
  etat.parametres = { ...PARAMETRES_DEFAUT, ...(contenu.parametres || {}), ...Object.fromEntries(Object.entries(secrets).filter(([, v]) => v)), cle: 'parametres' };
  ops.push({ store: 'profil', valeur: etat.profil }, { store: 'parametres', valeur: etat.parametres });
  ops.push(...initialiserDefauts());
  etat.meta.jauge = null;
  ops.push({ store: 'meta', valeur: { cle: 'jauge', valeur: null } });
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
