// app.js — démarrage de l'app : base, PIN, onboarding, routeur, service worker, clavier iOS.

import { installerJournal } from './journal.js';
import { charger, etat, surChangement } from './store.js';
import { definirRoute, quandNavigation, demarrerRouteur, rendre as rendreRoute, routeActuelle, aller } from './router.js';
import { spriteSVG } from './ui/icones.js';
import { h, icone, definirMasquage } from './ui/dom.js';
import { toast, toastErreur } from './ui/toast.js';
import { appliquerTheme } from './app-theme.js';
import { verrouiller, installerConfidentialite } from './securite.js';
import { definirNomsCategories } from './categories.js';
import { versionApp } from './version.js';

installerJournal();

const PAGES = {
  accueil: () => import('./pages/accueil.js'),
  depenses: () => import('./pages/depenses.js'),
  budgets: () => import('./pages/budgets.js'),
  epargne: () => import('./pages/epargne.js'),
  historique: () => import('./pages/historique.js'),
  reglages: () => import('./pages/reglages.js'),
  onboarding: () => import('./pages/onboarding.js'),
};
const ONGLET = { accueil: 'accueil', depenses: 'depenses', budgets: 'accueil', historique: 'accueil', epargne: 'epargne', reglages: 'reglages' };

let pageCourante = null;
let paramsCourants = [];

async function afficher(route) {
  const vue = document.getElementById('vue');
  if (route.nom === 'ajout-vocal') { history.replaceState(null, '', '#accueil'); await afficher({ nom: 'accueil', params: [] }); ouvrirPlus('voix'); return; }
  if (route.nom === 'bridge') {
    history.replaceState(null, '', '#reglages');
    try { const { decoder, recevoir } = await import('./bridge.js'); await recevoir(await decoder(route.params[0])); } catch (e) { toastErreur(`Message de l’autre app illisible : ${e.message}`); }
    await afficher({ nom: 'reglages', params: [] }); return;
  }
  if (!etat.parametres.onboarding?.termine && route.nom !== 'onboarding' && !(route.nom === 'reglages' && route.params[0] === 'import')) { aller('onboarding', { remplacer: true }); return; }
  const chargeur = PAGES[route.nom] || PAGES.accueil;
  try {
    const mod = await chargeur();
    pageCourante = mod; paramsCourants = route.params;
    document.documentElement.dataset.page = route.nom;
    for (const b of document.querySelectorAll('.onglet[data-onglet]')) {
      const actif = b.dataset.onglet === (ONGLET[route.nom] || '');
      b.classList.toggle('actif', actif);
      if (actif) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    document.title = `${mod.titre || 'Budget'} · Budget`;
    mod.rendre(vue, route.params);
    vue.scrollTop = 0; window.scrollTo(0, 0);
    vue.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    vue.replaceChildren(h('div', { class: 'etat-vide' }, h('h2', {}, 'Cet écran n’a pas pu s’afficher'), h('p', {}, e.message), h('button', { class: 'btn btn-principal', type: 'button', onclick: () => location.reload() }, 'Recharger')));
  }
}

/** Redessine la page visible après un changement de données (sans perdre la saisie en cours d'une feuille). */
function redessiner() {
  if (!pageCourante) return;
  const actif = document.activeElement;
  if (actif && actif.closest('#vue') && /INPUT|TEXTAREA|SELECT/.test(actif.tagName)) return; // l'utilisateur tape dans la page
  pageCourante.rendre(document.getElementById('vue'), paramsCourants);
}

async function ouvrirPlus(vue) {
  const { ouvrirSaisie } = await import('./pages/saisie.js');
  ouvrirSaisie(vue);
}

/** Clavier iOS : la barre d'onglets se masque et le champ actif reste visible. */
function gererClavier() {
  const vv = window.visualViewport;
  if (!vv) return;
  const maj = () => {
    const ouvert = vv.height < window.innerHeight * 0.78;
    document.documentElement.classList.toggle('clavier-ouvert', ouvert);
    document.documentElement.style.setProperty('--hauteur-visible', `${vv.height}px`);
    if (ouvert) { const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) setTimeout(() => a.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60); }
  };
  vv.addEventListener('resize', maj);
  document.addEventListener('focusin', (e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) setTimeout(maj, 250); });
}

