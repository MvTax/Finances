// detecteurs.js — détection des comportements coûteux à partir des transactions (règles locales, sans IA).
// Chaque détecteur renvoie des chiffres bruts ; coach.js les transforme en actions.

import { natureTransaction, contributionDepense, montantSigne, nomCategorie } from './categories.js';
import { ajouterJours, diffJours, estWeekend, jourSemaine, listeMois, moisDe, dernierJour } from './dates.js';
import { normaliserTexte } from './rules.js';
import { parseMontant } from './money.js';
import { periodeBudget } from './calculs.js';

const dansPeriode = (t, debut, fin) => t.date >= debut && t.date <= fin;

/** Synthèse mois par mois (mois calendaires). */
/** Liste des mois de salaire (d'un salaire au suivant) qui touchent l'intervalle. */
export function periodesSalaire(etat, debut, fin) {
  const res = [];
  let p = periodeBudget(debut, etat.profil || {});
  for (let i = 0; i < 120 && p.debut <= fin; i++) { res.push(p); p = periodeBudget(ajouterJours(p.fin, 1), etat.profil || {}); }
  return res;
}

/**
 * Synthèse par mois. Par défaut, mois calendaires ; avec { parSalaire: true }, mois de salaire à salaire
 * (c'est ce que montre le Bilan).
 */
export function syntheseMensuelle(etat, debut, fin, o = {}) {
  const mois = o.parSalaire ? periodesSalaire(etat, debut, fin).map((p) => ({ m: p.mois, d: p.debut, f: p.fin })) : listeMois(moisDe(debut), moisDe(fin)).map((m) => ({ m, d: m + '-01', f: dernierJour(m) }));
  return mois.map(({ m, d, f }) => {
    const r = { mois: m, debut: d, fin: f, salaire: 0, prime: 0, autresRevenus: 0, exceptionnel: 0, depenses: 0, dettes: 0, epargneVersee: 0, epargneReprise: 0, entreesProches: 0, sortiesProches: 0, deblocages: 0, especes: 0, fraisBancaires: 0, nbTransactions: 0 };
    for (const t of etat.transactions || []) {
      if (!dansPeriode(t, d, f)) continue;
      const n = natureTransaction(t);
      r.nbTransactions++;
      if (n === 'revenu') { if (t.categorie === 'salaire') r.salaire += t.montantCentimes; else if (t.categorie === 'prime-activite') r.prime += t.montantCentimes; else r.autresRevenus += t.montantCentimes; }
      else if (n === 'exceptionnel') r.exceptionnel += t.montantCentimes;
      else if (n === 'depense' || n === 'remboursement') { r.depenses += contributionDepense(t); if (t.categorie === 'especes') r.especes += contributionDepense(t); if (t.categorie === 'frais-bancaires') r.fraisBancaires += contributionDepense(t); }
      else if (n === 'dette') r.dettes += t.montantCentimes;
      else if (n === 'epargne') { if (t.sens === 'debit') r.epargneVersee += t.montantCentimes; else r.epargneReprise += t.montantCentimes; }
      else if (n === 'pret') { if (t.sens === 'credit') r.entreesProches += t.montantCentimes; else r.sortiesProches += t.montantCentimes; }
      else if (n === 'deblocage') r.deblocages += t.montantCentimes;
    }
    r.revenus = r.salaire + r.prime + r.autresRevenus;
    r.epargneNette = r.epargneVersee - r.epargneReprise;
    r.solde = r.revenus - r.depenses - r.dettes;
    return r;
  });
}

/** Top marchands (montant net + nombre de passages) parmi les dépenses. */
export function topMarchands(etat, debut, fin, n = 15) {
  const m = new Map();
  for (const t of etat.transactions || []) {
    if (!dansPeriode(t, debut, fin)) continue;
    const c = contributionDepense(t);
    if (!c) continue;
    const k = t.marchand || 'Inconnu';
    if (!m.has(k)) m.set(k, { marchand: k, categorie: t.categorie, montantCentimes: 0, passages: 0, jours: new Set() });
    const e = m.get(k);
    e.montantCentimes += c;
    if (c > 0) { e.passages += 1; e.jours.add(t.date); }
  }
  return [...m.values()].map((e) => ({ ...e, jours: e.jours.size })).sort((a, b) => b.montantCentimes - a.montantCentimes).slice(0, n);
}

