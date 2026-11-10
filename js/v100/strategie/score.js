// score.js (v100) — « Score Budget » sur 100 : cinq cadrans de 20 points, chacun avec son constat et la façon de gagner des points.
//  1. Budget du jour : tenir sa part (mois pas dépassé, jours finis sous la part)
//  2. Épargne : part des revenus mise de côté ce mois-ci (10 % = le maximum de points)
//  3. Sécurité : le coussin par rapport à son objectif
//  4. Dettes : poids des crédits et remboursements dans les revenus (10 % ou moins = maximum ; 40 % ou plus = 0)
//  5. Régularité : flammes, soldes vérifiés, sauvegarde récente
// Un score n'est pas un jugement : c'est un tableau de bord, recalculé à chaque ouverture.

import { resteADepenser, jaugeDuJour, depensesVariables } from '../../calculs.js';
import { soldePoche } from '../../epargne.js';
import { aVirerEpargne } from '../../virements.js';
import { serieJours } from '../../jeu.js';
import { ajouterJours, diffJours } from '../../dates.js';

export const NIVEAUX_SCORE = [
  { min: 80, nom: 'Excellent', cle: 'excellent' },
  { min: 65, nom: 'Solide', cle: 'solide' },
  { min: 50, nom: 'En progrès', cle: 'progres' },
  { min: 35, nom: 'En construction', cle: 'construction' },
  { min: 0, nom: 'Au démarrage', cle: 'demarrage' },
];

const borne = (x, min = 0, max = 20) => Math.max(min, Math.min(max, Math.round(x)));
const pctTxt = (x) => `${Math.round(x * 100)} %`;
const eur = (c) => `${(c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function scoreBudget(etat, auj) {
  const r = resteADepenser(etat, auj);
  const per = r.periode;
  const j = jaugeDuJour(etat, auj, null);
  const revenus = Math.max(1, r.revenus.totalCentimes);
  const axes = [];

  // 1. Budget du jour
  const hier = ajouterJours(auj, -1);
  let clos = 0; let sous = 0;
  for (let d = per.debut; d <= hier; d = ajouterJours(d, 1)) { clos += 1; if (depensesVariables(etat, d, d) <= Math.max(0, j.parJourCentimes)) sous += 1; }
  const depasse = r.resteCentimes < 0;
  const pts1 = (depasse ? 0 : 10) + (clos ? 10 * (sous / clos) : 5);
  axes.push({ id: 'budget', nom: 'Budget du jour', points: borne(pts1), max: 20,
    constat: depasse ? `Le budget du mois est dépassé de ${eur(-r.resteCentimes)}.` : clos ? `${sous} jour${sous > 1 ? 's' : ''} sur ${clos} finis sous ta part depuis le salaire.` : 'Le mois commence : rien à juger encore.',
    conseil: depasse ? 'Chaque journée sans dépense te ramène vers zéro.' : sous < clos ? 'Vise une journée de plus sous ta part cette semaine.' : 'Continue : chaque jour sous ta part compte.' });

  // 2. Épargne
  const taux = Math.max(0, r.epargneCibleCentimes) / revenus;
  axes.push({ id: 'epargne', nom: 'Épargne', points: borne(20 * Math.min(1, taux / 0.10)), max: 20,
    constat: r.epargneCibleCentimes > 0 ? `${eur(r.epargneCibleCentimes)} d’épargne ce mois-ci, soit ${pctTxt(taux)} de tes revenus.` : 'Pas d’épargne possible ce mois-ci : les obligations prennent tout.',
    conseil: taux >= 0.10 ? 'Objectif de 10 % atteint.' : `Il manque ${eur(Math.max(0, Math.round(revenus * 0.10) - Math.max(0, r.epargneCibleCentimes)))} par mois pour atteindre 10 % des revenus.` });

  // 3. Sécurité
  const v = aVirerEpargne(etat, auj);
  const secu = (etat.poches || []).find((p) => p.actif !== false && p.type === 'coussin');
  const soldeSecu = secu ? soldePoche(secu) + (v.parPoche.find((x) => x.pocheId === secu.id)?.montantCentimes || 0) : 0;
  const cible = secu?.cibleCentimes || Math.max(1, r.chargesCentimes);
  const partSecu = Math.min(1, soldeSecu / Math.max(1, cible));
  axes.push({ id: 'securite', nom: 'Sécurité', points: borne(20 * partSecu), max: 20,
    constat: `${eur(soldeSecu)} de côté sur ${eur(cible)} (${pctTxt(partSecu)}).`,
    conseil: partSecu >= 1 ? 'Ton coussin est plein.' : `Encore ${eur(cible - soldeSecu)} pour un coussin complet.` });

  // 4. Dettes
  const credits = (r.dettesCentimes || 0) + (r.charges || []).filter((c) => c.categorie === 'credits').reduce((s, c) => s + c.montantPrevuCentimes, 0);
  const poids = credits / revenus;
  const instantane = (etat.creditsBancaires || []).some((c) => c.actif !== false && c.type === 'instantane' && (c.echeancier || []).some((e) => !e.payee));
  const pts4 = 20 * (1 - Math.max(0, Math.min(1, (poids - 0.10) / 0.30))) - (instantane ? 5 : 0);
  axes.push({ id: 'dettes', nom: 'Dettes', points: borne(pts4), max: 20,
    constat: credits ? `${eur(credits)} de crédits et remboursements ce mois-ci, soit ${pctTxt(poids)} de tes revenus.` : 'Aucun crédit ni remboursement ce mois-ci.',
    conseil: instantane ? 'Un crédit instantané est en cours : le solder en premier fait remonter ce cadran.' : poids > 0.10 ? 'Ce cadran remonte tout seul à mesure que tes remboursements se terminent.' : 'Sous 10 % des revenus : c’est sain.' });

  // 5. Régularité
  const serie = serieJours(etat, auj);
  const verif = etat.meta?.derniereVerification;
  const sauvegarde = etat.parametres?.derniereSauvegarde;
  const verifOk = !!verif && diffJours(verif, auj) <= 14;
  const sauvOk = !!sauvegarde && diffJours(sauvegarde.slice(0, 10), auj) <= 7;
  axes.push({ id: 'regularite', nom: 'Régularité', points: borne(10 * Math.min(1, serie / 7) + (verifOk ? 5 : 0) + (sauvOk ? 5 : 0)), max: 20,
    constat: `${serie} jour${serie > 1 ? 's' : ''} de flamme, soldes ${verifOk ? 'vérifiés récemment' : 'pas vérifiés depuis 2 semaines'}, sauvegarde ${sauvOk ? 'à jour' : 'à faire'}.`,
    conseil: serie < 7 ? 'Note tes dépenses 7 jours de suite pour le maximum.' : !verifOk ? 'Lance un Recalcul complet pour vérifier tes soldes.' : !sauvOk ? 'Fais une sauvegarde (Réglages).' : 'Rien à ajouter.' });

  const total = axes.reduce((s, a) => s + a.points, 0);
  const niveau = NIVEAUX_SCORE.find((n) => total >= n.min);
  const faible = [...axes].sort((a, b) => a.points / a.max - b.points / b.max)[0];
  return { total, niveau, axes, pointFaible: faible, periode: per };
}
