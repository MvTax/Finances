// lcl-pdf.js — parseur local des relevés mensuels LCL (PDF « RELEVE DE COMPTE »).
//
// Entrée : pages issues de pdf-loader.js → [{ numero, largeur, hauteur, items: [{ str, x, y, w }] }]
// (y mesuré depuis le HAUT de la page). Les items de la couche texte ne sont pas dans l'ordre de
// lecture : on reconstitue les lignes par ordonnée, on affecte chaque montant à sa colonne par
// abscisse (positions des en-têtes DÉBIT / CRÉDIT de la page) et on rattache les lignes de
// continuation au libellé précédent.
//
// Contrôle obligatoire (précision 5) : la ligne TOTAUX inclut l'ancien solde dans la colonne
// où il est imprimé (crédit s'il est créditeur, débit s'il est débiteur). Le SOLDE EN EUROS est
// négatif lorsqu'il est imprimé dans la colonne débit.

import { parseMontant } from '../money.js';
import { parseDateLCL, parseDatePointee, parseDateSlash } from '../dates.js';

const RE_MONTANT = /^\d{1,3}(?:[   ]\d{3})*,\d{2}$/;
const RE_DATE_OP = /^\d{2}\.\d{2}$/;
const RE_DATE_VALEUR = /^\d{2}\.\d{2}\.\d{2}$/;
const RE_PERIODE = /du (\d{2}\.\d{2}\.\d{4}) au (\d{2}\.\d{2}\.\d{4})(?:\s*-\s*N°\s*(\d+))?/;
const RE_OPTION_SE = /^OPTION SYSTEM'?\s?EPARGNE\s+(\d+,\d{2})$/i;
const TOLERANCE_Y = 2.2;

/** Indique si les pages ressemblent à un relevé LCL. */
export function estReleveLCL(pages) {
  const texte = pages.slice(0, 2).flatMap((p) => p.items.map((i) => i.str)).join(' ');
  return /RELEVE DE COMPTE/.test(texte) && RE_PERIODE.test(texte) && /(LCL|Cr[ée]dit Lyonnais|CREDIT LYONNAIS)/i.test(texte);
}

function regrouperLignes(items) {
  const tries = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lignes = [];
  for (const it of tries) {
    const derniere = lignes[lignes.length - 1];
    if (derniere && Math.abs(derniere.y - it.y) <= TOLERANCE_Y) derniere.items.push(it);
    else lignes.push({ y: it.y, items: [it] });
  }
  for (const l of lignes) l.items.sort((a, b) => a.x - b.x);
  return lignes;
}

function trouverEnTete(lignes) {
  for (const l of lignes) {
    const s = (t) => l.items.find((i) => i.str.trim() === t);
    const date = s('DATE'); const valeur = s('VALEUR'); const debit = s('DEBIT'); const credit = s('CREDIT');
    if (date && valeur && debit && credit) {
      return {
        y: l.y,
        dateFin: date.x + date.w + 5,
        valeurX: valeur.x,
        montantsX: debit.x - 45,
        milieu: (debit.x + debit.w / 2 + credit.x + credit.w / 2) / 2,
      };
    }
  }
  return null;
}

/**
 * Analyse un PDF LCL (une ou plusieurs périodes concaténées).
 * @returns {{ banque: 'lcl', releves: Array, operations: Array, erreurs: string[] }}
 */
