// bridge.js — pont avec l'app « Repas & Courses » (contrat « budget-repas », version 1). Voir BRIDGE.md.
// Sur iPhone, chaque app installée a son propre stockage et un lien ouvre Safari, pas l'autre PWA :
// transports = fragment d'URL (#bridge=…), fichier .json (feuille de partage), presse-papier.
// Réception : validation stricte, aperçu, confirmation — jamais d'exécution automatique.

export const CONTRAT = 'budget-repas';
export const VERSION = 1;
export const TYPES = ['liste_courses', 'achats_ticket', 'profil_nutrition'];
export const TAILLE_MAX_FRAGMENT = 32000; // caractères après « #bridge= »

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(octets) {
  let s = ''; for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deb64url(s) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}

async function flux(octets, Transfo, format) {
  const s = new Blob([octets]).stream().pipeThrough(new Transfo(format));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** Empreinte SHA-256 (hex, 16 premiers caractères) du contenu canonique de l'enveloppe. */
export async function empreinte(env) {
  const canon = JSON.stringify({ contrat: env.contrat, version: env.version, type: env.type, emisLe: env.emisLe, source: env.source, donnees: env.donnees });
  const h = await crypto.subtle.digest('SHA-256', enc.encode(canon));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export async function construireEnveloppe(type, donnees, { source = 'budget', emisLe = new Date().toISOString() } = {}) {
  if (!TYPES.includes(type)) throw new Error(`Type inconnu : ${type}`);
  const env = { contrat: CONTRAT, version: VERSION, type, emisLe, source, donnees };
  env.somme = await empreinte(env);
  return env;
}

/** Encodage pour le fragment d'URL : « z » + deflate-raw si CompressionStream existe, sinon « j » + JSON. */
export async function encoder(env) {
  const octets = enc.encode(JSON.stringify(env));
  if (globalThis.CompressionStream) {
    try { return 'z' + b64url(await flux(octets, CompressionStream, 'deflate-raw')); } catch { /* repli */ }
  }
  return 'j' + b64url(octets);
}

export async function decoder(chaine) {
  const s = String(chaine || '').trim().replace(/^#?bridge=/, '');
  if (!s) throw new Error('Message vide.');
  let octets = deb64url(s.slice(1));
  if (s[0] === 'z') {
    if (!globalThis.DecompressionStream) throw new Error('Ce navigateur ne sait pas décompresser ce message : utilise le partage de fichier.');
    octets = await flux(octets, DecompressionStream, 'deflate-raw');
  } else if (s[0] !== 'j') throw new Error('Format de message inconnu.');
  return JSON.parse(dec.decode(octets));
}

const estNombre = (x) => typeof x === 'number' && Number.isFinite(x);
const estEntier = (x) => Number.isInteger(x);
const estDate = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

function validerDonnees(type, d) {
  const e = [];
  if (!d || typeof d !== 'object') return ['donnees absentes'];
  if (type === 'liste_courses') {
    if (!estEntier(d.joursCouverts) || d.joursCouverts < 0) e.push('joursCouverts');
    if (!estDate(d.reportCoursesAu)) e.push('reportCoursesAu');
    if (!estEntier(d.economieEstimeeCentimes)) e.push('economieEstimeeCentimes');
    for (const k of ['ingredientsDisponibles', 'repasPossibles', 'articlesManquants']) if (!Array.isArray(d[k])) e.push(k);
    for (const a of d.articlesManquants || []) if (typeof a?.nom !== 'string') { e.push('articlesManquants.nom'); break; }
  } else if (type === 'achats_ticket') {
    if (!Array.isArray(d.tickets)) e.push('tickets');
    for (const t of d.tickets || []) {
      if (!estDate(t.date) || typeof t.marchand !== 'string' || !Array.isArray(t.articles)) { e.push('ticket'); break; }
      for (const a of t.articles) if (typeof a?.nom !== 'string' || !estEntier(a.prixCentimes) || typeof a.sucre !== 'boolean') { e.push('article'); break; }
    }
  } else if (type === 'profil_nutrition') {
    if (!Array.isArray(d.interdits) || d.interdits.some((x) => typeof x !== 'string')) e.push('interdits');
    if (d.budgetRepasCibleCentimes !== undefined && !estEntier(d.budgetRepasCibleCentimes)) e.push('budgetRepasCibleCentimes');
    if (d.objectifs !== undefined && (typeof d.objectifs !== 'object' || d.objectifs === null)) e.push('objectifs');
  }
  return e;
}

/** Validation stricte d'une enveloppe reçue. Renvoie { ok, erreurs }. */
export async function valider(env) {
  const erreurs = [];
  if (!env || typeof env !== 'object') return { ok: false, erreurs: ['Message illisible.'] };
  if (env.contrat !== CONTRAT) erreurs.push('Contrat inconnu.');
  if (env.version !== VERSION) erreurs.push(`Version ${env.version} non prise en charge (attendue : ${VERSION}).`);
  if (!TYPES.includes(env.type)) erreurs.push('Type inconnu.');
  if (!['budget', 'repas'].includes(env.source)) erreurs.push('Source inconnue.');
  if (typeof env.emisLe !== 'string' || Number.isNaN(Date.parse(env.emisLe))) erreurs.push('Date d’émission invalide.');
  erreurs.push(...validerDonnees(env.type, env.donnees).map((x) => `Champ invalide : ${x}.`));
  if (!erreurs.length && env.somme !== (await empreinte(env))) erreurs.push('Empreinte d’intégrité incorrecte : message modifié ou tronqué.');
  return { ok: erreurs.length === 0, erreurs };
}

/** « Tu as de quoi tenir 2 jours de plus. Courses décalées au JJ/MM : tu économises X € cette semaine. » */
export function messageFrigo(r) {
  const d = r.reportCoursesAu; const jj = `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const eur = (c) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(c / 100);
  return `Tu as de quoi tenir ${r.joursCouverts} jour${r.joursCouverts > 1 ? 's' : ''} de plus. Courses décalées au ${jj} : tu économises ${eur(r.economieEstimeeCentimes)} cette semaine.`;
}

// ---------------------------------------------------------------------------
// Transports (navigateur)
// ---------------------------------------------------------------------------

async function partager(env, nomFichier) {
  const texte = JSON.stringify(env, null, 2);
  const fichier = new File([texte], nomFichier, { type: 'application/json' });
  const { etat } = await import('./store.js');
  const url = etat.parametres.urlAppRepas;
  const charge = await encoder(env);
  if (url && charge.length <= TAILLE_MAX_FRAGMENT && navigator.share) {
    try { await navigator.share({ url: `${url.split('#')[0]}#bridge=${charge}`, title: 'Budget → Repas' }); return 'lien'; } catch (e) { if (e?.name === 'AbortError') return null; }
  }
  if (navigator.canShare?.({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: 'Budget → Repas' }); return 'fichier'; } catch (e) { if (e?.name === 'AbortError') return null; }
  }
  await navigator.clipboard.writeText(`#bridge=${charge}`);
  const { toast } = await import('./ui/toast.js');
  toast('Message copié : colle-le dans l’app Repas (« Coller depuis l’autre app »).');
  return 'presse-papier';
}

export async function envoyerListeCourses(r) {
  const env = await construireEnveloppe('liste_courses', r);
  return partager(env, 'liste-courses.json');
}

export async function envoyerAchatsTicket(jours = 7) {
  const { etat } = await import('./store.js');
  const { ajouterJours, aujourdhui } = await import('./dates.js');
  const depuis = ajouterJours(aujourdhui(), -jours);
  const tickets = etat.transactions.filter((t) => t.date >= depuis && t.articles?.length).map((t) => ({ date: t.date, marchand: t.marchand, totalCentimes: t.montantCentimes, articles: t.articles.map((a) => ({ nom: a.nom, prixCentimes: a.prixCentimes, quantite: a.quantite || 1, sucre: !!a.sucre, categorie: a.categorie || 'courses' })) }));
  if (!tickets.length) throw new Error('Aucun ticket photographié ces 7 derniers jours.');
  return partager(await construireEnveloppe('achats_ticket', { tickets }), 'achats-tickets.json');
}

export async function coller() {
  const texte = await navigator.clipboard.readText();
  const t = texte.trim();
  if (t.startsWith('{')) return JSON.parse(t);
  const m = t.match(/bridge=([A-Za-z0-9_-]+)/) || t.match(/^([zj][A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('Le presse-papier ne contient pas de message de l’app Repas.');
  return decoder(m[1]);
}

/** Aperçu + confirmation, puis application (Budget ne reçoit que « profil_nutrition »). */
export async function recevoir(env) {
  const { ouvrirFeuille } = await import('./ui/sheet.js');
  const { h } = await import('./ui/dom.js');
  const { bouton } = await import('./ui/composants.js');
  const { toast } = await import('./ui/toast.js');
  const { majParametres, enregistrer, nouvelId } = await import('./store.js');
  const v = await valider(env);
  if (!v.ok) { toast(`Message refusé : ${v.erreurs.join(' ')}`, { type: 'erreur', duree: 7000 }); return false; }
  if (env.type !== 'profil_nutrition') { toast('Ce message est destiné à l’app Repas & Courses, pas à Budget.', { type: 'erreur' }); return false; }
  return new Promise((resolve) => {
    let ok = false;
    const f = ouvrirFeuille({
      titre: 'Profil nutrition reçu',
      contenu: h('div', {}, h('p', {}, `Émis le ${env.emisLe.slice(0, 10).split('-').reverse().join('/')} par l’app Repas.`), h('p', {}, `Interdits : ${env.donnees.interdits.join(', ') || 'aucun'}.`), env.donnees.budgetRepasCibleCentimes ? h('p', {}, `Budget repas cible : ${(env.donnees.budgetRepasCibleCentimes / 100).toFixed(2).replace('.', ',')} €.`) : null, h('p', { class: 'petit' }, 'Il sert à l’alerte « Repose-le » à la saisie et sur les tickets.')),
      actions: [bouton('Refuser', () => f.fermer()), bouton('Appliquer', async () => { ok = true; await majParametres({ profilNutrition: env.donnees }); await enregistrer('bridgeRecus', { id: nouvelId('br'), type: env.type, emisLe: env.emisLe, recuLe: new Date().toISOString(), somme: env.somme }); f.fermer(); toast('Profil nutrition appliqué.', { type: 'succes' }); }, { classe: 'btn-principal' })],
      onFermer: () => resolve(ok),
    });
  });
}
