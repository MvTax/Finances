// capture.js — dépenses lues sur une capture d'écran (appli bancaire, reçu, mail de commande).
// Lecture sur le téléphone (Tesseract, chargé à la demande depuis vendor/tesseract) puis analyse des lignes :
// montants en €, dates (« Aujourd'hui », « Hier », « Mardi 3 novembre », « 05/11 »), libellés.
// Rien n'est enregistré ici : l'écran de revue fait confirmer chaque opération.

import { ajouterJours, diffJours, estIso } from './dates.js';

const MOIS = { janv: 1, janvier: 1, fevr: 2, fevrier: 2, fev: 2, mars: 3, avr: 4, avril: 4, mai: 5, juin: 6, juil: 7, juillet: 7, aout: 8, sept: 9, septembre: 9, oct: 10, octobre: 10, nov: 11, novembre: 11, dec: 12, decembre: 12 };
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n) => String(n).padStart(2, '0');

// Montant suivi de € / EUR (ou précédé de €) : « -18,90 € », « +20 € », « 1 049,00 € », « €12.50 »
const RE_MONTANT = /(?:([+\-−–])\s?)?(\d{1,3}(?:[   .]\d{3})+(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?)\s?(?:€|EUR\b|eur\b)|€\s?([+\-−–])?\s?(\d+(?:[,.]\d{1,2})?)/g;

/** Tous les montants d'une ligne : [{ centimes, signe, debut, fin }]. */
export function montantsDansLigne(texte) {
  const res = [];
  for (const m of texte.matchAll(RE_MONTANT)) {
    const brut = m[2] ?? m[4];
    const signe = m[1] ?? m[3] ?? '';
    let n = brut.replace(/[   ]/g, '');
    // « 1.049,00 » : le point sépare les milliers ; « 12.50 » : décimales
    if (/[.,]\d{1,2}$/.test(n)) n = n.slice(0, -3).replace(/[.,]/g, '') + n.slice(-3).replace(/^[.,](\d)$/, '.$10').replace(',', '.');
    else n = n.replace(/[.,]/g, '');
    const v = Math.round(Number(n.replace(/,(\d)$/, '.$1')) * 100);
    if (Number.isFinite(v) && v > 0) res.push({ centimes: v, signe: signe === '+' ? '+' : signe ? '-' : '', debut: m.index, fin: m.index + m[0].length });
  }
  return res;
}

/** Date la plus récente (≤ aujourd'hui) pour un jour et un mois sans année. */
function dateJourMois(j, m, a, auj) {
  if (!(j >= 1 && j <= 31 && m >= 1 && m <= 12)) return null;
  if (a) { const an = a < 100 ? 2000 + a : a; const d = `${an}-${pad(m)}-${pad(j)}`; return estIso(d) ? d : null; }
  const an = Number(auj.slice(0, 4));
  let d = `${an}-${pad(m)}-${pad(j)}`;
  if (!estIso(d)) return null;
  if (d > ajouterJours(auj, 1)) d = `${an - 1}-${pad(m)}-${pad(j)}`;
  return d;
}

/** Date trouvée dans un texte (ou null) : relative, « 3 novembre », « 03/11 », « 03/11/2026 », jour de la semaine. */
export function dateDansTexte(texte, auj) {
  const t = sansAccents(texte.toLowerCase());
  if (/aujourd.?hui/.test(t)) return auj;
  if (/avant[- ]?hier/.test(t)) return ajouterJours(auj, -2);
  if (/\bhier\b/.test(t)) return ajouterJours(auj, -1);
  let m = t.match(/\b(\d{1,2})(?:er)?\s+(janv(?:ier)?|fevr?(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|aout|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|dec(?:embre)?)\.?(?:\s+(\d{4}))?/);
  if (m) return dateJourMois(Number(m[1]), MOIS[m[2]] || MOIS[m[2].slice(0, 4)] || MOIS[m[2].slice(0, 3)], m[3] ? Number(m[3]) : null, auj);
  m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/);
  if (m) return dateJourMois(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null, auj);
  m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m && estIso(m[0])) return m[0];
  const j = JOURS.findIndex((x) => new RegExp(`^\\s*${x}\\b`).test(t));
  if (j >= 0) {
    const auj0 = new Date(`${auj}T12:00:00Z`).getUTCDay();
    const recul = ((auj0 - j + 7) % 7) || 7; // « Mardi » sans date = le mardi précédent (aujourd'hui s'écrirait « Aujourd'hui »)
    return ajouterJours(auj, -recul);
  }
  return null;
}

