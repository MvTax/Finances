// categories.js — catégories par défaut (modifiables dans Réglages).
// « nature » indique comment la catégorie entre dans les calculs :
//   depense  : dépense ordinaire (comptée dans le reste à dépenser et le bilan)
//   revenu   : revenu régulier (salaire, prime d'activité, autres entrées saisies)
//   flux     : mouvement neutre (virements internes, épargne, prêts aux proches, crédits débloqués)
//   exceptionnel : entrée visible dans le solde mais jamais dans les revenus (aide au logement)

// Familles : regroupement visuel des catégories, chacune avec sa couleur (définie dans css/variables.css).
export const FAMILLES = [
  { id: 'vivre', nom: 'Vivre', description: 'Courses, logement, énergie, santé', couleur: 'var(--f-vivre)' },
  { id: 'dehors', nom: 'Manger dehors', description: 'Restauration rapide, livraison, restaurants', couleur: 'var(--f-dehors)' },
  { id: 'bouger', nom: 'Se déplacer', description: 'VTC, transports, train, voyages', couleur: 'var(--f-bouger)' },
  { id: 'abonnements', nom: 'Abonnements', description: 'Musique, vidéo, cloud, IA, applis : à surveiller et à limiter', couleur: 'var(--f-abonnements)' },
  { id: 'plaisirs', nom: 'Plaisirs et achats', description: 'Vêtements, soins, loisirs', couleur: 'var(--f-plaisirs)' },
  { id: 'banque', nom: 'Banque et crédits', description: 'Frais, échéances, espèces', couleur: 'var(--f-banque)' },
  { id: 'flux', nom: 'Mouvements', description: 'Virements internes, épargne, prêts', couleur: 'var(--f-flux)' },
  { id: 'entrees', nom: 'Entrées', description: 'Salaire, prime, aides', couleur: 'var(--f-entrees)' },
];
const FAMILLE_PAR_ID = new Map(FAMILLES.map((f) => [f.id, f]));
export function famille(id) { return FAMILLE_PAR_ID.get(id) || FAMILLE_PAR_ID.get('plaisirs'); }
/** Famille d'une catégorie. */
export function familleDe(idCategorie) { return famille(categorie(idCategorie).famille); }

