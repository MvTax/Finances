// miseajour.js — mise à jour depuis le fichier privé SANS perdre ce qui a été saisi ou modifié dans l'app.
//
// Principe : chaque objet venant du fichier porte la date de modification du fichier (son « estampille »).
// Dès qu'on le modifie dans l'app, store.js lui donne la date réelle. Donc :
//   - objet local encore à l'estampille du fichier  → jamais touché → on prend la version du nouveau fichier ;
//   - objet local modifié dans l'app                 → on GARDE la version locale ;
//   - objet créé dans l'app (saisie, règle, poche…)  → absent du fichier → toujours gardé ;
//   - objet supprimé dans l'app                      → mémorisé (meta « supprimes ») → pas recréé ;
//   - objet du fichier retiré du nouveau fichier     → supprimé seulement s'il n'a pas été touché.
// Les objets sont rapprochés par identifiant, sinon par une clé naturelle (ex. empreinte + date d'une opération),
// pour fonctionner aussi avec un fichier généré avec d'autres identifiants.

import { COLLECTIONS } from './sauvegarde.js';
import { dedoublonner, fusionnerRapprochement } from './import/pipeline.js';

const CLE_COLLECTIONS = { revenusMensuels: 'mois', planMensuel: 'mois', joursSansDepense: 'date', checkins: 'date' };
// Collections propres à l'usage de l'app (jamais remplacées par le fichier)
const PROPRES_APP = new Set(['fileAttenteIA', 'cagnotteArrondis', 'mouvementsEnveloppes', 'bridgeRecus', 'gamelles', 'joursSansDepense', 'listeEnvies', 'checkins']);
const COLLECTIONS_MAJ = COLLECTIONS.filter((c) => !PROPRES_APP.has(c));

/** Estampilles des fichiers privés déjà générés (avant que le fichier ne la déclare dans son en-tête). */
export const ESTAMPILLES_HISTORIQUES = ['2026-11-05T04:30:00.000Z'];

const VOLATILS = new Set(['creeLe', 'modifieLe']);
const SECRETS_ET_ETAT_APP = new Set(['cle', 'creeLe', 'modifieLe', 'cleGemini', 'pinHash', 'pinSel', 'pinIterations', 'onboarding', 'derniereSauvegarde', 'appelsIA', 'modeleGemini', 'theme', 'masquageMontants', 'mode100Local']);

export function cleDe(collection, r) { return r?.[CLE_COLLECTIONS[collection] || 'id']; }

/** Clé naturelle : permet de reconnaître le même objet quand son identifiant a changé d'un fichier à l'autre. */
export function cleNaturelle(collection, r) {
  if (!r) return null;
  if (collection === 'transactions') {
    if (r.ajustement) return `ajustement|${r.compteId}`;
    return r.empreinteDedoublonnage ? `${r.empreinteDedoublonnage}|${r.date}` : null;
  }
  if (collection === 'chargesFixes') return `${r.compteId}|${r.motifDetection || ''}|${r.montantDetection ?? ''}|${r.libelle || ''}`;
  if (collection === 'reglesCategorie') return r.motif ? `${r.type || ''}|${r.motif}|${r.sens || ''}` : null;
  return null;
}

/** Contenu comparable (sans identifiant ni dates techniques). */
function signature(r, collection) {
  const k = CLE_COLLECTIONS[collection] || 'id';
  const o = {};
  for (const c of Object.keys(r).sort()) if (!VOLATILS.has(c) && c !== k) o[c] = r[c];
  return JSON.stringify(o);
}

function egalProfond(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/** Remplace partout (objets imbriqués compris) les identifiants présents dans la table. */
export function remplacerIds(v, remap) {
  if (!remap?.size) return v;
  if (typeof v === 'string') return remap.has(v) ? remap.get(v) : v;
  if (Array.isArray(v)) return v.map((x) => remplacerIds(x, remap));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = remplacerIds(x, remap); return o; }
  return v;
}

/** Index par clé naturelle avec gestion des doublons exacts (n-ième occurrence). */
function indexNaturel(collection, liste) {
  const m = new Map();
  const occ = new Map();
  for (const r of liste) {
    const n = cleNaturelle(collection, r);
    if (!n) continue;
    const i = occ.get(n) || 0; occ.set(n, i + 1);
    m.set(`${n}#${i}`, r);
  }
  return m;
}
function clesNaturellesAvecOccurrence(collection, liste) {
  const occ = new Map(); const res = new Map();
  for (const r of liste) { const n = cleNaturelle(collection, r); if (!n) continue; const i = occ.get(n) || 0; occ.set(n, i + 1); res.set(r, `${n}#${i}`); }
  return res;
}

