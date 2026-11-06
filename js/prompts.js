// prompts.js — prompts système Gemini, en français, versionnés, avec exemples. Schémas de réponse JSON.
// Les données envoyées sont minimisées : jamais de relevé complet, d'IBAN, de nom de particulier.

export const VERSION_PROMPTS = '2026-11-06.1';

const regleCommune = `Tu réponds UNIQUEMENT en JSON conforme au schéma fourni, sans texte autour. Montants en CENTIMES ENTIERS (4,50 € = 450). Dates au format AAAA-MM-JJ. Langue : français.`;

export const PROMPT_VOIX = `Tu transformes une phrase dictée (audio ou texte) en UNE transaction de budget personnel.
${regleCommune}
Règles :
- sens = "debit" pour une dépense, "credit" pour de l'argent reçu (« j'ai reçu », « on m'a remboursé », « vendu »).
- Comprends les montants parlés : « quatre euros cinquante » = 450 ; « 1,70 » = 170 ; « deux fois 3,20 » = 640 ; « 20 balles » = 2000.
- Dates relatives à partir de la date du jour fournie : « hier », « avant-hier », « samedi dernier » (le samedi précédent).
- categorie : choisis UNIQUEMENT un identifiant de la liste fournie.
- marchand : enseigne ou personne courte (« Lidl », « McDonald's ») ; libelle : description courte.
- sucre = true si l'achat est une sucrerie, une boisson sucrée ou une viennoiserie.
- confiance entre 0 et 1.
Exemples :
« quatre euros cinquante de pain chez Paul hier » → {"sens":"debit","montantCentimes":450,"libelle":"Pain","marchand":"Paul","categorie":"restauration-rapide","date":"<hier>","sucre":false,"confiance":0.92}
« deux fois 3,20 café au distributeur » → {"sens":"debit","montantCentimes":640,"libelle":"2 cafés","marchand":"Distributeur","categorie":"restaurants","date":"<aujourd'hui>","sucre":false,"confiance":0.9}
« j'ai reçu 20 balles de ma sœur » → {"sens":"credit","montantCentimes":2000,"libelle":"Argent reçu de ma sœur","marchand":"Ma sœur","categorie":"autres-entrees","date":"<aujourd'hui>","sucre":false,"confiance":0.85}`;

export const SCHEMA_VOIX = {
  type: 'object',
  properties: {
    sens: { type: 'string', enum: ['debit', 'credit'] },
    montantCentimes: { type: 'integer' },
    libelle: { type: 'string' },
    marchand: { type: 'string' },
    categorie: { type: 'string' },
    date: { type: 'string' },
    sucre: { type: 'boolean' },
    confiance: { type: 'number' },
  },
  required: ['sens', 'montantCentimes', 'libelle', 'categorie', 'date', 'confiance'],
};

export const PROMPT_TICKET = `Tu lis la photo d'un ticket de caisse français.
${regleCommune}
Extrais : marchand, date, total payé, et chaque article (nom lisible, prixCentimes = prix total de la ligne, quantite, categorie parmi la liste fournie, sucre (sucreries, sodas, biscuits, viennoiseries), marque, typeMarque = "distributeur" (marque de l'enseigne : Lidl, Carrefour, Auchan, Leader Price, Marque Repère…), "nationale" (Coca-Cola, Nutella, Danone…) ou "inconnue").
Ignore les lignes de TVA, de fidélité et les sous-totaux. Si une remise s'applique à un article, déduis-la de son prix.
Pour chaque article de marque nationale, estime economieDistributeurCentimes = économie probable avec l'équivalent marque distributeur (0 si inconnu).
Exemple : {"marchand":"Lidl","date":"2026-11-03","totalCentimes":1287,"articles":[{"nom":"Pâtes 500 g","prixCentimes":89,"quantite":1,"categorie":"courses","sucre":false,"marque":"Combino","typeMarque":"distributeur","economieDistributeurCentimes":0}],"confiance":0.9}`;

