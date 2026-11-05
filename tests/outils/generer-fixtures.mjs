// generer-fixtures.mjs — produit les fixtures SYNTHÉTIQUES (noms, montants, dates et références inventés)
// qui reproduisent les pièges de format des relevés LCL et Revolut. Usage : node tests/outils/generer-fixtures.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirePDF, largeur } from './pdf-minimal.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, '..', 'fixtures');
mkdirSync(SORTIE, { recursive: true });

const fmt = (c) => { const a = Math.abs(c); const e = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return `${e},${String(a % 100).padStart(2, '0')}`; };

// ----------------------------------------------------------------------------- LCL
const X = { date: 42.5, lib: 74.8, cont: 80.8, valeur: 365.6, debitD: 480.6, creditD: 558.6, ancien: 286.1 };
const PAS = 11.95;

function entete(periode, numero, page, total) {
  return [
    { x: 131.8, y: 66.3, texte: 'RELEVE DE COMPTE', taille: 12 },
    { x: 391, y: 97.4, texte: `du ${periode[0]} au ${periode[1]} - N° ${numero}` },
    { x: 38.9, y: 121.3, texte: 'M. DURAND ALEX' },
    { x: 38.9, y: 133.2, texte: 'Indicatif :' }, { x: 77.2, y: 133.2, texte: '9999' }, { x: 137.8, y: 133.2, texte: 'Compte : 00000 X' },
    { x: 400, y: 121.3, texte: 'CREDIT LYONNAIS' },
    { x: 44.9, y: 169.1, texte: 'ECRITURES DE LA PERIODE' },
    { x: 41.6, y: 193, texte: 'DATE' }, { x: 197.1, y: 193, texte: 'LIBELLE' }, { x: 364.8, y: 193, texte: 'VALEUR' }, { x: 432.8, y: 193, texte: 'DEBIT' }, { x: 504.4, y: 193, texte: 'CREDIT' },
    { x: 524, y: 827, texte: `Page ${page} / ${total}` },
    { x: 35.9, y: 839, texte: 'Banque Exemple-SA au capital de 1 000 euros - RCS Exemple', taille: 7 },
  ];
}

/** Un relevé : { periode: ['01.01.2026','30.01.2026'], numero, ancien: { date, centimes }, ops: [{ date, lignes, valeur, debit|credit, option }] } */
function lignesReleve(r) {
  const fin = r.periode[1];
  const lignes = [];
  lignes.push([{ x: X.date, texte: r.ancien.date }, { x: X.ancien, texte: 'ANCIEN SOLDE' }, r.ancien.centimes >= 0 ? { x: X.creditD, texte: fmt(r.ancien.centimes), droite: true } : { x: X.debitD, texte: fmt(r.ancien.centimes), droite: true }]);
  let sd = 0; let sc = 0;
  for (const op of r.ops) {
    const montant = op.debit ? { x: X.debitD, texte: fmt(op.debit), droite: true } : { x: X.creditD, texte: fmt(op.credit), droite: true };
    const point = op.point ? (op.debit ? { x: 556.8, texte: '.' } : { x: 470, texte: '.' }) : null;
    lignes.push([{ x: X.date, texte: op.date }, { x: X.lib, texte: op.lignes[0] }, { x: X.valeur, texte: op.valeur || `${op.date}.${fin.slice(-2)}` }, montant, point].filter(Boolean));
    for (const c of op.lignes.slice(1)) lignes.push(Array.isArray(c) ? c : [{ x: X.cont, texte: c }]);
    if (op.option) lignes.push([{ x: X.cont, texte: `OPTION SYSTEM'EPARGNE ${fmt(op.option)}` }]);
    if (op.debit) sd += op.debit; else sc += op.credit;
    if (op.parasite) lignes.push([{ x: 540, texte: 'Q7XZT42A' }]);
  }
  const A = r.ancien.centimes;
  const totD = sd + (A < 0 ? -A : 0); const totC = sc + (A >= 0 ? A : 0);
  const solde = A + sc - sd;
  lignes.push([]);
  lignes.push([{ x: 316.5, texte: 'TOTAUX' }, { x: X.debitD, texte: fmt(totD), droite: true }, { x: X.creditD, texte: fmt(totC), droite: true }]);
  lignes.push([{ x: 41.9, texte: fin.slice(0, 5) }, { x: 273.5, texte: 'SOLDE EN EUROS' }, solde >= 0 ? { x: X.creditD, texte: fmt(solde), droite: true } : { x: X.debitD, texte: fmt(solde), droite: true }]);
  lignes.push([]);
  // Encadrés d'information après le solde : à ignorer
  lignes.push([{ x: 41.9, texte: 'INFORMATION PREALABLE SUR LES FRAIS D\'INCIDENTS DE FONCTIONNEMENT' }]);
  lignes.push([{ x: 41.9, texte: '01 Commission(s) d\'intervention' }, { x: 465.7, texte: '8,00' }]);
  lignes.push([{ x: 41.9, texte: 'CARTES ET ESPECES' }, { x: 465.7, texte: '2,00' }]);
  return { lignes, attendu: { debits: sd, credits: sc, totD, totC, solde, nbOps: r.ops.length } };
}