// Lignes qui ne sont pas des opérations : soldes, totaux de période, plafonds…
const IGNORER = /\b(solde|disponible|plafond|budget|depense(?:s|es)? (?:ce|du|en) mois|total (?:des )?depenses|economis|cashback|a venir|encours|limite|sous-?total|tva|dont\b)/;
const TOTAL = /^\s*(total(?: ttc| paye| a payer| regle)?|montant (?:total|paye|regle)|a payer|net a payer)\b/;
const CREDIT = /\b(virement (?:de|recu)|recu de|remboursement|rembourse|salaire|depot|refund|from)\b/;
/** En dessous, la ligne est signalée « à vérifier » (lecture incertaine, souvent un « - » ou un chiffre mal lu). */
export const SEUIL_CONFIANCE = 85;
const HEURE = /\b\d{1,2}[:h]\d{2}\b/g;

/** Nettoie un libellé : retire montants, dates, heures, puces et préfixes bancaires collés (« CBLIDL »). */
function nettoyer(texte) {
  return texte
    .replace(RE_MONTANT, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ')
    .replace(HEURE, ' ')
    .replace(/^[\s•·|>*\-–—:]+|[\s•·|<*\-–—:]+$/g, '')
    .replace(/^(?:[^\p{L}\p{N}\s]|[a-zàé])\s+(?=\p{Lu})/u, '') // icône lue comme « © », « @ », « e » devant le nom
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^(CB|PRLV|VIR)(?=[A-Z]{3})/, '$1 ');
}

/**
 * Transforme les lignes lues sur une capture en opérations.
 * @param {Array<string|{texte:string}>} lignes dans l'ordre de lecture (haut → bas)
 * @param {string} auj date du jour AAAA-MM-JJ
 * @returns {{ mode: 'liste'|'recu', operations: Array<{ sens, montantCentimes, libelle, date, dateDevinee }> }}
 */
export function extraireOperations(lignes, auj) {
  const objets = lignes.map((l) => (typeof l === 'string' ? { texte: l, confiance: 100 } : { texte: l.texte || '', confiance: l.confiance ?? 100 }))
    .map((l) => ({ ...l, texte: l.texte.replace(/\s+/g, ' ').trim() })).filter((l) => l.texte);
  const L = objets.map((l) => l.texte);
  const conf = objets.map((l) => l.confiance);
  const premiereDate = L.map((l) => dateDansTexte(l, auj)).find(Boolean) || null;

  // Reçu ou mail de commande : une ligne « Total » → une seule dépense, le total
  const iTotal = L.findIndex((l) => TOTAL.test(sansAccents(l.toLowerCase())) && montantsDansLigne(l).length);
  if (iTotal >= 0) {
    const m = montantsDansLigne(L[iTotal]).at(-1);
    const titre = L.find((l) => !montantsDansLigne(l).length && !dateDansTexte(l, auj) && nettoyer(l).length >= 2);
    return { mode: 'recu', operations: [{ sens: 'debit', montantCentimes: m.centimes, libelle: titre ? nettoyer(titre) : 'Achat', date: premiereDate || auj, dateDevinee: !premiereDate, incertain: conf[iTotal] < SEUIL_CONFIANCE }] };
  }

  const operations = [];
  let dateCourante = null;
  let precedente = null; // dernière ligne de texte sans montant (nom au-dessus du montant)
  for (const [i, ligne] of L.entries()) {
    const montants = montantsDansLigne(ligne);
    const dateLigne = dateDansTexte(ligne, auj);
    const norm = sansAccents(ligne.toLowerCase());
    if (!montants.length) {
      // En-tête de date (« Hier », « Mardi 3 novembre ») : peu de texte en dehors de la date
      if (dateLigne && nettoyer(ligne.replace(/\b(aujourd.?hui|avant-?hier|hier|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}(?:er)?|\d{4}|janv\w*|f[ée]vr?\w*|mars|avr\w*|mai|juin|juil\w*|ao[uû]t|sept\w*|oct\w*|nov\w*|d[ée]c\w*)\b\.?/gi, '')).length <= 3) { dateCourante = dateLigne; precedente = null; continue; }
      if (nettoyer(ligne).length >= 2 && !/^\d/.test(nettoyer(ligne))) precedente = ligne;
      continue;
    }
    const m = montants.at(-1);
    let libelle = nettoyer(ligne);
    let source = ligne;
    if (libelle.length < 2 && precedente) { libelle = nettoyer(precedente); source = precedente; }
    precedente = null;
    // Solde, plafond, total du mois… (sur la ligne ou sur le titre juste au-dessus d'un montant seul)
    if (IGNORER.test(norm) || IGNORER.test(sansAccents(source.toLowerCase()))) continue;
    if (libelle.length < 2) libelle = ligne.trim().startsWith('+') || m.signe === '+' ? 'Entrée' : 'Dépense';
    const sens = m.signe === '+' ? 'credit' : m.signe === '-' ? 'debit' : (CREDIT.test(sansAccents(libelle.toLowerCase())) ? 'credit' : 'debit');
    const date = dateLigne || dateCourante;
    operations.push({ sens, montantCentimes: m.centimes, libelle: libelle.slice(0, 80), date: date || auj, dateDevinee: !date, incertain: conf[i] < SEUIL_CONFIANCE });
  }
  return { mode: 'liste', operations };
}

