// rules.js — normalisation des marchands et catégorisation par règles.
// Ordre d'application : règles utilisateur → règles importées → règles par défaut → (IA en option).
// Les règles par défaut ne citent que de grandes enseignes nationales ou internationales.

export function normaliserTexte(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function echapperRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function casTitre(s) {
  return s.toLowerCase().replace(/(^|[\s'’\-/(&.])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bMc(d)/i, 'McD');
}

// Marchands connus : motif sur le libellé normalisé → nom affiché.
const MARCHANDS = [
  [/UBER ?\* ?EATS|UBER EATS|UBEREATS/, 'Uber Eats'],
  [/UBER ?\*? ?ONE|UBER ONE/, 'Uber One'],
  [/UBR\* ?PENDING|UBER ?\*? ?TRIP|^UBER$|^UBER BV|UBER \*/, 'Uber (trajets)'],
  [/^BOLT/, 'Bolt'],
  [/HEETCH/, 'Heetch'],
  [/MC ?DONALD|MCDO/, "McDonald's"],
  [/BURGER KING|^BK /, 'Burger King'],
  [/^KFC/, 'KFC'],
  [/O'?TACOS/, "O'Tacos"],
  [/DOMINO'?S/, "Domino's"],
  [/BRIOCHE DOREE/, 'Brioche Dorée'],
  [/^PAUL\b/, 'Paul'],
  [/DEL ARTE/, 'Del Arte'],
  [/STARBUCKS/, 'Starbucks'],
  [/SUBWAY/, 'Subway'],
  [/DELIVEROO/, 'Deliveroo'],
  [/JUST ?EAT/, 'Just Eat'],
  [/SMOVENGO|VELIB/, "Vélib'"],
  [/^LIME\b|LIME\*/, 'Lime'],
  [/^DOTT\b/, 'Dott'],
  [/^VOI\b/, 'Voi'],
  [/IMAGINE ?R|COMUTITRES/, 'Imagine R'],
  [/NAVIGO/, 'Navigo'],
  [/^RATP/, 'RATP'],
  [/SNCF/, 'SNCF'],
  [/FLIXBUS/, 'FlixBus'],
  [/BLABLACAR/, 'BlaBlaCar'],
  [/OMIO/, 'Omio'],
  [/TRANSAVIA/, 'Transavia'],
  [/AIR ?ALGER/, 'Air Algérie'],
  [/AIR FRANCE/, 'Air France'],
  [/EASYJET/, 'easyJet'],
  [/RYANAIR/, 'Ryanair'],
  [/TRIP\.COM/, 'Trip.com'],
  [/BOOKING/, 'Booking.com'],
  [/AIRBNB/, 'Airbnb'],
  [/CARREFOUR ?CITY|CARREFOURCITY/, 'Carrefour City'],
  [/CARREFOUR/, 'Carrefour'],
  [/^LIDL/, 'Lidl'],
  [/^ALDI/, 'Aldi'],
  [/AUCHAN/, 'Auchan'],
  [/LECLERC/, 'E.Leclerc'],
  [/INTERMARCHE/, 'Intermarché'],
  [/MONOPRIX/, 'Monoprix'],
  [/FRANPRIX/, 'Franprix'],
  [/PICARD/, 'Picard'],
  [/^PROXI\b/, 'Proxi'],
  [/^CASINO\b/, 'Casino'],
  [/^ACTION\b/, 'Action'],
  [/^B ?& ?M\b|^BM\b|^B&M/, 'B&M'],
  [/^TEDI\b/, 'Tedi'],
  [/LEROY MERLIN/, 'Leroy Merlin'],
  [/IKEA/, 'Ikea'],
  [/CASTORAMA/, 'Castorama'],
  [/DESCAMPS/, 'Descamps'],
  [/ZARA/, 'Zara'],
  [/PRIMARK/, 'Primark'],
  [/PULL ?(AND|&) ?BEAR/, 'Pull&Bear'],
  [/BERSHKA/, 'Bershka'],
  [/STRADIVARIUS/, 'Stradivarius'],
  [/^HM\b|^H&M|H ?& ?M\b|^HM FR/, 'H&M'],
  [/ZALANDO/, 'Zalando'],
  [/GEOX/, 'Geox'],
  [/KIABI/, 'Kiabi'],
  [/UNIQLO/, 'Uniqlo'],
  [/SHEIN/, 'Shein'],
  [/VINTED/, 'Vinted'],
  [/SEPHORA/, 'Sephora'],
  [/NOCIBE/, 'Nocibé'],
  [/YVES ROCHER/, 'Yves Rocher'],
  [/KIKO/, 'Kiko Milano'],
  [/AROMA-?ZONE/, 'Aroma-Zone'],
  [/MARIONNAUD/, 'Marionnaud'],
  [/HISTOIRE D.?OR/, "Histoire d'Or"],
  [/^C ?(ET|&) ?A\b/, 'C&A'],
  [/^A ?2 ?PAS\b|^A2PAS/, 'A2pas'],
  [/^NORMAL\b/, 'Normal'],
  [/5 ?A ?SEC/, '5àsec'],
  [/AMAZON PRIME|PRIME VIDEO/, 'Amazon Prime'],
  [/AMAZON|AMZN/, 'Amazon'],
  [/ALIEXPRESS/, 'AliExpress'],
  [/TEMU/, 'Temu'],
  [/APPLE\.COM|^APPLE\b|ITUNES/, 'Apple'],
  [/SPOTIFY/, 'Spotify'],
  [/NETFLIX/, 'Netflix'],
  [/DEEZER/, 'Deezer'],
  [/DISNEY ?(PLUS|\+)/, 'Disney+'],
  [/ANTHROPIC|^CLAUDE\b|CLAUDE\.AI/, 'Claude (abonnement IA)'],
  [/OPENAI|CHATGPT/, 'ChatGPT (abonnement IA)'],
  [/GOOGLE ?CLOUD|GOOGLE ?\*?ONE|GOOGLE STORAGE/, 'Google (stockage)'],
  [/OVH/, 'OVHcloud'],
  [/YOUTUBE/, 'YouTube'],
  [/BOUYGUES/, 'Bouygues Telecom'],
  [/LYCA ?MOBILE/, 'Lycamobile'],
  [/FREE ?MOBILE|^FREE\b/, 'Free'],
  [/^ORANGE\b/, 'Orange'],
  [/^SFR\b/, 'SFR'],
  [/^SOSH\b/, 'Sosh'],
  [/ENGIE/, 'Engie'],
  [/^EDF\b/, 'EDF'],
  [/TOTALENERGIES|TOTAL ENERGIES/, 'TotalEnergies'],
  [/BASIC ?FIT/, 'Basic-Fit'],
  [/FITNESS PARK/, 'Fitness Park'],
  [/^ON AIR\b/, 'On Air (salle de sport)'],
  [/DECATHLON/, 'Decathlon'],
  [/DOCTOLIB/, 'Doctolib'],
  [/TELECONSULTATION/, 'Téléconsultation'],
  [/PHARMA|PHCIE|PHARMACIE/, 'Pharmacie'],
  [/^UGC\b/, 'UGC'],
  [/PATHE/, 'Pathé'],
  [/FNAC/, 'Fnac'],
  [/CULTURA/, 'Cultura'],
  [/MICROMANIA/, 'Micromania'],
  [/PLAYSTATION|SONY INTERACTIVE/, 'PlayStation'],
  [/PAYPAL/, 'PayPal'],
  [/TIMBRE FISCAL|ANTS\b/, 'Timbre fiscal'],
  [/FINANCES PUBLIQUES|DGFIP|TRESOR PUBLIC/, 'Finances publiques'],
  [/PHOTOMATON/, 'Photomaton'],
  [/SELECTA/, 'Distributeur automatique'],
  [/NYX\*|NAYAX/, 'Distributeur automatique'],
  [/EASYMEAL/, 'Easymeal (distributeur)'],
  [/XIAOMI/, 'Xiaomi'],
];

/** Noms d'enseignes nationales/internationales et libellés génériques produits par la normalisation. */
export const MARCHANDS_CONNUS = new Set([
  ...MARCHANDS.map(([, nom]) => nom),
  "Retrait d'espèces", "Arrondi System'Épargne", 'CAF', 'Aide au logement (ALS)', 'Crédit instant', 'Prêt personnel', 'Cotisation carte',
  'Assurance moyen de paiement', "Frais d'incident", 'Recharge Revolut', 'Uber Eats via un tiers', "Virement vers l'épargne", "Retrait de l'épargne",
  'Virement Revolut → LCL', 'Virement interne', 'Ajustement de solde', 'Inconnu',
]);

/**
 * Nom de marchand normalisé, lisible, à partir du libellé principal d'une opération.
 * Supprime préfixes (CB, PRLV SEPA, VIR INST…), dates, références et suites de chiffres.
 */
export function normaliserMarchand(libelle) {
  let s = normaliserTexte(libelle);
  s = s.replace(/\s+\d{2}\/\d{2}\/\d{2,4}$/, '');
  if (/^CB RETRAIT DU|^RETRAIT\b|RETRAIT DAB|^CASH\b/.test(s)) return "Retrait d'espèces";
  if (/^TOTAL OPTION SYSTEM'?\s?EPARGNE/.test(s)) return "Arrondi System'Épargne";
  if (/^VIREMENT CAF\b/.test(s)) return 'CAF';
  if (/^VERSEMENT ALS/.test(s)) return 'Aide au logement (ALS)';
  if (/CREDIT INSTANT/.test(s)) return 'Crédit instant';
  if (/PRET PERSONNEL/.test(s)) return 'Prêt personnel';
  if (/COTISATION MENSUELLE CARTE|COTISATION CARTE/.test(s)) return 'Cotisation carte';
  if (/ASSURANCE MOYEN DE PAIEMENT/.test(s)) return 'Assurance moyen de paiement';
  if (/INCIDENTS? FONCTIONNEMENT|COMMISSION.? D.?INTERVENTION/.test(s)) return "Frais d'incident";
  if (/^CB REVOLUT|^REVOLUT\b/.test(s)) return 'Recharge Revolut';
  if (/^RECHARGE SUR APPLE PAY|^RECHARGE\b/.test(s)) return 'Recharge Revolut';
  for (const [re, nom] of MARCHANDS) if (re.test(s.replace(/^(CB|PRLV SEPA|PRLV|PAIEMENT)\s+/, ''))) return nom;
  s = s
    .replace(/^(CB|PRLV SEPA|PRLV|VIR INST|VIR SEPA|VIREMENT|VIR\.PERMANENT|VIR|PAIEMENT A|PAIEMENT|PAYPAL \*|SUMUP \*|SQ \*|MP\*|LW\*|UEP\*|UPG\*|NYX\*)\s*/g, '')
    .replace(/^(SUMUP|SQ|ZETTLE|IZ|PAYPAL) ?\*\s*/, '')
    .replace(/\*+/g, ' ')
    .replace(/\b\d{3,}\b/g, '')
    .replace(/[#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s ? casTitre(s) : 'Inconnu';
}

// ---------------------------------------------------------------------------
// Règles par défaut : motif (regex) sur « LIBELLÉ NORMALISÉ | MARCHAND NORMALISÉ »
// ---------------------------------------------------------------------------
const R = (motif, categorie, priorite = 50) => ({ id: 'defaut:' + motif, motif, type: 'regex', categorie, origine: 'defaut', priorite });

export const REGLES_DEFAUT = [
  R("\\| (UBER EATS|DELIVEROO|JUST EAT)$", 'livraison'),
  R("\\| (UBER \\(TRAJETS\\)|BOLT|HEETCH)$", 'vtc'),
  R("\\| UBER ONE$", 'abonnements'),
  R("\\| (MCDONALD'S|BURGER KING|KFC|O'TACOS|DOMINO'S|SUBWAY|BRIOCHE DOREE|PAUL)$", 'restauration-rapide'),
  R("\\| (DEL ARTE|STARBUCKS|DISTRIBUTEUR AUTOMATIQUE|EASYMEAL \\(DISTRIBUTEUR\\))$", 'restaurants'),
  R("\\| (VELIB'|LIME|DOTT|VOI)$", 'velo'),
  R("\\| (IMAGINE R|NAVIGO|RATP)$", 'transports'),
  R("\\| (SNCF|FLIXBUS|BLABLACAR|OMIO)$", 'train'),
  R("\\| (TRANSAVIA|AIR ALGERIE|AIR FRANCE|EASYJET|RYANAIR|TRIP\\.COM|BOOKING\\.COM|AIRBNB)$", 'voyages'),
  R("\\| (CARREFOUR CITY|CARREFOUR|LIDL|ALDI|AUCHAN|E\\.LECLERC|INTERMARCHE|MONOPRIX|FRANPRIX|PICARD|PROXI|CASINO|A2PAS)$", 'courses'),
  R("\\| (ACTION|B&M|TEDI|LEROY MERLIN|IKEA|CASTORAMA|DESCAMPS|NORMAL|5ASEC)$", 'maison'),
  R("\\| (ZARA|PRIMARK|PULL&BEAR|BERSHKA|STRADIVARIUS|H&M|ZALANDO|GEOX|KIABI|UNIQLO|SHEIN|C&A)$", 'vetements'),
  R("\\| (SEPHORA|NOCIBE|YVES ROCHER|KIKO MILANO|AROMA-ZONE|MARIONNAUD|HISTOIRE D'OR)$", 'beaute'),
  R("\\| (AMAZON|ALIEXPRESS|TEMU|VINTED|PAYPAL)$", 'achats-en-ligne'),
  R("\\| (AMAZON PRIME|APPLE|SPOTIFY|NETFLIX|DEEZER|DISNEY\\+|CLAUDE \\(ABONNEMENT IA\\)|CHATGPT \\(ABONNEMENT IA\\)|GOOGLE \\(STOCKAGE\\)|OVHCLOUD|YOUTUBE)$", 'abonnements'),
  R("\\| (BOUYGUES TELECOM|LYCAMOBILE|FREE|ORANGE|SFR|SOSH)$", 'telephonie'),
  R("\\| (ENGIE|EDF|TOTALENERGIES)$", 'energie'),
  R("\\| (BASIC-FIT|FITNESS PARK|ON AIR \\(SALLE DE SPORT\\)|DECATHLON)$", 'sport'),
  R("\\| (DOCTOLIB|TELECONSULTATION)$", 'sante'),
  R("\\| PHARMACIE$", 'pharmacie'),
  R("\\| (UGC|PATHE|FNAC|CULTURA|MICROMANIA|PLAYSTATION)$", 'loisirs'),
  R("\\| (TIMBRE FISCAL|FINANCES PUBLIQUES)$", 'impots'),
  R("\\| RETRAIT D'ESPECES$", 'especes', 80),
  R("\\| (COTISATION CARTE|ASSURANCE MOYEN DE PAIEMENT|FRAIS D'INCIDENT)$", 'frais-bancaires', 80),
  R("^FRAIS CREDIT INSTANT|^REMBT FRAIS CREDIT INSTANT", 'frais-bancaires', 90),
  R("^DEBLOCAGE CREDIT INSTANT", 'deblocage-credit', 90),
  R("CREDIT INSTANT ECH|^ANNULATION CREDIT INSTANT|PRET PERSONNEL", 'credits', 90),
  R("^VIREMENT CAF\\b", 'prime-activite', 95),
  R("^VERSEMENT ALS", 'entree-exceptionnelle', 95),
  R("COIFF|BARBER|BARBIER", 'coiffeur', 30),
  R("SECOURS (ISLAMIQUE|POPULAIRE|CATHOLIQUE)|CROIX[- ]ROUGE|RESTOS DU COEUR|UNICEF|EMMAUS", 'dons', 40),
  R("BOULANGERIE|FOURNIL", 'restaurants', 20),
  R("PIZZA|TACOS|KEBAB|BURGER|CHICKEN|CHIKEN|POULET", 'restauration-rapide', 20),
  R("RESTAURANT|SUSHI|BRASSERIE|CAFE\\b|BISTRO", 'restaurants', 15),
  R("FLEURS", 'maison', 15),
  R("TABAC", 'autres', 10),
];

function compilerRegle(r) {
  if (r._re) return r._re;
  try {
    r._re = r.type === 'texte' ? new RegExp(echapperRegex(normaliserTexte(r.motif))) : new RegExp(r.motif);
  } catch {
    r._re = /a^/; // motif invalide : ne correspond jamais
  }
  return r._re;
}

/** Clé de correspondance d'une transaction pour les règles. */
export function cleCorrespondance(tx) {
  return `${normaliserTexte(tx.libellePrincipal || tx.libelle || tx.libelleBrut || '')} | ${normaliserTexte(tx.marchand || '')}`;
}

const RANG_ORIGINE = { utilisateur: 0, import: 1, defaut: 2 };

/** Trie les règles : utilisateur → import → défaut, puis priorité décroissante. */
export function trierRegles(regles) {
  return [...regles].sort((a, b) => (RANG_ORIGINE[a.origine] ?? 3) - (RANG_ORIGINE[b.origine] ?? 3) || (b.priorite || 0) - (a.priorite || 0));
}

/** Première règle qui correspond, ou null. `regles` doit être triée (trierRegles). */
export function trouverRegle(tx, reglesTriees) {
  const cle = cleCorrespondance(tx);
  for (const r of reglesTriees) {
    if (r.sens && r.sens !== tx.sens) continue;
    if (compilerRegle(r).test(cle)) return r;
  }
  return null;
}

/** Règle mémorisée après une correction utilisateur (motif = marchand normalisé exact). */
export function regleDepuisCorrection(tx, categorie, id) {
  const marchand = normaliserTexte(tx.marchand || normaliserMarchand(tx.libellePrincipal || tx.libelle));
  return {
    id,
    motif: `\\| ${echapperRegex(marchand)}$`,
    type: 'regex',
    marchandNormalise: tx.marchand,
    categorie,
    sens: tx.sens,
    origine: 'utilisateur',
    priorite: 100,
  };
}

/** Une catégorie « sûre » ne doit pas être écrasée par une règle de faible priorité. */
export function libelleRegle(r) {
  const m = r.motif.match(/^\\\| (.*)\$$/);
  return m ? m[1].replace(/\\/g, '') : r.motif;
}
