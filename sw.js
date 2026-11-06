// sw.js — service worker : coquille de l'app en cache versionné (cache-first), hors ligne complet.
// pdf.js (vendor/pdfjs) et Tesseract (vendor/tesseract) sont mis en cache à la première utilisation. Les appels Gemini ne sont JAMAIS mis en cache.
// Mise à jour : changer VERSION (doit égaler versionApp dans js/version.js), puis publier.

const VERSION = '1.23.0';
const CACHE_COQUILLE = `budget-coquille-${VERSION}`;
const CACHE_PDFJS = `budget-pdfjs-${VERSION}`;
// Tesseract (lecture des captures, ~5 Mo) : gardé d'une version de l'app à l'autre, change seulement avec la bibliothèque
const CACHE_TESSERACT = 'budget-tesseract-5.1.1';

const COQUILLE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/composants.css',
  './css/pages.css',
  './css/variables.css',
  './icons/apple-touch-icon-180.png',
  './icons/icone-192.png',
  './icons/icone-512.png',
  './icons/icone-maskable-512.png',
  './icons/icone.svg',
  './js/abonnements.js',
  './js/actions.js',
  './js/diagnostic.js',
  './js/journal.js',
  './js/majapp.js',
  './js/miseajour.js',
  './js/app-theme.js',
  './js/app.js',
  './js/bridge.js',
  './js/calculs.js',
  './js/capture.js',
  './js/raisonnement.js',
  './js/camera.js',
  './js/categories.js',
  './js/charts.js',
  './js/coach.js',
  './js/conseils.js',
  './js/dates.js',
  './js/db.js',
  './js/detecteurs.js',
  './js/dettes.js',
  './js/epargne.js',
  './js/gemini.js',
  './js/ia.js',
  './js/ics.js',
  './js/migrations.js',
  './js/money.js',
  './js/paliers.js',
  './js/virements.js',
  './js/pages/coffres.js',
  './js/plan.js',
  './js/privations.js',
  './js/prompts.js',
  './js/router.js',
  './js/rules.js',
  './js/saisie.js',
  './js/sauvegarde.js',
  './js/securite.js',
  './js/store.js',
  './js/version.js',
  './js/voice.js',
  './js/import/csv.js',
  './js/import/lcl-pdf.js',
  './js/import/pdf-loader.js',
  './js/import/pipeline.js',
  './js/import/revolut-pdf.js',
  './js/pages/abonnements.js',
  './js/pages/accueil.js',
  './js/pages/avenir.js',
  './js/pages/budgets.js',
  './js/pages/capture.js',
  './js/pages/communs.js',
  './js/pages/depenses.js',
  './js/pages/epargne.js',
  './js/pages/historique.js',
  './js/pages/import.js',
  './js/pages/onboarding.js',
  './js/pages/privation.js',
  './js/pages/reglages.js',
  './js/pages/saisie-file.js',
  './js/pages/saisie.js',
  './js/pages/systeme-epargne.js',
  './js/ui/composants.js',
  './js/ui/dom.js',
  './js/ui/icones.js',
  './js/ui/sheet.js',
  './js/ui/toast.js',
];

self.addEventListener('install', (e) => {
  // Chaque fichier est demandé sous une adresse propre à la version (« ?v=1.20.0 ») : ni le cache du navigateur
  // ni celui de GitHub Pages (jusqu'à 10 min) ne peuvent renvoyer l'ancienne version. Rangé sous l'adresse normale.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_COQUILLE);
    await Promise.all(COQUILLE.map(async (u) => {
      const rep = await fetch(new Request(`${u}${u.includes('?') ? '&' : '?'}v=${encodeURIComponent(VERSION)}`, { cache: 'reload' }));
      if (!rep.ok) throw new Error(`${u} : ${rep.status}`);
      await c.put(u, rep);
    }));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter((n) => n.startsWith('budget-') && n !== CACHE_COQUILLE && n !== CACHE_PDFJS && n !== CACHE_TESSERACT).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Gemini et tout le reste : réseau direct, jamais en cache
  // Vérification de version (sw.js) et requêtes « sans cache » : toujours le réseau, jamais une copie gardée ici
  if (url.pathname.split('/').pop() === 'sw.js' || req.cache === 'no-store') return;
  if (url.pathname.includes('vendor/pdfjs/') || url.pathname.includes('vendor/tesseract/')) {
    e.respondWith((async () => {
      const c = await caches.open(url.pathname.includes('vendor/tesseract/') ? CACHE_TESSERACT : CACHE_PDFJS);
      const deja = await c.match(req);
      if (deja) return deja;
      const rep = await fetch(req);
      if (rep.ok) c.put(req, rep.clone());
      return rep;
    })());
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith((async () => (await caches.match('./index.html', { ignoreSearch: true })) || fetch(req))());
    return;
  }
  e.respondWith((async () => {
    const deja = await caches.match(req, { ignoreSearch: true });
    if (deja) return deja;
    try {
      const rep = await fetch(req);
      if (rep.ok && rep.type === 'basic') (await caches.open(CACHE_COQUILLE)).put(req, rep.clone());
      return rep;
    } catch {
      return new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