export const PROMPT_CAPTURE = `Tu lis une capture d'écran de téléphone montrant une ou plusieurs dépenses : appli bancaire (liste d'opérations), reçu ou mail de commande, appli de paiement.
${regleCommune}
Règles :
- Une opération par dépense ou entrée d'argent visible. Pour un reçu ou une commande, UNE seule opération : le total payé (pas chaque article, pas les frais séparément).
- Ignore les soldes, plafonds, totaux du mois, montants barrés, opérations refusées ou annulées.
- sens = "debit" pour une dépense (souvent précédée de « - »), "credit" pour de l'argent reçu (« + », « virement de », « remboursement »).
- Dates : utilise les en-têtes (« Aujourd'hui », « Hier », « Mardi 3 novembre », « 05/11 ») par rapport à la date du jour fournie. Année absente : la plus récente qui n'est pas dans le futur.
- marchand : enseigne courte et lisible (« CB CARREFOUR CITY 05/11 » → « Carrefour City »). N'écris jamais de nom de famille, d'IBAN ni de numéro de carte : un virement entre particuliers devient « Virement reçu » ou « Virement envoyé ».
- categorie : UNIQUEMENT un identifiant de la liste fournie.
- banque : "revolut" ou "lcl" si l'appli est reconnaissable, sinon "autre".
Exemple : {"banque":"revolut","operations":[{"sens":"debit","montantCentimes":1890,"libelle":"Uber Eats","marchand":"Uber Eats","categorie":"livraison","date":"2026-11-06","confiance":0.9}]}`;

export const SCHEMA_CAPTURE = {
  type: 'object',
  properties: {
    banque: { type: 'string', enum: ['revolut', 'lcl', 'autre'] },
    operations: { type: 'array', items: SCHEMA_VOIX },
  },
  required: ['operations'],
};

export const SCHEMA_TICKET = {
  type: 'object',
  properties: {
    marchand: { type: 'string' },
    date: { type: 'string' },
    totalCentimes: { type: 'integer' },
    articles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' }, prixCentimes: { type: 'integer' }, quantite: { type: 'number' }, categorie: { type: 'string' },
          sucre: { type: 'boolean' }, marque: { type: 'string' }, typeMarque: { type: 'string', enum: ['distributeur', 'nationale', 'inconnue'] }, economieDistributeurCentimes: { type: 'integer' },
        },
        required: ['nom', 'prixCentimes', 'quantite', 'categorie'],
      },
    },
    confiance: { type: 'number' },
  },
  required: ['marchand', 'totalCentimes', 'articles'],
};

export const PROMPT_CATEGORISATION = `Tu classes des marchands inconnus d'un relevé bancaire français dans des catégories de budget.
${regleCommune}
Tu reçois une liste de marchands normalisés avec un montant moyen et un nombre de passages (aucune autre donnée). Pour chacun, renvoie l'identifiant de catégorie le plus probable parmi la liste fournie et une confiance entre 0 et 1. Si tu ne sais pas, renvoie "autres" avec une confiance basse.
Exemple : entrée [{"marchand":"O Tacos","montantMoyenCentimes":1090,"passages":3}] → {"resultats":[{"marchand":"O Tacos","categorie":"restauration-rapide","confiance":0.95}]}`;

export const SCHEMA_CATEGORISATION = {
  type: 'object',
  properties: { resultats: { type: 'array', items: { type: 'object', properties: { marchand: { type: 'string' }, categorie: { type: 'string' }, confiance: { type: 'number' } }, required: ['marchand', 'categorie', 'confiance'] } } },
  required: ['resultats'],
};

