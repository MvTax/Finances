// comptes.mjs — les comptes créés d'office disparaissent dès qu'un vrai compte bancaire existe.
import { egal, vrai } from '../outils/assert.mjs';
import { etat, rangerComptes } from '../../js/store.js';

const cpt = (id, nom, type, banque) => ({ id, nom, type, banque, soldeInitialCentimes: 0, dateSoldeInitial: null, soldeReference: null });
const op = (id, compteId, date, montant, sens = 'debit') => ({ id, compteId, date, dateComptable: date, montantCentimes: montant, sens, libelle: 'Test', categorie: 'courses' });

function preparer(comptes, transactions, chargesFixes = []) {
  etat.comptes = comptes; etat.transactions = transactions; etat.chargesFixes = chargesFixes;
}

export default [
  { nom: 'Compte courant et Espèces par défaut retirés quand LCL existe, opérations reportées sur LCL', fn: () => {
    preparer([cpt('courant', 'Compte courant', 'courant', 'autre'), cpt('especes', 'Espèces', 'especes', 'autre'), cpt('lcl', 'LCL', 'courant', 'lcl'), cpt('revolut', 'Revolut', 'neobanque', 'revolut')],
      [op('a', 'lcl', '2026-11-05', 5500), op('b', 'courant', '2026-11-06', 5500), op('c', 'courant', '2026-11-06', 1200), op('d', 'especes', '2026-11-06', 300)],
      [{ id: 'cf1', libelle: 'Internet', compteId: 'courant', actif: true }, { id: 'cf2', libelle: 'Loyer', estLoyer: true, compteId: 'courant', actif: true }, { id: 'cf3', libelle: 'Loyer', estLoyer: true, compteId: 'lcl', actif: true }]);
    const ops = rangerComptes();
    egal(etat.comptes.map((c) => c.id).join(','), 'lcl,revolut');
    vrai(!etat.transactions.some((t) => t.id === 'b'), 'le doublon à 55 € est retiré');
    egal(etat.transactions.filter((t) => t.compteId === 'lcl').length, 3);
    egal(etat.chargesFixes[0].compteId, 'lcl');
    egal(etat.chargesFixes.filter((c) => c.estLoyer).length, 1, 'le loyer du démarrage en double est retiré');
    vrai(ops.some((o) => o.store === 'comptes' && o.supprimer && o.cle === 'courant'));
  } },
  { nom: 'Sans compte bancaire, le compte par défaut reste ; un compte ajouté à la main aussi', fn: () => {
    preparer([cpt('courant', 'Compte courant', 'courant', 'autre')], []);
    egal(rangerComptes().length, 0);
    preparer([cpt('lcl', 'LCL', 'courant', 'lcl'), cpt('cpt-x', 'Compte joint', 'courant', 'autre')], []);
    egal(rangerComptes().length, 0);
    egal(etat.comptes.length, 2);
  } },
];
