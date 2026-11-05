import { egal, vrai } from '../outils/assert.mjs';
import { lireFixture, lireFixtureTexte, lireAttendus } from '../outils/env.mjs';
import { extrairePages } from '../../js/import/pdf-loader.js';
import { parserLCL, estReleveLCL, controlerReleve } from '../../js/import/lcl-pdf.js';
import { parserRevolut, estReleveRevolut } from '../../js/import/revolut-pdf.js';
import { analyserCSV, lireCSV } from '../../js/import/csv.js';

let cache = {};
async function pages(nom) { if (!cache[nom]) cache[nom] = await extrairePages(await lireFixture(nom)); return cache[nom]; }

export default [
  { nom: 'parseur LCL : 3 relevés concaténés réconciliés au centime (TOTAUX et SOLDE EN EUROS)', fn: async () => {
    const p = await pages('lcl-synthetique-annee.pdf');
    vrai(estReleveLCL(p), 'non reconnu comme LCL');
    const r = parserLCL(p);
    const att = (await lireAttendus()).annee;
    egal(r.releves.length, 3);
    r.releves.forEach((rel, i) => {
      vrai(rel.controle.ok, `relevé ${rel.numero} : ${rel.controle.message}`);
      egal(rel.operations.length, att[i].nbOps, `relevé ${rel.numero} opérations`);
      egal(rel.totaux.debit, att[i].totD); egal(rel.totaux.credit, att[i].totC);
      egal(rel.soldeFinal.centimes, att[i].solde, `solde ${rel.numero}`);
    });
    egal(r.titulaire, 'M. DURAND ALEX');
  } },
  { nom: 'parseur LCL : solde final négatif (colonne débit) et ancien solde débiteur inclus dans TOTAUX débit', fn: async () => {
    const r = parserLCL(await pages('lcl-synthetique-annee.pdf'));
    const janv = r.releves[1]; const fev = r.releves[2];
    egal(janv.soldeFinal.colonne, 'debit'); vrai(janv.soldeFinal.centimes < 0);
    egal(janv.ancienSolde.date, '2025-12-31', 'ANCIEN SOLDE daté de l’année précédente');
    egal(fev.ancienSolde.colonne, 'debit'); vrai(fev.ancienSolde.centimes < 0);
    vrai(fev.controle.ok, fev.controle.message);
    const seul = parserLCL(await pages('lcl-synthetique-negatif.pdf'));
    vrai(seul.releves[0].controle.ok); egal(seul.releves[0].soldeFinal.centimes, (await lireAttendus()).negatif[0].solde);
  } },
  { nom: 'parseur LCL : lignes de continuation, System’Épargne, date d’achat, avoir carte, encadrés ignorés', fn: async () => {
    const ops = parserLCL(await pages('lcl-synthetique-annee.pdf')).operations;
    const mc = ops.find((o) => o.libellePrincipal === 'CB MCDONALDS');
    egal(mc.optionSystemEpargneCentimes, 70); egal(mc.date, '2025-11-30'); egal(mc.dateComptable, '2025-12-01');
    const sal = ops.find((o) => /SOCIETE EXEMPLE/.test(o.libellePrincipal));
    vrai(/Paie/.test(sal.libelleBrut)); egal(sal.sens, 'credit');
    const lidl = ops.find((o) => /LIDL/.test(o.libellePrincipal)); egal(lidl.montantCentimes, 123456);
    const avoir = ops.find((o) => o.estAvoirCarte); egal(avoir.montantCentimes, 188); egal(avoir.sens, 'credit');
    const savg = ops.find((o) => /NATURE DU PAIEMENT:SAVG/.test(o.libelleBrut)); vrai(!/Q7XZT42A/.test(savg.libelleBrut), 'référence parasite rattachée');
    vrai(!ops.some((o) => /INFORMATION PREALABLE|CARTES ET ESPECES/.test(o.libelleBrut)), 'encadré compté comme opération');
  } },
  { nom: 'parseur LCL : un écart est signalé (jamais validé en silence)', fn: async () => {
    const r = parserLCL(await pages('lcl-synthetique-negatif.pdf')).releves[0];
    const faux = { ...r, operations: r.operations.slice(1).map((o) => ({ ...o, debitCentimes: o.sens === 'debit' ? o.montantCentimes : 0, creditCentimes: o.sens === 'credit' ? o.montantCentimes : 0 })) };
    const c = controlerReleve(faux);
    vrai(!c.ok); vrai(c.ecartCredit !== 0 || c.ecartDebit !== 0);
  } },
  { nom: 'parseur Revolut : chaque solde de ligne et le solde de clôture réconciliés', fn: async () => {
    const p = await pages('revolut-synthetique.pdf');
    vrai(estReleveRevolut(p));
    const r = parserRevolut(p);
    const att = (await lireAttendus()).revolut;
    vrai(r.controle.ok, r.controle.message);
    egal(r.operations.length, att.nbOps); egal(r.soldeCloture, att.cloture);
    egal(r.operations[2].description, 'Paiement envoyé par M ALEX DURAND', 'description sur deux lignes');
    const fusion = r.operations.find((o) => /LONGNOM/.test(o.description));
    egal(fusion.description, 'Virement à : PRENOMLONG EXEMPLE-LONGNOM'); egal(fusion.categorieRevolut, 'Autres');
    egal(r.titulaire, 'ALEX DURAND'); egal(r.periode.debut, '2025-12-01');
  } },
  { nom: 'CSV : Revolut (en-têtes anglais, état ≠ COMPLETED ignoré, soldes contrôlés) et LCL (séparateur ;)', fn: async () => {
    const rv = analyserCSV(await lireFixtureTexte('revolut-synthetique.csv'));
    egal(rv.format, 'revolut'); egal(rv.resultat.operations.length, 3); vrai(rv.resultat.releves[0].controle.ok);
    egal(rv.resultat.operations[2].montantCentimes, 123456);
    const lcl = analyserCSV(await lireFixtureTexte('lcl-synthetique.csv'));
    egal(lcl.format, 'lcl'); egal(lcl.resultat.operations.length, 3); egal(lcl.resultat.operations[1].montantCentimes, 145020); egal(lcl.resultat.operations[0].sens, 'debit');
    const g = analyserCSV('Jour,Quoi,Somme\n2026-01-02,Boulangerie,-2.40\n');
    egal(g.format, 'generique'); vrai(Array.isArray(g.lignes));
    egal(lireCSV('a;"b;c";d\n').lignes[0][1], 'b;c');
  } },
];
