// sw.js — service worker : coquille de l'app en cache versionné (cache-first), hors ligne complet.
// pdf.js (vendor/pdfjs) est mis en cache à la première utilisation. Les appels Gemini ne sont JAMAIS mis en cache.
// Mise à jour : changer VERSION (doit égaler versionApp dans js/version.js), puis publier.

const VERSION = '1.0.0';
const CACHE_COQUILLE = `budget-coquille-${VERSION}`;
const CACHE_PDFJS = `budget-pdfjs-${VERSION}`;

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
  './js/actions.js',
  './js/app-theme.js',
  './js/app.js',
  './js/bridge.js',
  './js/calculs.js',
  './js/camera.js',
  './js/categories.js',
  './js/charts.js',
  './js/coach.js',
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
  './js/plan.js',
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
  './js/pages/accueil.js',
  './js/pages/budgets.js',
  './js/pages/communs.js',
  './js/pages/depenses.js',
  './js/pages/epargne.js',
  './js/pages/historique.js',
  './js/pages/import.js',
  './js/pages/onboarding.js',
  './js/pages/reglages.js',
  './js/pages/saisie-file.js',
  './js/pages/saisie.js',
  './js/ui/composants.js',
  './js/ui/dom.js',
  './js/ui/icones.js',
  './js/ui/sheet.js',
  './js/ui/toast.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_COQUILLE).then((c) => c.addAll(COQUILLE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter((n) => n.startsWith('budget-') && n !== CACHE_COQUILLE && n !== CACHE_PDFJS).map((n) => caches.delete(n)));
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
  if (url.pathname.includes('vendor/pdfjs/')) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE_PDFJS);
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
