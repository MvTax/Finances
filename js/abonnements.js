// abonnements.js — liste des abonnements (charges fixes et paiements récurrents), coût par mois et par an,
// conseils et alternatives gratuites. Fonctions pures, testables sous Node.

import { normaliserTexte } from './rules.js';
import { ajouterJours, dateDuMois, moisDe, ajouterMois } from './dates.js';

/**
 * Catalogue de services connus (grandes enseignes nationales ou internationales uniquement).
 * essentiel : utile au quotidien (téléphone, transport) — à optimiser plutôt qu'à supprimer.
 */
export const CATALOGUE = [
  { cle: 'ia', motif: /\b(CLAUDE|ANTHROPIC|CHATGPT|OPENAI|MISTRAL|GEMINI ADVANCED|PERPLEXITY|COPILOT PRO)\b/, nom: 'Assistant IA', type: 'IA',
    conseil: 'Les versions gratuites couvrent l’essentiel. Garde la version payante seulement si tu t’en sers presque tous les jours, sinon reprends-la le mois où tu en as besoin.',
    alternatives: ['Claude (version gratuite)', 'ChatGPT (version gratuite)', 'Le Chat de Mistral (gratuit)', 'Gemini (version gratuite)'] },
  { cle: 'musique', motif: /\b(SPOTIFY|DEEZER|APPLE MUSIC|TIDAL|QOBUZ|YOUTUBE MUSIC|AMAZON MUSIC)\b/, nom: 'Musique', type: 'Musique',
    conseil: 'Les offres gratuites avec publicités suffisent pour écouter en aléatoire. Étudiant : l’offre étudiante est à moitié prix.',
    alternatives: ['Spotify gratuit (avec pubs)', 'Deezer gratuit', 'YouTube Music gratuit', 'Radios et podcasts (gratuits)'] },
  { cle: 'video', motif: /\b(NETFLIX|DISNEY|CANAL|PRIME VIDEO|MAX|PARAMOUNT|CRUNCHYROLL|ADN|MOLOTOV|DAZN|BEIN|APPLE TV|YOUTUBE PREMIUM)\b/, nom: 'Vidéo', type: 'Vidéo',
    conseil: 'Garde un seul service à la fois et alterne : abonne-toi le mois où une série sort, résilie après.',
    alternatives: ['Arte.tv (gratuit)', 'france.tv (gratuit)', 'TF1+ et M6+ (gratuits)', 'Pluto TV (gratuit)', 'YouTube (gratuit avec pubs)'] },
  { cle: 'amazon', motif: /\b(AMAZON PRIME|AMZN PRIME|PRIME AMAZON|AMAZON)\b/, nom: 'Amazon Prime', type: 'Livraison et vidéo',
    conseil: 'Prime n’est rentable que si tu commandes souvent. Sans Prime, la livraison est offerte dès 35 € d’achat dans la plupart des cas.',
    alternatives: ['Livraison gratuite dès 35 € (sans Prime)', 'Retrait en point relais', 'Arte.tv, france.tv (vidéo gratuite)'] },
  { cle: 'apple', motif: /\b(APPLE|ITUNES|ICLOUD)\b/, nom: 'Apple (iCloud, apps…)', type: 'Cloud et applis',
    conseil: 'Plusieurs montants Apple = plusieurs abonnements. Vérifie sur l’iPhone : Réglages → ton nom → Abonnements. iCloud+ 50 Go à 0,99 € suffit souvent.',
    alternatives: ['Google Photos (15 Go gratuits)', 'Copier tes photos sur un ordinateur et alléger iCloud', 'Remplacer les applis payantes par leur version gratuite'] },
  { cle: 'sport', motif: /\b(ON AIR|BASIC FIT|BASICFIT|FITNESS PARK|NEONESS|KEEP COOL|L ORANGE BLEUE|ORANGE BLEUE|CLUB MED GYM|GYMLIB)\b/, nom: 'Salle de sport', type: 'Sport',
    conseil: 'Rentable si tu y vas au moins deux fois par semaine. Un prélèvement tous les 28 jours fait 13 paiements par an, pas 12.',
    alternatives: ['Course à pied, street workout (gratuit)', 'Applis gratuites : Nike Training Club', 'Équipements sportifs de ta ville (gratuits ou presque)'] },
  { cle: 'livraison', motif: /\b(UBER ONE|DELIVEROO PLUS|JUST EAT\+)\b/, nom: 'Abonnement livraison', type: 'Livraison',
    conseil: 'Rentable seulement au-delà de 3 commandes par mois. Commander moins est le vrai gain.',
    alternatives: ['Pas d’abonnement : payer les frais à la commande', 'Cuisiner en avance (gamelles)'] },
  { cle: 'bureautique', motif: /\b(MICROSOFT|OFFICE 365|M365|ADOBE|CANVA PRO|DROPBOX|GOOGLE ONE|NOTION)\b/, nom: 'Logiciels et stockage', type: 'Logiciels',
    conseil: 'Les versions gratuites suffisent pour un usage personnel.',
    alternatives: ['LibreOffice, Google Docs (gratuits)', 'Canva gratuit, Photopea', 'Google Drive 15 Go gratuits'] },
  { cle: 'jeux', motif: /\b(PLAYSTATION|PS PLUS|PSN|XBOX|GAME PASS|NINTENDO)\b/, nom: 'Jeux vidéo', type: 'Jeux',
    conseil: 'Abonne-toi seulement le mois où tu joues en ligne ou à un jeu du catalogue.',
    alternatives: ['Jeux offerts chaque semaine sur l’Epic Games Store', 'Jeux free-to-play'] },
  { cle: 'lecture', motif: /\b(AUDIBLE|KINDLE UNLIMITED|KOBO PLUS|YOUBOOX)\b/, nom: 'Lecture et livres audio', type: 'Lecture',
    conseil: 'La médiathèque de ta ville prête livres, livres audio et presse pour presque rien.',
    alternatives: ['Médiathèque municipale', 'Bibliothèque numérique de ta ville'] },
  { cle: 'vpn', motif: /\b(NORDVPN|EXPRESSVPN|SURFSHARK|CYBERGHOST)\b/, nom: 'VPN', type: 'VPN', conseil: 'Rarement utile au quotidien.', alternatives: ['Proton VPN (gratuit)'] },
  { cle: 'rencontre', motif: /\b(TINDER|BUMBLE|HINGE|MEETIC|SNAPCHAT\+?)\b/, nom: 'Applis (options payantes)', type: 'Applis', conseil: 'Les versions gratuites suffisent.', alternatives: ['Version gratuite de l’appli'] },
  { cle: 'telephone', motif: /\b(BOUYGUES|SFR|ORANGE|FREE MOBILE|SOSH|RED BY SFR|B&YOU|BANDYOU|LYCAMOBILE|LEBARA|SYMA|PRIXTEL|YOUPRICE)\b/, nom: 'Forfait téléphone', type: 'Téléphone', essentiel: true,
    conseil: 'Un forfait sans engagement à 5–10 € couvre la plupart des usages. Compare chaque année : les promos changent souvent.',
    alternatives: ['Free 2 € (forfait de base)', 'Forfaits promo RED, B&You, Sosh, Lebara (5–10 €)'] },
  { cle: 'transport', motif: /\b(IMAGINE R|NAVIGO|COMUTITRES)\b/, nom: 'Transport', type: 'Transport', essentiel: true,
    conseil: 'Indispensable si tu te déplaces tous les jours. Vérifie si ton employeur rembourse 50 % du pass (obligatoire pour les salariés).',
    alternatives: ['Remboursement employeur (50 % du pass)', 'Vélo ou marche pour les petits trajets'] },
  { cle: 'assurance-cb', motif: /\b(ASSURANCE MOYEN DE PAIEMENT|ASSURANCE MOYENS DE PAIEMENT|SECURILION|PROTECTION CARTE)\b/, nom: 'Assurance moyens de paiement', type: 'Banque',
    conseil: 'Souvent inutile : la loi limite déjà ta responsabilité à 50 € en cas de fraude avant opposition, et à 0 € après. Résiliable auprès de ta banque.',
    alternatives: ['Protection légale gratuite (opposition rapide)'] },
  { cle: 'carte', motif: /\b(COTISATION CARTE|COTIS CARTE|CARTE BANCAIRE)\b/, nom: 'Cotisation carte', type: 'Banque', essentiel: true,
    conseil: 'Tu as déjà une carte gratuite chez Revolut : la carte de ta banque pourrait passer à une offre moins chère.',
    alternatives: ['Carte gratuite Revolut (déjà chez toi)'] },
];

