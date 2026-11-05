// router.js — navigation par fragment d'URL (#accueil, #depenses, #epargne/plan…), chemins relatifs uniquement.

const routes = new Map();
let courante = null;
let surNavigation = () => {};

export function definirRoute(nom, chargeur) { routes.set(nom, chargeur); }
export function quandNavigation(fn) { surNavigation = fn; }

export function routeActuelle() {
  const brut = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (brut.startsWith('bridge=')) return { nom: 'bridge', params: [brut.slice(7)] };
  const [nom, ...params] = brut.split('/');
  return { nom: nom || 'accueil', params };
}

export function aller(chemin, { remplacer = false } = {}) {
  const h = '#' + chemin;
  if (location.hash === h) { rendre(); return; }
  if (remplacer) { history.replaceState(null, '', h); rendre(); }
  else location.hash = h; // déclenche « hashchange » → rendre()
}

export async function rendre() {
  const r = routeActuelle();
  const chargeur = routes.get(r.nom) || routes.get('accueil');
  courante = r;
  await surNavigation(r, chargeur);
}

export function demarrerRouteur() {
  window.addEventListener('hashchange', rendre);
}

export function routeCourante() { return courante; }
