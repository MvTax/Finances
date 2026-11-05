// categories.js — catégories par défaut (modifiables dans Réglages).
// « nature » indique comment la catégorie entre dans les calculs :
//   depense  : dépense ordinaire (comptée dans le reste à dépenser et le bilan)
//   revenu   : revenu régulier (salaire, prime d'activité, autres entrées saisies)
//   flux     : mouvement neutre (virements internes, épargne, prêts aux proches, crédits débloqués)
//   exceptionnel : entrée visible dans le solde mais jamais dans les revenus (aide au logement)

export const CATEGORIES = [
  { id: 'courses', nom: 'Courses', icone: 'panier', couleur: '#3A9D5D', nature: 'depense', vitale: true },
  { id: 'restauration-rapide', nom: 'Restauration rapide', icone: 'burger', couleur: '#E07A2E', nature: 'depense', vitale: false },
  { id: 'livraison', nom: 'Livraison de repas', icone: 'sac', couleur: '#D9534F', nature: 'depense', vitale: false },
  { id: 'restaurants', nom: 'Restaurants & cafés', icone: 'tasse', couleur: '#B5651D', nature: 'depense', vitale: false },
  { id: 'vtc', nom: 'VTC', icone: 'voiture', couleur: '#5B5BD6', nature: 'depense', vitale: false },
  { id: 'transports', nom: 'Transports en commun', icone: 'metro', couleur: '#2F80ED', nature: 'depense', vitale: true },
  { id: 'velo', nom: 'Vélo & trottinette', icone: 'velo', couleur: '#27AE60', nature: 'depense', vitale: false },
  { id: 'train', nom: 'Train & car', icone: 'train', couleur: '#4A6FA5', nature: 'depense', vitale: false },
  { id: 'voyages', nom: 'Voyages', icone: 'avion', couleur: '#0FA3B1', nature: 'depense', vitale: false },
  { id: 'logement', nom: 'Logement', icone: 'maison', couleur: '#6C5B7B', nature: 'depense', vitale: true },
  { id: 'energie', nom: 'Énergie', icone: 'eclair', couleur: '#F2C94C', nature: 'depense', vitale: true },
  { id: 'telephonie', nom: 'Téléphonie & internet', icone: 'telephone', couleur: '#56CCF2', nature: 'depense', vitale: true },
  { id: 'abonnements', nom: 'Abonnements numériques', icone: 'boucle', couleur: '#9B51E0', nature: 'depense', vitale: false },
  { id: 'sante', nom: 'Santé', icone: 'coeur', couleur: '#EB5757', nature: 'depense', vitale: true },
  { id: 'pharmacie', nom: 'Pharmacie', icone: 'croix', couleur: '#219653', nature: 'depense', vitale: true },
  { id: 'beaute', nom: 'Beauté & soins', icone: 'flacon', couleur: '#E84393', nature: 'depense', vitale: false },
  { id: 'coiffeur', nom: 'Coiffeur', icone: 'ciseaux', couleur: '#A55EEA', nature: 'depense', vitale: false },
  { id: 'vetements', nom: 'Vêtements', icone: 'tshirt', couleur: '#FD79A8', nature: 'depense', vitale: false },
  { id: 'achats-en-ligne', nom: 'Achats en ligne', icone: 'colis', couleur: '#FF9F43', nature: 'depense', vitale: false },
  { id: 'maison', nom: 'Maison & bricolage', icone: 'outil', couleur: '#8D6E63', nature: 'depense', vitale: false },
  { id: 'loisirs', nom: 'Loisirs & sorties', icone: 'manette', couleur: '#00B894', nature: 'depense', vitale: false },
  { id: 'sport', nom: 'Sport', icone: 'haltere', couleur: '#0984E3', nature: 'depense', vitale: false },
  { id: 'dons', nom: 'Dons', icone: 'main', couleur: '#E17055', nature: 'depense', vitale: false },
  { id: 'impots', nom: 'Impôts & administration', icone: 'document', couleur: '#636E72', nature: 'depense', vitale: true },
  { id: 'frais-bancaires', nom: 'Frais bancaires', icone: 'banque', couleur: '#C0392B', nature: 'depense', vitale: false },
  { id: 'credits', nom: "Crédits & remboursements d'emprunt", icone: 'cle', couleur: '#8E44AD', nature: 'dette', vitale: true },
  { id: 'especes', nom: 'Espèces', icone: 'billet', couleur: '#7F8C8D', nature: 'depense', vitale: false },
  { id: 'prets-proches', nom: 'Prêts aux proches', icone: 'personnes', couleur: '#16A085', nature: 'flux', vitale: false },
  { id: 'virements-internes', nom: 'Virements internes', icone: 'fleches', couleur: '#95A5A6', nature: 'flux', vitale: false },
  { id: 'epargne', nom: 'Épargne', icone: 'tirelire', couleur: '#2ECC71', nature: 'flux', vitale: false },
  { id: 'plaisir', nom: 'Plaisir sans culpabilité', icone: 'etoile', couleur: '#F39C12', nature: 'depense', vitale: false },
  { id: 'autres', nom: 'Autres', icone: 'point', couleur: '#B2BEC3', nature: 'depense', vitale: false },
  // Entrées
  { id: 'salaire', nom: 'Salaire', icone: 'mallette', couleur: '#27AE60', nature: 'revenu', entree: true },
  { id: 'prime-activite', nom: "Prime d'activité", icone: 'pieces', couleur: '#2D9CDB', nature: 'revenu', entree: true },
  { id: 'autres-entrees', nom: 'Autres entrées', icone: 'plus', couleur: '#6FCF97', nature: 'revenu', entree: true },
  { id: 'entree-exceptionnelle', nom: 'Entrée exceptionnelle (aide au logement)', icone: 'maison', couleur: '#BB6BD9', nature: 'exceptionnel', entree: true },
  { id: 'deblocage-credit', nom: 'Crédit débloqué', icone: 'cle', couleur: '#8E44AD', nature: 'flux', entree: true },
  { id: 'ajustement', nom: 'Ajustement de solde', icone: 'balance', couleur: '#95A5A6', nature: 'flux' },
];

