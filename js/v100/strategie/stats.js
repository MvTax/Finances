// stats.js (v100) — les statistiques de tes dépenses du quotidien, calculées sur les jours terminés.
//
// Tout part d'une série : la dépense de chaque jour (0 pour un jour sans dépense), sur 90 jours au plus.
//  - tendance centrale : moyenne, médiane, quartiles (la médiane résiste aux gros jours) ;
//  - dispersion : écart-type, coefficient de variation (régulier ou en dents de scie) ;
//  - saisonnalité : moyenne par jour de la semaine, jour le plus cher ;
//  - tendance : pente d'une droite de régression sur la moyenne glissante (7 jours) des 28 derniers jours ;
//  - prévision de fin de mois : reste du mois − jours restants × moyenne récente, avec une fourchette à 80 %
//    (les jours sont supposés indépendants : écart-type × √jours) et la probabilité de finir sans dépasser.
// Sous 7 jours observés, les chiffres sont donnés mais marqués « peu fiables ».

import { resteADepenser, estDepenseQuotidienne } from '../../calculs.js';
import { contributionDepense } from '../../categories.js';
import { ajouterJours, diffJours, jourSemaine } from '../../dates.js';

export const JOURS_MAX = 90;
export const JOURS_FIABLES = 7;
const Z80 = 1.2816; // 80 % d'une loi normale entre −1,2816 et +1,2816 écarts-types

const somme = (t) => t.reduce((s, x) => s + x, 0);

/** Quantile par interpolation linéaire (q entre 0 et 1) d'un tableau trié. */
export function quantile(tries, q) {
  if (!tries.length) return 0;
  const pos = (tries.length - 1) * q;
  const bas = Math.floor(pos);
  const haut = Math.ceil(pos);
  return Math.round(tries[bas] + (tries[haut] - tries[bas]) * (pos - bas));
}

/** Moyenne, médiane, quartiles, écart-type (de l'échantillon), minimum et maximum d'une série de centimes. */
export function resumer(valeurs) {
  const n = valeurs.length;
  if (!n) return { n: 0, moyenne: 0, mediane: 0, q1: 0, q3: 0, ecartType: 0, min: 0, max: 0, cv: 0 };
  const moyenne = somme(valeurs) / n;
  const variance = n > 1 ? somme(valeurs.map((v) => (v - moyenne) ** 2)) / (n - 1) : 0;
  const tries = [...valeurs].sort((a, b) => a - b);
  const ecartType = Math.sqrt(variance);
  return { n, moyenne: Math.round(moyenne), mediane: quantile(tries, 0.5), q1: quantile(tries, 0.25), q3: quantile(tries, 0.75),
    ecartType: Math.round(ecartType), min: tries[0], max: tries[n - 1], cv: moyenne > 0 ? Math.round((ecartType / moyenne) * 100) / 100 : 0 };
}

