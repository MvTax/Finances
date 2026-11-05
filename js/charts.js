// charts.js — graphiques SVG faits main, accessibles : titre, description, tableau alternatif.

import { h } from './ui/dom.js';
import { formatEuros } from './money.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...enfants) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  for (const e of enfants.flat()) if (e !== null && e !== undefined) el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  return el;
}

function tableauAlternatif(titre, colonnes, lignes) {
  return h('details', { class: 'tableau-alt' }, h('summary', {}, 'Voir les données en tableau'),
    h('table', { class: 'tableau' }, h('caption', {}, titre), h('thead', {}, h('tr', {}, colonnes.map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, lignes.map((l) => h('tr', {}, l.map((v, i) => (i === 0 ? h('th', { scope: 'row' }, v) : h('td', {}, v))))))));
}

/**
 * Histogramme groupé (ex. revenus vs dépenses par mois).
 * @param {{ titre, description, libelles: string[], series: Array<{ nom, valeurs: number[], classe }> }} o
 */
export function histogramme(o) {
  const L = 340; const H = 180; const marge = { g: 8, d: 8, h: 12, b: 26 };
  const n = o.libelles.length;
  const max = Math.max(1, ...o.series.flatMap((x) => x.valeurs.map((v) => Math.abs(v))));
  const largeurGroupe = (L - marge.g - marge.d) / Math.max(1, n);
  const largeurBarre = Math.max(3, (largeurGroupe - 6) / o.series.length);
  const id = `g-${Math.random().toString(36).slice(2, 8)}`;
  const svg = s('svg', { viewBox: `0 0 ${L} ${H}`, class: 'graphique', role: 'img', 'aria-labelledby': `${id}-t ${id}-d` },
    s('title', { id: `${id}-t` }, o.titre), s('desc', { id: `${id}-d` }, o.description || ''),
    s('line', { x1: marge.g, x2: L - marge.d, y1: H - marge.b, y2: H - marge.b, class: 'axe' }));
  o.libelles.forEach((lib, i) => {
    const x0 = marge.g + i * largeurGroupe + 3;
    o.series.forEach((serie, k) => {
      const v = Math.max(0, serie.valeurs[i] || 0);
      const hb = ((H - marge.h - marge.b) * v) / max;
      svg.append(s('rect', { x: x0 + k * largeurBarre, y: H - marge.b - hb, width: largeurBarre - 1, height: Math.max(0, hb), rx: 2, class: `barre-g ${serie.classe || ''}` }, s('title', {}, `${serie.nom} ${lib} : ${formatEuros(serie.valeurs[i] || 0)}`)));
    });
    svg.append(s('text', { x: x0 + (largeurGroupe - 6) / 2, y: H - 8, class: 'etiquette-axe', 'text-anchor': 'middle' }, lib));
  });
  const legende = h('div', { class: 'legende' }, o.series.map((x) => h('span', { class: `legende-item ${x.classe || ''}` }, h('span', { class: 'pastille-legende', 'aria-hidden': 'true' }), x.nom)));
  return h('figure', { class: 'figure' }, svg, legende,
    tableauAlternatif(o.titre, ['Mois', ...o.series.map((x) => x.nom)], o.libelles.map((l, i) => [l, ...o.series.map((x) => formatEuros(x.valeurs[i] || 0))])));
}

/** Barres horizontales (catégories, marchands). */
export function barresHorizontales(o) {
  const max = Math.max(1, ...o.donnees.map((d) => d.valeur));
  const id = `b-${Math.random().toString(36).slice(2, 8)}`;
  const hauteurLigne = 26; const L = 340; const H = o.donnees.length * hauteurLigne + 4;
  const svg = s('svg', { viewBox: `0 0 ${L} ${H}`, class: 'graphique', role: 'img', 'aria-labelledby': `${id}-t ${id}-d` }, s('title', { id: `${id}-t` }, o.titre), s('desc', { id: `${id}-d` }, o.description || ''));
  o.donnees.forEach((d, i) => {
    const y = i * hauteurLigne + 2;
    const w = Math.max(2, ((L - 150) * d.valeur) / max);
    svg.append(
      s('text', { x: 0, y: y + 16, class: 'etiquette-axe' }, d.libelle.length > 18 ? d.libelle.slice(0, 17) + '…' : d.libelle),
      s('rect', { x: 120, y: y + 4, width: w, height: 16, rx: 4, class: 'barre-h', style: d.couleur ? `fill:${d.couleur}` : null }, s('title', {}, `${d.libelle} : ${formatEuros(d.valeur)}`)),
      s('text', { x: 124 + w, y: y + 16, class: 'etiquette-valeur' }, d.texte || formatEuros(d.valeur, { sansCentimes: true })));
  });
  return h('figure', { class: 'figure' }, svg, tableauAlternatif(o.titre, [o.colonne || 'Libellé', 'Montant'], o.donnees.map((d) => [d.libelle, d.texte || formatEuros(d.valeur)])));
}
