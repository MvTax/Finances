// recalcul.js — « Recalcul complet » : tu tapes ce que chaque banque affiche (LCL, Revolut, Livret A, épargne Revolut),
// l'app refait tout le calcul du mois en détail, compte par compte, et pour chaque écart propose des pistes classées :
// prélèvement pas encore noté, dépense habituelle oubliée, virement d'épargne pas enregistré, virement entre comptes,
// paiement pas encore débité, doublon, entrée non notée…

import { soldes, periodeBudget, chargesFixesPeriode, estDepenseQuotidienne } from './calculs.js';
import { natureTransaction, contributionDepense, categorie } from './categories.js';
import { soldePoche } from './epargne.js';
import { aVirerEpargne } from './virements.js';
import { fluxEnvies } from './envies.js';
import { depensesFrequentes } from './express.js';
import { ajouterJours, formatDateCourte } from './dates.js';
import { formatEuros } from './money.js';

/** Deux montants « proches » : à 3 % près (au moins 0,30 €). */
const proche = (a, b, tol = 0.03) => Math.abs(a - b) <= Math.max(30, Math.round(Math.abs(b) * tol));

const LIBELLES = {
  revenu: 'Entrées (salaire, aides…)',
  exceptionnel: 'Entrées exceptionnelles',
  remboursement: 'Remboursements reçus',
  depense: 'Dépenses du quotidien',
  charge: 'Charges fixes et prélèvements',
  envie: 'Achats de tes envies',
  epargne: 'Virements vers l’épargne',
  interne: 'Virements entre tes comptes',
  dette: 'Crédits (mensualités)',
  pret: 'Prêts entre proches',
  deblocage: 'Déblocage de crédit',
  ajustement: 'Ajustements de solde',
  autre: 'Autres mouvements',
};

function familleDe(t) {
  const n = natureTransaction(t);
  if (n === 'depense' && t.envieId) return 'envie';
  if (n === 'depense' && t.sens === 'debit' && !estDepenseQuotidienne(t)) return 'charge';
  return LIBELLES[n] ? n : 'autre';
}

/** Le calcul en détail d'un compte bancaire sur le mois budgétaire : départ, chaque famille de mouvements, arrivée. */
export function detailCompte(etat, compte, dateIso) {
  const per = periodeBudget(dateIso, etat.profil);
  const veille = ajouterJours(per.debut, -1);
  const solde = (d) => soldes(etat, d).comptes.find((x) => x.compte.id === compte.id)?.soldeCentimes ?? 0;
  const debut = solde(veille);
  const fin = solde(dateIso);
  const familles = new Map();
  const parCat = new Map();
  for (const t of etat.transactions || []) {
    if (t.compteId !== compte.id) continue;
    const d = t.dateComptable || t.date;
    if (d <= veille || d > dateIso) continue;
    if (compte.dateSoldeInitial && d <= compte.dateSoldeInitial && !t.ajustement) continue;
    const f = familleDe(t);
    const g = familles.get(f) || { famille: f, libelle: LIBELLES[f], montantCentimes: 0, nb: 0 };
    g.montantCentimes += t.sens === 'credit' ? t.montantCentimes : -t.montantCentimes;
    g.nb += 1;
    familles.set(f, g);
    if (f === 'depense') { const c = t.categorie || 'autres'; parCat.set(c, (parCat.get(c) || 0) + contributionDepense(t)); }
  }
  const ordre = Object.keys(LIBELLES);
  const lignes = [...familles.values()].sort((a, b) => ordre.indexOf(a.famille) - ordre.indexOf(b.famille));
  const categories = [...parCat.entries()].filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, m]) => ({ id, nom: categorie(id).nom || id, montantCentimes: m }));
  return { periode: per, debutCentimes: debut, finCentimes: fin, lignes, categories, verifie: debut + lignes.reduce((s, l) => s + l.montantCentimes, 0) === fin };
}

