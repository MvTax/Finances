#!/usr/bin/env node
// ecrans.mjs — vérifie les écrans de l'app dans Chromium (Playwright), en largeur iPhone (390 × 844, thème sombre),
// avec la sauvegarde SYNTHÉTIQUE (tests/outils/generer-sauvegarde.mjs), jamais de vraies données.
// Outil de développement : n'est pas chargé par l'app. Aucune dépendance du projet (Playwright installé globalement).
//
// Prérequis : un serveur à la racine du dépôt :  python3 -m http.server 8765
// Usage :
//   node tools/ecrans.mjs                      écrans v100 (?app=v100)
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
const BASE = valeur('--url', 'http://localhost:8765/');
const { REFERENCE_DEFAUT } = await import(path.join(RACINE, 'tests/outils/generer-sauvegarde.mjs'));
const AUJ = valeur('--aujourdhui', REFERENCE_DEFAUT);
const simplifier = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CAPTURES = new Set(args.flatMap((a, i) => (args[i - 1] === '--capture' ? a.split(',') : [])).map(simplifier));
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
const FICHIER = path.join(DOSSIER, 'sauvegarde-synthetique.json');
execFileSync(process.execPath, [path.join(RACINE, 'tests/outils/generer-sauvegarde.mjs'), FICHIER, '--aujourdhui', AUJ], { stdio: 'ignore' });
const ORIGINAL = JSON.parse(readFileSync(FICHIER, 'utf8'));

const navigateur = await chromium.launch();
const attendre = (page, ms) => page.waitForTimeout(ms);

