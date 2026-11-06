// majapp.js — mises à jour de l'app (fichiers du service worker), jamais des données.
// GitHub Pages garde les fichiers jusqu'à 10 minutes dans son cache (CDN) : une adresse déjà demandée peut renvoyer
// l'ANCIENNE version juste après une publication. Pour l'éviter, chaque version a ses propres adresses :
//  - la version en ligne est lue sur « sw.js?t=<heure> » (adresse toujours nouvelle, jamais en cache) ;
//  - le service worker est enregistré sous « sw.js?v=<version> » (nouvelle adresse = installation immédiate) ;
//  - il télécharge chaque fichier sous « fichier?v=<version> » (voir sw.js).

import { versionApp } from './version.js';

const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Version publiée en ligne (ou null hors ligne). */
export async function versionEnLigne() {
  try {
    const r = await fetch(`./sw.js?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.text()).match(/const VERSION = '([^']+)'/)?.[1] || null;
  } catch { return null; }
}

/**
 * Installe la version donnée et attend qu'elle soit prête (en attente d'activation, ou active).
 * @param {{ forcer?: boolean, surEtape?: (texte) => void, delaiMs?: number }} o
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function installerVersion(version, { forcer = false, surEtape, delaiMs = 60000 } = {}) {
  if (!('serviceWorker' in navigator)) return null;
  const url = `./sw.js?v=${encodeURIComponent(version)}${forcer ? `&f=${Date.now()}` : ''}`;
  const reg = await navigator.serviceWorker.register(url, { scope: './' });
  const debut = Date.now();
  // L'installation télécharge tous les fichiers de la nouvelle version
  while (reg.installing && Date.now() - debut < delaiMs) { surEtape?.('Téléchargement de la nouvelle version…'); await attendre(250); }
  return reg;
}

/** Active la version en attente et recharge la page (les données ne bougent pas). */
export async function appliquer(reg) {
  const w = reg?.waiting;
  if (w) {
    const change = new Promise((ok) => navigator.serviceWorker.addEventListener('controllerchange', ok, { once: true }));
    w.postMessage({ type: 'SKIP_WAITING' });
    await Promise.race([change, attendre(4000)]);
  }
  location.reload();
}

/** Vérifie en ligne et installe en arrière-plan si une version plus récente existe. @returns la version trouvée ou null */
export async function verifierEtInstaller() {
  const v = await versionEnLigne();
  if (!v || v === versionApp) return null;
  await installerVersion(v);
  return v;
}

export { versionApp };
