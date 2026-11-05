// node.test.mjs — exécute tous les cas sous Node : node --test tests/
import { test } from 'node:test';
import { CAS } from './liste.mjs';

for (const [fichier, charger] of CAS) {
  const cas = (await charger()).default;
  for (const c of cas) test(`${fichier} › ${c.nom}`, c.fn);
}
