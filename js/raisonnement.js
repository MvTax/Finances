// raisonnement.js — transforme les chiffres du mois en constats expliqués : ce qui se passe, pourquoi, et donc quoi faire.
// Tout est calculé ici, sur le téléphone, sans IA, avec le MOIS EN COURS seulement (les mois passés servent
// aux statistiques : voir habitudes() et la page Statistiques). Chaque point suit la même logique :
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

/** Plus gros poste du quotidien depuis le début du mois (catégorie), pour savoir où freiner. */
function principalPoste(etat, debut, fin) {
  const m = new Map();
  for (const t of etat.transactions || []) {
    if (t.date < debut || t.date > fin || t.ajustement || !estDepenseQuotidienne(t)) continue;
    const v = contributionDepense(t);
    if (v > 0) m.set(t.categorie, (m.get(t.categorie) || 0) + v);
  }
  const [id, centimes] = [...m.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return id && centimes >= 1000 ? { id, nom: categorie(id).nom, centimes } : null;
}

/** Ce qui change le mois suivant : remboursements, charges, budget par jour estimé. */
function moisSuivant(etat, r) {
  const p2 = periodeBudget(ajouterJours(r.periode.fin, 1), etat.profil || {}, { reference: r.periode.fin });
  const dettes = dettesPeriode(etat, p2);
  const charges = chargesFixesPeriode(etat, p2);
  const revenus = revenusDuMois(etat, p2.mois).totalCentimes || r.revenus.totalCentimes;
  const totalDettes = dettes.reduce((s, d) => s + d.montantCentimes, 0);
  const totalCharges = charges.reduce((s, c) => s + c.montantPrevuCentimes, 0);
  const cible = epargneCible(etat, p2.mois, p2);
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
  const enveloppe = rev - r.epargneCibleCentimes - r.chargesCentimes - r.dettesCentimes - (r.prevuesCentimes || 0); // tout le quotidien du mois
  const parJourPrevu = Math.round(enveloppe / per.nbJours);
  const salaire = formatDateCourte(per.salaireAttenduLe || ajouterJours(per.fin, 1));
  const suivant = rev > 0 ? moisSuivant(etat, r) : null;
  const points = [];

  if (rev <= 0) {
    return { niveau: 'attention', titre: 'Revenus du mois à saisir', phrase: 'Sans ton salaire du mois, l’app ne peut pas savoir ce que tu peux dépenser.', points: [], chiffres: { r, parJour } };
  }

  // 1. Le mois en cours : ce que tu dépenses depuis le salaire, au fur et à mesure.
  const dep = r.depensesVariablesCentimes;
  const rythme = Math.round(dep / joursPasses);
  // Manque projeté au rythme de CE mois (après 5 jours, avant c'est trop tôt pour juger)
  const manque = joursPasses >= 5 ? Math.max(0, rythme * joursRestants - resteMatin) : 0;
  const posteDuMois = principalPoste(etat, per.debut, dateIso);
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
        donc: (r.resteCentimes > 0 ? `Pour finir le mois à zéro, il faut descendre à ${exact(Math.round(r.resteCentimes / joursRestants))} par jour à partir d’aujourd’hui.` : 'Le budget est épuisé : chaque jour sans dépense réduit le découvert.')
          + (posteDuMois ? ` Ce mois-ci, le plus gros poste est « ${posteDuMois.nom} » (${exact(posteDuMois.centimes)}).` : ''),
        action: { libelle: 'Conseils pour dépenser moins', route: 'statistiques/conseils' },
      });
    }
  }

  // 2. Ce qui pèse sur le mois : prélèvements et remboursements, et comment ça évolue.
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
          ? ` Comme l’épargne prend tout ce qui dépasse tes dépenses obligatoires, elle monte à ${exact(suivant.cibleCentimes)} ce mois-là (contre ${exact(r.epargneCibleCentimes)} maintenant), et ton budget du jour reste autour de ${env(suivant.parJourCentimes)}.`
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

  // 3. L'épargne passe après les dépenses obligatoires : le maximum possible, pas un montant fixe.
  const cible = r.epargneCibleCentimes;
  const visee = r.epargneViseeCentimes ?? cible;
  const obligatoires = `tes prélèvements (${exact(r.chargesCentimes)})${r.dettesCentimes ? `, tes remboursements (${exact(r.dettesCentimes)})` : ''} et le nécessaire du quotidien (environ ${env(r.besoinsVitauxCentimes || 0)} de courses, transports, santé)`;
  if (visee === 0) {
    points.push({
      id: 'epargne', ton: 'neutre', titre: 'Pas d’épargne ce mois-ci, et c’est normal',
      constat: `Après ${obligatoires}, il ne reste rien à mettre de côté.`,
      pourquoi: 'L’épargne passe après tes dépenses obligatoires : épargner maintenant voudrait dire manquer pour vivre, ou passer à découvert.',
      donc: r.dettesCentimes ? 'Dès que des remboursements se terminent, l’app remet automatiquement de l’argent de côté.' : 'Si un prélèvement baisse ou que tes revenus montent, l’épargne reprendra toute seule.',
      action: { libelle: 'Voir mon plan', route: 'epargne/plan' },
    });
  } else if (cible < visee) {
    points.push({
      id: 'epargne', ton: 'attention', titre: 'Ton épargne baisse ce mois-ci',
      constat: `L’app visait ${exact(visee)} d’épargne ; avec tes dépenses, il en reste ${exact(cible)}.`,
      pourquoi: 'L’épargne passe après tes dépenses : quand elles dépassent, c’est elle qui baisse d’abord, avant que ton compte soit en difficulté.',
      donc: `Chaque euro non dépensé d’ici le salaire du ${salaire} retourne à l’épargne.`,
      action: { libelle: 'Voir mon plan', route: 'epargne/plan' },
    });
  } else {
    points.push({
      id: 'epargne', ton: 'bien', titre: `Tu peux mettre ${exact(cible)} de côté`,
      constat: `C’est le maximum possible ce mois-ci : ce qui reste après ${obligatoires}.`,
      pourquoi: 'Pas de montant fixe : l’épargne passe après tes dépenses obligatoires. Quand elles baissent, l’épargne monte ; quand elles montent, elle baisse, sans te mettre à découvert.',
      donc: `Si tu dépenses moins que prévu, le surplus au salaire du ${salaire} s’ajoute aussi à l’épargne.`,
      action: { libelle: 'Voir mon plan', route: 'epargne/plan' },
    });
  }

  // 4. Le compte courant dans les 7 jours : la date compte autant que le montant.
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

  // 5. Les abonnements : l'économie qui se répète tous les mois.
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

  // Verdict : la conclusion qui découle des points (mois en cours uniquement).
  let niveau; let titre; let phrase;
  const freine = posteDuMois ? ` Freine surtout sur « ${posteDuMois.nom} ».` : '';
  if (r.resteCentimes < 0) {
    niveau = 'depasse'; titre = 'Budget du mois dépassé';
    phrase = `Tu as dépassé de ${exact(-r.resteCentimes)}. Chaque jour sans dépense d’ici le ${salaire} réduit ce trou.`;
  } else if (alerteTreso && manque <= resteMatin * 0.25) {
    niveau = 'tendu'; titre = 'Attention au découvert';
    const t = points.find((x) => x.id === 'tresorerie');
    phrase = `Ton budget du mois tient, mais l’argent n’est pas au bon endroit : ${t.constat.charAt(0).toLowerCase()}${t.constat.slice(1)} Fais un virement vers ce compte avant.`;
  } else if (alerteTreso || manque > resteMatin * 0.25) {
    niveau = 'tendu'; titre = 'Mois serré';
    phrase = `À ton rythme depuis le salaire (${exact(rythme)} par jour), il manquerait environ ${env(manque)} avant le ${salaire}. Il faut descendre à ${exact(parJour)} par jour.${freine}`;
  } else if (manque > 0 || rythme > parJourPrevu || pct > 60) {
    niveau = 'attention'; titre = 'Mois à surveiller';
    phrase = pct > 60
      ? `Tes engagements prennent ${pct} % du salaire : il te reste ${exact(parJour)} par jour jusqu’au ${salaire}. Ça tient si tu restes à ce rythme.`
      : `Ça peut tenir si tu restes autour de ${exact(parJour)} par jour.${freine}`;
  } else {
    niveau = 'ok'; titre = 'Tu es dans les clous';
    phrase = `À ce rythme, il te restera de l’argent au salaire du ${salaire}. Il ira dans ton épargne.`;
  }
  const ordre = { alerte: 0, attention: 1, neutre: 2, bien: 3 };
  points.sort((a, b) => ordre[a.ton] - ordre[b.ton]);
  return { niveau, titre, phrase, points, chiffres: { r, parJour, parJourPrevu, rythme, manque, engagePct: pct, posteDuMois, suivant } };
}
