#!/usr/bin/env node
// ecrans.mjs — vérifie les écrans de l'app dans Chromium (Playwright), en largeur iPhone (390 × 844 ; thème clair pour v200, sombre pour l'origine),
// avec la sauvegarde SYNTHÉTIQUE (tests/outils/generer-sauvegarde.mjs), jamais de vraies données.
// Outil de développement : n'est pas chargé par l'app. Aucune dépendance du projet (Playwright installé globalement).
//
// Prérequis : un serveur à la racine du dépôt :  python3 -m http.server 8765
// Usage :
//   node tools/ecrans.mjs                      v200, la nouvelle app (thème clair) : aiguillage (sans réglage, ancien « v100 », « origine »),
//                                              écrans, saisie par la molette et le glisser, Dépenses (ligne → modification,
//                                              question oui / non, mois d'avant, rentrée), Épargne (pots, feuille d'un pot, « À virer »),
//                                              Résumé (météo, mois / année, détail), Réglages et pages héritées de l'app d'origine
//                                              (captures toujours faites). « --v200 » : même chose (ancien nom).
//   node tools/ecrans.mjs --origine            app d'origine, styles Classique puis Joyeux
//   node tools/ecrans.mjs --aller-retour       restaurer → « Tout exporter » → comparer au fichier d'origine
//   options : --capture <écran>[,<écran>…] (capture PNG dans le dossier temporaire), --url http://localhost:8765/,
//             --aujourdhui AAAA-MM-JJ (date du générateur et de l'horloge figée)
// Sortie : une ligne par écran, « OK » ou le problème précis. Code de sortie 1 s'il y a un problème.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valeur = (nom, defaut = null) => (args.includes(nom) ? args[args.indexOf(nom) + 1] : defaut);
const ORIGINE = args.includes('--origine');
const ALLER_RETOUR = args.includes('--aller-retour');
const V200 = !ORIGINE && !ALLER_RETOUR; // v200 par défaut (« --v200 » accepté)
const BASE = valeur('--url', 'http://localhost:8765/');
const { REFERENCE_DEFAUT } = await import(path.join(RACINE, 'tests/outils/generer-sauvegarde.mjs'));
const AUJ = valeur('--aujourdhui', REFERENCE_DEFAUT);
const simplifier = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CAPTURES = new Set(args.flatMap((a, i) => (args[i - 1] === '--capture' ? a.split(',') : [])).map(simplifier));
if (V200) for (const c of ['v200-aujourdhui', 'v200-saisie', 'v200-saisie-montant', 'v200-confirmation', 'v200-vide', 'v200-privation', 'v200-toutes', 'v200-question', 'v200-privation-montant',
  'v200-depenses', 'v200-depenses-bas', 'v200-detail-depense', 'v200-rentree', 'v200-epargne', 'v200-pot', 'v200-virement', 'v200-resume', 'v200-resume-annee', 'v200-resume-bas',
  'v200-reglages', 'v200-reglages-avance', 'v200-reglages-apparence', 'v200-reglages-sauvegarde', 'v200-reglages-epargne', 'v200-reglages-revenus', 'v200-import', 'v200-historique', 'v200-saisie-clavier']) CAPTURES.add(c);
const DOSSIER = mkdtempSync(path.join(os.tmpdir(), 'ecrans-'));
const LARGEUR = 390; const HAUTEUR = 844;

let problemesTotal = 0;
function rapport(ecran, problemes) {
  const liste = [...new Set(problemes.filter(Boolean))];
  problemesTotal += liste.length;
  console.log(`${liste.length ? '✗' : '✓'} ${ecran} : ${liste.length ? liste.join(' ; ') : 'OK'}`);
}

// ---------------------------------------------------------------- Préparation
try { const r = await fetch(BASE); if (!r.ok) throw new Error(`HTTP ${r.status}`); } catch (e) {
  console.error(`Serveur injoignable (${BASE}) : lance « python3 -m http.server 8765 » à la racine du dépôt. (${e.message})`);
  process.exit(2);
}
// --fichier <chemin> : restaure une sauvegarde existante (toujours HORS du dépôt) au lieu de la sauvegarde synthétique.
const FICHIER_DONNE = valeur('--fichier', null);
const FICHIER = FICHIER_DONNE ? path.resolve(FICHIER_DONNE) : path.join(DOSSIER, 'sauvegarde-synthetique.json');
if (!FICHIER_DONNE) execFileSync(process.execPath, [path.join(RACINE, 'tests/outils/generer-sauvegarde.mjs'), FICHIER, '--aujourdhui', AUJ], { stdio: 'ignore' });
const ORIGINAL = JSON.parse(readFileSync(FICHIER, 'utf8'));

const navigateur = await chromium.launch();
const attendre = (page, ms) => page.waitForTimeout(ms);

async function nouveauContexte() {
  const contexte = await navigateur.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR }, deviceScaleFactor: V200 ? 2 : 1, colorScheme: V200 ? 'light' : 'dark', isMobile: true, hasTouch: true,
    locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block', acceptDownloads: true,
  });
  const page = await contexte.newPage();
  // Horloge figée sur la date du générateur (14 h, heure de Paris en hiver), le temps continue de s'écouler
  await page.clock.install({ time: new Date(`${AUJ}T13:00:00Z`) });
  page.erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error') page.erreurs.push(`console : ${m.text().slice(0, 160)}`); });
  page.on('pageerror', (e) => page.erreurs.push(`exception : ${String(e.message).slice(0, 160)}`));
  return { contexte, page };
}
const viderErreurs = (page) => page.erreurs.splice(0);

/** Attend la fin d'un affichage (plus de squelette, page stable). */
async function stable(page, ms = 350) {
  await page.waitForFunction(() => !document.querySelector('#vue .squelettes'), null, { timeout: 8000 }).catch(() => {});
  await attendre(page, ms);
}
async function aller(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await stable(page);
}

/** Restauration par le vrai flux : Réglages → Importer → fichier .json → Remplacer → confirmer. */
async function restaurer(page, app, fichier = FICHIER) {
  await page.goto(`${BASE}?app=${app}#reglages/import`);
  await page.waitForSelector('#fichiers-import', { state: 'attached', timeout: 10000 });
  await page.setInputFiles('#fichiers-import', fichier);
  const feuille = page.locator('.feuille-racine', { hasText: 'Restaurer une sauvegarde' });
  await feuille.locator('.feuille-actions button', { hasText: 'Remplacer' }).click();
  await page.locator('.feuille-racine', { hasText: 'Remplacer toutes les données' }).locator('button.btn-danger').click();
  await page.waitForFunction(async () => (await import('/js/store.js')).etat.transactions.length > 0, null, { timeout: 10000 });
  await attendre(page, 400);
  await page.goto(`${BASE}?app=${app}#accueil`);
  await page.reload(); // vrai redémarrage de l'app (le changement de # seul ne recharge pas)
  await stable(page, 600);
  viderErreurs(page);
}

// ---------------------------------------------------------------- Contrôles dans la page

