// dessins.js (v200) — petits dessins faits main en SVG : la météo du mois (soleil, nuage, orage, ciel voilé),
// les pots de l'épargne qui se remplissent, et les pastilles des mois (calme, moyen, chargé).
// Purement visuels : chaque dessin a un aria-label (ou aria-hidden quand le texte à côté dit déjà tout).
// Les animations sont en CSS (v200.css) et s'arrêtent avec « Réduire les animations » (prefers-reduced-motion).

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, ...enfants) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, String(v));
  for (const c of enfants) if (c) e.append(c);
  return e;
}

function cadre(viewBox, classe, description) {
  return el('svg', description ? { viewBox, class: classe, role: 'img', 'aria-label': description } : { viewBox, class: classe, 'aria-hidden': 'true', focusable: 'false' });
}

// ---------------------------------------------------------------- Météo

function rayons(cx, cy, r1, r2, n = 8) {
  const g = el('g', { class: 'v2-m-rayons', 'stroke-linecap': 'round' });
  for (let i = 0; i < n; i += 1) {
    const a = ((i * 360) / n) * (Math.PI / 180);
    g.append(el('line', { x1: (cx + r1 * Math.cos(a)).toFixed(1), y1: (cy + r1 * Math.sin(a)).toFixed(1), x2: (cx + r2 * Math.cos(a)).toFixed(1), y2: (cy + r2 * Math.sin(a)).toFixed(1) }));
  }
  g.style.transformOrigin = `${cx}px ${cy}px`;
  return g;
}

/** Un nuage dodu (trois bosses), posé en (x, y) = coin bas gauche, de largeur l. */
function nuage(x, y, l, classe = 'v2-m-nuage') {
  const k = l / 100;
  const d = `M${x + 12 * k} ${y} h${76 * k} a${12 * k} ${12 * k} 0 0 0 ${2 * k} ${-23.8 * k} a${18 * k} ${18 * k} 0 0 0 ${-30 * k} ${-14 * k}`
    + ` a${22 * k} ${22 * k} 0 0 0 ${-40 * k} ${4 * k} a${14 * k} ${14 * k} 0 0 0 ${-8 * k} ${33.8 * k} z`;
  return el('path', { d, class: classe });
}

/**
 * La météo du mois.
 * @param {'soleil'|'nuage'|'orage'|'voile'} type
 */
export function meteo(type, description) {
  const svg = cadre('0 0 160 120', `v2-meteo v2-meteo-${type}`, description);
  if (type === 'soleil') {
    svg.append(rayons(80, 60, 38, 52, 10), el('circle', { cx: 80, cy: 60, r: 30, class: 'v2-m-soleil' }),
      el('circle', { cx: 70, cy: 50, r: 7, class: 'v2-m-reflet' }));
  } else if (type === 'nuage' || type === 'voile') {
    const g = el('g', { class: 'v2-m-flotte' }, nuage(22, 96, 104));
    svg.append(rayons(98, 44, 28, 38, 8), el('circle', { cx: 98, cy: 44, r: 21, class: 'v2-m-soleil' }), g);
    if (type === 'voile') svg.classList.add('pale');
  } else {
    const pluie = el('g', { class: 'v2-m-pluie', 'stroke-linecap': 'round' });
    for (const [x, y] of [[48, 92], [74, 98], [104, 92], [62, 106], [92, 108]]) pluie.append(el('line', { x1: x, y1: y, x2: x - 4, y2: y + 9 }));
    svg.append(pluie, el('g', { class: 'v2-m-flotte' }, nuage(20, 84, 120, 'v2-m-nuage sombre')),
      el('path', { d: 'M84 70 L72 92 H82 L76 112 L98 84 H87 L94 70 Z', class: 'v2-m-eclair' }));
  }
  return svg;
}

// ---------------------------------------------------------------- Pots