/** Droite de régression y = a + b·x sur les valeurs (x = 0, 1, 2…). Renvoie la pente b et r² (part expliquée). */
export function regression(valeurs) {
  const n = valeurs.length;
  if (n < 3) return { pente: 0, origine: n ? valeurs[0] : 0, r2: 0 };
  const mx = (n - 1) / 2;
  const my = somme(valeurs) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  valeurs.forEach((y, x) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
  const pente = sxx ? sxy / sxx : 0;
  return { pente, origine: my - pente * mx, r2: syy ? (sxy * sxy) / (sxx * syy) : 0 };
}

/** Fonction de répartition de la loi normale centrée réduite (approximation d'Abramowitz et Stegun, erreur < 1e-7). */
export function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/** Premier jour connu : la plus ancienne opération (pour ne pas compter des zéros avant le début du suivi). */
function premierJourConnu(etat) {
  let min = null;
  for (const t of etat.transactions || []) if (t.date && (!min || t.date < min)) min = t.date;
  return min;
}

/**
 * La série des jours terminés (jusqu'à hier), du plus ancien au plus récent.
 * @returns {Array<{ date, centimes }>}
 */
export function serieQuotidienne(etat, auj, { jours = JOURS_MAX } = {}) {
  const hier = ajouterJours(auj, -1);
  const premier = premierJourConnu(etat);
  if (!premier || premier > hier) return [];
  const borne = ajouterJours(auj, -jours);
  const debut = premier > borne ? premier : borne;
  // Un seul passage sur les opérations : la dépense du quotidien de chaque jour
  const parJour = new Map();
  for (const t of etat.transactions || []) {
    if (t.date < debut || t.date > hier || !estDepenseQuotidienne(t)) continue;
    const c = contributionDepense(t);
    if (c) parJour.set(t.date, (parJour.get(t.date) || 0) + c);
  }
  const serie = [];
  for (let d = debut; d <= hier; d = ajouterJours(d, 1)) serie.push({ date: d, centimes: Math.max(0, parJour.get(d) || 0) });
  return serie;
}

/**
 * Toutes les statistiques d'un coup.
 * @returns {{ fiable, serie, global, recents, parJourSemaine, jourCher, joursSansDepense, tendance, categories, prevision }}
 */
export function statsDepenses(etat, auj) {
  const serie = serieQuotidienne(etat, auj);
  const valeurs = serie.map((x) => x.centimes);
  const global = resumer(valeurs);
  const dern28 = valeurs.slice(-28);
  const recents = resumer(dern28);
  const sept = resumer(valeurs.slice(-7));

  // Par jour de la semaine (1 = lundi … 7 = dimanche)
  const parJourSemaine = [1, 2, 3, 4, 5, 6, 7].map((js) => {
    const v = serie.filter((x) => jourSemaine(x.date) === js).map((x) => x.centimes);
    return { jour: js, n: v.length, moyenneCentimes: v.length ? Math.round(somme(v) / v.length) : 0 };
  });
  const connus = parJourSemaine.filter((x) => x.n >= 2);
  const jourCher = connus.length ? [...connus].sort((a, b) => b.moyenneCentimes - a.moyenneCentimes)[0] : null;
  const jourSage = connus.length ? [...connus].sort((a, b) => a.moyenneCentimes - b.moyenneCentimes)[0] : null;

  // Tendance : pente sur 28 jours, ramenée à « par semaine » pour être lisible
  // (sur la moyenne glissante de 7 jours : sinon un samedi cher en fin de série ferait croire à une hausse)
  const lissee = dern28.length >= 10 ? dern28.slice(6).map((_, i) => somme(dern28.slice(i, i + 7)) / 7) : dern28;
  const reg = regression(lissee);
  const parSemaine = Math.round(reg.pente * 7);
  const seuil = Math.max(50, recents.moyenne * 0.05); // sous 5 % de la moyenne par semaine : stable
  const sens = dern28.length < JOURS_FIABLES || Math.abs(parSemaine) < seuil ? 'stable' : parSemaine > 0 ? 'hausse' : 'baisse';

  // Catégories sur la même fenêtre
  const debut = serie.length ? serie[0].date : auj;
  const hier = ajouterJours(auj, -1);
  const parCat = new Map();
  if (serie.length) for (const t of etat.transactions || []) {
    if (t.date < debut || t.date > hier || !estDepenseQuotidienne(t)) continue;
    const c = contributionDepense(t);
    if (c) parCat.set(t.categorie, (parCat.get(t.categorie) || 0) + c);
  }
  const cats = [...parCat.entries()].map(([categorie, montantCentimes]) => ({ categorie, montantCentimes })).filter((c) => c.montantCentimes > 0).sort((x, y) => y.montantCentimes - x.montantCentimes);
  const totalCats = somme(cats.map((c) => c.montantCentimes)) || 1;
  const categories = cats.slice(0, 6).map((c) => ({ ...c, part: Math.round((c.montantCentimes / totalCats) * 100) }));

  return {
    fiable: serie.length >= JOURS_FIABLES, jours: serie.length, serie, global, recents, sept,
    parJourSemaine, jourCher, jourSage,
    joursSansDepense: valeurs.filter((v) => v === 0).length,
    tendance: { sens, parSemaineCentimes: parSemaine, r2: Math.round(reg.r2 * 100) / 100, origine: reg.origine, pente: reg.pente },
    categories,
    prevision: previsionMois(etat, auj, recents),
  };
}

/**
 * Fin de mois : ce qu'il resterait le jour du salaire en continuant au rythme récent, avec une fourchette à 80 %.
 * Le budget d'aujourd'hui est compté tel quel (le reste du mois inclut déjà ce qui est dépensé aujourd'hui).
 */
export function previsionMois(etat, auj, recents = null) {
  const r = resteADepenser(etat, auj);
  const st = recents || resumer(serieQuotidienne(etat, auj).map((x) => x.centimes).slice(-28));
  const jours = Math.max(0, diffJours(auj, r.periode.fin)); // les jours après aujourd'hui
  const attendu = r.resteCentimes - jours * st.moyenne;
  const incertitude = Math.round(st.ecartType * Math.sqrt(jours));
  const marge = Math.round(Z80 * incertitude);
  const proba = incertitude > 0 ? phi(attendu / incertitude) : attendu >= 0 ? 1 : 0;
  // Le rythme qui fait tomber pile à zéro
  const rythmeMax = jours > 0 ? Math.floor(Math.max(0, r.resteCentimes) / jours) : Math.max(0, r.resteCentimes);
  return {
    joursRestants: jours, resteCentimes: r.resteCentimes, rythmeCentimes: st.moyenne, rythmeMaxCentimes: rythmeMax,
    attenduCentimes: Math.round(attendu), basCentimes: Math.round(attendu - marge), hautCentimes: Math.round(attendu + marge),
    probaTenir: Math.round(proba * 100) / 100, fiable: st.n >= JOURS_FIABLES,
  };
}

/**
 * Une dépense remise dans son contexte : sa part de la journée, sa place parmi tes dépenses de la même catégorie.
 * @returns {{ partDuJour, categorie: { n, moyenneCentimes, medianeCentimes, rang }, marchand: { n, totalCentimes } }}
 */
export function contexteDepense(etat, tx, auj, partDuJourCentimes) {
  const debut = ajouterJours(auj, -JOURS_MAX);
  const memes = (etat.transactions || []).filter((t) => t.id !== tx.id && t.sens === 'debit' && t.date >= debut && t.date <= auj && t.categorie === tx.categorie && t.montantCentimes > 0);
  const montants = memes.map((t) => t.montantCentimes).sort((a, b) => a - b);
  const st = resumer(montants);
  const plusPetites = montants.filter((m) => m <= tx.montantCentimes).length;
  const nomMarchand = (t) => (t.marchand || '').trim().toLowerCase();
  const per = resteADepenser(etat, auj).periode;
  const chezLui = nomMarchand(tx) ? (etat.transactions || []).filter((t) => t.sens === 'debit' && t.date >= per.debut && t.date <= auj && nomMarchand(t) === nomMarchand(tx)) : [];
  return {
    partDuJour: partDuJourCentimes > 0 ? Math.round((tx.montantCentimes / partDuJourCentimes) * 100) / 100 : null,
    categorie: { n: st.n, moyenneCentimes: st.moyenne, medianeCentimes: st.mediane, rang: st.n ? Math.round((plusPetites / st.n) * 100) : null },
    marchand: { n: chezLui.length, totalCentimes: somme(chezLui.map((t) => t.montantCentimes)) },
  };
}
