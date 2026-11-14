// v200.mjs — calculs de v200 (js/v200/calculs/) : habitudes, risque du mois, résumés et préventions.
// Dates fixes, montants inventés. Cas : aucune donnée, peu de données, veille du salaire, journée avant 5 h,
// sauvegarde synthétique.
import { egal, vrai, egalProfond } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { categoriesFavorites, montantsRapides, montantDepart, CATEGORIES_REPLI } from '../../js/v200/calculs/habitudes.js';
import { risqueDuMois, chargesAvantSalaire } from '../../js/v200/calculs/risques.js';
import { resumeMois, resumeAnnee, preventions } from '../../js/v200/calculs/resume.js';
import { eur, arrondi10 } from '../../js/v200/calculs/commun.js';
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
const avecDate = (auj, fn) => { forcerAujourdhui(auj); try { return fn(); } finally { forcerAujourdhui(null); } };

export default [
  { nom: 'outils : montants lisibles et arrondi aux 10 centimes', fn: () => {
    egal(eur(1200), '12 €'); egal(eur(-1230), '12,30 €');
    egal(arrondi10(455), 460); egal(arrondi10(404), 400); egal(arrondi10(1000), 1000);
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
    });
  } },
];