const CORPS = 'M31 30 C17 33 13 44 13 58 L13 99 C13 109 20 115 30 115 L70 115 C80 115 87 109 87 99 L87 58 C87 44 83 33 69 30 Z';
const HAUT_LIQUIDE = 32; const BAS_LIQUIDE = 115;

/**
 * Un pot en verre qui se remplit (part 0..1), à la couleur de son pot (classe v2-pot-<id>).
 * Le niveau monte doucement à l'affichage (sauf « Réduire les animations »).
 */
export function pot(id, part, description = null) {
  const p = Math.max(0, Math.min(1, Number.isFinite(part) ? part : 0));
  const svg = cadre('0 0 100 122', `v2-bocal v2-bocal-${id}`, description);
  const clip = `v2-bocal-${id}-${Math.random().toString(36).slice(2, 7)}`;
  svg.append(el('defs', {}, el('clipPath', { id: clip }, el('path', { d: CORPS }))));
  svg.append(el('path', { d: CORPS, class: 'v2-bocal-verre' }));
  // Le liquide : un rectangle et sa vague, montés de (1 − part) × hauteur
  const hauteur = BAS_LIQUIDE - HAUT_LIQUIDE;
  // Un pot pas vide montre toujours un fond de liquide (sinon quelques euros ne se verraient pas)
  const visible = p > 0 ? Math.max(p, 0.1) : 0;
  const y = BAS_LIQUIDE - visible * hauteur;
  const niveau = el('g', { class: 'v2-bocal-niveau' },
    el('path', { d: `M0 ${y} q12.5 -5 25 0 t25 0 t25 0 t25 0 t25 0 V130 H0 Z`, class: 'v2-bocal-vague' }),
    el('rect', { x: 0, y: y + 3, width: 125, height: 130 - y, class: 'v2-bocal-liquide' }));
  niveau.style.setProperty('--monte', `${(visible * hauteur + 6).toFixed(1)}px`);
  const contenu = el('g', { 'clip-path': `url(#${clip})` }, niveau);
  // Quelques pièces au fond quand le pot n'est pas vide
  if (p > 0.04) for (const [cx, cy] of [[34, 106], [52, 108], [68, 104]]) contenu.append(el('circle', { cx, cy, r: 6.5, class: 'v2-bocal-piece' }));
  svg.append(contenu);
  svg.append(el('path', { d: 'M24 52 C22 62 22 80 23 92', class: 'v2-bocal-reflet' }));
  svg.append(el('path', { d: CORPS, class: 'v2-bocal-bord' }));
  svg.append(el('rect', { x: 26, y: 12, width: 48, height: 15, rx: 6, class: 'v2-bocal-couvercle' }),
    el('rect', { x: 26, y: 22, width: 48, height: 5, class: 'v2-bocal-couvercle-ombre' }));
  return svg;
}

// ---------------------------------------------------------------- Pastilles des mois

/**
 * Une pastille de mois : un petit visage (calme : sourire ; moyen : bouche droite ; chargé : bouche en vague).
 * @param {'calme'|'moyen'|'charge'} niveau
 */
export function pastille(niveau, { enCours = false } = {}) {
  const svg = cadre('0 0 40 40', `v2-pastille v2-pastille-${niveau}${enCours ? ' en-cours' : ''}`);
  svg.append(el('circle', { cx: 20, cy: 20, r: 17, class: 'v2-pastille-fond' }),
    el('circle', { cx: 14.5, cy: 17, r: 2, class: 'v2-pastille-trait plein' }), el('circle', { cx: 25.5, cy: 17, r: 2, class: 'v2-pastille-trait plein' }));
  const bouche = niveau === 'calme' ? 'M13.5 23.5 Q20 29.5 26.5 23.5' : niveau === 'charge' ? 'M13.5 26 q3.25 -3 6.5 0 t6.5 0' : 'M14.5 25.5 H25.5';
  svg.append(el('path', { d: bouche, class: 'v2-pastille-trait' }));
  return svg;
}
