// repartition.js (v100) — « chaque euro mis de côté, où va-t-il ? » : compare plusieurs partages de ton épargne
// (reste des journées : prêt / sécurité / envie ; épargne du mois : prêt / sécurité) sur 24 mois, et dit lequel
// correspond à l'ordre de priorité : sécurité d'abord, puis le prêt, en gardant une part de plaisir.

import { projeter } from './projection.js';
import { partsReste } from '../../envies.js';

export const PREREGLAGES = [
  { id: 'securite', nom: 'Sécurité d’abord', parts: { pret: 20, securite: 60, envie: 20 }, partEpargnePret: 20, pourquoi: 'Remplit ton coussin au plus vite, puis bascule sur le prêt.' },
  { id: 'equilibre', nom: 'Équilibre', parts: { pret: 40, securite: 30, envie: 30 }, partEpargnePret: 50, pourquoi: 'Avance sur tout en même temps.' },
  { id: 'pret', nom: 'Prêt à fond', parts: { pret: 70, securite: 10, envie: 20 }, partEpargnePret: 80, pourquoi: 'Solde le prêt le plus tôt possible.' },
  { id: 'plaisir', nom: 'Plaisir', parts: { pret: 25, securite: 25, envie: 50 }, partEpargnePret: 50, pourquoi: 'Débloque tes envies plus vite, sans arrêter l’épargne.' },
];

const jalon = (p, type) => p.jalons.find((x) => x.type === type)?.mois || null;

/** Résumé d'un partage : quand le coussin est plein, quand le prêt est soldé, quand la première envie est débloquée. */
export function evaluerPartage(etat, auj, { parts, partEpargnePret, nbMois = 24 }) {
  const p = projeter(etat, auj, { nbMois, scenario: { partsReste: parts, partEpargnePret } });
  return {
    parts: p.parts, partEpargnePret, coussinMois: jalon(p, 'coussin'), pretSoldeMois: jalon(p, 'pretSolde'), envieMois: jalon(p, 'envie'),
    interetsCentimes: p.resume.interetsCentimes, capitalPretCentimes: p.resume.capitalPretCentimes, soldeSecuCentimes: p.resume.soldeSecuCentimes, versEnviesCentimes: p.resume.versEnviesCentimes,
  };
}

/** Le partage actuel (réglages) et les préréglages, évalués ; `conseille` suit l'ordre de priorité. */
export function comparerPartages(etat, auj, { nbMois = 24 } = {}) {
  const poches = (etat.poches || []).filter((p) => p.actif !== false);
  const pret = poches.find((p) => p.type === 'remboursementAnticipe');
  const secu = poches.find((p) => p.type === 'coussin');
  const actuel = { parts: partsReste(etat), partEpargnePret: pret && secu ? Math.round(((pret.partRepartition ?? 50) * 100) / Math.max(1, (pret.partRepartition ?? 50) + (secu.partRepartition ?? 50))) : 100 };
  const lignes = PREREGLAGES.map((x) => ({ ...x, resultat: evaluerPartage(etat, auj, { parts: x.parts, partEpargnePret: x.partEpargnePret, nbMois }) }));
  const resultatActuel = evaluerPartage(etat, auj, { ...actuel, nbMois });
  // Priorité : coussin pas plein → sécurité d'abord ; sinon prêt en cours → prêt à fond ; sinon équilibre
  const coussinPlein = !!secu?.cibleCentimes && resultatActuel.coussinMois === null && resultatActuel.soldeSecuCentimes >= secu.cibleCentimes;
  const dejaPlein = !!secu?.cibleCentimes && lignes[0].resultat.coussinMois === null && lignes[0].resultat.soldeSecuCentimes >= secu.cibleCentimes;
  const conseille = !(coussinPlein || dejaPlein) && secu ? 'securite' : pret && resultatActuel.capitalPretCentimes + 1 > 0 && lignes[2].resultat.pretSoldeMois !== null ? 'pret' : 'equilibre';
  const memes = (a, b) => a.pret === b.pret && a.securite === b.securite && a.envie === b.envie;
  return { actuel: { ...actuel, resultat: resultatActuel, prereglage: PREREGLAGES.find((x) => memes(x.parts, actuel.parts) && x.partEpargnePret === actuel.partEpargnePret)?.id || null }, lignes, conseille };
}
