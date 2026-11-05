// journal.js — journal technique en mémoire (erreurs, avertissements, appels Gemini) pour le rapport de diagnostic.
// Rien n'est envoyé ni écrit sur le disque : le journal vit le temps de la session.
// Les appels Gemini sont notés SANS la clé ni le contenu (modèle, durée, statut, code d'erreur, taille).

const MAX = 150;
const entrees = [];
let installe = false;

function texte(x) {
  if (x instanceof Error) return `${x.name}: ${x.message}${x.stack ? `\n${String(x.stack).split('\n').slice(0, 4).join('\n')}` : ''}`;
  if (typeof x === 'string') return x;
  try { return JSON.stringify(x); } catch { return String(x); }
}

/** Retire tout ce qui ressemble à une clé d'API d'un texte (par précaution). */
export function masquerSecrets(s) {
  return String(s).replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza…(masquée)').replace(/(x-goog-api-key["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1(masquée)');
}

export function noter(type, message, donnees = null) {
  entrees.push({ t: new Date().toISOString(), type, message: masquerSecrets(texte(message)).slice(0, 800), donnees });
  if (entrees.length > MAX) entrees.splice(0, entrees.length - MAX);
}

export function journal() { return entrees.slice(); }

/** Installe la capture des erreurs globales et des console.error / console.warn. À appeler au démarrage. */
export function installerJournal() {
  if (installe || typeof window === 'undefined') return;
  installe = true;
  window.addEventListener('error', (e) => noter('erreur', e.error || `${e.message} (${e.filename || '?'}:${e.lineno || '?'})`));
  window.addEventListener('unhandledrejection', (e) => noter('promesse', e.reason || 'Promesse rejetée sans motif'));
  for (const niveau of ['error', 'warn']) {
    const origine = console[niveau].bind(console);
    console[niveau] = (...args) => { noter(niveau === 'error' ? 'console.error' : 'console.warn', args.map(texte).join(' ')); origine(...args); };
  }
  noter('info', 'Journal démarré');
}