/** Fuite du week-end : dépense moyenne par jour de semaine vs par jour de week-end. */
export function fuiteWeekend(etat, debut, fin) {
  let semaine = 0; let weekend = 0; let jS = 0; let jW = 0;
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) { if (estWeekend(d)) jW++; else jS++; }
  for (const t of etat.transactions || []) {
    if (!dansPeriode(t, debut, fin)) continue;
    const c = contributionDepense(t);
    if (!c || t.chargeFixeId) continue;
    if (estWeekend(t.date)) weekend += c; else semaine += c;
  }
  const parJourSemaine = jS ? Math.round(semaine / jS) : 0;
  const parJourWeekend = jW ? Math.round(weekend / jW) : 0;
  return { parJourSemaine, parJourWeekend, ratio: parJourSemaine ? parJourWeekend / parJourSemaine : 0, surcoutMensuel: Math.max(0, Math.round((parJourWeekend - parJourSemaine) * 8.7)) };
}

/** Espèces : retraits, frais de retrait, part non justifiée. */
export function especes(etat, debut, fin) {
  const retraits = (etat.transactions || []).filter((t) => dansPeriode(t, debut, fin) && t.categorie === 'especes' && t.sens === 'debit');
  let frais = 0;
  for (const t of retraits) { const m = (t.libelleBrut || '').match(/FRAIS RETRAIT[^|]*?(\d+,\d{2})/i); if (m) frais += parseMontant(m[1]); }
  const total = retraits.reduce((s, t) => s + t.montantCentimes, 0);
  const justifie = retraits.reduce((s, t) => s + (t.justificationCentimes || 0), 0);
  const parMois = {};
  for (const t of retraits) parMois[moisDe(t.date)] = (parMois[moisDe(t.date)] || 0) + t.montantCentimes;
  return { nb: retraits.length, totalCentimes: total, fraisCentimes: frais, nonJustifieCentimes: Math.max(0, total - justifie), plusGros: retraits.sort((a, b) => b.montantCentimes - a.montantCentimes).slice(0, 5), parMois };
}

/** Somme et nombre par catégorie(s) sur la période. */
export function parCategories(etat, debut, fin, categories) {
  const set = new Set(categories);
  let total = 0; let nb = 0; const parMarchand = new Map();
  for (const t of etat.transactions || []) {
    if (!dansPeriode(t, debut, fin) || !set.has(t.categorie)) continue;
    const c = contributionDepense(t);
    if (!c) continue;
    total += c; if (c > 0) nb++;
    parMarchand.set(t.marchand, (parMarchand.get(t.marchand) || 0) + c);
  }
  return { totalCentimes: total, nb, parMarchand: [...parMarchand.entries()].sort((a, b) => b[1] - a[1]) };
}

/** Livraison de repas : Uber Eats direct + via un tiers (Revolut), commandes et panier moyen. */
export function livraison(etat, debut, fin) {
  const tx = (etat.transactions || []).filter((t) => dansPeriode(t, debut, fin) && t.categorie === 'livraison' && contributionDepense(t) !== 0);
  const direct = tx.filter((t) => !t.regleRevolut);
  const tiers = tx.filter((t) => t.regleRevolut);
  const total = tx.reduce((s, t) => s + contributionDepense(t), 0);
  const commandes = tx.filter((t) => contributionDepense(t) > 0).length;
  return {
    totalCentimes: total, commandes,
    panierMoyenCentimes: commandes ? Math.round(total / commandes) : 0,
    directCentimes: direct.reduce((s, t) => s + contributionDepense(t), 0), nbDirect: direct.filter((t) => t.sens === 'debit').length,
    tiersCentimes: tiers.reduce((s, t) => s + contributionDepense(t), 0), nbTiers: tiers.length,
  };
}

