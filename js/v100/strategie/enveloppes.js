// enveloppes.js (v100) — budget par catégorie « intelligent » : où en est chaque enveloppe aujourd'hui, à quel rythme
// elle se vide, où elle finira à ce rythme, et ce que ton plafond représente face à tes habitudes des 3 derniers mois
// (le « levier » : ce que tu gagnes par mois en tenant le plafond d'une enveloppe non indispensable).

import { periodeBudget, depensesVariables } from '../../calculs.js';
import { ajouterJours, ajouterMois, dateDuMois, diffJours } from '../../dates.js';

export const JOURS_MIN_RYTHME = 3;

const catsDe = (env) => env.categories || (env.categorie ? [env.categorie] : []);

/** Plafond du mois : plafond réglé + ce que d'autres enveloppes lui ont prêté − ce qu'elle a donné. */
export function plafondDuMois(etat, env, mois) {
  let p = env.plafondMensuelCentimes || 0;
  for (const m of (etat.mouvementsEnveloppes || []).filter((x) => x.mois === mois)) {
    if (m.versEnveloppeId === env.id) p += m.montantCentimes;
    if (m.deEnveloppeId === env.id) p -= m.montantCentimes;
  }
  return p;
}

/** Dépense moyenne des 3 dernières périodes complètes pour ces catégories (0 sans historique). */
export function habitude(etat, categories, auj, nb = 3) {
  const p = periodeBudget(auj, etat.profil);
  const jour = etat.profil?.jourSalaireHabituel || 1;
  const premiere = (etat.transactions || []).reduce((m, t) => (t.date < m ? t.date : m), '9999-12-31');
  let total = 0; let n = 0;
  for (let k = 1; k <= nb; k += 1) {
    const debut = dateDuMois(ajouterMois(p.mois, -k), jour);
    const fin = ajouterJours(dateDuMois(ajouterMois(p.mois, -k + 1), jour), -1);
    if (debut < premiere) continue; // pas de données sur cette période
    total += depensesVariables(etat, debut, fin, (t) => categories.includes(t.categorie));
    n += 1;
  }
  return { centimes: n ? Math.round(total / n) : 0, periodes: n };
}

/**
 * Suivi en direct de chaque enveloppe.
 * statut : 'depasse' (plafond dépassé) · 'chaud' (à ce rythme, dépassement) · 'ok' · 'calme' (bien en dessous du rythme prévu)
 */
export function suiviEnveloppes(etat, auj) {
  const per = periodeBudget(auj, etat.profil);
  const ecoules = Math.max(1, diffJours(per.debut, auj) + 1);
  const restants = Math.max(1, diffJours(auj, per.fin) + 1);
  const dansEnveloppe = new Set();
  const lignes = (etat.enveloppes || []).map((env) => {
    const cats = catsDe(env);
    for (const c of cats) dansEnveloppe.add(c);
    const plafond = plafondDuMois(etat, env, per.mois);
    const depense = depensesVariables(etat, per.debut, auj, (t) => cats.includes(t.categorie));
    const attendu = Math.round((plafond * ecoules) / per.nbJours);
    const rythmeFin = ecoules >= JOURS_MIN_RYTHME ? Math.round((depense / ecoules) * per.nbJours) : null;
    const h = habitude(etat, cats, auj);
    let statut = 'ok';
    if (plafond > 0 && depense > plafond) statut = 'depasse';
    else if (plafond > 0 && rythmeFin !== null && rythmeFin > plafond * 1.15 && depense > attendu * 1.3 && depense >= plafond * 0.3) statut = 'chaud';
    else if (plafond > 0 && ecoules >= JOURS_MIN_RYTHME && depense < attendu * 0.6) statut = 'calme';
    return {
      id: env.id, nom: env.nom, categories: cats, vitale: !!env.vitale, sanctuarisee: !!env.sanctuarisee,
      plafondCentimes: plafond, depenseCentimes: depense, resteCentimes: plafond - depense, attenduCentimes: attendu,
      rythmeFinCentimes: rythmeFin, depassementPrevuCentimes: rythmeFin !== null ? Math.max(0, rythmeFin - plafond) : 0,
      habitudeCentimes: h.centimes, habitudePeriodes: h.periodes, statut,
      // Face aux habitudes : plafond « ambitieux » (moins de la moitié de l'habitude), « large » (plus d'une fois et demie), sinon « réaliste »
      lecture: !h.periodes || !plafond ? null : plafond < h.centimes * 0.5 ? 'ambitieux' : plafond > h.centimes * 1.5 ? 'large' : 'realiste',
      // Levier : ce que tenir ce plafond fait gagner par mois par rapport à l'habitude (enveloppes non indispensables seulement)
      levierMensuelCentimes: !env.vitale && h.periodes ? Math.max(0, h.centimes - plafond) : 0,
      parJourRestantCentimes: Math.max(0, Math.floor((plafond - depense) / restants)),
      part: plafond > 0 ? Math.min(1.5, depense / plafond) : 0,
    };
  });
  const hors = depensesVariables(etat, per.debut, auj, (t) => !dansEnveloppe.has(t.categorie));
  const somme = (f) => lignes.reduce((s, l) => s + f(l), 0);
  return {
    periode: per, joursEcoules: ecoules, joursRestants: restants, avancement: ecoules / per.nbJours, lignes, horsEnveloppesCentimes: hors,
    total: { plafondCentimes: somme((l) => l.plafondCentimes), depenseCentimes: somme((l) => l.depenseCentimes) + hors, resteCentimes: somme((l) => l.plafondCentimes) - somme((l) => l.depenseCentimes) - hors },
    alertes: lignes.filter((l) => l.statut === 'depasse' || l.statut === 'chaud'),
    levierMensuelCentimes: somme((l) => l.levierMensuelCentimes), habitudesCentimes: somme((l) => l.habitudeCentimes),
  };
}
