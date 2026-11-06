// diagnostic.js — test complet de l'app depuis Réglages → Diagnostic, avec un rapport Markdown détaillé
// (lisible par un humain et par une IA). Le rapport est ANONYMISÉ : aucun libellé d'opération, aucun prénom,
// aucune clé. Il contient des identifiants internes, des dates, des montants et des mesures techniques.
// Les tests Gemini sont facultatifs et n'envoient que des contenus de test (phrase fictive, son synthétique).

import { etat } from './store.js';
import { ouvrirBase, lireTout, lireUn, ecrire, supprimer } from './db.js';
import { SCHEMA_VERSION, STORES_V1, STORES_V2, STORES_V3 } from './migrations.js';
import { versionApp } from './version.js';
import { journal, masquerSecrets } from './journal.js';
import { CATEGORIES, FAMILLES, contributionDepense } from './categories.js';
import { aujourdhui, estIso, ajouterJours } from './dates.js';
import { formatEuros } from './money.js';
import { resteADepenser, jaugeDuJour, soldes, projectionDecouvert, epargneDuMois, depensesVariables, depensesParCategorie, periodeBudget, reliquat, prelevementsHorsCharges } from './calculs.js';
import { planDesMois, scenariosPret } from './plan.js';
import { soldePoche } from './epargne.js';
import { tableauAmortissement, verifierCoherencePret } from './dettes.js';
import { planActionLocal } from './coach.js';
import { raisonner } from './raisonnement.js';
import { analyser } from './detecteurs.js';
import { construireExport, lireSauvegarde } from './sauvegarde.js';
import { planifierMiseAJour, resumeMiseAJour } from './miseajour.js';
import { analyserPhrase } from './saisie.js';
import { parseMontant } from './money.js';
import { nouvelleTransaction } from './actions.js';
import { arrondiTransaction } from './epargne.js';
import { construireEnveloppe, encoder, decoder, valider as validerPont } from './bridge.js';
import { iaDisponible, modeleActif, listerModeles, choisirFlashStable, genererJSON, configReflexion } from './gemini.js';
import { analyserTexteIA, analyserVoix, analyserTicket, categoriserInconnus } from './ia.js';
import { choisirMime, mimePourGemini, voixDisponible, blobEnBase64 } from './voice.js';
import { extraireOperations } from './capture.js';

const ROUTES = [
  ['accueil', []], ['depenses', []], ['budgets', []],
  ['epargne', ['poches']], ['epargne', ['plan']], ['epargne', ['dettes']], ['epargne', ['simulateur']],
  ['statistiques', ['bilan']], ['statistiques', ['conseils']], ['avenir', []], ['abonnements', []],
  ['reglages', []], ...['revenus', 'epargne', 'operations', 'sauvegarde', 'profil', 'confidentialite', 'gemini', 'pont', 'diagnostic', 'apropos'].map((x) => ['reglages', [x]]),
  ['reglages', ['import']], ['reglages', ['questions']], ['reglages', ['regles']], ['reglages', ['charges']],
];
const PAGES = {
  accueil: () => import('./pages/accueil.js'), depenses: () => import('./pages/depenses.js'), budgets: () => import('./pages/budgets.js'),
  epargne: () => import('./pages/epargne.js'), historique: () => import('./pages/historique.js'), statistiques: () => import('./pages/historique.js'), avenir: () => import('./pages/avenir.js'), reglages: () => import('./pages/reglages.js'), abonnements: () => import('./pages/abonnements.js'),
};

const IDS_CAT = new Set(CATEGORIES.map((c) => c.id));
const ent = (v) => Number.isInteger(v);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const eur = (c) => (ent(c) ? formatEuros(c) : String(c));

/**
 * Lance le diagnostic complet.
 * @param {{ gemini?: boolean, surProgres?: (etape: { section, nom, statut }) => void }} o
 * @returns {Promise<{ resultats, markdown, json, duree }>}
 */
