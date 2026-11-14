// molette.js (v200) — choisir un montant sans clavier : deux molettes (les euros, et les centimes par 0,10 €).
// Glisser vers le haut augmente, vers le bas diminue (1 cran ≈ 16 px), boutons − et + (appui long = répétition qui accélère),
// flèches du clavier, et pour VoiceOver un vrai « spinbutton » qui dit le montant (« 7 euros 30 »).
// Chaque cran fait « pulser » le chiffre (sauf si les animations sont réduites) ; un petit « tic » sonore est possible,
// éteint par défaut (réglage gardé sur l'appareil seulement, localStorage « budget-v200-son »).
// Le montant est toujours en centimes entiers.

import { h, reduitMouvement, vibrer } from '../../ui/dom.js';

export const PIXELS_PAR_CRAN = 16;
const CLE_SON = 'budget-v200-son';

// ------------------------------------------------------------------ Son (éteint par défaut)
export function sonMolette() { try { return localStorage.getItem(CLE_SON) === '1'; } catch { return false; } }
export function definirSonMolette(actif) { try { if (actif) localStorage.setItem(CLE_SON, '1'); else localStorage.removeItem(CLE_SON); } catch { /* stockage bloqué : reste éteint */ } }

let audio = null;
function tic() {
  if (!sonMolette()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio = audio || new AC();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator(); const g = audio.createGain();
    osc.type = 'triangle'; osc.frequency.setValueAtTime(1900, t);
    g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(g).connect(audio.destination);
    osc.start(t); osc.stop(t + 0.035);
  } catch { /* pas de son : sans effet */ }
}

// ------------------------------------------------------------------ Textes
/** « 7 euros 30 », « 1 euro », « 0 euro 50 » (pour VoiceOver). */
export function montantParle(centimes) {
  const e = Math.floor(centimes / 100); const c = centimes % 100;
  return `${e} euro${e > 1 ? 's' : ''}${c ? ` ${String(c).padStart(2, '0')}` : ''}`;
}

/** Appui long : une fois tout de suite, puis de plus en plus vite. fn(n) reçoit le numéro de la répétition. */
function repetition(bouton, fn) {
  let minuteur = null; let n = 0; let parPointeur = false;
  const stop = () => { clearTimeout(minuteur); minuteur = null; };
  const suite = () => { n += 1; fn(n); minuteur = setTimeout(suite, n < 6 ? 110 : n < 20 ? 70 : 45); };
  bouton.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    parPointeur = true; n = 0; fn(0);
    try { bouton.setPointerCapture(e.pointerId); } catch { /* sans capture : pointerup sur le bouton suffit */ }
    stop(); minuteur = setTimeout(suite, 380);
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) bouton.addEventListener(t, stop);
  bouton.addEventListener('contextmenu', (e) => e.preventDefault());
  // Clavier, VoiceOver : un « clic » sans appui = un cran
  bouton.addEventListener('click', () => { if (parPointeur) { parPointeur = false; return; } fn(0); });
}

/**
 * Une molette : fenêtre qui montre le chiffre d'avant, le chiffre, le chiffre d'après.
 * @param o.nom 'euros' | 'centimes'
 * @param o.lire () => chiffre affiché ; o.voisins (x) => [avant, après] (textes)
 * @param o.pas (n) => nombre de crans réellement faits (n peut être négatif)
 */
