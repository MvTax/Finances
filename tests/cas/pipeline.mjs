import { egal, vrai } from '../outils/assert.mjs';
import { lireFixture } from '../outils/env.mjs';
import { extrairePages } from '../../js/import/pdf-loader.js';
import { parserLCL } from '../../js/import/lcl-pdf.js';
import { parserRevolut } from '../../js/import/revolut-pdf.js';
import { traiterImport, dedoublonner, recalculerAjustement, soldeCompte, detecterChargesFixes, jetonsTitulaire, designeTitulaire } from '../../js/import/pipeline.js';
import { natureTransaction } from '../../js/categories.js';

let res = null;
async function importer() {
  if (res) return res;
  const lcl = parserLCL(await extrairePages(await lireFixture('lcl-synthetique-annee.pdf')));
  const rv = parserRevolut(await extrairePages(await lireFixture('revolut-synthetique.pdf')));
  res = { lcl, rv, r: traiterImport([{ resultat: lcl, compteId: 'lcl' }, { resultat: rv, compteId: 'rev' }], { transactions: [], regles: [], profil: {} }, { maintenant: '2026-02-28T00:00:00Z', importId: 'i1' }) };
  return res;
}
const trouver = (r, re, banque) => r.nouvelles.find((t) => re.test(t.libellePrincipal) && (!banque || t.banque === banque));