/** Le calcul en détail d'une épargne : départ, versements, retraits (déjà virés), et ce qui attend le prochain virement. */
export function detailEpargne(etat, poche, dateIso) {
  const v = aVirerEpargne(etat, dateIso);
  const per = periodeBudget(dateIso, etat.profil);
  const mv = poche.mouvements || [];
  const somme = (f) => mv.filter(f).reduce((s, m) => s + m.montantCentimes, 0);
  return {
    appCentimes: soldePoche(poche),
    soldeInitialCentimes: poche.soldeInitialCentimes || 0,
    versementsCentimes: somme((m) => m.sens !== 'reprise'),
    retraitsCentimes: somme((m) => m.sens === 'reprise'),
    versementsMoisCentimes: somme((m) => m.sens !== 'reprise' && m.date >= per.debut && m.date <= dateIso),
    enAttenteCentimes: v.parPoche.find((x) => x.pocheId === poche.id)?.montantCentimes || 0,
    dateVirement: v.dateVirement,
  };
}

/**
 * Pistes pour un écart sur un compte bancaire. ecart = banque − app : négatif = de l'argent est sorti sans être noté.
 * @returns {Array<{ id, titre, texte, force: 'forte'|'moyenne'|'faible', action?: { type, ... } }>}
 */
export function pistesCompte(etat, compte, ecartCentimes, dateIso) {
  const x = Math.abs(ecartCentimes);
  if (!x) return [];
  const per = periodeBudget(dateIso, etat.profil);
  const res = [];
  const ajouter = (p) => { if (!res.some((r) => r.id === p.id)) res.push(p); };
  if (ecartCentimes < 0) {
    // 1. Prélèvements et abonnements prévus, passés, pas encore dans l'app
    const charges = chargesFixesPeriode(etat, per).filter((c) => !c.payee && c.date <= dateIso && (!c.compteId || c.compteId === compte.id));
    for (const c of charges) {
      ajouter({ id: `charge-${c.id}`, force: proche(c.montantPrevuCentimes, x) ? 'forte' : 'faible', titre: `Prélèvement ${c.libelle}`, texte: `${formatEuros(c.montantPrevuCentimes)}, prévu le ${formatDateCourte(c.date)}, pas encore dans l’app.`,
        action: { type: 'depense', montantCentimes: c.montantPrevuCentimes, libelle: c.libelle, categorie: c.categorie || 'abonnements', compteId: compte.id, date: c.date } });
    }
    if (charges.length > 1) {
      for (let i = 0; i < charges.length; i += 1) for (let j = i + 1; j < charges.length; j += 1) {
        if (proche(charges[i].montantPrevuCentimes + charges[j].montantPrevuCentimes, x)) ajouter({ id: `charges-${i}-${j}`, force: 'forte', titre: `${charges[i].libelle} + ${charges[j].libelle}`, texte: `${formatEuros(charges[i].montantPrevuCentimes)} + ${formatEuros(charges[j].montantPrevuCentimes)} : deux prélèvements passés, pas encore notés.` });
      }
    }
    // 2. Virement vers l'épargne fait à la banque sans toucher « J'ai fait le virement »
    if (compte.type === 'courant') {
      const v = aVirerEpargne(etat, dateIso);
      if (v.semaineCentimes && proche(v.semaineCentimes, x)) ajouter({ id: 'virement-epargne', force: 'forte', titre: 'Virement vers l’épargne pas enregistré', texte: `Le virement en attente fait ${formatEuros(v.semaineCentimes)}. Si tu l’as fait dans ton appli bancaire, touche « J’ai fait le virement ».`, action: { type: 'virementEpargne' } });
    }
    // 3. Une dépense habituelle oubliée : un marchand fréquent à ce prix-là
    for (const g of depensesFrequentes(etat, dateIso, 40)) {
      const bon = proche(g.montantCentimes, x, 0.12) ? g.montantCentimes : null;
      if (bon) ajouter({ id: `freq-${g.cle}`, force: proche(bon, x) ? 'forte' : 'moyenne', titre: `Une dépense chez ${g.marchand}`, texte: `Tu y dépenses souvent ${formatEuros(bon)}.`, action: { type: 'depense', montantCentimes: x, libelle: g.libelle || g.marchand, categorie: g.categorie, compteId: compte.id, date: dateIso } });
    }
    // 4. Par catégorie : montant typique d'un restaurant, de courses…
    const typiques = montantsTypiques(etat, dateIso);
    for (const c of typiques) {
      if (proche(c.medianeCentimes, x, 0.2)) ajouter({ id: `cat-${c.id}`, force: 'moyenne', titre: `${c.nom} pas noté`, texte: `Une dépense « ${c.nom.toLowerCase()} » te coûte souvent autour de ${formatEuros(c.medianeCentimes)}.`, action: { type: 'depense', montantCentimes: x, libelle: c.nom, categorie: c.id, compteId: compte.id, date: dateIso } });
    }
    // 5. Petits montants : frais bancaires, plusieurs petits achats
    if (x <= 1000) ajouter({ id: 'frais', force: 'faible', titre: 'Frais ou commission bancaire', texte: 'Regarde les lignes « commission », « frais » ou « cotisation » sur ton relevé.', action: { type: 'depense', montantCentimes: x, libelle: 'Frais bancaires', categorie: 'frais-bancaires', compteId: compte.id, date: dateIso } });
    ajouter({ id: 'petits', force: 'faible', titre: 'Plusieurs petites dépenses', texte: 'Un café, une boulangerie, un ticket… payés sans être notés. Regarde les derniers jours dans ton appli bancaire.', action: { type: 'depense', montantCentimes: x, libelle: 'Dépenses non notées', categorie: 'autres', compteId: compte.id, date: dateIso } });
  } else {
    // Plus d'argent à la banque que dans l'app
    // 1. Paiements notés récemment, pas encore débités par la banque
    const recents = (etat.transactions || []).filter((t) => t.compteId === compte.id && t.sens === 'debit' && t.date >= ajouterJours(dateIso, -4) && t.date <= dateIso && !['import', 'confirmation'].includes(t.source) && !t.ajustement);
    for (const t of recents) {
      if (proche(t.montantCentimes, x)) ajouter({ id: `recent-${t.id}`, force: 'forte', titre: `${t.marchand || t.libelle} pas encore débité`, texte: `${formatEuros(t.montantCentimes)} noté le ${formatDateCourte(t.date)} : un paiement par carte met souvent 1 à 3 jours à apparaître. Rien à faire, ça va s’aligner.` });
    }
    const totalRecents = recents.reduce((s, t) => s + t.montantCentimes, 0);
    if (recents.length > 1 && proche(totalRecents, x)) ajouter({ id: 'recents', force: 'forte', titre: `${recents.length} paiements récents pas encore débités`, texte: `${recents.map((t) => `${t.marchand || t.libelle} ${formatEuros(t.montantCentimes)}`).join(', ')} : ils vont apparaître à la banque dans les jours qui viennent.` });
    // 2. Doublons dans l'app
    const vus = new Map();
    for (const t of etat.transactions || []) {
      if (t.compteId !== compte.id || t.date < per.debut || t.date > dateIso || t.ajustement) continue;
      const cle = `${t.date}|${t.sens}|${t.montantCentimes}|${(t.marchand || '').toLowerCase()}`;
      vus.set(cle, [...(vus.get(cle) || []), t]);
    }
    for (const [, l] of vus) {
      if (l.length < 2) continue;
      const t = l[0];
      const surplus = t.montantCentimes * (l.length - 1);
      ajouter({ id: `doublon-${t.id}`, force: proche(surplus, x) ? 'forte' : 'faible', titre: `Doublon possible : ${t.marchand || t.libelle}`, texte: `${formatEuros(t.montantCentimes)} noté ${l.length} fois le ${formatDateCourte(t.date)}. Si c’est une seule dépense, supprime le double dans Dépenses.`, action: { type: 'voirDepenses' } });
    }
    // 3. Virement d'épargne enregistré récemment mais pas fait à la banque
    const vEp = (etat.transactions || []).filter((t) => t.compteId === compte.id && t.epargne?.estEpargne && t.sens === 'debit' && t.date >= ajouterJours(dateIso, -10));
    for (const t of vEp) if (proche(t.montantCentimes, x)) ajouter({ id: `ep-${t.id}`, force: 'forte', titre: 'Virement d’épargne pas encore fait', texte: `${formatEuros(t.montantCentimes)} enregistré le ${formatDateCourte(t.date)} comme viré : vérifie qu’il est bien parti dans ton appli bancaire.` });
    // 4. Une entrée pas notée
    ajouter({ id: 'entree', force: 'moyenne', titre: 'Une entrée pas notée', texte: 'Un remboursement, un virement d’un proche, une vente, une aide…', action: { type: 'entree', montantCentimes: x, compteId: compte.id, date: dateIso } });
  }
  const rang = { forte: 0, moyenne: 1, faible: 2 };
  return res.sort((a, b) => rang[a.force] - rang[b.force]).slice(0, 6);
}