/** Contrôles génériques sur une zone (sélecteur) : débordement, textes coupés, boutons sans nom. */
async function controler(page, zone = 'body') {
  return page.evaluate(({ zone, L }) => {
    const p = [];
    const racine = document.querySelector(zone);
    if (!racine) return [`zone introuvable (${zone})`];
    const decrire = (el) => {
      const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
      const t = (el.getAttribute?.('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${cls}${t ? ` « ${t} »` : ''}`;
    };
    const visible = (el) => {
      if (!el.getClientRects().length) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
    };
    // 1. Débordement horizontal
    const sw = document.documentElement.scrollWidth;
    if (sw > innerWidth) {
      const coupable = [...racine.querySelectorAll('*')].filter((el) => visible(el) && !el.closest('svg *') && el.getBoundingClientRect().right > innerWidth + 1
        && ![...(function* anc(x) { for (let a = x.parentElement; a; a = a.parentElement) yield a; }(el))].some((a) => /auto|scroll|hidden|clip/.test(getComputedStyle(a).overflowX)))
        .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
      p.push(`débordement horizontal (${sw} px > ${innerWidth} px)${coupable ? ` par ${decrire(coupable)}` : ''}`);
    }
    // 2. Textes coupés (sans ellipse voulue) et hors de l'écran
    for (const el of racine.querySelectorAll('*')) {
      if (el.closest('svg') || el.closest('.sr') || /^(INPUT|TEXTAREA|SELECT|OPTION|SCRIPT|STYLE)$/.test(el.tagName)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline' || cs.display === 'contents' || !visible(el)) continue;
      const texte = [...el.childNodes].some((n) => (n.nodeType === 3 && n.textContent.trim()) || (n.nodeType === 1 && getComputedStyle(n).display === 'inline' && n.textContent.trim() && !n.closest('svg')));
      if (!texte) continue;
      const voulu = cs.textOverflow === 'ellipsis' || /auto|scroll/.test(cs.overflowX);
      // Largeur réelle du texte (sans les pseudo-éléments décoratifs comme la zone de toucher élargie)
      const boite = el.getBoundingClientRect();
      const gauche = boite.left + el.clientLeft + parseFloat(cs.paddingLeft) - el.scrollLeft;
      const droite = boite.left + el.clientLeft + el.clientWidth - parseFloat(cs.paddingRight);
      const plage = document.createRange();
      let tg = Infinity; let td = -Infinity; let th = Infinity; let tb = -Infinity;
      for (const n of el.childNodes) {
        if (!(n.nodeType === 3 || (n.nodeType === 1 && getComputedStyle(n).display === 'inline'))) continue;
        plage.selectNodeContents(n);
        for (const r of plage.getClientRects()) if (r.width) { tg = Math.min(tg, r.left); td = Math.max(td, r.right); th = Math.min(th, r.top); tb = Math.max(tb, r.bottom); }
      }
      const depasse = Math.max(0, td - droite, gauche - tg);
      if (!voulu && depasse > 1) {
        // Coupé : un cadre (lui-même ou un parent) cache ce qui dépasse ; sinon le texte déborde sur ses voisins
        let coupe = 0;
        for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
          if (!/hidden|clip/.test(getComputedStyle(a).overflowX)) continue;
          const ra = a.getBoundingClientRect();
          coupe = Math.max(coupe, td - (ra.left + a.clientLeft + a.clientWidth), ra.left + a.clientLeft - tg);
        }
        if (coupe > 1) p.push(`texte coupé en largeur : ${decrire(el)} (${Math.round(coupe)} px cachés)`);
        else if (depasse > 12) p.push(`texte qui déborde de son cadre : ${decrire(el)} (${Math.round(depasse)} px)`);
      }
      // En hauteur : seulement si le cadre coupe vraiment (overflow caché) et que le texte en sort
      if (/hidden|clip/.test(cs.overflowY) && cs.webkitLineClamp === 'none' && tb > -Infinity) {
        const haut = boite.top + el.clientTop; const bas = haut + el.clientHeight;
        const marge = 0.4 * parseFloat(cs.fontSize); // la boîte du texte inclut l'interligne de la police : seule une vraie ligne cachée compte
        if (th < haut - marge || tb > bas + marge) p.push(`texte coupé en hauteur : ${decrire(el)} (${Math.round(Math.max(haut - th, tb - bas))} px)`);
      }
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < -1 || r.right > L + 1) && !el.closest('[class*="defil"], .express-liste, .histo-filtres, .onglets-internes')) {
        const scroll = [...(function* anc(x) { for (let a = x.parentElement; a; a = a.parentElement) yield a; }(el))].some((a) => /auto|scroll/.test(getComputedStyle(a).overflowX));
        if (!scroll) p.push(`texte hors de l'écran : ${decrire(el)}`);
      }
    }
    // 3. Rectangles SVG dont la hauteur est écrasée par une règle CSS (ex. une classe partagée avec du HTML)
    for (const r of racine.querySelectorAll('svg rect[height]')) {
      if (!visible(r)) continue;
      const attendu = parseFloat(r.getAttribute('height')); const reel = r.getBBox().height;
      if (Math.abs(attendu - reel) > 0.5) { p.push(`schéma déformé : rect.${r.getAttribute('class') || ''} haut de ${reel.toFixed(0)} au lieu de ${attendu.toFixed(0)} (CSS)`); break; }
    }
    // 4. Boutons sans nom, « ? » sans aria-label explicite
    for (const b of racine.querySelectorAll('button, [role="button"], a[href]')) {
      if (!visible(b) || b.closest('[aria-hidden="true"]') || b.closest('[inert]')) continue;
      const aria = (b.getAttribute('aria-label') || '').trim();
      const lie = (b.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
      const texte = b.textContent.replace(/\s+/g, ' ').trim();
      const nom = aria || lie || (b.getAttribute('title') || '').trim() || texte;
      if (!nom) p.push(`bouton sans texte ni aria-label : ${decrire(b)}`);
      else if (texte === '?' && !(aria.length >= 15 && !/^(aide|plus d’explications|plus d'explications|\?)$/i.test(aria))) p.push(`« ? » sans aria-label explicite${aria ? ` (« ${aria} »)` : ''}`);
    }
    return p;
  }, { zone, L: LARGEUR });
}

/** Photo de l'écran (dossier temporaire) si demandée par --capture. */
async function capturer(page, id, { pleine = false } = {}) {
  if (!CAPTURES.has(id) && !CAPTURES.has('tout')) return null;
  const f = path.join(DOSSIER, `${id}.png`);
  // Page entière : la barre d'onglets (fixe) et les messages passagers sont masqués, sinon ils se posent au milieu
  const style = pleine ? await page.addStyleTag({ content: '.barre-onglets, #toasts { display: none !important; }' }) : null;
  await page.screenshot({ path: f, fullPage: pleine });
  if (style) await style.evaluate((el) => el.remove());
  console.log(`  capture : ${f}`);
  return f;
}

/** Contrôle d'une page entière. */
async function verifierPage(page, id, libelle, extra = async () => [], { pleine = !V200 } = {}) {
  const p = [...await controler(page, '#app'), ...await extra()];
  await capturer(page, id, { pleine });
  rapport(libelle, [...p, ...viderErreurs(page)]);
}

/** Contrôle d'une feuille ouverte : défilement interne, taille, contenu, puis fermeture par la méthode donnée. */
async function verifierFeuille(page, id, libelle, { fermer = 'bouton', extra = async () => [] } = {}) {
  const p = [];
  try { await page.waitForSelector('.feuille.visible', { timeout: 4000 }); } catch { rapport(libelle, ['la feuille ne s’ouvre pas', ...viderErreurs(page)]); return; }
  await attendre(page, 350);
  const n0 = await page.locator('.feuille-racine').count();
  p.push(...await page.evaluate(() => {
    const q = [];
    const racine = [...document.querySelectorAll('.feuille-racine')].pop();
    const f = racine.querySelector('.feuille'); const corps = racine.querySelector('.feuille-corps');
    const r = f.getBoundingClientRect();
    if (r.top < -1) q.push(`la feuille dépasse en haut de l'écran (${Math.round(r.top)} px)`);
    if (r.bottom > innerHeight + 1) q.push(`la feuille dépasse en bas de l'écran (${Math.round(r.bottom - innerHeight)} px)`);
    if (corps.scrollHeight > corps.clientHeight + 1) {
      const ov = getComputedStyle(corps).overflowY;
      if (!/auto|scroll/.test(ov)) q.push(`contenu long non défilable (overflow-y: ${ov})`);
      corps.scrollTop = corps.scrollHeight;
      if (corps.scrollTop <= 0) q.push('le contenu long ne défile pas dans la feuille');
      corps.scrollTop = 0;
    }
    // Le contenu ne doit pas dépasser la feuille sans pouvoir défiler
    const fin = [...corps.querySelectorAll('*')].filter((el) => el.getClientRects().length).reduce((m, el) => Math.max(m, el.getBoundingClientRect().bottom), 0);
    if (corps.scrollHeight <= corps.clientHeight + 1 && fin > corps.getBoundingClientRect().bottom + 2 && !/auto|scroll/.test(getComputedStyle(corps).overflowY)) q.push('contenu coupé en bas de la feuille');
    return q;
  }));
  p.push(...await controler(page, '.feuille-racine:last-of-type'), ...await extra(), ...(V200 ? await contrastes(page, '.feuille-racine:last-of-type') : []));
  await capturer(page, id);
  // Fermeture
  if (fermer === 'bouton') await page.locator('.feuille-racine').last().locator('.feuille-fermer').click();
  else if (fermer === 'voile') await page.mouse.click(LARGEUR / 2, 6);
  else if (fermer === 'glissement') {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('.feuille-racine')].pop().querySelector('.feuille-entete');
      const r = el.getBoundingClientRect(); const x = r.left + r.width / 2; const y0 = r.top + 8;
      const t = (y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      const ev = (type, y, fin = false) => el.dispatchEvent(new TouchEvent(type, { touches: fin ? [] : [t(y)], targetTouches: fin ? [] : [t(y)], changedTouches: [t(y)], bubbles: true, cancelable: true }));
      ev('touchstart', y0); for (let i = 1; i <= 6; i += 1) ev('touchmove', y0 + i * 40); ev('touchend', y0 + 240, true);
    });
  }
  if (fermer) {
    const ferme = await page.waitForFunction((n) => document.querySelectorAll('.feuille-racine').length < n, n0, { timeout: 2500 }).then(() => true).catch(() => false);
    if (!ferme) { p.push(`la feuille ne se ferme pas (${fermer})`); await page.keyboard.press('Escape'); await attendre(page, 400); }
    else {
      await attendre(page, 150);
      if (await page.evaluate(() => document.getElementById('app').getAttribute('aria-hidden') === 'true' && !document.querySelector('.feuille-racine'))) p.push('l’app reste masquée (aria-hidden) après la fermeture');
    }
  }
  rapport(libelle, [...p, ...viderErreurs(page)]);
}

/** La carte de confirmation : visible, au-dessus de la barre d'onglets, contenu lisible. */
async function verifierCarte(page, id, libelle) {
  const p = [];
  try { await page.waitForSelector('.confirmation.visible', { timeout: 4000 }); } catch { rapport(libelle, ['la carte de confirmation ne s’affiche pas', ...viderErreurs(page)]); return false; }
  await attendre(page, 300);
  p.push(...await page.evaluate(() => {
    const q = [];
    const c = document.querySelector('.confirmation.visible').getBoundingClientRect();
    const barre = document.querySelector('.barre-onglets');
    const b = barre && getComputedStyle(barre).display !== 'none' ? barre.getBoundingClientRect() : null;
    if (b && c.bottom > b.top + 1) q.push(`la carte cache la barre d’onglets (${Math.round(c.bottom - b.top)} px)`);
    if (c.top < 0) q.push('la carte dépasse en haut');
    for (const x of document.querySelectorAll('.bulle-xp, .toast.visible')) {
      const r = x.getBoundingClientRect();
      if (r.left < c.right && c.left < r.right && r.top < c.bottom && c.top < r.bottom) q.push(`la carte est couverte par ${x.className.split(' ')[0]} « ${x.textContent.trim().slice(0, 30)} »`);
    }
    return q;
  }), ...await controler(page, '.confirmation.visible'));
  await capturer(page, id);
  rapport(libelle, [...p, ...viderErreurs(page)]);
  return true;
}

/** Saisie d'une dépense par le clavier (feuille « Nouvelle opération »). */
async function saisirDepense(page, montant, libelle, { verifier = null } = {}) {
  await page.locator('#bouton-plus').click();
  await page.waitForSelector('.feuille.visible form.vue-clavier', { timeout: 4000 });
  await attendre(page, 350);
  await page.locator('.feuille.visible input[aria-label="Montant"]').fill(montant);
  await page.locator('.feuille.visible form.vue-clavier input.input:not([aria-label]):not([type])').first().fill(libelle);
  if (verifier) await verifier();
  await page.locator('.feuille.visible form.vue-clavier button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('.feuille.visible'), null, { timeout: 4000 }).catch(() => {});
}
const trouverTx = (page, libelle) => page.evaluate(async (l) => (await import('/js/store.js')).etat.transactions.filter((t) => t.libelle === l).length, libelle);

// ---------------------------------------------------------------- App d'origine

async function ecransOrigine() {
  const { contexte, page } = await nouveauContexte();
  await restaurer(page, 'origine');
  for (const style of ['classique', 'joyeux']) {
    await page.evaluate(async (st) => (await import('/js/store.js')).majParametres({ style: st }), style);
    await page.goto(`${BASE}?app=origine#accueil`);
    await page.reload();
    await stable(page, 600);
    const st = await page.evaluate(() => ({ app: document.documentElement.dataset.app || 'origine', style: document.documentElement.dataset.style || 'classique', strat: document.querySelector('[data-onglet="strategie"]') ? 'flex' : 'none', v200: [...document.querySelectorAll('.onglet-v200')].some((e) => getComputedStyle(e).display !== 'none') }));
    rapport(`Origine ${style} : habillage`, [st.app !== 'origine' ? `app « ${st.app} » au lieu de l’origine` : null, st.style !== style ? `style « ${st.style} »` : null, st.strat !== 'none' ? 'onglet Stratégie visible' : null, st.v200 ? 'onglet de v200 visible' : null]);
    viderErreurs(page);
    for (const [hash, nom] of [['accueil', 'Accueil'], ['depenses', 'Dépenses'], ['budgets', 'Budgets'], ['historique', 'Historique'], ['avenir', 'Avenir'], ['abonnements', 'Abonnements'], ['epargne', 'Épargne'], ['reglages', 'Réglages'], ['reglages/sauvegarde', 'Sauvegarde et export']]) {
      await aller(page, `#${hash}`);
      await verifierPage(page, `origine-${style}-${simplifier(nom)}`, `Origine ${style} → ${nom}`);
    }
    await aller(page, '#accueil');
    await saisirDepense(page, '4,20', `ORIGINE ${style.toUpperCase()} EXEMPLE`);
    await attendre(page, 500);
    const toast = await page.locator('#toasts .toast').first().textContent().catch(() => null);
    const carte = await page.locator('.confirmation').count();
    await capturer(page, `origine-${style}-saisie`);
    rapport(`Origine ${style} → saisie d’une dépense`, [!toast || !/Dépense ajoutée : 4,20/.test(toast.replace(/ | /g, ' ')) ? `message habituel absent (${toast || 'aucun'})` : null, carte ? 'carte de confirmation affichée dans l’app d’origine' : null, ...viderErreurs(page)]);
  }
  await contexte.close();
}

// ---------------------------------------------------------------- Aller-retour de sauvegarde

const IGNORES = new Set(['exporteLe', 'modifieLe', 'derniereSauvegarde']);
const normaliser = (v) => (Array.isArray(v) ? v.map(normaliser) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).filter((k) => !IGNORES.has(k) && v[k] !== undefined).sort().map((k) => [k, normaliser(v[k])])) : v);
const egal = (a, b) => JSON.stringify(normaliser(a)) === JSON.stringify(normaliser(b));
function champsDifferents(a, b) {
  const na = normaliser(a || {}); const nb = normaliser(b || {});
  return [...new Set([...Object.keys(na), ...Object.keys(nb)])].filter((k) => JSON.stringify(na[k]) !== JSON.stringify(nb[k]));
}

function comparer(origine, export_) {
  const p = [];
  if (origine.format !== export_.format) p.push(`format différent (${export_.format})`);
  if (origine.schemaVersion !== export_.schemaVersion) p.push(`schemaVersion ${origine.schemaVersion} → ${export_.schemaVersion}`);
  const a = origine.contenu; const b = export_.contenu;
  const lignes = [];
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    if (k === 'meta') continue;
    if (!(k in b)) { lignes.push([k, 'absente de l’export']); continue; }
    if (!(k in a)) { if (Array.isArray(b[k]) ? b[k].length : Object.keys(b[k] || {}).length) lignes.push([k, 'en plus dans l’export']); continue; }
    if (Array.isArray(a[k])) {
      const cle = (x, i) => x?.id ?? x?.mois ?? `#${i}`;
      const ma = new Map(a[k].map((x, i) => [cle(x, i), x])); const mb = new Map(b[k].map((x, i) => [cle(x, i), x]));
      const manquants = [...ma.keys()].filter((x) => !mb.has(x)); const plus = [...mb.keys()].filter((x) => !ma.has(x));
      const diff = [...ma.keys()].filter((x) => mb.has(x) && !egal(ma.get(x), mb.get(x)));
      if (manquants.length || plus.length || diff.length) {
        lignes.push([k, [manquants.length ? `${manquants.length} manquant(s)` : '', plus.length ? `${plus.length} en trop` : '',
          diff.length ? `${diff.length} différent(s) (ex. ${diff[0]} : ${champsDifferents(ma.get(diff[0]), mb.get(diff[0])).join(', ')})` : ''].filter(Boolean).join(', ')]);
      } else lignes.push([k, null, a[k].length]);
    } else {
      const d = champsDifferents(a[k], b[k]);
      lignes.push([k, d.length ? `clés différentes : ${d.join(', ')}` : null]);
    }
  }
  const ma = a.meta || {}; const mb = b.meta || {};
  for (const k of [...new Set([...Object.keys(ma), ...Object.keys(mb)])].sort()) lignes.push([`meta.${k}`, egal(ma[k], mb[k]) ? null : (k in mb ? (k in ma ? 'valeur différente' : 'en plus dans l’export') : 'absente de l’export')]);
  return { p, lignes };
}

