// fausse-idb.mjs — petite base IndexedDB en mémoire, pour exercer js/db.js et js/store.js sous Node
// (restauration complète puis rechargement). Juste ce dont db.js a besoin : open, deleteDatabase, transactions,
// get / getAll / put / delete / clear, index.getAll. Les valeurs sont copiées (structuredClone), comme dans le vrai navigateur.
// À n'utiliser QUE sous Node : dans Safari, la vraie base contient tes données.

const plus_tard = (fn) => setTimeout(fn, 0);

function requete(calcul) {
  const req = { result: undefined, error: null, onsuccess: null, onerror: null };
  queueMicrotask(() => {
    try { req.result = calcul(); req.onsuccess?.({ target: req }); } catch (e) { req.error = e; req.onerror?.({ target: req }); }
  });
  return req;
}

function magasin(def) {
  const cle = (v) => v[def.keyPath];
  const ops = {
    indexNames: { contains: (i) => def.index.has(i) },
    createIndex(nom, chemin) { def.index.set(nom, chemin); },
    get: (k) => requete(() => (def.donnees.has(k) ? structuredClone(def.donnees.get(k)) : undefined)),
    getAll: () => requete(() => [...def.donnees.values()].map((v) => structuredClone(v))),
    put: (v) => requete(() => { const k = cle(v); if (k === undefined) throw new Error(`Clé « ${def.keyPath} » absente`); def.donnees.set(k, structuredClone(v)); return k; }),
    delete: (k) => requete(() => { def.donnees.delete(k); }),
    clear: () => requete(() => { def.donnees.clear(); }),
    index: (nom) => ({ getAll: (val) => requete(() => [...def.donnees.values()].filter((v) => v[def.index.get(nom)] === val).map((v) => structuredClone(v))) }),
  };
  return ops;
}

function base(b) {
  const transaction = (noms) => {
    const liste = Array.isArray(noms) ? noms : [noms];
    for (const n of liste) if (!b.stores.has(n)) throw new Error(`Store inconnu : ${n}`);
    const tx = { oncomplete: null, onerror: null, onabort: null, error: null, objectStore: (n) => magasin(b.stores.get(n)) };
    plus_tard(() => tx.oncomplete?.());
    return tx;
  };
  return {
    objectStoreNames: { contains: (n) => b.stores.has(n) },
    createObjectStore(nom, { keyPath }) { const def = { keyPath, index: new Map(), donnees: new Map() }; b.stores.set(nom, def); return magasin(def); },
    transaction,
    close() {},
    onversionchange: null,
  };
}

export function fausseIndexedDB() {
  const bases = new Map();
  return {
    open(nom, version) {
      const req = { result: null, transaction: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      plus_tard(() => {
        let b = bases.get(nom);
        const ancienne = b ? b.version : 0;
        if (!b) { b = { version: version, stores: new Map() }; bases.set(nom, b); }
        req.result = base(b);
        if (version > ancienne) {
          b.version = version;
          req.transaction = { objectStore: (n) => magasin(b.stores.get(n)) };
          req.onupgradeneeded?.({ oldVersion: ancienne, newVersion: version, target: req });
        }
        req.onsuccess?.({ target: req });
      });
      return req;
    },
    deleteDatabase(nom) {
      const req = { onsuccess: null, onerror: null, onblocked: null };
      plus_tard(() => { bases.delete(nom); req.onsuccess?.({ target: req }); });
      return req;
    },
  };
}