async function nouveauContexte() {
  const contexte = await navigateur.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR }, deviceScaleFactor: 1, colorScheme: 'dark', isMobile: true, hasTouch: true,
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
async function verifierPage(page, id, libelle, extra = async () => []) {
  const p = [...await controler(page, '#app'), ...await extra()];
  await capturer(page, id, { pleine: true });
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
  p.push(...await controler(page, '.feuille-racine:last-of-type'), ...await extra());
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
async function saisirDepense(page, montant, libelle, { ouvrir = 'v100', verifier = null } = {}) {
  if (ouvrir === 'v100') await page.locator('.ck-action-depense').click();
  else await page.locator('#bouton-plus').click();
  await page.waitForSelector('.feuille.visible form.vue-clavier', { timeout: 4000 });
  await attendre(page, 350);
  await page.locator('.feuille.visible input[aria-label="Montant"]').fill(montant);
  await page.locator('.feuille.visible form.vue-clavier input.input:not([aria-label]):not([type])').first().fill(libelle);
  if (verifier) await verifier();
  await page.locator('.feuille.visible form.vue-clavier button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('.feuille.visible'), null, { timeout: 4000 }).catch(() => {});
}
const trouverTx = (page, libelle) => page.evaluate(async (l) => (await import('/js/store.js')).etat.transactions.filter((t) => t.libelle === l).length, libelle);

// ---------------------------------------------------------------- v100

async function ecransV100() {
  const { contexte, page } = await nouveauContexte();
  await restaurer(page, 'v100');
  await aller(page, '#accueil');
  await page.waitForSelector('.ck', { timeout: 6000 });

  await verifierPage(page, 'accueil', 'Accueil', async () => page.evaluate((H) => {
    const q = [];
    for (const el of document.querySelectorAll('.ck-lignes > *')) if (el.tagName !== 'BUTTON') q.push(`ligne de l’Accueil qui n’est pas un <button> : ${el.tagName.toLowerCase()}`);
    const ck = document.querySelector('.ck');
    const bas = ck.getBoundingClientRect().bottom + scrollY;
    const limite = Math.round(1.5 * H);
    console.info(`hauteur Accueil ${Math.round(bas)}`);
    if (bas > limite + 20) q.push(`Accueil trop long : ${Math.round(bas)} px de contenu (> ~${limite} px, 1,5 écran)`);
    return q;
  }, HAUTEUR));
  const hauteur = await page.evaluate(() => Math.round(document.querySelector('.ck').getBoundingClientRect().bottom + scrollY));
  console.log(`  hauteur de l’Accueil : ${hauteur} px (1,5 écran = ${Math.round(1.5 * HAUTEUR)} px)`);

  // Les fiches de l'Accueil (chaque méthode de fermeture est essayée)
  await page.locator('.ck-libelle button.q').click();
  await verifierFeuille(page, 'fiche-jour', 'Fiche « ? » du cadran (ficheJour)', { fermer: 'bouton' });
  for (const [nom, id, fermer] of [['Ton épargne', 'fiche-epargne', 'voile'], ['Ce mois-ci', 'fiche-mois', 'glissement'], ['Ta série', 'fiche-serie', 'bouton'], ['Ton envie', 'fiche-envie', 'voile']]) {
    const l = page.locator('.ck-lignes .ck-ligne', { hasText: nom });
    if (!await l.count()) { rapport(`Fiche « ${nom} »`, ['ligne absente de l’Accueil']); continue; }
    await l.click();
    await verifierFeuille(page, id, `Fiche « ${nom} »`, { fermer });
  }

  // J'ai dépensé → saisie → carte → Plus d'explications
  await page.locator('.ck-action-depense').click();
  await verifierFeuille(page, 'saisie', 'Saisie « J’ai dépensé »', { fermer: 'bouton' });
  await saisirDepense(page, '4,20', 'SAISIE TEST EXEMPLE');
  if ((await trouverTx(page, 'SAISIE TEST EXEMPLE')) !== 1) rapport('Saisie d’une dépense', ['la dépense n’est pas enregistrée']);
  if (await verifierCarte(page, 'carte-depense', 'Carte de confirmation (dépense)')) {
    await page.locator('.confirmation.visible .confirmation-plus').click();
    await verifierFeuille(page, 'fiche-depense', 'Fiche « Plus d’explications » (dépense)', { fermer: 'glissement' });
  }

  // Annuler supprime vraiment la dépense
  await saisirDepense(page, '3,10', 'ANNULER EXEMPLE');
  const avant = await trouverTx(page, 'ANNULER EXEMPLE');
  await page.waitForSelector('.confirmation.visible', { timeout: 4000 }).catch(() => {});
  const bAnnuler = page.locator('.confirmation.visible button', { hasText: 'Annuler' });
  if (!await bAnnuler.count()) rapport('Carte : « Annuler »', ['bouton Annuler absent']);
  else {
    await bAnnuler.click(); await attendre(page, 500);
    const apres = await trouverTx(page, 'ANNULER EXEMPLE');
    const visible = await page.locator('.confirmation').count();
    rapport('Carte : « Annuler »', [avant !== 1 ? 'la dépense n’avait pas été enregistrée' : null, apres !== 0 ? 'la dépense est toujours dans les données' : null, visible ? 'la carte reste affichée' : null, ...viderErreurs(page)]);
  }

  // La carte disparaît quand on change de page
  await saisirDepense(page, '2,00', 'PAGE EXEMPLE');
  await page.waitForSelector('.confirmation.visible', { timeout: 4000 }).catch(() => {});
  await page.locator('.barre-onglets .onglet[data-onglet="strategie"]').click();
  await attendre(page, 600);
  rapport('Carte : changement de page', [await page.locator('.confirmation').count() ? 'la carte reste affichée sur la page Stratégie' : null, ...viderErreurs(page)]);
  await aller(page, '#accueil');

  // La carte se ferme seule après 9 s
  await saisirDepense(page, '1,50', 'DUREE EXEMPLE');
  await page.waitForSelector('.confirmation.visible', { timeout: 4000 }).catch(() => {});
  await page.clock.runFor(8000);
  const encore = await page.locator('.confirmation.visible').count();
  await page.clock.runFor(1500); await attendre(page, 500);
  const fin = await page.locator('.confirmation').count();
  rapport('Carte : fermeture seule après 9 s', [!encore ? 'la carte disparaît avant 9 s' : null, fin ? 'la carte est encore là après 9,5 s' : null, ...viderErreurs(page)]);
  await page.evaluate(async () => {
    const { etat } = await import('/js/store.js'); const { supprimerTransaction } = await import('/js/actions.js');
    for (const t of etat.transactions.filter((x) => /^(PAGE|DUREE) EXEMPLE$/.test(x.libelle))) await supprimerTransaction(t);
  });

  // Je me suis privé → carte
  await stable(page);
  await page.locator('.ck-action', { hasText: 'Je me suis privé' }).click();
  await verifierFeuille(page, 'privation', 'Feuille « Je me suis privé »', { fermer: null });
  await page.locator('.feuille.visible .btn-principal.btn-large').click();
  if (await verifierCarte(page, 'carte-privation', 'Carte de confirmation (privation)')) await page.locator('.confirmation.visible .confirmation-fermer').click();
  await attendre(page, 400);

  // Stratégie et ses outils
  await aller(page, '#strategie');
  await verifierPage(page, 'strategie', 'Stratégie (liste)');
  const OUTILS = [['score', 'Score'], ['habitudes', 'Mes habitudes'], ['pret', 'Prêt'], ['projection', 'Projection'], ['coach', 'Brief'], ['categories', 'Catégories'], ['repartition', 'Répartition'], ['tresorerie', 'Trésorerie']];
  for (const [route, nom] of OUTILS) {
    await aller(page, `#strategie/${route}`);
    await attendre(page, 300);
    await verifierPage(page, route, `Stratégie → ${nom}`, route === 'habitudes' ? () => controlerHistogramme(page) : async () => []);
  }
  for (const [route, nom] of [['abonnements', 'Abonnements'], ['statistiques', 'Mois passés']]) {
    await aller(page, `#${route}`);
    await verifierPage(page, simplifier(nom), `Petit outil → ${nom}`);
  }
  for (const nom of ['Recalcul complet', 'Et si j’achète ?']) {
    await aller(page, '#strategie');
    await page.locator('.outil-mini', { hasText: nom }).click();
    await verifierFeuille(page, simplifier(nom), `Petit outil → ${nom}`, { fermer: 'bouton' });
  }
  await contexte.close();
}

/** Mes habitudes : l'histogramme « À quoi ressemble une journée » et sa phrase. */
async function controlerHistogramme(page) {
  return page.evaluate(() => {
    const q = [];
    const panneau = [...document.querySelectorAll('#vue section, #vue .panneau, #vue div')].find((el) => /^À quoi ressemble une journée/.test(el.firstElementChild?.textContent?.trim() || ''));
    if (!panneau) return ['panneau « À quoi ressemble une journée » introuvable'];
    const svg = panneau.querySelector('svg');
    if (!svg) return ['histogramme absent'];
    const s = svg.getBoundingClientRect();
    const textes = [...svg.querySelectorAll('text')].map((t) => ({ t: t.textContent, r: t.getBoundingClientRect(), taille: parseFloat(getComputedStyle(t).fontSize) * (s.width / svg.viewBox.baseVal.width) }));
    for (const x of textes) {
      if (x.taille < 10.5) { q.push(`étiquette trop petite dans l’histogramme (« ${x.t} » à ${x.taille.toFixed(1)} px)`); break; }
    }
    for (let i = 0; i < textes.length; i += 1) for (let j = i + 1; j < textes.length; j += 1) {
      const a = textes[i].r; const b = textes[j].r;
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) q.push(`étiquettes qui se chevauchent : « ${textes[i].t} » et « ${textes[j].t} »`);
    }
    for (const x of textes) if (x.r.top < s.top - 1 || x.r.right > s.right + 1 || x.r.left < s.left - 1) q.push(`étiquette coupée par le cadre : « ${x.t} »`);
    const phrase = [...panneau.querySelectorAll('p')].find((p) => /journée/.test(p.textContent));
    if (!phrase) q.push('phrase sous l’histogramme absente');
    else {
      const cs = getComputedStyle(phrase);
      if (parseFloat(cs.fontSize) < 13) q.push(`phrase sous l’histogramme trop petite (${cs.fontSize})`);
      if (phrase.scrollWidth > phrase.clientWidth + 1) q.push('phrase sous l’histogramme coupée');
    }
    return q;
  });
}

// ---------------------------------------------------------------- App d'origine

async function ecransOrigine() {
  const { contexte, page } = await nouveauContexte();
  await restaurer(page, 'origine');
  for (const style of ['classique', 'joyeux']) {
    await page.evaluate(async (st) => (await import('/js/store.js')).majParametres({ style: st }), style);
    await page.goto(`${BASE}?app=origine#accueil`);
    await page.reload();
    await stable(page, 600);
    const st = await page.evaluate(() => ({ app: document.documentElement.dataset.app || 'origine', style: document.documentElement.dataset.style || 'classique', strat: getComputedStyle(document.querySelector('.onglet-v100')).display }));
    rapport(`Origine ${style} : habillage`, [st.app !== 'origine' ? `app « ${st.app} » au lieu de l’origine` : null, st.style !== style ? `style « ${st.style} »` : null, st.strat !== 'none' ? 'onglet Stratégie visible' : null]);
    viderErreurs(page);
    for (const [hash, nom] of [['accueil', 'Accueil'], ['depenses', 'Dépenses'], ['budgets', 'Budgets'], ['historique', 'Historique'], ['avenir', 'Avenir'], ['abonnements', 'Abonnements'], ['epargne', 'Épargne'], ['reglages', 'Réglages'], ['reglages/sauvegarde', 'Sauvegarde et export']]) {
      await aller(page, `#${hash}`);
      await verifierPage(page, `origine-${style}-${simplifier(nom)}`, `Origine ${style} → ${nom}`);
    }
    await aller(page, '#accueil');
    await saisirDepense(page, '4,20', `ORIGINE ${style.toUpperCase()} EXEMPLE`, { ouvrir: 'plus' });
    await attendre(page, 500);
    const toast = await page.locator('#toasts .toast').first().textContent().catch(() => null);
    const carte = await page.locator('.confirmation').count();
    await capturer(page, `origine-${style}-saisie`);
    rapport(`Origine ${style} → saisie d’une dépense`, [!toast || !/Dépense ajoutée : 4,20/.test(toast.replace(/ | /g, ' ')) ? `message habituel absent (${toast || 'aucun'})` : null, carte ? 'carte v100 affichée dans l’app d’origine' : null, ...viderErreurs(page)]);
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

/** Les chiffres de l'Accueil v100 (reste, lignes) pour comparer avant / après. */
const chiffresAccueil = (page) => page.evaluate(() => [...document.querySelectorAll('.ck-montant, .ck-ligne-valeur, .ck-ligne-texte small, .ck-solde strong')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

async function allerRetour() {
  const { contexte, page } = await nouveauContexte();
  await restaurer(page, 'v100');
  await aller(page, '#accueil');
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
  await restaurer(c2.page, 'v100', f2);
  await aller(c2.page, '#accueil');
  const apres = await chiffresAccueil(c2.page);
  const diff = avant.map((x, i) => (x !== apres[i] ? `« ${x} » → « ${apres[i]} »` : null)).filter(Boolean);
  rapport('Aller-retour → chiffres de l’Accueil après nouvelle restauration', [avant.length !== apres.length ? `${avant.length} chiffres avant, ${apres.length} après` : null, ...diff, ...viderErreurs(c2.page)]);
  await c2.contexte.close();
}

// ---------------------------------------------------------------- Lancement
try {
  if (ALLER_RETOUR) await allerRetour();
  else if (ORIGINE) await ecransOrigine();
  else await ecransV100();
} catch (e) {
  console.error(`✗ Arrêt : ${e.message.split('\n')[0]}`);
  problemesTotal += 1;
} finally {
  await navigateur.close();
}
console.log(problemesTotal ? `${problemesTotal} problème(s).` : 'Tout est OK.');
process.exit(problemesTotal ? 1 : 0);
