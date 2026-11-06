// conseils.mjs — statistiques par poste (mois passés) et conseils chiffrés.
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { CONSEILS, conseilsPoste, postesDepense } from '../../js/conseils.js';
import { CATEGORIES, categorie } from '../../js/categories.js';

const passe = { debut: '2026-08-05', fin: '2026-11-04' }; // 3 mois de salaire (92 jours)

export default [
  { nom: 'base de conseils : chaque poste existe et a au moins une astuce ou une alternative', fn: () => {
    const ids = new Set(CATEGORIES.map((c) => c.id));
    for (const [id, c] of Object.entries(CONSEILS)) {
      vrai(ids.has(id), `catégorie inconnue : ${id}`);
      vrai(c.astuces.length + c.gratuit.length + c.remplacer.length > 0, `poste vide : ${id}`);
      for (const [a, b] of c.remplacer) vrai(a && b, `remplacement incomplet : ${id}`);
    }
    for (const c of CATEGORIES.filter((x) => x.nature === 'depense' && x.id !== 'dons')) vrai(CONSEILS[c.id], `pas de conseils pour ${c.id}`);
  } },
  { nom: 'postes : moyenne par mois sur les mois passés, comparée au mois en cours au prorata des jours', fn: () => {
    const e = etatBase({ transactions: [
      tx({ date: '2026-08-10', montant: 9000, categorie: 'livraison', marchand: 'Uber Eats' }),
      tx({ date: '2026-09-10', montant: 9000, categorie: 'livraison', marchand: 'Uber Eats' }),
      tx({ date: '2026-10-10', montant: 9000, categorie: 'livraison', marchand: 'Deliveroo' }),
      tx({ date: '2026-10-12', montant: 3000, categorie: 'courses', marchand: 'Lidl' }),
      tx({ date: '2026-11-06', montant: 6000, categorie: 'livraison', marchand: 'Uber Eats' }),   // mois en cours
    ] });
    const p = postesDepense(e, { ...passe, moisEnCours: { debut: '2026-11-05', fin: '2026-12-04', nbJours: 30, aujourdhui: '2026-11-14' } });
    egal(p[0].id, 'livraison');
    egal(p[0].moyenneMensuelleCentimes, Math.round(27000 / (92 / 30.44)));
    egal(p[0].ceMoisCentimes, 6000, 'le mois en cours n’entre pas dans la moyenne');
    egal(p[0].attenduCeJourCentimes, Math.round(p[0].moyenneMensuelleCentimes * (10 / 30)));
    vrai(p[0].ecartCentimes > 0, 'au-dessus de la moyenne à ce stade');
    vrai(Math.abs(p.reduce((s, x) => s + x.part, 0) - 1) < 1e-9);
  } },
  { nom: 'conseils d’un poste : chiffres, marchands, économie visée (30 %, 10 % pour un poste nécessaire)', fn: () => {
    const e = etatBase({ transactions: [
      tx({ date: '2026-09-10', montant: 9000, categorie: 'livraison', marchand: 'Uber Eats' }),
      tx({ date: '2026-10-10', montant: 6000, categorie: 'livraison', marchand: 'Deliveroo' }),
      tx({ date: '2026-10-11', montant: 20000, categorie: 'courses', marchand: 'Lidl' }),
    ] });
    const c = conseilsPoste(e, 'livraison', { ...passe, aujourdhui: '2026-11-14' });
    egal(c.nom, categorie('livraison').nom); egal(c.passages, 2); egal(c.marchands[0].nom, 'Uber Eats');
    egal(c.tauxVise, 0.3); egal(c.economieMensuelleCentimes, Math.round((c.moyenneMensuelleCentimes * 0.3) / 100) * 100);
    vrai(c.remplacer.length && c.astuces.length);
    const k = conseilsPoste(e, 'courses', { ...passe, aujourdhui: '2026-11-14' });
    vrai(k.essentiel); egal(k.tauxVise, 0.1);
  } },
  { nom: 'conseils abonnements : chaque service repéré avec ses alternatives', fn: () => {
    const e = etatBase({ chargesFixes: [{ id: 'n', libelle: 'Netflix', montantCentimes: 1399, jourPrelevement: 10, categorie: 'abonnements', actif: true }] });
    const c = conseilsPoste(e, 'abonnements', { ...passe, aujourdhui: '2026-11-14' });
    egal(c.abonnements.length, 1);
    vrai(c.abonnements[0].alternatives.some((a) => /Arte/.test(a)));
  } },
];
