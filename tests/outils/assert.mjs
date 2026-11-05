// assert.mjs — assertions minimales utilisables sous Node ET dans Safari (tests/index.html).

export class EchecTest extends Error {}

function decrire(v) { try { return JSON.stringify(v); } catch { return String(v); } }

export function egal(obtenu, attendu, message = '') {
  if (!Object.is(obtenu, attendu)) throw new EchecTest(`${message} attendu ${decrire(attendu)}, obtenu ${decrire(obtenu)}`.trim());
}

export function egalProfond(obtenu, attendu, message = '') {
  const a = decrire(obtenu); const b = decrire(attendu);
  if (a !== b) throw new EchecTest(`${message} attendu ${b}, obtenu ${a}`.trim());
}

export function vrai(valeur, message = 'condition fausse') { if (!valeur) throw new EchecTest(message); }

export async function leve(fn, message = 'une erreur était attendue') {
  try { await fn(); } catch { return; }
  throw new EchecTest(message);
}
