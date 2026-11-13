// verif-confidentialite.mjs — contrôle OBLIGATOIRE avant de publier le dépôt (qui est PUBLIC).
// Échoue (code 1) si le dépôt contient : un IBAN (FR + 2 chiffres…), une suite de 10 chiffres ou plus,
// une adresse e-mail, un fichier privé (*.prive.json, prive/), ou l'un des termes sensibles extraits
// À LA VOLÉE de tes vrais relevés. Cette liste de termes est construite EN MÉMOIRE : elle n'est jamais écrite.
//
// Usage :
//   node tools/verif-confidentialite.mjs                         → motifs génériques seulement
//   node tools/verif-confidentialite.mjs --releves ../prive/pdf  → + termes sensibles tirés des PDF (hors dépôt)
//   … --detail                                                   → affiche les termes trouvés (sur ta machine uniquement)

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const detail = args.includes('--detail'); // affiche le terme trouvé (à n'utiliser que sur ta machine)
const dossierReleves = args.includes('--releves') ? resolve(args[args.indexOf('--releves') + 1]) : null;

const BINAIRES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.zip']);
const IGNORES = new Set(['.git', 'node_modules']);

function lister(dossier) {
  const res = [];
  for (const e of readdirSync(dossier)) {
    if (IGNORES.has(e)) continue;
    const p = join(dossier, e);
    if (statSync(p).isDirectory()) res.push(...lister(p)); else res.push(p);
  }
  return res;
}

// Mots courants (bancaires ou français) qui ne désignent personne : jamais traités comme sensibles
const MOTS_COMMUNS = new Set(['CREDIT', 'VIREMENT', 'NUMERO', 'CAPITAL', 'PARIS', 'COMMERCE', 'COMPTE', 'BOURSE', 'CEDEX', 'SAINT', 'FRANCE', 'MARNE', 'SEINE', 'BOULEVARD', 'AVENUE', 'CHEMIN', 'PLACE', 'ROUTE', 'ALLEE', 'IMPASSE', 'ENVOYE', 'PAIEMENT', 'AUTRES', 'MAISON', 'MARCHE', 'CLEAN', 'MARIE', 'CHEZ', 'RELEVE', 'IDENTITE', 'BANCAIRE', 'LYONNAIS', 'TITULAIRE', 'DOMICILIATION', 'CREDIT LYONNAIS', 'RELEVE D\'IDENTITE BANCAIRE', 'TITULAIRE DU COMPTE']);

const normaliser = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

// ---------------------------------------------------------------------------
// Termes sensibles extraits des relevés (en mémoire uniquement)
// ---------------------------------------------------------------------------
async function termesDepuisReleves(dossier) {
  const { extrairePages } = await import('../js/import/pdf-loader.js');
  const { parserLCL, estReleveLCL } = await import('../js/import/lcl-pdf.js');
  const { parserRevolut, estReleveRevolut } = await import('../js/import/revolut-pdf.js');
  const { traiterImport, jetonsTitulaire } = await import('../js/import/pipeline.js');
  const { REGLES_DEFAUT, normaliserMarchand, MARCHANDS_CONNUS } = await import('../js/rules.js');
  const connus = new Set([...MARCHANDS_CONNUS].map(normaliser));
  const termes = new Set();
  const ajouter = (t) => { const n = normaliser(String(t)).replace(/\s+/g, ' ').trim(); if (n.length >= 4 && !MOTS_COMMUNS.has(n)) termes.add(n); };
  const resultats = [];
  const pdfs = readdirSync(dossier).filter((f) => f.toLowerCase().endsWith('.pdf'));
  for (const f of pdfs) {
    const pages = await extrairePages(new Uint8Array(readFileSync(join(dossier, f))));
    const texte = pages.flatMap((p) => p.items.map((i) => i.str));
    // IBAN, RIB et identifiants imprimés en clair
    for (const t of texte) {
      for (const m of t.matchAll(/FR\d{2}(?:\s?[0-9A-Z]{4}){4,7}/g)) ajouter(m[0].replace(/\s/g, ''));
      if (/^(Date de naissance|Identifiant client)/i.test(t)) ajouter(t);
    }
    // Bloc d'adresse du client en page 1 (LCL : à droite en haut ; Revolut : à gauche sous le nom). Mentions légales exclues.
    const p1 = pages[0]?.items || [];
    const blocClient = estReleveLCL(pages) ? p1.filter((i) => i.y > 105 && i.y < 250) : p1.filter((i) => i.x < 120 && i.y > 140 && i.y < 230);
    for (const it of blocClient) {
      const l = it.str.trim();
      if (l.length > 50 || /^(Date|Comptes?|du \d|-+)/i.test(l) || /^-+$/.test(l)) continue;
      ajouter(l);
      for (const mot of l.split(/[\s,-]+/)) if (mot.length >= 5 && !MOTS_COMMUNS.has(normaliser(mot))) ajouter(mot);
    }
    if (estReleveRevolut(pages)) {
      resultats.push({ resultat: parserRevolut(pages), compteId: 'rev' });
    } else if (estReleveLCL(pages)) {
      resultats.push({ resultat: parserLCL(pages), compteId: 'lcl' });
    }
  }
  const imp = traiterImport(resultats, { transactions: [], regles: [], profil: {} });
  for (const j of imp.jetonsTitulaire) ajouter(j);
  for (const r of resultats) if (r.resultat.titulaire) ajouter(r.resultat.titulaire);
  // Particuliers (noms de famille et prénoms de 5 lettres ou plus)
  for (const t of imp.nouvelles) if (t.personne) { ajouter(t.personne); for (const mot of t.personne.split(/[\s-]+/)) if (mot.length >= 5 && !MOTS_COMMUNS.has(normaliser(mot))) ajouter(mot); }
  // Commerces locaux et employeurs : tout marchand qui n'est pas une enseigne connue (nom complet)
  for (const t of imp.nouvelles) {
    if (t.virementInterne?.estInterne || t.epargne?.estEpargne || t.personne) continue;
    const m = normaliser(t.marchand);
    if (connus.has(m) || m.length < 5 || MOTS_COMMUNS.has(m)) continue;
    ajouter(m);
  }
  // Créanciers et références de prélèvement
  for (const t of imp.nouvelles) {
    for (const m of (t.libelleBrut || '').matchAll(/ID\.CREANCIER:\s*(\S+)|REF\.MANDAT:\s*(\S+)/g)) ajouter(m[1] || m[2]);
    const prlv = (t.libellePrincipal || '').match(/^PRLV SEPA (.+)$/i);
    if (prlv && !REGLES_DEFAUT.some((r) => new RegExp(r.motif).test(` | ${normaliser(normaliserMarchand(t.libellePrincipal))}`))) ajouter(prlv[1]);
  }
  return termes;
}

