// verif-statique.mjs — vérifications statiques du dépôt (sans dépendance) :
//  1. tous les imports relatifs résolus, et chaque nom importé est bien exporté ;
//  2. chaque getElementById('x') pointe vers un id présent dans index.html ou créé par le code ;
//  3. tous les fichiers listés dans le cache du service worker existent, et tous les modules de l'app y sont ;
//  4. aucun chemin absolu (« /js/… », « /css/… ») ;
//  5. aucune URL externe hors API Gemini (vendor/ exclu : bibliothèque tierce) ;
//  6. version du SW = version de l'app.
// Usage : node tools/verif-statique.mjs   (code de sortie 1 en cas d'erreur)

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const erreurs = [];
const lire = (p) => readFileSync(join(RACINE, p), 'utf8');

function lister(dossier, filtre) {
  const res = [];
  for (const e of readdirSync(join(RACINE, dossier))) {
    const p = join(dossier, e);
    if (statSync(join(RACINE, p)).isDirectory()) res.push(...lister(p, filtre));
    else if (filtre(p)) res.push(p);
  }
  return res;
}

const modules = [...lister('js', (p) => p.endsWith('.js')), ...lister('tests', (p) => p.endsWith('.mjs')), ...lister('tools', (p) => p.endsWith('.mjs'))];

// --- 1. imports / exports
const exportsDe = new Map();
function exportsDuFichier(rel) {
  if (exportsDe.has(rel)) return exportsDe.get(rel);
  const src = lire(rel);
  const noms = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) noms.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop().trim(); if (n) noms.add(n); }
  for (const m of src.matchAll(/export\s*\*\s*as\s+([A-Za-z_$][\w$]*)/g)) noms.add(m[1]);
  if (/export\s+default/.test(src)) noms.add('default');
  exportsDe.set(rel, noms);
  return noms;
}
for (const f of modules) {
  const src = lire(f);
  const sansCommentaires = src.replace(/^\s*\/\/.*$/gm, '');
  for (const m of sansCommentaires.matchAll(/import\s+(?:([^'";]*?)\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const cible = join(dirname(f), m[2]);
    if (!existsSync(join(RACINE, cible))) { erreurs.push(`${f} : import introuvable « ${m[2]} »`); continue; }
    const clause = (m[1] || '').trim();
    const acc = clause.match(/\{([\s\S]*)\}/);
    if (acc && /\.m?js$/.test(cible)) {
      const dispo = exportsDuFichier(relative(RACINE, join(RACINE, cible)));
      for (const part of acc[1].split(',')) {
        const nom = part.trim().split(/\s+as\s+/)[0].trim();
        if (nom && !dispo.has(nom)) erreurs.push(`${f} : « ${nom} » n'est pas exporté par ${m[2]}`);
      }
    }
  }
  for (const m of sansCommentaires.matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    if (!existsSync(join(RACINE, dirname(f), m[1]))) erreurs.push(`${f} : import dynamique introuvable « ${m[1]} »`);
  }
}

// --- 2. getElementById / querySelector('#id')
const html = lire('index.html');
const idsHtml = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const sourcesJs = lister('js', (p) => p.endsWith('.js')).map((p) => lire(p)).join('\n');
const idsCrees = new Set([...sourcesJs.matchAll(/id:\s*['"`]([\w-]+)['"`]/g), ...sourcesJs.matchAll(/\sid="([\w-]+)"/g), ...sourcesJs.matchAll(/for:\s*['"]([\w-]+)['"]/g)].map((m) => m[1]));
for (const m of sourcesJs.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) if (!idsHtml.has(m[1]) && !idsCrees.has(m[1])) erreurs.push(`getElementById('${m[1]}') : aucun élément avec cet id`);
for (const m of sourcesJs.matchAll(/querySelector(?:All)?\(\s*['"]#([\w-]+)['"]\s*\)/g)) if (!idsHtml.has(m[1]) && !idsCrees.has(m[1])) erreurs.push(`querySelector('#${m[1]}') : aucun élément avec cet id`);
const css = lister('css', (p) => p.endsWith('.css')).map(lire).join('\n');
for (const m of sourcesJs.matchAll(/querySelector(?:All)?\(\s*['"]\.([\w-]+)['"]\s*\)/g)) if (!css.includes(`.${m[1]}`) && !sourcesJs.includes(`'${m[1]}`) && !sourcesJs.includes(` ${m[1]}`)) erreurs.push(`querySelector('.${m[1]}') : classe inconnue`);
// références d'html vers des fichiers
for (const m of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)) {
  if (/^https?:/.test(m[1])) continue;
  if (!existsSync(join(RACINE, m[1].replace(/^\.\//, '')))) erreurs.push(`index.html : fichier introuvable « ${m[1]} »`);
}
const manifeste = JSON.parse(lire('manifest.webmanifest'));
for (const i of manifeste.icons) if (!existsSync(join(RACINE, i.src))) erreurs.push(`manifest : icône introuvable ${i.src}`);
if (manifeste.start_url !== './' || manifeste.scope !== './' || !manifeste.id) erreurs.push('manifest : start_url / scope doivent valoir « ./ » et id être défini');

// --- 3. cache du service worker
const sw = lire('sw.js');
const coquille = [...sw.matchAll(/^\s*'(\.\/[^']*)',?$/gm)].map((m) => m[1]);
for (const f of coquille) { const p = f === './' ? 'index.html' : f.slice(2); if (!existsSync(join(RACINE, p))) erreurs.push(`sw.js : fichier en cache introuvable ${f}`); }
for (const f of lister('js', (p) => p.endsWith('.js') && !p.includes('/v2/'))) if (!coquille.includes(`./${f}`)) erreurs.push(`sw.js : module absent du cache ${f}`);
for (const f of lister('css', (p) => p.endsWith('.css'))) if (!coquille.includes(`./${f}`)) erreurs.push(`sw.js : feuille absente du cache ${f}`);

// --- 4. chemins absolus, 5. URL externes
const aVerifier = ['index.html', 'sw.js', 'manifest.webmanifest', ...lister('js', (p) => p.endsWith('.js')), ...lister('css', (p) => p.endsWith('.css'))];
const URL_AUTORISEES = [/^https:\/\/generativelanguage\.googleapis\.com/, /^http:\/\/www\.w3\.org\/2000\/svg/];
for (const f of aVerifier) {
  const src = lire(f);
  for (const m of src.matchAll(/(?:src|href)\s*=\s*["']\/(?!\/)/g)) erreurs.push(`${f} : chemin absolu (${m[0]})`);
  for (const m of src.matchAll(/['"`]\/(js|css|icons|vendor|sw\.js|index\.html|manifest)/g)) erreurs.push(`${f} : chemin absolu « ${m[0]} »`);
  for (const m of src.matchAll(/https?:\/\/[^\s'"`)<>]+/g)) if (!URL_AUTORISEES.some((r) => r.test(m[0]))) erreurs.push(`${f} : URL externe « ${m[0]} »`);
}

// --- 6. version
const vSw = sw.match(/const VERSION = '([^']+)'/)?.[1];
const vApp = lire('js/version.js').match(/versionApp = '([^']+)'/)?.[1];
if (vSw !== vApp) erreurs.push(`Version du service worker (${vSw}) ≠ version de l'app (${vApp})`);

if (erreurs.length) {
  console.error(`✗ Vérification statique : ${erreurs.length} problème(s)`);
  for (const e of erreurs) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✓ Vérification statique : ${modules.length} modules, ${coquille.length} fichiers en cache, aucun chemin absolu, aucune URL externe hors API Gemini.`);
