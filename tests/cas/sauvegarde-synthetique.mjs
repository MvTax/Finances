// sauvegarde-synthetique.mjs — la sauvegarde inventée (tests/outils/generer-sauvegarde.mjs) a la forme d'un vrai export,
// passe lireSauvegarde, et fait l'aller-retour export → restauration → rechargement → export sans rien perdre.
import { egal, vrai, egalProfond } from '../outils/assert.mjs';
import { estNode } from '../outils/env.mjs';
import { genererSauvegarde, REFERENCE_DEFAUT } from '../outils/generer-sauvegarde.mjs';
import { lireSauvegarde, construireExport, COLLECTIONS, META_HISTORIQUE, FORMAT } from '../../js/sauvegarde.js';
import { SCHEMA_VERSION } from '../../js/migrations.js';
import { datesDeSalaire } from '../../js/calculs.js';
import { forcerAujourdhui, jourSemaine } from '../../js/dates.js';
import { serieQuotidienne, resumer } from '../../js/v100/strategie/stats.js';

const R = REFERENCE_DEFAUT;
const copie = (x) => JSON.parse(JSON.stringify(x));

/** Forme comparable : clés d'objets triées, collections triées par identifiant (l'ordre de lecture d'une base peut changer). */
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v;
}
function contenuComparable(c) {
  const res = {};
  for (const k of Object.keys(c).sort()) {
    const v = canon(c[k]);
    res[k] = Array.isArray(v) && COLLECTIONS.includes(k) ? [...v].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)) : v;
  }
  return res;
}
function memesDonnees(obtenu, attendu, message) {
  const a = contenuComparable(obtenu); const b = contenuComparable(attendu);
  egalProfond(Object.keys(a), Object.keys(b), `${message} : mêmes rubriques`);
  for (const k of Object.keys(b)) egal(JSON.stringify(a[k]), JSON.stringify(b[k]), `${message} : « ${k} » identique`);
}