/** VTC vs pass transport : nombre de trajets, total, et existence d'un abonnement transport. */
export function vtc(etat, debut, fin) {
  const v = parCategories(etat, debut, fin, ['vtc']);
  const pass = (etat.chargesFixes || []).filter((c) => c.actif && c.categorie === 'transports');
  return { ...v, passTransport: pass.map((p) => ({ libelle: p.libelle, montantCentimes: p.montantCentimes })) };
}

/** Frais bancaires par type, total et annualisation. */
export function fraisBancaires(etat, debut, fin) {
  const types = new Map();
  let total = 0;
  for (const t of etat.transactions || []) {
    if (!dansPeriode(t, debut, fin) || t.categorie !== 'frais-bancaires') continue;
    const c = t.sens === 'debit' ? t.montantCentimes : -t.montantCentimes;
    total += c;
    types.set(t.marchand, (types.get(t.marchand) || 0) + c);
  }
  // frais de retrait DAB intégrés aux lignes de retrait
  const fr = especes(etat, debut, fin).fraisCentimes;
  if (fr) { types.set('Frais de retrait (DAB)', (types.get('Frais de retrait (DAB)') || 0) + fr); total += fr; }
  const jours = Math.max(1, diffJours(debut, fin) + 1);
  return { totalCentimes: total, parType: [...types.entries()].sort((a, b) => b[1] - a[1]), annuelCentimes: Math.round((total * 365) / jours) };
}

/** Cycle « déblocage → échéances » du crédit instantané (regroupé par référence de dossier). */
export function creditInstant(etat, debut, fin) {
  const tx = (etat.transactions || []).filter((t) => dansPeriode(t, debut, fin) && /CREDIT INSTANT/i.test(normaliserTexte(t.libelleBrut)));
  const dossiers = new Map();
  for (const t of tx) {
    const ref = ((t.libelleBrut || '').split('|')[1] || '').trim().slice(-10) || 'sans-reference';
    if (!dossiers.has(ref)) dossiers.set(ref, { reference: ref, debloque: 0, rembourse: 0, frais: 0, dates: [] });
    const d = dossiers.get(ref);
    const L = normaliserTexte(t.libellePrincipal);
    if (/^DEBLOCAGE/.test(L)) d.debloque += t.montantCentimes;
    else if (/^REMBT FRAIS/.test(L)) d.frais -= t.montantCentimes;
    else if (/^FRAIS/.test(L)) d.frais += t.montantCentimes;
    else if (/ECH|ANNULATION/.test(L)) d.rembourse += t.montantCentimes;
    d.dates.push(t.date);
  }
  const liste = [...dossiers.values()].map((d) => ({ ...d, restantCentimes: d.debloque - d.rembourse, premier: d.dates.sort()[0] }));
  return {
    dossiers: liste,
    nbDeblocages: liste.filter((d) => d.debloque > 0).length,
    totalDebloqueCentimes: liste.reduce((s, d) => s + d.debloque, 0),
    totalRembourseCentimes: liste.reduce((s, d) => s + d.rembourse, 0),
    fraisCentimes: liste.reduce((s, d) => s + d.frais, 0),
  };
}

/** Flux avec les proches : entrées, sorties et solde net par personne (alias). */
export function fluxProches(etat, debut, fin) {
  const m = new Map();
  for (const t of etat.transactions || []) {
    if (!dansPeriode(t, debut, fin) || natureTransaction(t) !== 'pret') continue;
    const k = t.personne || t.marchand || 'Inconnu';
    if (!m.has(k)) m.set(k, { personne: k, entrees: 0, sorties: 0, nb: 0 });
    const e = m.get(k);
    if (t.sens === 'credit') e.entrees += t.montantCentimes; else e.sorties += t.montantCentimes;
    e.nb++;
  }
  const liste = [...m.values()].map((e) => ({ ...e, net: e.entrees - e.sorties })).sort((a, b) => (b.entrees + b.sorties) - (a.entrees + a.sorties));
  return { liste, totalEntrees: liste.reduce((s, e) => s + e.entrees, 0), totalSorties: liste.reduce((s, e) => s + e.sorties, 0) };
}