/** Service worker : enregistrement relatif, bandeau « Nouvelle version », vérification au retour au premier plan. */
let majDemandee = false;
async function installerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const proposer = (w) => {
      const zone = document.getElementById('maj');
      zone.replaceChildren(h('div', { class: 'bandeau-maj', role: 'status' }, h('span', {}, 'Nouvelle version disponible.'), h('button', { class: 'btn btn-principal btn-petit', type: 'button', onclick: () => { majDemandee = true; w.postMessage({ type: 'SKIP_WAITING' }); } }, 'Mettre à jour')));
    };
    if (reg.waiting && navigator.serviceWorker.controller) proposer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) proposer(w); });
    });
    // Rechargement UNIQUEMENT après « Mettre à jour » (pas lors de la toute première installation : clients.claim)
    let recharge = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!majDemandee || recharge) return; recharge = true; location.reload(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  } catch (e) { console.warn('Service worker non enregistré', e?.message); }
}

/** Aide à l'installation (Safari iOS, pas encore sur l'écran d'accueil). */
function aideInstallation() {
  if (navigator.standalone !== false) return;
  try { if (sessionStorage.getItem('aide-install-vue')) return; } catch { /* stockage indisponible : on affiche */ }
  const fermer = () => { ecran.remove(); try { sessionStorage.setItem('aide-install-vue', '1'); } catch { /* ignoré */ } };
  const ecran = h('div', { class: 'ecran-installation', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'install-t' },
    h('div', { class: 'installation-carte' },
      h('h2', { id: 'install-t' }, 'Installe Budget sur ton iPhone'),
      illustrationPartage(),
      h('ol', { class: 'installation-etapes' }, h('li', {}, 'Touche ', h('strong', {}, 'Partager'), ' ', icone('partage'), ' en bas de Safari.'), h('li', {}, 'Choisis ', h('strong', {}, 'Sur l’écran d’accueil'), '.'), h('li', {}, 'Ouvre Budget depuis l’icône : plein écran, hors ligne, données conservées.')),
      h('button', { class: 'btn btn-secondaire', type: 'button', onclick: fermer }, 'Continuer dans Safari')));
  document.body.append(ecran);
  ecran.querySelector('button').focus();
}

function illustrationPartage() {
  const svg = `<svg viewBox="0 0 240 150" role="img" aria-label="Barre de Safari avec le bouton Partager, puis le menu Sur l'écran d'accueil"><rect x="10" y="10" width="220" height="130" rx="16" fill="var(--surface-2)"/><rect x="10" y="100" width="220" height="40" rx="0" fill="var(--surface-3)"/><g stroke="var(--accent)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M120 108v18M112 114l8-8 8 8"/><path d="M110 122v8h20v-8"/></g><circle cx="120" cy="118" r="17" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 3"/><rect x="40" y="28" width="160" height="56" rx="10" fill="var(--surface)"/><g fill="var(--texte)"><rect x="56" y="44" width="22" height="22" rx="5" fill="none" stroke="var(--texte)" stroke-width="2"/><path d="M67 49v12M61 55h12" stroke="var(--texte)" stroke-width="2"/></g><text x="88" y="60" font-size="12" fill="var(--texte)" font-family="-apple-system, system-ui">Sur l’écran d’accueil</text></svg>`;
  const d = document.createElement('div');
  d.className = 'installation-illustration';
  d.innerHTML = svg; // contenu statique, sans donnée utilisateur
  return d;
}

async function demarrer() {
  document.body.insertAdjacentHTML('afterbegin', spriteSVG());
  try {
    await charger();
  } catch (e) {
    document.getElementById('vue').replaceChildren(h('div', { class: 'etat-vide' }, h('h2', {}, 'Stockage indisponible'), h('p', {}, `${e.message} En navigation privée, Safari bloque le stockage : ouvre l’app normalement.`)));
    return;
  }
  appliquerTheme(etat.parametres.theme);
  definirMasquage(etat.parametres.masquageMontants);
  definirNomsCategories(etat.parametres.nomsCategories || {});
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => appliquerTheme(etat.parametres.theme));
  await verrouiller();
  installerConfidentialite(() => { if (!document.hidden) redessiner(); });
  for (const [nom, ch] of Object.entries(PAGES)) definirRoute(nom, ch);
  quandNavigation((r) => afficher(r));
  demarrerRouteur();
  surChangement((raison) => { if (raison === 'parametres') definirMasquage(etat.parametres.masquageMontants); redessiner(); });
  document.getElementById('bouton-plus').addEventListener('click', () => ouvrirPlus());
  gererClavier();
  await rendreRoute();
  aideInstallation();
  installerSW();
  document.documentElement.dataset.version = versionApp;
  window.addEventListener('online', () => { if (etat.fileAttenteIA.length) toast(`${etat.fileAttenteIA.length} saisie(s) en attente : Réglages → Gemini → Analyser maintenant.`); });
  window.addEventListener('error', (e) => toastErreur(`Erreur inattendue : ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => toastErreur(`Erreur inattendue : ${e.reason?.message || e.reason}`));
}

demarrer();
export { routeActuelle };
