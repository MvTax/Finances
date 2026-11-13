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
import { resumer, quantile, regression, phi, serieQuotidienne, statsDepenses, previsionMois, contexteDepense } from '../../js/v100/strategie/stats.js';
import { cascadeJour, partageDuReste, reglePartage, arrondiDeLaDepense, effetDepense, totalCascade } from '../../js/v100/strategie/explications.js';
import { jaugeDuJour, resteADepenser, arrondisPeriode } from '../../js/calculs.js';
import { fluxEnvies } from '../../js/envies.js';

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
  { nom: 'v100 statistiques : moyenne, médiane, quartiles, écart-type, régression, loi normale', fn: () => {
    const st = resumer([1000, 2000, 3000, 4000, 10000]);
    egal(st.moyenne, 4000); egal(st.mediane, 3000); egal(st.q1, 2000); egal(st.q3, 4000); egal(st.min, 1000); egal(st.max, 10000);
    egal(st.ecartType, 3536, 'écart-type de l’échantillon (n − 1)');
    egal(quantile([0, 100], 0.25), 25, 'interpolation linéaire');
    egal(resumer([]).moyenne, 0, 'série vide');
    const reg = regression([100, 200, 300, 400]);
    egal(Math.round(reg.pente), 100); egal(Math.round(reg.r2 * 100), 100, 'droite parfaite');
    egal(regression([500, 500, 500]).pente, 0);
    egal(Math.round(phi(0) * 1000), 500); egal(Math.round(phi(1.2816) * 100), 90); egal(Math.round(phi(-1.2816) * 100), 10);
  } },
  { nom: 'v100 statistiques : série des jours terminés (zéros compris), jours de semaine, tendance, catégories', fn: () => {
    // 14 jours terminés avant le 9 novembre (26 oct. → 8 nov.) : 10 € chaque jour, 30 € les deux samedis, rien les dimanches
    const t = [];
    for (let k = 0; k < 14; k += 1) {
      const d = new Date(Date.UTC(2026, 9, 26 + k)).toISOString().slice(0, 10);
      const js = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (js === 0) continue;
      t.push(tx({ date: d, montant: js === 6 ? 3000 : 1000, categorie: js === 6 ? 'restaurants' : 'courses' }));
    }
    // Un prélèvement et la dépense du jour ne comptent pas dans la série
    t.push(tx({ date: '2026-11-03', montant: 5000, categorie: 'abonnements', marchand: 'Abo' }));
    t.push(tx({ date: A, montant: 700 }));
    const e = etat({ transactions: t });
    const serie = serieQuotidienne(e, A);
    egal(serie.length, 14); egal(serie[0].date, '2026-10-26'); egal(serie[13].date, '2026-11-08');
    egal(serie.filter((x) => x.centimes === 0).length, 2, 'les dimanches valent zéro');
    const s = statsDepenses(e, A);
    vrai(s.fiable); egal(s.jours, 14);
    egal(s.global.moyenne, Math.round((10 * 1000 + 2 * 3000) / 14));
    egal(s.global.mediane, 1000); egal(s.joursSansDepense, 2);
    egal(s.jourCher.jour, 6, 'le samedi est le jour le plus cher'); egal(s.jourCher.moyenneCentimes, 3000);
    egal(s.jourSage.jour, 7);
    egal(s.tendance.sens, 'stable', 'deux semaines identiques');
    egal(s.categories[0].categorie, 'courses'); egal(s.categories.length, 2, 'le prélèvement n’est pas une dépense du quotidien'); egal(s.categories[0].montantCentimes, 10000); egal(s.categories[1].montantCentimes, 6000);
    // Une série qui monte de 1 € par jour : tendance à la hausse, 7 € par semaine
    const monte = etat({ transactions: Array.from({ length: 14 }, (_, k) => tx({ date: new Date(Date.UTC(2026, 9, 26 + k)).toISOString().slice(0, 10), montant: 500 + k * 100 })) });
    const sm = statsDepenses(monte, A);
    egal(sm.tendance.sens, 'hausse'); egal(sm.tendance.parSemaineCentimes, 700);
    // Sans opération : rien à dire, sans erreur
    const vide = statsDepenses(etat(), A);
    egal(vide.jours, 0); egal(vide.fiable, false); egal(vide.jourCher, null);
  } },
  { nom: 'v100 statistiques : prévision de fin de mois (fourchette, probabilité) et contexte d’une dépense', fn: () => {
    const t = Array.from({ length: 14 }, (_, k) => tx({ date: new Date(Date.UTC(2026, 9, 26 + k)).toISOString().slice(0, 10), montant: k % 2 ? 1500 : 500 }));
    const e = etat({ transactions: t });
    const p = previsionMois(e, A);
    egal(p.rythmeCentimes, 1000);
    egal(p.attenduCentimes, p.resteCentimes - p.joursRestants * 1000);
    vrai(p.basCentimes < p.attenduCentimes && p.attenduCentimes < p.hautCentimes, 'fourchette autour de la valeur attendue');
    vrai(p.probaTenir >= 0 && p.probaTenir <= 1);
    egal(p.rythmeMaxCentimes, Math.floor(Math.max(0, p.resteCentimes) / p.joursRestants));
    // Dépenser beaucoup plus chaque jour fait baisser la probabilité de tenir
    const cher = etat({ transactions: t.map((x) => ({ ...x, montantCentimes: x.montantCentimes * 6 })) });
    vrai(previsionMois(cher, A).probaTenir <= p.probaTenir);
    // Contexte : une dépense de 15 € en courses, parmi 14 dépenses de 5 ou 15 €
    const nouvelle = tx({ date: A, montant: 1500, marchand: 'Marchand' });
    const c = contexteDepense({ ...e, transactions: [...t, nouvelle] }, nouvelle, A, 3000);
    egal(c.partDuJour, 0.5); egal(c.categorie.n, 14); egal(c.categorie.moyenneCentimes, 1000); egal(c.categorie.rang, 100, 'aucune n’est plus chère');
    vrai(c.marchand.n >= 1);
  } },

  // ---------- Fiches « ? » : les calculs affichés (explications.js) ----------
  { nom: 'v100 fiche du jour : la cascade retombe au centime sur « Reste pour vivre, ce matin » (début de période, veille du salaire)', fn: () => {
    // Début de période (salaire le 5) : rien de dépensé, aucune ligne « déjà dépensé »
    const e = etat();
    const c = cascadeJour(e, '2026-11-05');
    vrai(c.retombe, 'la cascade retombe sur la base');
    egal(totalCascade(c.etapes), c.baseCentimes);
    egal(c.etapes[c.etapes.length - 1].nom, 'Reste pour vivre, ce matin'); egal(c.etapes[c.etapes.length - 1].centimes, c.baseCentimes);
    egal(c.baseCentimes, jaugeDuJour(e, '2026-11-05').instantane.baseCentimes);
    vrai(!c.etapes.some((x) => ['depense', 'deCote', 'arrondis', 'rembourse'].includes(x.cle)), 'rien de dépensé au premier jour');
    egal(c.joursRestants, 30); vrai(Math.abs(c.parJourCentimes * 30 - c.baseCentimes) <= 15, 'part = base ÷ 30 jours');
    for (const x of c.etapes) vrai(x.centimes >= 0, `${x.nom} jamais négatif ici`);
    // Veille du salaire : un seul jour, la part du jour est toute la base
    const v = etat({ transactions: [tx({ date: '2026-11-10', montant: 4590 }), tx({ date: '2026-11-20', montant: 3200, categorie: 'vtc' })] });
    const cv = cascadeJour(v, '2026-12-04');
    vrai(cv.retombe); egal(cv.joursRestants, 1); egal(cv.parJourCentimes, cv.baseCentimes);
    egal(cv.etapes.find((x) => x.cle === 'depense').centimes, 7790, 'dépensé avant aujourd’hui : 45,90 € + 32 €');
  } },
  { nom: 'v100 fiche du jour : journée avec dépenses, privations et arrondis ; chaque ligne calculée, jamais négative', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-11-06', montant: 1990 }), tx({ date: '2026-11-08', montant: 1450, categorie: 'vtc' }), tx({ date: A, montant: 1230, categorie: 'restaurants' })],
      privations: [{ id: 'p1', date: '2026-11-07', categorie: 'restauration-rapide', libelle: 'Menu', montantCentimes: 800, vireLe: null }, { id: 'p2', date: A, categorie: 'autres', libelle: 'Café', montantCentimes: 300, vireLe: null }] });
    e.profil.arrondi.actif = true;
    const j = jaugeDuJour(e, A);
    const c = cascadeJour(e, A, j);
    vrai(c.retombe); egal(totalCascade(c.etapes), c.baseCentimes);
    const ligne = (cle) => c.etapes.find((x) => x.cle === cle)?.centimes || 0;
    egal(ligne('depense'), 1990 + 1450, 'dépenses des jours d’avant');
    egal(ligne('deCote'), 800, 'privation d’avant (celle d’aujourd’hui est dans « dépensé aujourd’hui »)');
    egal(ligne('arrondis'), 10 + 50, 'arrondis des jours d’avant');
    egal(c.depensesDuJourCentimes, 1230 + 300 + 70, 'aujourd’hui : dépense, privation, arrondi');
    egal(c.baseCentimes, resteADepenser(e, A).resteCentimes + c.depensesDuJourCentimes);
    egal(c.restantCentimes, c.parJourCentimes - c.depensesDuJourCentimes);
    for (const x of c.etapes) vrai(x.centimes >= 0, `${x.nom} jamais négatif`);
  } },
  { nom: 'v100 fiche du jour : plus de remboursements que d’achats, ou mois dépassé : la cascade retombe quand même', fn: () => {
    // Avant : « déjà dépensé » était déduit par différence et caché s'il était négatif → la cascade ne retombait plus
    const e = etat({ transactions: [tx({ date: '2026-11-06', montant: 5000, sens: 'credit', categorie: 'vtc', remboursementDe: 'achat' }), tx({ date: '2026-11-07', montant: 1000 }), tx({ date: A, montant: 500 })] });
    const r = resteADepenser(e, A);
    const j = jaugeDuJour(e, A);
    const ancien = r.revenus.totalCentimes - r.chargesCentimes - r.dettesCentimes - r.prevuesCentimes - r.epargneCibleCentimes - j.instantane.baseCentimes;
    vrai(ancien < 0, 'l’ancien calcul par différence donnait une ligne négative');
    const c = cascadeJour(e, A, j);
    vrai(c.retombe); egal(c.etapes.find((x) => x.cle === 'rembourse').centimes, 4000); egal(c.etapes.find((x) => x.cle === 'rembourse').type, 'plus');
    // Mois dépassé : la base est négative, la dernière ligne la montre telle quelle (plus de « 0 » qui ne colle pas)
    const d = etat({ transactions: [tx({ date: '2026-11-06', montant: 200000, categorie: 'vetements' })] });
    const cd = cascadeJour(d, A);
    vrai(cd.baseCentimes < 0); vrai(cd.retombe); egal(cd.etapes[cd.etapes.length - 1].centimes, cd.baseCentimes);
    egal(cd.etapes.find((x) => x.cle === 'epargne'), undefined, 'l’épargne du mois tombe à 0 avant le dépassement');
  } },
  { nom: 'v100 fiche épargne : le partage du reste suit la clôture de 5 h (sans envie, envie en cours, plafond, achat en avance)', fn: () => {
    // Sans envie : tout entre prêt et sécurité (40/30 → 4/7, 3/7)
    const sans = partageDuReste(etat(), A, 1000);
    egal(sans.envie, null); egal(sans.envieCentimes, 0); egal(sans.pretCentimes, 571); egal(sans.securiteCentimes, 429);
    egal(JSON.stringify(sans.pourcents), '{"pret":57,"securite":43,"envie":0,"avance":0}');
    egal(JSON.stringify(reglePartage(etat(), A)), '{"pret":57,"securite":43,"envie":0,"avance":0}', 'la règle, même sans reste aujourd’hui');
    // Envie en cours : 30 % gardés sur le compte pour l’envie, le reste 40/30
    const envie = (o = {}) => { const e = etat(); e.profil.envies = { depuis: '2026-11-01', liste: [{ id: 'e1', nom: 'Jeu', type: 'jeu', montantCentimes: 5000, creeLe: '2026-11-01', achat: null, ...o }] }; return e; };
    const avec = partageDuReste(envie(), A, 1000);
    egal(avec.envie.nom, 'Jeu'); egal(avec.envieCentimes, 300); egal(avec.pretCentimes, 400); egal(avec.securiteCentimes, 300);
    egal(avec.envieCentimes + avec.pretCentimes + avec.securiteCentimes, 1000, 'rien ne se perd');
    egal(JSON.stringify(reglePartage(envie(), A)), '{"pret":40,"securite":30,"envie":30,"avance":0}');
    // Même chiffre que la clôture : la ligne « reste du jour » simulée reçoit la même part dans fluxEnvies
    const e = envie();
    const flux = fluxEnvies({ ...e, privations: [{ id: 'r', date: A, source: 'resteJour', montantCentimes: 1000, vireLe: null }] }, { auto: [], aujourdhuiIso: A });
    egal(flux.parReste.get('r').garde, avec.envieCentimes);
    // Envie presque pleine : elle ne prend que ce qui lui manque
    const plafond = partageDuReste(envie({ montantCentimes: 200 }), A, 1000);
    egal(plafond.envieCentimes, 200); egal(plafond.pretCentimes + plafond.securiteCentimes, 800);
    // Envie achetée en avance (exception) : sa part ne reste pas sur le compte, la moitié rembourse l’avance
    const achetee = partageDuReste(envie({ achat: { date: '2026-11-08', montantCentimes: 5000, txId: 'x', exception: true, retenues: [] } }), A, 1000);
    egal(achetee.envieCentimes, 0); egal(achetee.avanceCentimes, 500); egal(achetee.pretCentimes, 286); egal(achetee.securiteCentimes, 214);
    // Partage réglé autrement (Stratégie → Répartition) : 50/50, rien pour l’envie
    const regle = envie(); regle.profil.partsReste = { pret: 50, securite: 50, envie: 0 };
    const r = partageDuReste(regle, A, 1000);
    egal(r.envieCentimes, 0); egal(r.pretCentimes, 500); egal(r.securiteCentimes, 500);
    egal(partageDuReste(etat(), A, 0).pretCentimes, 0, 'rien à partager');
  } },
  { nom: 'v100 fiche dépense : l’arrondi affiché est celui que l’épargne compte ; la cascade du jour retombe au centime', fn: () => {
    const base = (o = {}) => {
      const e = etat({ transactions: [tx({ id: 'cette', date: A, montant: 1230, categorie: 'restaurants', ...o }), tx({ id: 'autre', date: A, montant: 520 })],
        privations: [{ id: 'p', date: A, categorie: 'autres', libelle: 'Café', montantCentimes: 300, vireLe: null }] });
      e.profil.arrondi.actif = true;
      return e;
    };
    const e = base();
    const t = e.transactions[0];
    const ef = effetDepense(e, t, A);
    egal(ef.arrondiCentimes, 70); vrai(ef.arrondiAVirer, 'dans la cagnotte du prochain virement');
    egal(ef.arrondiCentimes + 80, arrondisPeriode(e, resteADepenser(e, A).periode, A), 'le même arrondi que le budget du jour (+ 80 c de l’autre dépense)');
    egal(ef.autresCentimes, 520 + 80 + 300, 'l’autre dépense, son arrondi, la privation');
    egal(totalCascade(ef.etapes), ef.etapes[ef.etapes.length - 1].centimes, 'la cascade retombe sur le reste du jour');
    egal(ef.etapes[ef.etapes.length - 1].centimes, jaugeDuJour(e, A).restantAujourdhuiCentimes);
    // Arrondi désactivé dans le réglage
    const off = base(); off.profil.arrondi.actif = false;
    const efOff = effetDepense(off, off.transactions[0], A);
    egal(efOff.arrondiCentimes, 0); vrai(!efOff.etapes.some((x) => x.cle === 'arrondi')); egal(totalCascade(efOff.etapes), jaugeDuJour(off, A).restantAujourdhuiCentimes);
    // Dépense exclue des arrondis
    const exclue = base({ extra: { arrondiDesactive: true } });
    egal(effetDepense(exclue, exclue.transactions[0], A).arrondiCentimes, 0);
    egal(arrondisPeriode(exclue, resteADepenser(exclue, A).periode, A), 80, 'seul l’arrondi de l’autre dépense');
    // Virement entre tes comptes : ni dépense du jour, ni arrondi
    const vi = base({ interne: true, categorie: 'virements-internes' });
    const efVi = effetDepense(vi, vi.transactions[0], A);
    vrai(!efVi.quotidienne); egal(efVi.arrondiCentimes, 0);
    // Prélèvement d’une charge fixe aujourd’hui : hors part du jour, mais son arrondi compte dans la journée
    const prlv = base({ montant: 2999, categorie: 'abonnements', chargeFixeId: 'loyer', libellePrincipal: 'PRLV SEPA EXEMPLE' });
    const efP = effetDepense(prlv, prlv.transactions[0], A);
    vrai(!efP.quotidienne); egal(efP.arrondiCentimes, 1); egal(efP.compteAujourdhuiCentimes, 1);
    egal(totalCascade(efP.etapes), jaugeDuJour(prlv, A).restantAujourdhuiCentimes);
    // Dépense d’un autre jour : elle ne change pas la journée, la cascade retombe quand même
    const hier = base({ date: '2026-11-08' });
    const efH = effetDepense(hier, hier.transactions[0], A);
    vrai(!efH.duJour); egal(efH.compteAujourdhuiCentimes, 0); egal(totalCascade(efH.etapes), jaugeDuJour(hier, A).restantAujourdhuiCentimes);
    egal(arrondiDeLaDepense(hier, hier.transactions[0], A).centimes, 70);
    // Dépassement : le reste final est négatif, affiché tel quel
    const gros = base({ montant: 90000, categorie: 'vetements' });
    const efG = effetDepense(gros, gros.transactions[0], A);
    vrai(efG.etapes[efG.etapes.length - 1].centimes < 0); egal(totalCascade(efG.etapes), efG.etapes[efG.etapes.length - 1].centimes);
  } },
];
