// raisonnement.js — transforme les chiffres du mois en constats expliqués : ce qui se passe, pourquoi, et donc quoi faire.
// Tout est calculé ici, sur le téléphone, sans IA. Chaque point suit la même logique :
//   constat (le fait chiffré) → pourquoi (ce que ça implique) → donc (la décision concrète).

import { resteADepenser, depensesVariables, chargesFixesPeriode, dettesPeriode, epargneCible, revenusDuMois, estDepenseQuotidienne, projectionDecouvert, periodeBudget } from './calculs.js';
import { periodesSalaire } from './detecteurs.js';
import { categorie, famille, contributionDepense } from './categories.js';
import { listerAbonnements } from './abonnements.js';
import { aujourdhui, ajouterJours, diffJours, formatDateCourte, formatMois } from './dates.js';
import { formatEuros } from './money.js';

const exact = (c) => formatEuros(c);
/** Montant approché, arrondi à l'euro (pour les estimations : « environ 520 € »). */
const env = (c) => formatEuros(Math.round(c / 100) * 100, { sansCentimes: true });
const moisNom = (m) => formatMois(m).replace(/ \d{4}$/, '');
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const mediane = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const FAMILLES_QUOTIDIEN = ['dehors', 'bouger', 'plaisirs', 'vivre'];

/**
 * Habitudes de dépense du quotidien : médiane par jour sur les derniers mois de salaire complets.
 * La médiane ignore un mois exceptionnel (un gros retrait d'espèces, un voyage).
 * @returns null si moins de 2 mois d'historique, sinon { parJourCentimes, nbMois, familles: [{ id, nom, parJourCentimes, parSemaineCentimes, parMoisCentimes }] }
 */
export function habitudes(etat, dateIso = aujourdhui(), { nbMois = 3 } = {}) {
  const tx = etat.transactions || [];
  if (!tx.length) return null;
  const premiere = tx.reduce((m, t) => (t.date < m ? t.date : m), '9999-12-31');
  const courant = periodeBudget(dateIso, etat.profil || {});
  const periodes = periodesSalaire(etat, ajouterJours(courant.debut, -40 * nbMois), ajouterJours(courant.debut, -1))
    .filter((p) => p.fin < courant.debut && p.debut >= premiere)
    .slice(-nbMois);
  if (periodes.length < 2) return null;
  const parJour = [];
  const parFamille = Object.fromEntries(FAMILLES_QUOTIDIEN.map((f) => [f, []]));
  for (const p of periodes) {
    let total = 0;
    const fam = Object.fromEntries(FAMILLES_QUOTIDIEN.map((f) => [f, 0]));
    for (const t of tx) {
      if (t.date < p.debut || t.date > p.fin || t.ajustement || !estDepenseQuotidienne(t)) continue;
      const v = contributionDepense(t);
      if (!v) continue;
      total += v;
      const f = categorie(t.categorie).famille;
      if (f in fam) fam[f] += v;
    }
    parJour.push(total / p.nbJours);
    for (const f of FAMILLES_QUOTIDIEN) parFamille[f].push(Math.max(0, fam[f]) / p.nbJours);
  }
  const familles = FAMILLES_QUOTIDIEN.map((id) => {
    const j = Math.round(mediane(parFamille[id]));
    return { id, nom: famille(id).nom, parJourCentimes: j, parSemaineCentimes: j * 7, parMoisCentimes: j * 30 };
  }).filter((f) => f.parJourCentimes > 0).sort((a, b) => b.parJourCentimes - a.parJourCentimes);
  return { parJourCentimes: Math.round(mediane(parJour)), nbMois: periodes.length, familles };
}

