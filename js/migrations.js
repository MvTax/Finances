// migrations.js — versions du schéma IndexedDB et migrations des données (testées sous Node).
// Chaque migration décrit (1) les stores/index à créer dans onupgradeneeded, (2) la transformation
// des données d'une sauvegarde exportée dans une version antérieure.

export const SCHEMA_VERSION = 2;

/** Stores de la V1 (fonctionnalités livrées). keyPath + index. */
export const STORES_V1 = {
  meta: { keyPath: 'cle' },
  profil: { keyPath: 'cle' },
  parametres: { keyPath: 'cle' },
  revenusMensuels: { keyPath: 'mois' },
  comptes: { keyPath: 'id' },
  transactions: { keyPath: 'id', index: { date: 'date', compteId: 'compteId', categorie: 'categorie', importId: 'importId', empreinte: 'empreinteDedoublonnage' } },
  chargesFixes: { keyPath: 'id' },
  enveloppes: { keyPath: 'id' },
  mouvementsEnveloppes: { keyPath: 'id', index: { mois: 'mois' } },
  poches: { keyPath: 'id' },
  planMensuel: { keyPath: 'mois' },
  creditsBancaires: { keyPath: 'id' },
  prets: { keyPath: 'id' },
  reglesCategorie: { keyPath: 'id' },
  cagnotteArrondis: { keyPath: 'id', index: { transactionId: 'transactionId' } },
  fileAttenteIA: { keyPath: 'id' },
  planAction: { keyPath: 'id' },
  imports: { keyPath: 'id' },
  evenements: { keyPath: 'id' },
  questions: { keyPath: 'id' },
  virementsPrevus: { keyPath: 'id' },
};

/** Stores ajoutés en V2 : architecture prête pour les fonctionnalités V2 (aucune interface pour l'instant). */
export const STORES_V2 = {
  gamelles: { keyPath: 'id', index: { date: 'date' } },
  joursSansDepense: { keyPath: 'date' },
  listeEnvies: { keyPath: 'id' },
  checkins: { keyPath: 'date' },
  bridgeRecus: { keyPath: 'id' },
};

export const MIGRATIONS = [
  {
    version: 1,
    description: 'Schéma initial',
    stores: STORES_V1,
    donnees: (c) => c,
  },
  {
    version: 2,
    description: 'Stores V2 (gamelles, jours sans dépense, liste d’envies, check-in, bridge) ; transactions : drapeaux et « à qualifier » toujours présents',
    stores: STORES_V2,
    donnees: (c) => ({
      ...c,
      transactions: (c.transactions || []).map((t) => ({ drapeaux: {}, aQualifier: false, role: null, ...t, drapeaux: t.drapeaux || {} })),
      gamelles: c.gamelles || [],
      joursSansDepense: c.joursSansDepense || [],
      listeEnvies: c.listeEnvies || [],
      checkins: c.checkins || [],
      bridgeRecus: c.bridgeRecus || [],
    }),
  },
];

export function tousLesStores() { return { ...STORES_V1, ...STORES_V2 }; }

/** Migre le contenu d'une sauvegarde de `depuis` vers SCHEMA_VERSION. */
export function migrerContenu(contenu, depuis) {
  if (depuis > SCHEMA_VERSION) throw new Error(`Cette sauvegarde vient d'une version plus récente de l'app (schéma ${depuis}). Mets l'app à jour avant de la restaurer.`);
  let c = contenu;
  const appliquees = [];
  for (const m of MIGRATIONS) {
    if (m.version > depuis) { c = m.donnees(c); appliquees.push(m.version); }
  }
  return { contenu: c, appliquees };
}

/**
 * À appeler dans onupgradeneeded : crée stores et index manquants pour passer de oldVersion à newVersion.
 * `db` et `tx` sont les objets IndexedDB (ou des doublures en test).
 */
export function appliquerSchema(db, tx, oldVersion, newVersion = SCHEMA_VERSION) {
  const crees = [];
  for (const m of MIGRATIONS) {
    if (m.version <= oldVersion || m.version > newVersion) continue;
    for (const [nom, def] of Object.entries(m.stores)) {
      let store;
      if (!db.objectStoreNames.contains(nom)) { store = db.createObjectStore(nom, { keyPath: def.keyPath }); crees.push(nom); }
      else store = tx.objectStore(nom);
      for (const [idx, chemin] of Object.entries(def.index || {})) if (!store.indexNames.contains(idx)) store.createIndex(idx, chemin, { unique: false });
    }
  }
  return crees;
}