/** Pistes pour une épargne : écart = banque − app. */
export function pistesEpargne(etat, poche, ecartCentimes, dateIso) {
  const x = Math.abs(ecartCentimes);
  if (!x) return [];
  const d = detailEpargne(etat, poche, dateIso);
  const res = [];
  if (ecartCentimes > 0) {
    if (d.enAttenteCentimes && proche(d.enAttenteCentimes, x)) res.push({ id: 'attente', force: 'forte', titre: 'Le virement est fait, pas enregistré', texte: `Sa part du virement en attente fait ${formatEuros(d.enAttenteCentimes)}. Touche « J’ai fait le virement » pour l’enregistrer.`, action: { type: 'virementEpargne' } });
    if (poche.compteSupport && /revolut/i.test(poche.compteSupport)) res.push({ id: 'rev-auto', force: 'moyenne', titre: 'Épargne automatique Revolut', texte: 'Les arrondis ou versements automatiques de Revolut ajoutent de l’argent sans passer par Budget.' });
    if (poche.compteSupport && /livret/i.test(poche.compteSupport)) res.push({ id: 'interets', force: 'faible', titre: 'Intérêts du livret', texte: 'Les intérêts du Livret A sont versés une fois par an, en général fin décembre ou début janvier.' });
    res.push({ id: 'versement', force: 'moyenne', titre: 'Un versement fait à la main', texte: `Ajoute ${formatEuros(x)} à cette épargne dans Budget.`, action: { type: 'mouvementEpargne', sens: 'versement', pocheId: poche.id, montantCentimes: x } });
  } else {
    res.push({ id: 'retrait', force: 'moyenne', titre: 'Un retrait pas noté', texte: `Si tu as repris ${formatEuros(x)} sur cette épargne, note le retrait.`, action: { type: 'mouvementEpargne', sens: 'reprise', pocheId: poche.id, montantCentimes: x } });
    res.push({ id: 'pas-arrive', force: 'moyenne', titre: 'Virement noté mais pas encore arrivé', texte: 'Un virement entre deux banques peut mettre 1 à 2 jours ouvrés (pas le week-end).' });
  }
  return res;
}

