// graphes.js (v100) — instruments et graphiques du Cockpit, en SVG fait main : cadran principal, anneaux,
// courbes avec survol (réticule + bulle), étincelles. Couleurs par rôle (classes CSS, voir css/cockpit.css) ;
// chaque graphique a une légende dès 2 séries, des valeurs au toucher, et un tableau de chiffres dépliable.

import { h } from '../../ui/dom.js';

const NS = 'http://www.w3.org/2000/svg';
let compteur = 0;

/** Élément SVG. */
export function s(tag, attrs = {}, ...enfants) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
  for (const e of enfants.flat()) if (e !== null && e !== undefined && e !== false) el.append(e.nodeType ? e : document.createTextNode(String(e)));
  return el;
}

const polaire = (cx, cy, r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
const arc = (cx, cy, r, de, a) => {
  const [x1, y1] = polaire(cx, cy, r, de); const [x2, y2] = polaire(cx, cy, r, a);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${a - de > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

/**
 * Cadran principal : arc de 270° gradué, comme un compteur. part = ce qui reste (0..1) ; au-delà de la zone, l'aiguille bute.
 * @param {{ part: number, etat?: 'ok'|'attention'|'critique', description: string }} o
 */
export function cadran({ part, etat = 'ok', description }) {
  const id = `cadran-${compteur += 1}`;
  const p = Math.max(0, Math.min(1, part));
  const DEBUT = -135; const FIN = 135; const cx = 150; const cy = 150; const R = 122;
  const angle = DEBUT + (FIN - DEBUT) * p;
  const graduations = [];
  for (let i = 0; i <= 40; i += 1) {
    const deg = DEBUT + ((FIN - DEBUT) * i) / 40;
    const grand = i % 10 === 0; const moyen = i % 5 === 0;
    const [x1, y1] = polaire(cx, cy, R - 20, deg); const [x2, y2] = polaire(cx, cy, R - (grand ? 36 : moyen ? 31 : 27), deg);
    graduations.push(s('line', { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), class: `cadran-grad ${grand ? 'grand' : moyen ? 'moyen' : ''} ${deg <= angle ? 'allume' : ''}` }));
  }
  const [ax, ay] = polaire(cx, cy, R, angle);
  return s('svg', { viewBox: '0 0 300 262', class: `cadran cadran-${etat}`, role: 'img', 'aria-label': description },
    s('defs', {}, s('linearGradient', { id, x1: '0', y1: '1', x2: '1', y2: '0' }, s('stop', { offset: '0', class: 'cadran-stop-1' }), s('stop', { offset: '1', class: 'cadran-stop-2' }))),
    s('path', { d: arc(cx, cy, R, DEBUT, FIN), class: 'cadran-piste' }),
    p > 0.004 ? s('path', { d: arc(cx, cy, R, DEBUT, angle), class: 'cadran-arc', stroke: `url(#${id})` }) : null,
    ...graduations,
    s('circle', { cx: ax.toFixed(1), cy: ay.toFixed(1), r: 9, class: 'cadran-curseur' }),
    s('circle', { cx: ax.toFixed(1), cy: ay.toFixed(1), r: 3.5, class: 'cadran-curseur-coeur' }));
}

/** Petit anneau de progression (0..1). */
export function anneau({ part, etat = 'ok', taille = 56, description = '' }) {
  const p = Math.max(0, Math.min(1, part));
  const r = 24; const c = 2 * Math.PI * r;
  return s('svg', { viewBox: '0 0 60 60', width: taille, height: taille, class: `anneau anneau-${etat}`, role: 'img', 'aria-label': description },
    s('circle', { cx: 30, cy: 30, r, class: 'anneau-piste' }),
    s('circle', { cx: 30, cy: 30, r, class: 'anneau-arc', 'stroke-dasharray': `${(c * p).toFixed(1)} ${c.toFixed(1)}`, transform: 'rotate(-90 30 30)' }));
}

/** Étincelle : la tendance d'une série, sans axes. */
export function etincelle(valeurs, { largeur = 120, hauteur = 34, classe = 'serie-1', description = '' } = {}) {
  if (!valeurs.length) return s('svg', { viewBox: `0 0 ${largeur} ${hauteur}`, class: 'etincelle' });
  const min = Math.min(...valeurs); const max = Math.max(...valeurs); const ecart = max - min || 1;
  const x = (i) => 3 + (i * (largeur - 6)) / Math.max(1, valeurs.length - 1);
  const y = (v) => hauteur - 4 - ((v - min) / ecart) * (hauteur - 8);
  const d = valeurs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const n = valeurs.length - 1;
  return s('svg', { viewBox: `0 0 ${largeur} ${hauteur}`, class: `etincelle ${classe}`, role: 'img', 'aria-label': description, preserveAspectRatio: 'none' },
    s('path', { d: `${d} L${x(n).toFixed(1)} ${hauteur} L${x(0).toFixed(1)} ${hauteur} Z`, class: 'etincelle-aire' }),
    s('path', { d, class: 'etincelle-trait' }),
    s('circle', { cx: x(n).toFixed(1), cy: y(valeurs[n]).toFixed(1), r: 3, class: 'etincelle-point' }));
}

/** Paliers « ronds » pour l'axe vertical. */
function echelle(min, max, pas = 4) {
  if (max <= min) max = min + 1;
  const brut = (max - min) / pas;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pasRond = [1, 2, 2.5, 5, 10].map((m) => m * puissance).find((m) => m >= brut) || brut;
  const bas = Math.floor(min / pasRond) * pasRond; const haut = Math.ceil(max / pasRond) * pasRond;
  const marques = [];
  for (let v = bas; v <= haut + pasRond / 2; v += pasRond) marques.push(v);
  return { bas, haut, marques };
}

/**
 * Courbes : une ou plusieurs séries sur le même axe (même unité), avec réticule et bulle au toucher.
 * @param {{ series: Array<{ nom, classe?: string, valeurs: number[] }>, etiquettes: string[], format: (v: number) => string,
 *   formatAxe?: (v: number) => string, titre: string, hauteur?: number, depuisZero?: boolean, reperes?: Array<{ index, texte }> }} o
 */
export function courbes({ series, etiquettes, format, formatAxe = format, titre, hauteur = 190, depuisZero = true, reperes = [] }) {
  const L = 340; const H = hauteur; const m = { g: 44, d: 14, h: 12, b: 24 };
  const toutes = series.flatMap((x) => x.valeurs);
  const ech = echelle(depuisZero ? Math.min(0, ...toutes) : Math.min(...toutes), Math.max(...toutes, 1));
  const n = etiquettes.length;
  const x = (i) => m.g + (i * (L - m.g - m.d)) / Math.max(1, n - 1);
  const y = (v) => m.h + (1 - (v - ech.bas) / (ech.haut - ech.bas)) * (H - m.h - m.b);
  const svg = s('svg', { viewBox: `0 0 ${L} ${H}`, class: 'graphe-svg', role: 'img', 'aria-label': titre });
  // Grille et axe : discrets
  for (const v of ech.marques) {
    svg.append(s('line', { x1: m.g, x2: L - m.d, y1: y(v).toFixed(1), y2: y(v).toFixed(1), class: `graphe-grille ${v === 0 ? 'zero' : ''}` }),
      s('text', { x: m.g - 6, y: (y(v) + 3.5).toFixed(1), class: 'graphe-axe', 'text-anchor': 'end' }, formatAxe(v)));
  }
  // Étiquettes de l'axe : la première, la dernière, puis celles du milieu qui ne touchent aucune déjà posée
  const pasX = Math.max(1, Math.ceil(n / 5));
  const largeur = (e) => String(e).length * 5.4 + 10;
  const posees = [];
  const place = (i) => {
    const ancre = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    const w = largeur(etiquettes[i]);
    const g = ancre === 'start' ? x(i) : ancre === 'end' ? x(i) - w : x(i) - w / 2;
    if (posees.some((q) => g < q.d && g + w > q.g)) return;
    posees.push({ g, d: g + w });
    svg.append(s('text', { x: x(i).toFixed(1), y: H - 6, class: 'graphe-axe', 'text-anchor': ancre }, etiquettes[i]));
  };
  place(0); if (n > 1) place(n - 1);
  for (let i = pasX; i < n - 1; i += pasX) place(i);
  for (const r of reperes) {
    if (r.index < 0 || r.index >= n) continue;
    svg.append(s('line', { x1: x(r.index).toFixed(1), x2: x(r.index).toFixed(1), y1: m.h, y2: H - m.b, class: 'graphe-repere' }),
      s('text', { x: (x(r.index) + (r.index > n * 0.7 ? -4 : 4)).toFixed(1), y: m.h + 9, class: 'graphe-repere-texte', 'text-anchor': r.index > n * 0.7 ? 'end' : 'start' }, r.texte));
  }
  series.forEach((serie, k) => {
    const classe = serie.classe || `serie-${k + 1}`;
    const d = serie.valeurs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    if (series.length === 1) svg.append(s('path', { d: `${d} L${x(n - 1).toFixed(1)} ${y(ech.bas).toFixed(1)} L${x(0).toFixed(1)} ${y(ech.bas).toFixed(1)} Z`, class: `graphe-aire ${classe}` }));
    svg.append(s('path', { d, class: `graphe-trait ${classe}` }),
      s('circle', { cx: x(n - 1).toFixed(1), cy: y(serie.valeurs[n - 1]).toFixed(1), r: 4, class: `graphe-point ${classe}` }));
  });
  // Survol : réticule + points + bulle
  const reticule = s('line', { y1: m.h, y2: H - m.b, class: 'graphe-reticule', visibility: 'hidden' });
  const points = series.map((serie, k) => s('circle', { r: 5, class: `graphe-point survol ${serie.classe || `serie-${k + 1}`}`, visibility: 'hidden' }));
  svg.append(reticule, ...points);
  const bulle = h('div', { class: 'graphe-bulle', hidden: true });
  const montrer = (clientX) => {
    const b = svg.getBoundingClientRect();
    const px = ((clientX - b.left) / b.width) * L;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.g) / (L - m.g - m.d)) * (n - 1))));
    reticule.setAttribute('x1', x(i)); reticule.setAttribute('x2', x(i)); reticule.setAttribute('visibility', 'visible');
    series.forEach((serie, k) => { points[k].setAttribute('cx', x(i)); points[k].setAttribute('cy', y(serie.valeurs[i])); points[k].setAttribute('visibility', 'visible'); });
    bulle.replaceChildren(h('strong', {}, etiquettes[i]), ...series.map((serie, k) => h('span', { class: 'graphe-bulle-ligne' }, h('i', { class: `pastille-serie ${serie.classe || `serie-${k + 1}`}` }), `${serie.nom} `, h('b', {}, format(serie.valeurs[i])))));
    bulle.hidden = false;
    bulle.style.left = `${Math.max(0, Math.min(72, (x(i) / L) * 100 - 14))}%`;
  };
  const cacher = () => { reticule.setAttribute('visibility', 'hidden'); for (const p of points) p.setAttribute('visibility', 'hidden'); bulle.hidden = true; };
  svg.addEventListener('pointerdown', (e) => montrer(e.clientX));
  svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons || e.pressure > 0) montrer(e.clientX); });
  svg.addEventListener('pointerleave', cacher);
  // La valeur finale n'est écrite dans la légende que si elle distingue les séries
  const finDifferente = new Set(series.map((serie) => serie.valeurs[n - 1])).size > 1;
  const legende = series.length > 1 ? h('div', { class: 'graphe-legende' }, series.map((serie, k) => h('span', {}, h('i', { class: `pastille-serie ${serie.classe || `serie-${k + 1}`}` }), serie.nom, finDifferente ? ' ' : null, finDifferente ? h('b', {}, format(serie.valeurs[n - 1])) : null))) : null;
  const table = h('details', { class: 'graphe-table' }, h('summary', {}, 'Voir les chiffres'),
    h('div', { class: 'defilement-horizontal' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, ''), ...series.map((serie) => h('th', { scope: 'col' }, serie.nom)))),
      h('tbody', {}, etiquettes.map((e, i) => h('tr', {}, h('th', { scope: 'row' }, e), ...series.map((serie) => h('td', {}, format(serie.valeurs[i])))))))));
  return h('figure', { class: 'graphe graphique' }, h('figcaption', { class: 'graphe-titre' }, titre), legende, h('div', { class: 'graphe-zone' }, svg, bulle), table);
}

