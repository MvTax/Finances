// env.mjs — accès aux fixtures sous Node (fichiers) et dans le navigateur (fetch relatif).

const estNode = typeof process !== 'undefined' && !!process.versions?.node;

export async function lireFixture(nom) {
  const url = new URL(`../fixtures/${nom}`, import.meta.url);
  if (estNode) {
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(url));
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fixture introuvable : ${nom}`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function lireFixtureTexte(nom) { return new TextDecoder().decode(await lireFixture(nom)); }
export async function lireAttendus() { return JSON.parse(await lireFixtureTexte('attendus.json')); }
export { estNode };
