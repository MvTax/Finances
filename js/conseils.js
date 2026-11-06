// conseils.js — conseils par poste de dépense : quoi remplacer par quoi, astuces, alternatives gratuites,
// chiffrés avec les dépenses des mois passés (statistiques). Fonctions pures, testables sous Node.
// Les enseignes citées sont des chaînes nationales ou des services publics connus, jamais des commerces locaux.

import { contributionDepense, categorie } from './categories.js';
import { estDepenseQuotidienne } from './calculs.js';
import { listerAbonnements } from './abonnements.js';
import { diffJours } from './dates.js';

/**
 * Base de conseils. essentiel : poste nécessaire (on l'optimise, on ne le supprime pas) → économie visée plus faible.
 * remplacer : [ce que tu fais, ce qui coûte moins] ; astuces : gestes concrets ; gratuit : alternatives gratuites ou presque.
 */
export const CONSEILS = {
  courses: { essentiel: true,
    remplacer: [['Marques nationales', 'marques distributeur (souvent 20 à 30 % moins cher)'], ['Petites courses en supérette de quartier', 'une grosse course par semaine en supermarché ou en hard-discount']],
    astuces: ['Prévois les repas de la semaine et fais une liste : l’app Repas peut la préparer.', 'Compare le prix au kilo plutôt que le prix affiché.', 'Cuisine en double portion et congèle la moitié.'],
    gratuit: ['Too Good To Go : paniers d’invendus à petit prix (l’appli est gratuite)', 'Cartes de fidélité des enseignes (gratuites)'] },
  'restauration-rapide': {
    remplacer: [['Menu au fast-food', 'sandwich ou gamelle préparés la veille'], ['Boisson achetée', 'gourde remplie à la maison']],
    astuces: ['Fixe un nombre de passages par semaine et tiens-t’y.', 'Prépare 3 ou 4 gamelles le dimanche.', 'Mange avant de sortir : on craque surtout quand on a faim.'],
    gratuit: ['Fontaines à eau publiques', 'Recettes rapides gratuites (Marmiton, Jow, YouTube)'] },
  livraison: {
    remplacer: [['Commande livrée', 'même plat à emporter (pas de frais de livraison ni de service)'], ['Commande du soir', 'plat maison préparé en double la veille']],
    astuces: ['Retire l’appli de livraison de ton écran d’accueil et coupe ses notifications promo.', 'Garde 2 ou 3 plats congelés pour les soirs de flemme.', 'Une commande par semaine au maximum, prévue à l’avance.'],
    gratuit: ['Recettes en 15 minutes (Jow, Marmiton : gratuits)'] },
  restaurants: {
    remplacer: [['Café acheté chaque jour', 'thermos préparé à la maison'], ['Restaurant entre amis', 'repas chez l’un ou l’autre, chacun apporte un plat']],
    astuces: ['Le menu du midi coûte souvent moins cher que le soir.', 'Range tes sorties dans l’enveloppe « Plaisir » avec un plafond.'],
    gratuit: ['Pique-nique dans un parc', 'Soirées à la maison'] },
  vtc: {
    remplacer: [['VTC', 'transports en commun, déjà payés avec ton pass'], ['VTC pour un trajet court', 'vélo ou marche']],
    astuces: ['Garde le VTC pour les trajets de nuit sans transport.', 'Regarde l’heure du dernier métro ou RER avant de sortir.', 'À plusieurs, partage le trajet.'],
    gratuit: ['Noctilien, les bus de nuit d’Île-de-France (compris dans le pass)', 'Marche pour les trajets de moins de 2 km'] },
  transports: { essentiel: true,
    remplacer: [['Tickets à l’unité', 'abonnement mensuel ou annuel si tu te déplaces souvent']],
    astuces: ['Salarié : ton employeur doit rembourser 50 % de ton abonnement de transport.', 'Selon tes revenus, une réduction « solidarité transport » existe en Île-de-France.'],
    gratuit: ['Vélo ou marche pour les petits trajets'] },
  velo: {
    remplacer: [['Vélo en libre-service au-delà du temps compris', 'reposer le vélo et en reprendre un']],
    astuces: ['Les débits en double le même jour sont souvent des dépassements de durée.'],
    gratuit: ['Vélo d’occasion (Leboncoin, ressourceries)'] },
  train: {
    remplacer: [['Billet acheté au dernier moment', 'billet réservé tôt'], ['Train', 'covoiturage (BlaBlaCar) ou car (BlaBlaCar Bus, FlixBus)']],
    astuces: ['Entre 12 et 27 ans, la carte Avantage Jeune de la SNCF réduit les prix.', 'Ouigo et les trains Intercités sont souvent moins chers.'],
    gratuit: [] },
  voyages: {
    remplacer: [['Départ pendant les vacances scolaires', 'départ hors vacances'], ['Hôtel', 'auberge de jeunesse ou location partagée']],
    astuces: ['Mets de côté chaque mois dans une poche « Voyage » plutôt que de payer d’un coup.'],
    gratuit: ['Couchsurfing (hébergement gratuit chez l’habitant)'] },
  telephonie: { essentiel: true,
    remplacer: [['Forfait cher ou avec engagement', 'forfait sans engagement à 5–10 € (RED, B&You, Sosh, Free…)']],
    astuces: ['Compare chaque année : les promos changent souvent.', 'Deux forfaits pour un seul téléphone ? Garde le moins cher.'],
    gratuit: ['Wi-Fi à la maison et au travail pour économiser les données'] },
  abonnements: {
    remplacer: [['Plusieurs services vidéo', 'un seul à la fois, en alternant selon les sorties']],
    astuces: ['Vérifie sur l’iPhone : Réglages → ton nom → Abonnements.', 'Résilie ce que tu n’as pas utilisé depuis un mois.'],
    gratuit: ['Arte.tv, france.tv, TF1+ et M6+ (gratuits)', 'Spotify ou Deezer gratuits (avec pubs)', 'Médiathèque de ta ville'] },
  sante: { essentiel: true,
    remplacer: [['Médecin avec dépassements d’honoraires', 'médecin conventionné secteur 1 ou centre de santé']],
    astuces: ['Selon tes revenus, la Complémentaire santé solidaire est gratuite ou coûte moins de 1 € par jour.'],
    gratuit: ['Centres de santé et PMI de ta ville'] },
  pharmacie: { essentiel: true,
    remplacer: [['Médicament de marque', 'générique (même efficacité, remboursé pareil)']],
    astuces: ['Demande au pharmacien le générique.'],
    gratuit: [] },
  beaute: {
    remplacer: [['Produits de marque', 'marque distributeur'], ['Soins en institut', 'écoles d’esthétique (prix réduits)']],
    astuces: ['Finis un produit avant d’en racheter un.'],
    gratuit: [] },
  coiffeur: {
    remplacer: [['Salon de coiffure', 'école de coiffure (moins cher, parfois gratuit comme modèle)']],
    astuces: ['Espace un peu tes rendez-vous.'],
    gratuit: [] },
  vetements: {
    remplacer: [['Vêtements neufs', 'seconde main (Vinted, friperies, Emmaüs)']],
    astuces: ['Règle des 7 jours : mets l’article dans ta liste d’envies et rachète-le seulement si tu y penses encore.', 'Achète pendant les soldes ce que tu avais déjà prévu.'],
    gratuit: ['Échanges de vêtements entre amis'] },
  'achats-en-ligne': {
    remplacer: [['Neuf', 'reconditionné (Back Market) ou occasion (Leboncoin)']],
    astuces: ['Retire ta carte enregistrée sur les sites : payer devient moins automatique.', 'Désabonne-toi des mails de promo.', 'Règle des 7 jours avant tout achat non prévu.'],
    gratuit: [] },
  maison: {
    remplacer: [['Meubles et objets neufs', 'occasion (Leboncoin, Emmaüs, ressourceries)']],
    astuces: ['Emprunte les outils qui ne servent qu’une fois.'],
    gratuit: ['Dons entre voisins (groupes de quartier, Geev)'] },
  loisirs: {
    remplacer: [['Sorties payantes', 'sorties gratuites (expos, concerts en plein air, parcs)']],
    astuces: ['Range tes sorties dans l’enveloppe « Plaisir » avec un plafond.'],
    gratuit: ['Musées nationaux gratuits pour les moins de 26 ans (résidents de l’UE)', 'Médiathèque : livres, films, jeux', 'Agenda des événements gratuits de ta ville'] },
  sport: {
    remplacer: [['Salle peu utilisée', 'sport en extérieur ou salle à bas prix']],
    astuces: ['Une salle n’est rentable qu’à 2 séances par semaine au moins.', 'Un prélèvement tous les 28 jours fait 13 paiements par an.'],
    gratuit: ['Course à pied, street workout', 'Nike Training Club (appli gratuite)', 'Équipements sportifs de ta ville'] },
  'frais-bancaires': {
    remplacer: [['Passer à découvert', 'virer de Revolut vers LCL avant les prélèvements (l’app prévient 7 jours avant)']],
    astuces: ['Chaque opération à découvert peut coûter une commission d’intervention.', 'Souvent en incident ? Demande l’offre « clientèle fragile » : elle plafonne les frais.', 'L’assurance moyens de paiement est souvent inutile : résiliable.'],
    gratuit: ['Retraits aux distributeurs de ta banque'] },
  especes: {
    remplacer: [['Retraits fréquents', 'un retrait par semaine d’un montant fixe']],
    astuces: ['Note tes dépenses en espèces dans l’app (bouton +).', 'Paie par carte pour garder une trace.'],
    gratuit: [] },
  energie: { essentiel: true,
    remplacer: [['Offre jamais comparée', 'offre comparée sur le comparateur public du médiateur de l’énergie (gratuit)']],
    astuces: ['Baisser le chauffage de 1 °C réduit la facture d’environ 7 %.', 'Selon tes revenus, tu peux recevoir le chèque énergie.'],
    gratuit: [] },
  logement: { essentiel: true,
    remplacer: [],
    astuces: ['Vérifie tes droits à l’aide au logement avec le simulateur de la CAF.'],
    gratuit: ['Simulateur de droits sociaux : mesdroitssociaux.gouv.fr'] },
  impots: { essentiel: true,
    remplacer: [],
    astuces: ['Vérifie ta prime d’activité chaque trimestre avec le simulateur de la CAF.'],
    gratuit: ['Simulateur de droits sociaux : mesdroitssociaux.gouv.fr'] },
  plaisir: {
    remplacer: [],
    astuces: ['C’est ton budget plaisir : garde-le, mais avec un plafond par mois.'],
    gratuit: [] },
  autres: {
    remplacer: [],
    astuces: ['Classe ces dépenses dans une vraie catégorie : tu sauras où elles partent et les conseils seront plus précis.'],
    gratuit: [] },
};

