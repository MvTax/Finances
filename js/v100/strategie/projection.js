// projection.js (v100) — les 12 prochains mois, mois par mois : revenus, charges, mensualité du prêt, budget du quotidien,
// épargne (sécurité, prêt), envies, capital restant du prêt. Et des scénarios « et si » comparés au plan de base.
//
// Chaque mois suit les mêmes règles que le budget du jour :
//   disponible = revenus − charges fixes − crédits et dettes ;
//   vie courante = le plancher réglé (jamais moins, sauf si le disponible ne suffit pas : mode « survie ») ;
//   épargne du mois = tout le reste, par paliers de 10 € (répartie entre les épargnes selon leurs parts) ;
//   reste des journées = vie courante × taux de non-dépense (mesuré ou choisi), partagé prêt / sécurité / envie.
// Le prêt est simulé avec ses remboursements anticipés (pret.js) : quand il s'arrête, sa mensualité revient au budget.
// Une projection n'est pas une promesse : elle répète tes habitudes d'aujourd'hui.

import { resteADepenser, jaugeDuJour, depensesVariables } from '../../calculs.js';
import { entreesDuMois } from '../../plan.js';
import { proposerAllocation, repartirVersement, soldePoche } from '../../epargne.js';
import { echeancesEntre } from '../../dettes.js';
import { aVirerEpargne } from '../../virements.js';
import { fluxEnvies, partsReste, repartirReste } from '../../envies.js';
import { ajouterMois } from '../../dates.js';
import { creditPrincipal, simulateurPret, capitalRestant } from './pret.js';
import { rythmes } from './rythmes.js';

const pct = (x) => Math.max(0, Math.min(100, Math.round(x)));

/** Partage normalisé (total 100) à partir de parts quelconques. */
export function normaliserParts(p) {
  const pret = pct(p.pret); const securite = pct(p.securite);
  const envie = Math.max(0, 100 - pret - securite);
  return { pret, securite: Math.min(securite, 100 - pret), envie };
}

/**
 * @param {{ nbMois?: number, scenario?: {
 *   salaireDeltaPourcent?: number, salaireDepuisMois?: string,          // augmentation (ou baisse) durable
 *   moisDifficile?: { mois: string, baissePourcent: number },           // un mois avec moins de revenus
 *   depenses?: Array<{ mois: string, montantCentimes: number, libelle?: string }>, // grosses dépenses ponctuelles
 *   economieMensuelleCentimes?: number,                                  // charges en moins chaque mois (abonnement résilié…)
 *   tauxNonDepense?: number,                                             // 0..1 : part du budget du jour non dépensée
 *   partsReste?: { pret, securite, envie },                              // partage du reste des journées
 *   extraPretMensuelCentimes?: number,                                   // effort en plus vers le prêt, pris sur la vie courante
 *   vieParJourCentimes?: number,                                         // budget du quotidien choisi (au lieu du plancher) : l'épargne du mois s'ajuste
 *   partEpargnePret?: number,                                            // 0..100 : part de l'épargne du mois qui va au prêt (le reste à la sécurité)
 *   palierCentimes?: number, modePret?: 'palier'|'solde'|'aucun',
 * } }} o
 */