/** Montant médian d'une dépense par catégorie, sur 90 jours (pour reconnaître « un restaurant », « des courses »). */
export function montantsTypiques(etat, dateIso) {
  const depuis = ajouterJours(dateIso, -90);
  const par = new Map();
  for (const t of etat.transactions || []) {
    if (t.sens !== 'debit' || t.date < depuis || t.date > dateIso || !estDepenseQuotidienne(t) || contributionDepense(t) <= 0) continue;
    const c = t.categorie || 'autres';
    if (!par.has(c)) par.set(c, []);
    par.get(c).push(t.montantCentimes);
  }
  return [...par.entries()].filter(([, l]) => l.length >= 3).map(([id, l]) => {
    const s = [...l].sort((a, b) => a - b);
    return { id, nom: categorie(id).nom || id, medianeCentimes: s[Math.floor(s.length / 2)], nb: l.length };
  }).sort((a, b) => b.nb - a.nb);
}

/**
 * Le recalcul complet. saisies : { [compteId ou pocheId]: solde à la banque en centimes } (les champs vides sont ignorés).
 * @returns {{ periode, lignes: Array<{ id, nom, sorte: 'compte'|'epargne', appCentimes, banqueCentimes, ecartCentimes, detail, pistes }>, croisees, envieGardeCentimes, enAttenteCentimes }}
 */