/** Les chiffres de v200 (Aujourd'hui, puis les pots de l'Épargne) pour comparer avant / après. */
async function chiffresAccueil(page) {
  await aller(page, '#accueil');
  const jour = await page.evaluate(() => [...document.querySelectorAll('.v2-bulle, .v2-phrase')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  await aller(page, '#epargne');
  const pots = await page.evaluate(() => [...document.querySelectorAll('.v2-ep')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  await aller(page, '#accueil');
  return [...jour, ...pots];
}

async function allerRetour() {
  const { contexte, page } = await nouveauContexte();
  await restaurer(page, 'v200');
  const avant = await chiffresAccueil(page);
  await aller(page, '#reglages');
  await page.locator('#vue button, #vue a', { hasText: 'Sauvegarde et export' }).first().click();
  await stable(page);
  let texte = null; let voie = 'bouton « Tout exporter »';
  try {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 6000 }), page.locator('#vue button', { hasText: 'Tout exporter' }).first().click()]);
    texte = readFileSync(await dl.path(), 'utf8');
  } catch {
    voie = 'construireExport (repli)';
    texte = await page.evaluate(async () => { const { construireExport } = await import('/js/sauvegarde.js'); const { etat } = await import('/js/store.js'); return JSON.stringify(construireExport(etat)); });
  }
  const exporte = JSON.parse(texte);
  const { p, lignes } = comparer(ORIGINAL, exporte);
  console.log(`  export obtenu par : ${voie}`);
  for (const [nom, pb, n] of lignes) rapport(`Aller-retour → ${nom}${n !== undefined ? ` (${n})` : ''}`, [pb]);
  rapport('Aller-retour → en-tête du fichier', [...p, ...viderErreurs(page)]);
  await contexte.close();

  // Le fichier exporté, restauré dans une app vide, redonne les mêmes chiffres sur l'Accueil
  const f2 = path.join(DOSSIER, 'export.json');
  (await import('node:fs')).writeFileSync(f2, texte);
  const c2 = await nouveauContexte();
  await restaurer(c2.page, 'v200', f2);
  const apres = await chiffresAccueil(c2.page);
  const diff = avant.map((x, i) => (x !== apres[i] ? `« ${x} » → « ${apres[i]} »` : null)).filter(Boolean);
  rapport('Aller-retour → chiffres d’Aujourd’hui et de l’Épargne après nouvelle restauration', [!avant.length ? 'aucun chiffre lu sur Aujourd’hui ni l’Épargne' : null, avant.length !== apres.length ? `${avant.length} chiffres avant, ${apres.length} après` : null, ...diff, ...viderErreurs(c2.page)]);
  await c2.contexte.close();
}

// ---------------------------------------------------------------- v200