/** Barre de progression avec un repère (« où tu devrais en être aujourd'hui »). */
export function barreRepere({ part, repere = null, etat = 'ok', description = '' }) {
  return h('div', { class: `barre-repere barre-${etat}`, role: 'img', 'aria-label': description },
    h('span', { class: 'barre-repere-plein', style: { width: `${Math.max(0, Math.min(100, part * 100)).toFixed(1)}%` } }),
    repere !== null ? h('span', { class: 'barre-repere-trait', style: { left: `${Math.max(0, Math.min(100, repere * 100)).toFixed(1)}%` } }) : null);
}

// ---------- Schémas des fiches d'explication ----------

/**
 * Cascade : comment on arrive à un montant, étape par étape. Chaque étape part du niveau laissé par la précédente.
 * @param {{ etapes: Array<{ nom: string, centimes: number, type: 'total'|'plus'|'moins', note?: string }>, format: (c: number) => string, description: string }} o
 */
export function cascade({ etapes, format, description }) {
  let niveau = 0;
  const pas = etapes.map((e) => {
    let de; let a;
    if (e.type === 'total') { de = 0; a = e.centimes; } else if (e.type === 'plus') { de = niveau; a = niveau + e.centimes; } else { a = niveau; de = niveau - e.centimes; }
    niveau = e.type === 'moins' ? de : a;
    return { ...e, de: Math.max(0, Math.min(de, a)), a: Math.max(0, Math.max(de, a)) };
  });
  const max = Math.max(1, ...pas.map((p) => p.a));
  return h('ol', { class: 'cascade', 'aria-label': description }, pas.map((p) => h('li', { class: `cascade-etape cascade-${p.type}` },
    h('span', { class: 'cascade-nom' }, p.type === 'moins' ? '− ' : p.type === 'plus' ? '+ ' : '', p.nom, p.note ? h('small', {}, p.note) : null),
    h('span', { class: 'cascade-valeur' }, format(p.centimes)),
    h('span', { class: 'cascade-piste', 'aria-hidden': 'true' }, h('i', { style: { left: `${(p.de / max) * 100}%`, width: `${Math.max(1.2, ((p.a - p.de) / max) * 100)}%` } })))));
}