function paginer(releves) {
  const pages = [];
  const attendus = [];
  for (const r of releves) {
    const { lignes, attendu } = lignesReleve(r);
    attendus.push({ numero: r.numero, ...attendu });
    const parPage = 40;
    const nbPages = Math.ceil(lignes.length / parPage);
    for (let p = 0; p < nbPages; p++) {
      const items = entete(r.periode, r.numero, p + 1, nbPages);
      lignes.slice(p * parPage, (p + 1) * parPage).forEach((l, i) => { for (const it of l) items.push({ ...it, y: 216.9 + i * PAS }); });
      pages.push(items);
    }
  }
  return { pages, attendus };
}

const cb = (nom, achat, montant, opts = {}) => ({ date: opts.date || achat.slice(0, 5).replace('/', '.'), lignes: [`CB ${nom} ${achat}`, ...(opts.suite || [])], debit: montant, option: opts.option, point: opts.point });

const decembre = {
  periode: ['01.12.2025', '31.12.2025'], numero: 12, ancien: { date: '30.11', centimes: 15000 },
  ops: [
    cb('MCDONALDS', '30/11/25', 930, { date: '01.12', option: 70 }),
    cb('UBR* PENDING.UBE', '01/12/25', 834, { date: '02.12', suite: [[{ x: X.cont, texte: 'AMSTERDAM' }, { x: 145.3, texte: 'EUR' }, { x: 182.2, texte: '8,34' }]], option: 66 }),
    { date: '03.12', lignes: ['VIREMENT SOCIETE EXEMPLE SARL', 'LIBELLE:Paie 07-2019', 'REF.CLIENT:EXEMPLE-0001'], credit: 145020 },
    { date: '03.12', lignes: ['VIREMENT CAF DU TERRITOIRE', 'LIBELLE:0000000XDURAND 112025ME'], credit: 9550 },
    { date: '05.12', lignes: ['PRLV SEPA LOGEMENT EXEMPLE', 'REF.CLIENT:PRV 000'], debit: 31250 },
    cb('Revolut**1111*', '04/12/25', 1400, { date: '05.12', suite: ['PAIEMENT A Alex Durand'] }),
    { date: '06.12', lignes: ['VIR SEPA M ALEX DURAND'], debit: 20000 },
    cb('DISTRIB*SCAFE', '06/12/25', 120, { date: '07.12', suite: [[{ x: X.cont, texte: 'Paris' }, { x: 125.8, texte: 'EUR' }, { x: 162.7, texte: '1,20' }]], option: 80 }),
    cb('LIDL 1234', '08/12/25', 123456, { date: '09.12' }),
    { date: '10.12', lignes: ['VIREMENT M ALEX DURAND', 'REF.CLIENT:NOTPROVIDED', 'NATURE DU PAIEMENT:SAVG'], credit: 5000, parasite: true },
    { date: '12.12', lignes: ['CB UBER 11/12/25', 'CREDIT EUR 1,88 AMSTERDAM', 'CREDIT'], credit: 188, point: true },
    cb('UBER *TRIP', '11/12/25', 188, { date: '12.12' }),
    { date: '15.12', lignes: ['TOTAL OPTION SYSTEM\' EPARGNE', 'CARTE N 0000 DU 01/12 AU 15/12'], debit: 216 },
    { date: '18.12', lignes: ['VIR INST Alex Durand', 'LIBELLE:Envoye depuis Revolut', 'REF.CLIENT:NOTPROVIDED'], credit: 500 },
    { date: '22.12', lignes: ['ECHEANCE PRET PERSONNEL 221225', '000000000PP000'], debit: 1485 },
    { date: '27.12', lignes: ['COTISATION MENSUELLE CARTE 0000'], debit: 200, point: true },
    { date: '31.12', lignes: ['VIR INST MME JEANNE EXEMPLE', 'LIBELLE:Remboursement'], credit: 3000 },
  ],
};
// Relevé de janvier : ANCIEN SOLDE daté du 31.12 (année précédente) et solde final NÉGATIF (colonne débit)
const janvier = {
  periode: ['01.01.2026', '30.01.2026'], numero: 13, ancien: { date: '31.12', centimes: 0 },
  ops: [
    { date: '02.01', lignes: ['VIREMENT SOCIETE EXEMPLE SARL', 'LIBELLE:Paie 07-2019'], credit: 139990 },
    { date: '05.01', lignes: ['PRLV SEPA LOGEMENT EXEMPLE'], debit: 30010 },
    { date: '06.01', lignes: ['CREDIT INSTANT ECH 260106', '000AbCdEfGhIj'], debit: 33400, point: true },
    { date: '08.01', lignes: ['CB RETRAIT DU 07/01', 'VILLE EXEMPLE', 'FRAIS RETRAIT DAB UE 1,50 EUR'], debit: 101500 },
    cb('BOLT.EUO26010422', '09/01/26', 1060, { date: '10.01', option: 40 }),
    { date: '20.01', lignes: ['Total Incidents Fonctionnement', 'Periode du 19/11 au 18/12'], debit: 1600 },
    { date: '22.01', lignes: ['ECHEANCE PRET PERSONNEL 220126'], debit: 1485 },
  ],
};
// Relevé de février : ANCIEN SOLDE DÉBITEUR (inclus dans la colonne débit des TOTAUX), solde final positif
const totJanv = (() => { const a = 0; let s = a; for (const o of janvier.ops) s += (o.credit || 0) - (o.debit || 0); return s; })();
const fevrier = {
  periode: ['31.01.2026', '27.02.2026'], numero: 14, ancien: { date: '30.01', centimes: totJanv },
  ops: [
    { date: '03.02', lignes: ['VIREMENT SOCIETE EXEMPLE SARL', 'LIBELLE:Paie 07-2019'], credit: 152345 },
    { date: '05.02', lignes: ['PRLV SEPA LOGEMENT EXEMPLE'], debit: 29999 },
    cb('MCDONALD\'S', '06/02/26', 1645, { date: '07.02', option: 55 }),
  ],
};

