// securite.js — code PIN local (PBKDF2-SHA-256 via WebCrypto), écran de verrouillage, écran de confidentialité.
// HONNÊTETÉ : le PIN est un verrou d'écran. Les données IndexedDB ne sont PAS chiffrées.

import { etat, majParametres } from './store.js';
import { h, icone } from './ui/dom.js';

export const PIN_EST_UN_VERROU = 'Verrou d’écran uniquement : le code empêche l’affichage de l’app, il ne chiffre pas les données stockées sur l’iPhone.';
const ITERATIONS = 210000;

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function empreintePin(pin, selB64, iterations = ITERATIONS) {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: deb64(selB64), iterations }, cle, 256);
  return b64(bits);
}

export async function definirPin(pin) {
  const sel = b64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await empreintePin(pin, sel);
  await majParametres({ pinHash: hash, pinSel: sel, pinIterations: ITERATIONS });
}

export async function supprimerPin() { await majParametres({ pinHash: null, pinSel: null, pinIterations: null }); }

/** Comparaison en temps constant. */
function egal(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

export async function verifierPin(pin) {
  const p = etat.parametres;
  if (!p.pinHash) return true;
  return egal(await empreintePin(pin, p.pinSel, p.pinIterations || ITERATIONS), p.pinHash);
}

let verrouOuvert = null;
/** Affiche l'écran de verrouillage ; la promesse se résout quand le bon code est saisi. */
export function verrouiller() {
  if (!etat.parametres.pinHash) return Promise.resolve();
  if (verrouOuvert) return verrouOuvert;
  verrouOuvert = new Promise((resolve) => {
    let saisie = ''; let echecs = 0; let bloqueJusqua = 0;
    const points = h('div', { class: 'pin-points', 'aria-hidden': 'true' });
    const message = h('p', { class: 'pin-message', role: 'status', 'aria-live': 'polite' }, 'Saisis ton code');
    const dessiner = () => points.replaceChildren(...Array.from({ length: Math.max(4, saisie.length) }, (_, i) => h('span', { class: `pin-point ${i < saisie.length ? 'plein' : ''}` })));
    const valider = async () => {
      if (Date.now() < bloqueJusqua) { message.textContent = 'Trop d’essais : patiente quelques secondes.'; return; }
      if (await verifierPin(saisie)) { ecran.remove(); document.getElementById('app')?.removeAttribute('aria-hidden'); verrouOuvert = null; resolve(); return; }
      echecs++; saisie = ''; dessiner();
      if (echecs >= 5) { bloqueJusqua = Date.now() + 30000; echecs = 0; message.textContent = 'Code incorrect. Nouvel essai dans 30 s.'; }
      else message.textContent = 'Code incorrect.';
      ecran.querySelector('.pin-points').classList.add('secoue'); setTimeout(() => ecran.querySelector('.pin-points')?.classList.remove('secoue'), 400);
    };
    const touche = (t) => h('button', { type: 'button', class: 'pin-touche', 'aria-label': t === '⌫' ? 'Effacer' : t, onclick: () => {
      if (t === '⌫') saisie = saisie.slice(0, -1);
      else if (t === 'OK') { valider(); return; }
      else if (saisie.length < 8) saisie += t;
      dessiner();
      if (saisie.length >= 4 && saisie.length === (etat.parametres.pinLongueur || 0)) valider();
    } }, t);
    const ecran = h('div', { class: 'ecran-pin', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Déverrouiller Budget' },
      h('div', { class: 'pin-logo' }, icone('cadenas')), h('h1', {}, 'Budget'), message, points,
      h('div', { class: 'pin-clavier' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map(touche)),
      h('p', { class: 'petit' }, PIN_EST_UN_VERROU));
    document.getElementById('app')?.setAttribute('aria-hidden', 'true');
    document.body.append(ecran);
    dessiner();
    ecran.querySelector('.pin-touche')?.focus();
    ecran.addEventListener('keydown', (e) => { if (/^\d$/.test(e.key) && saisie.length < 8) { saisie += e.key; dessiner(); } else if (e.key === 'Backspace') { saisie = saisie.slice(0, -1); dessiner(); } else if (e.key === 'Enter') valider(); });
  });
  return verrouOuvert;
}

/** Écran de confidentialité au passage en arrière-plan ; verrouillage au retour après 60 s. */
export function installerConfidentialite(auRetour) {
  let cacheLe = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { cacheLe = Date.now(); document.documentElement.classList.add('ecran-prive'); return; }
    document.documentElement.classList.remove('ecran-prive');
    if (etat.parametres.pinHash && Date.now() - cacheLe > 60000) await verrouiller();
    auRetour?.();
  });
  window.addEventListener('pagehide', () => document.documentElement.classList.add('ecran-prive'));
  window.addEventListener('pageshow', () => document.documentElement.classList.remove('ecran-prive'));
}
