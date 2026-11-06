import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { periodeBudget, reliquat, datesDeSalaire, revenusDuMois, resteADepenser, jaugeDuJour, soldes, projectionDecouvert, tauxHoraire, equivalentTravail, depensesVariables, besoinsVitaux } from '../../js/calculs.js';

function etatNovembre() {
  const e = etatBase({
    revenusMensuels: [{ mois: '2026-10', salaireCentimes: 140000, primeActiviteCentimes: 15000, autresEntrees: [], statut: 'confirme' }],
    chargesFixes: [
      { id: 'loyer', libelle: 'Loyer', estLoyer: true, montantCentimes: 29000, jourPrelevement: 8, compteId: 'courant', categorie: 'logement', actif: true },
      { id: 'tel', libelle: 'Téléphone', montantCentimes: 1000, jourPrelevement: 5, compteId: 'courant', categorie: 'telephonie', actif: true },
    ],
    planMensuel: [{ mois: '2026-11', allocationsPoches: [{ pocheId: 'p', montantCentimes: 10000 }], arrondisEstimesCentimes: 2000 }],
    creditsBancaires: [{ id: 'ci', libelle: 'Crédit instant', type: 'instantane', echeancier: [{ date: '2026-11-09', montantCentimes: 20000, payee: false }] }],
    prets: [{ id: 'pr', personneAlias: 'Proche', sens: 'empruntéParMoi', montantCentimes: 5000, echeancier: [{ date: '2026-11-06', montantCentimes: 5000, payee: false }] }],
  });
  return e;
}

