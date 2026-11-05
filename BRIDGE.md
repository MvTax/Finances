# Contrat « budget-repas » — version 1

Échanges entre **Budget** et l'app **Repas & Courses** (sport, courses, repas, sommeil, nutrition). Les deux apps sont sur GitHub Pages.

Sur iPhone, chaque app ajoutée à l'écran d'accueil a son **propre stockage**, et un lien ouvert depuis une app installée **ouvre Safari**, pas l'autre app. On n'échange donc jamais de données en arrière-plan : on transmet un message que l'utilisateur ouvre, puis vérifie, puis confirme. Le code se trouve dans `js/bridge.js`.

## Enveloppe

```json
{
  "contrat": "budget-repas",
  "version": 1,
  "type": "liste_courses | achats_ticket | profil_nutrition",
  "emisLe": "2026-11-05T08:00:00.000Z",
  "source": "budget | repas",
  "donnees": { },
  "somme": "9f2c0a1b44e3d7c6"
}
```

`somme` vaut les **16 premiers caractères hexadécimaux** du SHA-256 de `JSON.stringify({ contrat, version, type, emisLe, source, donnees })`, champs dans cet ordre. Un message modifié ou tronqué est refusé.

Tous les montants sont en **centimes entiers** et toutes les dates au format `AAAA-MM-JJ`.

## Types

### `liste_courses` (Budget → Repas)

Produit par la photo du frigo ou des placards, analysée par Gemini.

```json
{
  "joursCouverts": 2,
  "reportCoursesAu": "2026-11-08",
  "economieEstimeeCentimes": 1600,
  "ingredientsDisponibles": [{ "nom": "Œufs", "quantite": 6, "unite": "pièce", "peremptionEstimee": "2026-11-12" }],
  "repasPossibles": [{ "nom": "Omelette", "ingredients": ["Œufs"] }],
  "articlesManquants": [{ "nom": "Pain", "quantite": 1, "unite": "pièce", "rayon": "Boulangerie", "prixEstimeCentimes": 120, "essentiel": true }]
}
```

Message affiché à l'utilisateur : « Tu as de quoi tenir 2 jours de plus. Courses décalées au 08/11 : tu économises 16,00 € cette semaine. »

### `achats_ticket` (Budget → Repas)

Articles des tickets photographiés, avec le drapeau `sucre` qui sert au recalcul nutritionnel.

```json
{ "tickets": [{ "date": "2026-11-03", "marchand": "Lidl", "totalCentimes": 1287,
  "articles": [{ "nom": "Biscuits", "prixCentimes": 149, "quantite": 1, "sucre": true, "categorie": "courses" }] }] }
```

### `profil_nutrition` (Repas → Budget)

```json
{ "interdits": ["sucreries", "sodas"], "objectifs": { "proteinesG": 120 }, "budgetRepasCibleCentimes": 15000 }
```

Budget s'en sert pour l'alerte « Repose-le », à la saisie et sur les tickets. C'est le **seul type que Budget applique** : les deux autres sont destinés à l'app Repas, et Budget les refuse avec un message clair.

## Transports (par ordre de préférence)

1. **Lien avec la charge utile dans le fragment** : `https://…/repas/#bridge=<charge>`. La charge est `z` suivi du JSON compressé en `deflate-raw` (CompressionStream) puis encodé en base64url. Si la compression est indisponible, elle vaut `j` suivi du JSON encodé en base64url. Taille maximale : **32 000 caractères** après `#bridge=`. Au-delà, on passe au transport suivant. Le fragment n'est jamais envoyé au serveur.
2. **Fichier `.json`** via la feuille de partage d'iOS (`navigator.share({ files })`).
3. **Presse-papier** : `#bridge=<charge>`, collé dans l'autre app avec le bouton « Coller depuis l'autre app ».

L'adresse de l'autre app se règle dans Budget → Réglages → Pont. Si elle n'est pas renseignée, Budget utilise le fichier ou le presse-papier.

## Réception

L'app qui reçoit suit toujours les mêmes étapes :

1. Décodage, puis **validation stricte** : contrat, version, type, source, date, champs obligatoires et types de chaque champ, empreinte `somme`.
2. **Aperçu** lisible.
3. **Confirmation** de l'utilisateur. Sans elle, rien n'est appliqué automatiquement.
4. Trace dans le store `bridgeRecus` : type, date d'émission, date de réception, empreinte.

Si la version est inconnue, le message est refusé avec un message explicite. Une évolution du contrat se fait en incrémentant `version`.

## Exemple complet

```js
import { construireEnveloppe, encoder, decoder, valider } from './js/bridge.js';
const env = await construireEnveloppe('profil_nutrition', { interdits: ['sucreries'] }, { source: 'repas' });
const lien = `https://exemple.github.io/budget/#bridge=${await encoder(env)}`;
const recu = await decoder(lien.split('#')[1]);
console.log((await valider(recu)).ok); // true
```