export function projeter(etat, auj, { nbMois = 12, scenario = {} } = {}) {
  const r = resteADepenser(etat, auj);
  const v = aVirerEpargne(etat, auj);
  const j = jaugeDuJour(etat, auj, null);
  const ry = rythmes(etat, auj);
  const taux = Math.max(0, Math.min(1, scenario.tauxNonDepense ?? ry.tauxNonDepense));
  const parts = normaliserParts(scenario.partsReste || partsReste(etat));
  const P = etat.profil?.parametresPlan || {};
  const partPret = scenario.partEpargnePret;
  const poches = (etat.poches || []).filter((p) => p.actif !== false).map((p) => (partPret === undefined || partPret === null ? p
    : p.type === 'remboursementAnticipe' ? { ...p, partRepartition: pct(partPret) } : p.type === 'coussin' ? { ...p, partRepartition: 100 - pct(partPret) } : p));
  const pochePret = poches.find((p) => p.type === 'remboursementAnticipe') || null;
  const pocheSecu = poches.find((p) => p.type === 'coussin') || null;
  const credit = creditPrincipal(etat);
  // Soldes de départ : déjà viré + ce qui attend le prochain virement
  const soldes = Object.fromEntries(poches.map((p) => [p.id, soldePoche(p) + (v.parPoche.find((x) => x.pocheId === p.id)?.montantCentimes || 0)]));
  const sim = credit ? simulateurPret(credit, {
    depuis: auj, capitalCentimes: capitalRestant(credit, auj), pocheCentimes: pochePret ? soldes[pochePret.id] : 0,
    palierCentimes: scenario.palierCentimes ?? pochePret?.palierCentimes ?? 50000, mode: pochePret ? (scenario.modePret || 'palier') : 'aucun',
  }) : null;
  const envies = fluxEnvies(etat).envies.filter((e) => !e.achat && e.resteCentimes > 0).map((e) => ({ id: e.id, nom: e.nom, resteCentimes: e.resteCentimes, cibleCentimes: e.cibleCentimes }));
  const lignes = [];
  const jalons = [];
  const moisDepart = r.periode.mois;
  let pretTermine = !sim || sim.fini();
  let secuPleine = pocheSecu?.cibleCentimes ? soldes[pocheSecu.id] >= pocheSecu.cibleCentimes : false;
  let mensualitePrecedente = null;

  for (let k = 0; k < nbMois; k += 1) {
    const mois = ajouterMois(moisDepart, k);
    const e = entreesDuMois(etat, mois);
    const per = e.periode;
    const evenements = [];
    // --- Prêt : l'échéance de ce mois (hors différé, déjà compté dans les charges fixes)
    let mensualite = 0;
    let apercu = null;
    if (sim && !sim.fini()) {
      apercu = sim.apercu();
      if (apercu.date >= per.debut && apercu.date <= per.fin && !apercu.differe) mensualite = apercu.echeanceCentimes;
    }
    const pretPrevu = credit ? echeancesEntre(etat, per.debut, per.fin).filter((d) => d.creditId === credit.id).reduce((s, d) => s + d.montantCentimes, 0) : 0;
    const autresDettes = Math.max(0, e.dettesCentimes - pretPrevu);
    // --- Revenus et charges du scénario
    let revenus = k === 0 ? r.revenus.totalCentimes : e.revenusCentimes;
    if (scenario.salaireDeltaPourcent && k > 0 && (!scenario.salaireDepuisMois || mois >= scenario.salaireDepuisMois)) revenus = Math.round(revenus * (1 + scenario.salaireDeltaPourcent / 100));
    if (scenario.moisDifficile && scenario.moisDifficile.mois === mois && k > 0) { revenus = Math.round(revenus * (1 - scenario.moisDifficile.baissePourcent / 100)); evenements.push({ type: 'difficile', libelle: `Revenus −${scenario.moisDifficile.baissePourcent} %` }); }
    let charges = k === 0 ? r.chargesCentimes + (r.prevuesCentimes || 0) : e.chargesFixesCentimes;
    if (scenario.economieMensuelleCentimes && k > 0) charges = Math.max(0, charges - scenario.economieMensuelleCentimes);
    const ponctuelles = (scenario.depenses || []).filter((d) => d.mois === mois);
    const ponctuel = ponctuelles.reduce((s, d) => s + d.montantCentimes, 0);
    for (const d of ponctuelles) evenements.push({ type: 'depense', libelle: d.libelle || 'Grosse dépense', montantCentimes: d.montantCentimes });
    // --- Allocation du mois
    let vie; let epargne; let mode; let partDuJour;
    let extraPret = 0;
    if (k === 0) {
      // Mois en cours : les vrais chiffres ; seul ce qui n'est pas encore viré est ajouté
      vie = Math.max(0, r.resteCentimes) + depensesVariables(etat, per.debut, auj);
      epargne = Math.max(0, v.moisRestantCentimes - v.moisSemaineCentimes);
      mode = r.epargneCibleCentimes > 0 ? 'maximum' : r.resteCentimes < 0 ? 'survie' : 'minimum';
      partDuJour = j.parJourCentimes;
    } else {
      const a = proposerAllocation({ revenusCentimes: revenus, chargesFixesCentimes: charges + ponctuel, dettesCentimes: autresDettes + mensualite, besoinsVitauxCentimes: e.besoinsVitauxCentimes }, P);
      vie = a.vieCouranteCentimes; epargne = a.epargneTotaleCentimes; mode = a.mode;
      if (scenario.vieParJourCentimes > 0 && mode !== 'survie') {
        // Budget du quotidien choisi : ce qu'il prend en plus (ou en moins) vient de l'épargne du mois, par paliers de 10 €
        const voulu = scenario.vieParJourCentimes * per.nbJours;
        const delta = Math.min(voulu - vie, epargne);
        vie += delta; epargne = Math.max(0, Math.floor((epargne - delta) / 1000) * 1000);
      }
      // Effort en plus vers le prêt : pris sur la vie courante, sans descendre sous 1 € par jour
      extraPret = Math.min(scenario.extraPretMensuelCentimes || 0, Math.max(0, vie - 100 * per.nbJours));
      vie -= extraPret;
      partDuJour = Math.round(vie / per.nbJours);
      if (extraPret) evenements.push({ type: 'effort', libelle: 'Effort prêt', montantCentimes: extraPret });
    }
    // --- Reste des journées : partagé prêt / sécurité / envie
    const baseReste = k === 0 ? Math.max(0, r.resteCentimes) : vie;
    const restes = Math.round(baseReste * taux);
    let versEnvie = 0;
    let dispoEnvie = Math.floor((restes * parts.envie) / 100);
    for (const env of envies) {
      if (dispoEnvie <= 0) break;
      if (env.resteCentimes <= 0) continue;
      const x = Math.min(dispoEnvie, env.resteCentimes);
      env.resteCentimes -= x; dispoEnvie -= x; versEnvie += x;
      if (env.resteCentimes === 0) jalons.push({ type: 'envie', mois, titre: `${env.nom} débloqué`, montantCentimes: env.cibleCentimes });
    }
    const versEpargnes = restes - versEnvie;
    const apport = Object.fromEntries(poches.map((p) => [p.id, 0]));
    const ajouter = (liste) => { for (const x of liste || []) apport[x.pocheId] = (apport[x.pocheId] || 0) + x.montantCentimes; };
    // Prêt terminé : tout va à la sécurité ; sécurité pleine : tout va au prêt
    const pochesOuvertes = poches.filter((p) => !(p === pochePret && pretTermine) && !(p === pocheSecu && secuPleine));
    const cibles = pochesOuvertes.length ? pochesOuvertes : poches;
    ajouter(repartirReste(versEpargnes, cibles, parts) || repartirVersement(versEpargnes, cibles, soldes));
    ajouter(repartirVersement(epargne, cibles, soldes));
    if (pochePret && !pretTermine) apport[pochePret.id] += extraPret; else if (pocheSecu) apport[pocheSecu.id] += extraPret;
    for (const p of poches) soldes[p.id] += apport[p.id] || 0;
    // --- Prêt : on joue l'échéance (l'épargne prêt alimente les remboursements anticipés)
    let anticipe = 0;
    let capital = sim ? sim.etat.capital : 0;
    if (sim && !sim.fini() && apercu && apercu.date <= per.fin) {
      const l = sim.pas(pochePret ? apport[pochePret.id] || 0 : 0);
      anticipe = l.anticipeCentimes; capital = l.capitalFinCentimes;
      if (pochePret) soldes[pochePret.id] = sim.etat.poche;
      if (mensualitePrecedente !== null && mensualite > 0 && mensualitePrecedente === 0) {
        jalons.push({ type: 'pretDemarre', mois, titre: 'La mensualité du prêt démarre', montantCentimes: mensualite, partAvantCentimes: lignes[lignes.length - 1]?.partDuJourCentimes ?? null, partApresCentimes: partDuJour });
      }
      if (sim.fini()) { pretTermine = true; jalons.push({ type: 'pretSolde', mois, titre: 'Prêt entièrement remboursé' }); }
    }
    if (sim) mensualitePrecedente = mensualite;
    if (pocheSecu?.cibleCentimes && !secuPleine && soldes[pocheSecu.id] >= pocheSecu.cibleCentimes) { secuPleine = true; jalons.push({ type: 'coussin', mois, titre: 'Sécurité pleine', montantCentimes: pocheSecu.cibleCentimes }); }
    if (mode === 'survie' && k > 0) evenements.push({ type: 'survie', libelle: 'Budget sous le plancher' });
    lignes.push({
      mois, periode: per, enCours: k === 0, revenusCentimes: revenus, chargesCentimes: charges + ponctuel, mensualitePretCentimes: mensualite, autresDettesCentimes: autresDettes,
      vieCentimes: vie, partDuJourCentimes: partDuJour, epargneMoisCentimes: epargne, restesCentimes: restes, versEnvieCentimes: versEnvie,
      versSecuCentimes: pocheSecu ? apport[pocheSecu.id] || 0 : 0, versPretCentimes: pochePret ? apport[pochePret.id] || 0 : 0,
      soldeSecuCentimes: pocheSecu ? soldes[pocheSecu.id] : 0, soldePretCentimes: pochePret ? soldes[pochePret.id] : 0,
      capitalPretCentimes: capital, anticipeCentimes: anticipe, mode, evenements,
    });
  }
  const survie = lignes.filter((l) => l.mode === 'survie' && !l.enCours);
  if (survie.length) jalons.push({ type: 'survie', mois: survie[0].mois, titre: `${survie.length} mois sous le plancher`, nb: survie.length });
  const der = lignes[lignes.length - 1];
  const parts12 = lignes.filter((l) => !l.enCours).map((l) => l.partDuJourCentimes);
  return {
    lignes, jalons: jalons.sort((a, b) => (a.mois < b.mois ? -1 : a.mois > b.mois ? 1 : 0)), tauxNonDepense: taux, parts, rythmes: ry,
    resume: {
      epargneFinCentimes: der.soldeSecuCentimes + der.soldePretCentimes, soldeSecuCentimes: der.soldeSecuCentimes, soldePretCentimes: der.soldePretCentimes,
      capitalPretCentimes: der.capitalPretCentimes, capitalRembourseCentimes: (lignes[0] ? (credit ? capitalRestant(credit, auj) : 0) - der.capitalPretCentimes : 0),
      interetsCentimes: sim ? sim.etat.interets : 0, anticipesCentimes: sim ? sim.etat.anticipes.reduce((s, a) => s + a.montantCentimes, 0) : 0,
      partMinCentimes: parts12.length ? Math.min(...parts12) : der.partDuJourCentimes, partMaxCentimes: parts12.length ? Math.max(...parts12) : der.partDuJourCentimes,
      versEnviesCentimes: lignes.reduce((s, l) => s + l.versEnvieCentimes, 0), moisSurvie: survie.length,
    },
  };
}

