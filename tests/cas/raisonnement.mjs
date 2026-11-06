// raisonnement.mjs — le mois expliqué : habitudes (médiane), verdict, et chaque point constat → pourquoi → donc.
import { egal, vrai } from '../outils/assert.mjs';
import { habitudes, raisonner } from '../../js/raisonnement.js';
import { tx, etatBase } from '../outils/etat.mjs';

/** Dépenses de restaurant chaque jour d'une période, au montant donné. */
function quotidien(debut, nbJours, montant, categorie = 'restaurants') {
  const res = [];
  for (let i = 0; i < nbJours; i++) {
    const d = new Date(`${debut}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
    res.push(tx({ date: d.toISOString().slice(0, 10), montant, categorie, marchand: 'Resto' }));
  }
  return res;
}
const revenus = (mois, c) => ({ mois, salaireCentimes: c, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' });
const sansTrou = (x) => { const t = JSON.stringify(x); vrai(!/NaN|undefined|null €|—/.test(t), `texte incomplet : ${t.match(/.{40}(NaN|undefined|—).{20}/)?.[0]}`); };

export default [
  { nom: 'habitudes : médiane par jour des 3 derniers mois de salaire, un mois exceptionnel ignoré', fn: () => {
    const e = etatBase({ transactions: [
      ...quotidien('2026-08-05', 31, 3000),                 // août : 30 €/jour
      ...quotidien('2026-09-05', 30, 3000),                 // septembre : 30 €/jour
      ...quotidien('2026-10-05', 31, 3000),                 // octobre : 30 €/jour…
      tx({ date: '2026-10-20', montant: 300000, categorie: 'especes', marchand: 'Retrait' }), // … plus un gros retrait
    ] });
    const h = habitudes(e, '2026-11-06');
    egal(h.nbMois, 3);
    egal(h.parJourCentimes, 3000);                          // la médiane n'est pas tirée par le retrait de 3 000 €
    egal(h.familles[0].id, 'dehors');
    egal(h.familles[0].parSemaineCentimes, 21000);
  } },
  { nom: 'habitudes : rien à dire sans au moins 2 mois d’historique', fn: () => {
    egal(habitudes(etatBase({ transactions: quotidien('2026-10-05', 31, 1000) }), '2026-11-06'), null);
  } },
  { nom: 'raisonnement : budget plus bas que les habitudes → mois serré, manque chiffré, poste à réduire', fn: () => {
    const e = etatBase({
      revenusMensuels: [revenus('2026-11', 90000)],
      chargesFixes: [{ id: 'l', libelle: 'Loyer', estLoyer: true, montantCentimes: 30000, jourPrelevement: 8, categorie: 'logement', actif: true }],
      transactions: [...quotidien('2026-08-05', 31, 3000), ...quotidien('2026-09-05', 30, 3000), ...quotidien('2026-10-05', 31, 3000), tx({ date: '2026-11-05', montant: 120000, sens: 'credit', categorie: 'salaire', marchand: 'Employeur' })],
    });
    const a = raisonner(e, '2026-11-06');
    sansTrou(a);
    egal(a.niveau, 'tendu');
    const p = a.points.find((x) => x.id === 'habitudes');
    egal(p.ton, 'alerte');
    vrai(/environ 30\s€ par jour/u.test(p.constat), p.constat);
    vrai(/il te manquera environ/.test(p.pourquoi), p.pourquoi);
    vrai(/Manger dehors/.test(p.donc), p.donc);
    egal(a.points[0].id, 'habitudes');                      // les alertes passent en premier
    vrai(a.points.every((x) => x.constat && x.pourquoi && x.donc));
  } },
  { nom: 'raisonnement : petit rythme et budget large → dans les clous, reste projeté vers l’épargne', fn: () => {
    const e = etatBase({
      revenusMensuels: [revenus('2026-11', 150000)],
      transactions: [...quotidien('2026-09-05', 30, 1000), ...quotidien('2026-10-05', 31, 1000), tx({ date: '2026-11-05', montant: 150000, sens: 'credit', categorie: 'salaire', marchand: 'Employeur' }), tx({ date: '2026-11-06', montant: 500, marchand: 'Boulangerie' })],
    });
    const a = raisonner(e, '2026-11-08');
    sansTrou(a);
    egal(a.niveau, 'ok');
    egal(a.points.find((x) => x.id === 'habitudes').ton, 'bien');
    vrai(/épargne/.test(a.phrase));
  } },
  { nom: 'raisonnement : les remboursements qui finissent sont annoncés pour le mois suivant', fn: () => {
    const e = etatBase({
      revenusMensuels: [revenus('2026-11', 150000), revenus('2026-12', 150000)],
      prets: [{ id: 'p1', sens: 'empruntéParMoi', personneAlias: 'Proche A', montantCentimes: 20000, echeancier: [{ date: '2026-11-10', montantCentimes: 20000, payee: false }] }],
      transactions: [],
    });
    const a = raisonner(e, '2026-11-06');
    sansTrou(a);
    const p = a.points.find((x) => x.id === 'engagements');
    vrai(/s’allège en décembre/.test(p.donc), p.donc);
    vrai(/Proche A terminé/.test(p.donc), p.donc);
    vrai(/libère 200,00/u.test(p.donc), p.donc);
    egal(a.points.find((x) => x.id === 'epargne').titre, 'Rembourser passe avant épargner');
  } },
  { nom: 'raisonnement : budget positif mais compte courant vide → alerte découvert, pas un reproche sur les habitudes', fn: () => {
    const e = etatBase({
      revenusMensuels: [revenus('2026-11', 150000)],   // salaire saisi mais pas encore sur le compte
      chargesFixes: [{ id: 'l', libelle: 'Loyer', estLoyer: true, montantCentimes: 30000, jourPrelevement: 8, categorie: 'logement', actif: true }],
      transactions: [...quotidien('2026-09-05', 30, 1000), ...quotidien('2026-10-05', 31, 1000)],
    });
    const a = raisonner(e, '2026-11-06');
    sansTrou(a);
    egal(a.titre, 'Attention au découvert');
    vrai(/virement/.test(a.phrase), a.phrase);
    egal(a.points[0].id, 'tresorerie');
  } },
  { nom: 'raisonnement : mois dépassé → verdict clair, sans budget négatif par jour', fn: () => {
    const e = etatBase({ revenusMensuels: [revenus('2026-11', 50000)], transactions: [tx({ date: '2026-11-06', montant: 60000, marchand: 'Achat' })] });
    const a = raisonner(e, '2026-11-07');
    sansTrou(a);
    egal(a.niveau, 'depasse');
    vrai(/dépassé de 100,00/u.test(a.phrase), a.phrase);
  } },
];
