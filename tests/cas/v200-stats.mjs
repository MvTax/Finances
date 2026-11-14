// v200-stats.mjs — statistiques des dépenses (js/v200/calculs/stats.js) et calculs ligne par ligne d'une journée (explications.js).
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { resumer, quantile, regression, phi, serieQuotidienne, statsDepenses, previsionMois, contexteDepense } from '../../js/v200/calculs/stats.js';
import { cascadeJour, partageDuReste, reglePartage, arrondiDeLaDepense, effetDepense, totalCascade } from '../../js/v200/calculs/explications.js';
import { jaugeDuJour, resteADepenser, arrondisPeriode } from '../../js/calculs.js';
import { fluxEnvies } from '../../js/envies.js';

// Données synthétiques : un crédit en cours (différé jusqu'en février 2027), un loyer, deux pots.
const credit = (o = {}) => ({ id: 'pret', libelle: 'Prêt', type: 'amortissable', actif: true, capitalCentimes: 120000, tauxPourcent: 12, mensualiteCentimes: 10000, assuranceMensuelleCentimes: 100, dureeMois: 13, dateDebut: '2027-02-15', remboursementsAnticipes: [], payees: [], ...o });
const revenus = (mois) => ({ mois, salaireCentimes: 160000, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' });
const etat = (o = {}) => {
  const e = etatBase({
    revenusMensuels: [revenus('2026-10'), revenus('2026-11')],
    chargesFixes: [{ id: 'loyer', libelle: 'Loyer', montantCentimes: 50000, jourPrelevement: 8, actif: true, compteId: 'courant', categorie: 'logement', estLoyer: true }],
    creditsBancaires: [credit()],
    poches: [
      { id: 'secu', nom: 'Sécurité', type: 'coussin', actif: true, partRepartition: 50, cibleCentimes: 100000, mouvements: [] },
      { id: 'ppret', nom: 'Prêt', type: 'remboursementAnticipe', actif: true, partRepartition: 50, cibleCentimes: 120000, palierCentimes: 50000, creditId: 'pret', mouvements: [] },
    ],
    enveloppes: [
      { id: 'courses', nom: 'Courses', categories: ['courses'], plafondMensuelCentimes: 15000, vitale: true },
      { id: 'repas', nom: 'Repas dehors', categories: ['restaurants', 'livraison'], plafondMensuelCentimes: 6000, vitale: false },
    ],
    privations: [], ...o,
  });
  e.profil.repasAuto = { actif: false };
  e.profil.parametresPlan = { vieMinCentimes: 37500, margeMinCentimes: 1000, arrondisEstimesCentimes: 0 };
  e.meta = {};
  return e;
};
const A = '2026-11-09';

export default [
  { nom: 'statistiques : moyenne, médiane, quartiles, écart-type, régression, loi normale', fn: () => {
    const st = resumer([1000, 2000, 3000, 4000, 10000]);
    egal(st.moyenne, 4000); egal(st.mediane, 3000); egal(st.q1, 2000); egal(st.q3, 4000); egal(st.min, 1000); egal(st.max, 10000);
    egal(st.ecartType, 3536, 'écart-type de l’échantillon (n − 1)');
    egal(quantile([0, 100], 0.25), 25, 'interpolation linéaire');
    egal(resumer([]).moyenne, 0, 'série vide');
    const reg = regression([100, 200, 300, 400]);
    egal(Math.round(reg.pente), 100); egal(Math.round(reg.r2 * 100), 100, 'droite parfaite');
    egal(regression([500, 500, 500]).pente, 0);
    egal(Math.round(phi(0) * 1000), 500); egal(Math.round(phi(1.2816) * 100), 90); egal(Math.round(phi(-1.2816) * 100), 10);
  } },
  { nom: 'statistiques : série des jours terminés (zéros compris), jours de semaine, tendance, catégories', fn: () => {
    // 14 jours terminés avant le 9 novembre (26 oct. → 8 nov.) : 10 € chaque jour, 30 € les deux samedis, rien les dimanches
    const t = [];
    for (let k = 0; k < 14; k += 1) {
      const d = new Date(Date.UTC(2026, 9, 26 + k)).toISOString().slice(0, 10);
      const js = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (js === 0) continue;
      t.push(tx({ date: d, montant: js === 6 ? 3000 : 1000, categorie: js === 6 ? 'restaurants' : 'courses' }));
    }
    // Un prélèvement et la dépense du jour ne comptent pas dans la série
    t.push(tx({ date: '2026-11-03', montant: 5000, categorie: 'abonnements', marchand: 'Abo' }));
    t.push(tx({ date: A, montant: 700 }));
    const e = etat({ transactions: t });
    const serie = serieQuotidienne(e, A);
    egal(serie.length, 14); egal(serie[0].date, '2026-10-26'); egal(serie[13].date, '2026-11-08');
    egal(serie.filter((x) => x.centimes === 0).length, 2, 'les dimanches valent zéro');
    const s = statsDepenses(e, A);
    vrai(s.fiable); egal(s.jours, 14);
    egal(s.global.moyenne, Math.round((10 * 1000 + 2 * 3000) / 14));
    egal(s.global.mediane, 1000); egal(s.joursSansDepense, 2);
    egal(s.jourCher.jour, 6, 'le samedi est le jour le plus cher'); egal(s.jourCher.moyenneCentimes, 3000);
    egal(s.jourSage.jour, 7);
    egal(s.tendance.sens, 'stable', 'deux semaines identiques');
    egal(s.categories[0].categorie, 'courses'); egal(s.categories.length, 2, 'le prélèvement n’est pas une dépense du quotidien'); egal(s.categories[0].montantCentimes, 10000); egal(s.categories[1].montantCentimes, 6000);
    // Une série qui monte de 1 € par jour : tendance à la hausse, 7 € par semaine
    const monte = etat({ transactions: Array.from({ length: 14 }, (_, k) => tx({ date: new Date(Date.UTC(2026, 9, 26 + k)).toISOString().slice(0, 10), montant: 500 + k * 100 })) });
    const sm = statsDepenses(monte, A);
    egal(sm.tendance.sens, 'hausse'); egal(sm.tendance.parSemaineCentimes, 700);
    // Sans opération : rien à dire, sans erreur
    const vide = statsDepenses(etat(), A);
    egal(vide.jours, 0); egal(vide.fiable, false); egal(vide.jourCher, null);
  } },
  { nom: 'statistiques : prévision de fin de mois (fourchette, probabilité) et contexte d’une dépense', fn: () => {
    const t = Array.from({ length: 14 }, (_, k) => tx({ date: new Date(Date.UTC(2026, 9, 26 + k)).toISOString().slice(0, 10), montant: k % 2 ? 1500 : 500 }));
    const e = etat({ transactions: t });
    const p = previsionMois(e, A);
    egal(p.rythmeCentimes, 1000);
    egal(p.attenduCentimes, p.resteCentimes - p.joursRestants * 1000);
    vrai(p.basCentimes < p.attenduCentimes && p.attenduCentimes < p.hautCentimes, 'fourchette autour de la valeur attendue');
    vrai(p.probaTenir >= 0 && p.probaTenir <= 1);
    egal(p.rythmeMaxCentimes, Math.floor(Math.max(0, p.resteCentimes) / p.joursRestants));
    // Dépenser beaucoup plus chaque jour fait baisser la probabilité de tenir
    const cher = etat({ transactions: t.map((x) => ({ ...x, montantCentimes: x.montantCentimes * 6 })) });
    vrai(previsionMois(cher, A).probaTenir <= p.probaTenir);
    // Contexte : une dépense de 15 € en courses, parmi 14 dépenses de 5 ou 15 €
    const nouvelle = tx({ date: A, montant: 1500, marchand: 'Marchand' });
    const c = contexteDepense({ ...e, transactions: [...t, nouvelle] }, nouvelle, A, 3000);
    egal(c.partDuJour, 0.5); egal(c.categorie.n, 14); egal(c.categorie.moyenneCentimes, 1000); egal(c.categorie.rang, 100, 'aucune n’est plus chère');
    vrai(c.marchand.n >= 1);
  } },

  // ---------- Fiches « ? » : les calculs affichés (explications.js) ----------
  { nom: 'explications, journée : la cascade retombe au centime sur « Reste pour vivre, ce matin » (début de période, veille du salaire)', fn: () => {
    // Début de période (salaire le 5) : rien de dépensé, aucune ligne « déjà dépensé »
    const e = etat();
    const c = cascadeJour(e, '2026-11-05');
    vrai(c.retombe, 'la cascade retombe sur la base');
    egal(totalCascade(c.etapes), c.baseCentimes);
    egal(c.etapes[c.etapes.length - 1].nom, 'Reste pour vivre, ce matin'); egal(c.etapes[c.etapes.length - 1].centimes, c.baseCentimes);
    egal(c.baseCentimes, jaugeDuJour(e, '2026-11-05').instantane.baseCentimes);
    vrai(!c.etapes.some((x) => ['depense', 'deCote', 'arrondis', 'rembourse'].includes(x.cle)), 'rien de dépensé au premier jour');
    egal(c.joursRestants, 30); vrai(Math.abs(c.parJourCentimes * 30 - c.baseCentimes) <= 15, 'part = base ÷ 30 jours');
    for (const x of c.etapes) vrai(x.centimes >= 0, `${x.nom} jamais négatif ici`);
    // Veille du salaire : un seul jour, la part du jour est toute la base
    const v = etat({ transactions: [tx({ date: '2026-11-10', montant: 4590 }), tx({ date: '2026-11-20', montant: 3200, categorie: 'vtc' })] });
    const cv = cascadeJour(v, '2026-12-04');
    vrai(cv.retombe); egal(cv.joursRestants, 1); egal(cv.parJourCentimes, cv.baseCentimes);
    egal(cv.etapes.find((x) => x.cle === 'depense').centimes, 7790, 'dépensé avant aujourd’hui : 45,90 € + 32 €');
  } },
  { nom: 'explications, journée : journée avec dépenses, privations et arrondis ; chaque ligne calculée, jamais négative', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-11-06', montant: 1990 }), tx({ date: '2026-11-08', montant: 1450, categorie: 'vtc' }), tx({ date: A, montant: 1230, categorie: 'restaurants' })],
      privations: [{ id: 'p1', date: '2026-11-07', categorie: 'restauration-rapide', libelle: 'Menu', montantCentimes: 800, vireLe: null }, { id: 'p2', date: A, categorie: 'autres', libelle: 'Café', montantCentimes: 300, vireLe: null }] });
    e.profil.arrondi.actif = true;
    const j = jaugeDuJour(e, A);
    const c = cascadeJour(e, A, j);
    vrai(c.retombe); egal(totalCascade(c.etapes), c.baseCentimes);
    const ligne = (cle) => c.etapes.find((x) => x.cle === cle)?.centimes || 0;
    egal(ligne('depense'), 1990 + 1450, 'dépenses des jours d’avant');
    egal(ligne('deCote'), 800, 'privation d’avant (celle d’aujourd’hui est dans « dépensé aujourd’hui »)');
    egal(ligne('arrondis'), 10 + 50, 'arrondis des jours d’avant');
    egal(c.depensesDuJourCentimes, 1230 + 300 + 70, 'aujourd’hui : dépense, privation, arrondi');
    egal(c.baseCentimes, resteADepenser(e, A).resteCentimes + c.depensesDuJourCentimes);
    egal(c.restantCentimes, c.parJourCentimes - c.depensesDuJourCentimes);
    for (const x of c.etapes) vrai(x.centimes >= 0, `${x.nom} jamais négatif`);
  } },
  { nom: 'explications, journée : plus de remboursements que d’achats, ou mois dépassé : la cascade retombe quand même', fn: () => {
    // Avant : « déjà dépensé » était déduit par différence et caché s'il était négatif → la cascade ne retombait plus
    const e = etat({ transactions: [tx({ date: '2026-11-06', montant: 5000, sens: 'credit', categorie: 'vtc', remboursementDe: 'achat' }), tx({ date: '2026-11-07', montant: 1000 }), tx({ date: A, montant: 500 })] });
    const r = resteADepenser(e, A);
    const j = jaugeDuJour(e, A);
    const ancien = r.revenus.totalCentimes - r.chargesCentimes - r.dettesCentimes - r.prevuesCentimes - r.epargneCibleCentimes - j.instantane.baseCentimes;
    vrai(ancien < 0, 'l’ancien calcul par différence donnait une ligne négative');
    const c = cascadeJour(e, A, j);
    vrai(c.retombe); egal(c.etapes.find((x) => x.cle === 'rembourse').centimes, 4000); egal(c.etapes.find((x) => x.cle === 'rembourse').type, 'plus');
    // Mois dépassé : la base est négative, la dernière ligne la montre telle quelle (plus de « 0 » qui ne colle pas)
    const d = etat({ transactions: [tx({ date: '2026-11-06', montant: 200000, categorie: 'vetements' })] });
    const cd = cascadeJour(d, A);
    vrai(cd.baseCentimes < 0); vrai(cd.retombe); egal(cd.etapes[cd.etapes.length - 1].centimes, cd.baseCentimes);
    egal(cd.etapes.find((x) => x.cle === 'epargne'), undefined, 'l’épargne du mois tombe à 0 avant le dépassement');
  } },
  { nom: 'explications, épargne : le partage du reste suit la clôture de 5 h (sans envie, envie en cours, plafond, achat en avance)', fn: () => {
    // Sans envie : tout entre prêt et sécurité (40/30 → 4/7, 3/7)
    const sans = partageDuReste(etat(), A, 1000);
    egal(sans.envie, null); egal(sans.envieCentimes, 0); egal(sans.pretCentimes, 571); egal(sans.securiteCentimes, 429);
    egal(JSON.stringify(sans.pourcents), '{"pret":57,"securite":43,"envie":0,"avance":0}');
    egal(JSON.stringify(reglePartage(etat(), A)), '{"pret":57,"securite":43,"envie":0,"avance":0}', 'la règle, même sans reste aujourd’hui');
    // Envie en cours : 30 % gardés sur le compte pour l’envie, le reste 40/30
    const envie = (o = {}) => { const e = etat(); e.profil.envies = { depuis: '2026-11-01', liste: [{ id: 'e1', nom: 'Jeu', type: 'jeu', montantCentimes: 5000, creeLe: '2026-11-01', achat: null, ...o }] }; return e; };
    const avec = partageDuReste(envie(), A, 1000);
    egal(avec.envie.nom, 'Jeu'); egal(avec.envieCentimes, 300); egal(avec.pretCentimes, 400); egal(avec.securiteCentimes, 300);
    egal(avec.envieCentimes + avec.pretCentimes + avec.securiteCentimes, 1000, 'rien ne se perd');
    egal(JSON.stringify(reglePartage(envie(), A)), '{"pret":40,"securite":30,"envie":30,"avance":0}');
    // Même chiffre que la clôture : la ligne « reste du jour » simulée reçoit la même part dans fluxEnvies
    const e = envie();
    const flux = fluxEnvies({ ...e, privations: [{ id: 'r', date: A, source: 'resteJour', montantCentimes: 1000, vireLe: null }] }, { auto: [], aujourdhuiIso: A });
    egal(flux.parReste.get('r').garde, avec.envieCentimes);
    // Envie presque pleine : elle ne prend que ce qui lui manque
    const plafond = partageDuReste(envie({ montantCentimes: 200 }), A, 1000);
    egal(plafond.envieCentimes, 200); egal(plafond.pretCentimes + plafond.securiteCentimes, 800);
    // Envie achetée en avance (exception) : sa part ne reste pas sur le compte, la moitié rembourse l’avance
    const achetee = partageDuReste(envie({ achat: { date: '2026-11-08', montantCentimes: 5000, txId: 'x', exception: true, retenues: [] } }), A, 1000);
    egal(achetee.envieCentimes, 0); egal(achetee.avanceCentimes, 500); egal(achetee.pretCentimes, 286); egal(achetee.securiteCentimes, 214);
    // Partage réglé autrement (Stratégie → Répartition) : 50/50, rien pour l’envie
    const regle = envie(); regle.profil.partsReste = { pret: 50, securite: 50, envie: 0 };
    const r = partageDuReste(regle, A, 1000);
    egal(r.envieCentimes, 0); egal(r.pretCentimes, 500); egal(r.securiteCentimes, 500);
    egal(partageDuReste(etat(), A, 0).pretCentimes, 0, 'rien à partager');
  } },
  { nom: 'explications, dépense : l’arrondi affiché est celui que l’épargne compte ; la cascade du jour retombe au centime', fn: () => {
    const base = (o = {}) => {
      const e = etat({ transactions: [tx({ id: 'cette', date: A, montant: 1230, categorie: 'restaurants', ...o }), tx({ id: 'autre', date: A, montant: 520 })],
        privations: [{ id: 'p', date: A, categorie: 'autres', libelle: 'Café', montantCentimes: 300, vireLe: null }] });
      e.profil.arrondi.actif = true;
      return e;
    };
    const e = base();
    const t = e.transactions[0];
    const ef = effetDepense(e, t, A);
    egal(ef.arrondiCentimes, 70); vrai(ef.arrondiAVirer, 'dans la cagnotte du prochain virement');
    egal(ef.arrondiCentimes + 80, arrondisPeriode(e, resteADepenser(e, A).periode, A), 'le même arrondi que le budget du jour (+ 80 c de l’autre dépense)');
    egal(ef.autresCentimes, 520 + 80 + 300, 'l’autre dépense, son arrondi, la privation');
    egal(totalCascade(ef.etapes), ef.etapes[ef.etapes.length - 1].centimes, 'la cascade retombe sur le reste du jour');
    egal(ef.etapes[ef.etapes.length - 1].centimes, jaugeDuJour(e, A).restantAujourdhuiCentimes);
    // Arrondi désactivé dans le réglage
    const off = base(); off.profil.arrondi.actif = false;
    const efOff = effetDepense(off, off.transactions[0], A);
    egal(efOff.arrondiCentimes, 0); vrai(!efOff.etapes.some((x) => x.cle === 'arrondi')); egal(totalCascade(efOff.etapes), jaugeDuJour(off, A).restantAujourdhuiCentimes);
    // Dépense exclue des arrondis
    const exclue = base({ extra: { arrondiDesactive: true } });
    egal(effetDepense(exclue, exclue.transactions[0], A).arrondiCentimes, 0);
    egal(arrondisPeriode(exclue, resteADepenser(exclue, A).periode, A), 80, 'seul l’arrondi de l’autre dépense');
    // Virement entre tes comptes : ni dépense du jour, ni arrondi
    const vi = base({ interne: true, categorie: 'virements-internes' });
    const efVi = effetDepense(vi, vi.transactions[0], A);
    vrai(!efVi.quotidienne); egal(efVi.arrondiCentimes, 0);
    // Prélèvement d’une charge fixe aujourd’hui : hors part du jour, mais son arrondi compte dans la journée
    const prlv = base({ montant: 2999, categorie: 'abonnements', chargeFixeId: 'loyer', libellePrincipal: 'PRLV SEPA EXEMPLE' });
    const efP = effetDepense(prlv, prlv.transactions[0], A);
    vrai(!efP.quotidienne); egal(efP.arrondiCentimes, 1); egal(efP.compteAujourdhuiCentimes, 1);
    egal(totalCascade(efP.etapes), jaugeDuJour(prlv, A).restantAujourdhuiCentimes);
    // Dépense d’un autre jour : elle ne change pas la journée, la cascade retombe quand même
    const hier = base({ date: '2026-11-08' });
    const efH = effetDepense(hier, hier.transactions[0], A);
    vrai(!efH.duJour); egal(efH.compteAujourdhuiCentimes, 0); egal(totalCascade(efH.etapes), jaugeDuJour(hier, A).restantAujourdhuiCentimes);
    egal(arrondiDeLaDepense(hier, hier.transactions[0], A).centimes, 70);
    // Dépassement : le reste final est négatif, affiché tel quel
    const gros = base({ montant: 90000, categorie: 'vetements' });
    const efG = effetDepense(gros, gros.transactions[0], A);
    vrai(efG.etapes[efG.etapes.length - 1].centimes < 0); egal(totalCascade(efG.etapes), efG.etapes[efG.etapes.length - 1].centimes);
  } },
];