/** Écarts d'un scénario par rapport au plan de base (mêmes mois). */
export function comparer(base, sc) {
  const jalon = (p, type) => p.jalons.find((x) => x.type === type)?.mois || null;
  const ecartMois = (a, b) => (a && b ? (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) : null);
  return {
    epargneFinCentimes: sc.resume.epargneFinCentimes - base.resume.epargneFinCentimes,
    capitalPretCentimes: sc.resume.capitalPretCentimes - base.resume.capitalPretCentimes,
    partMinCentimes: sc.resume.partMinCentimes - base.resume.partMinCentimes,
    moisSurvie: sc.resume.moisSurvie - base.resume.moisSurvie,
    coussin: { base: jalon(base, 'coussin'), scenario: jalon(sc, 'coussin'), ecartMois: ecartMois(jalon(base, 'coussin'), jalon(sc, 'coussin')) },
    pretSolde: { base: jalon(base, 'pretSolde'), scenario: jalon(sc, 'pretSolde'), ecartMois: ecartMois(jalon(base, 'pretSolde'), jalon(sc, 'pretSolde')) },
    versEnviesCentimes: sc.resume.versEnviesCentimes - base.resume.versEnviesCentimes,
  };
}

/**
 * La marche de février : ce que la mensualité du prêt change dans le budget du jour, et ce qu'il faudrait pour la compenser.
 * @returns {null | { mois, mensualiteCentimes, partAvantCentimes, partApresCentimes, manqueMensuelCentimes, plancherCentimes }}
 */
export function marchePret(projection, etat) {
  const jl = projection.jalons.find((x) => x.type === 'pretDemarre');
  if (!jl) return null;
  const i = projection.lignes.findIndex((l) => l.mois === jl.mois);
  const avant = projection.lignes[i - 1]; const apres = projection.lignes[i];
  if (!avant || !apres) return null;
  const plancher = (etat.profil?.parametresPlan?.vieMinCentimes) || 37500;
  // Ce qui manque chaque mois pour garder le plancher de vie courante après le démarrage de la mensualité
  const manque = Math.max(0, plancher - apres.vieCentimes);
  return {
    mois: jl.mois, mensualiteCentimes: apres.mensualitePretCentimes, partAvantCentimes: avant.partDuJourCentimes, partApresCentimes: apres.partDuJourCentimes,
    epargneAvantCentimes: avant.epargneMoisCentimes, epargneApresCentimes: apres.epargneMoisCentimes, manqueMensuelCentimes: manque, plancherCentimes: plancher, mode: apres.mode,
  };
}
