// sauvegarde.js — format d'export/import JSON (même format que le fichier d'import privé).
// Les secrets (clé Gemini, empreinte du code PIN) ne sont JAMAIS exportés.

import { SCHEMA_VERSION, migrerContenu, tousLesStores } from './migrations.js';

export const FORMAT = 'budget-sauvegarde';
const COLLECTIONS = Object.keys(tousLesStores()).filter((k) => !['meta', 'profil', 'parametres'].includes(k));
const SECRETS = ['cleGemini', 'pinHash', 'pinSel', 'pinIterations'];

export function construireExport(etat, { maintenant = new Date().toISOString(), version = '1.0.0' } = {}) {
  for (const r of etat.reglesCategorie || []) delete r._re;
  const parametres = { ...(etat.parametres || {}) };
  for (const s of SECRETS) delete parametres[s];
  const contenu = { profil: etat.profil || {}, parametres };
  for (const c of COLLECTIONS) contenu[c] = etat[c] || [];
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
  res.profil = { ...(contenu.profil || {}), ...(etat.profil || {}) };
  res.parametres = { ...(contenu.parametres || {}), ...(etat.parametres || {}) };
  return res;
}

export function nomFichierExport(dateIso) { return `budget-sauvegarde-${dateIso}.json`; }
export { COLLECTIONS };