/** Clé de dédoublonnage entre plusieurs captures qui se chevauchent. */
const cleOp = (o) => `${o.sens}|${o.montantCentimes}|${o.date}|${sansAccents((o.libelle || '').toLowerCase()).replace(/[^a-z0-9]/g, '')}`;
const cleNom = (o) => `${o.date}|${sansAccents((o.libelle || '').toLowerCase()).replace(/[^a-z]/g, '').slice(0, 8)}`;
export function fusionnerCaptures(listes) {
  const toutes = listes.flat();
  // Une lecture incertaine d'une opération lue nettement sur une autre capture (même nom, même jour) est écartée
  const nettes = new Set(toutes.filter((o) => !o.incertain).map(cleNom));
  const vus = new Set(); const res = [];
  for (const o of toutes) {
    if (o.incertain && listes.length > 1 && nettes.has(cleNom(o))) continue;
    const k = cleOp(o); if (vus.has(k)) continue; vus.add(k); res.push(o);
  }
  return res;
}

/** Opération déjà dans l'app (même sens, même montant, à 3 jours près) : proposée décochée. */
export function dejaPresente(etat, o) {
  return (etat.transactions || []).find((t) => !t.ajustement && t.sens === o.sens && t.montantCentimes === o.montantCentimes && Math.abs(diffJours(t.date, o.date)) <= 3) || null;
}

/** Banque reconnue sur la capture (pour proposer le bon compte). */
export function devinerBanque(lignes) {
  const t = sansAccents(lignes.map((l) => (typeof l === 'string' ? l : l.texte || '')).join(' ').toLowerCase());
  if (/revolut/.test(t)) return 'revolut';
  if (/\blcl\b|credit lyonnais|\bprlv sepa\b|^cb |\bcb [a-z]/.test(t)) return 'lcl';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Lecture de l'image sur le téléphone

let moteur = null;

/** Prépare l'image : niveaux de gris, fond clair (une capture en mode sombre est inversée). */
async function preparer(fichier) {
  const src = await createImageBitmap(fichier);
  // Agrandir un peu aide la lecture des petits signes (« - », « + ») ; plafond pour les captures très longues
  let echelle = Math.min(2, Math.max(1, 1700 / src.width));
  echelle = Math.max(1, Math.min(echelle, Math.sqrt(16e6 / (src.width * src.height))));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * echelle); c.height = Math.round(src.height * echelle);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, c.width, c.height);
  src.close?.();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let somme = 0;
  for (let i = 0; i < d.length; i += 4) { const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = g; somme += g; }
  if (somme / (d.length / 4) < 110) for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Lit le texte d'une capture sur le téléphone. Le premier appel télécharge le moteur (~5 Mo, gardé hors ligne).
 * @returns {Promise<Array<{ texte, confiance }>>} lignes de haut en bas (confiance de lecture 0–100)
 */
export async function lireCapture(fichier, { surProgres } = {}) {
  if (!moteur) {
    surProgres?.('Préparation de la lecture (la première fois seulement)…');
    const base = new URL('../vendor/tesseract/', import.meta.url).href;
    const mod = await import(new URL('tesseract.esm.min.js', base).href);
    const T = mod.default || mod;
    const { default: donnees } = await import(new URL('fra-donnees.js', base).href);
    const octets = Uint8Array.from(atob(donnees), (c) => c.charCodeAt(0)); // gzip : décompressé par Tesseract
    moteur = await T.createWorker([{ code: 'fra', data: octets }], 1, { workerPath: `${base}worker.min.js`, corePath: base, workerBlobURL: false, cacheMethod: 'none' });
  }
  surProgres?.('Lecture de la capture…');
  const image = await preparer(fichier);
  const { data } = await moteur.recognize(image, {}, { blocks: true, text: true });
  const lignes = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) lignes.push({ texte: l.text.trim(), confiance: Math.round(l.confidence), y: l.bbox.y0, x: l.bbox.x0 });
  if (!lignes.length) return (data.text || '').split('\n');
  // Ordre de lecture : de haut en bas, puis de gauche à droite pour les lignes à la même hauteur
  return lignes.sort((a, b) => (Math.abs(a.y - b.y) < 12 ? a.x - b.x : a.y - b.y)).map(({ texte, confiance }) => ({ texte, confiance }));
}