/** Micro-virements répétés à des particuliers hors règle de livraison. */
export function microVirements(etat, debut, fin) {
  const tx = (etat.transactions || []).filter((t) => dansPeriode(t, debut, fin) && t.role === 'versParticulier' && !t.regleRevolut && t.montantCentimes < 3000);
  return { nb: tx.length, totalCentimes: tx.reduce((s, t) => s + t.montantCentimes, 0) };
}

/** Abonnements en doublon : plusieurs opérateurs mobiles, plusieurs abonnements IA, prélèvements Apple multiples. */
export function abonnementsDoublons(etat, debut, fin) {
  const res = [];
  const actifs = (categorie) => {
    const m = new Map();
    for (const t of etat.transactions || []) {
      if (!dansPeriode(t, debut, fin) || t.categorie !== categorie || t.sens !== 'debit') continue;
      if (!m.has(t.marchand)) m.set(t.marchand, { marchand: t.marchand, nb: 0, total: 0, mois: new Set(), montants: new Set() });
      const e = m.get(t.marchand); e.nb++; e.total += t.montantCentimes; e.mois.add(moisDe(t.date)); e.montants.add(t.montantCentimes);
    }
    return [...m.values()];
  };
  const tel = actifs('telephonie').filter((e) => e.mois.size >= 2);
  if (tel.length >= 2) res.push({ type: 'telephonie', libelle: 'Deux opérateurs mobiles en parallèle', elements: tel.map((e) => ({ marchand: e.marchand, mensuelCentimes: Math.round(e.total / e.mois.size), mois: e.mois.size })) });
  const ab = actifs('abonnements');
  const ia = ab.filter((e) => /IA\)/.test(e.marchand));
  if (ia.length >= 2) res.push({ type: 'ia', libelle: 'Plusieurs abonnements IA', elements: ia.map((e) => ({ marchand: e.marchand, mensuelCentimes: Math.round(e.total / e.mois.size), mois: e.mois.size })) });
  const apple = ab.find((e) => e.marchand === 'Apple');
  if (apple && apple.montants.size >= 2) res.push({ type: 'apple', libelle: 'Plusieurs prélèvements Apple de montants différents', elements: [{ marchand: 'Apple', mensuelCentimes: Math.round(apple.total / apple.mois.size), mois: apple.mois.size, montants: [...apple.montants] }] });
  return res;
}

