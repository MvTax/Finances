// camera.js — photo de ticket / frigo : <input capture="environment">, recompression JPEG ~1200 px, ~0,8.
// La ré-encodage par canvas supprime toutes les métadonnées EXIF (dont la position GPS) ; l'orientation
// est appliquée par createImageBitmap(imageOrientation: 'from-image') ou par le navigateur.

export function choisirPhoto() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files?.[0] || null); input.remove(); }, { once: true });
    document.body.append(input);
    input.click();
  });
}

async function decoder(fichier) {
  if (globalThis.createImageBitmap) {
    try { return await createImageBitmap(fichier, { imageOrientation: 'from-image' }); } catch { /* repli ci-dessous */ }
  }
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

/** Dimensions cibles pour un grand côté maximal. */
export function dimensionsCibles(l, hgt, max = 1200) {
  const r = Math.min(1, max / Math.max(l, hgt));
  return { largeur: Math.max(1, Math.round(l * r)), hauteur: Math.max(1, Math.round(hgt * r)) };
}

/** @returns {Promise<{ blob, base64, mime: 'image/jpeg', largeur, hauteur }>} */
export async function compresserImage(fichier, { max = 1200, qualite = 0.8 } = {}) {
  const src = await decoder(fichier);
  const { largeur, hauteur } = dimensionsCibles(src.width, src.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = largeur; canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(src, 0, 0, largeur, hauteur);
  src.close?.();
  const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Compression impossible'))), 'image/jpeg', qualite));
  const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  return { blob, base64, mime: 'image/jpeg', largeur, hauteur };
}