/**
 * Calcule la mise à jour (fonction pure, testable).
 * @param local    état actuel de l'app ({ [collection]: [...], profil, parametres })
 * @param contenu  contenu du fichier (déjà validé/migré par lireSauvegarde)
 * @param o        { estampilles: string[], supprimes: { [collection]: { ids: [], naturelles: [] } }, baseProfil, baseParametres,
 *                   bases: { [collection]: { [cle]: objet du dernier fichier appliqué } } (hors opérations) }
 * @returns { ecritures: [{ collection, valeur }], suppressions: [{ collection, cle }], profil, parametres, resume, conflits }
 */
export function planifierMiseAJour(local, contenu, o = {}) {
  const estampilles = new Set([...(o.estampilles || []), ...ESTAMPILLES_HISTORIQUES]);
  const intact = (r) => !!r && estampilles.has(r.modifieLe);
  const ecritures = []; const suppressions = []; const conflits = [];
  const resume = {};
  const remap = new Map(); // identifiant du fichier → identifiant local (objets reconnus par leur clé naturelle)

  // Références de fusion champ par champ : une ou plusieurs versions précédentes du fichier
  const bases = (Array.isArray(o.bases) ? o.bases : [o.bases]).filter(Boolean);

  // Passe 1 : rapprochement de tous les objets (par identifiant, sinon par clé naturelle) et table des identifiants
  const contextes = [];
  for (const collection of COLLECTIONS_MAJ) {
    const distants = Array.isArray(contenu[collection]) ? contenu[collection] : null;
    if (!distants) continue; // collection absente du fichier : on ne touche à rien
    const locaux = local[collection] || [];
    const parId = new Map(locaux.map((x) => [cleDe(collection, x), x]));
    const parNaturel = indexNaturel(collection, locaux);
    const natDistants = clesNaturellesAvecOccurrence(collection, distants);
    const vus = new Set();
    const paires = [];
    for (const d of distants) {
      const id = cleDe(collection, d);
      const nat = natDistants.get(d);
      let l = parId.get(id);
      if (l && vus.has(l)) l = null;
      if (!l && nat) { const cand = parNaturel.get(nat); if (cand && !vus.has(cand)) l = cand; }
      if (l) { vus.add(l); if (cleDe(collection, l) !== id) remap.set(id, cleDe(collection, l)); }
      paires.push({ d, l, id, nat });
    }
    contextes.push({ collection, locaux, vus, paires });
  }

  // Passe 2 : décision pour chaque objet
  for (const { collection, locaux, vus, paires } of contextes) {
    const k0 = CLE_COLLECTIONS[collection] || 'id';
    const r = { ajouts: 0, majs: 0, gardes: 0, suppressions: 0, ignores: 0, inchanges: 0, rapprochements: 0 };
    const tombes = o.supprimes?.[collection] || {};
    const idsSupprimes = new Set(tombes.ids || []);
    const natSupprimees = new Set(tombes.naturelles || []);
    const ajoutsTx = [];
    for (const { d: brut, l, id, nat } of paires) {
      const d = remplacerIds(brut, remap);
      if (!l) {
        if (idsSupprimes.has(id) || (nat && natSupprimees.has(nat))) { r.ignores++; continue; }
        if (collection === 'transactions') ajoutsTx.push(d); else { ecritures.push({ collection, valeur: d }); r.ajouts++; }
        continue;
      }
      const cleLocale = cleDe(collection, l);
      const memeContenu = signature(l, collection) === signature(d, collection);
      if (memeContenu) { r.inchanges++; continue; }
      if (intact(l)) {
        // Jamais touché dans l'app : version du fichier, avec l'identifiant local (les liens restent valides)
        ecritures.push({ collection, valeur: { ...d, [k0]: cleLocale } });
        r.majs++;
        continue;
      }
      // Modifié dans l'app : champ par champ. Un champ dont la valeur locale vient d'un fichier (version actuelle ou
      // précédente) n'a pas été changé par l'utilisateur → on prend le fichier ; sinon la version locale gagne.
      const versions = bases.map((b) => b?.[collection]?.[id] || b?.[collection]?.[cleLocale]).filter(Boolean).map((b) => remplacerIds(b, remap));
      if (!versions.length) { r.gardes++; conflits.push({ collection, cle: cleLocale }); continue; }
      const fusion = { ...l }; const tenus = []; let change = false;
      for (const k of new Set([...Object.keys(d), ...Object.keys(l)])) {
        if (VOLATILS.has(k) || k === k0 || egalProfond(l[k], d[k])) continue;
        const vientDuFichier = versions.some((v) => egalProfond(l[k], v[k]));
        if (vientDuFichier) { if (d[k] === undefined) delete fusion[k]; else fusion[k] = d[k]; change = true; }
        else if (!versions.some((v) => egalProfond(d[k], v[k]))) tenus.push(k); // le fichier l'a changé aussi : ta version gagne, on le signale
      }
      if (change) { ecritures.push({ collection, valeur: fusion }); r.majs++; }
      if (tenus.length) { r.gardes++; conflits.push({ collection, cle: cleLocale, champs: tenus }); }
    }

    // Opérations nouvelles : rapprochées des saisies manuelles et des imports faits dans l'app
    if (ajoutsTx.length) {
      const dd = dedoublonner(ajoutsTx, locaux.filter((x) => !vus.has(x)));
      for (const t of dd.nouvelles) { ecritures.push({ collection, valeur: t }); r.ajouts++; }
      for (const { existante, importee } of dd.rapprochees) { ecritures.push({ collection, valeur: { ...fusionnerRapprochement(existante, importee), modifieLe: existante.modifieLe } }); r.rapprochements++; vus.add(existante); }
      r.ignores += dd.doublons.length;
    }

    // Objets venant d'un ancien fichier, retirés du nouveau, jamais touchés : supprimés
    for (const l of locaux) {
      if (vus.has(l)) continue;
      if (intact(l) && !(collection === 'transactions' && l.ajustement)) { suppressions.push({ collection, cle: cleDe(collection, l) }); r.suppressions++; }
    }
    resume[collection] = r;
  }


  // Profil et paramètres : champ par champ, par rapport à la version du dernier fichier appliqué
  const fusionnerUnique = (loc = {}, dist = {}, base = null) => {
    const res = { ...loc }; const garde = [];
    for (const [k, v] of Object.entries(dist)) {
      if (SECRETS_ET_ETAT_APP.has(k)) continue;
      if (base) { if (egalProfond(loc[k], base[k]) || loc[k] === undefined) res[k] = v; else if (!egalProfond(loc[k], v)) garde.push(k); }
      else if (loc[k] === undefined || loc[k] === null) res[k] = v;
      else if (!egalProfond(loc[k], v)) garde.push(k);
    }
    return { res, garde };
  };
  const p = fusionnerUnique(local.profil, contenu.profil, o.baseProfil);
  const pa = fusionnerUnique(local.parametres, contenu.parametres, o.baseParametres);
  if (p.garde.length) conflits.push({ collection: 'profil', champs: p.garde });
  if (pa.garde.length) conflits.push({ collection: 'parametres', champs: pa.garde });

  const total = (k) => Object.values(resume).reduce((s, x) => s + x[k], 0);
  return {
    ecritures, suppressions, profil: p.res, parametres: pa.res, resume, conflits,
    totaux: { ajouts: total('ajouts'), majs: total('majs'), gardes: total('gardes'), suppressions: total('suppressions'), ignores: total('ignores'), rapprochements: total('rapprochements'), inchanges: total('inchanges') },
  };
}