const annee = paginer([decembre, janvier, fevrier]);
writeFileSync(join(SORTIE, 'lcl-synthetique-annee.pdf'), construirePDF(annee.pages));
const seul = paginer([janvier]);
writeFileSync(join(SORTIE, 'lcl-synthetique-negatif.pdf'), construirePDF(seul.pages));

// ----------------------------------------------------------------------------- Revolut
const RX = { date: 39.7, desc: 124.8, cat: 257.7, argent: 342.9, solde: 385.4, impot: 427.9, autres: 470.5, frais: 534.0 };
const eur = (c) => `${c < 0 ? '-' : ''}${fmt(c)}€`;
function enteteRevolut() {
  return [
    { x: 372.8, y: 85, texte: 'Relevé personnalisé', taille: 14 },
    { x: 461.9, y: 98.2, texte: '1 déc. 2025 - 31 janv. 2026', taille: 7 },
    { x: 476.5, y: 110.5, texte: 'Généré le 2 févr. 2026', taille: 7 },
  ];
}
const opsRevolut = [
  ['3 déc. 2025', ['Recharge sur Apple Pay via *2222'], 'Rechargez', 1400],
  ['3 déc. 2025', ['Virement à : JEANNE EXEMPLE'], 'Autres', -1400],
  ['5 déc. 2025', ['Paiement envoyé par M ALEX', 'DURAND'], 'Rechargez', 1400],
  ['5 déc. 2025', ['To Paul Exemple'], 'Autres', -1400],
  ['10 déc. 2025', ['Uber Eats'], 'Commerçant', -1299],
  ['10 déc. 2025', ['Recharge sur Apple Pay via *2222'], 'Rechargez', 20000],
  ['18 déc. 2025', ['To Moi LCL'], 'Autres', -500],
  ['20 déc. 2025', ['Virement à : PRENOMLONG EXEMPLE-LONGNOM Autres'], '', -2500],
  ['2 janv. 2026', ['Virement de : LUC EXEMPLE'], 'Autres', 750],
  ['15 janv. 2026', ['Amazon'], 'Commerçant', -1234],
];
let soldeR = 0;
const lignesR = opsRevolut.map(([d, desc, cat, m]) => { soldeR += m; return { d, desc, cat, m, solde: soldeR }; });
const p1 = [...enteteRevolut(),
  { x: 39.7, y: 150, texte: 'ALEX DURAND', taille: 10 }, { x: 39.7, y: 162, texte: '1 rue Exemple', taille: 9 },
  { x: 301.4, y: 587.2, texte: "Solde d'ouverture" }, { x: 480, y: 587.2, texte: eur(0) },
  { x: 301.4, y: 606, texte: 'Solde de clôture' }, { x: 480, y: 606, texte: eur(soldeR) },
  { x: 39.7, y: 700, texte: 'Revolut Bank UAB (établissement de crédit, données fictives pour les tests)', taille: 7 }];
