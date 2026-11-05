// revolut-pdf.js — parseur local du « Relevé personnalisé » Revolut (PDF, en français).
// Colonnes : Date | Description (1 ou 2 lignes) | Catégorie | Argent entrant/sortant (signé) | Solde |
// Impôt retenu | Autres taxes | Frais. Les positions des colonnes sont relues sur chaque page.
// Contrôle obligatoire : solde recalculé ligne à ligne = colonne Solde, solde final = « Solde de clôture ».

import { parseMontant } from '../money.js';
import { parseDateRevolut } from '../dates.js';

const RE_DATE = /^\d{1,2}\s+[a-zA-Zéèûôà]+\.?\s+\d{4}$/;
const RE_MONTANT = /^[-+−]?\d{1,3}(?:[   ]\d{3})*,\d{2}\s?€$/;
const TOLERANCE_Y = 2.5;

export function estReleveRevolut(pages) {
  const texte = pages.slice(0, 3).flatMap((p) => p.items.map((i) => i.str)).join(' ');
  return /Revolut/i.test(texte) && /(Relevé|Solde de clôture|Relevé des transactions)/i.test(texte);
}

function regrouperLignes(items) {
  const tries = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lignes = [];
  for (const it of tries) {
    const d = lignes[lignes.length - 1];
    if (d && Math.abs(d.y - it.y) <= TOLERANCE_Y) d.items.push(it); else lignes.push({ y: it.y, items: [it] });
  }
  for (const l of lignes) l.items.sort((a, b) => a.x - b.x);
  return lignes;
}

function trouverColonnes(lignes) {
  // Les en-têtes sont sur plusieurs lignes (« Argent / entrant / /sortant ») : on cherche la ligne « Date … Description … Solde ».
  for (let k = 0; k < lignes.length; k++) {
    const l = lignes[k];
    const get = (t) => l.items.find((i) => i.str.trim() === t);
    const date = get('Date'); const desc = get('Description'); const cat = get('Catégorie'); const solde = get('Solde');
    if (date && desc && cat && solde) {
      const voisins = lignes.slice(Math.max(0, k - 3), k + 4).flatMap((x) => x.items);
      const argent = voisins.find((i) => /^(Argent|entrant|\/sortant)$/.test(i.str.trim()));
      const impot = voisins.find((i) => /^Impôt$/.test(i.str.trim()));
      const yFin = Math.max(...lignes.slice(k, k + 4).filter((x) => x.items.some((i) => /^(\/sortant|taxes|retenu)$/.test(i.str.trim()))).map((x) => x.y), l.y);
      return {
        y: yFin,
        date: date.x, description: desc.x, categorie: cat.x,
        argent: argent ? argent.x : cat.x + 80,
        solde: solde.x,
        impot: impot ? impot.x : solde.x + 40,
      };
    }
  }
  return null;
}