/** Vélo en libre-service : plusieurs débits identiques le même jour = probables pénalités de dépassement. */
export function penalitesVelo(etat, debut, fin) {
  const m = new Map();
  for (const t of etat.transactions || []) {
    if (!dansPeriode(t, debut, fin) || t.categorie !== 'velo' || t.sens !== 'debit') continue;
    const k = `${t.date}|${t.montantCentimes}|${t.marchand}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  let nb = 0; let total = 0;
  for (const [k, n] of m) if (n >= 2) { nb += n - 1; total += (n - 1) * Number(k.split('|')[1]); }
  const tout = parCategories(etat, debut, fin, ['velo']);
  return { suspectes: nb, suspectesCentimes: total, totalCentimes: tout.totalCentimes, nb: tout.nb };
}

/** Reprises d'épargne : nombre, total, jours du mois. */
export function reprisesEpargne(etat, debut, fin) {
  const tx = (etat.transactions || []).filter((t) => dansPeriode(t, debut, fin) && natureTransaction(t) === 'epargne');
  const reprises = tx.filter((t) => t.sens === 'credit');
  const versements = tx.filter((t) => t.sens === 'debit');
  const jours = reprises.map((t) => Number(t.date.slice(8, 10)));
  return {
    nbReprises: reprises.length,
    repriseCentimes: reprises.reduce((s, t) => s + t.montantCentimes, 0),
    verseCentimes: versements.reduce((s, t) => s + t.montantCentimes, 0),
    nette: versements.reduce((s, t) => s + t.montantCentimes, 0) - reprises.reduce((s, t) => s + t.montantCentimes, 0),
    joursMedian: jours.length ? jours.sort((a, b) => a - b)[Math.floor(jours.length / 2)] : null,
    jours,
  };
}

/** Historique des découverts du compte courant (solde quotidien par date comptable). */
export function decouverts(etat, debut, fin) {
  const courant = (etat.comptes || []).find((c) => c.type === 'courant');
  if (!courant) return { joursNegatifs: 0, episodes: 0, plusBas: 0, abri: [] };
  const tx = (etat.transactions || []).filter((t) => t.compteId === courant.id).sort((a, b) => ((a.dateComptable || a.date) < (b.dateComptable || b.date) ? -1 : 1));
  let solde = courant.soldeInitialCentimes || 0;
  let i = 0;
  const parJour = [];
  const depart = courant.dateSoldeInitial ? ajouterJours(courant.dateSoldeInitial, 1) : debut;
  for (let d = depart; d <= fin; d = ajouterJours(d, 1)) {
    while (i < tx.length && (tx[i].dateComptable || tx[i].date) <= d) { solde += montantSigne(tx[i]); i++; }
    if (d >= debut) parJour.push({ date: d, solde });
  }
  let episodes = 0; let enCours = false; let plusBas = 0;
  for (const j of parJour) { if (j.solde < 0) { if (!enCours) episodes++; enCours = true; plusBas = Math.min(plusBas, j.solde); } else enCours = false; }
  const negatifs = new Set(parJour.filter((j) => j.solde < 0).map((j) => j.date));
  // Argent mis à l'abri sur la néobanque pendant un découvert
  const abri = (etat.transactions || []).filter((t) => t.role === 'versRevolut' && t.montantCentimes > 1800 && (negatifs.has(t.dateComptable) || negatifs.has(ajouterJours(t.dateComptable || t.date, -1))));
  return { joursNegatifs: negatifs.size, episodes, plusBasCentimes: plusBas, parJour, abri: abri.map((t) => ({ date: t.date, montantCentimes: t.montantCentimes })) };
}

/** Coût annualisé d'une petite dépense fréquente : même marchand ≥ 3 fois sur 30 jours. */
export function coutAnnuelRecurrent(etat, marchand, dateIso) {
  if (!marchand) return null;
  const debut = ajouterJours(dateIso, -30);
  const tx = (etat.transactions || []).filter((t) => t.marchand === marchand && t.date > debut && t.date <= dateIso && contributionDepense(t) > 0);
  if (tx.length < 3) return null;
  const total = tx.reduce((s, t) => s + t.montantCentimes, 0);
  const moyen = Math.round(total / tx.length);
  const parSemaine = Math.round((tx.length / 30) * 7 * 10) / 10;
  return { passages: tx.length, moyenCentimes: moyen, parSemaine, annuelCentimes: Math.round((total * 365) / 30) };
}

/** Tous les détecteurs d'un coup (pour le bilan). */
export function analyser(etat, debut, fin) {
  return {
    mensuel: syntheseMensuelle(etat, debut, fin),
    topMarchands: topMarchands(etat, debut, fin, 20),
    weekend: fuiteWeekend(etat, debut, fin),
    especes: especes(etat, debut, fin),
    livraison: livraison(etat, debut, fin),
    vtc: vtc(etat, debut, fin),
    restaurationRapide: parCategories(etat, debut, fin, ['restauration-rapide']),
    shopping: parCategories(etat, debut, fin, ['vetements', 'beaute', 'achats-en-ligne']),
    frais: fraisBancaires(etat, debut, fin),
    creditInstant: creditInstant(etat, debut, fin),
    proches: fluxProches(etat, debut, fin),
    micro: microVirements(etat, debut, fin),
    doublons: abonnementsDoublons(etat, debut, fin),
    velo: penalitesVelo(etat, debut, fin),
    epargne: reprisesEpargne(etat, debut, fin),
    decouverts: decouverts(etat, debut, fin),
  };
}

export { nomCategorie, jourSemaine };