const p2 = [...enteteRevolut(),
  { x: 39.7, y: 227.7, texte: 'Relevé des transactions' },
  { x: 342.9, y: 245.6, texte: 'Argent' }, { x: 427.9, y: 251.8, texte: 'Impôt' }, { x: 470.5, y: 251.8, texte: 'Autres' },
  { x: 39.7, y: 258, texte: 'Date' }, { x: 124.8, y: 258, texte: 'Description' }, { x: 257.7, y: 258, texte: 'Catégorie' }, { x: 342.9, y: 258, texte: 'entrant' }, { x: 385.4, y: 258, texte: 'Solde' }, { x: 536, y: 258, texte: 'Frais' },
  { x: 427.9, y: 264.2, texte: 'retenu' }, { x: 470.5, y: 264.2, texte: 'taxes' }, { x: 342.9, y: 270.3, texte: '/sortant' }];
let y = 289.5;
for (const l of lignesR) {
  p2.push({ x: RX.date, y, texte: l.d }, { x: RX.desc, y, texte: l.desc[0] }, ...(l.cat ? [{ x: RX.cat, y, texte: l.cat }] : []), { x: RX.argent, y, texte: eur(l.m) }, { x: RX.solde, y, texte: eur(l.solde) }, { x: RX.impot, y, texte: eur(0) }, { x: RX.autres, y, texte: eur(0) }, { x: RX.frais, y, texte: eur(0) });
  if (l.desc[1]) p2.push({ x: RX.desc, y: y + 12.3, texte: l.desc[1] });
  y += 31.1;
}
p2.push({ x: RX.date, y: y + 10, texte: 'Total' }, { x: RX.argent, y: y + 10, texte: eur(soldeR) }, { x: RX.impot, y: y + 10, texte: eur(0) });
writeFileSync(join(SORTIE, 'revolut-synthetique.pdf'), construirePDF([p1, p2]));

// ----------------------------------------------------------------------------- CSV
writeFileSync(join(SORTIE, 'revolut-synthetique.csv'), [
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
  'TOPUP,Current,2026-01-03 10:00:00,2026-01-03 10:00:01,Apple Pay Top-Up by *2222,14.00,0.00,EUR,COMPLETED,14.00',
  'TRANSFER,Current,2026-01-03 10:02:00,2026-01-03 10:02:01,To JEANNE EXEMPLE,-14.00,0.00,EUR,COMPLETED,0.00',
  'CARD_PAYMENT,Current,2026-01-04 12:00:00,2026-01-04 12:00:05,Uber Eats,-12.50,0.00,EUR,REVERTED,',
  'TOPUP,Current,2026-01-05 09:00:00,2026-01-05 09:00:01,"Apple Pay Top-Up by *2222",1234.56,0.00,EUR,COMPLETED,1234.56',
].join('\n') + '\n');
writeFileSync(join(SORTIE, 'lcl-synthetique.csv'), [
  '02/01/2026;-12,50;Carte;CB EXEMPLE BOULANGERIE 01/01/26;;',
  '03/01/2026;1 450,20;Virement;VIREMENT SOCIETE EXEMPLE SARL;Paie;',
  '05/01/2026;-312,50;Prélèvement;PRLV SEPA LOGEMENT EXEMPLE;;',
].join('\r\n') + '\r\n');

writeFileSync(join(SORTIE, 'attendus.json'), JSON.stringify({ annee: annee.attendus, negatif: seul.attendus, revolut: { nbOps: lignesR.length, cloture: soldeR } }, null, 2) + '\n');
console.log('Fixtures synthétiques écrites dans', SORTIE);