/**
 * Partage : une barre découpée en parts, avec sa légende.
 * @param {{ parts: Array<{ nom: string, valeur: number, classe: string, texte: string }>, description: string }} o
 */
export function partage({ parts, description }) {
  const total = parts.reduce((t, p) => t + Math.max(0, p.valeur), 0) || 1;
  return h('div', { class: 'partage-schema', role: 'img', 'aria-label': description },
    h('div', { class: 'partage-barre', 'aria-hidden': 'true' }, parts.filter((p) => p.valeur > 0).map((p) => h('i', { class: p.classe, style: { width: `${(p.valeur / total) * 100}%` } }))),
    h('ul', { class: 'partage-legende' }, parts.map((p) => h('li', {}, h('i', { class: `pastille-serie ${p.classe}` }), h('span', {}, p.nom), h('b', {}, p.texte)))));
}

/**
 * Fourchette : une valeur attendue entre un bas et un haut, placée par rapport à zéro.
 * @param {{ bas: number, attendu: number, haut: number, format: (c: number) => string, description: string }} o
 */
export function fourchette({ bas, attendu, haut, format, description }) {
  const etendue = Math.max(1, haut - bas);
  const min = Math.min(bas, 0) - etendue * 0.08;
  const max = Math.max(haut, 0) + etendue * 0.08;
  const x = (v) => `${((v - min) / (max - min)) * 100}%`;
  return h('div', { class: `fourchette ${attendu < 0 ? 'negatif' : ''}`, role: 'img', 'aria-label': description },
    h('div', { class: 'fourchette-piste' },
      h('i', { class: 'fourchette-zero', style: { left: x(0) } }),
      h('i', { class: 'fourchette-bande', style: { left: x(bas), width: `${((haut - bas) / (max - min)) * 100}%` } }),
      h('i', { class: 'fourchette-point', style: { left: x(attendu) } })),
    h('div', { class: 'fourchette-legende', 'aria-hidden': 'true' },
      h('span', {}, h('small', {}, 'au pire'), h('b', {}, format(bas))),
      h('span', { class: 'centre' }, h('small', {}, 'le plus probable'), h('b', {}, format(attendu))),
      h('span', { class: 'droite' }, h('small', {}, 'au mieux'), h('b', {}, format(haut)))));
}