export async function lancerDiagnostic(o = {}) {
  const resultats = [];
  const debut = performance.now();
  const lanceLe = new Date();
  let section = '';
  const S = (nom) => { section = nom; };
  /** Exécute un test. fn renvoie une chaîne (OK + détail) ou { statut, detail, donnees }. */
  const file = [];
  /** Enregistre un test. fn renvoie une chaîne (OK + détail) ou { statut, detail, donnees }. */
  const test = (nom, fn) => { file.push({ section, nom, fn }); };
  const executer = async ({ section: sec, nom, fn }, i) => {
    const t0 = performance.now();
    let r;
    try {
      const v = await fn();
      r = typeof v === 'string' || v === undefined ? { statut: 'ok', detail: v || '' } : { statut: v.statut || 'ok', detail: v.detail || '', donnees: v.donnees };
    } catch (e) {
      r = { statut: 'echec', detail: masquerSecrets(`${e?.name || 'Erreur'} : ${e?.message || e}${e?.code ? ` [code ${e.code}]` : ''}${e?.stack ? `\n${String(e.stack).split('\n').slice(0, 3).join('\n')}` : ''}`) };
    }
    const res = { section: sec, nom, ...r, ms: Math.round(performance.now() - t0) };
    resultats.push(res);
    o.surProgres?.(res, { fait: i + 1, total: file.length });
    await pause(0); // laisse l'interface afficher la progression
  };

  // ---------------------------------------------------------------- 1. Environnement
  S('Environnement');
  test('Version de l’app', () => ({ statut: 'info', detail: `Budget ${versionApp}, schéma de données ${SCHEMA_VERSION}`, donnees: { versionApp, SCHEMA_VERSION } }));
  test('Appareil et navigateur', () => {
    const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
    const d = { userAgent: navigator.userAgent, plateforme: navigator.platform, langue: navigator.language, fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone, ecranInstalle: standalone, enLigne: navigator.onLine,
      fenetre: `${innerWidth}×${innerHeight}`, ecran: `${screen.width}×${screen.height}`, densite: devicePixelRatio, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair', mouvementReduit: matchMedia('(prefers-reduced-motion: reduce)').matches,
      connexion: navigator.connection ? { type: navigator.connection.effectiveType, rtt: navigator.connection.rtt } : null };
    return { statut: standalone ? 'ok' : 'avert', detail: `${standalone ? 'App installée (écran d’accueil)' : 'Ouverte dans le navigateur, pas installée : le stockage peut être effacé par iOS'} ; ${d.fenetre} @${d.densite}x ; ${d.fuseau} ; ${d.enLigne ? 'en ligne' : 'HORS LIGNE'}`, donnees: d };
  });
  test('Date du jour', () => {
    const local = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const a = aujourdhui();
    return { statut: a === local ? 'ok' : 'echec', detail: `aujourdhui() = ${a}, date de Paris = ${local}`, donnees: { aujourdhui: a, paris: local, iso: new Date().toISOString() } };
  });
  test('Fonctions du navigateur', async () => {
    const f = {
      IndexedDB: 'indexedDB' in globalThis, ServiceWorker: 'serviceWorker' in navigator, CacheStorage: 'caches' in globalThis,
      CompressionStream: typeof CompressionStream === 'function', cryptoSubtle: !!crypto?.subtle, partage: typeof navigator.share === 'function',
      partageFichiers: typeof navigator.canShare === 'function' && (() => { try { return navigator.canShare({ files: [new File(['x'], 't.txt', { type: 'text/plain' })] }); } catch { return false; } })(),
      pressePapier: !!navigator.clipboard?.writeText, MediaRecorder: typeof MediaRecorder === 'function', getUserMedia: !!navigator.mediaDevices?.getUserMedia,
      IntersectionObserver: typeof IntersectionObserver === 'function', visualViewport: !!window.visualViewport, structuredClone: typeof structuredClone === 'function',
      persistance: !!navigator.storage?.persist, cssHas: CSS.supports?.('selector(:has(a))') || false, cssColorMix: CSS.supports?.('color', 'color-mix(in srgb, red 50%, blue)') || false,
      cssDvh: CSS.supports?.('height', '100dvh') || false, cssBackdrop: CSS.supports?.('backdrop-filter', 'blur(2px)') || CSS.supports?.('-webkit-backdrop-filter', 'blur(2px)') || false,
    };
    const manquantes = Object.entries(f).filter(([, v]) => !v).map(([k]) => k);
    const critiques = manquantes.filter((k) => ['IndexedDB', 'cryptoSubtle'].includes(k));
    return { statut: critiques.length ? 'echec' : manquantes.length ? 'avert' : 'ok', detail: manquantes.length ? `Absentes : ${manquantes.join(', ')}` : 'Toutes présentes', donnees: f };
  });
  test('Format des montants (fr-FR)', () => {
    const v = formatEuros(123456).replace(/[  ]/g, ' ');
    const n = formatEuros(-5).replace(/[  ]/g, ' ');
    return { statut: v === '1 234,56 €' && /0,05 €$/.test(n) && /^[-−]/.test(n) ? 'ok' : 'echec', detail: `123456 → « ${v} », −5 → « ${n} »` };
  });
  test('Stockage disponible', async () => {
    if (!navigator.storage?.estimate) return { statut: 'avert', detail: 'navigator.storage.estimate indisponible' };
    const e = await navigator.storage.estimate();
    const persiste = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    return { statut: persiste === false ? 'avert' : 'ok', detail: `${(e.usage / 1e6).toFixed(2)} Mo utilisés sur ${(e.quota / 1e6).toFixed(0)} Mo ; stockage persistant : ${persiste === null ? 'inconnu' : persiste ? 'oui' : 'NON (iOS peut effacer les données : sauvegarde chaque semaine)'}`, donnees: { usage: e.usage, quota: e.quota, persiste } };
  });
  test('Permission micro', async () => {
    if (!navigator.permissions?.query) return { statut: 'info', detail: 'API Permissions indisponible (normal sur iOS)' };
    try { const p = await navigator.permissions.query({ name: 'microphone' }); return { statut: p.state === 'denied' ? 'avert' : 'info', detail: `État : ${p.state}` }; } catch { return { statut: 'info', detail: 'Non interrogeable sur ce navigateur' }; }
  });

  // ---------------------------------------------------------------- 2. Service worker et cache hors ligne
  S('Hors ligne (service worker et cache)');
  let swTexte = null;
  test('Enregistrement du service worker', async () => {
    if (!('serviceWorker' in navigator)) return { statut: 'echec', detail: 'Service worker non pris en charge' };
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { statut: 'echec', detail: 'Aucun service worker enregistré : l’app ne marchera pas hors ligne' };
    const d = { scope: reg.scope, actif: reg.active?.state || null, enAttente: !!reg.waiting, installation: !!reg.installing, controle: !!navigator.serviceWorker.controller };
    return { statut: d.actif === 'activated' && d.controle ? (d.enAttente ? 'avert' : 'ok') : 'avert', detail: `actif : ${d.actif || 'non'} ; contrôle la page : ${d.controle ? 'oui' : 'non'}${d.enAttente ? ' ; MISE À JOUR EN ATTENTE (bouton « Mettre à jour »)' : ''}`, donnees: d };
  });
  test('Version du service worker = version de l’app', async () => {
    const r = await fetch('./sw.js', { cache: 'no-store' });
    swTexte = await r.text();
    const v = swTexte.match(/const VERSION = '([^']+)'/)?.[1];
    return { statut: v === versionApp ? 'ok' : 'echec', detail: `sw.js en ligne : ${v || '?'} ; app chargée : ${versionApp}${v !== versionApp ? ' → recharge l’app (une version plus récente est publiée, ou l’inverse)' : ''}` };
  });
  test('Fichiers de l’app présents dans le cache', async () => {
    if (!('caches' in globalThis)) return { statut: 'echec', detail: 'CacheStorage indisponible' };
    const noms = await caches.keys();
    const liste = swTexte ? [...(swTexte.match(/const COQUILLE = \[([\s\S]*?)\];/)?.[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
    const manquants = [];
    for (const f of liste) if (!(await caches.match(new URL(f, location.href).href))) manquants.push(f);
    return { statut: !liste.length ? 'avert' : manquants.length ? 'echec' : 'ok', detail: `${noms.length} cache(s) : ${noms.join(', ') || 'aucun'} ; ${liste.length - manquants.length}/${liste.length} fichiers en cache${manquants.length ? ` ; MANQUANTS : ${manquants.slice(0, 15).join(', ')}${manquants.length > 15 ? '…' : ''}` : ''}`, donnees: { caches: noms, manquants } };
  });
  test('Réseau : chargement des fichiers principaux', async () => {
    if (!navigator.onLine) return { statut: 'info', detail: 'Hors ligne : test ignoré' };
    const fichiers = ['./index.html', './manifest.webmanifest', './js/app.js', './css/variables.css', './vendor/pdfjs/pdf.min.mjs'];
    const res = [];
    for (const f of fichiers) {
      const t0 = performance.now();
      try { const r = await fetch(f, { cache: 'no-store' }); res.push({ f, statut: r.status, ms: Math.round(performance.now() - t0), octets: (await r.arrayBuffer()).byteLength }); } catch (e) { res.push({ f, statut: 'erreur', detail: e.message }); }
    }
    const ko = res.filter((x) => x.statut !== 200);
    return { statut: ko.length ? 'echec' : 'ok', detail: res.map((x) => `${x.f} ${x.statut} (${x.ms ?? '?'} ms)`).join(' ; '), donnees: res };
  });

  // ---------------------------------------------------------------- 3. Base de données
  S('Base de données (IndexedDB)');
  test('Ouverture et schéma', async () => {
    const db = await ouvrirBase();
    const attendus = [...Object.keys(STORES_V1), ...Object.keys(STORES_V2), ...Object.keys(STORES_V3)];
    const presents = [...db.objectStoreNames];
    const manquants = attendus.filter((x) => !presents.includes(x));
    return { statut: db.version === SCHEMA_VERSION && !manquants.length ? 'ok' : 'echec', detail: `version ${db.version} (attendue ${SCHEMA_VERSION}) ; ${presents.length} stores${manquants.length ? ` ; MANQUANTS : ${manquants.join(', ')}` : ''}` };
  });
  test('Écriture, lecture et suppression', async () => {
    const cle = '__diagnostic__';
    const v = { cle, t: Date.now() };
    const t0 = performance.now();
    await ecrire('meta', v);
    const lu = await lireUn('meta', cle);
    await supprimer('meta', cle);
    const apres = await lireUn('meta', cle);
    const ok = lu?.t === v.t && !apres;
    return { statut: ok ? 'ok' : 'echec', detail: `aller-retour en ${Math.round(performance.now() - t0)} ms${ok ? '' : ' : LECTURE OU SUPPRESSION INCORRECTE'}` };
  });
  test('Mémoire de l’app = contenu de la base', async () => {
    const ecarts = []; const comptes = {};
    for (const s of Object.keys(STORES_V1)) {
      if (['meta', 'profil', 'parametres'].includes(s)) continue;
      const disque = (await lireTout(s)).length;
      comptes[s] = disque;
      if (Array.isArray(etat[s]) && etat[s].length !== disque) ecarts.push(`${s} : ${etat[s].length} en mémoire, ${disque} sur le disque`);
    }
    return { statut: ecarts.length ? 'echec' : 'ok', detail: ecarts.length ? ecarts.join(' ; ') : Object.entries(comptes).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', '), donnees: comptes };
  });

  // ---------------------------------------------------------------- 4. Intégrité des données
  S('Intégrité des données');
  const tx = etat.transactions || [];
  const ids = new Set();
  test('Transactions : champs valides', () => {
    const pb = []; const doublonsId = [];
    const comptesIds = new Set((etat.comptes || []).map((c) => c.id));
    for (const t of tx) {
      if (ids.has(t.id)) doublonsId.push(t.id); ids.add(t.id);
      const e = [];
      if (!ent(t.montantCentimes) || t.montantCentimes < 0) e.push(`montant=${t.montantCentimes}`);
      if (!estIso(t.date)) e.push(`date=${t.date}`);
      if (!['debit', 'credit'].includes(t.sens)) e.push(`sens=${t.sens}`);
      if (!IDS_CAT.has(t.categorie)) e.push(`catégorie inconnue=${t.categorie}`);
      if (!comptesIds.has(t.compteId)) e.push(`compte inconnu=${t.compteId}`);
      if (t.date > ajouterJours(aujourdhui(), 1) && !t.ajustement) e.push('date future');
      if (t.montantCentimes === 0 && !t.ajustement) e.push('montant nul');
      if (e.length) pb.push({ id: t.id, date: t.date, problemes: e });
    }
    return { statut: pb.length || doublonsId.length ? 'echec' : 'ok', detail: `${tx.length} transactions ; ${pb.length} invalides ; ${doublonsId.length} identifiants en double`, donnees: { invalides: pb.slice(0, 40), doublonsId: doublonsId.slice(0, 20) } };
  });
  test('Transactions : liens internes', () => {
    const pb = [];
    for (const t of tx) {
      const lie = t.virementInterne?.transactionLieeId;
      if (lie && !ids.has(lie)) pb.push({ id: t.id, probleme: `virement interne lié à ${lie} introuvable` });
      if (t.remboursementDe && !ids.has(t.remboursementDe)) pb.push({ id: t.id, probleme: `remboursement de ${t.remboursementDe} introuvable` });
    }
    const internesSeuls = tx.filter((t) => t.virementInterne?.estInterne && !t.virementInterne.transactionLieeId).length;
    return { statut: pb.length ? 'avert' : 'ok', detail: `${pb.length} lien(s) cassé(s) ; ${internesSeuls} virement(s) interne(s) sans contrepartie (normal pour LCL → Revolut si la contrepartie est hors période)`, donnees: pb.slice(0, 30) };
  });
  test('Doublons probables', () => {
    const cles = new Map();
    for (const t of tx) { if (t.ajustement) continue; const k = `${t.compteId}|${t.date}|${t.sens}|${t.montantCentimes}|${t.libellePrincipal || t.libelle}`; cles.set(k, (cles.get(k) || []).concat(t.id)); }
    const groupes = [...cles.values()].filter((g) => g.length > 1);
    return { statut: groupes.length ? 'avert' : 'ok', detail: `${groupes.length} groupe(s) d’opérations identiques (même compte, jour, montant, libellé) : peut être légitime (2 cafés) ou un doublon d’import`, donnees: groupes.slice(0, 20) };
  });
  test('Lignes d’ajustement de solde', () => {
    const par = {};
    for (const t of tx.filter((x) => x.ajustement)) par[t.compteId] = (par[t.compteId] || 0) + 1;
    const multiples = Object.entries(par).filter(([, n]) => n > 1);
    return { statut: multiples.length ? 'echec' : 'ok', detail: Object.entries(par).map(([c, n]) => `${c} : ${n}`).join(', ') || 'aucune', donnees: par };
  });
  test('Soldes déclarés = soldes calculés', () => {
    const res = [];
    for (const c of etat.comptes || []) {
      if (!c.soldeReference) continue;
      const calc = soldes(etat, c.soldeReference.date).comptes.find((x) => x.compte.id === c.id)?.soldeCentimes;
      res.push({ compte: c.nom, date: c.soldeReference.date, declare: c.soldeReference.centimes, calcule: calc, ecart: calc - c.soldeReference.centimes });
    }
    const ko = res.filter((x) => x.ecart !== 0);
    return { statut: ko.length ? 'echec' : res.length ? 'ok' : 'info', detail: res.length ? res.map((x) => `${x.compte} au ${x.date} : déclaré ${eur(x.declare)}, calculé ${eur(x.calcule)}${x.ecart ? ` (ÉCART ${eur(x.ecart)})` : ''}`).join(' ; ') : 'Aucun solde déclaré', donnees: res };
  });
  test('Comptes', () => {
    const s = soldes(etat);
    const pb = s.comptes.filter((c) => !ent(c.soldeCentimes));
    return { statut: pb.length ? 'echec' : 'ok', detail: s.comptes.map((c) => `${c.compte.nom} (${c.compte.type}) ${eur(c.soldeCentimes)}`).join(' ; ') + ` ; global ${eur(s.globalCentimes)}`, donnees: s.comptes.map((c) => ({ id: c.compte.id, type: c.compte.type, solde: c.soldeCentimes })) };
  });
  test('Revenus mensuels', () => {
    const pb = (etat.revenusMensuels || []).filter((r) => !/^\d{4}-\d{2}$/.test(r.mois) || !ent(r.salaireCentimes ?? 0) || !ent(r.primeActiviteCentimes ?? 0));
    const mois = periodeBudget(aujourdhui(), etat.profil).mois;
    const cur = (etat.revenusMensuels || []).find((r) => r.mois === mois);
    return { statut: pb.length ? 'echec' : cur?.statut === 'confirme' ? 'ok' : 'avert', detail: `${(etat.revenusMensuels || []).length} mois ; mois en cours ${mois} : ${cur ? `${cur.statut}, salaire ${eur(cur.salaireCentimes)}, prime ${eur(cur.primeActiviteCentimes)}` : 'ABSENT'}${pb.length ? ` ; ${pb.length} invalide(s)` : ''}`, donnees: { invalides: pb.map((r) => r.mois) } };
  });
  test('Charges fixes', () => {
    const pb = (etat.chargesFixes || []).filter((c) => !ent(c.montantCentimes ?? c.montantPrevuCentimes ?? 0) || (c.jour && (c.jour < 1 || c.jour > 31)) || (c.categorie && !IDS_CAT.has(c.categorie)));
    return { statut: pb.length ? 'echec' : 'ok', detail: `${(etat.chargesFixes || []).length} charges (${(etat.chargesFixes || []).filter((c) => c.actif !== false).length} actives) ; ${pb.length} invalide(s)`, donnees: pb.map((c) => c.id) };
  });
  test('Enveloppes', () => {
    const vues = new Map(); const pb = [];
    for (const e of etat.enveloppes || []) {
      for (const c of e.categories || [e.categorie]) { if (!IDS_CAT.has(c)) pb.push(`${e.id} : catégorie inconnue ${c}`); if (vues.has(c)) pb.push(`catégorie ${c} dans 2 enveloppes (${vues.get(c)}, ${e.id})`); vues.set(c, e.id); }
      if (!ent(e.plafondMensuelCentimes) || e.plafondMensuelCentimes < 0) pb.push(`${e.id} : plafond ${e.plafondMensuelCentimes}`);
    }
    const sansEnveloppe = CATEGORIES.filter((c) => c.nature === 'depense' && !vues.has(c.id)).map((c) => c.id);
    return { statut: pb.length ? 'echec' : sansEnveloppe.length ? 'info' : 'ok', detail: `${(etat.enveloppes || []).length} enveloppes${pb.length ? ` ; ${pb.join(' ; ')}` : ''}${sansEnveloppe.length ? ` ; catégories de dépense suivies par aucune enveloppe : ${sansEnveloppe.join(', ')}` : ''}` };
  });
  test('Poches d’épargne', () => {
    const actives = (etat.poches || []).filter((p) => p.actif !== false);
    const pb = [];
    for (const p of etat.poches || []) for (const m of p.mouvements || []) if (!ent(m.montantCentimes) || m.montantCentimes <= 0 || !['versement', 'reprise'].includes(m.sens) || !estIso(m.date)) pb.push(`${p.id} : mouvement ${m.id} invalide`);
    const parts = actives.map((p) => p.partRepartition);
    const somme = parts.filter((x) => x !== null && x !== undefined).reduce((t, v) => t + v, 0);
    const toutesChiffrees = parts.every((x) => x !== null && x !== undefined);
    const partsOk = toutesChiffrees ? somme === 100 : true;
    return { statut: pb.length ? 'echec' : partsOk ? 'ok' : 'avert', detail: actives.map((p) => `${p.nom} ${eur(soldePoche(p))}${p.cibleCentimes ? ` / ${eur(p.cibleCentimes)}` : ''} (part ${p.partRepartition ?? 'remplie en premier'}${p.partRepartition !== null && p.partRepartition !== undefined ? ' %' : ''})`).join(' ; ') + (partsOk ? '' : ` ; SOMME DES PARTS = ${somme} % (attendu 100 %)`) + (pb.length ? ` ; ${pb.slice(0, 5).join(' ; ')}` : ''), donnees: actives.map((p) => ({ id: p.id, type: p.type, solde: soldePoche(p), cible: p.cibleCentimes, part: p.partRepartition })) };
  });
  test('Dettes envers des proches', () => {
    const pb = [];
    (etat.prets || []).forEach((p, k) => {
      const somme = (p.echeancier || []).reduce((t, e) => t + e.montantCentimes, 0);
      if (somme !== p.montantCentimes) pb.push(`proche n°${k + 1} : échéancier ${eur(somme)} ≠ montant ${eur(p.montantCentimes)}`);
      for (const e of p.echeancier || []) if (!estIso(e.date) || !ent(e.montantCentimes)) pb.push(`proche n°${k + 1} : échéance invalide`);
    });
    const enRetard = (etat.prets || []).flatMap((p, k) => (p.echeancier || []).filter((e) => !e.payee && e.date < aujourdhui()).map((e) => `proche n°${k + 1} le ${e.date}`));
    return { statut: pb.length ? 'echec' : enRetard.length ? 'avert' : 'ok', detail: `${(etat.prets || []).length} dette(s) (prénoms masqués)${pb.length ? ` ; ${pb.join(' ; ')}` : ''}${enRetard.length ? ` ; échéances passées non cochées : ${enRetard.join(', ')}` : ''}` };
  });
  test('Crédits bancaires', () => {
    const lignes = []; let statut = 'ok';
    for (const c of etat.creditsBancaires || []) {
      if (c.type === 'amortissable') {
        try {
          const t = tableauAmortissement(c);
          const coh = c.capitalCentimes && c.mensualiteCentimes ? verifierCoherencePret({ capitalCentimes: c.capitalCentimes, mensualiteCentimes: c.mensualiteCentimes, dureesAnnonceesMois: c.dureesAnnonceesMois || (c.dureeMois ? [c.dureeMois] : []) }) : null;
          lignes.push(`${c.libelle} : ${t.length} échéances, fin ${t[t.length - 1]?.date}${coh && !coh.coherent ? ', MENSUALITÉ INCOHÉRENTE avec les durées annoncées' : ''}${c.aConfirmer?.length ? `, à confirmer : ${c.aConfirmer.join(', ')}` : ''}`);
          if ((coh && !coh.coherent) || c.aConfirmer?.length) statut = statut === 'echec' ? statut : 'avert';
        } catch (e) { lignes.push(`${c.libelle} : TABLEAU IMPOSSIBLE (${e.message})`); statut = 'echec'; }
      } else {
        const ech = c.echeancier || [];
        const total = ech.reduce((t, e) => t + e.montantCentimes, 0);
        const restant = ech.filter((e) => !e.payee).reduce((t, e) => t + e.montantCentimes, 0);
        const retard = ech.filter((e) => !e.payee && e.date < aujourdhui()).length;
        if (total !== c.capitalCentimes) statut = statut === 'echec' ? statut : 'avert';
        if (retard) statut = statut === 'echec' ? statut : 'avert';
        lignes.push(`${c.libelle} : échéancier ${eur(total)} pour un capital de ${eur(c.capitalCentimes)}, reste ${eur(restant)}${retard ? `, ${retard} échéance(s) passée(s) non cochée(s)` : ''}`);
      }
    }
    return { statut, detail: lignes.join(' ; ') || 'Aucun crédit' };
  });
  test('Doublons de structure (après un import mélangé)', () => {
    const pb = [];
    const loyers = (etat.chargesFixes || []).filter((c) => c.actif && c.estLoyer);
    if (loyers.length > 1) pb.push(`${loyers.length} loyers actifs (compté plusieurs fois dans les charges)`);
    const parCompte = new Map(); for (const t of tx) parCompte.set(t.compteId, (parCompte.get(t.compteId) || 0) + 1);
    const courants = (etat.comptes || []).filter((c) => c.type === 'courant');
    const vides = courants.filter((c) => !(parCompte.get(c.id) > 3));
    if (courants.length > 1 && vides.length) pb.push(`compte(s) courant(s) presque vide(s) en plus du principal : ${vides.map((c) => c.nom).join(', ')} (la projection de découvert peut regarder le mauvais compte)`);
    const actives = (etat.poches || []).filter((p) => p.actif !== false);
    const avecPart = actives.filter((p) => p.partRepartition);
    if (avecPart.length && actives.some((p) => p.type === 'projet' && !p.cibleCentimes)) pb.push('poche « projet » sans objectif');
    const pret = (etat.poches || []).find((p) => p.type === 'remboursementAnticipe');
    if (pret && pret.actif === false && (etat.creditsBancaires || []).some((c) => c.type === 'amortissable')) pb.push('poche de remboursement anticipé désactivée alors qu’un prêt existe');
    const ar = etat.profil.arrondi;
    if (ar?.actif && !ar.depuis && !(etat.profil.debutSuivi || etat.profil.premierImportLe)) pb.push('arrondis sans date de départ : tout l’historique serait arrondi');
    const charges = new Map(); for (const c of (etat.chargesFixes || []).filter((x) => x.actif)) { const k = `${(c.libelle || '').toLowerCase()}|${c.montantCentimes}`; charges.set(k, (charges.get(k) || 0) + 1); }
    const doubles = [...charges].filter(([, n]) => n > 1).map(([k]) => k.split('|')[0]);
    if (doubles.length) pb.push(`charges fixes en double : ${doubles.join(', ')}`);
    return { statut: pb.length ? 'echec' : 'ok', detail: pb.length ? `${pb.join(' ; ')} → Réglages → Importer mon fichier → « Tout remplacer à la place » (tes saisies sont gardées)` : 'Aucun doublon de loyer, de compte ou de charge' };
  });
  test('Règles de catégorisation', () => {
    const pb = [];
    for (const r of etat.reglesCategorie || []) {
      if (!IDS_CAT.has(r.categorie)) pb.push(`${r.id} : catégorie ${r.categorie} inconnue`);
      if (r.motif && r.type === 'regex') { try { new RegExp(r.motif); } catch { pb.push(`${r.id} : expression invalide`); } }
    }
    return { statut: pb.length ? 'echec' : 'ok', detail: `${(etat.reglesCategorie || []).length} règle(s)${pb.length ? ` ; ${pb.slice(0, 8).join(' ; ')}` : ''}` };
  });
  test('Plan mensuel : égalités au centime', () => {
    const pb = []; const lignes = [];
    const poches = new Set((etat.poches || []).map((p) => p.id));
    for (const p of [...(etat.planMensuel || [])].sort((a, b) => (a.mois < b.mois ? -1 : 1))) {
      const ep = (p.allocationsPoches || []).reduce((t, a) => t + a.montantCentimes, 0);
      const dispo = p.revenusCentimes - p.chargesFixesCentimes - p.dettesDuMoisCentimes;
      const marge = p.disponibleCentimes - ep - (p.arrondisEstimesCentimes || 0) - p.vieCouranteCentimes;
      if (dispo !== p.disponibleCentimes) pb.push(`${p.mois} : disponible ${eur(p.disponibleCentimes)} ≠ ${eur(dispo)}`);
      if (marge !== p.margeCentimes) pb.push(`${p.mois} : marge ${eur(p.margeCentimes)} ≠ ${eur(marge)}`);
      if (p.margeCentimes < 0) pb.push(`${p.mois} : marge négative`);
      for (const a of p.allocationsPoches || []) if (!poches.has(a.pocheId)) pb.push(`${p.mois} : poche ${a.pocheId} inconnue`);
      lignes.push(`${p.mois} dispo ${eur(p.disponibleCentimes)} épargne ${eur(ep)} vie ${eur(p.vieCouranteCentimes)} marge ${eur(p.margeCentimes)} (${p.statut})`);
    }
    return { statut: pb.length ? 'echec' : 'ok', detail: (pb.length ? `${pb.join(' ; ')} — ` : '') + (lignes.join(' ; ') || 'Aucun plan enregistré'), donnees: lignes };
  });
  test('File d’attente Gemini et questions', () => {
    const file = etat.fileAttenteIA || [];
    const q = (etat.questions || []).filter((x) => x.statut === 'ouverte');
    return { statut: file.length ? 'avert' : 'ok', detail: `${file.length} saisie(s) en attente d’analyse${file.length ? ` (types : ${[...new Set(file.map((f) => f.type))].join(', ')} ; dernières erreurs : ${[...new Set(file.map((f) => f.derniereErreur || f.erreur).filter(Boolean))].slice(0, 3).join(' | ')})` : ''} ; ${q.length} question(s) ouverte(s) sur les relevés` };
  });

  // ---------------------------------------------------------------- 5. Calculs
  S('Calculs');
  const auj = aujourdhui();
  let r = null;
  test('Reste à dépenser', () => {
    r = resteADepenser(etat, auj);
    const recalc = r.revenus.totalCentimes - r.epargneCibleCentimes - r.chargesCentimes - r.dettesCentimes - r.depensesVariablesCentimes;
    const ok = recalc === r.resteCentimes && [r.resteCentimes, r.chargesCentimes, r.dettesCentimes, r.depensesVariablesCentimes].every(ent);
    return { statut: ok ? 'ok' : 'echec', detail: `période ${r.periode.debut} → ${r.periode.fin} : revenus ${eur(r.revenus.totalCentimes)} (${r.revenus.statut}) − épargne ${eur(r.epargneCibleCentimes)} − charges ${eur(r.chargesCentimes)} (${r.charges.length}) − dettes ${eur(r.dettesCentimes)} (${r.dettes.length}) − dépenses ${eur(r.depensesVariablesCentimes)} = ${eur(r.resteCentimes)}${ok ? '' : ` ; RECALCUL ${eur(recalc)}`}` };
  });
  test('Jauge du jour', () => {
    const j = jaugeDuJour(etat, auj, etat.meta?.jauge || null);
    const ok = ent(j.parJourCentimes) && j.joursRestants >= 1 && j.restantAujourdhuiCentimes === j.parJourCentimes - j.depensesDuJourCentimes;
    const snapAncien = etat.meta?.jauge && (etat.meta.jauge.date !== auj);
    return { statut: ok ? (snapAncien ? 'avert' : 'ok') : 'echec', detail: `${eur(j.parJourCentimes)}/jour sur ${j.joursRestants} jours ; dépensé aujourd’hui ${eur(j.depensesDuJourCentimes)} ; reste ${eur(j.restantAujourdhuiCentimes)}${j.critique ? ' ; MODE CRITIQUE' : ''}${snapAncien ? ` ; instantané stocké du ${etat.meta.jauge.date}` : ''}` };
  });
  test('Captures d’écran : lecture des lignes et moteur sur le téléphone', async () => {
    const r = extraireOperations(['Hier', 'Exemple -12,50 €', '10:00', 'Solde disponible', '100,00 €'], '2026-11-06');
    const analyseOk = r.operations.length === 1 && r.operations[0].montantCentimes === 1250 && r.operations[0].date === '2026-11-05';
    const fichiers = ['tesseract.esm.min.js', 'worker.min.js', 'fra-donnees.js'];
    const manquants = [];
    for (const f of fichiers) { try { const rep = await fetch(`./vendor/tesseract/${f}`, { method: 'HEAD' }); if (!rep.ok) manquants.push(f); } catch { manquants.push(f); } }
    const enCache = 'caches' in globalThis && (await caches.keys()).some((k) => k.startsWith('budget-tesseract'));
    return { statut: !analyseOk ? 'echec' : manquants.length ? 'avert' : 'ok', detail: `${analyseOk ? 'analyse des lignes OK' : 'ANALYSE DES LIGNES FAUSSE'} ; moteur ${manquants.length ? `introuvable (${manquants.join(', ')}) : hors ligne ?` : 'disponible'}${enCache ? ', déjà gardé hors ligne' : ', téléchargé à la première capture'}` };
  });
  test('Raisonnement du mois (constat → pourquoi → donc)', () => {
    const a = raisonner(etat, auj);
    const texte = JSON.stringify([a.titre, a.phrase, a.points]);
    const trous = /NaN|undefined|\bnull\b|—/.test(texte);
    const incomplets = a.points.filter((p) => !p.constat || !p.pourquoi || !p.donc).map((p) => p.id);
    return { statut: trous || incomplets.length ? 'echec' : a.points.length ? 'ok' : 'avert',
      detail: `verdict ${a.niveau} (« ${a.titre} ») ; ${a.points.length} points : ${a.points.map((p) => `${p.id}/${p.ton}`).join(', ')} ; budget ${eur(a.chiffres.parJour)}/jour ; engagements ${a.chiffres.engagePct ?? 0} % des revenus${trous ? ' ; TEXTE INCOMPLET (NaN/undefined)' : ''}${incomplets.length ? ` ; points incomplets : ${incomplets.join(', ')}` : ''}`,
      donnees: { niveau: a.niveau, points: a.points.map((p) => ({ id: p.id, ton: p.ton })), parJour: a.chiffres.parJour, manque: a.chiffres.manque } };
  });
  test('Projection de découvert (7 jours)', () => {
    const p = projectionDecouvert(etat, auj, { jours: 7 });
    if (!p) return { statut: 'info', detail: 'Aucun compte courant' };
    return { statut: p.risque ? 'avert' : 'ok', detail: `${p.compte.nom} : solde ${eur(p.soldeActuelCentimes)}, après prélèvements ${eur(p.soldeApresChargesCentimes)} ; ${p.nonCouverts?.length || 0} prélèvement(s) non couvert(s)${p.premierNegatif ? ` ; passe sous 0 le ${p.premierNegatif.date}` : ''} ; rythme ${eur(p.rythmeCentimes)}/jour`, donnees: { nonCouverts: (p.nonCouverts || []).map((e) => ({ date: e.date, montant: e.montantCentimes, type: e.type })) } };
  });
  test('Épargne du mois', () => {
    const e = epargneDuMois(etat, auj);
    const ok = e.nette.nette === e.nette.versements - e.nette.reprises;
    return { statut: ok ? 'ok' : 'echec', detail: `nette ${eur(e.nette.nette)} (versé ${eur(e.nette.versements)}, repris ${eur(e.nette.reprises)}) ; cible ${eur(e.cibleCentimes)} ; projetée ${eur(e.projectionCentimes)} ; arrondis à virer ${eur(e.cagnotteCentimes)}` };
  });
  test('Dépenses par catégorie = dépenses variables', () => {
    const per = r?.periode || periodeBudget(auj, etat.profil);
    const debut = ajouterJours(auj, -90);
    const total = depensesVariables(etat, debut, auj);
    const fixes = (etat.transactions || []).filter((t) => t.chargeFixeId && t.date >= debut && t.date <= auj).reduce((s, t) => s + contributionDepense(t), 0)
      + prelevementsHorsCharges(etat, debut, auj).reduce((s, c) => s + c.montantPrevuCentimes, 0); // abonnements et prélèvements non rattachés
    const parCatBrut = depensesParCategorie(etat, debut, auj, { inclureEtalees: false });
    const parCat = parCatBrut;
    const somme = (Array.isArray(parCat) ? parCat : Object.values(parCat)).reduce((t, c) => t + (c.montantCentimes ?? c ?? 0), 0);
    const familles = {};
    for (const c of Array.isArray(parCat) ? parCat : []) { const f = CATEGORIES.find((x) => x.id === c.categorie)?.famille || '?'; familles[f] = (familles[f] || 0) + c.montantCentimes; }
    return { statut: somme === total + fixes ? 'ok' : 'echec', detail: `90 jours : variables ${eur(total)} + charges, abonnements et prélèvements ${eur(fixes)} = ${eur(total + fixes)} ; somme par catégorie ${eur(somme)}${somme !== total + fixes ? ` (ÉCART ${eur(somme - total - fixes)})` : ''} ; par famille : ${Object.entries(familles).map(([f, v]) => `${FAMILLES.find((x) => x.id === f)?.nom || f} ${eur(v)}`).join(', ')} ; période en cours ${per.debut} → ${per.fin}` };
  });
  test('Plan sur 24 mois', () => {
    const t0 = performance.now();
    const mois = periodeBudget(auj, etat.profil).mois;
    const proj = planDesMois(etat, mois, 24);
    const negatifs = proj.filter((l) => l.plan.margeCentimes < 0).map((l) => l.mois);
    return { statut: negatifs.length ? 'echec' : 'ok', detail: `${proj.length} mois calculés en ${Math.round(performance.now() - t0)} ms ; marges négatives : ${negatifs.join(', ') || 'aucune'} ; mois 1 : ${proj[0] ? `${proj[0].mois} épargne ${eur(proj[0].plan.allocationsPoches.reduce((t, a) => t + a.montantCentimes, 0))}` : '—'}` };
  });
  test('Scénarios du prêt', () => {
    const sc = scenariosPret(etat, periodeBudget(auj, etat.profil).mois, 60);
    if (!sc) return { statut: 'info', detail: 'Pas de prêt amortissable complet ou pas de poche de remboursement anticipé' };
    return `sans anticipé : fin ${sc.sansAnticipe.finLe} ; répartition : fin ${sc.repartition.finLe}, intérêts ${eur(sc.repartition.interetsCentimes)} ; tout sur le prêt : fin ${sc.pret.finLe}`;
  });
  test('Analyses du bilan (90 jours)', () => {
    const t0 = performance.now();
    const a = analyser(etat, ajouterJours(auj, -90), auj);
    return `${Object.keys(a || {}).length} analyses en ${Math.round(performance.now() - t0)} ms`;
  });
  test('Coach local (« Y remédier »)', () => {
    const t0 = performance.now();
    const c = planActionLocal(etat, { fin: auj, nbMois: 3 });
    const cartes = Array.isArray(c) ? c : c?.cartes || [];
    const pb = cartes.filter((x) => !ent(x.economieMensuelleCentimes ?? 0));
    return { statut: pb.length ? 'echec' : 'ok', detail: `${cartes.length} action(s) en ${Math.round(performance.now() - t0)} ms${pb.length ? ` ; ${pb.length} sans économie chiffrée valide` : ''}` };
  });


  // ---------------------------------------------------------------- 5 bis. Calculs dans le temps et performance
  S('Calculs sur les 30 prochains jours');
  test('Périodes de budget enchaînées (60 jours)', () => {
    const pb = [];
    for (let i = 0; i < 60; i++) {
      const d = ajouterJours(auj, i); const p = periodeBudget(d, etat.profil);
      if (!(p.debut <= d && d <= p.fin)) pb.push(`${d} hors de sa période ${p.debut}→${p.fin}`);
      const suivante = periodeBudget(ajouterJours(p.fin, 1), etat.profil);
      // Salaire attendu pas encore arrivé : la période se prolonge jour après jour (même début), sinon elle doit s'enchaîner
      if (suivante.debut !== p.debut && suivante.debut !== ajouterJours(p.fin, 1)) pb.push(`trou ou chevauchement après ${p.fin}`);
    }
    return { statut: pb.length ? 'echec' : 'ok', detail: pb.length ? [...new Set(pb)].slice(0, 6).join(' ; ') : `Chaque jour appartient à une seule période, sans trou ; dates de salaire connues : ${(etat.profil.datesSalaire || []).slice(-3).join(', ') || 'aucune (jour habituel)'}` };
  });
  test('Budget du jour, jour par jour jusqu’à la fin de la période', () => {
    const per = periodeBudget(auj, etat.profil); const lignes = []; const pb = [];
    let jours = null;
    for (let d = auj; d <= per.fin && d <= ajouterJours(auj, 40); d = ajouterJours(d, 1)) {
      const j = jaugeDuJour(etat, d, null);
      if (!ent(j.parJourCentimes) || !ent(j.restantAujourdhuiCentimes)) pb.push(`${d} : valeur non entière`);
      if (jours !== null && j.joursRestants !== jours - 1 && !(jours === 1 && j.joursRestants === 1)) pb.push(`${d} : jours restants ${j.joursRestants} (attendu ${jours - 1})`);
      jours = j.joursRestants;
      if (lignes.length < 6 || d === per.fin) lignes.push(`${d.slice(5)} ${eur(j.parJourCentimes)}`);
    }
    return { statut: pb.length ? 'echec' : 'ok', detail: (pb.length ? `${pb.slice(0, 5).join(' ; ')} — ` : '') + lignes.join(' ; ') };
  });
  test('Reste du mois (aperçu avant salaire, versement à l’épargne après)', () => {
    const rl = reliquat(etat, auj);
    const faits = etat.meta.reliquats || {};
    return { statut: 'info', detail: `mois en cours ${rl.periode.debut} → ${rl.periode.fin}${rl.periode.theorique ? ' (jour de salaire habituel)' : ' (dates de salaire réelles)'} ; aperçu avant salaire : ${rl.courant.avantSalaire ? eur(rl.courant.montantCentimes) : 'pas encore (plus de 3 jours)'} ; reste du mois précédent (${rl.precedent.mois}) : ${eur(rl.precedent.montantCentimes)}${faits[rl.precedent.mois] ? ` (${faits[rl.precedent.mois].statut})` : ''} ; début du suivi : ${etat.profil.debutSuivi || etat.profil.premierImportLe || 'non défini'}` };
  });
  test('Projection de découvert sur 30 jours', () => {
    const p = projectionDecouvert(etat, auj, { jours: 30 });
    if (!p) return { statut: 'info', detail: 'Aucun compte courant' };
    const ev = p.evenements || [];
    return { statut: p.premierNegatif ? 'avert' : 'ok', detail: `${ev.length} événement(s) prévus ; solde final projeté ${eur(p.soldeApresChargesCentimes)}${p.premierNegatif ? ` ; sous 0 dès le ${p.premierNegatif.date}` : ''} ; ${(p.nonCouverts || []).length} prélèvement(s) non couvert(s)`, donnees: ev.slice(0, 40).map((e) => ({ date: e.date, type: e.type, montant: e.montantCentimes })) };
  });
  test('Performance des calculs', () => {
    const mesure = (f, n) => { const t0 = performance.now(); for (let i = 0; i < n; i++) f(); return (performance.now() - t0) / n; };
    const a = mesure(() => resteADepenser(etat, auj), 30);
    const b = mesure(() => jaugeDuJour(etat, auj, null), 30);
    const c = mesure(() => soldes(etat), 30);
    const d = mesure(() => projectionDecouvert(etat, auj, { jours: 7 }), 10);
    const lent = Math.max(a, b, c, d) > 40;
    return { statut: lent ? 'avert' : 'ok', detail: `reste à dépenser ${a.toFixed(1)} ms ; jauge ${b.toFixed(1)} ms ; soldes ${c.toFixed(1)} ms ; projection ${d.toFixed(1)} ms (par appel, ${tx.length} opérations)` };
  });

  // ---------------------------------------------------------------- 5 ter. Saisie locale (sans Gemini)
  S('Saisie et catégorisation locales');
  test('Lecture des montants', () => {
    const cas = [['4,89', 489], ['4.89', 489], ['1 234,56', 123456], ['12 €', 1200], ['0,5', 50], ['12,345', null], ['abc', null]];
    const ko = cas.filter(([t, v]) => parseMontant(t) !== v).map(([t, v]) => `« ${t} » → ${parseMontant(t)} (attendu ${v})`);
    return { statut: ko.length ? 'echec' : 'ok', detail: ko.length ? ko.join(' ; ') : `${cas.length} formats lus correctement` };
  });
  test('Phrases tapées au clavier', () => {
    const hier = ajouterJours(auj, -1);
    const cas = [
      ['4,89 chez Lidl', (r) => r.montantCentimes === 489 && /lidl/i.test(r.libelle) && r.sens === 'debit'],
      ['2 fois 3,20 café hier', (r) => r.montantCentimes === 640 && r.date === hier],
      ['j’ai reçu 20 balles de ma sœur', (r) => r.montantCentimes === 2000 && r.sens === 'credit'],
      ['12,50 uber', (r) => r.montantCentimes === 1250],
    ];
    const ko = cas.filter(([t, f]) => { const r = analyserPhrase(t, auj); return !r || !f(r); }).map(([t]) => { const r = analyserPhrase(t, auj); return `« ${t} » → ${r ? `${r.sens} ${r.montantCentimes} « ${r.libelle} » ${r.date}` : 'rien'}`; });
    return { statut: ko.length ? 'avert' : 'ok', detail: ko.length ? ko.join(' ; ') : `${cas.length} phrases comprises` };
  });
  test('Catégorisation automatique de marchands courants', () => {
    const cas = [['Lidl', 'courses'], ['Carrefour', 'courses'], ['Uber Eats', 'livraison'], ['McDonald’s', 'restauration-rapide'], ['SNCF', 'train'], ['Pharmacie', 'pharmacie'], ['Netflix', 'abonnements']];
    const ko = [];
    for (const [lib, cat] of cas) { const t = nouvelleTransaction({ sens: 'debit', montantCentimes: 1000, libelle: lib }); if (t.categorie !== cat) ko.push(`${lib} → ${t.categorie} (attendu ${cat})`); }
    return { statut: ko.length ? 'avert' : 'ok', detail: ko.length ? ko.join(' ; ') : `${cas.length} marchands bien classés` };
  });
  test('Arrondi à l’euro supérieur', () => {
    const reglage = { ...(etat.profil.arrondi || {}), actif: true, depuis: '2000-01-01' };
    const a = arrondiTransaction({ sens: 'debit', montantCentimes: 489, categorie: 'courses', date: auj, compteId: 'lcl', source: 'texte' }, reglage);
    const b = arrondiTransaction({ sens: 'debit', montantCentimes: 500, categorie: 'courses', date: auj, compteId: 'lcl', source: 'texte' }, reglage);
    return { statut: a === 11 && b === 0 ? 'ok' : 'echec', detail: `4,89 € → +${a} centimes (attendu 11) ; 5,00 € → +${b} (attendu 0)` };
  });

  // ---------------------------------------------------------------- 5 quater. Mise à jour depuis le fichier privé
  S('Mise à jour depuis le fichier');
  test('État de la dernière mise à jour', () => {
    const m = etat.meta.derniereMiseAJour;
    const tombes = Object.entries(etat.meta.supprimes || {}).map(([c, t]) => `${c} ${t.ids?.length || 0}`).filter((x) => !/ 0$/.test(x));
    return { statut: 'info', detail: `${m ? `dernière le ${m.le.slice(0, 16).replace('T', ' ')} (${Object.entries(m.totaux || {}).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')})` : 'aucune mise à jour encore'} ; référence de fusion ${etat.meta.baseFichier ? 'présente' : 'absente'} ; estampilles ${(etat.meta.estampillesFichier || []).length} ; suppressions mémorisées : ${tombes.join(', ') || 'aucune'}` };
  });
  test('Mise à jour avec ses propres données = aucun changement', () => {
    const contenu = construireExport(etat, { version: versionApp }).contenu;
    const plan = planifierMiseAJour({ ...etat }, JSON.parse(JSON.stringify(contenu)), { estampilles: etat.meta.estampillesFichier || [], supprimes: etat.meta.supprimes || {} });
    const ok = !plan.ecritures.length && !plan.suppressions.length;
    return { statut: ok ? 'ok' : 'echec', detail: ok ? 'Idempotente : réappliquer les mêmes données ne change rien' : `${resumeMiseAJour(plan)} (${plan.ecritures.slice(0, 5).map((e) => `${e.collection}:${e.valeur.id || e.valeur.mois}`).join(', ')})` };
  });

  // ---------------------------------------------------------------- 5 quinquies. Apparence
  S('Apparence et lisibilité');
  for (const theme of ['clair', 'sombre']) {
    test(`Contrastes du thème ${theme}`, () => {
      const racine = document.documentElement; const avant = racine.dataset.theme;
      racine.dataset.theme = theme;
      try {
        const sonde = document.createElement('span'); document.body.append(sonde);
        const couleur = (v) => { sonde.style.color = `var(${v})`; return getComputedStyle(sonde).color; };
        const paires = [['--texte', '--fond', 4.5], ['--texte', '--surface', 4.5], ['--texte-2', '--surface', 4.5], ['--texte-3', '--surface', 4.5], ['--accent', '--surface', 4.5], ['--accent-texte', '--accent', 4.5], ['--hero-texte', '--hero-fond', 4.5], ['--hero-texte-2', '--hero-fond', 4.5], ['--rouge', '--surface', 4.5], ['--vert', '--surface', 4.5], ['--orange', '--surface', 4.5], ['--laiton', '--surface', 3], ['--texte', '--surface-2', 4.5]];
        const res = paires.map(([a, b, min]) => ({ a, b, min, r: contraste(couleur(a), couleur(b)) }));
        sonde.remove();
        const ko = res.filter((x) => !(x.r >= x.min));
        return { statut: ko.length ? 'avert' : 'ok', detail: (ko.length ? `INSUFFISANTS : ${ko.map((x) => `${x.a} sur ${x.b} ${x.r?.toFixed(2)}:1 (min ${x.min})`).join(' ; ')} — ` : '') + res.map((x) => `${x.a.slice(2)}/${x.b.slice(2)} ${x.r?.toFixed(1)}`).join(', ') };
      } finally { if (avant) racine.dataset.theme = avant; else delete racine.dataset.theme; }
    });
  }
  test('Catégories : famille, couleur et icône', () => {
    const pb = [];
    const sonde = document.createElement('span'); document.body.append(sonde);
    for (const c of CATEGORIES) {
      if (!FAMILLES.some((f) => f.id === c.famille)) pb.push(`${c.id} : famille ${c.famille} inconnue`);
      if (!document.getElementById(`i-${c.icone}`)) pb.push(`${c.id} : icône « ${c.icone} » absente`);
      sonde.style.color = ''; sonde.style.color = c.couleur;
      if (!sonde.style.color) pb.push(`${c.id} : couleur ${c.couleur} invalide`);
    }
    sonde.remove();
    return { statut: pb.length ? 'echec' : 'ok', detail: pb.length ? pb.join(' ; ') : `${CATEGORIES.length} catégories dans ${FAMILLES.length} familles, toutes avec couleur et icône` };
  });

  // ---------------------------------------------------------------- 6. Pages (rendu, débordements, textes suspects, accessibilité)
  S('Pages de l’app');
  for (const [nom, params] of ROUTES) {
    test(`#${[nom, ...params].join('/')}`, () => testerPage(nom, params));
  }
  S('Pages sur petit écran (320 px, iPhone SE)');
  for (const [nom, params] of ROUTES.filter(([n, p]) => ['accueil', 'depenses', 'budgets', 'epargne'].includes(n) || (n === 'reglages' && (!p.length || ['revenus', 'epargne'].includes(p[0]))))) {
    test(`#${[nom, ...params].join('/')} à 320 px`, () => testerPage(nom, params, 320));
  }

  // ---------------------------------------------------------------- 7. Sauvegarde, pont, lecteur PDF
  S('Sauvegarde, pont et import');
  test('Export puis relecture de la sauvegarde', () => {
    const exp = construireExport(etat, { version: versionApp });
    const texte = JSON.stringify(exp);
    const fuites = [];
    if (etat.parametres.cleGemini && texte.includes(etat.parametres.cleGemini)) fuites.push('CLÉ GEMINI');
    if (etat.parametres.pinHash && texte.includes(etat.parametres.pinHash)) fuites.push('EMPREINTE DU PIN');
    const relu = lireSauvegarde(JSON.parse(texte));
    const ecarts = relu.ok ? Object.keys(exp.contenu).filter((k) => Array.isArray(exp.contenu[k]) && relu.contenu[k]?.length !== exp.contenu[k].length) : [];
    return { statut: fuites.length || !relu.ok || ecarts.length ? 'echec' : 'ok', detail: `${(texte.length / 1024).toFixed(0)} Ko ; relecture ${relu.ok ? 'OK' : `ÉCHEC : ${relu.erreurs.join(' | ')}`}${ecarts.length ? ` ; collections différentes : ${ecarts.join(', ')}` : ''}${fuites.length ? ` ; FUITE DANS L’EXPORT : ${fuites.join(', ')}` : ' ; aucun secret exporté'}` };
  });
  test('Pont avec l’app Repas (aller-retour)', async () => {
    const env = await construireEnveloppe('profil_nutrition', { interdits: ['test'], objectifs: { proteinesG: 100 } }, { source: 'repas' });
    const charge = await encoder(env);
    const relu = await decoder(charge);
    const v = await validerPont(relu);
    return { statut: v.ok ? 'ok' : 'echec', detail: `charge ${charge.length} caractères (${charge[0] === 'z' ? 'compressée' : 'non compressée'}) ; validation ${v.ok ? 'OK' : v.erreurs?.join(' | ') || 'échec'}` };
  });
  test('Lecteur PDF (pdf.js)', async () => {
    const { chargerPdfjs } = await import('./import/pdf-loader.js');
    const t0 = performance.now();
    const p = await chargerPdfjs();
    return `version ${p.version || '?'} chargée en ${Math.round(performance.now() - t0)} ms`;
  });

  // ---------------------------------------------------------------- 8. Tests automatiques (mêmes cas que sous Node)
  S('Tests automatiques');
  test('Suite de tests', async () => {
    let CAS;
    try { ({ CAS } = await import('../tests/liste.mjs')); } catch (e) { return { statut: 'avert', detail: `Tests non chargés (hors ligne ou non publiés) : ${e.message}` }; }
    let ok = 0; const echecs = [];
    for (const [fichier, charger] of CAS) {
      let cas;
      try { cas = (await charger()).default; } catch (e) { echecs.push(`${fichier} : chargement impossible (${e.message})`); continue; }
      for (const c of cas) {
        try { await c.fn(); ok++; } catch (e) { echecs.push(`${fichier} › ${c.nom} : ${String(e.message).slice(0, 300)}`); }
      }
    }
    return { statut: echecs.length ? 'echec' : 'ok', detail: `${ok} réussi(s), ${echecs.length} en échec${echecs.length ? ` :\n- ${echecs.join('\n- ')}` : ''}` };
  });

  // ---------------------------------------------------------------- 9. Gemini (facultatif)
  S('Gemini');
  const ia = iaDisponible();
  test('Disponibilité', () => ({ statut: ia.ok ? 'ok' : 'info', detail: ia.ok ? `clé présente (${etat.parametres.cleGemini.length} caractères, masquée) ; modèle actif ${modeleActif()} ; réflexion des tâches courtes : ${JSON.stringify(configReflexion(modeleActif(), 'faible'))} ; appels aujourd’hui ${etat.parametres.appelsIA?.date === auj ? etat.parametres.appelsIA.nb : 0}` : ia.raison }));
  test('Micro et format audio de l’appareil', () => {
    const mime = choisirMime();
    return { statut: voixDisponible() && mime ? 'ok' : 'avert', detail: `enregistrement ${voixDisponible() ? 'possible' : 'IMPOSSIBLE'} ; format produit ${mime || 'aucun'} → envoyé à Gemini comme ${mimePourGemini(mime)}` };
  });
  if (o.gemini && ia.ok) {
    test('Liste des modèles', async () => {
      const t0 = performance.now();
      const noms = await listerModeles();
      const actif = modeleActif();
      const flash = noms.filter((n) => /flash/.test(n));
      return { statut: noms.includes(actif) ? 'ok' : 'echec', detail: `${noms.length} modèles en ${Math.round(performance.now() - t0)} ms ; actif ${actif} ${noms.includes(actif) ? 'présent' : 'ABSENT de la liste'} ; Flash stable le plus récent : ${choisirFlashStable(noms) || '?'} ; Flash disponibles : ${flash.slice(0, 12).join(', ')}` };
    });
    const schemaOk = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
    const ping = async (reflexion) => {
      const t0 = performance.now();
      await genererJSON({ systeme: 'Réponds {"ok":true}.', parts: [{ text: 'Test de diagnostic.' }], schema: schemaOk, valider: (x) => (x?.ok === true ? x : null), timeoutMs: 60000, reflexion });
      return Math.round(performance.now() - t0);
    };
    let msFaible = null;
    test('Latence, réflexion faible (voix, texte, tickets)', async () => { msFaible = await ping('faible'); return { statut: msFaible > 15000 ? 'avert' : 'ok', detail: `${msFaible} ms` }; });
    test('Latence, réflexion par défaut du modèle', async () => { const ms = await ping(null); return { statut: 'info', detail: `${ms} ms${msFaible ? ` (réflexion faible : ${msFaible} ms)` : ''}` }; });
    test('Analyse d’une phrase fictive', async () => {
      const t0 = performance.now();
      const res = await analyserTexteIA('deux cafés à 3,20 euros hier');
      const ms = Math.round(performance.now() - t0);
      const attendu = ajouterJours(auj, -1);
      const ok = res && res.sens === 'debit' && [320, 640].includes(res.montantCentimes);
      return { statut: ok ? (res.date === attendu ? 'ok' : 'avert') : 'echec', detail: `${ms} ms → ${res ? `${res.sens} ${eur(res.montantCentimes)} ${res.categorie} le ${res.date}${res.date !== attendu ? ` (attendu ${attendu})` : ''}` : 'rien'}` };
    });
    test('Analyse d’un son synthétique (chemin audio)', async () => {
      const wav = sonDeTest();
      const t0 = performance.now();
      try {
        const res = await analyserVoix(wav, 'audio/wav');
        return { statut: 'ok', detail: `${Math.round(performance.now() - t0)} ms → réponse ${res ? `${res.sens} ${eur(res.montantCentimes)}` : 'vide'} (un son sans parole peut donner n’importe quoi : seul le délai compte ici)` };
      } catch (e) {
        const ms = Math.round(performance.now() - t0);
        if (['validation', 'vide', 'json'].includes(e.code)) return { statut: 'ok', detail: `${ms} ms → Gemini a bien reçu l’audio (réponse refusée par la validation, normal pour un son sans parole : ${e.code})` };
        return { statut: 'echec', detail: `${ms} ms → ${e.code || e.name} : ${e.message}` };
      }
    });
    test('Lecture d’un ticket de caisse fictif (image)', async () => {
      const image = await ticketDeTest();
      const t0 = performance.now();
      const res = await analyserTicket(image);
      const ms = Math.round(performance.now() - t0);
      const ok = res.totalCentimes === 380 && res.ecartCentimes === 0;
      return { statut: ok ? 'ok' : 'avert', detail: `${ms} ms ; image ${Math.round(image.base64.length * 0.75 / 1024)} Ko → total ${eur(res.totalCentimes)} (attendu 3,80 €), ${res.articles.length} article(s), écart ${eur(res.ecartCentimes)}` };
    });
    test('Catégorisation de marchands fictifs', async () => {
      const t0 = performance.now();
      const m = await categoriserInconnus([{ marchand: 'Boulangerie du Coin', montantCentimes: 320, sens: 'debit' }, { marchand: 'Station Essence Total', montantCentimes: 4500, sens: 'debit' }, { marchand: 'Cinéma Le Grand Rex', montantCentimes: 1200, sens: 'debit' }]);
      const v = m instanceof Map ? Object.fromEntries(m) : m;
      return { statut: Object.keys(v || {}).length ? 'ok' : 'avert', detail: `${Math.round(performance.now() - t0)} ms → ${JSON.stringify(v).slice(0, 300)}` };
    });
    test('Réglage de réflexion accepté par le modèle', () => {
      const refus = journal().filter((e) => /Réglage de réflexion refusé/.test(e.message));
      return { statut: refus.length ? 'avert' : 'ok', detail: refus.length ? `Refusé : ${refus[0].message} (l’app repasse automatiquement sans)` : `${modeleActif()} accepte ${JSON.stringify(configReflexion(modeleActif(), 'faible'))}` };
    });
  } else {
    test('Requêtes de test', () => ({ statut: 'info', detail: ia.ok ? 'Non lancées (option désactivée)' : 'Non lancées : Gemini indisponible' }));
  }

  // ---------------------------------------------------------------- 10. Journal de la session
  S('Journal de la session');
  test('Erreurs JavaScript capturées', () => {
    const err = journal().filter((e) => ['erreur', 'promesse', 'console.error'].includes(e.type));
    return { statut: err.length ? 'echec' : 'ok', detail: err.length ? err.slice(-15).map((e) => `[${e.t.slice(11, 19)}] ${e.type} : ${e.message}`).join('\n') : 'Aucune erreur depuis l’ouverture de l’app' };
  });
  test('Avertissements', () => {
    const w = journal().filter((e) => e.type === 'console.warn');
    return { statut: w.length ? 'info' : 'ok', detail: w.length ? w.slice(-10).map((e) => `[${e.t.slice(11, 19)}] ${e.message}`).join('\n') : 'Aucun' };
  });
  test('Appels Gemini de la session', () => {
    const g = journal().filter((e) => e.type === 'gemini');
    const delais = g.filter((e) => /DÉLAI/.test(e.message));
    return { statut: delais.length ? 'avert' : 'info', detail: g.length ? g.slice(-25).map((e) => `[${e.t.slice(11, 19)}] ${e.message} en ${e.donnees?.ms ?? '?'} ms, ${Math.round((e.donnees?.octetsEnvoyes || 0) / 1024)} Ko envoyés (délai max ${Math.round((e.donnees?.delaiMaxMs || 0) / 1000)} s)`).join('\n') : 'Aucun appel' };
  });

  for (let i = 0; i < file.length; i++) await executer(file[i], i);
  const duree = Math.round(performance.now() - debut);
  const json = { app: 'Budget', versionApp, schema: SCHEMA_VERSION, lanceLe: lanceLe.toISOString(), dureeMs: duree, resultats };
  return { resultats, duree, json, markdown: versMarkdown(json) };
}

/** Rend une page dans un conteneur caché à la largeur de l'écran, puis l'inspecte. */
async function testerPage(nom, params, largeurForcee = null) {
  const mod = await PAGES[nom]();
  const L = largeurForcee || innerWidth;
  const hote = document.createElement('div');
  hote.setAttribute('aria-hidden', 'true');
  hote.style.cssText = `position:fixed;left:0;top:0;width:${L}px;visibility:hidden;pointer-events:none;z-index:-1;overflow:hidden;height:1px;`;
  const vue = document.createElement('main');
  vue.className = 'vue';
  vue.style.height = 'auto';
  hote.append(vue);
  document.body.append(hote);
  const t0 = performance.now();
  try {
    await mod.rendre(vue, params);
    await pause(60);
    const ms = Math.round(performance.now() - t0);
    const remarques = []; let statut = 'ok';
    const tout = vue.querySelectorAll('*');
    // Textes suspects
    const suspects = [];
    const marcheur = document.createTreeWalker(vue, NodeFilter.SHOW_TEXT);
    while (marcheur.nextNode()) {
      const t = marcheur.currentNode.nodeValue;
      const m = t.match(/\bundefined\b|\bNaN\b|\[object [A-Za-z]+\]|\bnull\b|Infinity|\bInvalid Date\b/);
      if (m) suspects.push(`« ${m[0]} » dans ${selecteur(marcheur.currentNode.parentElement)}`);
    }
    if (suspects.length) { statut = 'echec'; remarques.push(`TEXTES SUSPECTS : ${suspects.slice(0, 6).join(' ; ')}`); }
    // Débordements horizontaux (hors zones défilantes prévues)
    const deb = [];
    for (const el of tout) {
      if (el.closest('.tableau-defile, .onglets-internes, .actions-glisse, svg')) continue;
      const rc = el.getBoundingClientRect();
      if (rc.width && rc.right > L + 1) deb.push(`${selecteur(el)} (+${Math.round(rc.right - L)} px)`);
    }
    if (deb.length) { statut = 'echec'; remarques.push(`DÉBORDE À DROITE de l’écran : ${deb.slice(0, 6).join(' ; ')}${deb.length > 6 ? ` (+${deb.length - 6})` : ''}`); }
    // Accessibilité : boutons sans nom, champs sans libellé, cibles tactiles trop petites
    const sansNom = [...vue.querySelectorAll('button, a[href], [role="button"]')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title'));
    if (sansNom.length) { statut = statut === 'echec' ? statut : 'avert'; remarques.push(`${sansNom.length} bouton(s) sans nom lisible par VoiceOver : ${sansNom.slice(0, 4).map(selecteur).join(', ')}`); }
    const champsSansLibelle = [...vue.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')].filter((c) => !c.getAttribute('aria-label') && !(c.id && vue.querySelector(`label[for="${CSS.escape(c.id)}"]`)) && !c.closest('label'));
    if (champsSansLibelle.length) { statut = statut === 'echec' ? statut : 'avert'; remarques.push(`${champsSansLibelle.length} champ(s) sans libellé : ${champsSansLibelle.slice(0, 4).map(selecteur).join(', ')}`); }
    const petits = [...vue.querySelectorAll('button, a[href], input, select, summary')].filter((b) => { const rc = b.getBoundingClientRect(); return rc.width > 0 && rc.height > 0 && (rc.height < 32 || rc.width < 32) && !b.closest('.tableau-defile'); });
    if (petits.length) remarques.push(`${petits.length} cible(s) tactile(s) < 32 px : ${petits.slice(0, 4).map((b) => `${selecteur(b)} ${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)}`).join(', ')}`);
    // Identifiants en double
    const idsVus = new Map();
    for (const el of vue.querySelectorAll('[id]')) idsVus.set(el.id, (idsVus.get(el.id) || 0) + 1);
    const doubles = [...idsVus].filter(([, n]) => n > 1).map(([i]) => i);
    if (doubles.length) { statut = statut === 'echec' ? statut : 'avert'; remarques.push(`id en double : ${doubles.slice(0, 5).join(', ')}`); }
    const hauteur = Math.round(vue.scrollHeight);
    return { statut, detail: `rendu en ${ms} ms ; ${tout.length} éléments ; hauteur ${hauteur} px (${(hauteur / innerHeight).toFixed(1)} écrans)${remarques.length ? ` ; ${remarques.join(' ; ')}` : ''}`, donnees: { ms, elements: tout.length, hauteur, largeur: L } };
  } finally {
    hote.remove();
  }
}

function selecteur(el) {
  if (!el) return '?';
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
    const indice = el.getAttribute('placeholder') || el.getAttribute('type') || el.getAttribute('inputmode') || '';
    const section = el.closest('.carte')?.querySelector('.carte-titre')?.textContent || '';
    return `${el.tagName.toLowerCase()}${indice ? `[${indice.slice(0, 30)}]` : ''}${section ? ` (section « ${section.slice(0, 40)} »)` : ''}`;
  }
  const classes = [...(el.classList || [])].slice(0, 2).join('.');
  const parent = el.parentElement && !el.classList?.length ? `${selecteur(el.parentElement)} > ` : '';
  return `${parent}${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
}

/** Son de test : 1,2 s de bip à 440 Hz, WAV mono 16 kHz (aucune parole, aucune donnée). */
function sonDeTest() {
  const taux = 16000; const n = Math.round(taux * 1.2);
  const tampon = new ArrayBuffer(44 + n * 2); const v = new DataView(tampon);
  const ecr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ecr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ecr(8, 'WAVE'); ecr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, taux, true); v.setUint32(28, taux * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ecr(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / taux) * 6000), true);
  return new Blob([tampon], { type: 'audio/wav' });
}

/** Rapport de contraste WCAG entre deux couleurs « rgb(a, b, c) ». */
function contraste(c1, c2) {
  const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const a = lum(c1); const b = lum(c2);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Ticket fictif dessiné à la volée (aucune donnée personnelle). */
async function ticketDeTest() {
  const c = document.createElement('canvas'); c.width = 420; c.height = 360;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#111'; g.font = '22px monospace';
  ['BOULANGERIE DU TEST', '05/11/2026  08:12', '', 'BAGUETTE          1,20', 'CROISSANT x2      2,20', 'EAU 50CL          0,40', '', 'TOTAL EUR         3,80', 'CB                3,80'].forEach((l, i) => g.fillText(l, 24, 40 + i * 34));
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  return { mime: 'image/jpeg', base64: await blobEnBase64(blob) };
}

const SYMBOLE = { ok: '✅', avert: '⚠️', echec: '❌', info: 'ℹ️' };
const LIBELLE = { ok: 'OK', avert: 'AVERTISSEMENT', echec: 'ÉCHEC', info: 'INFO' };

/** Rapport Markdown : résumé, problèmes à corriger, détail par section, puis JSON complet. */
export function versMarkdown(j) {
  const L = [];
  const sections = [...new Set(j.resultats.map((r) => r.section))];
  const compte = (liste, s) => liste.filter((r) => r.statut === s).length;
  L.push(`# Rapport de diagnostic — Budget ${j.versionApp}`, '');
  L.push(`Lancé le ${new Date(j.lanceLe).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} (heure de Paris), durée ${(j.dureeMs / 1000).toFixed(1)} s. Schéma de données ${j.schema}.`, '');
  L.push('> Rapport destiné à être envoyé à Claude pour corriger l’app. Anonymisé : aucun libellé d’opération, aucun prénom, aucune clé. Il contient des identifiants internes, des dates et des montants.', '');
  L.push('## Résumé', '', '| Section | ✅ OK | ⚠️ Avert. | ❌ Échecs | ℹ️ Info |', '|---|---:|---:|---:|---:|');
  for (const s of sections) { const l = j.resultats.filter((r) => r.section === s); L.push(`| ${s} | ${compte(l, 'ok')} | ${compte(l, 'avert')} | ${compte(l, 'echec')} | ${compte(l, 'info')} |`); }
  L.push(`| **Total** | **${compte(j.resultats, 'ok')}** | **${compte(j.resultats, 'avert')}** | **${compte(j.resultats, 'echec')}** | **${compte(j.resultats, 'info')}** |`, '');
  const pb = j.resultats.filter((r) => r.statut === 'echec' || r.statut === 'avert');
  L.push('## À corriger', '');
  if (!pb.length) L.push('Aucun échec ni avertissement.', '');
  for (const r of pb.sort((a, b) => (a.statut === b.statut ? 0 : a.statut === 'echec' ? -1 : 1))) L.push(`- ${SYMBOLE[r.statut]} **${LIBELLE[r.statut]}** · ${r.section} › ${r.nom} : ${r.detail.replace(/\n/g, '\n  ')}`);
  L.push('', '## Détail par section', '');
  for (const s of sections) {
    L.push(`### ${s}`, '');
    for (const r of j.resultats.filter((x) => x.section === s)) {
      L.push(`- ${SYMBOLE[r.statut]} **${r.nom}** (${r.ms} ms) : ${r.detail.replace(/\n/g, '\n  ')}`);
    }
    L.push('');
  }
  L.push('## Données brutes (JSON)', '', '```json', JSON.stringify(j, null, 1), '```', '');
  return masquerSecrets(L.join('\n'));
}

