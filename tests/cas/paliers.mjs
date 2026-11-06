// paliers.mjs — paliers de réussite de la Sécurité, et rangement en deux poches (Sécurité + prêt).
import { egal, vrai } from '../outils/assert.mjs';
import { paliersPoche, palierFranchi } from '../../js/paliers.js';
import { etat, rangerPoches } from '../../js/store.js';

const secu = { id: 's', type: 'coussin', cibleCentimes: 100000 };

export default [
  { nom: 'paliers Sécurité : 100, 250, 500, 750 et 1 000 €, palier courant et prochain', fn: () => {
    const p = paliersPoche(secu, 30000);
    egal(p.liste.map((x) => x.montantCentimes).join(','), '10000,25000,50000,75000,100000');
    egal(p.courant.nom, 'Bon départ'); egal(p.prochain.nom, 'Mi-chemin'); egal(p.resteCentimes, 20000);
    egal(paliersPoche(secu, 0).courant, null);
    egal(paliersPoche(secu, 100000).prochain, null);
    egal(paliersPoche({ type: 'projet', cibleCentimes: 100000 }, 0), null, 'seulement la Sécurité');
  } },
  { nom: 'palier franchi par un versement (le plus haut si plusieurs)', fn: () => {
    egal(palierFranchi(secu, 9000, 12000).nom, 'Premier pas');
    egal(palierFranchi(secu, 9000, 60000).nom, 'Mi-chemin');
    egal(palierFranchi(secu, 12000, 20000), null);
  } },
  { nom: 'deux poches : projet vide supprimé, poche du prêt activée et reliée au prêt, 50/50, efforts vers le prêt', fn: () => {
    etat.meta = {};
    etat.creditsBancaires = [{ id: 'c1', type: 'amortissable', capitalCentimes: 800000, actif: true }];
    etat.profil = { arrondi: { actif: true, pocheId: 'poche-coussin' } };
    etat.poches = [
      { id: 'poche-coussin', nom: 'Sécurité', type: 'coussin', cibleCentimes: 100000, priorite: 1, partRepartition: null, mouvements: [] },
      { id: 'poche-projet', nom: 'Projet', type: 'projet', cibleCentimes: 200000, partRepartition: 50, mouvements: [] },
      { id: 'poche-pret', nom: 'Remboursement anticipé', type: 'remboursementAnticipe', actif: false, partRepartition: 50, mouvements: [] },
    ];
    const ops = rangerPoches();
    vrai(ops.length > 0);
    egal(etat.poches.map((p) => p.id).join(','), 'poche-coussin,poche-pret');
    const pret = etat.poches.find((p) => p.id === 'poche-pret');
    vrai(/^Prêt 8\s?000 €$/u.test(pret.nom), pret.nom); egal(pret.actif, true); egal(pret.creditId, 'c1'); egal(pret.cibleCentimes, 800000); egal(pret.partRepartition, 50);
    egal(etat.poches[0].partRepartition, 50);
    egal(etat.profil.arrondi.pocheId, 'poche-pret');
    egal(rangerPoches().length, 0, 'une seule fois');
  } },
  { nom: 'une poche projet qui contient de l’argent n’est jamais supprimée', fn: () => {
    etat.meta = {};
    etat.creditsBancaires = [{ id: 'c1', type: 'amortissable', capitalCentimes: 800000, actif: true }];
    etat.profil = { arrondi: {} };
    etat.poches = [{ id: 'pj', nom: 'Projet', type: 'projet', soldeInitialCentimes: 5000, mouvements: [] }];
    rangerPoches();
    vrai(etat.poches.some((p) => p.id === 'pj'));
  } },
];
