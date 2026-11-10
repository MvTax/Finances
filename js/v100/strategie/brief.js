// brief.js (v100) — le brief du jour : ce qui compte aujourd'hui, classé. Rassemble le raisonnement du mois, la
// prévision, la trésorerie, les enveloppes, le virement d'épargne, les prélèvements proches, le plan d'action
// (économies possibles) et le prêt, et n'en garde que l'essentiel : 3 priorités, des voyants, des économies chiffrées.
// Tout est calculé sur le téléphone, par règles, sans IA.

import { resteADepenser, jaugeDuJour, chargesFixesPeriode, depensesVariables } from '../../calculs.js';
import { raisonner } from '../../raisonnement.js';
import { planActionLocal, totalEconomies } from '../../coach.js';
import { previsionFinDeMois } from '../../prevision.js';
import { aVirerEpargne } from '../../virements.js';
import { listerAbonnements } from '../../abonnements.js';
import { ajouterJours, diffJours, formatDateCourte } from '../../dates.js';
import { suiviEnveloppes } from './enveloppes.js';
import { tresorerie } from './tresorerie.js';

const eur = (c) => `${(Math.abs(c) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const GRAVITE = { critique: 0, attention: 1, info: 2, bien: 3 };

/**
 * Voyants du tableau de bord : un par sujet, allumé en vert / ambre / rouge (ou éteint).
 * @returns {Array<{ id, nom, etat: 'ok'|'attention'|'critique'|'eteint', texte, route? }>}
 */
export function voyants(etat, auj) {
  const r = resteADepenser(etat, auj);
  const j = jaugeDuJour(etat, auj, etat.meta?.jauge || null);
  const v = aVirerEpargne(etat, auj);
  const t = tresorerie(etat, auj);
  const env = suiviEnveloppes(etat, auj);
  const prev = previsionFinDeMois(etat, auj);
  const demain = ajouterJours(auj, 2);
  const proches = chargesFixesPeriode(etat, r.periode).filter((c) => !c.payee && c.date >= auj && c.date <= demain);
  const res = [];
  res.push({ id: 'jour', nom: 'Budget du jour', etat: r.resteCentimes < 0 ? 'critique' : j.restantAujourdhuiCentimes < 0 ? 'attention' : 'ok',
    texte: r.resteCentimes < 0 ? `Mois dépassé de ${eur(r.resteCentimes)}` : j.restantAujourdhuiCentimes < 0 ? `Part du jour dépassée de ${eur(j.restantAujourdhuiCentimes)}` : `${eur(j.restantAujourdhuiCentimes)} à dépenser aujourd’hui` });
  res.push({ id: 'compte', nom: 'Compte', etat: !t ? 'eteint' : t.risque === 'decouvert' ? 'critique' : t.risque === 'juste' ? 'attention' : 'ok', route: 'strategie/tresorerie',
    texte: !t ? 'Pas de compte courant' : t.risque === 'decouvert' ? `Découvert possible le ${formatDateCourte(t.plusBasRythme.date)} à ton rythme` : `Au plus bas ${eur(t.plusBas.soldeCentimes)} le ${formatDateCourte(t.plusBas.date)}` });
  res.push({ id: 'virement', nom: 'Virement épargne', etat: v.semaineCentimes > 0 && (v.enRetard || v.dateVirement <= auj) ? 'attention' : 'ok', route: 'epargne',
    texte: v.semaineCentimes > 0 && (v.enRetard || v.dateVirement <= auj) ? `${eur(v.semaineCentimes)} à virer aujourd’hui` : v.semaineCentimes > 0 ? `${eur(v.semaineCentimes)} à virer le ${formatDateCourte(v.dateVirement)}` : 'Rien à virer pour l’instant' });
  res.push({ id: 'enveloppes', nom: 'Catégories', etat: env.alertes.some((l) => l.statut === 'depasse') ? 'critique' : env.alertes.length ? 'attention' : env.lignes.length ? 'ok' : 'eteint', route: 'strategie/categories',
    texte: env.alertes.length ? `${env.alertes.map((l) => l.nom).slice(0, 2).join(', ')} : ${env.alertes.some((l) => l.statut === 'depasse') ? 'plafond dépassé' : 'ça chauffe'}` : 'Toutes dans leur plafond' });
  res.push({ id: 'prelevements', nom: 'Prélèvements', etat: proches.length ? 'attention' : 'ok', route: 'avenir',
    texte: proches.length ? `${proches.map((c) => `${c.libelle} ${eur(c.montantPrevuCentimes)}`).slice(0, 2).join(', ')} sous 48 h` : 'Rien dans les 48 h' });
  res.push({ id: 'fin', nom: 'Fin de mois', etat: !prev?.fiable ? 'eteint' : prev.previsionCentimes < 0 ? (prev.alerte ? 'critique' : 'attention') : 'ok', route: 'strategie/tresorerie',
    texte: !prev?.fiable ? 'Trop tôt pour prévoir' : prev.previsionCentimes < 0 ? `À ce rythme : ${eur(prev.previsionCentimes)} de dépassement` : `À ce rythme : ${eur(prev.previsionCentimes)} de marge` });
  return res;
}

/**
 * Le brief du jour.
 * @returns {{ niveau, titre, phrase, priorites: Array<{ id, gravite, titre, texte, route?, action? }>, voyants, economies: { cartes, mensuelCentimes, annuelCentimes }, abonnements, constats }}
 */
export function briefDuJour(etat, auj) {
  const rs = raisonner(etat, auj);
  const vo = voyants(etat, auj);
  const r = resteADepenser(etat, auj);
  const j = jaugeDuJour(etat, auj, etat.meta?.jauge || null);
  const v = aVirerEpargne(etat, auj);
  const env = suiviEnveloppes(etat, auj);
  const priorites = [];
  const ajouter = (p) => { if (!priorites.some((x) => x.id === p.id)) priorites.push(p); };
  // Urgences d'abord
  const compte = vo.find((x) => x.id === 'compte');
  if (compte.etat === 'critique') ajouter({ id: 'decouvert', gravite: 'critique', titre: 'Risque de découvert', texte: `${compte.texte}. Regarde ce qui part d’ici le salaire.`, route: 'strategie/tresorerie' });
  if (r.resteCentimes < 0) ajouter({ id: 'mois', gravite: 'critique', titre: `Mois dépassé de ${eur(r.resteCentimes)}`, texte: 'Aujourd’hui, vise zéro dépense : chaque journée sans dépense te ramène vers zéro.', route: 'depenses' });
  else if (j.restantAujourdhuiCentimes < 0) ajouter({ id: 'jour', gravite: 'attention', titre: `Part du jour dépassée de ${eur(j.restantAujourdhuiCentimes)}`, texte: `Demain repart à ${eur(Math.max(0, Math.floor(r.resteCentimes / Math.max(1, j.joursRestants - 1))))} si tu t’arrêtes là.` });
  if (v.semaineCentimes > 0 && (v.enRetard || v.dateVirement <= auj)) ajouter({ id: 'virement', gravite: 'attention', titre: `Virement d’épargne : ${eur(v.semaineCentimes)}`, texte: v.enRetard ? 'Il était prévu avant aujourd’hui : fais-le maintenant et touche « J’ai fait le virement ».' : 'C’est le jour : fais-le dans ton appli bancaire puis touche « J’ai fait le virement ».', route: 'epargne' });
  for (const l of env.alertes.slice(0, 2)) {
    ajouter({ id: `env-${l.id}`, gravite: l.statut === 'depasse' ? 'critique' : 'attention', titre: l.statut === 'depasse' ? `${l.nom} : plafond dépassé de ${eur(l.depenseCentimes - l.plafondCentimes)}` : `${l.nom} : ça chauffe`,
      texte: l.statut === 'depasse' ? 'Plus rien dans cette enveloppe jusqu’au salaire, ou prends sur une autre.' : `À ce rythme, ${eur(l.depassementPrevuCentimes)} de trop à la fin du mois. Il te reste ${eur(l.parJourRestantCentimes)} par jour ici.`, route: 'strategie/categories' });
  }
  // Puis les constats du mois (les « attention » avant les autres)
  for (const p of [...rs.points].sort((a, b) => (GRAVITE[a.ton === 'alerte' ? 'critique' : a.ton === 'attention' ? 'attention' : a.ton === 'bien' ? 'bien' : 'info'] - GRAVITE[b.ton === 'alerte' ? 'critique' : b.ton === 'attention' ? 'attention' : b.ton === 'bien' ? 'bien' : 'info']))) {
    ajouter({ id: `constat-${p.id}`, gravite: p.ton === 'alerte' ? 'critique' : p.ton === 'attention' ? 'attention' : p.ton === 'bien' ? 'bien' : 'info', titre: p.titre, texte: p.donc || p.constat, detail: p });
  }
  priorites.sort((a, b) => GRAVITE[a.gravite] - GRAVITE[b.gravite]);
  // Économies possibles (plan d'action sur 3 mois de données)
  let cartes = [];
  try { cartes = planActionLocal(etat, { fin: auj }).filter((c) => c.action !== 'garder' && c.economieMensuelleCentimes > 0); } catch { cartes = []; }
  const eco = totalEconomies(cartes);
  const abos = listerAbonnements(etat, auj, { resilies: etat.parametres?.abonnementsResilies || {} });
  const sansDepense7 = (() => { let n = 0; for (let k = 1; k <= 7; k += 1) if (depensesVariables(etat, ajouterJours(auj, -k), ajouterJours(auj, -k)) <= 0) n += 1; return n; })();
  return {
    niveau: rs.niveau, titre: rs.titre, phrase: rs.phrase, priorites: priorites.slice(0, 6), voyants: vo, constats: rs.points,
    economies: { cartes: cartes.slice(0, 6), mensuelCentimes: eco, annuelCentimes: eco * 12 },
    abonnements: { mensuelCentimes: abos.totalMensuelCentimes, annuelCentimes: abos.totalAnnuelCentimes, nb: abos.liste.length, aLimiterAnnuelCentimes: abos.aLimiterAnnuelCentimes },
    semaine: { joursSansDepense: sansDepense7, joursAvantSalaire: Math.max(0, diffJours(auj, r.periode.fin) + 1) },
  };
}