export function parserLCL(pages) {
  const releves = [];
  const erreurs = [];
  let releve = null;
  let opCourante = null;

  const nouveauReleve = (m) => {
    const r = {
      cle: `${m[1]}-${m[2]}`,
      periode: { debut: parseDatePointee(m[1]), fin: parseDatePointee(m[2]) },
      numero: m[3] ? Number(m[3]) : null,
      ancienSolde: null,
      soldesIntermediaires: [],
      totaux: null,
      soldeFinal: null,
      operations: [],
      anomalies: [],
      termine: false,
    };
    releves.push(r);
    return r;
  };

  for (const page of pages) {
    const lignes = regrouperLignes(page.items);
    // Période imprimée en haut de chaque page
    const ligPeriode = lignes.find((l) => RE_PERIODE.test(l.items.map((i) => i.str).join(' ')));
    if (ligPeriode) {
      const m = ligPeriode.items.map((i) => i.str).join(' ').match(RE_PERIODE);
      const cle = `${m[1]}-${m[2]}`;
      if (!releve || releve.cle !== cle) { releve = releves.find((r) => r.cle === cle) || nouveauReleve(m); opCourante = null; }
    }
    if (!releve || releve.termine) continue;
    const entete = trouverEnTete(lignes);
    if (!entete) continue;
    const yPied = Math.min(
      ...lignes.filter((l) => l.items.some((i) => /^Page \d+ \/ \d+$/.test(i.str.trim()) || /capital de .* euros/i.test(i.str))).map((l) => l.y),
      page.hauteur || 1e9,
    );
    let dernierY = entete.y;

    for (const ligne of lignes) {
      if (ligne.y <= entete.y + 1 || ligne.y >= yPied - 1) continue;
      if (releve.termine) break;
      const dateIt = ligne.items.find((i) => i.x < entete.dateFin && RE_DATE_OP.test(i.str.trim()));
      const textes = ligne.items.filter((i) => i !== dateIt && i.x >= entete.dateFin - 2 && i.x < entete.valeurX - 3);
      const valeurIt = ligne.items.find((i) => i.x >= entete.valeurX - 12 && i.x < entete.montantsX && RE_DATE_VALEUR.test(i.str.trim()));
      const montants = ligne.items
        .filter((i) => i.x >= entete.montantsX && RE_MONTANT.test(i.str.trim()))
        .map((i) => ({ centimes: parseMontant(i.str), colonne: i.x + i.w / 2 < entete.milieu ? 'debit' : 'credit' }));
      const texte = textes.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
      const T = texte.toUpperCase();

      if (/^ANCIEN SOLDE$/.test(T)) {
        const mt = montants[0];
        if (mt) releve.ancienSolde = { centimes: mt.colonne === 'credit' ? mt.centimes : -mt.centimes, colonne: mt.colonne, date: dateIt ? parseDateLCL(dateIt.str.trim(), releve.periode.fin) : null };
        opCourante = null; dernierY = ligne.y; continue;
      }
      if (/^SOLDE INTERMEDIAIRE/.test(T)) {
        const mt = montants[0];
        if (mt) releve.soldesIntermediaires.push({ libelle: texte, centimes: mt.colonne === 'credit' ? mt.centimes : -mt.centimes });
        opCourante = null; dernierY = ligne.y; continue;
      }
      if (/^TOTAUX$/.test(T)) {
        const d = montants.find((m) => m.colonne === 'debit');
        const c = montants.find((m) => m.colonne === 'credit');
        releve.totaux = { debit: d ? d.centimes : 0, credit: c ? c.centimes : 0 };
        opCourante = null; dernierY = ligne.y; continue;
      }
      if (/^SOLDE EN EUROS$/.test(T)) {
        const mt = montants[0];
        if (mt) releve.soldeFinal = { centimes: mt.colonne === 'credit' ? mt.centimes : -mt.centimes, colonne: mt.colonne, date: dateIt ? parseDateLCL(dateIt.str.trim(), releve.periode.fin) : releve.periode.fin };
        releve.termine = true; opCourante = null; continue;
      }

      if (dateIt && texte) {
        const dateComptable = parseDateLCL(dateIt.str.trim(), releve.periode.fin);
        const op = {
          dateComptable,
          dateValeur: valeurIt ? parseDateSlash(valeurIt.str.trim()) : null,
          lignes: [texte],
          debitCentimes: 0,
          creditCentimes: 0,
          optionSystemEpargneCentimes: 0,
          page: page.numero,
        };
        if (montants.length === 0) releve.anomalies.push({ page: page.numero, texte, raison: 'Montant introuvable' });
        if (montants.length > 1) releve.anomalies.push({ page: page.numero, texte, raison: 'Plusieurs montants sur la ligne' });
        for (const m of montants) { if (m.colonne === 'debit') op.debitCentimes += m.centimes; else op.creditCentimes += m.centimes; }
        releve.operations.push(op);
        opCourante = op;
        dernierY = ligne.y;
        continue;
      }

      if (!dateIt && texte && opCourante && ligne.y - dernierY < 20) {
        const mo = texte.match(RE_OPTION_SE);
        if (mo) opCourante.optionSystemEpargneCentimes += parseMontant(mo[1]);
        else opCourante.lignes.push(texte);
        if (montants.length) releve.anomalies.push({ page: page.numero, texte, raison: 'Montant sur une ligne de continuation' });
        dernierY = ligne.y;
        continue;
      }
      if (montants.length) releve.anomalies.push({ page: page.numero, texte: texte || '(sans libellé)', raison: 'Montant isolé non rattaché' });
    }
  }

  const operations = [];
  const titulaire = extraireTitulaireLCL(pages);
  for (const r of releves) {
    r.controle = controlerReleve(r);
    if (!r.controle.ok) erreurs.push(`Relevé ${r.numero ?? ''} (${r.periode.debut} → ${r.periode.fin}) : ${r.controle.message}`);
    r.operations = r.operations.map((op) => finaliserOperation(op, r));
    operations.push(...r.operations);
    delete r.termine;
  }
  return { banque: 'lcl', titulaire, releves, operations, erreurs };
}