/** Ce qui change le mois suivant : remboursements, charges, budget par jour estimé. */
function moisSuivant(etat, r) {
  const p2 = periodeBudget(ajouterJours(r.periode.fin, 1), etat.profil || {}, { reference: r.periode.fin });
  const dettes = dettesPeriode(etat, p2);
  const charges = chargesFixesPeriode(etat, p2);
  const revenus = revenusDuMois(etat, p2.mois).totalCentimes || r.revenus.totalCentimes;
  const totalDettes = dettes.reduce((s, d) => s + d.montantCentimes, 0);
  const totalCharges = charges.reduce((s, c) => s + c.montantPrevuCentimes, 0);
  const cible = epargneCible(etat, p2.mois);
  const quotidien = revenus - cible - totalCharges - totalDettes;
  const cle = (d) => d.creditId || d.pretId || d.libelle;
  const finies = [...new Map(r.dettes.filter((d) => !dettes.some((x) => cle(x) === cle(d))).map((d) => [cle(d), d])).values()];
  const nouvelles = [...new Map(dettes.filter((d) => !r.dettes.some((x) => cle(x) === cle(d))).map((d) => [cle(d), d])).values()];
  return { periode: p2, dettesCentimes: totalDettes, chargesCentimes: totalCharges, revenusCentimes: revenus, cibleCentimes: cible, parJourCentimes: Math.round(quotidien / p2.nbJours), finies, nouvelles };
}

/**
 * Raisonnement complet du mois en cours.
 * @returns { niveau: 'ok'|'attention'|'tendu'|'depasse', titre, phrase, points: [{ id, ton, titre, constat, pourquoi, donc, action? }], chiffres }
 */