const ECONOMIE_VISEE = { normal: 0.3, essentiel: 0.1 };

/** Nombre de mois (décimal) couverts par une période. */
function nbMois(debut, fin) { return Math.max(1, (diffJours(debut, fin) + 1) / 30.44); }

/**
 * Statistiques et conseils d'un poste sur une période passée.
 * @returns {{ id, nom, essentiel, totalCentimes, moyenneMensuelleCentimes, passages, marchands: [{ nom, centimes, passages }],
 *   economieMensuelleCentimes, economieAnnuelleCentimes, tauxVise, remplacer, astuces, gratuit, abonnements }}
 */
export function conseilsPoste(etat, id, { debut, fin, aujourdhui }) {
  const base = CONSEILS[id] || CONSEILS.autres;
  const parMarchand = new Map();
  let total = 0; let passages = 0;
  for (const t of etat.transactions || []) {
    if (t.categorie !== id || t.date < debut || t.date > fin || t.ajustement) continue;
    const v = contributionDepense(t);
    if (!v) continue;
    total += v; if (t.sens === 'debit') passages++;
    const nom = t.marchand || t.libelle || 'Sans nom';
    const m = parMarchand.get(nom) || { nom, centimes: 0, passages: 0 };
    m.centimes += v; if (t.sens === 'debit') m.passages++;
    parMarchand.set(nom, m);
  }
  const moyenne = Math.round(total / nbMois(debut, fin));
  const taux = base.essentiel ? ECONOMIE_VISEE.essentiel : ECONOMIE_VISEE.normal;
  const economie = Math.round((moyenne * taux) / 100) * 100;
  // Abonnements : conseils et alternatives propres à chaque service repéré
  const abonnements = id === 'abonnements' || id === 'telephonie' || id === 'sport'
    ? listerAbonnements(etat, aujourdhui || fin).liste.filter((a) => a.categorie === id || (id === 'abonnements' && !['telephonie', 'sport'].includes(a.categorie)))
      .map((a) => ({ nom: a.nom, mensuelCentimes: a.mensuelCentimes, conseil: a.service?.conseil || null, alternatives: a.service?.alternatives || [] }))
    : [];
  return {
    id, nom: categorie(id).nom, essentiel: !!base.essentiel,
    totalCentimes: total, moyenneMensuelleCentimes: moyenne, passages,
    marchands: [...parMarchand.values()].sort((a, b) => b.centimes - a.centimes).slice(0, 5),
    economieMensuelleCentimes: economie, economieAnnuelleCentimes: economie * 12, tauxVise: taux,
    remplacer: base.remplacer, astuces: base.astuces, gratuit: base.gratuit, abonnements,
  };
}

