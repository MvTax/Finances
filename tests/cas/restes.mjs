// restes.mjs — à 5 h du matin, ce qui reste de la part de la veille part à l'épargne.
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { cloturerJours, jourBudgetaire, dernierJourClos, resteDuJourPasse } from '../../js/restes.js';
import { jaugeDuJour } from '../../js/calculs.js';
import { historiqueCagnotte } from '../../js/virements.js';

const revenus = { mois: '2026-11', salaireCentimes: 150000, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' };
const etat = (extra = {}) => {
  const e = etatBase({ revenusMensuels: [revenus], privations: [], ...extra });
  e.profil.repasAuto = { actif: false };
  e.meta = { restesJour: { depuis: '2026-11-07', dernier: null } };
  return e;
};
// Heure de Paris (UTC+1 en novembre)
const a = (iso, h, m = 0) => new Date(`${iso}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:30+01:00`);
/** Applique les opérations comme le ferait le store. */
const appliquer = (e, res) => {
  for (const o of res.ops) {
    e.privations = e.privations.filter((p) => p.id !== o.valeur.id);
    if (!o.supprimer) e.privations.push(o.valeur);
  }
  e.meta.restesJour = res.meta;
};

export default [
  { nom: 'restes du jour : la journée se termine à 5 h (le 7 est clos le 8 à 5 h, pas avant)', fn: () => {
    egal(jourBudgetaire(a('2026-11-08', 4, 59)), '2026-11-07');
    egal(jourBudgetaire(a('2026-11-08', 5, 0)), '2026-11-08');
    egal(dernierJourClos(a('2026-11-08', 4, 59)), '2026-11-06');
    egal(dernierJourClos(a('2026-11-08', 5, 1)), '2026-11-07');
    const e = etat({ transactions: [tx({ date: '2026-11-07', montant: 300 })] });
    egal(cloturerJours(e, a('2026-11-08', 4, 59)).ops.length, 0, 'avant 5 h : rien');
    const res = cloturerJours(e, a('2026-11-08', 5, 1));
    egal(res.ops.length, 1); egal(res.nouveaux.length, 1);
    const r = res.nouveaux[0];
    egal(r.date, '2026-11-07'); egal(r.source, 'resteJour');
    const j = jaugeDuJour(e, '2026-11-07');
    egal(r.montantCentimes, j.parJourCentimes - j.depensesDuJourCentimes, 'part du jour − dépensé');
    egal(res.meta.dernier, '2026-11-07');
  } },
  { nom: 'restes du jour : la part des jours suivants ne grossit plus avec ce qui n’a pas été dépensé', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-11-07', montant: 300 }), tx({ date: '2026-11-08', montant: 500 })] });
    const p7 = jaugeDuJour({ ...e, transactions: e.transactions.filter((t) => t.date <= '2026-11-07') }, '2026-11-07').parJourCentimes;
    appliquer(e, cloturerJours(e, a('2026-11-09', 6)));
    egal(e.privations.length, 2, 'le 7 et le 8');
    const p9 = jaugeDuJour(e, '2026-11-09').parJourCentimes;
    vrai(Math.abs(p9 - p7) <= 1, `même part chaque jour (${p7} → ${p9})`);
    egal(cloturerJours(e, a('2026-11-09', 7)).ops.length, 0, 'une seule fois');
  } },
  { nom: 'restes du jour : une dépense oubliée ajoutée après coup fait baisser le reste (tant qu’il n’est pas viré)', fn: () => {
    const e = etat();
    appliquer(e, cloturerJours(e, a('2026-11-08', 6)));
    const avant = e.privations[0].montantCentimes;
    e.transactions.push(tx({ date: '2026-11-07', montant: 1000 }));
    appliquer(e, cloturerJours(e, a('2026-11-08', 9)));
    egal(e.privations[0].montantCentimes, avant - 1000);
    e.privations[0].vireLe = '2026-11-12';
    e.transactions.push(tx({ date: '2026-11-07', montant: 500 }));
    egal(cloturerJours(e, a('2026-11-13', 9)).ops.filter((o) => o.valeur.id === 'reste-2026-11-07').length, 0, 'viré : figé');
  } },
  { nom: 'restes du jour : rien si tout a été dépensé ; les repas à la maison passent avant', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-11-07', montant: 20000 })] });
    egal(cloturerJours(e, a('2026-11-08', 6)).ops.length, 0);
    const e2 = etat();
    e2.profil.repasAuto = { actif: true, depuis: '2026-11-01', repasParJour: 2 };
    const sans = resteDuJourPasse(etat(), '2026-11-07');
    const avec = resteDuJourPasse(e2, '2026-11-07');
    vrai(avec < sans && avec >= 0, `repas d’abord (${sans} → ${avec})`);
  } },
  { nom: 'restes du jour : dans l’historique de la cagnotte, source « reste »', fn: () => {
    const e = etat();
    e.poches = [];
    appliquer(e, cloturerJours(e, a('2026-11-08', 6)));
    const h = historiqueCagnotte(e, '2026-11-08');
    const l = h.lignes.find((x) => x.source === 'reste');
    vrai(l && l.montantCentimes === e.privations[0].montantCentimes);
  } },
];