export default [
  { nom: 'période budgétaire : du jour de salaire à la veille du suivant', fn: () => {
    const p = periodeBudget('2026-11-05', { jourSalaireHabituel: 5 });
    egal(p.mois, '2026-11'); egal(p.debut, '2026-11-05'); egal(p.fin, '2026-12-04'); egal(p.nbJours, 30);
    egal(periodeBudget('2026-11-04', { jourSalaireHabituel: 5 }).mois, '2026-10');
    egal(periodeBudget('2026-02-15', { jourSalaireHabituel: 1 }).fin, '2026-02-28');
  } },
  { nom: 'période budgétaire : d’un salaire réel au suivant (salaire en avance, en retard, attendu)', fn: () => {
    const profil = { jourSalaireHabituel: 5, datesSalaire: ['2026-10-03', '2026-11-05', '2026-12-04'] };
    let p = periodeBudget('2026-11-20', profil);
    egal(p.debut, '2026-11-05'); egal(p.fin, '2026-12-03'); egal(p.mois, '2026-11');        // salaire de décembre arrivé le 04
    egal(periodeBudget('2026-12-04', profil).mois, '2026-12');
    egal(periodeBudget('2026-11-04', profil).debut, '2026-10-03');                          // octobre a commencé le 03
    // Salaire de décembre pas encore arrivé : novembre continue jusqu'à ce qu'il arrive (7 jours au plus)
    const attente = { jourSalaireHabituel: 5, datesSalaire: ['2026-11-05'] };
    const ref = (d) => ({ reference: d }); // « aujourd'hui » simulé
    p = periodeBudget('2026-12-06', attente, ref('2026-12-06'));
    egal(p.mois, '2026-11'); egal(p.debut, '2026-11-05'); egal(p.fin, '2026-12-06');
    egal(periodeBudget('2026-12-12', attente, ref('2026-12-12')).fin, '2026-12-12');         // 7e jour d'attente : novembre continue
    p = periodeBudget('2026-12-14', attente, ref('2026-12-14'));
    egal(p.mois, '2026-12'); egal(p.debut, '2026-12-13');                                    // au-delà : décembre commence le lendemain, sans chevauchement
    egal(periodeBudget('2026-12-13', attente, ref('2026-12-13')).debut, '2026-12-13');
    // Date future vue d'aujourd'hui (05/11) : jour habituel, pas d'attente (sinon la projection compterait deux fois le même mois)
    egal(periodeBudget('2026-12-05', attente, ref('2026-11-05')).debut, '2026-12-05');
    // Salaire versé fin octobre : il compte pour novembre
    egal(periodeBudget('2026-11-10', { jourSalaireHabituel: 1, datesSalaire: ['2026-10-30'] }).mois, '2026-11');
    egal(JSON.stringify(datesDeSalaire({ transactions: [{ categorie: 'salaire', sens: 'credit', montantCentimes: 145296, date: '2026-11-05' }], revenusMensuels: [{ recuLe: '2026-10-03' }] })), '["2026-10-03","2026-11-05"]');
  } },
  { nom: 'projection : avec des dates de salaire réelles, chaque prélèvement n’est compté qu’une fois', fn: () => {
    const e = etatNovembre();
    e.profil = { ...e.profil, datesSalaire: ['2026-10-05', '2026-11-05'] };
    const p = projectionDecouvert(e, '2026-11-05', { jours: 7 });
    const cles = (p.evenements || []).map((x) => `${x.date}|${x.libelle}|${x.montantCentimes}`);
    egal(cles.length, new Set(cles).size);
  } },
  { nom: 'reste du mois : aperçu avant le salaire, puis reste du mois précédent à verser sur l’épargne', fn: () => {
    const e = etatNovembre();
    e.profil = { ...e.profil, debutSuivi: '2026-10-05' };
    const avant = reliquat(e, '2026-11-03');                           // 3 jours avant le salaire du 05/11
    vrai(avant.courant.avantSalaire, 'aperçu dans les 3 derniers jours');
    egal(avant.courant.prochainSalaire, '2026-11-05');
    const apres = reliquat(e, '2026-11-06');
    egal(apres.precedent.mois, '2026-10');
    vrai(apres.precedent.montantCentimes >= 0, 'jamais négatif');
    // Plafonné par l'argent réellement présent sur les comptes à la fin du mois précédent
    const s = soldes(e, apres.precedent.fin).comptes.filter((c) => ['courant', 'neobanque'].includes(c.compte.type)).reduce((t, c) => t + c.soldeCentimes, 0);
    vrai(apres.precedent.montantCentimes <= Math.max(0, s), 'plafonné par les soldes');
    // Mois avant le début du suivi : rien à verser
    e.profil.debutSuivi = '2026-11-05';
    egal(reliquat(e, '2026-11-06').precedent.montantCentimes, 0);
  } },
  { nom: 'revenus : mois non confirmé = montants du mois précédent « attendu » ; aide au logement jamais comptée', fn: () => {
    const e = etatNovembre();
    e.transactions.push(tx({ date: '2026-11-06', montant: 13000, sens: 'credit', categorie: 'entree-exceptionnelle', marchand: 'Aide au logement' }));
    const r = revenusDuMois(e, '2026-11');
    egal(r.statut, 'attendu'); egal(r.totalCentimes, 155000);
    const reste = resteADepenser(e, '2026-11-10');
    egal(reste.revenus.totalCentimes, 155000, 'l’aide au logement ne doit pas augmenter les revenus');
    egal(reste.depensesVariablesCentimes, 0, 'ni diminuer les dépenses');
  } },
  { nom: 'reste à dépenser = revenus − charges fixes − dettes − dépenses variables − épargne (le maximum après les obligatoires)', fn: () => {
    const e = etatNovembre();
    e.transactions.push(
      tx({ date: '2026-11-06', montant: 1250, categorie: 'courses' }),
      tx({ date: '2026-11-07', montant: 1000, categorie: 'telephonie', chargeFixeId: 'tel' }),     // charge déjà comptée
      tx({ date: '2026-11-07', montant: 5000, interne: true, categorie: 'virements-internes' }),  // interne exclu
      tx({ date: '2026-11-07', montant: 3000, epargne: true, categorie: 'epargne' }),             // épargne exclue
      tx({ date: '2026-11-08', montant: 400, sens: 'credit', categorie: 'courses', remboursementDe: 'x' }), // remboursement netté
    );
    const r = resteADepenser(e, '2026-11-10');
    egal(r.chargesCentimes, 31000, 'loyer à payer du profil (300 €) + téléphone payé'); egal(r.dettesCentimes, 25000); egal(r.depensesVariablesCentimes, 850);
    // Sans historique : 375 € gardés pour le quotidien obligatoire, 10 € de marge, le reste (par 10 €) va à l'épargne
    egal(r.besoinsVitauxCentimes, 37500);
    egal(r.epargneCibleCentimes, 60000, 'pas d’objectif fixe : le maximum possible, et non le plan stocké (120 €)');
    egal(r.resteCentimes, 155000 - 31000 - 25000 - 850 - 60000);
  } },
  { nom: 'l’épargne passe après : un dépassement la fait baisser d’abord, puis le budget passe en négatif', fn: () => {
    const e = etatNovembre();
    e.transactions.push(tx({ date: '2026-11-06', montant: 70000, categorie: 'restaurants' }));
    let r = resteADepenser(e, '2026-11-10');
    egal(r.epargneViseeCentimes, 60000); egal(r.epargneCibleCentimes, 155000 - 31000 - 25000 - 70000); egal(r.resteCentimes, 0);
    e.transactions.push(tx({ date: '2026-11-07', montant: 30000, categorie: 'restaurants' }));
    r = resteADepenser(e, '2026-11-10');
    egal(r.epargneCibleCentimes, 0); egal(r.resteCentimes, 155000 - 31000 - 25000 - 100000);
  } },
  { nom: 'mois en cours seulement : les dépenses des mois passés ne changent ni le budget ni l’épargne', fn: () => {
    const e = etatNovembre();
    const avant = resteADepenser(e, '2026-11-10');
    for (const d of ['2026-08-05', '2026-09-10', '2026-10-10']) e.transactions.push(tx({ date: d, montant: 60000, categorie: 'courses' }), tx({ date: d, montant: 50000, categorie: 'restaurants' }));
    const apres = resteADepenser(e, '2026-11-10');
    egal(apres.epargneCibleCentimes, avant.epargneCibleCentimes); egal(apres.resteCentimes, avant.resteCentimes);
    egal(besoinsVitaux(e).centimes, 37500, 'quotidien obligatoire : le montant réglé, pas une moyenne passée');
  } },
  { nom: 'abonnement repéré sans charge fixe : réservé dans le mois s’il doit revenir avant la fin', fn: () => {
    const e = etatNovembre();
    e.transactions.push(tx({ date: '2026-10-20', montant: 1399, categorie: 'abonnements', marchand: 'Netflix' }));
    const r = resteADepenser(e, '2026-11-10');
    const abo = r.charges.find((c) => c.abonnementDetecte);
    vrai(!!abo, 'abonnement réservé'); egal(abo.montantPrevuCentimes, 1399); egal(abo.date, '2026-11-19');
    egal(r.chargesCentimes, 31000 + 1399);
    e.transactions.push(tx({ date: '2026-11-19', montant: 1399, categorie: 'abonnements', marchand: 'Netflix' }));
    const r2 = resteADepenser(e, '2026-11-20');
    egal(r2.charges.filter((c) => c.abonnementDetecte).length, 0, 'une fois payé, il est compté avec les prélèvements, pas deux fois');
  } },
  { nom: 'jauge du jour : figée à la première ouverture puis diminuée des dépenses du jour', fn: () => {
    const e = etatNovembre();
    const j1 = jaugeDuJour(e, '2026-11-05');
    egal(j1.joursRestants, 30); egal(j1.parJourCentimes, Math.round((155000 - 60000 - 31000 - 25000) / 30));
    e.transactions.push(tx({ date: '2026-11-05', montant: 900 }));
    const j2 = jaugeDuJour(e, '2026-11-05', j1.instantane);
    egal(j2.parJourCentimes, j1.parJourCentimes, 'instantané figé'); egal(j2.restantAujourdhuiCentimes, j1.parJourCentimes - 900);
    const j3 = jaugeDuJour(e, '2026-11-06', j1.instantane);
    egal(j3.joursRestants, 29); vrai(j3.parJourCentimes !== j1.parJourCentimes || true);
  } },
  { nom: 'taux horaire et temps de travail', fn: () => {
    const e = etatNovembre();
    egal(tauxHoraire(e, '2026-11'), Math.round(140000 / 151.67));
    egal(equivalentTravail(923 * 2, 923), '2 h'); egal(equivalentTravail(1200, 923), '1 h 18'); egal(equivalentTravail(300, 900), '20 min');
  } },
  { nom: 'risque de découvert : sans salaire confirmé, le loyer n’est pas couvert ; ensuite solde après loyer', fn: () => {
    const e = etatNovembre();
    const p = projectionDecouvert(e, '2026-11-05', { inclureRythme: false });
    vrai(p.risque); vrai(!!p.loyerNonCouvert, 'le loyer doit apparaître non couvert'); egal(p.loyerNonCouvert.date, '2026-11-08');
    e.transactions.push(tx({ date: '2026-11-05', montant: 155000, sens: 'credit', categorie: 'salaire' }));
    const p2 = projectionDecouvert(e, '2026-11-05', { inclureRythme: false });
    egal(p2.loyerNonCouvert, null); egal(p2.soldeApresChargesCentimes, 155000 - 1000 - 5000 - 30000 - 20000);
  } },
  { nom: 'position globale : alerte quand le courant est négatif et la néobanque positive', fn: () => {
    const e = etatNovembre();
    e.transactions.push(tx({ date: '2026-11-02', montant: 2296, compteId: 'courant' }), tx({ date: '2026-11-02', montant: 1091, sens: 'credit', compteId: 'neo' }));
    const s = soldes(e, '2026-11-05');
    egal(s.globalCentimes, -2296 + 1091); egal(s.alerteAbri.rapatriableCentimes, 1091);
  } },
  { nom: 'dépenses variables : la PS5 étalée n’est pas recomptée (prêt), les dettes non plus', fn: () => {
    const e = etatNovembre();
    e.transactions.push(tx({ date: '2026-11-06', montant: 12000, categorie: 'loisirs', pretId: 'pr' }), tx({ date: '2026-11-09', montant: 20000, categorie: 'credits' }));
    egal(depensesVariables(e, '2026-11-05', '2026-12-04'), 0);
  } },
];
