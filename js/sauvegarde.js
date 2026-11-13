// sauvegarde.js — format d'export/import JSON (même format que le fichier d'import privé).
// Les secrets (clé Gemini, empreinte du code PIN) ne sont JAMAIS exportés.

import { SCHEMA_VERSION, migrerContenu, tousLesStores } from './migrations.js';

export const FORMAT = 'budget-sauvegarde';
const COLLECTIONS = Object.keys(tousLesStores()).filter((k) => !['meta', 'profil', 'parametres'].includes(k));
const SECRETS = ['cleGemini', 'pinHash', 'pinSel', 'pinIterations', 'motDePasseSauvegarde'];
/**
 * L'historique gardé à part des listes (store « meta ») et exporté avec elles : sans lui, une restauration perdrait
 * les restes des journées passés à l'épargne, les journées sans dépense, la série de flammes, les points, etc.
 * Les clés techniques (instantané de la jauge, empreintes du fichier privé, migrations) ne sont pas exportées.
 */
export const META_HISTORIQUE = ['restesJour', 'reliquats', 'sansDepense', 'jeu', 'joursVus', 'abonnementsResilies', 'effortsPartages',
  'enviesAmorcees', 'saisiesNuitRecalees', 'pochesRangees', 'supportsEpargne', 'derniereVerification'];

export function construireExport(etat, { maintenant = new Date().toISOString(), version = '1.0.0' } = {}) {
  for (const r of etat.reglesCategorie || []) delete r._re;
  const parametres = { ...(etat.parametres || {}) };
  for (const s of SECRETS) delete parametres[s];
  const contenu = { profil: etat.profil || {}, parametres };
  for (const c of COLLECTIONS) contenu[c] = etat[c] || [];
  contenu.meta = Object.fromEntries(META_HISTORIQUE.filter((k) => etat.meta?.[k] !== undefined && etat.meta[k] !== null).map((k) => [k, etat.meta[k]]));
  return { format: FORMAT, schemaVersion: SCHEMA_VERSION, exporteLe: maintenant, application: { nom: 'Budget', version }, contenu };
}

/** Valide et normalise une sauvegarde. Renvoie { ok, erreurs, contenu, apercu, migrations }. */
export function lireSauvegarde(objet) {
  const erreurs = [];
  if (!objet || typeof objet !== 'object') return { ok: false, erreurs: ['Fichier illisible : ce n’est pas un JSON valide.'] };
  if (objet.format !== FORMAT) erreurs.push('Ce fichier n’est pas une sauvegarde de l’app Budget.');
  if (!Number.isInteger(objet.schemaVersion)) erreurs.push('Version de schéma absente.');
  if (!objet.contenu || typeof objet.contenu !== 'object') erreurs.push('Contenu absent.');
  if (erreurs.length) return { ok: false, erreurs };
  let migre;
  try { migre = migrerContenu(objet.contenu, objet.schemaVersion); } catch (e) { return { ok: false, erreurs: [e.message] }; }
  const c = migre.contenu;
  for (const r of c.reglesCategorie || []) delete r._re; // cache interne d'anciennes versions, jamais utile dans un fichier
  for (const k of COLLECTIONS) if (c[k] !== undefined && !Array.isArray(c[k])) erreurs.push(`« ${k} » devrait être une liste.`);
  if (c.meta !== undefined && (typeof c.meta !== 'object' || c.meta === null || Array.isArray(c.meta))) erreurs.push('« meta » devrait être un objet.');
  for (const t of c.transactions || []) {
    if (!t.id || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '') || !Number.isInteger(t.montantCentimes) || t.montantCentimes < 0 || !['debit', 'credit'].includes(t.sens)) {
      erreurs.push(`Transaction invalide : ${JSON.stringify(t).slice(0, 120)}`);
      if (erreurs.length > 5) break;
    }
  }
  if (erreurs.length) return { ok: false, erreurs };
  return { ok: true, erreurs: [], contenu: c, migrations: migre.appliquees, apercu: apercu(c, objet) };
}

export function apercu(c, objet = {}) {
  const n = (k) => (c[k] || []).length;
  const dates = (c.transactions || []).map((t) => t.date).sort();
  return {
    exporteLe: objet.exporteLe || null,
    transactions: n('transactions'),
    regles: n('reglesCategorie'),
    chargesFixes: n('chargesFixes'),
    comptes: n('comptes'),
    poches: n('poches'),
    credits: n('creditsBancaires'),
    prets: n('prets'),
    mois: n('revenusMensuels'),
    privations: n('privations'),
    historique: Object.keys(c.meta || {}).filter((k) => META_HISTORIQUE.includes(k)).length,
    du: dates[0] || null,
    au: dates[dates.length - 1] || null,
  };
}

