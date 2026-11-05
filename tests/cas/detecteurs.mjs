import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { syntheseMensuelle, topMarchands, fuiteWeekend, especes, livraison, abonnementsDoublons, penalitesVelo, reprisesEpargne, creditInstant, decouverts, coutAnnuelRecurrent } from '../../js/detecteurs.js';
import { planActionLocal } from '../../js/coach.js';

function etatTest() {
  const e = etatBase();
  const T = (o) => e.transactions.push(tx(o));
  for (let i = 0; i < 6; i++) T({ date: `2026-10-0${i + 1}`, montant: 930, marchand: "McDonald's", categorie: 'restauration-rapide' });
  T({ date: '2026-10-03', montant: 1269, marchand: 'Uber Eats', categorie: 'livraison' });
  T({ date: '2026-10-04', montant: 1400, marchand: 'Uber Eats via un tiers', categorie: 'livraison', extra: { regleRevolut: true, role: 'versParticulier' } });
  T({ date: '2026-10-10', montant: 70000, marchand: "Retrait d'espèces", categorie: 'especes', libelleBrut: 'CB RETRAIT DU 09/10 | X | FRAIS RETRAIT DAB UE 1,50 EUR' });
  T({ date: '2026-10-11', montant: 300, marchand: "Vélib'", categorie: 'velo' }); T({ date: '2026-10-11', montant: 300, marchand: "Vélib'", categorie: 'velo' });
  for (const m of ['2026-08-05', '2026-09-05', '2026-10-05']) T({ date: m, montant: 899, marchand: 'Bouygues Telecom', categorie: 'telephonie' });
  for (const m of ['2026-08-12', '2026-09-12']) T({ date: m, montant: 699, marchand: 'Lycamobile', categorie: 'telephonie' });
  T({ date: '2026-10-05', montant: 60000, epargne: true, categorie: 'epargne' }); T({ date: '2026-10-07', montant: 10000, sens: 'credit', epargne: true, categorie: 'epargne' });
  T({ date: '2026-09-10', montant: 100000, sens: 'credit', categorie: 'deblocage-credit', libellePrincipal: 'DEBLOCAGE CREDIT INSTANT', libelleBrut: 'DEBLOCAGE CREDIT INSTANT | 000AAAA1111' });
  T({ date: '2026-09-11', montant: 1200, categorie: 'frais-bancaires', marchand: 'Crédit instant', libellePrincipal: 'FRAIS CREDIT INSTANT', libelleBrut: 'FRAIS CREDIT INSTANT | 000AAAA1111' });
  T({ date: '2026-10-09', montant: 33400, categorie: 'credits', libellePrincipal: 'CREDIT INSTANT ECH 261009', libelleBrut: 'CREDIT INSTANT ECH 261009 | 000AAAA1111' });
  T({ date: '2026-10-01', montant: 155000, sens: 'credit', categorie: 'salaire' });
  return e;
}

export default [
  { nom: 'détecteurs : synthèse mensuelle (revenus, dépenses, épargne nette, crédits)', fn: () => {
    const m = syntheseMensuelle(etatTest(), '2026-10-01', '2026-10-31')[0];
    egal(m.revenus, 155000); egal(m.epargneNette, 50000); egal(m.dettes, 33400); egal(m.especes, 70000);
    egal(m.depenses, 6 * 930 + 1269 + 1400 + 70000 + 600 + 899);
  } },
  { nom: 'détecteurs : top marchands, livraison cumulée (direct + via un tiers), espèces et frais de retrait', fn: () => {
    const e = etatTest();
    const top = topMarchands(e, '2026-10-01', '2026-10-31'); egal(top[0].marchand, "Retrait d'espèces"); egal(top.find((x) => x.marchand === "McDonald's").passages, 6);
    const l = livraison(e, '2026-10-01', '2026-10-31'); egal(l.commandes, 2); egal(l.totalCentimes, 2669); egal(l.nbTiers, 1); egal(l.panierMoyenCentimes, 1335);
    const es = especes(e, '2026-10-01', '2026-10-31'); egal(es.totalCentimes, 70000); egal(es.fraisCentimes, 150);
  } },
  { nom: 'détecteurs : doublon d’opérateurs mobiles, pénalités vélo, reprises d’épargne, crédit instant', fn: () => {
    const e = etatTest();
    egal(abonnementsDoublons(e, '2026-08-01', '2026-10-31')[0].type, 'telephonie');
    egal(penalitesVelo(e, '2026-10-01', '2026-10-31').suspectes, 1);
    const r = reprisesEpargne(e, '2026-10-01', '2026-10-31'); egal(r.nbReprises, 1); egal(r.nette, 50000);
    const ci = creditInstant(e, '2026-09-01', '2026-10-31'); egal(ci.nbDeblocages, 1); egal(ci.fraisCentimes, 1200); egal(ci.totalRembourseCentimes, 33400);
  } },
  { nom: 'détecteurs : fuite du week-end, découverts, coût annuel d’une petite dépense fréquente', fn: () => {
    const e = etatTest();
    const w = fuiteWeekend(e, '2026-10-01', '2026-10-31'); vrai(w.parJourSemaine > 0);
    const d = decouverts(e, '2026-10-01', '2026-10-31'); vrai(d.joursNegatifs >= 0);
    const c = coutAnnuelRecurrent(e, "McDonald's", '2026-10-06'); egal(c.passages, 6); egal(c.annuelCentimes, Math.round((6 * 930 * 365) / 30));
  } },
  { nom: 'coach local : cartes chiffrées, crédit instant en priorité', fn: () => {
    const cartes = planActionLocal(etatTest(), { fin: '2026-10-31', nbMois: 3 });
    egal(cartes[0].marchand, 'Crédit instant'); egal(cartes[0].action, 'supprimer');
    vrai(cartes.some((c) => c.action === 'supprimer' && c.marchand === 'Lycamobile'), 'doublon téléphonie');
    for (const c of cartes) { vrai(['supprimer', 'eviter', 'reduire', 'remplacer', 'garder'].includes(c.action)); egal(c.economieAnnuelleCentimes, c.economieMensuelleCentimes * 12); }
  } },
];