function roue({ nom, libelle, lire, format, voisins, pas, bornes, aide }) {
  const avant = h('span', { class: 'v2-roue-voisin' }); const actuel = h('span', { class: 'v2-roue-actuel' }); const apres = h('span', { class: 'v2-roue-voisin' });
  const tambour = h('div', { class: 'v2-roue-tambour', 'aria-hidden': 'true' }, avant, actuel, apres);
  const fenetre = h('div', { class: 'v2-roue-fenetre', role: 'spinbutton', tabindex: '0', 'data-glisse': '', 'aria-label': libelle, 'aria-describedby': aide || null }, tambour);
  const unite = nom === 'euros' ? 'euro' : '10 centimes';
  const plus = h('button', { type: 'button', class: 'v2-roue-btn plus', 'aria-label': `Ajouter ${nom === 'euros' ? '1 euro' : unite}` }, '+');
  const moins = h('button', { type: 'button', class: 'v2-roue-btn moins', 'aria-label': `Retirer ${nom === 'euros' ? '1 euro' : unite}` }, '−');
  const el = h('div', { class: `v2-roue v2-roue-${nom}` }, plus, fenetre, moins);

  const pulser = () => {
    if (reduitMouvement()) return;
    actuel.classList.remove('pulse'); void actuel.offsetWidth; actuel.classList.add('pulse');
  };
  const crans = (n, o = {}) => { if (!n) return 0; const fait = pas(n, o); if (fait) { pulser(); tic(); vibrer(4); } return fait; };

  // Glisser (doigt, souris, stylet) : capture du pointeur, la page ne défile pas (touch-action: none en CSS)
  let y0 = null; let faits = 0; let id = null;
  const hauteur = () => actuel.getBoundingClientRect().height || 40;
  fenetre.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    y0 = e.clientY; faits = 0; id = e.pointerId;
    try { fenetre.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    fenetre.classList.add('glisse');
    tambour.style.transition = 'none';
    e.preventDefault();
  });
  fenetre.addEventListener('pointermove', (e) => {
    if (y0 === null || e.pointerId !== id) return;
    const d = y0 - e.clientY; // vers le haut = positif = on augmente
    const voulu = Math.trunc(d / PIXELS_PAR_CRAN);
    if (voulu !== faits) {
      const n = voulu - faits;
      const fait = crans(n);
      faits += fait;
      y0 -= (n - fait) * PIXELS_PAR_CRAN; // à une borne : pas de zone morte quand on repart dans l'autre sens
    }
    const reste = (y0 - e.clientY) - faits * PIXELS_PAR_CRAN; // de -16 à 16 px : le tambour roule entre deux crans
    tambour.style.transform = `translateY(${(-(reste / PIXELS_PAR_CRAN) * hauteur() * 0.55).toFixed(1)}px)`;
  });
  const fin = (e) => {
    if (y0 === null || (e && e.pointerId !== id)) return;
    y0 = null; id = null;
    fenetre.classList.remove('glisse');
    tambour.style.transition = ''; tambour.style.transform = '';
  };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) fenetre.addEventListener(t, fin);

  // Clavier
  fenetre.addEventListener('keydown', (e) => {
    const n = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
    if (n) { e.preventDefault(); crans(n); return; }
    if (e.key === 'Home') { e.preventDefault(); crans(-lire()); }
  });

  // Appui long sur les euros : après ~2 s, on avance de dizaine en dizaine (un loyer se règle en 3 s)
  repetition(plus, (k) => crans(1, { dizaine: nom === 'euros' && k > 24 }));
  repetition(moins, (k) => crans(-1, { dizaine: nom === 'euros' && k > 24 }));

  const maj = (texteParle) => {
    const x = lire();
    const [a, b] = voisins(x);
    avant.textContent = a; actuel.textContent = format(x); apres.textContent = b;
    fenetre.setAttribute('aria-valuenow', String(x));
    fenetre.setAttribute('aria-valuemin', String(bornes[0]));
    fenetre.setAttribute('aria-valuemax', String(bornes[1]));
    fenetre.setAttribute('aria-valuetext', texteParle);
    // À zéro, « − » est grisé sans être désactivé : un bouton désactivé ne recevrait plus la fin de l'appui long
    const bas = !!bornes.bas?.(); moins.classList.toggle('borne', bas); moins.setAttribute('aria-disabled', String(bas));
  };
  return { el, fenetre, maj };
}

/**
 * Les deux molettes côte à côte : « 7 , 30 € ».
 * @param {{ valeur?: number, max?: number, onChange?: (centimes) => void, aide?: string }} o
 * @returns {{ element, valeur: () => number, definir: (centimes) => void }}
 */
export function molettes({ valeur = 0, max = 999999, onChange = () => {}, aide = null } = {}) {
  let total = Math.max(0, Math.min(max, Math.round(valeur || 0)));
  const maxEuros = Math.floor(max / 100);
  const changer = (nouveau) => {
    const v = Math.max(0, Math.min(max, nouveau));
    if (v === total) return false;
    total = v; dessiner(); onChange(total);
    return true;
  };
  const euros = roue({
    nom: 'euros', libelle: 'Euros', aide,
    lire: () => Math.floor(total / 100), format: (x) => String(x),
    voisins: (x) => [x > 0 ? String(x - 1) : '', x < maxEuros ? String(x + 1) : ''],
    bornes: Object.assign([0, maxEuros], { bas: () => total < 100 }),
    pas: (n, { dizaine = false } = {}) => {
      const e = Math.floor(total / 100); const c = total % 100;
      // Appui long rapide : de dizaine en dizaine, calé sur la dizaine (7 → 10 → 20…)
      const cible = !dizaine ? e + n : n > 0 ? (Math.floor(e / 10) + 1) * 10 : Math.ceil(e / 10) * 10 - 10;
      const borne = Math.max(0, Math.min(maxEuros, cible));
      changer(Math.min(max, borne * 100 + c));
      const fait = Math.floor(total / 100) - e;
      return dizaine ? Math.sign(fait) : fait;
    },
  });
  const centimes = roue({
    nom: 'centimes', libelle: 'Centimes', aide,
    lire: () => total % 100, format: (x) => String(x).padStart(2, '0'),
    voisins: (x) => { const d = x - (x % 10); return [String((d + 90) % 100).padStart(2, '0'), String((d + 10) % 100).padStart(2, '0')]; },
    bornes: Object.assign([0, 90], { bas: () => total < 10 }),
    // Les centimes débordent sur les euros : 7,90 € + 0,10 € = 8,00 €
    pas: (n) => { const avant = total; changer(Math.floor(total / 10) * 10 + n * 10); return Math.round((total - avant) / 10); },
  });
  const element = h('div', { class: 'v2-molettes' },
    euros.el, h('span', { class: 'v2-virgule', 'aria-hidden': 'true' }, ','), centimes.el, h('span', { class: 'v2-euro', 'aria-hidden': 'true' }, '€'));
  function dessiner() { const t = montantParle(total); euros.maj(t); centimes.maj(t); }
  dessiner();
  return { element, valeur: () => total, definir: (c) => { changer(Math.round(c || 0)); dessiner(); } };
}
