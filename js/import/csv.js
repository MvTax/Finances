// csv.js — import CSV : Revolut (en-têtes français ou anglais), LCL (séparateur ;) et CSV générique
// avec correspondance des colonnes mémorisée par banque.

import { parseMontant } from '../money.js';
import { parseDateSlash, estIso } from '../dates.js';

/** Découpe un CSV (guillemets, séparateur détecté, retours ligne Windows). */
export function lireCSV(texte, separateur) {
  const t = String(texte).replace(/^﻿/, '');
  const sep = separateur || detecterSeparateur(t);
  const lignes = [];
  let champ = ''; let ligne = []; let guill = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guill) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guill = false;
      else champ += c;
    } else if (c === '"') guill = true;
    else if (c === sep) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ); champ = '';
      if (ligne.some((x) => x.trim() !== '')) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  ligne.push(champ);
  if (ligne.some((x) => x.trim() !== '')) lignes.push(ligne);
  return { separateur: sep, lignes };
}

export function detecterSeparateur(t) {
  const premiere = t.split(/\r?\n/)[0] || '';
  const comptes = [';', ',', '\t'].map((s) => [s, premiere.split(s).length]);
  return comptes.sort((a, b) => b[1] - a[1])[0][0];
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Date ISO depuis « 2026-10-03 14:22:10 », « 03/10/2026 », « 03.10.26 ». */
export function dateCSV(s, format = 'auto') {
  const v = String(s || '').trim();
  if (format === 'AAAA-MM-JJ' || /^\d{4}-\d{2}-\d{2}/.test(v)) { const d = v.slice(0, 10); return estIso(d) ? d : null; }
  if (format === 'MM/JJ/AAAA') { const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? parseDateSlash(`${m[2]}/${m[1]}/${m[3]}`) : null; }
  return parseDateSlash(v.split(' ')[0]);
}

/** Montant CSV selon le séparateur décimal déclaré. */
export function montantCSV(s, decimal = 'auto') {
  let v = String(s || '').trim();
  if (!v) return null;
  if (decimal === ',') v = v.replace(/\./g, '');
  if (decimal === '.') v = v.replace(/,/g, '');
  return parseMontant(v);
}

export function detecterFormat(lignes) {
  const en = (lignes[0] || []).map(norm);
  const a = (n) => en.indexOf(n);
  if (en.includes('started date') || en.includes('completed date')) return { type: 'revolut', langue: 'en', col: { date: a('completed date') >= 0 ? a('completed date') : a('started date'), desc: a('description'), montant: a('amount'), frais: a('fee'), etat: a('state'), solde: a('balance'), type: a('type') } };
  if (en.includes('date de debut') || en.includes('date de fin') || (en.includes('montant') && en.includes('etat') && en.includes('produit'))) return { type: 'revolut', langue: 'fr', col: { date: a('date de fin') >= 0 ? a('date de fin') : a('date de debut'), desc: a('description'), montant: a('montant'), frais: a('frais'), etat: a('etat'), solde: a('solde'), type: a('type') } };
  // LCL : « Date;Montant;Type;…;Libellé… », dates JJ/MM/AAAA, montant signé
  const echantillon = lignes.slice(0, 5);
  if (echantillon.every((l) => /^\d{2}\/\d{2}\/\d{4}$/.test((l[0] || '').trim()) && montantCSV(l[1], ',') !== null)) return { type: 'lcl', col: { date: 0, montant: 1 }, sansEntete: true };
  if (en[0] === 'date' && (en[1] === 'montant' || en.includes('libelle'))) return { type: 'lcl', col: { date: 0, montant: en.indexOf('montant') >= 0 ? en.indexOf('montant') : 1, libelle: en.indexOf('libelle') } };
  return { type: 'generique' };
}

function ops(banque, operations, extra = {}) {
  return { banque, titulaire: null, operations, releves: [{ numero: null, periode: periodeDe(operations), operations, controle: extra.controle || { ok: true, message: 'Pas de solde à contrôler dans ce CSV' } }], erreurs: extra.controle && !extra.controle.ok ? [extra.controle.message] : [], ...extra };
}
function periodeDe(o) { const d = o.map((x) => x.date).sort(); return { debut: d[0] || null, fin: d[d.length - 1] || null }; }

/** Revolut CSV : contrôle solde ligne à ligne quand la colonne « Balance/Solde » existe. */
export function parserRevolutCSV(lignes, f) {
  const c = f.col;
  const operations = [];
  let soldePrec = null; const fausses = [];
  for (const l of lignes.slice(1)) {
    const etatOp = norm(l[c.etat]);
    if (etatOp && !['completed', 'terminee', 'termine', 'effectuee', 'complete'].some((x) => etatOp.startsWith(x))) continue;
    const montant = montantCSV(l[c.montant], '.');
    const frais = c.frais >= 0 ? Math.abs(montantCSV(l[c.frais], '.') || 0) : 0;
    const date = dateCSV(l[c.date]);
    if (montant === null || !date) continue;
    const solde = c.solde >= 0 ? montantCSV(l[c.solde], '.') : null;
    if (soldePrec !== null && solde !== null && soldePrec + montant - frais !== solde) fausses.push({ date, description: l[c.desc], attendu: soldePrec + montant - frais, lu: solde });
    if (solde !== null) soldePrec = solde;
    operations.push({ date, dateComptable: date, description: l[c.desc], libellePrincipal: l[c.desc], libelleBrut: `${l[c.desc]} | ${l[c.type] || ''}`.trim(), categorieRevolut: /topup|recharge/i.test(l[c.type] || '') ? 'Rechargez' : '', sens: montant < 0 ? 'debit' : 'credit', montantCentimes: Math.abs(montant), montantSigne: montant, fraisCentimes: frais });
  }
  const controle = { ok: fausses.length === 0, lignesFausses: fausses, message: fausses.length ? `${fausses.length} solde(s) de ligne incohérent(s)` : 'Soldes de ligne cohérents' };
  return ops('revolut', operations, { controle });
}

export function parserLCLCSV(lignes, f) {
  const corps = f.sansEntete ? lignes : lignes.slice(1);
  const operations = [];
  for (const l of corps) {
    const date = dateCSV(l[f.col.date]);
    const m = montantCSV(l[f.col.montant], ',');
    if (!date || m === null) continue;
    const textes = l.filter((x, i) => i !== f.col.date && i !== f.col.montant && x && x.trim() && montantCSV(x, ',') === null).map((x) => x.trim());
    const libelle = (f.col.libelle >= 0 ? l[f.col.libelle] : textes.join(' ')) || 'Opération';
    operations.push({ date, dateComptable: date, libellePrincipal: libelle.trim(), libelleBrut: textes.join(' | '), lignes: [libelle.trim()], sens: m < 0 ? 'debit' : 'credit', montantCentimes: Math.abs(m) });
  }
  return ops('lcl', operations);
}

/**
 * CSV générique avec correspondance des colonnes.
 * @param {{ date, libelle, montant?, debit?, credit?, formatDate, decimal, entete: bool, banque }} m
 */
export function parserGenerique(lignes, m) {
  const corps = m.entete ? lignes.slice(1) : lignes;
  const operations = [];
  for (const l of corps) {
    const date = dateCSV(l[m.date], m.formatDate);
    if (!date) continue;
    let signe = null;
    if (m.montant !== undefined && m.montant !== null && m.montant !== '') signe = montantCSV(l[m.montant], m.decimal);
    else {
      const d = montantCSV(l[m.debit], m.decimal); const c = montantCSV(l[m.credit], m.decimal);
      signe = (c ? Math.abs(c) : 0) - (d ? Math.abs(d) : 0);
    }
    if (signe === null || signe === 0) continue;
    const libelle = String(l[m.libelle] || 'Opération').trim();
    operations.push({ date, dateComptable: date, libellePrincipal: libelle, libelleBrut: libelle, lignes: [libelle], sens: signe < 0 ? 'debit' : 'credit', montantCentimes: Math.abs(signe) });
  }
  return ops(m.banque || 'autre', operations);
}

/** Point d'entrée : renvoie { format, resultat } ou { format: 'generique', lignes } pour l'écran de correspondance. */
export function analyserCSV(texte, mappingsMemorises = {}) {
  const { lignes, separateur } = lireCSV(texte);
  if (!lignes.length) throw new Error('Fichier CSV vide.');
  const f = detecterFormat(lignes);
  if (f.type === 'revolut') return { format: 'revolut', resultat: parserRevolutCSV(lignes, f) };
  if (f.type === 'lcl') return { format: 'lcl', resultat: parserLCLCSV(lignes, f) };
  const cle = (lignes[0] || []).map(norm).join('|');
  if (mappingsMemorises[cle]) return { format: 'generique', resultat: parserGenerique(lignes, mappingsMemorises[cle]), cle };
  return { format: 'generique', lignes, separateur, cle };
}