export const CATEGORIES = [
  { id: 'courses', nom: 'Courses', icone: 'panier', famille: 'vivre', couleur: 'var(--f-vivre)', nature: 'depense', vitale: true },
  { id: 'restauration-rapide', nom: 'Restauration rapide', icone: 'burger', famille: 'dehors', couleur: 'var(--f-dehors)', nature: 'depense', vitale: false },
  { id: 'livraison', nom: 'Livraison de repas', icone: 'sac', famille: 'dehors', couleur: 'var(--f-dehors)', nature: 'depense', vitale: false },
  { id: 'restaurants', nom: 'Restaurants & cafés', icone: 'tasse', famille: 'dehors', couleur: 'var(--f-dehors)', nature: 'depense', vitale: false },
  { id: 'vtc', nom: 'VTC', icone: 'voiture', famille: 'bouger', couleur: 'var(--f-bouger)', nature: 'depense', vitale: false },
  { id: 'transports', nom: 'Transports en commun', icone: 'metro', famille: 'bouger', couleur: 'var(--f-bouger)', nature: 'depense', vitale: true },
  { id: 'velo', nom: 'Vélo & trottinette', icone: 'velo', famille: 'bouger', couleur: 'var(--f-bouger)', nature: 'depense', vitale: false },
  { id: 'train', nom: 'Train & car', icone: 'train', famille: 'bouger', couleur: 'var(--f-bouger)', nature: 'depense', vitale: false },
  { id: 'voyages', nom: 'Voyages', icone: 'avion', famille: 'bouger', couleur: 'var(--f-bouger)', nature: 'depense', vitale: false },
  { id: 'logement', nom: 'Logement', icone: 'maison', famille: 'vivre', couleur: 'var(--f-vivre)', nature: 'depense', vitale: true },
  { id: 'energie', nom: 'Énergie', icone: 'eclair', famille: 'vivre', couleur: 'var(--f-vivre)', nature: 'depense', vitale: true },
  { id: 'telephonie', nom: 'Téléphonie & internet', icone: 'telephone', famille: 'vivre', couleur: 'var(--f-vivre)', nature: 'depense', vitale: true },
  { id: 'abonnements', nom: 'Abonnements', icone: 'boucle', famille: 'abonnements', couleur: 'var(--f-abonnements)', nature: 'depense', vitale: false },
  { id: 'sante', nom: 'Santé', icone: 'coeur', famille: 'vivre', couleur: 'var(--f-vivre)', nature: 'depense', vitale: true },
  { id: 'pharmacie', nom: 'Pharmacie', icone: 'croix', famille: 'vivre', couleur: 'var(--f-vivre)', nature: 'depense', vitale: true },
  { id: 'beaute', nom: 'Beauté & soins', icone: 'flacon', famille: 'plaisirs', couleur: 'var(--f-plaisirs)', nature: 'depense', vitale: false },
  { id: 'coiffeur', nom: 'Coiffeur', icone: 'ciseaux', famille: 'plaisirs', couleur: 'var(--f-plaisirs)', nature: 'depense', vitale: false },
  { id: 'vetements', nom: 'Vêtements', icone: 'tshirt', famille: 'plaisirs', couleur: 'var(--f-plaisirs)', nature: 'depense', vitale: false },
  { id: 'achats-en-ligne', nom: 'Achats en ligne', icone: 'colis', famille: 'plaisirs', couleur: 'var(--f-plaisirs)', nature: 'depense', vitale: false },
  { id: 'maison', nom: 'Maison & bricolage', icone: 'outil', famille: 'plaisirs', couleur: 'var(--f-plaisirs)', nature: 'depense', vitale: false },
  { id: 'loisirs', nom: 'Loisirs & sorties', icone: 'manette', famille: 'plaisirs', couleur: 'var(--f-plaisirs)', nature: 'depense', vitale: false },
  { id: 'sport', nom: 'Sport', icone: 'haltere', famille: 'plaisirs', couleur: 'var(--f-plaisirs)', nature: 'depense', vitale: false },
  { id: 'dons', nom: 'Dons', icone: 'main', famille: 'plaisirs', couleur: 'var(--f-plaisirs)', nature: 'depense', vitale: false },
  { id: 'impots', nom: 'Impôts & administration', icone: 'document', famille: 'vivre', couleur: 'var(--f-vivre)', nature: 'depense', vitale: true },
  { id: 'frais-bancaires', nom: 'Frais bancaires', icone: 'banque', famille: 'banque', couleur: 'var(--f-banque)', nature: 'depense', vitale: false },
  { id: 'credits', nom: "Crédits & remboursements d'emprunt", icone: 'cle', famille: 'banque', couleur: 'var(--f-banque)', nature: 'dette', vitale: true },
  { id: 'especes', nom: 'Espèces', icone: 'billet', famille: 'banque', couleur: 'var(--f-banque)', nature: 'depense', vitale: false },
  { id: 'prets-proches', nom: 'Prêts aux proches', icone: 'personnes', famille: 'flux', couleur: 'var(--f-flux)', nature: 'flux', vitale: false },
  { id: 'virements-internes', nom: 'Virements internes', icone: 'fleches', famille: 'flux', couleur: 'var(--f-flux)', nature: 'flux', vitale: false },
  { id: 'epargne', nom: 'Épargne', icone: 'tirelire', famille: 'flux', couleur: 'var(--f-flux)', nature: 'flux', vitale: false },
  { id: 'plaisir', nom: 'Plaisir sans culpabilité', icone: 'etoile', famille: 'plaisirs', couleur: 'var(--f-plaisirs)', nature: 'depense', vitale: false },
  { id: 'autres', nom: 'Autres', icone: 'point', famille: 'plaisirs', couleur: 'var(--f-plaisirs)', nature: 'depense', vitale: false },
  // Entrées
  { id: 'salaire', nom: 'Salaire', icone: 'mallette', famille: 'entrees', couleur: 'var(--f-entrees)', nature: 'revenu', entree: true },
  { id: 'prime-activite', nom: "Prime d'activité", icone: 'pieces', famille: 'entrees', couleur: 'var(--f-entrees)', nature: 'revenu', entree: true },
  { id: 'autres-entrees', nom: 'Autres entrées', icone: 'plus', famille: 'entrees', couleur: 'var(--f-entrees)', nature: 'revenu', entree: true },
  { id: 'entree-exceptionnelle', nom: 'Entrée exceptionnelle (aide au logement)', icone: 'maison', famille: 'entrees', couleur: 'var(--f-entrees)', nature: 'exceptionnel', entree: true },
  { id: 'deblocage-credit', nom: 'Crédit débloqué', icone: 'cle', famille: 'flux', couleur: 'var(--f-flux)', nature: 'flux', entree: true },
  { id: 'ajustement', nom: 'Ajustement de solde', icone: 'balance', famille: 'flux', couleur: 'var(--f-flux)', nature: 'flux' },
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