// ---------------------------------------------------------------------------
const MOTIFS = [
  ['IBAN', /\bFR\d{2}(?:[ ]?[0-9A-Z]{4}){3,}/g],
  ['suite de 10 chiffres ou plus', /\d{10,}/g],
  ['adresse e-mail', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g],
];
// Bibliothèque tierce minifiée : constantes numériques légitimes (entiers 32 bits…). Les autres motifs s'y appliquent.
const EXCEPTIONS_CHIFFRES = [/^vendor\/pdfjs\//, /^vendor\/tesseract\//]; // constantes de bibliothèques tierces

const fichiers = lister(RACINE);
const problemes = [];
let termes = new Set();
// Le dossier vendor/ (pdf.js minifié, tiers) n'est pas comparé aux termes : identifiants aléatoires sans rapport avec tes données.
if (dossierReleves) {
  if (!existsSync(dossierReleves)) { console.error(`Dossier de relevés introuvable : ${dossierReleves}`); process.exit(2); }
  if (!relative(RACINE, dossierReleves).startsWith('..')) { console.error('Le dossier des relevés doit être HORS du dépôt.'); process.exit(2); }
  termes = await termesDepuisReleves(dossierReleves);
}

for (const f of fichiers) {
  const rel = relative(RACINE, f).split('\\').join('/');
  if (/\.prive\.json$/i.test(rel) || /(^|\/)prive\//.test(rel)) { problemes.push(`${rel} : fichier privé présent dans le dépôt`); continue; }
  if (/\.(pdf|csv)$/i.test(rel) && !/^tests\/fixtures\/.+-synthetique[^/]*\.(pdf|csv)$/.test(rel)) { problemes.push(`${rel} : PDF/CSV non synthétique`); continue; }
  if (BINAIRES.has(extname(rel).toLowerCase())) continue;
  const brut = readFileSync(f, 'latin1');
  // PDF : seul le texte affiché compte (les tables de références contiennent des décalages à 10 chiffres)
  const texte = /\.pdf$/i.test(rel) ? [...brut.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((m) => m[1]).join('\n') : brut;
  for (const [nom, re] of MOTIFS) {
    if (nom.startsWith('suite') && EXCEPTIONS_CHIFFRES.some((r) => r.test(rel))) continue;
    for (const m of texte.matchAll(re)) {
      // Domaines réservés aux exemples (RFC 2606) : jamais une vraie adresse.
      if (nom === 'adresse e-mail' && /@(?:[a-z0-9-]+\.)*example(?:\.(?:com|org|net))?$/i.test(m[0])) continue;
      problemes.push(`${rel} : ${nom} « ${m[0].slice(0, 6)}… »`);
    }
  }
  if (termes.size && !/^vendor\//.test(rel)) {
    const n = normaliser(/\.pdf$/i.test(rel) ? texte : Buffer.from(brut, 'latin1').toString('utf8')).replace(/\s+/g, ' ');
    for (const t of termes) if (new RegExp(`(^|[^A-Z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Z0-9])`).test(n)) problemes.push(`${rel} : terme sensible tiré des relevés (${detail ? `« ${t} »` : `${t.length} caractères, masqué`})`);
  }
}

if (problemes.length) {
  console.error(`✗ Confidentialité : ${problemes.length} problème(s)`);
  for (const p of problemes) console.error('  - ' + p);
  process.exit(1);
}
console.log(`✓ Confidentialité : ${fichiers.length} fichiers parcourus, aucun IBAN, aucune suite de 10+ chiffres, aucune adresse e-mail${termes.size ? `, aucun des ${termes.size} termes sensibles extraits des relevés (liste gardée en mémoire)` : ' (termes sensibles non vérifiés : passe --releves <dossier hors dépôt>)'}.`);