export function recalculComplet(etat, dateIso, saisies = {}) {
  const per = periodeBudget(dateIso, etat.profil);
  const lignes = [];
  for (const c of etat.comptes || []) {
    if (c.type === 'epargne' || c.type === 'especes') continue;
    const detail = detailCompte(etat, c, dateIso);
    const banque = saisies[c.id] ?? null;
    const ecart = banque === null ? null : banque - detail.finCentimes;
    lignes.push({ id: c.id, nom: c.nom, sorte: 'compte', compte: c, appCentimes: detail.finCentimes, banqueCentimes: banque, ecartCentimes: ecart, detail, pistes: ecart ? pistesCompte(etat, c, ecart, dateIso) : [] });
  }
  for (const p of (etat.poches || []).filter((x) => x.actif !== false)) {
    const detail = detailEpargne(etat, p, dateIso);
    const banque = saisies[p.id] ?? null;
    const ecart = banque === null ? null : banque - detail.appCentimes;
    lignes.push({ id: p.id, nom: p.nom, sorte: 'epargne', poche: p, appCentimes: detail.appCentimes, banqueCentimes: banque, ecartCentimes: ecart, detail, pistes: ecart ? pistesEpargne(etat, p, ecart, dateIso) : [] });
  }
  // Pistes croisées : ce qui manque d'un côté et se retrouve de l'autre (virement entre comptes, virement d'épargne)
  const croisees = [];
  const avecEcart = lignes.filter((l) => l.ecartCentimes);
  for (const a of avecEcart) for (const b of avecEcart) {
    if (a === b || !(a.ecartCentimes < 0 && b.ecartCentimes > 0) || !proche(-a.ecartCentimes, b.ecartCentimes)) continue;
    const vers = b.sorte === 'epargne' ? 'virementEpargne' : 'interne';
    croisees.push({ id: `croise-${a.id}-${b.id}`, force: 'forte', de: a.id, vers: b.id,
      titre: `${formatEuros(b.ecartCentimes)} de ${a.nom} vers ${b.nom}`,
      texte: vers === 'virementEpargne' ? `Il manque ${formatEuros(-a.ecartCentimes)} sur ${a.nom} et il y a ${formatEuros(b.ecartCentimes)} de plus sur ${b.nom} : c’est sûrement un virement vers l’épargne fait sans toucher « J’ai fait le virement ».`
        : `Il manque ${formatEuros(-a.ecartCentimes)} sur ${a.nom} et il y a ${formatEuros(b.ecartCentimes)} de plus sur ${b.nom} : c’est sûrement un virement entre tes comptes pas encore noté.`,
      action: vers === 'virementEpargne' ? { type: 'virementEpargne' } : { type: 'interne', deId: a.id, versId: b.id, montantCentimes: b.ecartCentimes, date: dateIso } });
  }
  const flux = fluxEnvies(etat);
  const envieGarde = flux.envies.filter((e) => !e.achat).reduce((s, e) => s + e.cumulCentimes, 0);
  const v = aVirerEpargne(etat, dateIso);
  return { periode: per, lignes, croisees, envieGardeCentimes: envieGarde, enAttenteCentimes: v.semaineCentimes, totalEcartCentimes: lignes.reduce((s, l) => s + Math.abs(l.ecartCentimes || 0), 0) };
}
