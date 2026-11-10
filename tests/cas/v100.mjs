// v100.mjs — moteurs de stratégie de v100 : prêt, projection 12 mois, enveloppes, score, trésorerie, brief, répartition.
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { simulerPret, planPret, dureeOuMensualite, capitalRestant, creditPrincipal, prochaineEcheancePret } from '../../js/v100/strategie/pret.js';
import { projeter, comparer, normaliserParts, marchePret } from '../../js/v100/strategie/projection.js';
import { suiviEnveloppes, plafondDuMois } from '../../js/v100/strategie/enveloppes.js';
import { scoreBudget } from '../../js/v100/strategie/score.js';
import { tresorerie } from '../../js/v100/strategie/tresorerie.js';
import { briefDuJour, voyants } from '../../js/v100/strategie/brief.js';
import { comparerPartages, PREREGLAGES } from '../../js/v100/strategie/repartition.js';
import { rythmes, TAUX_PAR_DEFAUT } from '../../js/v100/strategie/rythmes.js';

// Prêt simple à vérifier de tête : 12 % par an = 1 % par mois ; différé jusqu'en février 2027, puis 100 € par mois
const credit = (o = {}) => ({ id: 'pret', libelle: 'Prêt', type: 'amortissable', actif: true, capitalCentimes: 120000, tauxPourcent: 12, mensualiteCentimes: 10000, assuranceMensuelleCentimes: 100, dureeMois: 13, dateDebut: '2027-02-15', remboursementsAnticipes: [], payees: [], ...o });
const revenus = (mois) => ({ mois, salaireCentimes: 160000, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' });
const etat = (o = {}) => {
  const e = etatBase({
    revenusMensuels: [revenus('2026-10'), revenus('2026-11')],
    chargesFixes: [{ id: 'loyer', libelle: 'Loyer', montantCentimes: 50000, jourPrelevement: 8, actif: true, compteId: 'courant', categorie: 'logement', estLoyer: true }],
    creditsBancaires: [credit()],
    poches: [
      { id: 'secu', nom: 'Sécurité', type: 'coussin', actif: true, partRepartition: 50, cibleCentimes: 100000, mouvements: [] },
      { id: 'ppret', nom: 'Prêt', type: 'remboursementAnticipe', actif: true, partRepartition: 50, cibleCentimes: 120000, palierCentimes: 50000, creditId: 'pret', mouvements: [] },
    ],
    enveloppes: [
      { id: 'courses', nom: 'Courses', categories: ['courses'], plafondMensuelCentimes: 15000, vitale: true },
      { id: 'repas', nom: 'Repas dehors', categories: ['restaurants', 'livraison'], plafondMensuelCentimes: 6000, vitale: false },
    ],
    privations: [], ...o,
  });
  e.profil.repasAuto = { actif: false };
  e.profil.parametresPlan = { vieMinCentimes: 37500, margeMinCentimes: 1000, arrondisEstimesCentimes: 0 };
  e.meta = {};
  return e;
};
const A = '2026-11-09';
// Pour la projection : un prêt assez gros pour être encore là quand sa mensualité démarre
const etatProjection = () => etat({ creditsBancaires: [credit({ capitalCentimes: 600000, mensualiteCentimes: 30000, dureeMois: 22 })] });

export default [
  { nom: 'v100 prêt : différé (intérêts seuls), puis amortissement ; le capital est entièrement remboursé', fn: () => {
    const c = credit();
    egal(creditPrincipal(etat()).id, 'pret');
    egal(capitalRestant(c, A), 120000);
    egal(prochaineEcheancePret(c, A).date, '2026-11-15');
    egal(prochaineEcheancePret(c, '2026-11-15').date, '2026-12-15', 'strictement après');
    const s = simulerPret(c, { depuis: A, mode: 'aucun' });
    egal(s.lignes[0].date, '2026-11-15');
    vrai(s.lignes[0].differe && s.lignes[0].echeanceCentimes === 1200 + 100, 'différé : 1 % de 1 200 € + assurance');
    egal(s.lignes[2].date, '2027-01-15'); vrai(s.lignes[2].differe);
    vrai(!s.lignes[3].differe && s.lignes[3].capitalRembourseCentimes === 10000 - 1200, 'première mensualité : 100 € dont 12 € d’intérêts');
    egal(s.lignes.reduce((x, l) => x + l.capitalRembourseCentimes, 0), 120000, 'tout le capital');
    egal(s.lignes[s.lignes.length - 1].capitalFinCentimes, 0);
    egal(s.coutCentimes, s.interetsCentimes + s.assuranceCentimes);
    egal(s.interetsCentimes, s.lignes.reduce((x, l) => x + l.interetsCentimes, 0));
    egal(capitalRestant(credit({ remboursementsAnticipes: [{ date: '2026-11-01', montantCentimes: 20000 }] }), A), 100000);
  } },
  { nom: 'v100 prêt : rembourser plus tôt coûte moins cher ; chaque mois < par paliers < d’un coup < rien', fn: () => {
    const p = planPret(credit(), A, { pocheCentimes: 10000, versementMensuelCentimes: 20000, palierCentimes: 50000, coussinCentimes: 100000, coussinCibleCentimes: 100000 });
    const par = Object.fromEntries(p.plans.map((x) => [x.id, x]));
    vrai(par.mensuel.coutCentimes < par.palier.coutCentimes && par.palier.coutCentimes < par.solde.coutCentimes && par.solde.coutCentimes < par.base.coutCentimes, 'ordre des coûts');
    vrai(par.mensuel.finLe < par.base.finLe && par.mensuel.moisGagnes > 0);
    egal(p.meilleurId, 'mensuel');
    egal(par.palier.anticipes[0].montantCentimes >= 50000, true, 'le palier déclenche le remboursement');
    vrai(p.gain100.economieCentimes > 0, '100 € remboursés aujourd’hui font gagner des intérêts');
    egal(p.interetsMoisCentimes, 1200);
    egal(p.conseil.code, 'rembourserTot', 'coussin plein, épargne sans intérêts');
    egal(planPret(credit(), A, { coussinCentimes: 0, coussinCibleCentimes: 100000 }).conseil.code, 'coussinDabord');
    egal(planPret(credit(), A, { tauxEpargnePourcent: 15, coussinCentimes: 1, coussinCibleCentimes: 1 }).conseil.code, 'garderEpargne');
    // Un remboursement anticipé ne fait jamais payer plus que le capital
    for (const x of p.plans) egal(x.lignes.reduce((s, l) => s + l.capitalRembourseCentimes + l.anticipeCentimes, 0), 120000, x.id);
  } },
  { nom: 'v100 prêt : avant l’amortissement, durée réduite ou mensualité réduite', fn: () => {
    const d = dureeOuMensualite(credit(), A, 60000);
    vrai(d.duree.moisGagnes > 0 && d.duree.finLe < d.base.finLe, 'même mensualité, fin plus tôt');
    vrai(d.mensualite.mensualiteCentimes < d.base.mensualiteCentimes && d.mensualite.baisseMensuelleCentimes > 0, 'mensualité plus basse');
    vrai(d.mensualite.finLe >= d.duree.finLe, 'garder la durée finit plus tard');
    vrai(d.duree.economieCentimes >= d.mensualite.economieCentimes, 'réduire la durée économise le plus d’intérêts');
    egal(dureeOuMensualite(credit(), '2027-06-01', 10000).mensualite, null, 'après le début : pas de recalcul proposé');
  } },
  { nom: 'v100 projection : la mensualité entre au budget à son début, en sort à la fin du prêt ; jalons', fn: () => {
    const e = etatProjection();
    const p = projeter(e, A, { nbMois: 20 });
    egal(p.lignes.length, 20); vrai(p.lignes[0].enCours);
    const fev = p.lignes.find((l) => l.mois === '2027-02');
    egal(p.lignes.find((l) => l.mois === '2027-01').mensualitePretCentimes, 0, 'différé : rien de plus que les charges');
    vrai(fev.mensualitePretCentimes > 0, 'la mensualité démarre en février 2027');
    egal(p.jalons.find((j) => j.type === 'pretDemarre').mois, '2027-02');
    const solde = p.jalons.find((j) => j.type === 'pretSolde');
    vrai(solde && solde.mois < '2028-11', 'soldé avant la fin prévue (novembre 2028) grâce à l’épargne prêt');
    const apres = p.lignes[p.lignes.findIndex((l) => l.mois === solde.mois) + 1];
    if (apres) egal(apres.mensualitePretCentimes, 0, 'après le solde, plus de mensualité');
    egal(p.resume.capitalPretCentimes, 0);
    vrai(p.jalons.some((j) => j.type === 'coussin'), 'la sécurité se remplit');
    vrai(p.lignes.every((l) => l.partDuJourCentimes > 0 && l.soldeSecuCentimes >= 0));
    egal(p.tauxNonDepense, TAUX_PAR_DEFAUT, 'pas assez de jours observés : taux par défaut');
    const m = marchePret(p, e); egal(m.mois, '2027-02'); vrai(m.epargneApresCentimes < m.epargneAvantCentimes, 'la mensualité est prise sur l’épargne du mois');
  } },
  { nom: 'v100 projection : scénarios (économie, salaire, grosse dépense, budget choisi) comparés au plan de base', fn: () => {
    const e = etatProjection();
    const base = projeter(e, A, { nbMois: 20 });
    const eco = projeter(e, A, { nbMois: 20, scenario: { economieMensuelleCentimes: 5000 } });
    vrai(comparer(base, eco).pretSolde.ecartMois <= 0 && comparer(base, eco).epargneFinCentimes > 0, '50 € de charges en moins : plus d’épargne');
    const plus = projeter(e, A, { nbMois: 20, scenario: { salaireDeltaPourcent: 10, salaireDepuisMois: '2027-01' } });
    egal(plus.lignes.find((l) => l.mois === '2026-12').revenusCentimes, 160000);
    egal(plus.lignes.find((l) => l.mois === '2027-01').revenusCentimes, 176000);
    const gros = projeter(e, A, { nbMois: 20, scenario: { depenses: [{ mois: '2027-03', montantCentimes: 40000, libelle: 'Réparation' }] } });
    vrai(gros.lignes.find((l) => l.mois === '2027-03').epargneMoisCentimes < base.lignes.find((l) => l.mois === '2027-03').epargneMoisCentimes, 'la grosse dépense est prise sur l’épargne du mois');
    const confort = projeter(e, A, { nbMois: 20, scenario: { vieParJourCentimes: 2000 } });
    vrai(confort.lignes[3].partDuJourCentimes === 2000 && confort.lignes[3].epargneMoisCentimes < base.lignes[3].epargneMoisCentimes, '20 € par jour : l’épargne du mois baisse d’autant');
    const dur = projeter(e, A, { nbMois: 20, scenario: { moisDifficile: { mois: '2027-04', baissePourcent: 60 } } });
    vrai(dur.lignes.find((l) => l.mois === '2027-04').epargneMoisCentimes === 0, 'mois difficile : pas d’épargne');
    egal(JSON.stringify(normaliserParts({ pret: 70, securite: 50, envie: 10 })), JSON.stringify({ pret: 70, securite: 30, envie: 0 }));
  } },
  { nom: 'v100 enveloppes : dépassée, « ça chauffe », calme ; plafond du mois avec les vases communicants ; levier', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-11-06', montant: 7000, categorie: 'restaurants' }), tx({ date: '2026-11-07', montant: 500, categorie: 'courses' }),
      tx({ date: '2026-09-10', montant: 20000, categorie: 'restaurants' }), tx({ date: '2026-10-10', montant: 22000, categorie: 'livraison' })] });
    const s = suiviEnveloppes(e, A);
    const repas = s.lignes.find((l) => l.id === 'repas'); const courses = s.lignes.find((l) => l.id === 'courses');
    egal(repas.statut, 'depasse'); egal(repas.resteCentimes, -1000);
    egal(courses.statut, 'calme');
    egal(s.alertes.length, 1);
    vrai(repas.habitudeCentimes > 0 && repas.lecture === 'ambitieux' && repas.levierMensuelCentimes === repas.habitudeCentimes - 6000);
    egal(courses.levierMensuelCentimes, 0, 'enveloppe indispensable : pas de levier');
    e.mouvementsEnveloppes = [{ mois: '2026-11', deEnveloppeId: 'courses', versEnveloppeId: 'repas', montantCentimes: 2000 }];
    egal(plafondDuMois(e, e.enveloppes[1], '2026-11'), 8000);
    egal(suiviEnveloppes(e, A).lignes.find((l) => l.id === 'repas').statut, 'chaud', '70 € sur 80 € au 5e jour : à ce rythme, dépassement');
  } },
  { nom: 'v100 score : cinq cadrans de 20 points, total borné, dettes à 20 sans crédit', fn: () => {
    const e = etat();
    const s = scoreBudget(e, A);
    egal(s.axes.length, 5); egal(s.total, s.axes.reduce((x, a) => x + a.points, 0));
    vrai(s.total >= 0 && s.total <= 100 && s.axes.every((a) => a.points >= 0 && a.points <= 20 && a.constat && a.conseil));
    egal(s.axes.find((a) => a.id === 'dettes').points, 20, 'pas de mensualité ce mois-ci (différé)');
    vrai(s.axes.find((a) => a.id === 'securite').points <= 1, 'coussin presque vide');
    vrai(s.niveau.nom && s.pointFaible.id);
    e.poches[0].soldeInitialCentimes = 100000;
    egal(scoreBudget(e, A).axes.find((a) => a.id === 'securite').points, 20);
  } },
  { nom: 'v100 trésorerie, voyants, brief et répartition', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-11-05', montant: 160000, sens: 'credit', categorie: 'salaire' })] });
    const t = tresorerie(e, A);
    egal(t.points[0].date, A); egal(t.points[t.points.length - 1].date, '2026-12-04');
    vrai(t.plusBas.soldeCentimes <= t.soldeActuelCentimes && t.finPlanCentimes < t.soldeActuelCentimes, 'le solde descend jusqu’au salaire');
    egal(t.risque, 'ok');
    const v = voyants(e, A);
    egal(v.map((x) => x.id).join(' '), 'jour compte virement enveloppes prelevements fin');
    vrai(v.every((x) => ['ok', 'attention', 'critique', 'eteint'].includes(x.etat) && x.texte));
    const b = briefDuJour(e, A);
    vrai(b.titre && b.priorites.length > 0 && b.voyants.length === 6);
    const ordre = { critique: 0, attention: 1, info: 2, bien: 3 };
    vrai(b.priorites.every((p, i) => i === 0 || ordre[b.priorites[i - 1].gravite] <= ordre[p.gravite]), 'priorités classées par gravité');
    const c = comparerPartages(e, A, { nbMois: 18 });
    egal(c.lignes.length, PREREGLAGES.length); egal(c.conseille, 'securite', 'coussin vide : la sécurité d’abord');
    egal(c.actuel.prereglage, 'equilibre');
    const secu = c.lignes.find((l) => l.id === 'securite').resultat; const pret = c.lignes.find((l) => l.id === 'pret').resultat;
    vrai(secu.coussinMois <= pret.coussinMois, 'sécurité d’abord remplit le coussin au moins aussi tôt');
    vrai(rythmes(e, A).tauxNonDepense === TAUX_PAR_DEFAUT);
  } },
];
