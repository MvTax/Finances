// gemini.js — client REST generateContent (clé en en-tête x-goog-api-key, jamais dans l'URL ni dans les journaux).

import { etat, majParametres } from './store.js';
import { aujourdhui } from './dates.js';

export const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const MODELE_DEFAUT = 'gemini-3.8-flash';
const TIMEOUT_MS = 45000;

export class ErreurGemini extends Error {
  constructor(message, code, { reessayable = false, file = false } = {}) { super(message); this.code = code; this.reessayable = reessayable; this.mettreEnFile = file; }
}

export function iaDisponible() {
  if (etat.parametres.mode100Local) return { ok: false, raison: 'Mode 100 % local actif : aucune donnée n’est envoyée.' };
  if (!etat.parametres.cleGemini) return { ok: false, raison: 'Aucune clé Gemini : ajoute-la dans Réglages, ou continue avec les règles locales.' };
  return { ok: true };
}

export function modeleActif() { return etat.parametres.modeleGemini || MODELE_DEFAUT; }

/** Choisit le Flash STABLE le plus récent dans une liste de noms « models/gemini-X.Y-flash ». */
export function choisirFlashStable(noms) {
  const candidats = noms.map((n) => n.replace(/^models\//, ''))
    .map((n) => ({ n, m: n.match(/^gemini-(\d+)(?:\.(\d+))?-flash$/) }))
    .filter((x) => x.m)
    .map((x) => ({ n: x.n, v: Number(x.m[1]) * 1000 + Number(x.m[2] || 0) }))
    .sort((a, b) => b.v - a.v);
  return candidats[0]?.n || null;
}

function traduireErreur(statut, corps) {
  const msg = corps?.error?.message || '';
  if (statut === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) return new ErreurGemini('Clé Gemini invalide : vérifie-la dans Réglages.', 'cle');
  if (statut === 400 && /mime|audio|unsupported/i.test(msg)) return new ErreurGemini(`Format refusé par Gemini (${msg.slice(0, 120)}).`, 'format');
  if (statut === 400 && /responseJsonSchema|response_json_schema|Unknown name/i.test(msg)) return new ErreurGemini('Schéma refusé', 'schema');
  if (statut === 400) return new ErreurGemini(`Requête refusée par Gemini : ${msg.slice(0, 160)}`, 'requete');
  if (statut === 403) return new ErreurGemini('Clé refusée : vérifie la restriction par référent HTTP (ton domaine github.io) et que l’API Gemini est activée.', 'interdit');
  if (statut === 404) return new ErreurGemini(`Modèle « ${modeleActif()} » introuvable : choisis-en un autre dans Réglages.`, 'modele');
  if (statut === 429) return new ErreurGemini('Quota Gemini dépassé : la saisie est gardée en file d’attente, réessaie plus tard.', 'quota', { reessayable: true, file: true });
  if (statut >= 500) return new ErreurGemini('Gemini est indisponible pour le moment : la saisie est gardée en file d’attente.', 'serveur', { reessayable: true, file: true });
  return new ErreurGemini(`Erreur Gemini (${statut}).`, 'inconnu');
}

async function requete(url, init, timeoutMs = TIMEOUT_MS) {
  if (!navigator.onLine) throw new ErreurGemini('Hors ligne : la saisie est gardée en file d’attente et sera analysée au retour du réseau.', 'horsligne', { file: true });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store', referrerPolicy: 'strict-origin-when-cross-origin' });
  } catch (e) {
    if (e.name === 'AbortError') throw new ErreurGemini('Gemini met trop de temps à répondre : réessaie.', 'delai', { reessayable: true, file: true });
    throw new ErreurGemini('Réseau indisponible : la saisie est gardée en file d’attente.', 'reseau', { file: true });
  } finally { clearTimeout(t); }
}

async function compterAppel() {
  const a = etat.parametres.appelsIA || {};
  const j = aujourdhui();
  await majParametres({ appelsIA: { date: j, nb: a.date === j ? (a.nb || 0) + 1 : 1 } });
}

/** Retire les mots-clés non pris en charge par l'ancien « responseSchema » (sous-ensemble OpenAPI). */
function versResponseSchema(s) {
  if (Array.isArray(s)) return s.map(versResponseSchema);
  if (!s || typeof s !== 'object') return s;
  const r = {};
  for (const [k, v] of Object.entries(s)) if (!['additionalProperties', '$schema'].includes(k)) r[k] = versResponseSchema(v);
  return r;
}

/**
 * Appel generateContent avec sortie JSON structurée, délai, nouvelles tentatives (429/5xx) et validation.
 * @param {{ systeme, parts, schema, valider?: (obj) => obj|null, modele?, timeoutMs? }} o
 */
export async function genererJSON(o) {
  const dispo = iaDisponible();
  if (!dispo.ok) throw new ErreurGemini(dispo.raison, 'indisponible');
  const cle = etat.parametres.cleGemini;
  let modele = o.modele || modeleActif();
  let formeSchema = 'json';
  for (let tentative = 0; tentative < 4; tentative++) {
    const generationConfig = { responseMimeType: 'application/json' };
    if (formeSchema === 'json') generationConfig.responseJsonSchema = o.schema; else generationConfig.responseSchema = versResponseSchema(o.schema);
    const corps = { systemInstruction: { parts: [{ text: o.systeme }] }, contents: [{ role: 'user', parts: o.parts }], generationConfig };
    const rep = await requete(`${BASE}/models/${encodeURIComponent(modele)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cle },
      body: JSON.stringify(corps),
    }, o.timeoutMs);
    await compterAppel();
    let json = null;
    try { json = await rep.json(); } catch { json = null; }
    if (!rep.ok) {
      const err = traduireErreur(rep.status, json);
      if (err.code === 'schema' && formeSchema === 'json') { formeSchema = 'ancien'; continue; }
      if (err.code === 'modele' && !o.modele) {
        const nouveau = await meilleurModeleDisponible().catch(() => null);
        if (nouveau && nouveau !== modele) { modele = nouveau; await majParametres({ modeleGemini: nouveau }); continue; }
      }
      if (err.reessayable && tentative < 2) { await new Promise((r) => setTimeout(r, 800 * 2 ** tentative + Math.random() * 400)); continue; }
      throw err;
    }
    const texte = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!texte) throw new ErreurGemini(json?.promptFeedback?.blockReason ? 'Gemini a refusé de traiter ce contenu.' : 'Réponse vide de Gemini.', 'vide');
    let obj;
    try { obj = JSON.parse(texte.replace(/^```json\s*|```$/g, '')); } catch { throw new ErreurGemini('Réponse illisible de Gemini (JSON invalide).', 'json'); }
    const valide = o.valider ? o.valider(obj) : obj;
    if (!valide) throw new ErreurGemini('Réponse de Gemini incomplète ou incohérente : vérifie la saisie à la main.', 'validation');
    return valide;
  }
  throw new ErreurGemini('Gemini n’a pas pu répondre après plusieurs tentatives.', 'echec', { file: true });
}

/** Liste des modèles acceptant generateContent (pour la liste déroulante des Réglages). */
export async function listerModeles(cle = etat.parametres.cleGemini) {
  if (!cle) throw new ErreurGemini('Ajoute d’abord ta clé.', 'cle');
  const noms = [];
  let page = '';
  for (let i = 0; i < 5; i++) {
    const rep = await requete(`${BASE}/models?pageSize=200${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`, { headers: { 'x-goog-api-key': cle } }, 20000);
    let json = null; try { json = await rep.json(); } catch { /* vide */ }
    if (!rep.ok) throw traduireErreur(rep.status, json);
    for (const m of json.models || []) if ((m.supportedGenerationMethods || []).includes('generateContent')) noms.push(m.name.replace(/^models\//, ''));
    page = json.nextPageToken;
    if (!page) break;
  }
  return noms;
}

export async function meilleurModeleDisponible() {
  return choisirFlashStable(await listerModeles());
}

/** Test minimal de la clé (envoie seulement « Réponds OK »). */
export async function testerCle() {
  const r = await genererJSON({ systeme: 'Réponds {"ok":true}.', parts: [{ text: 'Test de connexion.' }], schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, valider: (x) => (x && x.ok === true ? x : null), timeoutMs: 20000 });
  return r.ok;
}
