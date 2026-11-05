// db.js — petit wrapper IndexedDB à base de promesses (transactions, index, lots).

import { SCHEMA_VERSION, appliquerSchema } from './migrations.js';

const NOM_BASE = 'budget';

function promesse(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function finTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
    tx.onerror = () => reject(tx.error);
  });
}

let instance = null;
let historiqueMigrations = [];

/** Ouvre (et migre si besoin) la base. */
export function ouvrirBase() {
  if (instance) return Promise.resolve(instance);
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('Stockage IndexedDB indisponible sur cet appareil.'));
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOM_BASE, SCHEMA_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const crees = appliquerSchema(db, req.transaction, e.oldVersion, e.newVersion);
      historiqueMigrations.push({ de: e.oldVersion, vers: e.newVersion, le: new Date().toISOString(), storesCrees: crees });
    };
    req.onblocked = () => reject(new Error('La base est ouverte dans un autre onglet : ferme-le puis réessaie.'));
    req.onsuccess = () => {
      instance = req.result;
      instance.onversionchange = () => { instance.close(); instance = null; };
      resolve(instance);
    };
    req.onerror = () => reject(req.error);
  });
}

export function migrationsDeCetteSession() { return historiqueMigrations; }

export async function lireTout(store) {
  const db = await ouvrirBase();
  return promesse(db.transaction(store, 'readonly').objectStore(store).getAll());
}

export async function lireUn(store, cle) {
  const db = await ouvrirBase();
  return promesse(db.transaction(store, 'readonly').objectStore(store).get(cle));
}

export async function parIndex(store, index, valeur) {
  const db = await ouvrirBase();
  return promesse(db.transaction(store, 'readonly').objectStore(store).index(index).getAll(valeur));
}

export async function ecrire(store, valeur) {
  const db = await ouvrirBase();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(valeur);
  return finTransaction(tx);
}

/** Écrit plusieurs objets (éventuellement dans plusieurs stores) dans UNE transaction atomique. */
export async function ecrireLot(operations) {
  const db = await ouvrirBase();
  const stores = [...new Set(operations.map((o) => o.store))];
  if (!stores.length) return;
  const tx = db.transaction(stores, 'readwrite');
  for (const o of operations) {
    const s = tx.objectStore(o.store);
    if (o.supprimer) s.delete(o.cle); else s.put(o.valeur);
  }
  return finTransaction(tx);
}

export async function supprimer(store, cle) {
  const db = await ouvrirBase();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(cle);
  return finTransaction(tx);
}

export async function vider(stores) {
  const db = await ouvrirBase();
  const tx = db.transaction(stores, 'readwrite');
  for (const s of stores) tx.objectStore(s).clear();
  return finTransaction(tx);
}

export async function supprimerBase() {
  if (instance) { instance.close(); instance = null; }
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(NOM_BASE);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

/** Demande un stockage persistant et renvoie l'état. */
export async function demanderPersistance() {
  try {
    if (!navigator.storage?.persist) return { disponible: false, persistant: false };
    const deja = await navigator.storage.persisted();
    const persistant = deja || (await navigator.storage.persist());
    const est = navigator.storage.estimate ? await navigator.storage.estimate() : null;
    return { disponible: true, persistant, usage: est?.usage ?? null, quota: est?.quota ?? null };
  } catch {
    return { disponible: false, persistant: false };
  }
}