async function ecransV200() {
  // Aiguillage : sans réglage → v200 ; ancien choix « v100 » (ou ?app=v100) → v200, réécrit ; « origine » → l'app d'origine
  {
    const { contexte, page } = await nouveauContexte();
    const etat = async () => page.evaluate(() => ({ app: document.documentElement.dataset.app || 'origine', garde: localStorage.getItem('budget-app') }));
    await page.goto(`${BASE}#accueil`); await stable(page, 400);
    const vierge = await etat();
    await page.evaluate(() => localStorage.setItem('budget-app', 'v100')); await page.reload(); await stable(page, 400);
    const ancien = await etat();
    await page.evaluate(() => localStorage.setItem('budget-app', 'origine')); await page.reload(); await stable(page, 400);
    const origine = await etat();
    await page.goto(`${BASE}?app=v100#accueil`); await stable(page, 400);
    const param = await etat();
    rapport('Aiguillage : sans réglage, ancien « v100 », « origine », ?app=v100', [
      vierge.app !== 'v200' ? `sans réglage : ${vierge.app}` : null,
      ancien.app !== 'v200' || ancien.garde !== 'v200' ? `« v100 » gardé : app ${ancien.app}, réglage ${ancien.garde}` : null,
      origine.app !== 'origine' || origine.garde !== 'origine' ? `« origine » : app ${origine.app}, réglage ${origine.garde}` : null,
      param.app !== 'v200' || param.garde !== 'v200' ? `?app=v100 : app ${param.app}, réglage ${param.garde}` : null, ...viderErreurs(page)]);
    await contexte.close();
  }
  // Sans aucune donnée : « Note ta première dépense »
  {
    const { contexte, page } = await nouveauContexte();
    await page.goto(`${BASE}?app=v200#accueil`);
    await page.waitForFunction(async () => !!(await import('/js/store.js')).etat.parametres, null, { timeout: 8000 });
    await page.evaluate(async () => (await import('/js/store.js')).majParametres({ onboarding: { termine: true, etape: 4 } }));
    await attendre(page, 400);
    await page.goto(`${BASE}?app=v200#accueil`); await page.reload(); await stable(page, 600);
    await page.waitForSelector('.v2-bulle', { timeout: 8000 }).catch(() => {});
    const t = await page.locator('.v2-bulle').textContent().catch(() => '');
    await verifierPage(page, 'v200-vide', 'v200 sans données : Aujourd’hui', async () => [/Note ta première dépense/.test(t || '') ? null : `texte « Note ta première dépense » absent (${(t || '').slice(0, 60)})`,
      await page.locator('.v2-phrase').count() ? 'phrase du jour affichée sans données' : null]);
    // Les autres onglets, sans données : rien de cassé, rien d'inventé
    for (const [hash, nom, sel, attendu] of [['depenses', 'Dépenses', '.v2-dep', /Aucune dépense/], ['epargne', 'Épargne', '.v2-ep', /Choisis une envie|Pas encore d’envie|pots/], ['resume', 'Résumé', '.v2-res', /Encore un peu tôt/]]) {
      await aller(page, `#${hash}`);
      const txt = await page.locator(sel).textContent({ timeout: 4000 }).catch(() => '');
      await verifierPage(page, `v200-vide-${hash}`, `v200 sans données : ${nom}`, async () => [attendu.test(txt) ? null : `texte attendu absent (${txt.slice(0, 80)})`, /NaN|undefined/.test(txt) ? 'NaN ou undefined affiché' : null]);
    }
    await contexte.close();
  }

  const { contexte, page } = await nouveauContexte();
  await restaurer(page, 'v200');
  await aller(page, '#accueil');
  await page.waitForSelector('.v2-jour', { timeout: 6000 });

  // Habillage : app, thème clair, barre d'état crème, cinq places dans la barre d'onglets
  const hab = await page.evaluate(() => {
    const r = document.documentElement;
    const visibles = [...document.querySelectorAll('.barre-onglets > *')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => (e.textContent.trim() || e.getAttribute('aria-label') || '').replace(/\s+/g, ' '));
    return { app: r.dataset.app, theme: r.dataset.theme, style: r.dataset.style || null, metas: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content')), fond: getComputedStyle(document.body).backgroundColor, visibles };
  });
  rapport('v200 : habillage', [hab.app !== 'v200' ? `app « ${hab.app} »` : null, hab.theme !== 'clair' ? `thème « ${hab.theme} »` : null, hab.style ? `style « ${hab.style} » posé` : null,
    hab.metas.some((m) => m.toUpperCase() !== '#FBF6EC') ? `barre d’état ${hab.metas.join(', ')}` : null, hab.fond !== 'rgb(251, 246, 236)' ? `fond ${hab.fond}` : null,
    JSON.stringify(hab.visibles) !== JSON.stringify(['Aujourd’hui', 'Dépenses', 'Ajouter une dépense ou une entrée', 'Épargne', 'Résumé']) ? `onglets : ${hab.visibles.join(' | ')}` : null]);

  await verifierPage(page, 'v200-aujourdhui', 'v200 → Aujourd’hui', async () => page.evaluate((H) => {
    const q = [];
    const blocs = [...document.querySelector('.v2-jour').children].map((e) => e.className.split(' ')[0]);
    const attendus = ['v2-tete', 'v2-bulle', 'v2-actions', 'v2-phrase'];
    if (JSON.stringify(blocs) !== JSON.stringify(attendus)) q.push(`blocs de l’écran : ${blocs.join(', ')} (attendu ${attendus.join(', ')})`);
    const barre = document.querySelector('.barre-onglets').getBoundingClientRect().top;
    const bas = document.querySelector('.v2-jour').getBoundingClientRect().bottom;
    if (bas > barre + 1) q.push(`l’écran Aujourd’hui dépasse l’écran (${Math.round(bas - barre)} px sous la barre d’onglets)`);
    for (const b of document.querySelectorAll('.v2-jour button, .v2-jour a, .barre-onglets a, .barre-onglets button')) {
      const r = b.getBoundingClientRect();
      if (getComputedStyle(b).display !== 'none' && (r.width < 44 || r.height < 44)) q.push(`zone de toucher trop petite : ${b.textContent.trim() || b.getAttribute('aria-label')} (${Math.round(r.width)} × ${Math.round(r.height)})`);
    }
    if (!/Tu peux encore dépenser|dépassé|déjà utilisée/.test(document.querySelector('.v2-bulle').textContent)) q.push('phrase de la bulle absente');
    return q;
  }, HAUTEUR));

  for (const [hash, nom] of [['depenses', 'Dépenses'], ['epargne', 'Épargne'], ['resume', 'Résumé']]) {
    await aller(page, `#${hash}`);
    await verifierPage(page, `v200-${simplifier(nom)}`, `v200 → ${nom}`, async () => {
      const q = [];
      if (hash === 'resume' && !await page.locator('.barre-onglets .onglet.actif[data-onglet="resume"]').count()) q.push('onglet Résumé pas actif');
      return q;
    });
  }
  await pagesHeritees(page);
  await pagesV200(page);
  await aller(page, '#accueil');
  await parcoursV200(page);
  await contexte.close();
}

/** Zones de toucher d'au moins 44 × 44 px dans une zone. */
const zonesDeToucher = (page, zone) => page.evaluate((z) => [...document.querySelectorAll(`${z} button, ${z} a[href]`)].filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden')
  .map((b) => ({ r: b.getBoundingClientRect(), t: (b.textContent.trim() || b.getAttribute('aria-label') || '').slice(0, 30) }))
  .filter((x) => x.r.width < 44 || x.r.height < 44).map((x) => `zone de toucher trop petite : ${x.t} (${Math.round(x.r.width)} × ${Math.round(x.r.height)})`), zone);

/** Dépenses, Épargne et Résumé de v200 : contenu, feuilles et gestes. */
async function pagesV200(page) {
  // ---- Dépenses : une phrase, une liste par jour, la feuille de modification, la question oui / non, « Voir le mois d'avant », la rentrée
  await page.evaluate(async () => { // une dépense « peut-être obligatoire » (synthétique) pour voir la question sur la ligne
    const { enregistrer, etat } = await import('/js/store.js'); const { aujourdhui } = await import('/js/dates.js'); const { nouvelleTransaction } = await import('/js/actions.js');
    const t = nouvelleTransaction({ sens: 'debit', montantCentimes: 4500, libelle: 'Facture exemple', categorie: 'energie', date: aujourdhui(), source: 'manuel' });
    await enregistrer('transactions', { ...t, id: 'tx-probable-ecrans', horsPartDuJour: true, obligatoireProbable: true });
    return etat.transactions.length;
  });
  await aller(page, '#depenses');
  await page.waitForSelector('.v2-dep', { timeout: 6000 });
  const dep = await page.evaluate(async () => {
    const q = [];
    // Une charge du mois (loyer, abonnement…) déjà passée depuis le salaire ? (le jour du salaire, souvent pas encore)
    const { etat } = await import('/js/store.js'); const { aujourdhui } = await import('/js/dates.js');
    const { joursDepenses, depuisSalaire } = await import('/js/v200/calculs/depenses.js');
    const auj = aujourdhui();
    const chargeDuMois = joursDepenses(etat, depuisSalaire(etat, auj).periode.debut, '9999-12-31', auj).some((j) => j.lignes.some((l) => l.nature === 'du-mois'));
    const resume = document.querySelector('.v2-dep-resume')?.textContent || '';
    if (!/^Depuis le salaire/.test(resume)) q.push(`phrase du haut : « ${resume.slice(0, 60)} »`);
    const titres = [...document.querySelectorAll('.v2-dep-jour-titre')].map((e) => e.textContent);
    if (titres[0] !== 'Aujourd’hui') q.push(`premier jour : « ${titres[0]} »`);
    if (titres.some((t) => /\d{4}-\d{2}/.test(t))) q.push('date brute dans un titre de jour');
    const lignes = [...document.querySelectorAll('.v2-dep-ligne')];
    if (!lignes.length) q.push('aucune ligne');
    if (lignes.some((l) => l.tagName !== 'BUTTON' || !l.getAttribute('aria-label'))) q.push('ligne qui n’est pas un <button> avec aria-label');
    if (chargeDuMois !== !!document.querySelector('.v2-dep-etiquette-du-mois')) q.push(chargeDuMois ? 'aucune étiquette « du mois »' : 'étiquette « du mois » sans charge du mois depuis le salaire');
    for (const m of document.querySelectorAll('.v2-dep-montant')) { const c = getComputedStyle(m).color; if (c === 'rgb(179, 38, 30)') q.push(`montant en rouge : ${m.textContent}`); }
    if (document.querySelectorAll('.v2-dep-question').length !== 1) q.push(`${document.querySelectorAll('.v2-dep-question').length} question(s) oui / non (attendu 1)`);
    return { q, n: lignes.length, jours: titres.length };
  });
  await verifierPage(page, 'v200-depenses', 'v200 → Dépenses : phrase, jours, étiquettes', async () => [...dep.q, ...await zonesDeToucher(page, '.v2-dep')]);
  // Toucher une ligne : la feuille de modification de l'app
  await page.locator('.v2-dep-ligne').first().click();
  await verifierFeuille(page, 'v200-detail-depense', 'v200 → Dépenses : toucher une ligne ouvre la modification', { fermer: 'bouton', extra: async () => page.evaluate(() => {
    const f = [...document.querySelectorAll('.feuille-racine')].pop();
    return [f.querySelector('.feuille-actions button.btn-principal')?.textContent.includes('Enregistrer') ? null : 'bouton « Enregistrer » absent', f.querySelector('input[aria-label="Montant"], .input-montant') ? null : 'champ montant absent'];
  }) });
  // La question oui / non : « Non » → dépense du quotidien, la question disparaît
  await page.locator('.v2-dep-question button', { hasText: 'Non' }).click();
  await attendre(page, 600);
  const reponse = await page.evaluate(async () => { const t = (await import('/js/store.js')).etat.transactions.find((x) => x.id === 'tx-probable-ecrans'); return { probable: !!t?.obligatoireProbable, hors: !!t?.horsPartDuJour, question: document.querySelectorAll('.v2-dep-question').length }; });
  rapport('v200 → Dépenses : question « obligatoire ? » sur la ligne', [reponse.probable ? 'toujours « probable » après la réponse' : null, reponse.hors ? 'toujours hors part du jour après « Non »' : null, reponse.question ? 'la question reste affichée' : null, ...viderErreurs(page)]);
  await page.evaluate(async () => { const { supprimerObjet } = await import('/js/store.js'); await supprimerObjet('transactions', 'tx-probable-ecrans'); });
  await attendre(page, 300);
  // Bas de page : « Voir le mois d'avant » ajoute des jours ; « Ajouter une rentrée d'argent » ouvre la saisie sur « Entrée »
  const plus = page.locator('.v2-dep-plus');
  if (await plus.count()) {
    const avant = await page.locator('.v2-dep-jour').count();
    await plus.click(); await attendre(page, 400);
    for (let i = 0; i < 12; i += 1) { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await attendre(page, 120); }
    const apres = await page.locator('.v2-dep-jour').count();
    rapport('v200 → Dépenses : « Voir le mois d’avant » et chargement par lots', [apres <= avant ? `toujours ${apres} jours` : null, ...viderErreurs(page)]);
    console.log(`  jours affichés : ${avant} → ${apres}`);
  } else rapport('v200 → Dépenses : « Voir le mois d’avant »', ['bouton absent alors que la sauvegarde couvre une année']);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await attendre(page, 300);
  await capturer(page, 'v200-depenses-bas');
  await page.locator('.v2-dep-rentree').click();
  await verifierFeuille(page, 'v200-rentree', 'v200 → Dépenses : « Ajouter une rentrée d’argent »', { fermer: 'bouton', extra: async () => page.evaluate(() => {
    const f = [...document.querySelectorAll('.feuille-racine')].pop();
    const actif = [...f.querySelectorAll('[role="radio"][aria-checked="true"], .segment .actif, button[aria-pressed="true"]')].map((b) => b.textContent.trim());
    return [actif.includes('Entrée') ? null : `« Entrée » pas choisi (${actif.join(', ') || 'rien'})`];
  }) });

  // ---- Épargne : trois pots, la feuille d'un pot, « À virer »
  await aller(page, '#epargne');
  await page.waitForSelector('.v2-ep', { timeout: 6000 });
  await attendre(page, 1400); // le liquide monte
  const ep = await page.evaluate(() => {
    const q = [];
    const noms = [...document.querySelectorAll('.v2-pot-nom')].map((e) => e.textContent);
    if (JSON.stringify(noms) !== JSON.stringify(['Sécurité', 'Prêt', 'Envie'])) q.push(`pots : ${noms.join(', ')}`);
    if (document.querySelectorAll('.v2-pot-carte svg.v2-bocal').length !== 3) q.push('dessin de pot manquant');
    if (document.querySelector('#vue table')) q.push('un tableau sur la page Épargne');
    if (!/arrondi/i.test(document.querySelector('.v2-phrase-arrondis')?.textContent || '')) q.push('phrase des arrondis absente');
    return { q, virer: !!document.querySelector('.v2-virer') };
  });
  await verifierPage(page, 'v200-epargne', 'v200 → Épargne : trois pots, arrondis', async () => [...ep.q, ...await zonesDeToucher(page, '.v2-ep')]);
  await page.locator('.v2-pot-carte').first().click();
  await verifierFeuille(page, 'v200-pot', 'v200 → Épargne : feuille d’un pot (2 ou 3 phrases)', { fermer: 'voile', extra: async () => page.evaluate(() => {
    const n = [...document.querySelectorAll('.feuille-racine')].pop().querySelectorAll('.v2-pot-fiche-phrases p').length;
    return [n >= 2 && n <= 3 ? null : `${n} phrase(s)`];
  }) });
  if (ep.virer) {
    await page.locator('.v2-virer').click();
    await verifierFeuille(page, 'v200-virement', 'v200 → Épargne : « À virer » ouvre le virement', { fermer: 'bouton', extra: async () => page.evaluate(() => [[...document.querySelectorAll('.feuille-racine')].pop().textContent.includes('J’ai viré') ? null : 'bouton « J’ai viré » absent']) });
  } else console.log('  rien à virer aujourd’hui : pas de bouton « À virer »');

  // ---- Résumé : météo, bascule mois / année, préventions, « Voir le détail »
  await aller(page, '#resume');
  const res = await page.waitForSelector('.v2-res', { timeout: 6000 }).then(() => true).catch(() => false);
  if (!res) { rapport('v200 → Résumé', ['page Résumé de v200 absente', ...viderErreurs(page)]); return; }
  await attendre(page, 900);
  const r1 = await page.evaluate(() => {
    const q = [];
    if (!document.querySelector('.v2-meteo-carte svg.v2-meteo')) q.push('dessin de météo absent');
    if (!(document.querySelector('.v2-meteo-titre')?.textContent || '').trim()) q.push('titre de la météo vide');
    const b = [...document.querySelectorAll('.v2-bascule-btn')].map((x) => `${x.textContent}:${x.getAttribute('aria-pressed')}`);
    if (JSON.stringify(b) !== JSON.stringify(['Ce mois-ci:true', 'Cette année:false'])) q.push(`bascule : ${b.join(', ')}`);
    const barres = document.querySelectorAll('.v2-res-barre:not(.v2-res-plus .v2-res-barre)').length;
    if (barres < 1 || barres > 3) q.push(`${barres} catégorie(s) dans « où part l’argent »`);
    const plus = document.querySelector('.v2-res-plus');
    if (plus && (!plus.inert || plus.getBoundingClientRect().height > 1)) q.push('« Voir toutes » : la liste n’est pas repliée au départ');
    if (document.querySelectorAll('.v2-res-prev').length > 3) q.push('plus de 3 préventions');
    if (document.querySelectorAll('.v2-res .v2-lien-doux').length !== 1) q.push('« Voir le détail » absent ou en double');
    return q;
  });
  await verifierPage(page, 'v200-resume', 'v200 → Résumé : météo et mois', async () => [...r1, ...await zonesDeToucher(page, '.v2-res')]);
  // « Voir toutes (N) » : déplie toutes les catégories vers le bas, « Réduire » replie
  const plusBtn = page.locator('.v2-res-plus-btn');
  if (await plusBtn.count()) {
    const lire = () => page.evaluate(() => {
      const b = document.querySelector('.v2-res-plus-btn'); const z = document.querySelector('.v2-res-plus');
      return { texte: b.textContent.trim(), ouvert: b.getAttribute('aria-expanded'), inert: z.inert, hauteur: z.getBoundingClientRect().height,
        lignes: document.querySelectorAll('.v2-res-barre').length, controle: b.getAttribute('aria-controls') === z.id };
    });
    const avant = await lire();
    await plusBtn.click(); await attendre(page, 150);
    const pendant = await lire();
    await attendre(page, 350);
    const ouvert = await lire();
    await plusBtn.scrollIntoViewIfNeeded();
    await verifierPage(page, 'v200-resume-toutes', 'v200 → Résumé : « Voir toutes » déplie la liste', async () => [
      !/^Voir toutes \(\d+\)$/.test(avant.texte) ? `bouton : « ${avant.texte} »` : null,
      Number(avant.texte.match(/\d+/)?.[0]) !== avant.lignes ? `« ${avant.texte} » pour ${avant.lignes} catégorie(s)` : null,
      !avant.controle ? 'aria-controls absent' : null,
      ouvert.ouvert !== 'true' || ouvert.inert || ouvert.texte !== 'Réduire' ? `après le toucher : ${JSON.stringify(ouvert)}` : null,
      !(pendant.hauteur > 0 && pendant.hauteur < ouvert.hauteur) ? `pas d’ouverture en douceur (${pendant.hauteur} → ${ouvert.hauteur} px)` : null,
    ].filter(Boolean));
    await plusBtn.click(); await attendre(page, 450);
    const ferme = await lire();
    rapport('v200 → Résumé : « Réduire » replie la liste', [ferme.ouvert !== 'false' || !ferme.inert || ferme.hauteur > 1 || ferme.texte !== avant.texte ? `après le second toucher : ${JSON.stringify(ferme)}` : null, ...viderErreurs(page)]);
  } else console.log('  3 catégories ou moins : pas de « Voir toutes »');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await attendre(page, 300);
  await capturer(page, 'v200-resume-bas');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.v2-bascule-btn', { hasText: 'Cette année' }).click();
  await attendre(page, 500);
  const r2 = await page.evaluate(() => {
    const q = [];
    const n = document.querySelectorAll('.v2-res-pastille').length;
    if (n < 10 || n > 12) q.push(`${n} pastille(s) de mois`);
    if (document.querySelectorAll('.v2-res-pastille .en-cours').length !== 1) q.push('mois en cours pas marqué');
    const leg = document.querySelector('.v2-res-legende')?.textContent || '';
    if (!/calme.*moyen.*chargé/.test(leg)) q.push(`légende : « ${leg} »`);
    if (document.activeElement?.textContent !== 'Cette année') q.push('le focus ne reste pas sur la bascule');
    return q;
  });
  await verifierPage(page, 'v200-resume-annee', 'v200 → Résumé : cette année', async () => r2);
  await page.locator('.v2-res .v2-lien-doux', { hasText: 'Voir le détail' }).click();
  await stable(page, 500);
  const h = await page.evaluate(() => ({ hash: location.hash, actif: document.querySelector('.barre-onglets .onglet.actif')?.dataset.onglet }));
  rapport('v200 → Résumé : « Voir le détail »', [h.hash !== '#historique' ? `adresse ${h.hash}` : null, h.actif !== 'resume' ? `onglet actif : ${h.actif}` : null, ...viderErreurs(page)]);
  await verifierPage(page, 'v200-historique', 'v200 → « Voir le détail » : mois passés (page héritée)', async () => contrastes(page, '#vue'), { pleine: true });
}

/** Lisibilité : contraste du texte sur son fond réel (4,5 pour un texte normal, 3 pour un gros texte ou en gras ≥ 18,5 px). */
const contrastes = (page, zone) => page.evaluate((z) => {
  const q = [];
  const rgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const fond = (el) => {
    const couches = [];
    for (let a = el; a; a = a.parentElement) { const c = rgb(getComputedStyle(a).backgroundColor); if (c && c.a > 0) { couches.push(c); if (c.a >= 1) break; } }
    let res = { r: 255, g: 255, b: 255 };
    for (const c of couches.reverse()) res = { r: c.r * c.a + res.r * (1 - c.a), g: c.g * c.a + res.g * (1 - c.a), b: c.b * c.a + res.b * (1 - c.a) };
    return res;
  };
  const vus = new Set();
  for (const el of document.querySelectorAll(`${z} *`)) {
    if (el.closest('svg') || el.closest('.sr') || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.5 || el.closest('[disabled], [aria-disabled="true"]')) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (/gradient|url\(/.test(cs.backgroundImage)) continue;
    const t = rgb(cs.color); if (!t) continue;
    const f = fond(el); const l1 = lum(t); const l2 = lum(f);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const taille = parseFloat(cs.fontSize); const gros = taille >= 24 || (taille >= 18.5 && Number(cs.fontWeight) >= 700);
    if (ratio < (gros ? 3 : 4.5)) {
      const cle = `${el.tagName}.${el.className}`; if (vus.has(cle)) continue; vus.add(cle);
      q.push(`texte peu lisible (contraste ${ratio.toFixed(1)}) : ${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? `.${el.className.split(' ')[0]}` : ''} « ${el.textContent.trim().slice(0, 30)} »`);
    }
  }
  return q.slice(0, 6);
}, zone);

/** Pages héritées de l'app d'origine, vues dans v200 : Réglages (la sauvegarde en haut), sections, restauration, saisie au clavier. */
async function pagesHeritees(page) {
  await aller(page, '#reglages');
  await verifierPage(page, 'v200-reglages', 'v200 → Réglages : la sauvegarde en premier', async () => [
    ...await page.evaluate(() => {
      const q = [];
      const titres = [...document.querySelectorAll('#vue .carte-titre')].map((e) => e.textContent.trim());
      if (titres[0] !== 'Sauvegarde') q.push(`première carte : « ${titres[0]} » (attendu « Sauvegarde »)`);
      if (![...document.querySelectorAll('#vue button')].some((b) => /Restaurer/.test(b.textContent))) q.push('bouton « Restaurer » absent');
      if (![...document.querySelectorAll('#vue .ligne-lien')].some((b) => /Revenir à l’ancienne app/.test(b.textContent))) q.push('lien « Revenir à l’ancienne app » absent');
      if ([...document.querySelectorAll('#vue .ligne-lien')].some((b) => /Ouvrir la nouvelle app|v100|Cockpit/.test(b.textContent))) q.push('lien vers une autre nouvelle app affiché');
      return q;
    }), ...await contrastes(page, '#vue'), ...await zonesDeToucher(page, '#vue')], { pleine: true });
  await page.locator('#vue details.reglages-avance > summary').click();
  await attendre(page, 250);
  await verifierPage(page, 'v200-reglages-avance', 'v200 → Réglages : « Avancé » ouvert', async () => contrastes(page, '#vue'), { pleine: true });
  for (const [hash, nom, attendu] of [['reglages/sauvegarde', 'Réglages → sauvegarde', /Tout exporter/], ['reglages/epargne', 'Réglages → épargne', /Partage du reste du jour/],
    ['reglages/revenus', 'Réglages → revenus', /Revenus du mois/], ['reglages/confidentialite', 'Réglages → apparence', /Revenir à l’ancienne app/], ['reglages/import', 'Import', /Restaurer|Importer/]]) {
    await aller(page, `#${hash}`);
    await verifierPage(page, `v200-${simplifier(nom)}`, `v200 → ${nom}`, async () => {
      const txt = await page.locator('#vue').textContent();
      return [attendu.test(txt) ? null : `texte attendu absent (${attendu.source})`, ...await contrastes(page, '#vue')];
    }, { pleine: true });
  }
  // Partage du reste : un choix au-delà de 100 % est refusé, un choix valable est gardé, puis on remet le réglage d'avant
  await aller(page, '#reglages/epargne');
  const avant = await page.evaluate(async () => (await import('/js/store.js')).etat.profil.partsReste || null);
  const menus = page.locator('#vue select');
  await menus.nth(0).selectOption('70'); await menus.nth(1).selectOption('40');
  const refuse = await page.locator('#vue button', { hasText: 'Garder ce partage' }).isDisabled();
  await menus.nth(1).selectOption('20');
  await page.locator('#vue button', { hasText: 'Garder ce partage' }).click();
  await attendre(page, 400);
  const garde = await page.evaluate(async () => (await import('/js/store.js')).etat.profil.partsReste);
  await page.evaluate(async (a) => (await import('/js/store.js')).majProfil({ partsReste: a || undefined }), avant);
  rapport('v200 → Réglages : partage du reste du jour', [refuse ? null : 'un partage à plus de 100 % peut être gardé', JSON.stringify(garde) !== JSON.stringify({ pret: 70, securite: 20, envie: 10 }) ? `partage gardé : ${JSON.stringify(garde)}` : null, ...viderErreurs(page)]);
  // Saisie au clavier (feuille d'origine, ouverte depuis la voix ou une saisie préremplie)
  await aller(page, '#accueil');
  await page.evaluate(async () => (await import('/js/pages/saisie.js')).ouvrirSaisie('clavier'));
  await verifierFeuille(page, 'v200-saisie-clavier', 'v200 → feuille « Nouvelle opération » (héritée)', { fermer: 'bouton' });
}

/** Ce que l'écran Aujourd'hui calcule (centimes) et ce qu'il affiche. */
const bulleV200 = (page) => page.evaluate(async () => {
  const { etat } = await import('/js/store.js'); const { aujourdhui } = await import('/js/dates.js');
  const { bulleDuJour } = await import('/js/v200/calculs/jour.js'); const { eur } = await import('/js/v200/calculs/commun.js');
  const b = bulleDuJour(etat, aujourdhui());
  const el = document.querySelector('.v2-bulle');
  return { etat: b.etat, restant: b.jauge.restantAujourdhuiCentimes, joursRestants: b.jauge.joursRestants, attendu: eur(b.montantCentimes), texte: (el?.textContent || '').replace(/\s+/g, ' ').trim(), classe: el?.className || '' };
});
const sansInsecables = (t) => (t || '').replace(/[\u00a0\u202f]/g, ' ');

/** La bulle dit la même chose que le calcul, selon qu'il reste de la marge ou non : bons mots, montant exact, jamais de chiffre négatif. */
function problemesBulle(b, quand) {
  const t = sansInsecables(b.texte);
  const mots = { ok: /Tu peux encore dépenser/, 'jour-depasse': /Aujourd’hui, tu as dépassé de/, 'mois-depasse': /Ta part du mois est déjà utilisée/ }[b.etat];
  return [
    !mots ? `${quand} : état « ${b.etat} »` : !mots.test(t) ? `${quand} (${b.etat}) : « ${t.slice(0, 70)} »` : null,
    b.etat !== 'ok' && /Tu peux encore dépenser/.test(t) ? `${quand} : « Tu peux encore dépenser » alors que l’état est « ${b.etat} »` : null,
    !t.includes(sansInsecables(b.attendu)) ? `${quand} : montant affiché ≠ ${b.attendu} (${t.slice(0, 70)})` : null,
    /[-−]\s?\d/.test(t) ? `${quand} : chiffre négatif affiché (${t.slice(0, 70)})` : null,
  ];
}
/** La ligne « ta journée » de la carte suit l'état de la bulle. */
const ligneCarteAttendue = { ok: /Il te reste/, 'jour-depasse': /Tu as dépassé de/, 'mois-depasse': /Ta part du mois est déjà utilisée/ };

/** Molette : glisse verticalement de n crans (vers le haut = +) avec de vrais événements de pointeur. */
async function glisserMolette(page, fenetre, n) {
  const PAS = 16;
  while (n) {
    const k = Math.max(-20, Math.min(20, n));
    const b = await fenetre.boundingBox();
    const x = b.x + b.width / 2; const y = b.y + b.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    const d = k * PAS + Math.sign(k) * 5;
    for (let i = 1; i <= 8; i += 1) await page.mouse.move(x, y - (d * i) / 8);
    await page.mouse.up();
    n -= k;
    await attendre(page, 60);
  }
}
const valeurRoue = (loc) => loc.getAttribute('aria-valuenow').then(Number);

/** Règle les deux molettes sur un montant (centimes, multiple de 10) : d'abord les centimes, puis les euros. */
async function reglerMolettes(page, centimes) {
  const fe = page.locator('.feuille.visible .v2-roue-euros .v2-roue-fenetre'); const fc = page.locator('.feuille.visible .v2-roue-centimes .v2-roue-fenetre');
  await glisserMolette(page, fc, (centimes % 100) / 10 - (await valeurRoue(fc)) / 10);
  await glisserMolette(page, fe, Math.floor(centimes / 100) - await valeurRoue(fe));
  return { euros: await valeurRoue(fe), centimes: await valeurRoue(fc), texte: await fe.getAttribute('aria-valuetext') };
}

/** Glisser pour valider : le rond poussé jusqu'au bout du rail, avec la souris (événements de pointeur). */
async function glisserValider(page) {
  const rond = await page.locator('.feuille.visible .v2-glisser-rond').boundingBox();
  const rail = await page.locator('.feuille.visible .v2-glisser').boundingBox();
  const x = rond.x + rond.width / 2; const y = rond.y + rond.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(x + ((rail.x + rail.width - 30 - x) * i) / 10, y + (i % 2));
  await page.mouse.up();
}

async function choisirCategorie(page, id) {
  await page.waitForSelector('.feuille.visible .v2-tuiles', { timeout: 4000 });
  let t = page.locator(`.feuille.visible .v2-tuile[data-categorie="${id}"]`);
  if (!await t.count()) {
    await page.locator('.feuille.visible .v2-tuile[data-categorie="autre"]').click(); await attendre(page, 350);
    await capturer(page, 'v200-toutes');
    t = page.locator(`.feuille.visible .v2-tuile[data-categorie="${id}"]`);
  }
  await t.first().click();
  await page.waitForSelector('.feuille.visible .v2-roue-euros .v2-roue-fenetre', { timeout: 4000 });
  await attendre(page, 350);
}
const txV200 = (page, categorie, montant) => page.evaluate(async ({ c, m }) => {
  const { etat } = await import('/js/store.js'); const { aujourdhui } = await import('/js/dates.js');
  return etat.transactions.filter((t) => t.categorie === c && t.montantCentimes === m && t.date === aujourdhui() && t.source === 'manuel').map((t) => ({ id: t.id, hors: !!t.horsPartDuJour, charge: t.chargeFixeId || null, probable: !!t.obligatoireProbable }));
}, { c: categorie, m: montant });

async function parcoursV200(page) {
  // Une journée avec de la marge : les dépenses du quotidien du jour et des 4 jours d'avant (sauvegarde synthétique) sont retirées
  await page.evaluate(async () => {
    const { etat } = await import('/js/store.js'); const { aujourdhui, ajouterJours } = await import('/js/dates.js'); const { supprimerTransaction } = await import('/js/actions.js');
    const { estQuotidienne } = await import('/js/v200/calculs/commun.js');
    const auj = aujourdhui();
    for (const t of etat.transactions.filter((x) => x.date >= ajouterJours(auj, -4) && x.date <= auj && estQuotidienne(x))) await supprimerTransaction(t);
  });
  await aller(page, '#accueil');
  const avant = await bulleV200(page);
  const arrondiActif = await page.evaluate(async () => !!(await import('/js/store.js')).etat.profil.arrondi?.actif);
  // Selon la date (--aujourdhui), il reste de la marge ou non (mois déjà dépassé la veille du salaire, par exemple) : les deux cas sont vérifiés
  console.log(`  part du jour restante avant la saisie : ${(avant.restant / 100).toFixed(2)} € (état « ${avant.etat} », ${avant.joursRestants} jour(s) avant le salaire)`);
  rapport('v200 → Aujourd’hui avant la saisie', [...problemesBulle(avant, 'avant la saisie'), ...viderErreurs(page)]);
  await capturer(page, 'v200-aujourdhui');

  // 1. J'ai dépensé : les tuiles
  await page.locator('.v2-action-depense').click();
  await verifierFeuille(page, 'v200-saisie', 'v200 → « J’ai dépensé » : tuiles', { fermer: null, extra: async () => page.evaluate(() => {
    const q = [];
    const t = [...document.querySelectorAll('.feuille.visible .v2-tuile')];
    if (t.length !== 7) q.push(`${t.length} tuiles (attendu 6 favorites + « Autre »)`);
    for (const b of t) { const r = b.getBoundingClientRect(); if (r.width < 44 || r.height < 44) q.push(`tuile trop petite : ${b.textContent}`); }
    if (document.querySelector('.feuille.visible input')) q.push('un champ de saisie est visible d’emblée');
    return q;
  }) });

  // 2. 7,30 € en restauration rapide : molettes (pointeur) + glisser
  const t0 = Date.now();
  await choisirCategorie(page, 'restauration-rapide');
  const r = await reglerMolettes(page, 730);
  const geste = await page.evaluate(() => {
    const f = document.querySelector('.feuille.visible');
    return { visible: !!f, transform: f?.style.transform || '', defile: f?.querySelector('.feuille-corps').scrollTop || 0 };
  });
  const ctrl = await controler(page, '.feuille-racine:last-of-type');
  const cibles = await page.evaluate(() => [...document.querySelectorAll('.feuille.visible button, .feuille.visible [role="spinbutton"]')].filter((b) => b.getClientRects().length)
    .map((b) => { const x = b.getBoundingClientRect(); return x.width < 44 || x.height < 44 ? `${(b.getAttribute('aria-label') || b.textContent).trim()} (${Math.round(x.width)} × ${Math.round(x.height)})` : null; }).filter(Boolean));
  const bords = await page.evaluate(() => { const x = document.querySelector('.feuille.visible .v2-glisser').getBoundingClientRect(); return [Math.round(x.left), Math.round(innerWidth - x.right)]; });
  await capturer(page, 'v200-saisie-montant');
  rapport('v200 → molettes : 7,30 €', [r.euros !== 7 || r.centimes !== 30 ? `molettes sur ${r.euros},${r.centimes}` : null, r.texte !== '7 euros 30' ? `aria-valuetext « ${r.texte} »` : null,
    !geste.visible || geste.transform ? 'la feuille a bougé pendant le glisser de la molette' : null, geste.defile ? 'la feuille a défilé pendant le glisser de la molette' : null,
    ...cibles.map((c) => `zone de toucher trop petite : ${c}`), bords.some((b) => b < 24) ? `rail « Glisse pour valider » à ${bords.join(' / ')} px des bords (< 24)` : null, ...ctrl, ...viderErreurs(page)]);
  await glisserValider(page);
  await page.waitForFunction(() => !document.querySelector('.feuille.visible'), null, { timeout: 4000 }).catch(() => {});
  console.log(`  saisie de 7,30 € (tuile → molettes → glisser) : ${((Date.now() - t0) / 1000).toFixed(1)} s avec les attentes de l’outil`);
  const tx = await txV200(page, 'restauration-rapide', 730);
  await stable(page, 1500); // laisse le soleil se vider
  const apres = await bulleV200(page);
  const baisse = avant.restant - apres.restant; const attendue = arrondiActif ? 800 : 730;
  rapport('v200 → dépense de 7,30 € enregistrée', [tx.length !== 1 ? `${tx.length} dépense(s) trouvée(s)` : null, baisse !== attendue ? `la journée baisse de ${baisse} centimes au lieu de ${attendue}${arrondiActif ? ' (arrondi actif)' : ''}` : null,
    ...problemesBulle(apres, 'après la saisie'), ...viderErreurs(page)]);
  console.log(`  arrondi ${arrondiActif ? 'actif' : 'inactif'} : la journée baisse de ${(baisse / 100).toFixed(2)} €`);
  if (await verifierCarte(page, 'v200-confirmation', 'v200 → carte après la dépense')) {
    const txt = (await page.locator('.confirmation.visible').textContent()).replace(/\s+/g, ' ');
    await page.locator('.confirmation.visible .v2-conf-annuler').click();
    await attendre(page, 600);
    const reste = await txV200(page, 'restauration-rapide', 730);
    const fin = await bulleV200(page);
    rapport('v200 → carte : « Annuler »', [!/C’est noté/.test(txt) ? `texte de la carte : ${txt.slice(0, 80)}` : null,
      !ligneCarteAttendue[apres.etat]?.test(txt) ? `la carte ne dit pas la même chose que la bulle (${apres.etat}) : ${txt.slice(0, 90)}` : null, /[-−]\s?\d/.test(txt) ? `chiffre négatif sur la carte : ${txt.slice(0, 90)}` : null,
      reste.length ? 'la dépense est toujours dans les données' : null,
      fin.restant !== avant.restant ? `le reste du jour ne revient pas (${fin.restant} au lieu de ${avant.restant})` : null, await page.locator('.confirmation').count() ? 'la carte reste affichée' : null, ...viderErreurs(page)]);
  }

  // 3. Un loyer de 230 € en logement : appui long sur « + », puis flèches ; dépense obligatoire → pas comptée comme une dépense du jour,
  //    et la carte dit ce qu'elle change vraiment (rien, répartie sur les jours qui restent, en entier le dernier jour, mois déjà dépassé)
  const b2 = await bulleV200(page);
  await page.locator('.v2-action-depense').click();
  await choisirCategorie(page, 'logement');
  const plus = await page.locator('.feuille.visible .v2-roue-euros .v2-roue-btn.plus').boundingBox();
  await page.mouse.move(plus.x + plus.width / 2, plus.y + plus.height / 2); await page.mouse.down(); await attendre(page, 3200); await page.mouse.up();
  const fe = page.locator('.feuille.visible .v2-roue-euros .v2-roue-fenetre'); const fc = page.locator('.feuille.visible .v2-roue-centimes .v2-roue-fenetre');
  const apresAppui = await valeurRoue(fe);
  await fc.focus(); await page.keyboard.press('Home');
  await fe.focus();
  for (let i = 0; i < 60 && await valeurRoue(fe) !== 230; i += 1) {
    const v = await valeurRoue(fe);
    await page.keyboard.press(Math.abs(230 - v) >= 10 ? (v < 230 ? 'PageUp' : 'PageDown') : (v < 230 ? 'ArrowUp' : 'ArrowDown'));
  }
  const loyerOk = (await valeurRoue(fe)) === 230 && (await valeurRoue(fc)) === 0;
  await glisserValider(page);
  await page.waitForSelector('.confirmation.visible', { timeout: 4000 }).catch(() => {});
  await attendre(page, 400);
  const q = page.locator('.confirmation.visible .v2-conf-oui-non button', { hasText: 'Oui' });
  const question = await q.count();
  if (question) { await capturer(page, 'v200-question'); await q.click(); await attendre(page, 500); }
  const carteLoyer = (await page.locator('.confirmation').textContent().catch(() => '')).replace(/\s+/g, ' ');
  const loyer = await txV200(page, 'logement', 23000);
  await stable(page, 400);
  const b3 = await bulleV200(page);
  console.log(`  appui long de 3,2 s sur « + » : ${apresAppui} € ; question « obligatoire ? » : ${question ? 'oui (répondu Oui)' : 'non (reconnue sûre)'}`);
  const baisseLoyer = b2.restant - b3.restant;
  const pasComptee = /pas comptée dans ta journée/.test(carteLoyer);
  console.log(`  loyer : la journée baisse de ${(baisseLoyer / 100).toFixed(2)} € (état « ${b2.etat} » → « ${b3.etat} ») ; carte : ${carteLoyer.replace(/.*?(Charge du mois[^.]*\.[^.]*\.?).*/, '$1').slice(0, 110)}`);
  rapport('v200 → loyer de 230 € (logement)', [!loyerOk ? 'les molettes ne sont pas sur 230,00 €' : null, apresAppui < 60 ? `l’appui long n’accélère pas assez (${apresAppui} € en 3,2 s)` : null,
    loyer.length !== 1 ? `${loyer.length} loyer(s) trouvé(s)` : null, loyer[0] && !(loyer[0].hors || loyer[0].charge) ? 'le loyer compte dans la journée' : null, loyer[0]?.probable ? 'la réponse « Oui » n’est pas enregistrée' : null,
    b2.joursRestants > 1 && baisseLoyer >= 23000 ? `le loyer compte en entier dans la journée (baisse de ${baisseLoyer} centimes) alors qu’il reste ${b2.joursRestants} jours` : null,
    ...problemesBulle(b3, 'après le loyer'),
    !/Charge du mois/.test(carteLoyer) ? `la carte dit : ${carteLoyer.slice(0, 80)}` : null,
    pasComptee && baisseLoyer > 0 ? `la carte dit « pas comptée dans ta journée » mais la journée baisse de ${baisseLoyer} centimes` : null,
    !pasComptee && baisseLoyer <= 0 && b3.etat !== 'mois-depasse' ? `la journée ne bouge pas mais la carte dit : ${carteLoyer.slice(0, 80)}` : null,
    b3.etat === 'mois-depasse' && !/déjà utilisée/.test(carteLoyer) ? `mois dépassé, mais la carte dit : ${carteLoyer.slice(0, 80)}` : null,
    /[-−]\s?\d/.test(carteLoyer) ? `chiffre négatif sur la carte : ${carteLoyer.slice(0, 80)}` : null, ...viderErreurs(page)]);
  await page.evaluate(async () => {
    const { etat } = await import('/js/store.js'); const { supprimerTransaction } = await import('/js/actions.js');
    for (const t of etat.transactions.filter((x) => x.categorie === 'logement' && x.montantCentimes === 23000 && x.source === 'manuel')) await supprimerTransaction(t);
  });
  await page.locator('.confirmation .v2-conf-fermer').click().catch(() => {});

  // 4. La carte se ferme seule (~6 s) : petite dépense, horloge avancée
  await aller(page, '#accueil');
  await page.locator('.v2-action-depense').click();
  await choisirCategorie(page, 'courses');
  await reglerMolettes(page, 120);
  await page.locator('.feuille.visible .v2-glisser-ok').click(); // le bouton « Valider » (VoiceOver), sans glisser
  await page.waitForSelector('.confirmation.visible', { timeout: 4000 }).catch(() => {});
  await page.clock.runFor(5000);
  const encore = await page.locator('.confirmation.visible').count();
  await page.clock.runFor(1500); await attendre(page, 500);
  rapport('v200 → carte : bouton « Valider » et fermeture seule après ~6 s', [(await txV200(page, 'courses', 120)).length !== 1 ? 'le bouton « Valider » n’enregistre pas' : null,
    !encore ? 'la carte disparaît avant 5 s' : null, await page.locator('.confirmation').count() ? 'la carte est encore là après 6,5 s' : null, ...viderErreurs(page)]);
  await page.evaluate(async () => {
    const { etat } = await import('/js/store.js'); const { supprimerTransaction } = await import('/js/actions.js');
    for (const t of etat.transactions.filter((x) => x.categorie === 'courses' && x.montantCentimes === 120 && x.source === 'manuel')) await supprimerTransaction(t);
  });

  // 5. Je me suis privé : tuile → glisser → carte → Annuler
  await stable(page);
  const nPriv = () => page.evaluate(async () => (await import('/js/store.js')).etat.privations.length);
  const n0 = await nPriv();
  await page.locator('.v2-action-privation').click();
  await verifierFeuille(page, 'v200-privation', 'v200 → « Je me suis privé » : tuiles', { fermer: null });
  await page.locator('.feuille.visible .v2-tuile').first().click();
  await page.waitForSelector('.feuille.visible .v2-glisser', { timeout: 4000 });
  await attendre(page, 300);
  await capturer(page, 'v200-privation-montant');
  await glisserValider(page);
  await page.waitForSelector('.confirmation.visible', { timeout: 4000 }).catch(() => {});
  const n1 = await nPriv();
  const txtP = (await page.locator('.confirmation.visible').textContent().catch(() => '')).replace(/\s+/g, ' ');
  await page.locator('.confirmation.visible .v2-conf-annuler').click().catch(() => {});
  await attendre(page, 500);
  rapport('v200 → privation et « Annuler »', [n1 !== n0 + 1 ? 'la privation n’est pas enregistrée' : null, !/mis de côté/.test(txtP) ? `carte : ${txtP.slice(0, 80)}` : null,
    (await nPriv()) !== n0 ? 'la privation est toujours là après « Annuler »' : null, ...viderErreurs(page)]);

  // 6. La carte se ferme au changement de page
  await page.locator('.v2-action-privation').click();
  await page.locator('.feuille.visible .v2-tuile').first().click();
  await page.locator('.feuille.visible .v2-glisser-ok').click();
  await page.waitForSelector('.confirmation.visible', { timeout: 4000 }).catch(() => {});
  await page.locator('.barre-onglets .onglet[data-onglet="epargne"]').click();
  await attendre(page, 600);
  rapport('v200 → carte : changement de page', [await page.locator('.confirmation').count() ? 'la carte reste affichée sur la page Épargne' : null, ...viderErreurs(page)]);
}

// ---------------------------------------------------------------- Lancement
try {
  if (ALLER_RETOUR) await allerRetour();
  else if (ORIGINE) await ecransOrigine();
  else await ecransV200();
} catch (e) {
  console.error(`✗ Arrêt : ${e.message.split('\n')[0]}`);
  problemesTotal += 1;
} finally {
  await navigateur.close();
}
console.log(problemesTotal ? `${problemesTotal} problème(s).` : 'Tout est OK.');
process.exit(problemesTotal ? 1 : 0);
