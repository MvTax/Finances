// jeu.mjs — points, niveaux, série et quêtes du style Joyeux.
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { profilJeu, serieJours, quetesDuJour, humeur, flammesDesJours, premierJourDonnees, NIVEAUX, POINTS } from '../../js/jeu.js';

const revenus = { mois: '2026-11', salaireCentimes: 150000, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' };
const etat = (extra = {}) => { const e = etatBase({ revenusMensuels: [revenus], privations: [], ...extra }); e.profil.repasAuto = { actif: false }; e.meta = { jeu: { depuis: '2026-11-05' } }; return e; };
const saisie = (date, montant, o = {}) => ({ ...tx({ date, montant }), source: 'texte', ...o });

export default [
  { nom: 'jeu : points des dépenses notées, privations, restes du jour, journées sans dépense et virements ; niveau', fn: () => {
    const e = etat({
      transactions: [saisie('2026-11-06', 300), saisie('2026-11-06', 950), saisie('2026-11-07', 120), { ...tx({ date: '2026-11-06', montant: 5000 }), source: 'import' },
        { ...tx({ date: '2026-11-08', montant: 1118 }), epargne: { estEpargne: true, type: 'virementLivret' }, categorie: 'epargne' }],
      privations: [{ id: 'p', date: '2026-11-06', montantCentimes: 950 }, { id: 'reste-2026-11-06', date: '2026-11-06', source: 'resteJour', montantCentimes: 56 }, { id: 'a', date: '2026-11-06', auto: true, montantCentimes: 1290 }],
    });
    e.meta.sansDepense = { jours: { '2026-11-05': {} } };
    const p = profilJeu(e, '2026-11-08');
    egal(p.details.saisies, 3 * POINTS.saisie, 'le relevé importé ne compte pas');
    egal(p.details.joursNotes, 2 * POINTS.jourNote);
    egal(p.details.privations, POINTS.privation, 'les repas automatiques ne comptent pas comme privation');
    egal(p.details.restes, POINTS.resteDuJour);
    egal(p.details.sansDepense, POINTS.sansDepense, 'le 5 : rien dépensé, super flamme (annoncée ou non)');
    egal(p.details.virements, POINTS.virement);
    egal(p.xp, 15 + 20 + 10 + 15 + 40 + 25);
    egal(p.niveau.nom, NIVEAUX[0].nom); vrai(p.progression > 0 && p.progression < 1);
  } },
  { nom: 'jeu : flammes (dépense notée) et super flammes (journée sans dépense), quêtes du jour, humeur', fn: () => {
    // Le 5 : rien (super flamme) ; le 6 : dépense du relevé sans saisie (rien) ; le 7 et le 8 : saisies
    const e = etat({ transactions: [{ ...tx({ date: '2026-11-06', montant: 900 }), source: 'import' }, saisie('2026-11-07', 300), saisie('2026-11-08', 200)] });
    e.meta.joursVus = ['2026-11-06'];
    egal(serieJours(e, '2026-11-07'), 1, 'ouvrir l’app ne suffit plus : le 6 casse la série');
    egal(serieJours(e, '2026-11-08'), 2);
    egal(serieJours(e, '2026-11-09'), 2, 'aujourd’hui pas encore fait : la série tient');
    egal(serieJours(e, '2026-11-10'), 3, 'le 9, rien dépensé : super flamme, la série continue');
    egal(flammesDesJours(e, '2026-11-08', 4).map((x) => x.statut).join(' '), 'rien rien flamme flamme', 'le 5, avant la première donnée (le 6) : l’app ne sait rien, pas de super flamme');
    const e2 = etat({ transactions: [saisie('2026-11-07', 300)] });
    egal(serieJours(e2, '2026-11-07'), 1, 'première dépense le 7 : le 5 et le 6 (jeu commencé, mais rien de connu) ne sont pas des super flammes');
    const e3 = etat({ transactions: [{ ...tx({ date: '2026-11-04', montant: 900 }), source: 'import' }, saisie('2026-11-07', 300)] });
    egal(serieJours(e3, '2026-11-07'), 3, 'relevé connu depuis le 4 : le 5 et le 6 sans dépense sont des super flammes');
    const q = quetesDuJour(e2, '2026-11-07');
    egal(q.map((x) => `${x.id}:${x.faite}`).join(' '), 'noter:true tenir:false piece:false');
    egal(q[1].enCours, true);
    egal(humeur(1000, 1300), 'ravie'); egal(humeur(100, 1300), 'inquiete'); egal(humeur(-1, 1300), 'triste');
  } },
  { nom: 'jeu : app vide (jeu commencé au début du mois) → aucune flamme, aucune super flamme, aucun point', fn: () => {
    // Le jeu démarre au début de la période (salaire), mais l'app n'a encore rien : « rien noté » ≠ « rien dépensé »
    const vide = etat();
    egal(premierJourDonnees(vide), null);
    egal(serieJours(vide, '2026-11-17'), 0);
    egal(profilJeu(vide, '2026-11-17').xp, 0);
    vrai(flammesDesJours(vide, '2026-11-17', 14).every((x) => x.statut !== 'super'));
    // Première dépense notée aujourd'hui (le 17) : 1 jour, pas 13
    const un = etat({ transactions: [saisie('2026-11-17', 450)] });
    egal(premierJourDonnees(un), '2026-11-17');
    egal(serieJours(un, '2026-11-17'), 1);
    egal(serieJours(un, '2026-11-19'), 2, 'le 18 sans dépense, après la première donnée : super flamme');
    // Une journée « sans dépense » annoncée ou une privation compte comme une donnée connue (une privation automatique non)
    const annonce = etat(); annonce.meta.sansDepense = { jours: { '2026-11-15': {} } };
    egal(premierJourDonnees(annonce), '2026-11-15'); egal(serieJours(annonce, '2026-11-17'), 2);
    egal(premierJourDonnees(etat({ privations: [{ id: 'a', date: '2026-11-10', auto: true, montantCentimes: 900 }] })), null);
  } },
];