/**
 * Fusion : ajoute ce qui n'existe pas (par identifiant), sans écraser ; profil/paramètres : complétés.
 * Remplacement : géré par l'appelant (effacement puis écriture).
 */
export function fusionner(etat, contenu) {
  const res = { ...etat };
  for (const k of COLLECTIONS) {
    const cle = k === 'revenusMensuels' || k === 'planMensuel' ? 'mois' : k === 'joursSansDepense' || k === 'checkins' ? 'date' : 'id';
    const existants = new Set((etat[k] || []).map((x) => x[cle]));
    res[k] = [...(etat[k] || []), ...(contenu[k] || []).filter((x) => !existants.has(x[cle]))];
  }
  const meta = Object.fromEntries(META_HISTORIQUE.filter((k) => etat.meta?.[k] !== undefined).map((k) => [k, etat.meta[k]]));
  res.meta = { ...meta, ...Object.fromEntries(historiqueARestaurer(etat.meta || {}, contenu.meta || {})) };
  res.profil = { ...(contenu.profil || {}), ...(etat.profil || {}) };
  res.parametres = { ...(contenu.parametres || {}), ...(etat.parametres || {}) };
  return res;
}

/**
 * L'historique d'un fichier, prêt à écrire. remplacer : le fichier gagne (restauration complète).
 * Sinon on complète : listes réunies sans doublon, objets fusionnés (ta valeur gagne), le reste seulement s'il manque.
 * @returns {Array<[string, any]>} les clés à écrire et leur nouvelle valeur
 */
export function historiqueARestaurer(metaLocal = {}, metaFichier = {}, { remplacer = false } = {}) {
  const ecrire = [];
  for (const k of META_HISTORIQUE) {
    const f = metaFichier?.[k];
    if (f === undefined || f === null) continue;
    const l = metaLocal?.[k];
    let v;
    if (remplacer || l === undefined || l === null) v = f;
    else if (Array.isArray(l) && Array.isArray(f)) v = [...new Set([...f, ...l])].sort();
    else if (typeof l === 'object' && typeof f === 'object' && !Array.isArray(l) && !Array.isArray(f)) v = { ...f, ...l };
    else continue;
    if (JSON.stringify(v) !== JSON.stringify(l)) ecrire.push([k, v]);
  }
  return ecrire;
}

/** Montant en euros pour un tableur français : « 12,50 ». */
const eurosCsv = (c) => `${c < 0 ? '-' : ''}${Math.floor(Math.abs(c) / 100)},${String(Math.abs(c) % 100).padStart(2, '0')}`;
const cellule = (v) => { const t = String(v ?? '').replace(/\r?\n/g, ' '); return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/**
 * Toutes les opérations en tableau (CSV, séparateur « ; », pour Numbers ou Excel), de la plus récente à la plus ancienne.
 * Pour lire ou garder une trace : pour restaurer, c'est le fichier complet (JSON) qui compte.
 */
export function csvOperations(etat, nomCategorie = (id) => id || '') {
  const comptes = new Map((etat.comptes || []).map((c) => [c.id, c.nom]));
  const lignes = [['Date', 'Type', 'Montant (€)', 'Catégorie', 'Libellé', 'Commerçant', 'Compte', 'Origine']];
  const tx = [...(etat.transactions || [])].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.creeLe || '').localeCompare(a.creeLe || ''));
  for (const t of tx) {
    const type = t.virementInterne?.estInterne ? 'Virement interne' : t.epargne?.estEpargne ? 'Épargne' : t.sens === 'credit' ? 'Entrée' : 'Dépense';
    lignes.push([t.date, type, eurosCsv(t.sens === 'credit' ? t.montantCentimes : -t.montantCentimes), nomCategorie(t.categorie), t.libelle || t.libellePrincipal || '', t.marchand || '', comptes.get(t.compteId) || '', t.source === 'import' || t.importId ? 'Relevé importé' : 'Saisie']);
  }
  return `\uFEFF${lignes.map((l) => l.map(cellule).join(';')).join('\r\n')}\r\n`;
}

export function nomFichierExport(dateIso) { return `budget-sauvegarde-${dateIso}.json`; }
export { COLLECTIONS };
