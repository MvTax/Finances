// nouveautes.mjs — prévision de fin de mois, journées sans dépense, ajout express, sauvegarde chiffrée.
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { previsionFinDeMois } from '../../js/prevision.js';
import { bilanJour, calendrierSansDepense, serieSansDepense } from '../../js/sansdepense.js';
import { depensesFrequentes } from '../../js/express.js';
import { chiffrer, dechiffrer, estChiffre } from '../../js/chiffrement.js';
import { resteADepenser } from '../../js/calculs.js';

const revenus = { mois: '2026-11', salaireCentimes: 150000, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' };
const etat = (extra = {}) => { const e = etatBase({ revenusMensuels: [revenus], privations: [], ...extra }); e.profil.repasAuto = { actif: false }; e.meta = {}; return e; };

export default [
  { nom: 'prévision : au rythme des jours passés ; pas fiable avant 3 jours, alerte seulement à partir du 5e', fn: () => {
    const peu = previsionFinDeMois(etat({ transactions: [tx({ date: '2026-11-05', montant: 1000 })] }), '2026-11-07');
    egal(peu.fiable, false, '2 jours écoulés');
    const txs = ['05', '06', '07', '08', '09', '10'].map((d) => tx({ date: `2026-11-${d}`, montant: 1500 }));
    const e = etat({ transactions: txs });
    const p = previsionFinDeMois(e, '2026-11-11');
    egal(p.fiable, true); egal(p.rythmeCentimes, 1500); egal(p.joursEcoules, 6);
    const r = resteADepenser(e, '2026-11-11');
    egal(p.previsionCentimes, r.resteCentimes - 1500 * p.joursRestants, 'reste − rythme × jours restants');
    const gros = etat({ transactions: ['05', '06', '07', '08', '09', '10'].map((d) => tx({ date: `2026-11-${d}`, montant: 9000 })) });
    const g = previsionFinDeMois(gros, '2026-11-11');
    vrai(g.previsionCentimes < 0 && g.alerte, 'dépassement prévu → alerte');
    vrai(!previsionFinDeMois(gros, '2026-11-09').alerte, 'pas avant le 5e jour');
  } },
  { nom: 'journée sans dépense : tenue, rompue, en cours ; ce qu’elle a rapporté ; série', fn: () => {
    const e = etat({ transactions: [tx({ date: '2026-11-08', montant: 300 })], privations: [
      { id: 'reste-2026-11-07', date: '2026-11-07', source: 'resteJour', montantCentimes: 1300 },
      { id: 'p', date: '2026-11-07', montantCentimes: 950, categorie: 'restauration-rapide' }] });
    e.meta.sansDepense = { jours: { '2026-11-06': {}, '2026-11-07': {}, '2026-11-08': {}, '2026-11-10': {} } };
    egal(bilanJour(e, '2026-11-07', '2026-11-10').statut, 'tenue');
    egal(bilanJour(e, '2026-11-07', '2026-11-10').misDeCoteCentimes, 2250);
    egal(bilanJour(e, '2026-11-08', '2026-11-10').statut, 'rompue');
    egal(bilanJour(e, '2026-11-09', '2026-11-10').statut, 'sansDepense', 'non annoncée, rien dépensé');
    egal(bilanJour(e, '2026-11-10', '2026-11-10').statut, 'enCours');
    const c = calendrierSansDepense(e, '2026-11-10');
    egal(c.nbAnnoncees, 4); egal(c.nbTenues, 2); egal(c.rapporteCentimes, 2250);
    egal(c.semaines.length, 5); egal(c.semaines[4][0].jour, '2026-11-09', 'lundi de la semaine en cours');
    egal(serieSansDepense(e, '2026-11-10'), 1, 'aujourd’hui en cours, hier non annoncé');
  } },
  { nom: 'ajout express : marchands revenus au moins 2 fois en 90 jours, montant le plus fréquent', fn: () => {
    const e = etat({ transactions: [
      tx({ date: '2026-11-01', montant: 300, marchand: "Vélib'", categorie: 'transports' }),
      tx({ date: '2026-11-03', montant: 300, marchand: "Vélib'", categorie: 'transports' }),
      tx({ date: '2026-11-04', montant: 500, marchand: "Vélib'", categorie: 'transports' }),
      tx({ date: '2026-11-02', montant: 950, marchand: 'Fast-food', categorie: 'restauration-rapide' }),
      tx({ date: '2026-11-06', montant: 1050, marchand: 'Fast-food', categorie: 'restauration-rapide' }),
      tx({ date: '2026-11-05', montant: 4500, marchand: 'Une fois' }),
      tx({ date: '2026-07-01', montant: 200, marchand: 'Ancien' }), tx({ date: '2026-07-02', montant: 200, marchand: 'Ancien' }),
      tx({ date: '2026-11-02', montant: 1399, marchand: 'Streaming', categorie: 'abonnements' }), tx({ date: '2026-10-02', montant: 1399, marchand: 'Streaming', categorie: 'abonnements' }),
    ] });
    const f = depensesFrequentes(e, '2026-11-07');
    egal(f.map((x) => `${x.marchand}:${x.montantCentimes}`).join(' '), "Vélib':300 Fast-food:950");
    egal(f[0].categorie, 'transports');
  } },
  { nom: 'sauvegarde chiffrée : aller-retour, mauvais mot de passe refusé, contenu illisible', fn: async () => {
    const texte = JSON.stringify({ contenu: { transactions: [{ id: 'a', montantCentimes: 123 }] } });
    const env = await chiffrer(texte, 'mot de passe solide');
    vrai(estChiffre(env));
    vrai(!JSON.stringify(env).includes('montantCentimes'), 'rien en clair');
    egal(await dechiffrer(env, 'mot de passe solide'), texte);
    let erreur = null;
    try { await dechiffrer(env, 'faux'); } catch (e) { erreur = e.message; }
    egal(erreur, 'Mot de passe incorrect');
  } },
];
