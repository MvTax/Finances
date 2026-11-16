import { egal, vrai } from '../outils/assert.mjs';
import { lireFixture } from '../outils/env.mjs';
import { extrairePages } from '../../js/import/pdf-loader.js';
import { parserLCL } from '../../js/import/lcl-pdf.js';
import { parserRevolut } from '../../js/import/revolut-pdf.js';
import { traiterImport, dedoublonner, recalculerAjustement, soldeCompte, detecterChargesFixes, jetonsTitulaire, designeTitulaire, fusionnerRapprochement, empreinte, chargeDuLibelle, rattacherChargesFixes } from '../../js/import/pipeline.js';
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
  { nom: 'pipeline : paiement Apple Pay complété par la ligne du relevé (même sur un autre compte, en dernier recours)', fn: () => {
    const ap = (o) => ({ id: o.id, date: o.date, dateComptable: o.date, montantCentimes: o.montant, sens: 'debit', compteId: o.compteId || 'rev', marchand: o.marchand, libellePrincipal: o.marchand.toUpperCase(),
      source: 'applepay', applePay: { empreinte: o.id, commercant: o.marchand.toUpperCase(), provisoire: !!o.provisoire, verifieLe: null, montantInitialCentimes: o.montant } });
    const ligne = (o) => { const t = { id: o.id, date: o.date, dateComptable: o.date, montantCentimes: o.montant, sens: 'debit', compteId: o.compteId || 'lcl', marchand: o.marchand, libellePrincipal: o.libelle, libelleBrut: o.libelle, source: 'import', importId: 'i2', modifieLe: '2026-11-20T10:00:00Z' }; t.empreinteDedoublonnage = empreinte(t); return t; };
    const pain = ap({ id: 'a1', date: '2026-11-16', montant: 1250, marchand: 'Boulangerie Test' });
    const r = dedoublonner([ligne({ id: 'b1', date: '2026-11-17', montant: 1250, marchand: 'Boulangerie Test', libelle: 'CB BOULANGERIE TEST 16/11' })], [pain]);
    egal(r.rapprochees.length, 1); egal(r.nouvelles.length, 0); egal(r.doublons.length, 0); vrai(!r.rapprochees[0].montantDifferent);
    const f = fusionnerRapprochement(r.rapprochees[0].existante, r.rapprochees[0].importee);
    egal(f.source, 'import'); egal(f.sourceInitiale, 'applepay'); egal(f.compteId, 'lcl', 'la banque fait foi pour le compte'); egal(f.applePay.verifieLe, '2026-11-20T10:00:00Z');
    // Relire le même relevé ensuite : simple doublon
    egal(dedoublonner([ligne({ id: 'b1', date: '2026-11-17', montant: 1250, marchand: 'Boulangerie Test', libelle: 'CB BOULANGERIE TEST 16/11' })], [f]).doublons.length, 1);
    // Une saisie à la main sur un autre compte n'est pas rapprochée (inchangé)
    const main = { ...pain, id: 'm1', source: 'texte', applePay: undefined };
    egal(dedoublonner([ligne({ id: 'b2', date: '2026-11-17', montant: 1250, marchand: 'Boulangerie Test', libelle: 'CB BOULANGERIE TEST 16/11' })], [main]).nouvelles.length, 1);
    // Autre compte et nom sans rapport : pas le même paiement
    egal(dedoublonner([ligne({ id: 'b3', date: '2026-11-17', montant: 1250, marchand: 'Librairie Exemple', libelle: 'CB LIBRAIRIE EXEMPLE' })], [pain]).nouvelles.length, 1);
    // Deux cafés au relevé, un seul paiement Apple Pay : un rapproché, un nouveau
    const cafe = ap({ id: 'a2', date: '2026-11-16', montant: 200, marchand: 'Cafe Test', compteId: 'lcl' });
    const deux = dedoublonner([ligne({ id: 'c1', date: '2026-11-16', montant: 200, marchand: 'Cafe Test', libelle: 'CB CAFE TEST' }), ligne({ id: 'c2', date: '2026-11-16', montant: 200, marchand: 'Cafe Test', libelle: 'CB CAFE TEST' })], [cafe]);
    egal(deux.rapprochees.length, 1); egal(deux.nouvelles.length, 1); egal(deux.doublons.length, 0);
  } },
  { nom: 'pipeline : paiement « à vérifier » (station) rapproché malgré un autre montant ; le montant du relevé peut le remplacer', fn: () => {
    const station = { id: 'p1', date: '2026-11-16', dateComptable: '2026-11-16', montantCentimes: 100, sens: 'debit', compteId: 'lcl', marchand: 'Station Test', libellePrincipal: 'STATION TEST', source: 'applepay',
      applePay: { empreinte: 'p1', commercant: 'STATION TEST', provisoire: true, raisonProvisoire: 'verification-carte', verifieLe: null, montantInitialCentimes: 100 } };
    const l = { id: 'b1', date: '2026-11-18', dateComptable: '2026-11-18', montantCentimes: 4523, sens: 'debit', compteId: 'lcl', marchand: 'Station Test', libellePrincipal: 'CB STATION TEST 16/11', libelleBrut: 'CB STATION TEST 16/11', source: 'import', importId: 'i3', modifieLe: '2026-11-20T10:00:00Z' };
    l.empreinteDedoublonnage = empreinte(l);
    const r = dedoublonner([l], [station]);
    egal(r.rapprochees.length, 1); egal(r.rapprochees[0].montantDifferent, true);
    const garde = fusionnerRapprochement(station, l);
    egal(garde.montantCentimes, 100); egal(garde.applePay.verifieLe, null, 'toujours à vérifier');
    const remplace = fusionnerRapprochement(station, l, { remplacerMontant: true });
    egal(remplace.montantCentimes, 4523); egal(remplace.applePay.verifieLe, '2026-11-20T10:00:00Z'); egal(remplace.applePay.montantInitialCentimes, 100); egal(remplace.source, 'import');
    // Trop tard (8 jours) ou paiement normal au montant différent : pas de rapprochement
    egal(dedoublonner([{ ...l, date: '2026-11-24' }], [station]).nouvelles.length, 1);
    egal(dedoublonner([l], [{ ...station, applePay: { ...station.applePay, provisoire: false } }]).nouvelles.length, 1);
    egal(dedoublonner([l], [{ ...station, applePay: { ...station.applePay, verifieLe: '2026-11-17T08:00:00Z' } }]).nouvelles.length, 1, 'déjà vérifié');
  } },
  { nom: 'charges fixes : nom de la charge retrouvé dans le libellé bancaire (mots entiers, au montant de la charge)', fn: () => {
    const loyer = { id: 'loyer', libelle: 'Loyer', motifDetection: 'BAILLEUR EXEMPLE', montantCentimes: 50000, actif: true };
    const abo = { id: 'abo', libelle: 'Service (9,99 €)', motifDetection: 'SERVICE EXEMPLE', montantCentimes: 999, montantDetection: 999, actif: true };
    const ligne = (montant, lib, marchand = 'Loyer') => ({ id: `l${montant}`, sens: 'debit', montantCentimes: montant, marchand, libellePrincipal: lib, libelleBrut: lib });
    egal(chargeDuLibelle(ligne(50000, 'PRLV SEPA BAILLEUR EXEMPLE ECH NOV'), [loyer])?.id, 'loyer', 'marchand « Loyer », motif dans le libellé');
    egal(chargeDuLibelle(ligne(52000, 'PRLV SEPA BAILLEUR EXEMPLE'), [loyer])?.id, 'loyer', 'à 10 % près');
    egal(chargeDuLibelle(ligne(100000, 'PRLV SEPA BAILLEUR EXEMPLE'), [loyer]), null, 'montant ×2');
    egal(chargeDuLibelle(ligne(50000, 'PRLV SEPA BAILLEUR EXEMPLES'), [loyer]), null, 'mot entier seulement');
    egal(chargeDuLibelle(ligne(999, 'CB SERVICE EXEMPLE 03/11'), [abo])?.id, 'abo');
    egal(chargeDuLibelle(ligne(1099, 'CB SERVICE EXEMPLE 03/11'), [abo]), null, 'montant de détection : exact');
    egal(chargeDuLibelle(ligne(70000, 'X', 'Bailleur Exemple'), [loyer])?.id, 'loyer', 'marchand identique au motif : comme avant, sans condition de montant');
    egal(chargeDuLibelle({ ...ligne(50000, 'PRLV SEPA BAILLEUR EXEMPLE'), sens: 'credit' }, [loyer]), null, 'une entrée');
    const inactive = { ...loyer, id: 'ancien', actif: false };
    egal(chargeDuLibelle(ligne(50000, 'PRLV SEPA BAILLEUR EXEMPLE'), [inactive, loyer])?.id, 'loyer', 'les charges actives d’abord');
    const txs = [ligne(50000, 'PRLV SEPA BAILLEUR EXEMPLE'), { ...ligne(999, 'CB SERVICE EXEMPLE'), chargeFixeId: 'deja' }];
    rattacherChargesFixes(txs, [loyer, abo]);
    egal(txs[0].chargeFixeId, 'loyer'); egal(txs[1].chargeFixeId, 'deja', 'déjà rattachée : gardée');
  } },
  { nom: 'rapprochement : une saisie en « Autres » prend la catégorie du relevé, sauf si tu l’as choisie', fn: () => {
    const saisie = { id: 's', compteId: 'c', sens: 'debit', montantCentimes: 12000, marchand: 'Dépense', categorie: 'autres', date: '2026-11-09', source: 'texte' };
    const ligne = { id: 'i', compteId: 'c', sens: 'debit', montantCentimes: 12000, marchand: 'Crédit instant', libellePrincipal: 'CREDIT INSTANT ECH 0911', libelleBrut: 'CREDIT INSTANT ECH 0911', categorie: 'credits', date: '2026-11-10', importId: 'imp', source: 'import' };
    egal(fusionnerRapprochement(saisie, ligne).categorie, 'credits');
    egal(fusionnerRapprochement({ ...saisie, categorie: null }, ligne).categorie, 'credits', 'sans catégorie');
    egal(fusionnerRapprochement({ ...saisie, categorieVerrouillee: true }, ligne).categorie, 'autres', 'choisie par toi : gardée');
    egal(fusionnerRapprochement({ ...saisie, categorie: 'courses' }, ligne).categorie, 'courses', 'vraie catégorie : gardée');
    egal(fusionnerRapprochement(saisie, { ...ligne, categorie: 'autres' }).categorie, 'autres');
    egal(fusionnerRapprochement(saisie, ligne).montantCentimes, 12000, 'montant inchangé sans remplacement');
    // L'import catégorise aussi la ligne qui complète la saisie
    const resultat = { banque: 'lcl', operations: [{ date: '2026-11-10', montantCentimes: 12000, sens: 'debit', libellePrincipal: 'CREDIT INSTANT ECH 0911' }] };
    const r = traiterImport([{ resultat, compteId: 'c' }], { transactions: [saisie], regles: [], profil: {} }, { maintenant: '2026-11-10T08:00:00Z', importId: 'imp' });
    egal(r.rapprochees.length, 1); egal(r.rapprochees[0].importee.categorie, 'credits');
    egal(fusionnerRapprochement(r.rapprochees[0].existante, r.rapprochees[0].importee).categorie, 'credits');
  } },
  { nom: 'rapprochement : charge marquée « Payé » puis ligne du relevé à un autre montant → la banque fait foi', fn: () => {
    const charges = [{ id: 'loyer', libelle: 'Loyer', motifDetection: 'BAILLEUR EXEMPLE', montantCentimes: 50000, actif: true }];
    const paye = { id: 'p', compteId: 'c', sens: 'debit', montantCentimes: 50000, marchand: 'Loyer', libellePrincipal: 'Loyer', categorie: 'logement', chargeFixeId: 'loyer', date: '2026-11-08', source: 'confirmation', importId: null };
    paye.empreinteDedoublonnage = empreinte(paye);
    const ligne = { id: 'i', compteId: 'c', sens: 'debit', montantCentimes: 51250, marchand: 'Bailleur Exemple', libellePrincipal: 'PRLV SEPA BAILLEUR EXEMPLE', libelleBrut: 'PRLV SEPA BAILLEUR EXEMPLE', date: '2026-11-10', importId: 'imp', source: 'import' };
    ligne.empreinteDedoublonnage = empreinte(ligne);
    const d = dedoublonner([ligne], [paye], { charges });
    egal(d.nouvelles.length, 0); egal(d.rapprochees.length, 1); egal(d.rapprochees[0].montantDifferent, true);
    const f = fusionnerRapprochement(d.rapprochees[0].existante, d.rapprochees[0].importee, { remplacerMontant: true });
    egal(f.montantCentimes, 51250); egal(f.chargeFixeId, 'loyer'); egal(f.source, 'import'); egal(f.importId, 'imp');
    // Sans les charges, trop loin, déjà complétée, ou une autre charge : nouvelle opération
    egal(dedoublonner([ligne], [paye]).nouvelles.length, 1, 'charges inconnues');
    egal(dedoublonner([{ ...ligne, date: '2026-11-20' }], [paye], { charges }).nouvelles.length, 1, '12 jours après');
    egal(dedoublonner([ligne], [{ ...paye, importId: 'avant' }], { charges }).nouvelles.length, 1, 'déjà complétée par un relevé');
    egal(dedoublonner([ligne], [{ ...paye, chargeFixeId: 'autre' }], { charges }).nouvelles.length, 1, 'autre charge');
    egal(dedoublonner([ligne], [{ ...paye, source: 'texte' }], { charges }).nouvelles.length, 1, 'pas un « Payé »');
  } },
];

function egalTableau(a, b) { egal(JSON.stringify(a), JSON.stringify(b)); }