export default [
  { nom: 'sauvegarde synthétique : forme d’un vrai export, acceptée par lireSauvegarde, déterministe, sans suite de 10 chiffres', fn: () => {
    const s = genererSauvegarde();
    egal(s.format, FORMAT); egal(s.schemaVersion, SCHEMA_VERSION);
    egal(JSON.stringify(s), JSON.stringify(genererSauvegarde()), 'même date, même graine → même fichier');
    vrai(JSON.stringify(s) !== JSON.stringify(genererSauvegarde({ graine: 7 })), 'une autre graine change le fichier');
    vrai(!/\d{10,}/.test(JSON.stringify(s)), 'aucune suite de 10 chiffres (identifiants et horodatages courts)');
    const lu = lireSauvegarde(copie(s));
    vrai(lu.ok, lu.erreurs?.join(' ; ')); egal(lu.migrations.length, 0, 'déjà au schéma courant');
    const c = s.contenu;
    for (const k of COLLECTIONS) vrai(Array.isArray(c[k]), `collection « ${k} » présente`);
    for (const k of Object.keys(c.meta)) vrai(META_HISTORIQUE.includes(k), `meta « ${k} » exportable`);
    for (const k of ['restesJour', 'effortsPartages', 'jeu', 'joursVus', 'supportsEpargne']) vrai(c.meta[k], `meta « ${k} »`);
    // Profil comme le vrai : dates de salaire calculées comme l'app, arrondi, repas, envie de type jeu achetée en exception
    egalProfond(c.profil.datesSalaire, datesDeSalaire(c));
    vrai(c.profil.arrondi?.actif && c.profil.repasAuto?.actif && c.profil.debutSuivi && c.profil.jourSalaireHabituel === 5);
    const envie = c.profil.envies.liste[0];
    egal(envie.type, 'jeu'); vrai(envie.achat.exception); vrai(c.transactions.some((t) => t.id === envie.achat.txId), 'l’achat de l’envie existe');
    egal(c.comptes.length, 2);
    for (const k of ['chargesFixes', 'enveloppes', 'poches', 'creditsBancaires', 'prets', 'reglesCategorie', 'privations', 'revenusMensuels', 'virementsPrevus']) vrai(c[k].length > 0, `${k} non vide`);
    // ~1 an d'opérations, avec tous les rôles, sources et virements internes liés
    const tx = c.transactions;
    vrai(tx.length > 1100 && tx.length < 1500, `${tx.length} opérations`);
    const roles = new Set(tx.map((t) => (t.role === undefined ? 'absent' : String(t.role))));
    for (const r of ['null', 'depuisLCL', 'versParticulier', 'versRevolut', 'depuisParticulier', 'revenu', 'versLCL', 'depuisRevolut', 'aideLogement']) vrai(roles.has(r), `rôle ${r}`);
    for (const src of ['import', 'texte', 'confirmation']) vrai(tx.some((t) => t.source === src), `source ${src}`);
    for (const t of tx.filter((x) => x.virementInterne.estInterne)) vrai(tx.some((u) => u.id === t.virementInterne.transactionLieeId && u.virementInterne.transactionLieeId === t.id), 'virements internes liés deux à deux');
    vrai(tx.some((t) => t.date === R && t.source === 'texte' && t.sens === 'debit'), 'des dépenses saisies aujourd’hui');
    vrai(tx.every((t) => t.date <= R && Number.isInteger(t.montantCentimes) && t.montantCentimes > 0));
  } },
  { nom: 'sauvegarde synthétique : habitudes imitées (médiane ~12 €, moyenne ~25 €, ~25 % de jours sans dépense, samedi le moins cher)', fn: () => {
    const c = genererSauvegarde().contenu;
    const serie = serieQuotidienne(c, R, { jours: 365 });
    const st = resumer(serie.map((x) => x.centimes));
    vrai(st.mediane >= 800 && st.mediane <= 1800, `médiane ${st.mediane}`);
    vrai(st.moyenne >= 1800 && st.moyenne <= 3200, `moyenne ${st.moyenne}`);
    const vides = serie.filter((x) => !x.centimes).length / serie.length;
    vrai(vides >= 0.18 && vides <= 0.34, `jours sans dépense ${vides}`);
    vrai(serie.filter((x) => x.centimes >= 15000).length >= 6, 'quelques gros jours');
    const moy = (js) => { const v = serie.filter((x) => jourSemaine(x.date) === js).map((x) => x.centimes); return v.reduce((s, x) => s + x, 0) / v.length; };
    const parJour = [1, 2, 3, 4, 5, 6, 7].map(moy);
    egal(Math.min(...parJour), parJour[5], 'le samedi est le jour le moins cher');
    vrai([parJour[0], parJour[1]].every((m) => m > parJour[2] && m > parJour[3]), 'lundi et mardi plus chers que le milieu de semaine');
    const vtc = c.transactions.filter((t) => t.categorie === 'vtc').length;
    const rapide = c.transactions.filter((t) => t.categorie === 'restauration-rapide').length;
    vrai(vtc > 104 && rapide > 52, 'VTC et restauration rapide plusieurs fois par semaine');
  } },
  { nom: 'sauvegarde synthétique : aller-retour export → lecture → export identique (collections, profil, réglages, historique)', fn: () => {
    const s = genererSauvegarde();
    const lu = lireSauvegarde(copie(s));
    const etat = { ...copie(lu.contenu), parametres: { ...lu.contenu.parametres, cleGemini: 'secret' } };
    const exp = construireExport(etat, { maintenant: `${R}T18:00:00.000Z`, version: s.application.version });
    egal(exp.contenu.parametres.cleGemini, undefined, 'aucun secret exporté');
    memesDonnees(exp.contenu, s.contenu, 'aller-retour');
  } },
  { nom: 'sauvegarde synthétique : restauration complète dans l’app (base en mémoire), rechargement, puis export identique', fn: async () => {
    if (!estNode) return; // Dans Safari, la vraie base contient tes données : ce test ne tourne que sous Node
    const { fausseIndexedDB } = await import('../outils/fausse-idb.mjs');
    const avant = globalThis.indexedDB;
    globalThis.indexedDB = fausseIndexedDB();
    forcerAujourdhui(R);
    const store = await import('../../js/store.js');
    try {
      await store.effacerTout();
      const s = genererSauvegarde();
      const lu = lireSauvegarde(copie(s));
      vrai(lu.ok);
      await store.remplacerTout(lu.contenu);
      // Comme une réouverture de l'app : tout est relu depuis la base, les mises en ordre « une seule fois » repassent
      await store.charger();
      const exp = construireExport(store.etat, { maintenant: `${R}T18:00:00.000Z`, version: s.application.version });
      memesDonnees(exp.contenu, s.contenu, 'restauration puis rechargement');
    } finally {
      await store.effacerTout();
      forcerAujourdhui(null);
      if (avant === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = avant;
    }
  } },
];