/**
 * Postes de dépense des mois passés, du plus gros au plus petit, avec la comparaison du mois en cours.
 * Les prélèvements (abonnements, charges) sont inclus : ce sont aussi des postes à optimiser.
 * @returns [{ id, nom, totalCentimes, moyenneMensuelleCentimes, part, ceMoisCentimes, ecartCentimes, quotidien }]
 */
export function postesDepense(etat, { debut, fin, moisEnCours }) {
  const total = new Map(); const ceMois = new Map();
  // Pour comparer le mois en cours à la moyenne, seules les dépenses du quotidien comptent
  // (un prélèvement tombe à date fixe : le comparer au prorata des jours n'a pas de sens)
  const totalQ = new Map(); const ceMoisQ = new Map();
  const ajoute = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  for (const t of etat.transactions || []) {
    if (t.ajustement) continue;
    const v = contributionDepense(t);
    if (!v) continue;
    const q = estDepenseQuotidienne(t);
    if (t.date >= debut && t.date <= fin) { ajoute(total, t.categorie, v); if (q) ajoute(totalQ, t.categorie, v); }
    if (moisEnCours && t.date >= moisEnCours.debut && t.date <= moisEnCours.fin) { ajoute(ceMois, t.categorie, v); if (q) ajoute(ceMoisQ, t.categorie, v); }
  }
  const mois = nbMois(debut, fin);
  const somme = [...total.values()].reduce((s, v) => s + Math.max(0, v), 0) || 1;
  // Le mois en cours n'est pas fini : on compare au prorata des jours écoulés
  const prorata = moisEnCours ? Math.min(1, (diffJours(moisEnCours.debut, moisEnCours.aujourdhui) + 1) / moisEnCours.nbJours) : 1;
  return [...total.entries()].filter(([, v]) => v > 0).map(([id, v]) => {
    const moyenne = Math.round(v / mois);
    const moyenneQ = Math.round((totalQ.get(id) || 0) / mois);
    const cmQ = ceMoisQ.get(id) || 0;
    const attendu = Math.round(moyenneQ * prorata);
    return { id, nom: categorie(id).nom, totalCentimes: v, moyenneMensuelleCentimes: moyenne, part: v / somme,
      ceMoisCentimes: ceMois.get(id) || 0, ceMoisQuotidienCentimes: cmQ, attenduCeJourCentimes: attendu, ecartCentimes: cmQ - attendu };
  }).sort((a, b) => b.totalCentimes - a.totalCentimes);
}