export default [
  { nom: 'pipeline : titulaire lu dans l’en-tête, virements à soi-même reconnus', fn: async () => {
    const { r } = await importer();
    egalTableau(r.jetonsTitulaire, ['DURAND', 'ALEX']);
    vrai(designeTitulaire('VIR SEPA M ALEX DURAND', jetonsTitulaire('M. DURAND ALEX')));
  } },
  { nom: 'pipeline : virements internes appariés (motif + montant + date ±3 j, jamais le n° de carte)', fn: async () => {
    const { r } = await importer();
    const versRev = trouver(r, /^CB Revolut/);
    vrai(versRev.virementInterne.estInterne); vrai(!!versRev.virementInterne.transactionLieeId, 'recharge non appariée');
    const recharge = r.nouvelles.find((t) => t.id === versRev.virementInterne.transactionLieeId);
    egal(recharge.banque, 'revolut'); egal(recharge.montantCentimes, 1400);
    const retour = trouver(r, /^VIR INST Alex Durand/);
    vrai(retour.virementInterne.estInterne); egal(r.nouvelles.find((t) => t.id === retour.virementInterne.transactionLieeId).libellePrincipal, 'To Moi LCL');
    egal(natureTransaction(retour), 'interne');
  } },
  { nom: 'pipeline : épargne (VIR SEPA vers soi, retour SAVG, TOTAL OPTION System’Épargne)', fn: async () => {
    const { r } = await importer();
    const v = trouver(r, /^VIR SEPA M ALEX DURAND/); egal(natureTransaction(v), 'epargne'); egal(v.sens, 'debit');
    const rep = trouver(r, /^VIREMENT M ALEX DURAND/); egal(natureTransaction(rep), 'epargne'); egal(rep.sens, 'credit');
    const tot = trouver(r, /^TOTAL OPTION/); egal(tot.epargne.type, 'arrondiBanque');
  } },
  { nom: 'pipeline : salaire (« Paie ») et prime d’activité détectés ; piège SCAFE', fn: async () => {
    const { r } = await importer();
    egal(trouver(r, /SOCIETE EXEMPLE/).categorie, 'salaire');
    egal(trouver(r, /^VIREMENT CAF/).categorie, 'prime-activite');
    vrai(trouver(r, /SCAFE/).categorie !== 'prime-activite');
  } },
  { nom: 'pipeline : règle Revolut 10–18 € → Livraison de repas « Uber Eats via un tiers », hors fourchette à qualifier', fn: async () => {
    const { r } = await importer();
    const t1 = trouver(r, /JEANNE EXEMPLE/, 'revolut');
    egal(t1.categorie, 'livraison'); egal(t1.marchand, 'Uber Eats via un tiers'); egal(t1.confiance, 'haute');
    const t2 = trouver(r, /^To Paul Exemple/, 'revolut'); egal(t2.categorie, 'livraison');
    const hors = trouver(r, /LONGNOM/, 'revolut'); vrai(hors.aQualifier); vrai(hors.categorie !== 'livraison');
    const grosse = r.nouvelles.find((t) => t.banque === 'revolut' && t.montantCentimes === 20000);
    egal(natureTransaction(grosse), 'interne', 'recharge de mise à l’abri = interne');
  } },
  { nom: 'pipeline : avoir carte rattaché à l’achat d’origine (remboursement netté)', fn: async () => {
    const { r } = await importer();
    const avoir = r.nouvelles.find((t) => t.estAvoirCarte);
    const achat = r.nouvelles.find((t) => t.id === avoir.remboursementDe);
    vrai(!!achat, 'non rattaché'); egal(achat.marchand, 'Uber (trajets)'); egal(natureTransaction(avoir), 'remboursement');
  } },
  { nom: 'pipeline : réimporter le même relevé n’ajoute rien (idempotent)', fn: async () => {
    const { lcl, rv, r } = await importer();
    const r2 = traiterImport([{ resultat: lcl, compteId: 'lcl' }, { resultat: rv, compteId: 'rev' }], { transactions: r.nouvelles, regles: [], profil: {} });
    egal(r2.nouvelles.length, 0); egal(r2.doublons.length, r.nouvelles.length);
  } },
  { nom: 'dédoublonnage : trois achats identiques le même jour restent trois ; saisie manuelle rapprochée', fn: () => {
    const base = { compteId: 'c', sens: 'debit', montantCentimes: 120, marchand: 'Café', date: '2026-01-10', source: 'import' };
    const ex = [{ ...base, id: 'a' }, { ...base, id: 'b' }];
    const nouv = [{ ...base, id: 'n1' }, { ...base, id: 'n2' }, { ...base, id: 'n3' }];
    const d = dedoublonner(nouv, ex);
    egal(d.doublons.length, 2); egal(d.nouvelles.length, 1);
    const manuelle = { id: 'm', compteId: 'c', sens: 'credit', montantCentimes: 150000, marchand: 'Salaire', date: '2026-02-05', source: 'confirmation' };
    const d2 = dedoublonner([{ id: 'i', compteId: 'c', sens: 'credit', montantCentimes: 150000, marchand: 'Societe Exemple', date: '2026-02-04', source: 'import' }], [manuelle]);
    egal(d2.rapprochees.length, 1); egal(d2.nouvelles.length, 0);
  } },
  { nom: 'ajustement de solde : une ligne unique, recalculée quand les opérations manquantes arrivent', fn: () => {
    const compte = { id: 'c', soldeInitialCentimes: 1000, dateSoldeInitial: '2025-12-31', soldeReference: { date: '2026-01-10', centimes: 0 } };
    const txs = [{ id: 't1', compteId: 'c', sens: 'debit', montantCentimes: 300, date: '2026-01-05', dateComptable: '2026-01-05' }];
    const r1 = recalculerAjustement(compte, txs, 'x');
    egal(r1.ajustement.montantCentimes, 700); egal(r1.ajustement.sens, 'debit'); egal(soldeCompte(compte, r1.transactions, '2026-01-10'), 0);
    const plus = [...r1.transactions, { id: 't2', compteId: 'c', sens: 'debit', montantCentimes: 500, date: '2026-01-08', dateComptable: '2026-01-08' }];
    const r2 = recalculerAjustement(compte, plus, 'x');
    egal(r2.ajustement.montantCentimes, 200); egal(r2.transactions.filter((t) => t.ajustement).length, 1); egal(soldeCompte(compte, r2.transactions, '2026-01-10'), 0);
    egal(natureTransaction(r2.ajustement), 'ajustement');
  } },
  { nom: 'charges fixes : prélèvement mensuel détecté (montant variable), cycle de 28 jours', fn: () => {
    const t = (d, m, mar, cat) => ({ id: d + mar, compteId: 'c', sens: 'debit', montantCentimes: m, date: d, dateComptable: d, marchand: mar, libellePrincipal: `PRLV SEPA ${mar}`, categorie: cat });
    const txs = [t('2026-07-08', 30000, 'Logement Exemple', 'logement'), t('2026-08-10', 29000, 'Logement Exemple', 'logement'), t('2026-09-08', 31000, 'Logement Exemple', 'logement'), t('2026-10-08', 30500, 'Logement Exemple', 'logement'),
      t('2026-08-05', 3196, 'Salle Exemple', 'sport'), t('2026-09-02', 3196, 'Salle Exemple', 'sport'), t('2026-09-30', 3196, 'Salle Exemple', 'sport'), t('2026-10-28', 4196, 'Salle Exemple', 'sport')];
    const c = detecterChargesFixes(txs, { dateReference: '2026-10-30' });
    const loyer = c.find((x) => x.libelle === 'Logement Exemple'); vrai(loyer.actif); vrai(loyer.montantVariable); egal(loyer.jourPrelevement, 8);
    const salle = c.find((x) => x.libelle === 'Salle Exemple'); egal(salle.periodiciteJours, 28); egal(salle.montantCentimes, 4196);
  } },
];

function egalTableau(a, b) { egal(JSON.stringify(a), JSON.stringify(b)); }