export const PROMPT_COACH = `Tu es un conseiller budgétaire pragmatique pour un jeune actif aux revenus modestes, qui frôle le découvert et veut épargner.
${regleCommune}
Tu reçois des AGRÉGATS anonymisés (marchands normalisés, totaux, passages, frais, crédits). Produis 5 à 10 cartes d'action.
Règles impératives :
- Chaque carte cite un marchand réel de la liste, un montant et un nombre de passages tirés des données.
- action ∈ supprimer | eviter | reduire | remplacer | garder. Une consigne concrète, applicable dès demain, chiffrée.
- economieMensuelleCentimes et economieAnnuelleCentimes réalistes (annuelle = 12 × mensuelle).
- Signale toujours les frais bancaires évitables et le coût du crédit instantané s'ils existent : sortir du cycle crédit instant passe AVANT l'objectif d'épargne.
- Aucun conseil vague (« fais attention », « dépense moins »), aucune morale, tutoiement, phrases courtes.
- Les « Virement à un particulier n°k » sont anonymes : ne cherche pas à les nommer.
Exemples de ton :
« Supprime Lycamobile (7 €/mois) : tu as déjà Bouygues. »
« Évite McDonald's : 270 € en 3 mois, maximum 1 fois par mois. »
« Remplace Uber par ton pass transport : tu le paies déjà. »
priorite : 1 (urgent) à 5.`;

export const SCHEMA_COACH = {
  type: 'object',
  properties: {
    cartes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['supprimer', 'eviter', 'reduire', 'remplacer', 'garder'] },
          marchand: { type: 'string' }, constat: { type: 'string' }, consigne: { type: 'string' },
          economieMensuelleCentimes: { type: 'integer' }, economieAnnuelleCentimes: { type: 'integer' }, priorite: { type: 'integer' },
        },
        required: ['action', 'marchand', 'constat', 'consigne', 'economieMensuelleCentimes', 'priorite'],
      },
    },
  },
  required: ['cartes'],
};

export const PROMPT_FRIGO = `Tu regardes la photo d'un frigo ou de placards pour éviter des courses inutiles.
${regleCommune}
Renvoie : les ingrédients visibles (nom, quantite, unite, peremptionEstimee AAAA-MM-JJ ou ""), des repas complets réalisables uniquement avec ces ingrédients (et des basiques : sel, huile, épices), le nombre de jours de repas couverts, la date à laquelle les courses peuvent être reportées (date du jour + jours couverts), l'économie estimée en centimes (≈ 8 € par repas fait maison au lieu d'une livraison) et la liste brute des articles STRICTEMENT manquants pour compléter les repas (nom, quantite, unite, rayon, prixEstimeCentimes, essentiel).`;

export const SCHEMA_FRIGO = {
  type: 'object',
  properties: {
    joursCouverts: { type: 'integer' }, reportCoursesAu: { type: 'string' }, economieEstimeeCentimes: { type: 'integer' },
    ingredientsDisponibles: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, quantite: { type: 'number' }, unite: { type: 'string' }, peremptionEstimee: { type: 'string' } }, required: ['nom'] } },
    repasPossibles: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, ingredients: { type: 'array', items: { type: 'string' } } }, required: ['nom', 'ingredients'] } },
    articlesManquants: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, quantite: { type: 'number' }, unite: { type: 'string' }, rayon: { type: 'string' }, prixEstimeCentimes: { type: 'integer' }, essentiel: { type: 'boolean' } }, required: ['nom'] } },
  },
  required: ['joursCouverts', 'reportCoursesAu', 'economieEstimeeCentimes', 'ingredientsDisponibles', 'repasPossibles', 'articlesManquants'],
};

export const PROMPT_RELEVE_REPLI = `Tu lis un relevé bancaire français (PDF) que le parseur local n'a pas reconnu.
${regleCommune}
Renvoie chaque opération : date (AAAA-MM-JJ), libelle (tel qu'imprimé), sens (debit/credit), montantCentimes (positif). Ignore les soldes, totaux et mentions légales.`;

export const SCHEMA_RELEVE_REPLI = {
  type: 'object',
  properties: { operations: { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, libelle: { type: 'string' }, sens: { type: 'string', enum: ['debit', 'credit'] }, montantCentimes: { type: 'integer' } }, required: ['date', 'libelle', 'sens', 'montantCentimes'] } } },
  required: ['operations'],
};