function finaliserOperation(op, releve) {
  const principal = op.lignes[0];
  const mAchat = principal.match(/^(.*?)\s+(\d{2}\/\d{2}\/\d{2})$/);
  const dateAchat = mAchat ? parseDateSlash(mAchat[2]) : null;
  const sens = op.creditCentimes > 0 && op.debitCentimes === 0 ? 'credit' : 'debit';
  const montant = sens === 'credit' ? op.creditCentimes : op.debitCentimes;
  const estCarte = /^CB\s/.test(principal);
  return {
    banque: 'lcl',
    releve: releve.numero,
    page: op.page,
    dateComptable: op.dateComptable,
    dateValeur: op.dateValeur,
    dateAchat,
    // La date d'achat réelle (dans le libellé) est préférée pour l'analyse ; elle ne peut pas être après la date comptable.
    date: dateAchat && dateAchat <= op.dateComptable ? dateAchat : op.dateComptable,
    libellePrincipal: mAchat ? mAchat[1] : principal,
    lignes: op.lignes,
    libelleBrut: op.lignes.join(' | '),
    sens,
    montantCentimes: montant,
    optionSystemEpargneCentimes: op.optionSystemEpargneCentimes,
    estAvoirCarte: estCarte && sens === 'credit',
  };
}

/** Réconciliation d'un relevé : TOTAUX et SOLDE EN EUROS au centime. */
export function controlerReleve(r) {
  let sommeDebits = 0;
  let sommeCredits = 0;
  for (const op of r.operations) { sommeDebits += op.debitCentimes ?? (op.sens === 'debit' ? op.montantCentimes : 0); sommeCredits += op.creditCentimes ?? (op.sens === 'credit' ? op.montantCentimes : 0); }
  const res = { ok: false, sommeDebits, sommeCredits, ecartDebit: null, ecartCredit: null, ecartSolde: null, message: '' };
  if (!r.ancienSolde) { res.message = 'ANCIEN SOLDE introuvable'; return res; }
  if (!r.totaux) { res.message = 'Ligne TOTAUX introuvable'; return res; }
  if (!r.soldeFinal) { res.message = 'SOLDE EN EUROS introuvable'; return res; }
  const A = r.ancienSolde.centimes;
  const attenduDebit = sommeDebits + (A < 0 ? -A : 0);
  const attenduCredit = sommeCredits + (A >= 0 ? A : 0);
  res.ecartDebit = r.totaux.debit - attenduDebit;
  res.ecartCredit = r.totaux.credit - attenduCredit;
  res.ecartSolde = r.soldeFinal.centimes - (A + sommeCredits - sommeDebits);
  res.ok = res.ecartDebit === 0 && res.ecartCredit === 0 && res.ecartSolde === 0 && r.anomalies.length === 0;
  res.message = res.ok ? 'Réconcilié au centime' :
    [res.ecartDebit ? `écart débits ${res.ecartDebit / 100} €` : '', res.ecartCredit ? `écart crédits ${res.ecartCredit / 100} €` : '', res.ecartSolde ? `écart solde ${res.ecartSolde / 100} €` : '', r.anomalies.length ? `${r.anomalies.length} ligne(s) suspecte(s)` : ''].filter(Boolean).join(', ');
  return res;
}

/** Nom du titulaire imprimé au-dessus de « Indicatif : » (sert à reconnaître les virements à soi-même). */
export function extraireTitulaireLCL(pages) {
  for (const page of pages.slice(0, 4)) {
    const ind = page.items.find((i) => /^Indicatif\s*:/.test(i.str.trim()));
    if (!ind) continue;
    const cand = page.items
      .filter((i) => i.y < ind.y - 2 && i.y > ind.y - 20 && Math.abs(i.x - ind.x) < 15)
      .sort((a, b) => b.y - a.y)[0];
    if (cand && /^[A-ZÀ-Ü.' -]{4,}$/.test(cand.str.trim())) return cand.str.trim();
  }
  return null;
}
