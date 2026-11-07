// chiffrement.js — sauvegardes chiffrées par mot de passe (AES-GCM 256 bits, clé dérivée par PBKDF2-SHA-256).
// Le fichier peut aller sur iCloud ou ailleurs : sans le mot de passe, son contenu est illisible.
// Fonctionne dans le navigateur et sous Node (WebCrypto).

export const FORMAT_CHIFFRE = 'budget-sauvegarde-chiffree';
const ITERATIONS = 310000;

const b64 = (octets) => { let s = ''; const u = new Uint8Array(octets); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const deb64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

async function cle(motDePasse, sel, iterations, usages) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(motDePasse), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations }, base, { name: 'AES-GCM', length: 256 }, false, usages);
}

/** Chiffre un texte. @returns l'enveloppe (objet JSON) */
export async function chiffrer(texte, motDePasse) {
  if (!motDePasse) throw new Error('Mot de passe manquant');
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await cle(motDePasse, sel, ITERATIONS, ['encrypt']);
  const donnees = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(texte));
  return { format: FORMAT_CHIFFRE, version: 1, kdf: { nom: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, sel: b64(sel) }, chiffre: { nom: 'AES-GCM', iv: b64(iv) }, donnees: b64(donnees), creeLe: new Date().toISOString() };
}

export const estChiffre = (objet) => objet?.format === FORMAT_CHIFFRE;

/** Déchiffre une enveloppe. Lève « Mot de passe incorrect » si la clé ne convient pas. */
export async function dechiffrer(enveloppe, motDePasse) {
  if (!estChiffre(enveloppe)) throw new Error('Ce fichier n’est pas une sauvegarde chiffrée');
  const k = await cle(motDePasse, deb64(enveloppe.kdf.sel), enveloppe.kdf.iterations, ['decrypt']);
  try {
    const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(enveloppe.chiffre.iv) }, k, deb64(enveloppe.donnees));
    return new TextDecoder().decode(clair);
  } catch { throw new Error('Mot de passe incorrect'); }
}