/**
 * Barres verticales (une par catégorie de l'axe), avec un repère horizontal facultatif.
 * @param {{ valeurs: Array<{ nom: string, valeur: number, fort?: boolean, vide?: boolean }>, format: (v: number) => string,
 *   repere?: { valeur: number, texte: string }, description: string, hauteur?: number }} o
 */
export function barres({ valeurs, format, repere = null, description, hauteur = 150 }) {
  const W = 320; const H = hauteur; const haut = 18; const bas = 20;
  const max = Math.max(1, ...valeurs.map((v) => v.valeur), repere?.valeur || 0) * 1.08;
  const pas = W / valeurs.length;
  const l = Math.min(30, pas * 0.62);
  const y = (v) => haut + (H - haut - bas) * (1 - v / max);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graphe-svg barres', role: 'img', 'aria-label': description });
  svg.append(s('line', { x1: 0, x2: W, y1: H - bas, y2: H - bas, class: 'graphe-grille zero' }));
  if (repere && repere.valeur > 0) {
    svg.append(s('line', { x1: 0, x2: W, y1: y(repere.valeur).toFixed(1), y2: y(repere.valeur).toFixed(1), class: 'graphe-repere' }));
    svg.append(s('text', { x: W, y: (y(repere.valeur) - 4).toFixed(1), class: 'graphe-repere-texte', 'text-anchor': 'end' }, repere.texte));
  }
  valeurs.forEach((v, i) => {
    const cx = pas * i + pas / 2;
    const yy = y(Math.max(0, v.valeur));
    const hh = Math.max(v.vide ? 0 : 2, H - bas - yy);
    if (!v.vide) svg.append(s('rect', { x: (cx - l / 2).toFixed(1), y: yy.toFixed(1), width: l.toFixed(1), height: hh.toFixed(1), rx: 4, class: `barre ${v.fort ? 'fort' : ''}` }));
    svg.append(s('text', { x: cx.toFixed(1), y: (yy - 5).toFixed(1), class: `graphe-axe barre-valeur ${v.fort ? 'fort' : ''}`, 'text-anchor': 'middle' }, v.vide ? '–' : format(v.valeur)));
    svg.append(s('text', { x: cx.toFixed(1), y: H - 6, class: 'graphe-axe', 'text-anchor': 'middle' }, v.nom));
  });
  return h('div', { class: 'graphe' }, svg);
}
