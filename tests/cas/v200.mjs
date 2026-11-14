// v200.mjs — calculs de v200 (js/v200/calculs/) : habitudes, risque du mois, résumés et préventions.
// Dates fixes, montants inventés. Cas : aucune donnée, peu de données, veille du salaire, journée avant 5 h,
// sauvegarde synthétique.
import { egal, vrai, egalProfond } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { categoriesFavorites, montantsRapides, montantDepart, CATEGORIES_REPLI } from '../../js/v200/calculs/habitudes.js';
import { risqueDuMois, chargesAvantSalaire } from '../../js/v200/calculs/risques.js';
import { resumeMois, resumeAnnee, preventions } from '../../js/v200/calculs/resume.js';
import { eur, arrondi10 } from '../../js/v200/calculs/commun.js';
import { bulleDuJour, phraseDuJour, noteAujourdhui, texteBulle, ligneDuJour, ligneCharge } from '../../js/v200/calculs/jour.js';
import { serieJours, flammesDesJours } from '../../js/jeu.js';
import { montantParle } from '../../js/v200/ui/molette.js';
import { nomCourt, titreJour, natureLigne, estVisible, depuisSalaire, joursDepenses, periodePrecedente, premiereDate, NOM_COURT_MAX } from '../../js/v200/calculs/depenses.js';
import { potsEpargne, rythmePoche, finEstimee, rythmeEnvie, virementDuJour, phraseArrondis } from '../../js/v200/calculs/pots.js';
import { meteoDuMois, phrasesMois, phrasesAnnee, METEO } from '../../js/v200/calculs/resume.js';
import { jourBudgetaire } from '../../js/restes.js';
import { forcerAujourdhui, ajouterJours, jourSemaine } from '../../js/dates.js';
import { genererSauvegarde, REFERENCE_DEFAUT } from '../outils/generer-sauvegarde.mjs';

