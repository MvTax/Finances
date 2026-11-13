import { egal, vrai } from '../outils/assert.mjs';
import { SCHEMA_VERSION, migrerContenu, appliquerSchema, MIGRATIONS } from '../../js/migrations.js';
import { construireExport, lireSauvegarde, fusionner, historiqueARestaurer, csvOperations, META_HISTORIQUE } from '../../js/sauvegarde.js';

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
  { nom: 'migrations : 2 → 3 ajoute les dépenses prévues ; une sauvegarde v2 en reçoit une liste vide', fn: () => {
    const { db, tx, stores } = fausseBase();
    appliquerSchema(db, tx, 0, 2);
    const crees = appliquerSchema(db, tx, 2, 3);
    egal(JSON.stringify(crees), '["depensesPrevues"]'); vrai(stores.get('depensesPrevues').indexNames.has('date'));
    const r = migrerContenu({ transactions: [] }, 2);
    egal(JSON.stringify(r.appliquees), '[3,4]'); egal(JSON.stringify(r.contenu.depensesPrevues), '[]'); egal(JSON.stringify(r.contenu.privations), '[]');
  } },
  { nom: 'migrations : une sauvegarde v1 est migrée (drapeaux, « à qualifier », stores V2)', fn: () => {
    const v1 = { transactions: [{ id: 'a', date: '2026-01-01', montantCentimes: 100, sens: 'debit' }], poches: [] };
    const r = migrerContenu(v1, 1);
    egal(JSON.stringify(r.appliquees), '[2,3,4]'); egal(r.contenu.transactions[0].aQualifier, false); vrai(Array.isArray(r.contenu.gamelles));
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
  { nom: 'sauvegarde : l’historique (restes des journées, flammes, points) part avec le fichier, sans les clés techniques', fn: () => {
    const etat = { profil: { cle: 'profil' }, parametres: { cle: 'parametres' }, transactions: [],
      meta: { restesJour: { '2026-11-10': { montantCentimes: 650 } }, joursVus: ['2026-11-09', '2026-11-10'], jeu: { depuis: '2026-11-05', niveauVu: 2 }, sansDepense: { jours: { '2026-11-08': true } },
        jauge: { date: '2026-11-10' }, estampillesFichier: ['x'], baseProfil: {}, supprimes: {}, migrations: [4] } };
    const exp = construireExport(etat, { maintenant: '2026-11-13T00:00:00Z' });
    egal(Object.keys(exp.contenu.meta).sort().join(','), 'jeu,joursVus,restesJour,sansDepense');
    for (const k of Object.keys(exp.contenu.meta)) vrai(META_HISTORIQUE.includes(k));
    const lu = lireSauvegarde(JSON.parse(JSON.stringify(exp)));
    vrai(lu.ok); egal(lu.contenu.meta.restesJour['2026-11-10'].montantCentimes, 650); egal(lu.apercu.historique, 4);
    vrai(!lireSauvegarde({ ...exp, contenu: { ...exp.contenu, meta: [] } }).ok, 'meta doit être un objet');
    // Restauration complète : le fichier gagne
    const local = { joursVus: ['2026-11-12'], jeu: { depuis: '2026-11-12', niveauVu: 1 } };
    const tout = Object.fromEntries(historiqueARestaurer(local, lu.contenu.meta, { remplacer: true }));
    egal(tout.joursVus.join(','), '2026-11-09,2026-11-10'); egal(tout.jeu.niveauVu, 2); vrai(tout.restesJour);
    // Mise à jour : on complète sans écraser (listes réunies, objets fusionnés, ta valeur gagne)
    const comp = Object.fromEntries(historiqueARestaurer(local, lu.contenu.meta));
    egal(comp.joursVus.join(','), '2026-11-09,2026-11-10,2026-11-12'); egal(comp.jeu, undefined, 'tes points locaux gardés tels quels'); vrai(comp.restesJour, 'ce qui manque est ajouté');
    egal(historiqueARestaurer(lu.contenu.meta, lu.contenu.meta).length, 0, 'rien à écrire si identique');
    // Fusion d'une sauvegarde : l'historique est réuni aussi
    const f = fusionner({ ...etat, meta: local }, lu.contenu);
    egal(f.meta.joursVus.length, 3); vrai(f.meta.restesJour['2026-11-10']);
    // Une ancienne sauvegarde sans historique reste valable
    const ancienne = construireExport({ ...etat, meta: {} }); delete ancienne.contenu.meta;
    vrai(lireSauvegarde(JSON.parse(JSON.stringify(ancienne))).ok);
  } },
  { nom: 'export tableur : toutes les opérations en CSV pour Numbers/Excel (séparateur ;, virgule décimale, guillemets)', fn: () => {
    const etat = { comptes: [{ id: 'c1', nom: 'Compte courant' }], transactions: [
      { id: 'a', date: '2026-11-01', montantCentimes: 125050, sens: 'credit', categorie: 'salaire', libelle: 'Salaire', marchand: 'Employeur', compteId: 'c1', source: 'import' },
      { id: 'b', date: '2026-11-10', montantCentimes: 1205, sens: 'debit', categorie: 'courses', libelle: 'Courses; "promo"', marchand: 'Magasin', compteId: 'c1', source: 'texte' },
      { id: 'c', date: '2026-11-05', montantCentimes: 5000, sens: 'debit', libelle: 'Vers épargne', compteId: 'c1', virementInterne: { estInterne: true } },
    ] };
    const csv = csvOperations(etat, (id) => ({ salaire: 'Salaire', courses: 'Courses' }[id] || ''));
    vrai(csv.startsWith('\uFEFF'), 'BOM pour Excel');
    const lignes = csv.slice(1).trim().split('\r\n');
    egal(lignes.length, 4);
    egal(lignes[0], 'Date;Type;Montant (€);Catégorie;Libellé;Commerçant;Compte;Origine');
    egal(lignes[1], '2026-11-10;Dépense;-12,05;Courses;"Courses; ""promo""";Magasin;Compte courant;Saisie', 'la plus récente d’abord, guillemets doublés');
    egal(lignes[2], '2026-11-05;Virement interne;-50,00;;Vers épargne;;Compte courant;Saisie');
    egal(lignes[3], '2026-11-01;Entrée;1250,50;Salaire;Salaire;Employeur;Compte courant;Relevé importé');
  } },
];
