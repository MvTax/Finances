// soleil.js (v200) — le soleil-jauge de l'écran Aujourd'hui : un disque qui se vide doucement à mesure que la journée
// se dépense, et douze rayons qui s'éteignent un à un. Purement visuel : le chiffre est écrit à côté, en texte.

const NS = 'http://www.w3.org/2000/svg';
const NB_RAYONS = 12;
const R_DISQUE = 50;
let dernierePart = null; // pour que le soleil parte de là où il était (il se vide sous tes yeux)

function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/**
 * @param {{ part: number (0..1), description: string }} o
 * @returns {SVGSVGElement}
 */
export function soleil({ part, description }) {
  const p = Math.max(0, Math.min(1, Number.isFinite(part) ? part : 0));
  const svg = el('svg', { viewBox: '0 0 200 200', class: 'v2-soleil', role: 'img', 'aria-label': description });
  const id = `v2-soleil-${Math.random().toString(36).slice(2, 8)}`;
  const defs = el('defs');
  const clip = el('clipPath', { id: `${id}-c` });
  clip.append(el('circle', { cx: 100, cy: 100, r: R_DISQUE }));
  const degrade = el('radialGradient', { id: `${id}-g`, cx: '38%', cy: '32%', r: '75%' });
  degrade.append(el('stop', { offset: '0%', 'stop-color': '#FFD77A' }), el('stop', { offset: '100%', 'stop-color': '#F2B33D' }));
  defs.append(clip, degrade);
  svg.append(defs);

  // Rayons : allumés tant qu'il reste de quoi dépenser, éteints un à un (en partant de la fin du tour)
  const allumes = Math.ceil(p * NB_RAYONS - 1e-9);
  const rayons = el('g', { class: 'v2-soleil-rayons', 'stroke-linecap': 'round', 'stroke-width': 9 });
  for (let i = 0; i < NB_RAYONS; i += 1) {
    const a = ((i * 360) / NB_RAYONS - 90) * (Math.PI / 180);
    const r1 = 66; const r2 = 86;
    rayons.append(el('line', {
      x1: (100 + r1 * Math.cos(a)).toFixed(1), y1: (100 + r1 * Math.sin(a)).toFixed(1),
      x2: (100 + r2 * Math.cos(a)).toFixed(1), y2: (100 + r2 * Math.sin(a)).toFixed(1),
      class: i < allumes ? 'allume' : 'eteint', style: `--i:${i}`,
    }));
  }
  svg.append(rayons);

  // Disque : fond pâle, niveau doré qui descend
  svg.append(el('circle', { cx: 100, cy: 100, r: R_DISQUE, class: 'v2-soleil-fond' }));
  const niveau = el('rect', { x: 40, y: 100 - R_DISQUE, width: 120, height: 2 * R_DISQUE, fill: `url(#${id}-g)`, class: 'v2-soleil-niveau' });
  const g = el('g', { 'clip-path': `url(#${id}-c)` });
  g.append(niveau);
  svg.append(g);
  svg.append(el('circle', { cx: 100, cy: 100, r: R_DISQUE, class: 'v2-soleil-bord' }));

  const decalage = (x) => `translateY(${((1 - x) * 2 * R_DISQUE).toFixed(1)}px)`;
  const depart = dernierePart === null ? p : dernierePart;
  niveau.style.transform = decalage(depart);
  if (depart !== p) requestAnimationFrame(() => requestAnimationFrame(() => { niveau.style.transform = decalage(p); }));
  dernierePart = p;
  return svg;
}
