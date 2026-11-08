// recalcul.mjs — « Recalcul complet » : calcul détaillé par compte et pistes pour les écarts.
import { egal, vrai } from '../outils/assert.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { recalculComplet, detailCompte } from '../../js/recalcul.js';

const etat = (o = {}) => {
  const e = etatBase({
    revenusMensuels: [{ mois: '2026-11', salaireCentimes: 150000, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' }],
    transactions: [
      tx({ date: '2026-11-05', montant: 150000, sens: 'credit', categorie: 'salaire', marchand: 'Salaire' }),
      tx({ date: '2026-10-20', montant: 1350, categorie: 'restaurant', marchand: 'Kebab' }), tx({ date: '2026-10-27', montant: 1350, categorie: 'restaurant', marchand: 'Kebab' }),
      tx({ date: '2026-11-06', montant: 1350, categorie: 'restaurant', marchand: 'Kebab' }),
      tx({ date: '2026-11-07', montant: 2500, categorie: 'courses', marchand: 'Supermarché' }),
    ],
    chargesFixes: [{ id: 'spotify', libelle: 'Spotify', montantCentimes: 1199, jourPrelevement: 6, actif: true, compteId: 'courant', categorie: 'abonnements' }],
    poches: [{ id: 'pret', nom: 'Prêt', type: 'remboursementAnticipe', actif: true, partRepartition: 50, mouvements: [{ id: 'm', date: '2026-11-06', montantCentimes: 2000, sens: 'versement' }] }],
    privations: [], ...o,
  });
  e.profil.repasAuto = { actif: false };
  return e;
};

export default [
  { nom: 'recalcul : le détail d’un compte retombe exactement sur son solde', fn: () => {
    const e = etat();
    const d = detailCompte(e, e.comptes[0], '2026-11-08');
    vrai(d.verifie, 'départ + chaque famille = solde calculé');
    egal(d.finCentimes, -2700 + 150000 - 1350 - 2500);
    vrai(d.lignes.some((l) => l.famille === 'depense' && l.nb === 2));
  } },
  { nom: 'recalcul : il manque 11,99 € → le prélèvement Spotify non noté arrive en premier ; un kebab oublié est proposé', fn: () => {
    const e = etat();
    const app = detailCompte(e, e.comptes[0], '2026-11-08').finCentimes;
    const r = recalculComplet(e, '2026-11-08', { courant: app - 1199 });
    const l = r.lignes.find((x) => x.id === 'courant');
    egal(l.ecartCentimes, -1199);
    egal(l.pistes[0].titre, 'Prélèvement Spotify');
    egal(l.pistes[0].force, 'forte');
    const r2 = recalculComplet(e, '2026-11-08', { courant: app - 1350 });
    vrai(r2.lignes[0].pistes.some((p) => p.titre === 'Une dépense chez Kebab' && p.force === 'forte'), 'dépense habituelle');
  } },
  { nom: 'recalcul : plus d’argent à la banque → paiement récent pas encore débité ; manque d’un côté et surplus de l’autre → virement', fn: () => {
    const e = etat();
    const app = detailCompte(e, e.comptes[0], '2026-11-08').finCentimes;
    const r = recalculComplet(e, '2026-11-08', { courant: app + 2500 });
    egal(r.lignes[0].pistes[0].titre, 'Supermarché pas encore débité');
    const r2 = recalculComplet(e, '2026-11-08', { courant: app - 5000, neo: 5000 });
    egal(r2.croisees.length, 1);
    egal(r2.croisees[0].action.type, 'interne');
    const r3 = recalculComplet(e, '2026-11-08', { courant: app - 4000, pret: 6000 });
    egal(r3.croisees[0].action.type, 'virementEpargne', 'surplus sur l’épargne : virement pas enregistré');
    egal(r3.lignes.find((x) => x.id === 'pret').ecartCentimes, 4000);
  } },
  { nom: 'recalcul : tout juste → aucun écart, aucune piste', fn: () => {
    const e = etat();
    const app = detailCompte(e, e.comptes[0], '2026-11-08').finCentimes;
    const r = recalculComplet(e, '2026-11-08', { courant: app, pret: 2000 });
    egal(r.totalEcartCentimes, 0);
    vrai(r.lignes.every((l) => !l.pistes.length));
  } },
];
