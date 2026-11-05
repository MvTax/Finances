import { egal, vrai } from '../outils/assert.mjs';
import { tableauAmortissement, totalInterets, mensualiteConstante, interetsMensuels, simulerRemboursementAnticipe, verifierCoherencePret, echeancesEntre, encoursCredit, resteDuPret, dureePourMensualite, simulerPretAvecPoche } from '../../js/dettes.js';

const pret = { capitalCentimes: 600000, tauxPourcent: 6, mensualiteCentimes: 20000, dateDebut: '2027-03-15' };

export default [
  { nom: 'amortissement : intérêts au centime (arrondi bancaire), capital soldé exactement', fn: () => {
    egal(interetsMensuels(600000, 6), 3000);
    egal(interetsMensuels(12345, 7), 72); // 12345 × 0,07 / 12 = 72,0125
    const t = tableauAmortissement(pret);
    egal(t[0].interetsCentimes, 3000); egal(t[0].capitalCentimes, 17000); egal(t[0].capitalRestantCentimes, 583000);
    egal(t[t.length - 1].capitalRestantCentimes, 0);
    egal(t.reduce((s, l) => s + l.capitalCentimes, 0), 600000);
    egal(t[1].date, '2027-04-15'); egal(t.length, dureePourMensualite(600000, 6, 20000));
  } },
  { nom: 'amortissement : mensualité constante d’un prêt (8 000 € sur 36 mois à 7 %)', fn: () => {
    const m = mensualiteConstante(800000, 7, 36);
    vrai(m >= 24700 && m <= 24710, `mensualité ${m}`);
    const t = tableauAmortissement({ capitalCentimes: 800000, tauxPourcent: 7, dureeMois: 36, dateDebut: '2027-02-22' });
    egal(t.length, 36); egal(t[35].capitalRestantCentimes, 0);
  } },
  { nom: 'remboursement anticipé : intérêts économisés, nouvelle fin, sans indemnité sous 10 000 €', fn: () => {
    const s = simulerRemboursementAnticipe(pret, { date: '2027-08-15', montantCentimes: 100000 });
    vrai(s.interetsEconomises > 0); vrai(s.moisGagnes >= 4); vrai(s.nouvelleFin < s.ancienneFin); vrai(s.sansIndemnite);
    egal(totalInterets(tableauAmortissement(pret)) - totalInterets(s.nouveauTableau), s.interetsEconomises);
    egal(simulerRemboursementAnticipe(pret, { date: '2027-08-15', montantCentimes: 50000, dejaRembourse12MoisCentimes: 990000 }).sansIndemnite, false);
  } },
  { nom: 'cohérence mensualité/durée : 250 €/mois sur 8 000 € ≈ 3 ans, pas 4 ou 6', fn: () => {
    const c = verifierCoherencePret({ capitalCentimes: 800000, mensualiteCentimes: 25000, dureesAnnonceesMois: [48, 72] });
    egal(c.coherent, false); vrai(c.dureeMin >= 34 && c.dureeMax <= 38);
    const quatre = c.mensualitesParDuree[0]; vrai(quatre.min > 18000 && quatre.max < 20000);
    const six = c.mensualitesParDuree[1]; vrai(six.min > 12500 && six.max < 14500);
  } },
  { nom: 'échéanciers : crédit instantané et dettes envers des proches datés dans la période', fn: () => {
    const etat = {
      creditsBancaires: [{ id: 'ci', libelle: 'Crédit', type: 'instantane', echeancier: [{ date: '2026-11-09', montantCentimes: 33000, payee: false }, { date: '2026-12-07', montantCentimes: 33100, payee: false }, { date: '2026-10-09', montantCentimes: 33900, payee: true }] }, { id: 'pp', libelle: 'Prêt', type: 'amortissable', ...pret }],
      prets: [{ id: 'p', personneAlias: 'Un proche', sens: 'empruntéParMoi', montantCentimes: 30000, echeancier: [{ date: '2026-11-06', montantCentimes: 10000 }, { date: '2026-12-06', montantCentimes: 10000 }, { date: '2027-01-06', montantCentimes: 10000 }], remboursements: [{ montantCentimes: 10000 }] }],
    };
    const nov = echeancesEntre(etat, '2026-11-05', '2026-12-04');
    egal(nov.length, 2); egal(nov[0].type, 'proche'); egal(nov[1].montantCentimes, 33000); vrai(nov[1].court);
    egal(echeancesEntre(etat, '2027-03-01', '2027-03-31')[0].montantCentimes, 20000, 'échéance du prêt amortissable');
    egal(encoursCredit(etat.creditsBancaires[0], '2026-11-05'), 66100);
    egal(resteDuPret(etat.prets[0]), 20000);
  } },
  { nom: 'poche remboursement anticipé : prêt raccourci quand on y verse', fn: () => {
    const sans = simulerPretAvecPoche(pret, () => 0);
    const avec = simulerPretAvecPoche(pret, () => 25000, 50000);
    vrai(avec.finLe < sans.finLe); vrai(avec.interetsCentimes < sans.interetsCentimes); vrai(avec.remboursementsAnticipes.length > 0);
  } },
  { nom: 'dettes : une dette remboursée reste comptée dans les dettes du mois (sinon le reste à dépenser gonfle)', fn: () => {
    const etat = { creditsBancaires: [], prets: [{ id: 'p', personneAlias: 'X', sens: 'empruntéParMoi', statut: 'solde', echeancier: [{ date: '2026-11-06', montantCentimes: 20000, payee: true }] }] };
    const e = echeancesEntre(etat, '2026-11-05', '2026-12-04');
    egal(e.length, 1); egal(e[0].montantCentimes, 20000); egal(e[0].payee, true);
  } },
];
