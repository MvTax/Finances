// pdf-loader.js — charge pdf.js (vendor/pdfjs, build « legacy » compatible Safari) À LA DEMANDE,
// puis extrait les items de texte au format attendu par les parseurs : { str, x, y (depuis le haut), w }.

let pdfjs = null;

export async function chargerPdfjs() {
  if (pdfjs) return pdfjs;
  try {
    const base = new URL('../../vendor/pdfjs/', import.meta.url);
    pdfjs = await import(new URL('pdf.min.mjs', base).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href;
    return pdfjs;
  } catch (e) {
    pdfjs = null;
    throw new Error('Le lecteur PDF n’a pas pu être chargé (hors ligne lors du premier import ?). Réessaie avec une connexion, ou utilise un export CSV.');
  }
}

/** @returns {Promise<Array<{ numero, largeur, hauteur, items }>>} */
export async function extrairePages(donnees) {
  const lib = await chargerPdfjs();
  const doc = await lib.getDocument({ data: donnees, isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const items = [];
      for (const it of tc.items) {
        if (!('str' in it) || !it.str || !it.str.trim()) continue;
        items.push({ str: it.str, x: it.transform[4], y: vp.height - it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) });
      }
      pages.push({ numero: p, largeur: vp.width, hauteur: vp.height, items });
      page.cleanup?.();
    }
  } finally { doc.destroy?.(); }
  return pages;
}