export function parserRevolut(pages) {
  const operations = [];
  const anomalies = [];
  let soldeOuverture = null;
  let soldeCloture = null;
  let totalLigne = null;
  let periode = null;
  let courant = null;
  let colonnes = null;

  // Récapitulatif (première(s) page(s))
  for (const page of pages) {
    for (const l of regrouperLignes(page.items)) {
      const txt = l.items.map((i) => i.str.trim()).join(' ');
      const mo = txt.match(/Solde d'ouverture\s+([-−]?[\d   ]+,\d{2})\s?€/);
      if (mo && soldeOuverture === null) soldeOuverture = parseMontant(mo[1]);
      const mc = txt.match(/Solde de clôture\s+([-−]?[\d   ]+,\d{2})\s?€/);
      if (mc && soldeCloture === null) soldeCloture = parseMontant(mc[1]);
      const mp = txt.match(/^(\d{1,2} [a-zéû]+\.? \d{4}) - (\d{1,2} [a-zéû]+\.? \d{4})$/);
      if (mp && !periode) periode = { debut: parseDateRevolut(mp[1]), fin: parseDateRevolut(mp[2]) };
    }
    if (soldeOuverture !== null && soldeCloture !== null && periode) break;
  }

  for (const page of pages) {
    const lignes = regrouperLignes(page.items);
    const c = trouverColonnes(lignes);
    if (!c) continue;
    colonnes = c;
    let dernierY = c.y;
    for (const ligne of lignes) {
      if (ligne.y <= c.y + 1) continue;
      const premier = ligne.items[0];
      if (premier && /^Total$/.test(premier.str.trim()) && premier.x < c.description) {
        const m = ligne.items.find((i) => i.x >= c.argent - 3 && i.x < c.solde - 3 && RE_MONTANT.test(i.str.trim()));
        if (m) totalLigne = parseMontant(m.str);
        courant = null;
        continue;
      }
      const dateIt = ligne.items.find((i) => i.x < c.description - 3 && RE_DATE.test(i.str.trim()));
      const desc = ligne.items.filter((i) => i.x >= c.description - 3 && i.x < c.categorie - 3).map((i) => i.str.trim()).join(' ').trim();
      const cat = ligne.items.filter((i) => i.x >= c.categorie - 3 && i.x < c.argent - 3).map((i) => i.str.trim()).join(' ').trim();
      const montantIt = ligne.items.find((i) => i.x >= c.argent - 3 && i.x < c.solde - 3 && RE_MONTANT.test(i.str.trim()));
      const soldeIt = ligne.items.find((i) => i.x >= c.solde - 3 && i.x < c.impot - 3 && RE_MONTANT.test(i.str.trim()));
      const fraisIts = ligne.items.filter((i) => i.x >= c.impot - 3 && RE_MONTANT.test(i.str.trim()));

      if (dateIt) {
        const date = parseDateRevolut(dateIt.str.trim());
        if (!date || !montantIt) { anomalies.push({ page: page.numero, texte: ligne.items.map((i) => i.str).join(' '), raison: 'Ligne datée sans montant' }); courant = null; continue; }
        const signe = parseMontant(montantIt.str);
        const frais = fraisIts.reduce((s, i) => s + Math.abs(parseMontant(i.str) || 0), 0);
        courant = {
          banque: 'revolut',
          page: page.numero,
          date,
          dateComptable: date,
          description: desc,
          categorieRevolut: cat,
          sens: signe < 0 ? 'debit' : 'credit',
          montantCentimes: Math.abs(signe),
          montantSigne: signe,
          soldeApres: soldeIt ? parseMontant(soldeIt.str) : null,
          fraisCentimes: frais,
        };
        operations.push(courant);
        dernierY = ligne.y;
        continue;
      }
      if (courant && desc && !montantIt && ligne.y - dernierY < 18) {
        courant.description = (courant.description + ' ' + desc).replace(/\s+/g, ' ').trim();
        dernierY = ligne.y;
        continue;
      }
      if (montantIt) anomalies.push({ page: page.numero, texte: ligne.items.map((i) => i.str).join(' '), raison: 'Montant non rattaché' });
    }
    courant = null;
  }

  for (const op of operations) {
    // Description trop longue : le PDF fusionne parfois la catégorie dans le même item de texte.
    if (!op.categorieRevolut) {
      const m = op.description.match(/^(.*\S)\s+(Autres|Commerçant|Rechargez|Transfert|Retrait d'espèces|Remboursement|Frais)$/);
      if (m) { op.description = m[1]; op.categorieRevolut = m[2]; }
    }
  }
  for (const op of operations) { op.libellePrincipal = op.description; op.libelleBrut = `${op.description} | ${op.categorieRevolut}`; op.lignes = [op.description]; }
  const controle = controlerRevolut({ operations, soldeOuverture, soldeCloture, totalLigne, anomalies });
  return {
    banque: 'revolut', titulaire: extraireTitulaireRevolut(pages), periode, soldeOuverture, soldeCloture, totalLigne, operations, anomalies, controle,
    releves: [{ numero: null, periode, ancienSolde: { centimes: soldeOuverture ?? 0 }, soldeFinal: { centimes: soldeCloture }, operations, controle }],
    erreurs: controle.ok ? [] : [controle.message],
    colonnesDetectees: !!colonnes,
  };
}

export function controlerRevolut({ operations, soldeOuverture, soldeCloture, totalLigne, anomalies = [] }) {
  const res = { ok: false, lignesFausses: [], sommeDebits: 0, sommeCredits: 0, ecartSolde: null, message: '' };
  let solde = soldeOuverture ?? 0;
  for (const op of operations) {
    // Les frais éventuels sont débités en plus du montant
    solde += op.montantSigne - (op.fraisCentimes || 0);
    if (op.sens === 'debit') res.sommeDebits += op.montantCentimes; else res.sommeCredits += op.montantCentimes;
    if (op.soldeApres !== null && op.soldeApres !== solde) {
      res.lignesFausses.push({ date: op.date, description: op.description, attendu: solde, lu: op.soldeApres });
      solde = op.soldeApres; // on se recale pour ne pas propager l'écart
    }
  }
  if (soldeCloture === null) { res.message = 'Solde de clôture introuvable'; return res; }
  res.ecartSolde = soldeCloture - solde;
  const ecartTotal = totalLigne !== null ? totalLigne - (soldeCloture - (soldeOuverture ?? 0)) : 0;
  res.ok = res.ecartSolde === 0 && res.lignesFausses.length === 0 && anomalies.length === 0 && ecartTotal === 0;
  res.message = res.ok ? 'Réconcilié au centime (chaque ligne et solde de clôture)' :
    [res.lignesFausses.length ? `${res.lignesFausses.length} solde(s) de ligne incohérent(s)` : '', res.ecartSolde ? `écart solde de clôture ${res.ecartSolde / 100} €` : '', anomalies.length ? `${anomalies.length} ligne(s) suspecte(s)` : '', ecartTotal ? `écart ligne Total ${ecartTotal / 100} €` : ''].filter(Boolean).join(', ');
  return res;
}

/** Nom du titulaire : premier bloc en majuscules de plusieurs mots en haut à gauche de la page 1. */
export function extraireTitulaireRevolut(pages) {
  const p = pages[0];
  if (!p) return null;
  const cand = p.items
    .filter((i) => i.x < 120 && i.y > 80 && i.y < 260 && /^[A-ZÀ-Ü' -]{2,}(?: [A-ZÀ-Ü' -]{2,})+$/.test(i.str.trim()))
    .sort((a, b) => a.y - b.y)[0];
  return cand ? cand.str.trim() : null;
}
