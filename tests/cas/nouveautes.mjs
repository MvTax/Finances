// nouveautes.mjs — prévision de fin de mois, journées sans dépense, ajout express, sauvegarde chiffrée.
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { previsionFinDeMois } from '../../js/prevision.js';
import { bilanJour, calendrierSansDepense, serieSansDepense } from '../../js/sansdepense.js';
import { depensesFrequentes } from '../../js/express.js';
import { chiffrer, dechiffrer, estChiffre } from '../../js/chiffrement.js';
import { resteADepenser } from '../../js/calculs.js';
import { verdictMois } from '../../js/verdict.js';
import { analyserPhrases, analyserPhrase } from '../../js/saisie.js';
import { datesVirements, joursDuMoisVirements } from '../../js/virements.js';
import { validerVoixMulti } from '../../js/ia.js';
import { simulerAchat } from '../../js/simulation.js';

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
  { nom: 'verdict du mois : vert (bonne lancée), orange (dépenses évitables), rouge (dépassement prévu)', fn: () => {
    const jours = ['05', '06', '07', '08', '09', '10'];
    const vert = etat({ transactions: jours.map((d) => tx({ date: `2026-11-${d}`, montant: 800, categorie: 'courses' })) });
    vert.comptes[0].soldeInitialCentimes = 150000;
    const v = verdictMois(vert, '2026-11-11');
    egal(v.couleur, 'vert', v.raisons.join(' | '));
    const orange = etat({ transactions: jours.map((d) => tx({ date: `2026-11-${d}`, montant: 800, categorie: 'livraison' })) });
    orange.comptes[0].soldeInitialCentimes = 150000;
    const o = verdictMois(orange, '2026-11-11');
    egal(o.couleur, 'orange'); vrai(o.raisons.some((x) => /évitables/.test(x)));
    const rouge = etat({ transactions: jours.map((d) => tx({ date: `2026-11-${d}`, montant: 9000, categorie: 'courses' })) });
    rouge.comptes[0].soldeInitialCentimes = 150000;
    const r = verdictMois(rouge, '2026-11-11');
    egal(r.couleur, 'rouge'); vrai(r.raisons.some((x) => /dépassement|dépassé/.test(x)));
  } },
  { nom: 'plusieurs dépenses en une phrase : séparateurs, virgule des centimes, date commune, mots accentués', fn: () => {
    const r = analyserPhrases("Vélib' 3 €, menu 9,50 et pain 1,20", '2026-11-07');
    egal(r.map((o) => `${o.libelle}:${o.montantCentimes}`).join(' '), "Vélib':300 Menu:950 Pain:120");
    const h = analyserPhrases('hier 2 fois 3,20 café et uber 12 euros', '2026-11-07');
    egal(h.map((o) => `${o.montantCentimes}@${o.date}`).join(' '), '640@2026-11-06 1200@2026-11-06', '« hier » vaut pour les deux');
    egal(analyserPhrases('4,89 Lidl', '2026-11-07').length, 1);
    egal(analyserPhrase('cinéma 11,50', '2026-11-07').libelle, 'Cinéma', '« ma » n’est pas retiré de « cinéma »');
    const v = validerVoixMulti({ sens: 'debit', montantCentimes: 300, libelle: 'Vélib', categorie: 'velo', date: '2026-11-07', confiance: 0.9, autres: [{ sens: 'debit', montantCentimes: 950, libelle: 'Menu', categorie: 'restauration-rapide', date: '2026-11-07', confiance: 0.8 }, { sens: 'debit', montantCentimes: -1 }] });
    egal(v.autres.length, 1, 'opérations invalides écartées');
  } },
  { nom: 'virements : 4 par mois, 6 jours après le salaire puis tous les 7 jours ; rappels au calendrier', fn: () => {
    egal(datesVirements({ debut: '2026-12-05', fin: '2027-01-04' }).join(' '), '2026-12-11 2026-12-18 2026-12-25 2027-01-01');
    egal(joursDuMoisVirements(5).join(','), '1,11,18,25');
    egal(joursDuMoisVirements(28).join(','), '3,10,17,24');
  } },
  { nom: '« Et si j’achète ? » : petit achat sans risque (pris sur le reste du jour), gros achat → après le salaire', fn: () => {
    const e = etat({ transactions: ['05', '06', '07', '08', '09', '10'].map((d) => tx({ date: `2026-11-${d}`, montant: 800, categorie: 'courses' })) });
    e.comptes[0].soldeInitialCentimes = 150000;
    const petit = simulerAchat(e, '2026-11-11', { montantCentimes: 500 });
    egal(petit.sansRisque, true, petit.raisons.join(' | ')); egal(petit.dateSansRisque, '2026-11-11');
    egal(petit.apres.partSuivantsCentimes, petit.avant.partSuivantsCentimes, 'pris sur le reste du jour : les jours suivants ne bougent pas');
    egal(petit.epargnePerdueCentimes, 500, 'le reste du jour qui partait à l’épargne');
    const gros = simulerAchat(e, '2026-11-11', { montantCentimes: 30000 });
    egal(gros.sansRisque, false); egal(gros.dateSansRisque, '2026-12-05', 'après le salaire');
    vrai(gros.apres.partSuivantsCentimes < gros.avant.partSuivantsCentimes);
  } },
];
