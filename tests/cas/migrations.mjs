import { egal, vrai } from '../outils/assert.mjs';
import { SCHEMA_VERSION, migrerContenu, appliquerSchema, MIGRATIONS } from '../../js/migrations.js';
import { construireExport, lireSauvegarde, fusionner } from '../../js/sauvegarde.js';

function fausseBase(existants = []) {
  const stores = new Map(existants.map((n) => [n, { indexNames: new Set(), createIndex(i) { this.indexNames.add(i); } }]));
  const db = { objectStoreNames: { contains: (n) => stores.has(n) }, createObjectStore(n) { const s = { indexNames: new Set(), createIndex(i) { this.indexNames.add(i); } }; s.indexNames.contains = (i) => s.indexNames.has(i); stores.set(n, s); return s; } };
  for (const s of stores.values()) s.indexNames.contains = (i) => s.indexNames.has(i);
  return { db, tx: { objectStore: (n) => stores.get(n) }, stores };
}

export default [
  { nom: 'migrations : schéma créé de 0 à la version courante (stores et index)', fn: () => {
    const { db, tx, stores } = fausseBase();
    appliquerSchema(db, tx, 0, SCHEMA_VERSION);
    for (const n of ['transactions', 'poches', 'planMensuel', 'creditsBancaires', 'gamelles', 'bridgeRecus']) vrai(stores.has(n), n);
    vrai(stores.get('transactions').indexNames.has('empreinte'));
  } },
  { nom: 'migrations : 1 → 2 ajoute les stores V2 sans toucher aux existants', fn: () => {
    const { db, tx, stores } = fausseBase();
    appliquerSchema(db, tx, 0, 1);
    vrai(!stores.has('gamelles'));
    const crees = appliquerSchema(db, tx, 1, 2);
    egal(JSON.stringify(crees.sort()), JSON.stringify(['bridgeRecus', 'checkins', 'gamelles', 'joursSansDepense', 'listeEnvies']));
  } },
  { nom: 'migrations : une sauvegarde v1 est migrée (drapeaux, « à qualifier », stores V2)', fn: () => {
    const v1 = { transactions: [{ id: 'a', date: '2026-01-01', montantCentimes: 100, sens: 'debit' }], poches: [] };
    const r = migrerContenu(v1, 1);
    egal(JSON.stringify(r.appliquees), '[2]'); egal(r.contenu.transactions[0].aQualifier, false); vrai(Array.isArray(r.contenu.gamelles));
    egal(MIGRATIONS.length, SCHEMA_VERSION);
  } },
  { nom: 'sauvegarde : aller-retour export → import, secrets jamais exportés, fusion sans écrasement', fn: () => {
    const etat = { profil: { cle: 'profil', jourSalaireHabituel: 5 }, parametres: { cle: 'parametres', cleGemini: 'secret', pinHash: 'h', pinSel: 's', theme: 'auto' }, transactions: [{ id: 'a', date: '2026-01-01', montantCentimes: 100, sens: 'debit' }], reglesCategorie: [{ id: 'r' }] };
    const exp = construireExport(etat, { maintenant: '2026-11-05T00:00:00Z' });
    egal(exp.schemaVersion, SCHEMA_VERSION); egal(exp.contenu.parametres.cleGemini, undefined); egal(exp.contenu.parametres.pinHash, undefined);
    const lu = lireSauvegarde(JSON.parse(JSON.stringify(exp)));
    vrai(lu.ok); egal(lu.apercu.transactions, 1); egal(lu.apercu.regles, 1);
    const f = fusionner({ ...etat, transactions: [{ id: 'a', date: '2026-01-01', montantCentimes: 999, sens: 'debit' }] }, lu.contenu);
    egal(f.transactions.length, 1); egal(f.transactions[0].montantCentimes, 999);
    vrai(!lireSauvegarde({ format: 'autre' }).ok); vrai(!lireSauvegarde({ ...exp, schemaVersion: SCHEMA_VERSION + 1 }).ok);
  } },
];
