// jeu.mjs — points, niveaux, série et quêtes du style Joyeux.
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { profilJeu, serieJours, quetesDuJour, humeur, NIVEAUX, POINTS } from '../../js/jeu.js';

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
    egal(p.details.sansDepense, POINTS.sansDepense, 'le 5 : rien dépensé');
    egal(p.details.virements, POINTS.virement);
    egal(p.xp, 15 + 20 + 10 + 15 + 40 + 25);
    egal(p.niveau.nom, NIVEAUX[0].nom); vrai(p.progression > 0 && p.progression < 1);
  } },
  { nom: 'jeu : série de jours (app ouverte ou dépense notée), quêtes du jour, humeur', fn: () => {
    const e = etat({ transactions: [saisie('2026-11-07', 300)] });
    e.meta.joursVus = ['2026-11-05', '2026-11-06'];
    egal(serieJours(e, '2026-11-07'), 3);
    egal(serieJours(e, '2026-11-08'), 3, 'aujourd’hui pas encore fait : la série tient');
    egal(serieJours(e, '2026-11-09'), 0);
    const q = quetesDuJour(e, '2026-11-07');
    egal(q.map((x) => `${x.id}:${x.faite}`).join(' '), 'noter:true tenir:false piece:false');
    egal(q[1].enCours, true);
    egal(humeur(1000, 1300), 'ravie'); egal(humeur(100, 1300), 'inquiete'); egal(humeur(-1, 1300), 'triste');
  } },
];
