// pdf-minimal.mjs — écrit un PDF texte minimal (Helvetica) avec des items positionnés, sans dépendance.
// Sert uniquement à produire les fixtures SYNTHÉTIQUES des parseurs (tools : node tests/outils/generer-fixtures.mjs).

// Largeurs Helvetica (1/1000 em) pour l'alignement à droite des montants
const L = { ' ': 278, ',': 278, '.': 278, '-': 333, '€': 556, '/': 278, '*': 389, ':': 278, "'": 191 };
export function largeur(texte, taille) {
  let w = 0;
  for (const c of texte) w += L[c] ?? (/[0-9]/.test(c) ? 556 : /[A-Z]/.test(c) ? 667 : /[a-zéèàçû]/.test(c) ? 556 : 556);
  return (w * taille) / 1000;
}

function echapper(s) {
  // WinAnsiEncoding : on encode les caractères accentués en octal
  let r = '';
  for (const c of s) {
    const code = c.charCodeAt(0);
    if (c === '(' || c === ')' || c === '\\') r += '\\' + c;
    else if (c === '€') r += '\\200';
    else if (code > 126) r += '\\' + code.toString(8).padStart(3, '0');
    else r += c;
  }
  return r;
}

/**
 * @param {Array<Array<{ x, y, texte, taille?, droite? }>>} pages  y mesuré depuis le HAUT (comme le parseur)
 * @returns {Uint8Array}
 */
export function construirePDF(pages, { largeurPage = 595, hauteurPage = 842 } = {}) {
  const objets = [];
  const ajouter = (contenu) => { objets.push(contenu); return objets.length; };
  const police = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const idsPages = [];
  const parent = objets.length + pages.length * 2 + 1;
  for (const items of pages) {
    const flux = items.map((it) => {
      const t = it.taille || 9;
      const x = it.droite ? it.x - largeur(it.texte, t) : it.x;
      return `BT /F1 ${t} Tf 1 0 0 1 ${x.toFixed(2)} ${(hauteurPage - it.y).toFixed(2)} Tm (${echapper(it.texte)}) Tj ET`;
    }).join('\n');
    const octets = Buffer.from(flux, 'latin1');
    const contenu = ajouter(`<< /Length ${octets.length} >>\nstream\n${flux}\nendstream`);
    idsPages.push(ajouter(`<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 ${largeurPage} ${hauteurPage}] /Resources << /Font << /F1 ${police} 0 R >> >> /Contents ${contenu} 0 R >>`));
  }
  ajouter(`<< /Type /Pages /Kids [${idsPages.map((i) => `${i} 0 R`).join(' ')}] /Count ${idsPages.length} >>`);
  const catalogue = ajouter(`<< /Type /Catalog /Pages ${parent} 0 R >>`);
  let sortie = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const positions = [];
  objets.forEach((o, i) => { positions.push(Buffer.byteLength(sortie, 'latin1')); sortie += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(sortie, 'latin1');
  sortie += `xref\n0 ${objets.length + 1}\n${'0'.repeat(10)} 65535 f \n${positions.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  sortie += `trailer\n<< /Size ${objets.length + 1} /Root ${catalogue} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(sortie, 'latin1'));
}