/** Phrase de résumé pour l'aperçu. */
export function resumeMiseAJour(plan) {
  const t = plan.totaux;
  const morceaux = [];
  if (t.ajouts) morceaux.push(`${t.ajouts} ajout${t.ajouts > 1 ? 's' : ''}`);
  if (t.majs) morceaux.push(`${t.majs} mise${t.majs > 1 ? 's' : ''} à jour`);
  if (t.suppressions) morceaux.push(`${t.suppressions} retrait${t.suppressions > 1 ? 's' : ''}`);
  if (t.rapprochements) morceaux.push(`${t.rapprochements} saisie${t.rapprochements > 1 ? 's' : ''} rapprochée${t.rapprochements > 1 ? 's' : ''} d’une opération bancaire`);
  return morceaux.length ? morceaux.join(', ') : 'Rien de nouveau dans ce fichier';
}

/** Copie du fichier appliqué (hors opérations, trop nombreuses) : sert de référence à la prochaine fusion champ par champ. */
export function basesDepuisContenu(contenu) {
  const bases = {};
  for (const c of COLLECTIONS_MAJ) {
    if (c === 'transactions' || !Array.isArray(contenu[c])) continue;
    bases[c] = Object.fromEntries(contenu[c].map((x) => [cleDe(c, x), x]));
  }
  return bases;
}
