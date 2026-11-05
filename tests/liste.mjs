// liste.mjs — liste des fichiers de cas (partagée entre Node et tests/index.html).
export const CAS = [
  ['money', () => import('./cas/money.mjs')],
  ['dates', () => import('./cas/dates.mjs')],
  ['regles', () => import('./cas/regles.mjs')],
  ['parseurs', () => import('./cas/parseurs.mjs')],
  ['pipeline', () => import('./cas/pipeline.mjs')],
  ['calculs', () => import('./cas/calculs.mjs')],
  ['epargne', () => import('./cas/epargne.mjs')],
  ['dettes', () => import('./cas/dettes.mjs')],
  ['detecteurs', () => import('./cas/detecteurs.mjs')],
  ['migrations', () => import('./cas/migrations.mjs')],
  ['bridge', () => import('./cas/bridge.mjs')],
  ['saisie', () => import('./cas/saisie.mjs')],
];