export function raisonner(etat, dateIso = aujourdhui()) {
  const r = resteADepenser(etat, dateIso);
  const per = r.periode;
  const rev = r.revenus.totalCentimes;
  const joursRestants = Math.max(1, diffJours(dateIso, per.fin) + 1);
  const joursPasses = Math.max(1, diffJours(per.debut, dateIso) + 1);
  const depJour = depensesVariables(etat, dateIso, dateIso);
  const resteMatin = r.resteCentimes + depJour;                 // ce qui restait ce matin, pour aujourd'hui inclus
  const parJour = Math.round(resteMatin / joursRestants);
  const enveloppe = rev - r.epargneCibleCentimes - r.chargesCentimes - r.dettesCentimes; // tout le quotidien du mois
  const parJourPrevu = Math.round(enveloppe / per.nbJours);
  const salaire = formatDateCourte(per.salaireAttenduLe || ajouterJours(per.fin, 1));
  const hab = habitudes(etat, dateIso);
  const suivant = rev > 0 ? moisSuivant(etat, r) : null;
  const points = [];

  if (rev <= 0) {
    return { niveau: 'attention', titre: 'Revenus du mois à saisir', phrase: 'Sans ton salaire du mois, l’app ne peut pas savoir ce que tu peux dépenser.', points: [], chiffres: { r, parJour, hab } };
  }

  // 1. Habitudes face au budget : le point qui décide si le mois tiendra.
  let manque = 0;
  if (hab && hab.parJourCentimes > 0) {
    const ecart = hab.parJourCentimes - parJour;
    manque = Math.max(0, hab.parJourCentimes * joursRestants - resteMatin);
    const gros = hab.familles[0];
    if (ecart > Math.max(100, parJour * 0.1)) {
      const facteur = parJour > 0 ? hab.parJourCentimes / parJour : null;
      points.push({
        id: 'habitudes', ton: manque > resteMatin * 0.25 ? 'alerte' : 'attention', titre: 'Tes habitudes coûtent plus que ton budget',
        constat: `Ces ${pluriel(hab.nbMois, 'dernier')} mois, tu dépensais environ ${env(hab.parJourCentimes)} par jour au quotidien. Ce mois-ci, tu as ${exact(parJour)} par jour${facteur && facteur >= 1.5 ? `, soit ${facteur >= 1.9 ? 'deux' : 'une fois et demie'} fois moins` : ''}.`,
        pourquoi: `Si tu gardes le même rythme, il te manquera environ ${env(manque)} avant le salaire du ${salaire}. Ce manque finirait en découvert, avec des frais.`,
        donc: gros ? `Il faut dépenser environ ${env(ecart * 7)} de moins par semaine. Le plus gros poste est « ${gros.nom} » : environ ${env(gros.parSemaineCentimes)} par semaine d’habitude. C’est là que réduire rapporte le plus.` : `Il faut dépenser environ ${env(ecart * 7)} de moins par semaine.`,
        action: gros ? { libelle: 'Voir mes dépenses par catégorie', route: 'depenses' } : null,
      });
    } else {
      points.push({
        id: 'habitudes', ton: 'bien', titre: 'Ton budget couvre tes habitudes',
        constat: `D’habitude, tu dépenses environ ${env(hab.parJourCentimes)} par jour au quotidien, et tu as ${exact(parJour)} par jour ce mois-ci.`,
        pourquoi: 'Ton rythme habituel tient dans le budget du mois.',
        donc: `Si tu restes à ce rythme, il te restera environ ${env(Math.max(0, resteMatin - hab.parJourCentimes * joursRestants))} au salaire. Ce reste partira dans ton épargne.`,
      });
    }
  }

  // 2. Le mois en cours : le rythme réel depuis le salaire.
  const dep = r.depensesVariablesCentimes;
  const rythme = Math.round(dep / joursPasses);
  if (parJourPrevu > 0) {
    const tot = joursPasses < 5;
    const finProjetee = r.resteCentimes - rythme * (joursRestants - 1);
    if (rythme <= parJourPrevu) {
      points.push({
        id: 'rythme', ton: 'bien', titre: tot ? 'Bon début de mois' : 'Tu tiens ton rythme',
        constat: `Depuis le salaire (${pluriel(joursPasses, 'jour')}), tu as dépensé ${exact(dep)} au quotidien, soit ${exact(rythme)} par jour.`,
        pourquoi: `C’est ${Math.round((rythme / parJourPrevu) * 100)} % de ce que ton budget permet (${exact(parJourPrevu)} par jour sur tout le mois)${tot ? '. C’est encore tôt pour juger : les courses et les sorties arrivent souvent plus tard' : ''}.`,
        donc: `Si tu continues comme ça, il te restera environ ${env(Math.max(0, finProjetee))} au salaire du ${salaire}.`,
      });
    } else {
      points.push({
        id: 'rythme', ton: finProjetee < 0 ? 'alerte' : 'attention', titre: 'Tu dépenses plus vite que prévu',
        constat: `Depuis le salaire (${pluriel(joursPasses, 'jour')}), tu as dépensé ${exact(dep)} au quotidien, soit ${exact(rythme)} par jour pour un budget de ${exact(parJourPrevu)}.`,
        pourquoi: finProjetee < 0 ? `À ce rythme, tu finirais le mois à ${env(finProjetee)}, donc à découvert.` : `À ce rythme, il ne te resterait qu’environ ${env(finProjetee)} au salaire.`,
        donc: r.resteCentimes > 0 ? `Pour finir le mois à zéro, il faut descendre à ${exact(Math.round(r.resteCentimes / joursRestants))} par jour à partir d’aujourd’hui.` : 'Le budget est épuisé : chaque jour sans dépense réduit le découvert.',
      });
    }
  }

  // 3. Ce qui pèse sur le mois : prélèvements et remboursements, et comment ça évolue.
  const engage = r.chargesCentimes + r.dettesCentimes;
  const pct = Math.round((engage / rev) * 100);
  if (engage > 0) {
    let donc = '';
    if (suivant && suivant.dettesCentimes < r.dettesCentimes) {
      const noms = suivant.finies.map((d) => d.libelle.replace(/^Remboursement à /, '')).slice(0, 3);
      const libere = r.dettesCentimes - suivant.dettesCentimes;
      const plusEpargne = suivant.cibleCentimes - r.epargneCibleCentimes;
      donc = `Ça s’allège en ${moisNom(suivant.periode.mois)} : les remboursements passent à ${exact(suivant.dettesCentimes)}${noms.length ? ` (${noms.join(', ')} terminé${noms.length > 1 ? 's' : ''})` : ''}, ce qui libère ${exact(libere)}.`
        + (plusEpargne > libere / 2
          ? ` Ton plan en met ${exact(suivant.cibleCentimes)} de côté ce mois-là (contre ${exact(r.epargneCibleCentimes)} maintenant) : l’argent libéré part surtout dans l’épargne, et ton budget du jour reste autour de ${env(suivant.parJourCentimes)}.`
          : ` Ton budget passerait à environ ${env(suivant.parJourCentimes)} par jour.`);
    } else if (suivant && suivant.dettesCentimes > r.dettesCentimes) {
      const noms = suivant.nouvelles.map((d) => d.libelle).slice(0, 2);
      donc = `Attention en ${moisNom(suivant.periode.mois)} : les remboursements montent à ${exact(suivant.dettesCentimes)}${noms.length ? ` (${noms.join(', ')})` : ''}. Ton budget tomberait à environ ${env(suivant.parJourCentimes)} par jour : mettre de côté maintenant amortit le choc.`;
    } else {
      donc = pct > 50 ? 'Pour retrouver de l’air, la seule vraie piste est de baisser un prélèvement : un abonnement, un forfait, une assurance.' : 'Tu peux garder ce niveau.';
    }
    points.push({
      id: 'engagements', ton: pct > 60 ? 'attention' : 'neutre', titre: pct > 50 ? 'Tes engagements prennent l’essentiel du salaire' : 'Tes engagements restent raisonnables',
      constat: `Tes prélèvements (${exact(r.chargesCentimes)}) et tes remboursements (${exact(r.dettesCentimes)}) prennent ${pct} % de tes revenus (${exact(rev)}).`,
      pourquoi: pct > 50 ? `On conseille de rester sous 50 %. Au-dessus, il reste peu pour vivre : c’est pour ça que ton budget du jour est à ${exact(parJour)}.` : 'La limite conseillée est 50 % : tu es en dessous, il te reste de la marge pour vivre et épargner.',
      donc,
      action: { libelle: 'Voir mes dettes', route: 'epargne/dettes' },
    });
  }

  // 4. L'épargne : pourquoi ce montant, et où se joue la différence.
  const cible = r.epargneCibleCentimes;
  if (r.dettesCentimes > cible && r.dettesCentimes > 0) {
    points.push({
      id: 'epargne', ton: 'neutre', titre: 'Rembourser passe avant épargner',
      constat: `Ce mois-ci, ${exact(cible)} vont à l’épargne et ${exact(r.dettesCentimes)} aux remboursements.`,
      pourquoi: 'C’est le bon ordre : une dette coûte plus cher (intérêts, frais, confiance d’un proche) qu’un livret ne rapporte.',
      donc: `Ce qui te restera au salaire du ${salaire} partira dans l’épargne : chaque euro non dépensé ce mois-ci y va directement.`,
      action: { libelle: 'Voir mon plan', route: 'epargne/plan' },
    });
  } else if (cible > 0) {
    points.push({
      id: 'epargne', ton: 'bien', titre: 'Ton épargne est prévue',
      constat: `${exact(cible)} sont mis de côté ce mois-ci, soit ${Math.round((cible / rev) * 100)} % de tes revenus.`,
      pourquoi: 'Ce montant est retiré avant de calculer ton budget : tu ne peux pas le dépenser par erreur.',
      donc: `Ce qui te restera en plus au salaire du ${salaire} s’ajoutera à l’épargne.`,
      action: { libelle: 'Voir mon plan', route: 'epargne/plan' },
    });
  }

  // 5. Le compte courant dans les 7 jours : la date compte autant que le montant.
  const p = projectionDecouvert(etat, dateIso, { jours: 7 });
  let alerteTreso = false;
  if (p) {
    const cibleCharge = p.loyerNonCouvert || p.chargeNonCouverte;
    if (cibleCharge || p.premierNegatif) {
      alerteTreso = true;
      points.push({
        id: 'tresorerie', ton: 'alerte', titre: `${p.compte.nom} risque le découvert`,
        constat: cibleCharge ? `${p.compte.nom} ne couvre pas ${cibleCharge.estLoyer ? 'le loyer' : cibleCharge.libelle} du ${formatDateCourte(cibleCharge.date)}.` : `${p.compte.nom} passe sous 0 € vers le ${formatDateCourte(p.premierNegatif.date)}.`,
        pourquoi: 'Ton budget du mois peut être positif alors que l’argent n’est pas sur le bon compte, ou pas encore arrivé.',
        donc: 'Fais un virement vers ce compte avant cette date, ou décale une dépense après le salaire.',
      });
    }
  }

  // 6. Les abonnements : l'économie qui se répète tous les mois.
  const abo = listerAbonnements(etat, dateIso, { resilies: etat.meta?.abonnementsResilies || {} });
  if (abo.aLimiterMensuelCentimes > 0 && parJour > 0) {
    const jours = Math.round(abo.aLimiterMensuelCentimes / parJour);
    points.push({
      id: 'abonnements', ton: jours >= 3 ? 'attention' : 'neutre', titre: 'Tes abonnements, l’économie la plus simple',
      constat: `Tes abonnements non essentiels coûtent ${exact(abo.aLimiterMensuelCentimes)} par mois.`,
      pourquoi: `C’est l’équivalent de ${pluriel(jours, 'jour')} de ton budget du quotidien, chaque mois.`,
      donc: 'Résilier celui que tu utilises le moins est l’économie qui demande le moins d’effort : elle se répète sans que tu y penses.',
      action: { libelle: 'Voir mes abonnements', route: 'abonnements' },
    });
  }

  // Verdict : la conclusion qui découle des points.
  let niveau; let titre; let phrase;
  const gros = hab?.familles?.[0];
  if (r.resteCentimes < 0) {
    niveau = 'depasse'; titre = 'Budget du mois dépassé';
    phrase = `Tu as dépassé de ${exact(-r.resteCentimes)}. Chaque jour sans dépense d’ici le ${salaire} réduit ce trou.`;
  } else if (alerteTreso && manque <= resteMatin * 0.25) {
    niveau = 'tendu'; titre = 'Attention au découvert';
    const t = points.find((x) => x.id === 'tresorerie');
    phrase = `Ton budget du mois tient, mais l’argent n’est pas au bon endroit : ${t.constat.charAt(0).toLowerCase()}${t.constat.slice(1)} Fais un virement vers ce compte avant.`;
  } else if (alerteTreso || manque > resteMatin * 0.25) {
    niveau = 'tendu'; titre = 'Mois serré';
    phrase = pct > 50
      ? `Tes engagements prennent ${pct} % du salaire, donc il ne reste que ${exact(parJour)} par jour. ${gros ? `Freine surtout sur « ${gros.nom} ».` : 'Évite les dépenses non prévues.'}`
      : `Ton budget est plus bas que tes habitudes. ${gros ? `Freine surtout sur « ${gros.nom} ».` : ''}`.trim();
  } else if (manque > 0 || rythme > parJourPrevu) {
    niveau = 'attention'; titre = 'Mois à surveiller';
    phrase = `Ça peut tenir si tu restes autour de ${exact(parJour)} par jour.`;
  } else {
    niveau = 'ok'; titre = 'Tu es dans les clous';
    phrase = `À ce rythme, il te restera de l’argent au salaire du ${salaire}. Il ira dans ton épargne.`;
  }
  const ordre = { alerte: 0, attention: 1, neutre: 2, bien: 3 };
  points.sort((a, b) => ordre[a.ton] - ordre[b.ton]);
  return { niveau, titre, phrase, points, chiffres: { r, parJour, parJourPrevu, rythme, manque, engagePct: pct, hab, suivant } };
}
