import { egal, vrai } from '../outils/assert.mjs';
import { normaliserMarchand, trierRegles, trouverRegle, REGLES_DEFAUT, regleDepuisCorrection } from '../../js/rules.js';
import { categoriser } from '../../js/import/pipeline.js';

const cat = (lib, sens = 'debit', regles = []) => { const t = { libellePrincipal: lib, libelleBrut: lib, marchand: normaliserMarchand(lib), sens, montantCentimes: 100 }; categoriser([t], regles); return t; };

export default [
  { nom: 'règles : normalisation des marchands (Uber, Uber Eats, Bolt, McDonald’s, Vélib’)', fn: () => {
    egal(normaliserMarchand('CB UBR* PENDING.UBE 30/09/26'), 'Uber (trajets)');
    egal(normaliserMarchand('CB UBER *TRIP 02/10/26'), 'Uber (trajets)');
    egal(normaliserMarchand('CB UBER * EATS PE 07/10/26'), 'Uber Eats');
    egal(normaliserMarchand('Uber Eats'), 'Uber Eats');
    egal(normaliserMarchand('CB BOLT.EUO26100422 05/10/26'), 'Bolt');
    egal(normaliserMarchand("CB MCDONALD'S 08/10/26"), "McDonald's");
    egal(normaliserMarchand('CB MCDONALDS 04/10/26'), "McDonald's");
    egal(normaliserMarchand('CB Smovengo 02/10/26'), "Vélib'");
    egal(normaliserMarchand('CB MP*CARREFOUR 05/10/26'), 'Carrefour');
    egal(normaliserMarchand('CB RETRAIT DU 05/05'), "Retrait d'espèces");
    egal(normaliserMarchand('CB BOULANGERIE EXEMPLE 12345 03/01/26'), 'Boulangerie Exemple');
  } },
  { nom: 'règles : la prime d’activité exige « VIREMENT CAF » en début de libellé (piège « …SCAFE »)', fn: () => {
    egal(cat('VIREMENT CAF DU TERRITOIRE', 'credit').categorie, 'prime-activite');
    const piege = cat('CB NYX*SCAFE 19/10/26');
    vrai(piege.categorie !== 'prime-activite', 'SCAFE classé en prime');
    egal(piege.categorie, 'restaurants');
    vrai(cat('CB DISTRIB*SCAFE 06/12/25').categorie !== 'prime-activite');
  } },
  { nom: 'règles : catégories par défaut (livraison, VTC, frais, crédits, aide au logement)', fn: () => {
    egal(cat('CB UBER * EATS PE 07/10/26').categorie, 'livraison');
    egal(cat('CB BOLT.EUO26100422 05/10/26').categorie, 'vtc');
    egal(cat('COTISATION MENSUELLE CARTE 0000').categorie, 'frais-bancaires');
    egal(cat('CREDIT INSTANT ECH 261009').categorie, 'credits');
    egal(cat('DEBLOCAGE CREDIT INSTANT', 'credit').categorie, 'deblocage-credit');
    egal(cat('VERSEMENT ALS0101', 'credit').categorie, 'entree-exceptionnelle');
    egal(cat('PRLV SEPA Bouygues Telecom').categorie, 'telephonie');
  } },
  { nom: 'règles : règle utilisateur prioritaire sur les règles par défaut', fn: () => {
    const t = { libellePrincipal: 'CB MCDONALDS 01/01/26', marchand: "McDonald's", sens: 'debit' };
    const r = regleDepuisCorrection(t, 'plaisir', 'r1');
    const triees = trierRegles([r, ...REGLES_DEFAUT]);
    egal(trouverRegle(t, triees).categorie, 'plaisir');
    egal(cat('CB MCDONALDS 01/01/26', 'debit', [r]).categorie, 'plaisir');
  } },
  { nom: 'règles : une règle relue depuis un JSON (ancien cache « _re » vide) fonctionne', fn: () => {
    const r = regleDepuisCorrection({ marchand: 'Boulangerie Test', libellePrincipal: 'CB BOULANGERIE TEST', sens: 'debit' }, 'courses', 'r1');
    trouverRegle({ libellePrincipal: 'CB BOULANGERIE TEST', marchand: 'Boulangerie Test', sens: 'debit' }, [r]);
    const relue = JSON.parse(JSON.stringify({ ...r, _re: {} }));
    const t = trouverRegle({ libellePrincipal: 'CB BOULANGERIE TEST', marchand: 'Boulangerie Test', sens: 'debit' }, [relue]);
    egal(t?.id, 'r1');
    vrai(!('_re' in r), 'la règle ne doit plus porter de cache');
  } },
];