const CATEGORIES_ABONNEMENT = new Set(['abonnements', 'telephonie', 'sport']);

/** Service du catalogue reconnu dans un libellé. */
export function reconnaitre(texte) {
  const t = ` ${normaliserTexte(texte || '')} `;
  return CATALOGUE.find((c) => c.motif.test(t)) || null;
}

/** Coût mensuel moyen selon la périodicité (28 jours = 13 prélèvements par an). */
export function mensualiser(montantCentimes, { periodiciteJours = null, annuel = false } = {}) {
  if (annuel) return Math.round(montantCentimes / 12);
  if (periodiciteJours) return Math.round((montantCentimes * 365) / periodiciteJours / 12);
  return montantCentimes;
}

/**
 * Abonnements en cours : charges fixes actives (abonnements, téléphone, sport, services connus)
 * et paiements « abonnements » récurrents sans charge fixe (90 derniers jours).
 * @returns { liste, aLimiter, essentiels, totalMensuelCentimes, totalAnnuelCentimes, aLimiterMensuelCentimes }
 */
export function listerAbonnements(etat, auj, { resilies = {} } = {}) {
  const liste = [];
  const vus = new Set();
  for (const c of etat.chargesFixes || []) {
    if (!c.actif || c.estLoyer) continue;
    const service = reconnaitre(`${c.libelle} ${c.motifDetection || ''}`);
    if (!service && !CATEGORIES_ABONNEMENT.has(c.categorie)) continue;
    const cle = `cf:${c.id}`;
    if (resilies[cle]) continue;
    vus.add(service?.cle || cle);
    const mensuel = mensualiser(c.montantCentimes, { periodiciteJours: c.periodiciteJours || null });
    let prochain = null;
    if (c.jourPrelevement) {
      const ce = dateDuMois(moisDe(auj), c.jourPrelevement);
      // Déjà prélevé ce mois-ci (opération rattachée) : le prochain est le mois suivant
      const dejaPaye = (etat.transactions || []).some((t) => t.chargeFixeId === c.id && t.date >= ajouterJours(ce, -5) && t.date <= auj);
      prochain = ce >= auj && !dejaPaye ? ce : dateDuMois(ajouterMois(moisDe(auj), 1), c.jourPrelevement);
    }
    liste.push({ cle, nom: c.libelle, montantCentimes: c.montantCentimes, mensuelCentimes: mensuel, annuelCentimes: c.periodiciteJours ? Math.round((c.montantCentimes * 365) / c.periodiciteJours) : c.montantCentimes * 12,
      frequence: c.periodiciteJours ? `tous les ${c.periodiciteJours} jours` : 'chaque mois', prochain, chargeFixeId: c.id, categorie: c.categorie, service, essentiel: !!service?.essentiel || c.categorie === 'telephonie' });
  }
  // Paiements « abonnements » récurrents sans charge fixe (ex. abonnement annuel)
  const depuis = ajouterJours(auj, -100);
  const groupes = new Map();
  for (const t of etat.transactions || []) {
    if (t.sens !== 'debit' || t.categorie !== 'abonnements' || t.chargeFixeId || t.date < depuis || t.date > auj) continue;
    const service = reconnaitre(`${t.marchand || ''} ${t.libellePrincipal || ''}`);
    const k = service?.cle || normaliserTexte(t.marchand || t.libelle || '');
    if (!groupes.has(k)) groupes.set(k, { service, tx: [] });
    groupes.get(k).tx.push(t);
  }
  for (const [k, g] of groupes) {
    if (vus.has(k) || resilies[`tx:${k}`]) continue;
    const derniere = g.tx.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const annuel = g.tx.length === 1 && derniere.montantCentimes >= 2500; // un seul gros paiement sur 100 jours : abonnement annuel probable
    liste.push({ cle: `tx:${k}`, nom: g.service?.nom === 'Amazon Prime' ? 'Amazon Prime' : (derniere.marchand || derniere.libelle), montantCentimes: derniere.montantCentimes,
      mensuelCentimes: mensualiser(derniere.montantCentimes, { annuel }), annuelCentimes: annuel ? derniere.montantCentimes : derniere.montantCentimes * 12,
      frequence: annuel ? 'chaque année (probable)' : 'chaque mois', prochain: annuel ? ajouterJours(derniere.date, 365) : ajouterJours(derniere.date, 30), chargeFixeId: null, categorie: 'abonnements', service: g.service, essentiel: !!g.service?.essentiel, derniereLe: derniere.date });
  }
  liste.sort((a, b) => b.mensuelCentimes - a.mensuelCentimes);
  const aLimiter = liste.filter((a) => !a.essentiel);
  const essentiels = liste.filter((a) => a.essentiel);
  const somme = (l, k) => l.reduce((s, a) => s + a[k], 0);
  return { liste, aLimiter, essentiels, totalMensuelCentimes: somme(liste, 'mensuelCentimes'), totalAnnuelCentimes: somme(liste, 'annuelCentimes'), aLimiterMensuelCentimes: somme(aLimiter, 'mensuelCentimes'), aLimiterAnnuelCentimes: somme(aLimiter, 'annuelCentimes') };
}