const NIVEAUX_RISQUE = ['calme', 'attention', 'risque', 'pas-assez'];
const revenus = (mois, salaire = 120000) => ({ mois, salaireCentimes: salaire, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' });
const etat = (o = {}) => {
  const e = etatBase({ privations: [], depensesPrevues: [], ...o });
  e.profil.loyerAPayerCentimes = null;
  e.profil.repasAuto = { actif: false };
  e.profil.parametresPlan = { vieMinCentimes: 30000, margeMinCentimes: 1000, arrondisEstimesCentimes: 0 };
  e.meta = {};
  return e;
};
/** Une dépense par jour de `debut` à `fin` (montant selon le jour). */
const chaqueJour = (debut, fin, montant, categorie = 'courses') => {
  const res = [];
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) { const m = montant(d); if (m) res.push(tx({ date: d, montant: m, categorie, marchand: 'Commerce Exemple' })); }
  return res;
};
/** Une phrase propre : pas de trou de données, pas de HTML, courte. */
function phraseOk(p, message = '') {
  vrai(typeof p === 'string' && p.length > 0, `${message} phrase vide`);
  vrai(!/undefined|NaN|null|\[object/.test(p), `${message} trou dans « ${p} »`);
  vrai(!/[<>]/.test(p), `${message} HTML dans « ${p} »`);
  vrai(p.length <= 220, `${message} trop longue : « ${p} »`);
}
/** Espaces insécables des montants (« 1 000 € ») remplacées par des espaces simples, pour comparer. */
const sp = (x) => (typeof x === 'string' ? x.replace(/[\u202f\u00a0]/g, ' ') : x);
const avecDate = (auj, fn) => { forcerAujourdhui(auj); try { return fn(); } finally { forcerAujourdhui(null); } };

export default [
  { nom: 'aiguillage : v200 par défaut, « v100 » réécrit en v200, « origine » gardée, ?app= prioritaire', fn: async () => {
    await import('../../js/aiguillage.js'); // script classique : chargé en module, il ne fait qu'exposer son choix
    const choix = globalThis.choixAppBudget;
    egalProfond(choix(null, null), { app: 'v200', aGarder: null }, 'rien de gardé : la nouvelle app');
    egalProfond(choix(null, 'v200'), { app: 'v200', aGarder: null });
    egalProfond(choix(null, 'v100'), { app: 'v200', aGarder: 'v200' }, 'l’ancien Cockpit ouvre v200 et le choix est réécrit');
    egalProfond(choix(null, 'origine'), { app: 'origine', aGarder: null }, 'l’ancienne app, choisie, reste');
    egalProfond(choix(null, 'nimporte'), { app: 'v200', aGarder: 'v200' });
    egalProfond(choix('v100', 'origine'), { app: 'v200', aGarder: 'v200' }, '?app=v100 ouvre v200');
    egalProfond(choix('origine', 'v200'), { app: 'origine', aGarder: 'origine' });
    egalProfond(choix('v200', 'origine'), { app: 'v200', aGarder: 'v200' });
    egalProfond(choix('v200', 'v200'), { app: 'v200', aGarder: null });
  } },
  { nom: 'outils : montants lisibles et arrondi aux 10 centimes', fn: () => {
    egal(eur(1200), '12 €'); egal(eur(-1230), '12,30 €');
    egal(arrondi10(455), 460); egal(arrondi10(404), 400); egal(arrondi10(1000), 1000);
    // La molette dit le montant à VoiceOver
    egal(montantParle(730), '7 euros 30'); egal(montantParle(100), '1 euro'); egal(montantParle(50), '0 euro 50'); egal(montantParle(23000), '230 euros'); egal(montantParle(1205), '12 euros 05');
  } },
  { nom: 'aucune donnée : listes de repli, rien d’inventé, « pas assez », phrases simples', fn: () => avecDate('2026-11-09', () => {
    const e = etat();
    const fav = categoriesFavorites(e, '2026-11-09');
    egalProfond(fav.map((x) => x.categorie), CATEGORIES_REPLI.slice(0, 6));
    vrai(fav.every((x) => !x.habituelle && x.nb === 0 && x.nom));
    egalProfond(montantsRapides(e, 'courses', '2026-11-09'), []);
    egal(montantDepart(e, 'courses', '2026-11-09'), null);
    const r = risqueDuMois(e, '2026-11-09');
    egal(r.niveau, 'pas-assez'); phraseOk(r.phrase);
    const m = resumeMois(e, '2026-11-09');
    egal(m.totalCentimes, 0); egalProfond(m.top, []); egal(m.comparaison, null); egal(m.joursClos, 0);
    egal(m.phrases[0], 'Aucune dépense du quotidien notée depuis le salaire.');
    const a = resumeAnnee(e, '2026-11-09');
    egal(a.periodes.length, 0); egal(a.plusCalme, null); m.phrases.concat(a.phrases).forEach((p) => phraseOk(p));
    egalProfond(preventions(e, '2026-11-09'), []);
  }) },
  { nom: 'peu de données : favorites complétées, montants arrondis à 0,10 €, médiane, pas encore de prévision', fn: () => avecDate('2026-11-09', () => {
    const A = '2026-11-09';
    const e = etat({ revenusMensuels: [revenus('2026-11')], transactions: [
      tx({ date: '2026-11-06', montant: 455, categorie: 'vtc' }), tx({ date: '2026-11-07', montant: 412, categorie: 'vtc' }),
      tx({ date: '2026-11-08', montant: 1000, categorie: 'vtc' }), tx({ date: '2026-11-08', montant: 452, categorie: 'vtc' }),
      tx({ date: '2026-11-08', montant: 850, categorie: 'courses' }),
      // Ni le loyer, ni un virement d'épargne, ni une dépense de plus de 90 jours ne comptent dans les habitudes
      tx({ date: '2026-11-08', montant: 23000, categorie: 'logement', chargeFixeId: 'loyer' }),
      tx({ date: '2026-11-08', montant: 5000, categorie: 'epargne', epargne: true }),
    ] });
    const fav = categoriesFavorites(e, A);
    egalProfond(fav.slice(0, 2).map((x) => [x.categorie, x.nb, x.habituelle]), [['vtc', 4, true], ['courses', 1, true]]);
    egal(fav.length, 6); vrai(fav.slice(2).every((x) => !x.habituelle)); vrai(!fav.some((x) => ['logement', 'epargne', 'loisirs'].includes(x.categorie) && x.habituelle));
    egal(new Set(fav.map((x) => x.categorie)).size, 6, 'pas de doublon');
    egal(categoriesFavorites(e, A, 1).length, 1);
    // 4,55 → 4,60 ; 4,12 → 4,10 ; 4,52 → 4,50 ; 10 € : chacun une fois, du plus petit au plus grand
    egalProfond(montantsRapides(e, 'vtc', A), [{ montantCentimes: 410, nb: 1 }, { montantCentimes: 450, nb: 1 }, { montantCentimes: 460, nb: 1 }, { montantCentimes: 1000, nb: 1 }]);
    egalProfond(montantsRapides(e, 'vtc', A, 2).map((x) => x.montantCentimes), [410, 450]);
    egal(montantDepart(e, 'vtc', A), 460, 'médiane de 4,10 / 4,50 / 4,60 / 10 = 4,55 → 4,60');
    egal(montantDepart(e, 'courses', A), 850);
    const ancien = etat({ transactions: [tx({ date: '2026-08-10', montant: 999, categorie: 'loisirs' }), tx({ date: '2026-08-11', montant: 1500, categorie: 'loisirs' })] });
    egal(montantDepart(ancien, 'loisirs', A), 1500, 'plus de 90 jours : oublié (le 10 août), 90 jours pile : compté (le 11)');
    const r = risqueDuMois(e, A);
    egal(r.niveau, 'pas-assez'); egal(r.details.fiable, false); phraseOk(r.phrase);
    const m = resumeMois(e, A);
    egal(m.totalCentimes, 455 + 412 + 1000 + 452 + 850);
    egalProfond(m.top.map((x) => [x.categorie, x.montantCentimes]), [['vtc', 2319], ['courses', 850]]);
    egal(m.top[0].part + m.top[1].part, 100);
    egal(m.comparaison, null, 'le mois d’avant est inconnu');
    vrai(/VTC \(23,19 €\) et Courses \(8,50 €\)/.test(m.phrases[0]), m.phrases[0]);
    m.phrases.forEach((p) => phraseOk(p));
  }) },
  { nom: 'veille du salaire : dernier jour, prélèvement non couvert d’abord, charge du mois suivant annoncée', fn: () => avecDate('2026-12-04', () => {
    const A = '2026-12-04'; // période du 5 novembre au 4 décembre
    const base = {
      revenusMensuels: [revenus('2026-11'), revenus('2026-12')],
      chargesFixes: [
        { id: 'loyer', libelle: 'Loyer', montantCentimes: 23000, jourPrelevement: 10, actif: true, compteId: 'courant', categorie: 'logement' },
        { id: 'forfait', libelle: 'Forfait mobile', montantCentimes: 1500, jourPrelevement: 6, actif: true, compteId: 'courant', categorie: 'telephonie' },
      ],
      transactions: [
        tx({ date: '2026-11-05', montant: 120000, sens: 'credit', categorie: 'salaire', marchand: 'Salaire' }),
        tx({ date: '2026-11-10', montant: 23000, categorie: 'logement', chargeFixeId: 'loyer' }),
        tx({ date: '2026-11-06', montant: 1500, categorie: 'telephonie', chargeFixeId: 'forfait' }),
        ...chaqueJour('2026-11-05', '2026-12-03', () => 1000),
      ],
    };
    const e = etat(base);
    const r = risqueDuMois(e, A);
    egal(r.details.joursRestants, 0); egal(r.details.fiable, true);
    vrai(/^Dernier jour avant le salaire/.test(r.phrase), r.phrase); phraseOk(r.phrase);
    egal(chargesAvantSalaire(e, A).liste.length, 0, 'tout est payé dans la période');
    const pv = preventions(e, A);
    egalProfond(pv.map((x) => x.type), ['charge-proche']);
    egal(pv[0].phrase, '« Forfait mobile » (15 €) passe dans 2 jours.');
    // Une assurance de 900 € le 4 que le compte (1 200 − 230 − 15 − 29 × 10 = 665 €) ne couvre pas
    const e2 = etat({ ...base, chargesFixes: [...base.chargesFixes, { id: 'assurance', libelle: 'Assurance', montantCentimes: 90000, jourPrelevement: 4, actif: true, compteId: 'courant', categorie: 'autres' }] });
    const r2 = risqueDuMois(e2, A);
    egal(r2.niveau, 'risque'); vrai(/ne couvre pas « Assurance » le 04\/12/.test(r2.phrase), r2.phrase);
    egal(r2.details.charges.nb, 1); egal(r2.details.charges.totalCentimes, 90000);
    const pv2 = preventions(e2, A);
    egalProfond(pv2.map((x) => x.type), ['prelevement-non-couvert', 'charge-proche'], 'ordre fixe, l’assurance n’est pas répétée');
    egal(pv2[0].manqueCentimes, 90000 - (120000 - 23000 - 1500 - 29 * 1000));
    vrai(/aujourd’hui : ton compte n’aura pas assez/.test(pv2[0].phrase), pv2[0].phrase);
    pv2.forEach((x) => phraseOk(x.phrase));
    const m = resumeMois(e, A);
    egal(m.joursClos, 29); egal(m.joursSansDepense, 0); egal(m.totalCentimes, 29 * 1000);
  }) },
  { nom: 'journée avant 5 h : 3 h 30 le mardi, c’est encore lundi (demain = mardi, le jour cher)', fn: () => {
    const auj = jourBudgetaire(new Date('2026-11-10T02:30:00Z')); // 3 h 30 à Paris
    egal(auj, '2026-11-09'); egal(jourSemaine(auj), 1);
    avecDate(auj, () => {
      // Cinq semaines : 40 € le mardi, 10 € les autres jours ; une dépense notée cette nuit est datée de lundi
      const e = etat({ revenusMensuels: [revenus('2026-10'), revenus('2026-11')],
        transactions: [...chaqueJour('2026-10-05', '2026-11-08', (d) => (jourSemaine(d) === 2 ? 4000 : 1000), 'restaurants'), tx({ date: auj, montant: 650, categorie: 'vtc' })] });
      const pv = preventions(e, auj);
      egalProfond(pv.map((x) => x.type), ['jour-cher']);
      vrai(/^Demain, c’est mardi : d’habitude ton jour le plus cher \(40 € en moyenne\)\.$/.test(pv[0].phrase), pv[0].phrase);
      egal(preventions(e, '2026-11-10').length, 0, 'le mardi lui-même : demain est un mercredi');
      const m = resumeMois(e, auj);
      vrai(m.top.some((x) => x.categorie === 'vtc' && x.montantCentimes === 650), 'la dépense de la nuit compte pour lundi');
      egal(m.joursClos, 4); // du 5 au 8 novembre
      vrai(m.comparaison !== null);
      egal(m.comparaison.precedentCentimes, 1000 + 4000 + 3 * 1000, 'même nombre de jours le mois d’avant (lundi 5 → vendredi 9 octobre)');
      egal(categoriesFavorites(e, auj)[0].categorie, 'restaurants');
      egalProfond(montantsRapides(e, 'restaurants', auj), [{ montantCentimes: 1000, nb: 30 }, { montantCentimes: 4000, nb: 5 }]);
    });
  } },
  { nom: 'envie presque atteinte (80 %), puis prête ; au plus 3 préventions dans l’ordre fixe', fn: () => avecDate('2026-11-09', () => {
    const A = '2026-11-09';
    const envies = (montant) => ({ depuis: '2026-11-05', liste: [{ id: 'env1', nom: 'Jeu exemple', type: 'jeu', montantCentimes: montant, creeLe: '2026-11-05', achat: null }] });
    const priv = [{ id: 'p1', date: '2026-11-06', categorie: 'restaurants', libelle: 'Un resto', montantCentimes: 3000, vireLe: null }];
    const e = etat({ revenusMensuels: [revenus('2026-11')], privations: priv });
    e.profil.envies = envies(1000); // 30 % de 30 € = 9 € sur 10 €
    const pv = preventions(e, A);
    egalProfond(pv.map((x) => x.type), ['envie-presque']); egal(pv[0].phrase, 'Plus que 1 € pour « Jeu exemple ».');
    e.profil.envies = envies(900);
    egal(preventions(e, A)[0].type, 'envie-prete');
    e.profil.envies = envies(5000); // 18 % : rien
    egal(preventions(e, A).length, 0);
    // Trois charges dans les 4 jours, dont une non couverte : l'envie n'est plus citée
    e.profil.envies = envies(1000);
    e.chargesFixes = [
      { id: 'c1', libelle: 'Charge un', montantCentimes: 90000, jourPrelevement: 10, actif: true, compteId: 'courant', categorie: 'autres' },
      { id: 'c2', libelle: 'Charge deux', montantCentimes: 1000, jourPrelevement: 11, actif: true, compteId: 'courant', categorie: 'autres' },
      { id: 'c3', libelle: 'Charge trois', montantCentimes: 2000, jourPrelevement: 12, actif: true, compteId: 'courant', categorie: 'autres' },
    ];
    const pv2 = preventions(e, A);
    egalProfond(pv2.map((x) => x.type), ['prelevement-non-couvert', 'charge-proche', 'charge-proche']);
    vrai(/^« Charge un » \(900 €\) passe demain/.test(pv2[0].phrase), pv2[0].phrase);
    egal(pv2[1].phrase, '« Charge deux » (10 €) passe dans 2 jours.');
  }) },
  { nom: 'risque : calme, attention et risque selon la chance de finir le mois', fn: () => avecDate('2026-11-20', () => {
    const A = '2026-11-20'; // encore 14 jours après aujourd'hui jusqu'au 4 décembre
    const etatRythme = (montant) => etat({ revenusMensuels: [revenus('2026-11')], transactions: [
      tx({ date: '2026-11-05', montant: 120000, sens: 'credit', categorie: 'salaire', marchand: 'Salaire' }),
      ...chaqueJour('2026-11-05', '2026-11-19', (d) => montant + (Number(d.slice(8)) % 2 ? 200 : -200)),
    ] });
    // Reste du mois : 310 € (vie courante + marge) − ce qui est déjà dépensé ; 15 jours notés, un jour sur deux ± 2 €
    const calme = risqueDuMois(etatRythme(500), A);
    egal(calme.niveau, 'calme'); vrai(/^Ça tient : à ton rythme, il te resterait environ/.test(calme.phrase), calme.phrase);
    const risque = risqueDuMois(etatRythme(1500), A);
    egal(risque.niveau, 'risque'); vrai(/^À ton rythme \(15,13 € par jour\), tu dépasserais d’environ .+ d’ici le salaire\. Pour tenir, vise .+ par jour\.$/.test(risque.phrase), risque.phrase);
    // Rythme qui tombe presque pile : entre 50 et 80 % de chances
    let trouve = null;
    for (let m = 900; m <= 1300 && !trouve; m += 10) { const r = risqueDuMois(etatRythme(m), A); if (r.niveau === 'attention') trouve = r; }
    vrai(trouve, 'un rythme donne « attention »');
    vrai(trouve.details.probaTenir >= 0.5 && trouve.details.probaTenir < 0.8);
    vrai(/^Ça passe juste : garde au plus .+ par jour jusqu’au salaire\.$/.test(trouve.phrase), trouve.phrase);
  }) },
  { nom: 'sauvegarde synthétique : chiffres cohérents et phrases propres sur toute l’année', fn: () => {
    const c = genererSauvegarde().contenu;
    const R = REFERENCE_DEFAUT;
    for (const d of [R, ajouterJours(R, -9), ajouterJours(R, -8), ajouterJours(R, -60)]) avecDate(d, () => {
      const fav = categoriesFavorites(c, d);
      egal(fav.length, 6); vrai(fav.every((x) => x.habituelle && x.nb > 0), 'un an de données : que des vraies favorites');
      vrai(fav.every((x, i) => i === 0 || fav[i - 1].nb >= x.nb), 'triées par fréquence');
      const rap = montantsRapides(c, fav[0].categorie, d);
      egal(rap.length, 4); vrai(rap.every((x, i) => x.montantCentimes % 10 === 0 && (i === 0 || rap[i - 1].montantCentimes < x.montantCentimes)));
      const dep = montantDepart(c, fav[0].categorie, d);
      vrai(dep > 0 && dep % 10 === 0);
      const r = risqueDuMois(c, d);
      vrai(NIVEAUX_RISQUE.includes(r.niveau)); egal(r.details.fiable, true); phraseOk(r.phrase, d);
      const m = resumeMois(c, d);
      vrai(m.top.length === 3 && m.top.reduce((s, x) => s + x.part, 0) <= 100); vrai(m.comparaison !== null);
      vrai(m.top.every((x, i) => i === 0 || m.top[i - 1].montantCentimes >= x.montantCentimes));
      m.phrases.forEach((p) => phraseOk(p, d));
      const a = resumeAnnee(c, d);
      vrai(a.periodes.length >= 10 && a.periodes.length <= 12, `${a.periodes.length} périodes`);
      if (d >= ajouterJours(R, -9)) egal(a.periodes.length, 12);
      vrai(a.periodes[a.periodes.length - 1].enCours); vrai(a.periodes.slice(0, -1).every((x) => !x.enCours));
      vrai(a.periodes.every((x, i) => i === 0 || a.periodes[i - 1].fin < x.debut), 'du plus ancien au plus récent, sans chevauchement');
      vrai(a.periodes.every((x) => ['calme', 'moyen', 'charge'].includes(x.niveau)));
      vrai(a.plusCalme && a.plusCalme.complete && a.periodes.filter((x) => x.complete).every((x) => x.parJourCentimes >= a.plusCalme.parJourCentimes));
      egal(a.totalEpargneCentimes, a.totalVerseCentimes - a.totalReprisCentimes);
      a.phrases.forEach((p) => phraseOk(p, d));
      const pv = preventions(c, d);
      vrai(pv.length <= 3); pv.forEach((x) => phraseOk(x.phrase, d));
      const b = bulleDuJour(c, d);
      vrai(['ok', 'jour-depasse', 'mois-depasse'].includes(b.etat)); vrai(b.montantCentimes >= 0 && b.part >= 0 && b.part <= 1);
      const ph = phraseDuJour(c, d);
      vrai(ph && ph.emoji); phraseOk(ph.phrase, d);
    });
  } },
  { nom: 'Aujourd’hui : bulle vide sans données, puis reste du jour, dépassement du jour et du mois', fn: () => avecDate('2026-11-09', () => {
    const A = '2026-11-09'; // période du 5 novembre au 4 décembre : 26 jours avec aujourd'hui
    const vide = etat();
    egalProfond([bulleDuJour(vide, A).etat, bulleDuJour(vide, A).part], ['vide', 1]);
    egal(phraseDuJour(vide, A), null, 'sans données : pas de phrase, seulement « Note ta première dépense »');
    // Rien dépensé aujourd'hui : toute la part du jour, soleil plein
    const e = etat({ revenusMensuels: [revenus('2026-11')], transactions: [tx({ date: '2026-11-08', montant: 1500, categorie: 'courses', source: 'manuel' })] });
    const b0 = bulleDuJour(e, A);
    const P = b0.parJourCentimes;
    vrai(P > 1000, `part du jour ${P}`);
    egal(b0.etat, 'ok'); egal(b0.montantCentimes, P); egal(b0.part, 1);
    // Une dépense de 7,30 € aujourd'hui : la part figée du matin ne bouge pas, le reste baisse d'autant
    e.meta.jauge = b0.jauge.instantane;
    e.transactions.push(tx({ date: A, montant: 730, categorie: 'restauration-rapide', source: 'manuel' }));
    const b1 = bulleDuJour(e, A);
    egal(b1.parJourCentimes, P); egal(b1.montantCentimes, P - 730); vrai(Math.abs(b1.part - (P - 730) / P) < 1e-9);
    // Avec l'arrondi actif : 7,30 € + 0,70 € d'arrondi = 8 €
    const ea = etat({ revenusMensuels: [revenus('2026-11')], transactions: [tx({ date: '2026-11-08', montant: 1500, categorie: 'courses', source: 'manuel' })] });
    ea.profil.arrondi = { ...ea.profil.arrondi, actif: true, depuis: '2026-01-01' };
    const a0 = bulleDuJour(ea, A); ea.meta.jauge = a0.jauge.instantane;
    ea.transactions.push(tx({ date: A, montant: 730, categorie: 'restauration-rapide', source: 'manuel' }));
    egal(bulleDuJour(ea, A).montantCentimes, a0.montantCentimes - 800);
    // Dépassé aujourd'hui
    e.transactions.push(tx({ date: A, montant: P, categorie: 'loisirs', source: 'manuel' }));
    const b2 = bulleDuJour(e, A);
    egalProfond([b2.etat, b2.montantCentimes, b2.part], ['jour-depasse', 730, 0]);
    // Mois dépassé
    e.transactions.push(tx({ date: A, montant: 200000, categorie: 'loisirs', source: 'manuel' }));
    egal(bulleDuJour(e, A).etat, 'mois-depasse');
  }) },
  { nom: 'phrase du jour : série à garder, puis ce soir vers les pots, puis la série ; prévention urgente d’abord', fn: () => avecDate('2026-11-09', () => {
    const A = '2026-11-09';
    const poches = [
      { id: 'p-secu', nom: 'Sécurité', type: 'coussin', cibleCentimes: 100000, priorite: 2, partRepartition: 50, soldeInitialCentimes: 0, mouvements: [], actif: true },
      { id: 'p-pret', nom: 'Prêt', type: 'remboursementAnticipe', cibleCentimes: 300000, priorite: 1, partRepartition: 50, soldeInitialCentimes: 0, mouvements: [], actif: true },
    ];
    const e = etat({ revenusMensuels: [revenus('2026-11')], poches, transactions: [
      tx({ date: '2026-11-07', montant: 500, categorie: 'courses', source: 'manuel' }), tx({ date: '2026-11-08', montant: 600, categorie: 'courses', source: 'manuel' }),
    ] });
    // Hier et avant-hier notés, rien aujourd'hui : la série est à garder
    egal(noteAujourdhui(e, A), false);
    const p1 = phraseDuJour(e, A);
    egal(p1.type, 'serie-a-garder'); egal(p1.emoji, '🔥'); egal(p1.phrase, '2 jours de suite : note une dépense aujourd’hui pour garder ta série.');
    // Noté aujourd'hui : ce qui reste de la journée partira ce soir vers les pots (ici Sécurité et Prêt, sans envie)
    e.transactions.push(tx({ date: A, montant: 300, categorie: 'courses', source: 'manuel' }));
    egal(noteAujourdhui(e, A), true);
    const p2 = phraseDuJour(e, A);
    egal(p2.type, 'ce-soir'); phraseOk(p2.phrase);
    vrai(/^Ce soir, .+ iront à Sécurité et Prêt, si tu ne dépenses plus rien\.$/.test(p2.phrase), p2.phrase);
    // Plus rien à dépenser : la série, simplement
    e.transactions.push(tx({ date: A, montant: 10000, categorie: 'loisirs', source: 'manuel' }));
    const p3 = phraseDuJour(e, A);
    egal(p3.type, 'serie'); vrai(/^3 jours de suite\. Continue comme ça/.test(p3.phrase), p3.phrase);
    // Une charge qui passe dans 2 jours passe avant tout
    e.chargesFixes = [{ id: 'cf-exemple', libelle: 'Abonnement exemple', montantCentimes: 1500, jourPrelevement: 11, actif: true, compteId: 'courant', categorie: 'abonnements' }];
    const p4 = phraseDuJour(e, A);
    vrai(['charge-proche', 'prelevement-non-couvert'].includes(p4.type), p4.type); vrai(['📅', '⚠️'].includes(p4.emoji)); vrai(/Abonnement exemple/.test(p4.phrase), p4.phrase);
  }) },

  { nom: 'Dépenses : nom court, titre des jours, nature des lignes', fn: () => {
    egal(nomCourt(tx({ date: '2026-11-10', montant: 1599, marchand: 'OPERATEUR EXEMPLE', libellePrincipal: 'PRLV SEPA OPERATEUR EXEMPLE' })), 'Operateur exemple');
    egal(nomCourt({ ...tx({ date: '2026-11-10', montant: 500 }), marchand: '', libelle: 'CB BOULANGERIE EXEMPLE 08/11' }), 'Boulangerie exemple');
    egal(nomCourt({ ...tx({ date: '2026-11-10', montant: 500, categorie: 'courses' }), marchand: 'Dépense', libelle: 'Dépense' }), 'Courses');
    egal(nomCourt(tx({ date: '2026-11-10', montant: 500, marchand: 'café du coin' })), 'Café du coin');
    const long = nomCourt(tx({ date: '2026-11-10', montant: 500, marchand: 'Un nom de commerce vraiment beaucoup trop long' }));
    vrai(long.length <= NOM_COURT_MAX && long.endsWith('…'), long);
    const A = '2026-11-12'; // un jeudi
    egalProfond(['2026-11-12', '2026-11-11', '2026-11-10', '2026-11-01', '2026-10-27', '2025-12-30'].map((d) => titreJour(d, A)),
      ['Aujourd’hui', 'Hier', 'mardi 10', 'dimanche 1er', 'mardi 27 octobre', 'mardi 30 décembre 2025']);
    const base = { date: '2026-11-10', montant: 1000 };
    egal(natureLigne(tx(base)), 'quotidien');
    egal(natureLigne(tx({ ...base, chargeFixeId: 'cf-1', categorie: 'logement' })), 'du-mois');
    egal(natureLigne(tx({ ...base, categorie: 'abonnements' })), 'du-mois');
    egal(natureLigne(tx({ ...base, extra: { horsPartDuJour: true } })), 'du-mois');
    egal(natureLigne(tx({ ...base, extra: { horsPartDuJour: true, obligatoireProbable: true } })), 'probable');
    egal(natureLigne(tx({ ...base, extra: { envieId: 'envie-1' } })), 'envie');
    egal(natureLigne(tx({ ...base, sens: 'credit', categorie: 'salaire' })), 'entree');
    egal(natureLigne(tx({ ...base, sens: 'credit', categorie: 'courses', remboursementDe: 't-x' })), 'quotidien');
    vrai(!estVisible(tx({ ...base, interne: true, categorie: 'virements-internes' })), 'virement entre comptes caché');
    vrai(!estVisible(tx({ ...base, epargne: true, categorie: 'epargne' })), 'virement vers l’épargne caché');
    vrai(!estVisible(tx({ ...base, ajustement: true })), 'ajustement caché');
  } },
  { nom: 'Dépenses : « Depuis le salaire » et liste par jour, période après période', fn: () => avecDate('2026-11-12', () => {
    const A = '2026-11-12'; // période du 5 novembre au 4 décembre
    const vide = etat();
    egal(depuisSalaire(vide, A).phrase, 'Depuis le salaire : rien de dépensé pour l’instant.');
    egalProfond(joursDepenses(vide, '2026-11-05', A, A), []); egal(premiereDate(vide), null);
    const e = etat({ revenusMensuels: [revenus('2026-11')], transactions: [
      tx({ id: 'a', date: '2026-11-03', montant: 999, categorie: 'courses' }), // avant le salaire
      tx({ id: 'b', date: '2026-11-06', montant: 1000, categorie: 'courses' }),
      tx({ id: 'c', date: '2026-11-08', montant: 50000, categorie: 'logement', chargeFixeId: 'cf-loyer' }),
      tx({ id: 'd', date: '2026-11-11', montant: 2000, categorie: 'virements-internes', interne: true }),
      tx({ id: 'e', date: '2026-11-11', montant: 120000, sens: 'credit', categorie: 'salaire' }),
      tx({ id: 'f', date: '2026-11-11', montant: 250, sens: 'credit', categorie: 'courses', remboursementDe: 'b' }),
      tx({ id: 'g', date: A, montant: 730, categorie: 'restauration-rapide', extra: { creeLe: '2026-11-12T09:00:00Z' } }),
      tx({ id: 'h', date: A, montant: 420, categorie: 'restaurants', extra: { creeLe: '2026-11-12T12:00:00Z' } }),
    ] });
    const r = depuisSalaire(e, A);
    egalProfond([r.totalCentimes, r.duMoisCentimes, r.quotidienCentimes], [1000 + 50000 - 250 + 730 + 420, 50000, 1000 - 250 + 730 + 420]);
    egal(sp(r.phrase), 'Depuis le salaire : 519 €, dont 500 € du mois.');
    egal(r.periode.debut, '2026-11-05');
    const jours = joursDepenses(e, r.periode.debut, '9999-12-31', A);
    egalProfond(jours.map((j) => j.titre), ['Aujourd’hui', 'Hier', 'dimanche 8', 'vendredi 6']);
    egalProfond(jours[0].lignes.map((l) => l.tx.id), ['h', 'g'], 'la plus récente en premier');
    egalProfond(jours[1].lignes.map((l) => [l.tx.id, l.nature]), [['e', 'entree'], ['f', 'quotidien']], 'virement entre comptes absent');
    egal(jours[2].lignes[0].nature, 'du-mois');
    const avant = periodePrecedente(e, r.periode, A);
    egalProfond([avant.debut, avant.fin], ['2026-10-05', '2026-11-04']);
    egalProfond(joursDepenses(e, avant.debut, avant.fin, A).map((j) => j.titre), ['mardi 3']);
    egal(premiereDate(e), '2026-11-03');
    // Seulement des charges du mois
    const loyer = etat({ revenusMensuels: [revenus('2026-11')], transactions: [tx({ date: '2026-11-08', montant: 50000, categorie: 'logement', chargeFixeId: 'cf-loyer' })] });
    egal(sp(depuisSalaire(loyer, A).phrase), 'Depuis le salaire : 500 €, seulement des charges du mois.');
  }) },
  { nom: 'Épargne : pots Sécurité, Prêt, Envie, rythme et date estimée', fn: () => avecDate('2026-11-12', () => {
    const A = '2026-11-12';
    const v = (date, montant, sens = 'versement') => ({ id: `mv-${date}-${montant}`, date, montantCentimes: montant, sens });
    const secu = { id: 'p-secu', nom: 'Sécurité', type: 'coussin', cibleCentimes: 100000, priorite: 2, partRepartition: 50, soldeInitialCentimes: 0, actif: true,
      mouvements: [v('2026-09-01', 10000), v('2026-10-01', 10000), v('2026-11-01', 12000), v('2026-11-05', 2000, 'reprise')] };
    const pret = { id: 'p-pret', nom: 'Prêt exemple', type: 'remboursementAnticipe', cibleCentimes: 300000, priorite: 1, partRepartition: 50, soldeInitialCentimes: 0, mouvements: [], actif: true };
    // Rythme : 30 000 nets du 1er septembre au 12 novembre (73 jours), ramenés à 30 jours
    egal(rythmePoche(secu, A), Math.round((30000 * 30) / 73));
    egal(rythmePoche(pret, A), null, 'rien de versé');
    egal(rythmePoche({ mouvements: [v('2026-11-01', 5000)] }, A), null, 'moins de 21 jours d’historique');
    egal(rythmePoche({ mouvements: [v('2026-09-01', 5000), v('2026-10-01', 6000, 'reprise')] }, A), null, 'plus repris que versé');
    egal(finEstimee(70000, 0, A), null); egal(finEstimee(0, 1000, A), null); egal(finEstimee(10000000, 1000, A), null, 'trop loin');
    egal(finEstimee(30000, 10000, A), '2027-02');
    const e = etat({ revenusMensuels: [revenus('2026-11')], poches: [secu, pret], transactions: [tx({ date: '2026-11-08', montant: 1500, categorie: 'courses' })] });
    const { pots, virement, arrondis } = potsEpargne(e, A);
    egalProfond(pots.map((p) => p.id), ['securite', 'pret', 'envie']);
    const s = pots[0];
    vrai(s.soldeCentimes >= 30000 && s.soldeCentimes === s.vireCentimes + s.enAttenteCentimes, `solde ${s.soldeCentimes}`);
    egal(s.resteCentimes, 100000 - s.soldeCentimes); egal(s.pourcent, Math.floor((s.soldeCentimes * 100) / 100000));
    vrai(/^Il y a .+ dans ton pot Sécurité/.test(s.phrases[0]), s.phrases[0]);
    vrai(/^Encore .+ pour atteindre 1 000 €\.$/.test(sp(s.phrases[1])), s.phrases[1]);
    vrai(/^À ton rythme \(environ .+ par mois\), il sera plein vers .+ 20\d\d\.$/.test(s.phrases[2]), s.phrases[2]);
    const p = pots[1];
    if (p.soldeCentimes === 0) egal(p.phrases[0], 'Ton pot Prêt est encore vide : il se remplit à chaque virement.');
    egal(p.phrases[p.phrases.length - 1], 'Chaque virement vers l’épargne le fait grandir.');
    egalProfond([pots[2].envie, pots[2].cibleCentimes, pots[2].phrases[0]], [null, null, 'Pas encore d’envie en cours.']);
    pots.forEach((x) => x.phrases.forEach((ph) => phraseOk(ph, x.id)));
    vrai(typeof virement.aFaire === 'boolean'); phraseOk(virement.phrase);
    egalProfond([arrondis.actif, arrondis.phrase], [false, 'Les arrondis sont éteints. Tu peux les allumer dans les réglages.']);
    // Objectif atteint
    const plein = potsEpargne(etat({ revenusMensuels: [revenus('2026-11')], poches: [{ ...secu, mouvements: [v('2026-09-01', 120000)] }] }), A).pots[0];
    egal(plein.complet, true); egal(plein.pourcent, 100); egal(sp(plein.phrases[1]), 'Objectif atteint : 1 000 € 🎉'); egal(plein.phrases.length, 2);
    // Une envie : rythme par semaine, sur les 4 dernières semaines
    egal(rythmeEnvie({ contributions: [{ date: '2026-11-01', montantCentimes: 600 }, { date: '2026-11-08', montantCentimes: 600 }] }, A), Math.round((1200 * 7) / 12));
    egal(rythmeEnvie({ contributions: [{ date: '2026-11-10', montantCentimes: 600 }] }, A), null, 'moins d’une semaine');
    egal(rythmeEnvie({ contributions: [] }, A), null);
  }) },
  { nom: 'Épargne : virement à faire ou à jour, arrondis du mois', fn: () => avecDate('2026-11-12', () => {
    const A = '2026-11-12';
    egal(virementDuJour({}, A, { semaineCentimes: 1200, dateVirement: A, enRetard: false }).phrase, 'À faire aujourd’hui.');
    egal(virementDuJour({}, A, { semaineCentimes: 1200, dateVirement: A, enRetard: true }).phrase, 'À faire aujourd’hui (il a pris un peu de retard).');
    egal(virementDuJour({}, A, { semaineCentimes: 1200, dateVirement: '2026-11-13' }).phrase, 'À faire demain.');
    const ajour = virementDuJour({}, A, { semaineCentimes: 0, dateVirement: '2026-11-14' });
    egalProfond([ajour.aFaire, ajour.phrase], [false, 'Tout est viré ✨ Prochain virement le samedi 14 novembre.']);
    const e = etat({ revenusMensuels: [revenus('2026-11')], transactions: [tx({ date: '2026-11-10', montant: 730, categorie: 'courses' }), tx({ date: '2026-11-03', montant: 250, categorie: 'courses' })] });
    e.profil.arrondi = { ...e.profil.arrondi, actif: true, depuis: '2026-01-01' };
    const ar = phraseArrondis(e, A);
    egalProfond([ar.actif, ar.centimes, sp(ar.phrase)], [true, 70, 'Tes arrondis ce mois-ci : 0,70 € mis de côté sans y penser.'], 'seulement depuis le salaire');
    e.transactions = [];
    egal(phraseArrondis(e, A).phrase, 'Pas encore d’arrondi ce mois-ci : il viendra avec tes prochaines dépenses.');
  }) },
  { nom: 'Résumé : météo et phrases courtes du mois et de l’année', fn: () => {
    egalProfond(['calme', 'attention', 'risque', 'pas-assez'].map((n) => meteoDuMois({ niveau: n, phrase: 'x' }).dessin), ['soleil', 'nuage', 'orage', 'voile']);
    egal(meteoDuMois({ niveau: 'calme', phrase: 'x' }).titre, 'Tu devrais tenir jusqu’au salaire');
    egal(meteoDuMois(null).dessin, 'voile');
    // Sous la météo : une phrase courte et douce, sans la liste des charges (dites par les préventions)
    const det = (o) => ({ probaTenir: 0.9, fiable: true, joursRestants: 10, attenduCentimes: 4000, rythmeCentimes: 900, rythmeMaxCentimes: 1300, charges: { nb: 2, totalCentimes: 5000 }, decouvert: null, ...o });
    egal(sp(meteoDuMois({ niveau: 'calme', phrase: 'x', details: det() }).phrase), 'À ton rythme, il te resterait environ 40 € le jour du salaire.');
    egal(sp(meteoDuMois({ niveau: 'attention', phrase: 'x', details: det() }).phrase), 'Garde au plus 13 € par jour jusqu’au salaire.');
    egal(sp(meteoDuMois({ niveau: 'risque', phrase: 'x', details: det({ rythmeMaxCentimes: 290 }) }).phrase), 'Pour tenir, vise 2,90 € par jour jusqu’au salaire.');
    egal(meteoDuMois({ niveau: 'risque', phrase: 'x', details: det({ rythmeMaxCentimes: 0 }) }).phrase, 'Le mois est serré : chaque jour sans dépense aide.');
    egal(sp(meteoDuMois({ niveau: 'risque', phrase: 'x', details: det({ decouvert: { date: '2026-11-20', libelle: 'Loyer exemple', manqueCentimes: 4500 } }) }).phrase), 'Ton compte ne couvre pas « Loyer exemple » : il manquera 45 €.');
    egal(sp(meteoDuMois({ niveau: 'calme', phrase: 'Dernier jour avant le salaire : il te reste 12 €. Encore « Abonnement exemple » à payer avant le salaire : 9 €.', details: det({ joursRestants: 0 }) }).phrase), 'Dernier jour avant le salaire : il te reste 12 €.');
    egal(meteoDuMois({ niveau: 'pas-assez', phrase: 'x', details: det({ fiable: false }) }).phrase, 'Note tes dépenses quelques jours de plus : la prévision arrivera.');
    Object.values(METEO).forEach((m) => phraseOk(m.titre));
    const m = { totalCentimes: 30000, top: [{ nom: 'Courses', categorie: 'courses', montantCentimes: 15000 }, { nom: 'Restauration rapide', categorie: 'restauration-rapide', montantCentimes: 9000 }, { nom: 'VTC', categorie: 'vtc', montantCentimes: 6000 }],
      comparaison: { precedentCentimes: 34000, ecartCentimes: -4000 }, flammes: 5, joursSansDepense: 3, epargne: { misDeCoteCentimes: 8500, repriseCentimes: 0 } };
    const p = phrasesMois(m);
    egal(p.ouPart.texte, 'Ton argent part surtout en courses.', 'la première ; les trois sont dessinées en barres');
    egal(phrasesMois({ ...m, top: [m.top[2]] }).ouPart.texte, 'Ton argent part surtout en VTC.', 'les sigles gardent leurs majuscules');
    egalProfond([p.comparaison.emoji, sp(p.comparaison.texte)], ['🎉', '40 € de moins que le mois dernier à la même date.']);
    egal(p.serie.texte, '5 jours notés d’affilée et 3 jours sans dépense.');
    egal(sp(p.epargne.texte), 'Tu as mis 85 € de côté depuis le salaire.');
    const p2 = phrasesMois({ ...m, top: [], totalCentimes: 0, comparaison: null, flammes: 1, joursSansDepense: 1, epargne: { misDeCoteCentimes: 0, repriseCentimes: 0 } });
    egalProfond([p2.ouPart.texte, p2.comparaison, p2.serie.texte, p2.epargne], ['Rien de dépensé au quotidien depuis le salaire.', null, '1 jour sans dépense.', null]);
    egal(sp(phrasesMois({ ...m, comparaison: { precedentCentimes: 26000, ecartCentimes: 4000 } }).comparaison.texte), '40 € de plus que le mois dernier à la même date.');
    egal(phrasesAnnee({ periodes: [] }).epargne.texte, 'Ton année se remplira au fil des mois.');
    const per = (mois, complete, parJour) => ({ mois, nom: mois, complete, parJourCentimes: parJour });
    const a = phrasesAnnee({ periodes: [per('a', true, 900), per('b', true, 700), per('c', false, 800)], totalVerseCentimes: 24000, totalReprisCentimes: 3000, plusCalme: { nom: 'octobre 2026', parJourCentimes: 700 } });
    egal(sp(a.epargne.texte), 'Sur 3 mois, tu as mis 240 € de côté (et repris 30 €).');
    egal(sp(a.calme.texte), 'Ton mois le plus calme : octobre 2026 (7 € par jour).');
  } },
  { nom: 'sauvegarde synthétique : Dépenses, Épargne et Résumé sans trou ni phrase bancale', fn: () => {
    const c = genererSauvegarde().contenu;
    const R = REFERENCE_DEFAUT;
    for (const d of [R, ajouterJours(R, -9), ajouterJours(R, -40)]) avecDate(d, () => {
      const r = depuisSalaire(c, d); phraseOk(r.phrase, d);
      vrai(r.totalCentimes >= r.duMoisCentimes && r.duMoisCentimes >= 0);
      const jours = joursDepenses(c, r.periode.debut, '9999-12-31', d);
      vrai(jours.every((j, i) => i === 0 || jours[i - 1].date > j.date), 'jours du plus récent au plus ancien');
      vrai(jours.every((j) => j.lignes.every((l) => l.nom && !/undefined|null/.test(l.nom) && l.nom.length <= NOM_COURT_MAX)), 'noms courts');
      vrai(jours.every((j) => j.lignes.every((l) => estVisible(l.tx))));
      const { pots, virement, arrondis } = potsEpargne(c, d);
      egalProfond(pots.map((p) => p.id), ['securite', 'pret', 'envie']);
      pots.forEach((p) => { vrai(p.pourcent >= 0 && p.pourcent <= 100); vrai(p.phrases.length >= 2 && p.phrases.length <= 3, `${p.id} : ${p.phrases.length} phrases`); p.phrases.forEach((x) => phraseOk(x, `${d} ${p.id}`)); });
      phraseOk(virement.phrase, d); phraseOk(arrondis.phrase, d);
      const pm = phrasesMois(resumeMois(c, d)); Object.values(pm).filter(Boolean).forEach((x) => phraseOk(x.texte, d));
      const pa = phrasesAnnee(resumeAnnee(c, d)); Object.values(pa).filter(Boolean).forEach((x) => phraseOk(x.texte, d));
      const mt = meteoDuMois(risqueDuMois(c, d)); phraseOk(mt.titre, d); phraseOk(mt.phrase, d); vrai(mt.phrase.length <= 90, mt.phrase);
    });
  } },
  { nom: 'Résumé : app vide (jeu commencé au salaire) → 0 jour d’affilée, pas de phrase de série ; série de la sauvegarde synthétique inchangée', fn: () => {
    avecDate('2026-11-17', () => {
      const vide = etat(); vide.meta = { jeu: { depuis: '2026-11-05', niveauVu: 1 } }; // ce que l'app écrit à la première ouverture
      const m = resumeMois(vide, '2026-11-17');
      egal(m.flammes, 0, 'pas « 12 jours notés d’affilée » sans aucune donnée');
      egal(phrasesMois(m).serie, null);
      vrai(m.phrases.every((x) => !/affilée/.test(x)));
    });
    const c = genererSauvegarde().contenu; const R = REFERENCE_DEFAUT;
    avecDate(R, () => {
      egal(serieJours(c, R), 2);
      egal(flammesDesJours(c, R, 14).map((x) => x.statut).join(' '), 'rien flamme rien rien flamme super super flamme super flamme flamme rien flamme flamme');
      egal(resumeMois(c, R).flammes, 2);
    });
  } },
  { nom: 'Aujourd’hui : mots de la bulle doux et justes (reste, jour dépassé, mois dépassé, veille du salaire)', fn: () => {
    const b = (etat, montantCentimes, joursRestants) => ({ etat, montantCentimes, jauge: { joursRestants } });
    egalProfond(Object.values(texteBulle(b('ok', 1230, 10))).map(sp), [null, 'Tu peux encore dépenser', '12,30 €', 'aujourd’hui', null]);
    egal(texteBulle(b('jour-depasse', 450, 10)).suite, 'Demain, c’est une nouvelle journée.');
    egal(texteBulle(b('jour-depasse', 450, 1)).suite, 'Demain, un nouveau mois commence.');
    const m = texteBulle(b('mois-depasse', 48100, 10));
    egalProfond([m.titre, m.montant, sp(m.suite)], ['Ta part du mois est déjà utilisée', null, '481 € de plus que prévu. Vise zéro dépense aujourd’hui.']);
    egal(sp(texteBulle(b('mois-depasse', 48890, 1)).suite), '488,90 € de plus que prévu. Vise zéro dépense aujourd’hui : demain, un nouveau mois commence.');
    egal(texteBulle(b('mois-depasse', 48100, 1), () => '•••').suite.startsWith('••• de plus'), true, 'montants masqués');
    vrai(!/-|−/.test(Object.values(m).join(' ')), 'jamais de chiffre négatif');
    const lj = ligneDuJour(b('mois-depasse', 48100, 1));
    egalProfond([sp(lj.texte), lj.ton], ['Ta part du mois est déjà utilisée : 481 € de plus que prévu.', 'attention']);
    egal(sp(ligneDuJour(b('jour-depasse', 450, 3)).texte), 'Tu as dépassé de 4,50 € aujourd’hui.');
    egal(sp(ligneDuJour(b('ok', 1500, 3)).texte), 'Il te reste 15 € aujourd’hui.');
  } },
  { nom: 'Aujourd’hui : veille du salaire, mois dépassé, repas automatiques et arrondi → une dépense de 7,30 € fait baisser de 8 € tout juste', fn: () => avecDate('2026-12-04', () => {
    const A = '2026-12-04'; // dernier jour de la période du 5 novembre au 4 décembre
    const e = etat({ revenusMensuels: [revenus('2026-11', 60000)], transactions: [
      ...chaqueJour('2026-09-10', '2026-10-30', (d) => (Number(d.slice(8)) % 7 === 0 ? 600 + Number(d.slice(8)) * 10 : 0), 'restauration-rapide'),
      tx({ date: '2026-11-10', montant: 90000, categorie: 'loisirs', source: 'manuel' })] });
    e.profil.repasAuto = { actif: true, depuis: '2026-11-05', repasParJour: 1 }; // 1 repas (8,10 €) : sous le plafond de la part prévue
    e.profil.arrondi = { ...e.profil.arrondi, actif: true, depuis: '2026-01-01' };
    const b0 = bulleDuJour(e, A);
    vrai(b0.jauge.reste.privationsAuto.length > 20 && b0.jauge.reste.privationsAuto.every((p) => p.montantCentimes === 810), 'repas à la maison au prix habituel');
    egal(b0.etat, 'mois-depasse'); egal(b0.jauge.joursRestants, 1); egal(b0.montantCentimes, -b0.jauge.reste.resteCentimes);
    e.meta.jauge = b0.jauge.instantane;
    e.transactions.push(tx({ date: A, montant: 730, categorie: 'restauration-rapide', source: 'manuel' }));
    const b1 = bulleDuJour(e, A);
    egal(b1.montantCentimes - b0.montantCentimes, 800, '7,30 € + 0,70 € d’arrondi, pas un centime de plus ou de moins');
    egal(b1.parJourCentimes, b0.parJourCentimes, 'la part figée du matin ne bouge pas');
  }) },
  { nom: 'carte : une charge du mois dit ce qu’elle change vraiment pour la journée', fn: () => {
    const base = (salaire, loyer, date) => {
      const e = etat({ revenusMensuels: [revenus('2026-11', salaire)], transactions: [tx({ date: '2026-11-06', montant: 1500, categorie: 'courses', source: 'manuel' })] });
      e.transactions.push(tx({ id: 'loyer', date, montant: loyer, categorie: 'logement', source: 'manuel', extra: { horsPartDuJour: true } }));
      return e;
    };
    // De la marge : c'est l'épargne visée qui baisse, la journée ne change pas
    avecDate('2026-11-25', () => egalProfond(ligneCharge(base(120000, 23000, '2026-11-25'), 'loyer', '2026-11-25'), { texte: 'Charge du mois, pas comptée dans ta journée.', baisseCentimes: 0 }));
    // Plus de marge : répartie sur les 10 jours qui restent (du 25 novembre au 4 décembre)
    avecDate('2026-11-25', () => {
      const l = ligneCharge(base(40000, 23000, '2026-11-25'), 'loyer', '2026-11-25');
      egalProfond([sp(l.texte), l.baisseCentimes], ['Charge du mois, répartie sur les 10 jours qui restent : 14 € de moins aujourd’hui.', 1400]);
    });
    // Dernier jour avant le salaire : elle compte en entier aujourd'hui
    avecDate('2026-12-04', () => {
      const l = ligneCharge(base(40000, 23000, '2026-12-04'), 'loyer', '2026-12-04');
      egalProfond([l.texte, l.baisseCentimes], ['Charge du mois. C’est le dernier jour avant ton salaire : elle compte aussi aujourd’hui.', 14000]);
    });
    // Mois dépassé : la phrase douce, avec le montant exact
    avecDate('2026-11-25', () => egal(sp(ligneCharge(base(40000, 40000, '2026-11-25'), 'loyer', '2026-11-25').texte), 'Charge du mois. Ta part du mois est déjà utilisée : 15 € de plus que prévu.'));
  } },
];