const PAR_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
const NOMS_ORIGINE = new Map(CATEGORIES.map((c) => [c.id, c.nom]));

export function categorie(id) { return PAR_ID.get(id) || PAR_ID.get('autres'); }
export function nomCategorie(id) { return categorie(id).nom; }

/** Noms personnalisés par l'utilisateur (Réglages → Catégories). */
export function definirNomsCategories(noms = {}) {
  for (const c of CATEGORIES) c.nom = (noms[c.id] && String(noms[c.id]).trim()) || NOMS_ORIGINE.get(c.id);
}
export function categoriesDepense() { return CATEGORIES.filter((c) => c.nature === 'depense'); }
export function categoriesEntree() { return CATEGORIES.filter((c) => c.entree && c.id !== 'ajustement'); }
export function estCategorieDepense(id) { return categorie(id).nature === 'depense'; }

/**
 * Nature comptable d'une transaction (utilisée par TOUS les calculs) :
 * 'ajustement' | 'interne' | 'epargne' | 'pret' | 'dette' | 'deblocage' | 'revenu' | 'exceptionnel'
 * | 'remboursement' | 'depense' | 'entree'
 */
export function natureTransaction(tx) {
  if (tx.ajustement) return 'ajustement';
  if (tx.virementInterne?.estInterne) return 'interne';
  if (tx.epargne?.estEpargne) return 'epargne';
  if (tx.pretId || tx.categorie === 'prets-proches') return 'pret';
  if (tx.categorie === 'credits' && tx.sens === 'debit') return 'dette';
  if (tx.categorie === 'deblocage-credit' || (tx.categorie === 'credits' && tx.sens === 'credit')) return 'deblocage';
  if (tx.sens === 'credit') {
    const n = categorie(tx.categorie).nature;
    if (n === 'revenu') return 'revenu';
    if (n === 'exceptionnel') return 'exceptionnel';
    if (tx.remboursementDe || n === 'depense') return 'remboursement';
    return 'entree';
  }
  return 'depense';
}

/** Montant signé pour le solde d'un compte (crédit +, débit −). */
export function montantSigne(tx) { return tx.sens === 'credit' ? tx.montantCentimes : -tx.montantCentimes; }

/** Contribution d'une transaction aux dépenses variables : dépense +, remboursement d'achat −, sinon 0. */
export function contributionDepense(tx) {
  const n = natureTransaction(tx);
  if (n === 'depense') return tx.montantCentimes;
  if (n === 'remboursement') return -tx.montantCentimes;
  return 0;
}
