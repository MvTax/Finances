# Budget

Une PWA de budget personnel pour iPhone, en français. Elle montre ce que tu peux encore dépenser aujourd'hui sans passer à découvert ni toucher à ton épargne. Une dépense se saisit en moins de 5 secondes, et le coach propose des actions chiffrées.

Elle est écrite en HTML, CSS et JavaScript (modules ES), sans build ni framework ni CDN. Elle fonctionne hors ligne. Tes données restent sur ton iPhone, dans IndexedDB.

## Mettre l'app en ligne (GitHub Pages)

1. Crée un dépôt **public** sur GitHub et pousse-y le contenu de ce dossier (à la racine du dépôt).
2. Sur GitHub, ouvre **Settings → Pages**. Dans Source, choisis **Deploy from a branch**, puis la branche **main** et le dossier **/ (root)**. Clique sur Save.
3. Au bout d'une minute environ, l'app est disponible sur `https://<ton-pseudo>.github.io/<nom-du-depot>/`.

Tous les chemins sont relatifs : l'app fonctionne sous n'importe quel sous-dossier.

**Ne jamais committer** tes relevés, ton fichier d'import privé (`*-prive.json`) ni tes sauvegardes. Le fichier `.gitignore` les exclut. Avant chaque publication, lance :

```
node tools/verif-confidentialite.mjs --releves /chemin/vers/tes/releves   # dossier HORS du dépôt
node tools/verif-statique.mjs
node --test tests/node.test.mjs
```

## Installer l'app sur l'iPhone

1. Ouvre l'adresse dans **Safari**, pas dans une autre app.
2. Touche **Partager**, puis **Sur l'écran d'accueil**.
3. Ouvre Budget depuis son icône. L'app s'affiche en plein écran et marche hors ligne, avec un stockage persistant.

Quand Budget est ouvert dans Safari sans être installé, il affiche cette aide.

## Première ouverture

L'accueil de démarrage tient en 4 écrans : revenus exacts, logement et charges fixes, objectif d'épargne, confidentialité. Tu peux passer un écran ou le reprendre plus tard.

Pour démarrer avec ton historique, va dans **Réglages → Importer → choisir ton fichier `budget-import-prive.json` → Remplacer**. L'accueil de démarrage est alors pré-rempli : tu n'as plus qu'à confirmer.

### Mettre à jour depuis le fichier privé sans rien perdre

Quand le fichier privé change (nouvelles dettes, nouveau plan, nouveaux relevés), garde-le au même endroit avec le même nom et touche **Réglages → Mettre à jour depuis mon fichier**. L'app compare le fichier à ce qu'elle contient (`js/miseajour.js`) :

- ce qui vient du fichier et que tu n'as pas touché prend la nouvelle version ;
- ce que tu as saisi dans l'app (dépenses, versements, règles…) est toujours gardé ;
- ce que tu as modifié est gardé, champ par champ : seuls les champs que tu n'as pas changés sont mis à jour ;
- ce que tu as supprimé n'est pas recréé ;
- une saisie manuelle qui correspond à une nouvelle opération bancaire est rapprochée, sans doublon.

Un aperçu montre ce qui va changer avant de valider. Réappliquer le même fichier ne change rien.

## Importer des relevés

Va dans **Réglages → Importer**. Formats acceptés :

| Format | Contrôle |
|---|---|
| PDF LCL (relevé mensuel, plusieurs relevés concaténés possibles) | Débits et crédits de chaque relevé = ligne TOTAUX, et solde final = SOLDE EN EUROS, au centime. L'ancien solde est compté dans sa colonne, et un solde final imprimé en colonne débit est négatif. |
| PDF Revolut « Relevé personnalisé » | Solde recalculé à chaque ligne et solde de clôture |
| CSV Revolut (en-têtes FR ou EN), CSV LCL (`;`) | Soldes de ligne contrôlés quand ils existent |
| Autre CSV | Écran de correspondance des colonnes, mémorisé pour les fois suivantes |

Avant de valider, l'app affiche la réconciliation de chaque relevé, puis un écran de revue. Si un relevé présente un écart, l'import te le montre au lieu de valider sans rien dire.

Réimporter un relevé déjà importé n'ajoute rien. Une saisie faite à la main est rapprochée de la ligne bancaire correspondante, sans créer de doublon. La ligne « Ajustement de solde » se recalcule à chaque import.

Le lecteur PDF (`vendor/pdfjs/`) se charge seulement au premier import PDF, puis il est gardé en cache. Le tout premier import PDF doit donc se faire avec une connexion.

## Gemini (facultatif)

1. Crée une clé dans **Google AI Studio → Get API key**.
2. Dans la **Google Cloud Console → API et services → Identifiants**, restreins la clé par **référent HTTP** à `https://<ton-pseudo>.github.io/*`. Limite aussi les quotas de l'API Generative Language.
3. Colle la clé dans **Réglages → Gemini**, puis touche « Charger les modèles » et « Tester la clé ». Par défaut, l'app prend le modèle Flash stable le plus récent.

La clé reste sur ton iPhone. Elle part dans l'en-tête `x-goog-api-key`, jamais dans l'URL, et n'est jamais journalisée. Avant chaque envoi, l'app affiche « Envoi à Gemini : … » avec ce qui part exactement :

| Fonction | Ce qui est envoyé |
|---|---|
| Voix | L'enregistrement (30 s au maximum), la date du jour, la liste des catégories |
| Ticket photo | La photo recompressée (1200 px, sans métadonnées EXIF ni GPS) |
| Coach | Des totaux anonymisés : marchands normalisés, montants, passages, frais. Les particuliers deviennent « Virement à un particulier n°k ». |
| Catégorisation | Les noms de marchands inconnus, avec leur montant moyen et leur nombre de passages |
| Relevé PDF non reconnu | Le PDF entier, **uniquement après ton accord explicite** |

Le **mode 100 % local** se règle dans Réglages → Confidentialité. Dans ce mode, rien ne part : l'app fonctionne avec des règles locales (parseur de montants, catégorisation et coach par règles).

## Sauvegarde

L'export se fait dans **Réglages → Sauvegarde → Exporter** : la feuille de partage d'iOS s'ouvre (Fichiers, iCloud Drive…). Fais-le **chaque semaine**, l'app te le rappelle. iOS peut effacer les données d'un site, et tes données n'existent nulle part ailleurs.

La restauration passe par le même écran d'import. Elle commence par un aperçu, puis tu choisis **Fusionner** (ajoute ce qui manque) ou **Remplacer**. La clé Gemini et le code PIN ne sont jamais exportés.

## Rappels

iOS ne permet pas de programmer une notification locale sans serveur : l'app n'envoie donc **aucune notification**. Les rappels apparaissent sous forme de bandeaux à l'ouverture :

- revenus du mois à confirmer ;
- virement d'épargne (lendemain du salaire) ;
- arrondis à virer (chaque jeudi par défaut) ;
- prélèvements dans les 3 jours ;
- sauvegarde de la semaine.

Le bouton **Calendrier** crée un événement `.ics`, récurrent si besoin.

## Raccourci iOS

L'adresse `…/#ajout-vocal` ouvre directement la saisie vocale. **Limite d'iOS :** un Raccourci « Ouvrir l'URL » ouvre Safari, pas l'app installée, qui a un stockage séparé. Ce raccourci n'est donc utile que si tu utilises Budget dans Safari.

## Mettre à jour l'app

1. Modifie `VERSION` dans `sw.js` **et** `versionApp` dans `js/version.js`, avec la même valeur.
2. Publie.

Au retour sur l'app, un bandeau « Nouvelle version disponible » s'affiche, et le bouton **Mettre à jour** recharge l'app.

## Icônes

Les icônes sont dans `icons/` : `apple-touch-icon-180.png`, `icone-192.png`, `icone-512.png` et `icone-maskable-512.png`. La source est `icone.svg`. Pour les remplacer, modifie le SVG, ouvre `tools/icones.html` dans un navigateur, puis télécharge les PNG générés sous les mêmes noms.

## Pont avec l'app Repas & Courses

Le contrat `budget-repas` v1 est documenté dans [BRIDGE.md](BRIDGE.md). Il permet trois échanges : liste de courses issue de la photo du frigo, achats des tickets, profil nutrition. Ils passent par un lien `#bridge=…`, un fichier `.json` ou le presse-papier. Rien ne s'applique sans aperçu ni confirmation.

## Diagnostic

**Réglages → Diagnostic → Lancer le test complet** teste l'app de bout en bout (plus de 80 points, 5 de plus avec Gemini) avec une barre d'avancement, puis produit un rapport Markdown anonymisé (aucun libellé, aucun prénom, aucune clé) à copier ou partager. Le code est dans `js/diagnostic.js`, le journal des erreurs et des appels Gemini de la session dans `js/journal.js`.

## Tests

```
node --test tests/node.test.mjs      # calculs, parseurs, pipeline, épargne, dettes, migrations, pont…
node tools/verif-statique.mjs         # imports, id, cache du SW, chemins relatifs, URL externes
node tests/outils/generer-fixtures.mjs  # régénère les PDF/CSV SYNTHÉTIQUES
```

`tests/index.html` lance les mêmes tests dans Safari, sur l'iPhone lui-même.

### Tests manuels sur l'iPhone

1. Ouvre l'app dans Safari : l'aide « Partager → Sur l'écran d'accueil » s'affiche. Installe l'app, puis ouvre-la depuis l'icône : elle doit s'afficher en plein écran, sans barre Safari.
2. Mode avion activé, rouvre l'app : elle doit fonctionner entièrement.
3. Accueil de démarrage : le clavier doit afficher une **virgule**. Le champ actif ne doit jamais être caché par le clavier, et la barre d'onglets doit disparaître.
4. Touche **+**, tape « 4,89 » puis « Boulangerie » et touche Ajouter. Vérifie le toast « Annuler » (5 s), l'arrondi « +0,11 € » et la baisse de la jauge du jour.
5. Saisie vocale (avec une clé) : iOS demande le micro, ce qu'il refera à chaque lancement. Dis « deux fois 3,20 café hier » : une carte de confirmation modifiable doit s'afficher. Refuse le micro une fois : un message clair doit apparaître, avec un lien vers la saisie au clavier.
6. Ticket : photographie un ticket, puis vérifie la somme des articles et l'écart signalé.
7. Réglages → Importer ton fichier privé → Remplacer. Vérifie que l'accueil affiche 375,97 € à dépenser et « LCL ne couvre pas le loyer du 08/11 ». Saisis ensuite le salaire exact : l'alerte doit afficher le solde restant après le loyer.
8. Dépenses : fais glisser une ligne vers la gauche (Catégorie, Supprimer). Corrige une catégorie : l'app doit proposer d'appliquer la règle aux opérations similaires.
9. Épargne → Mon plan, Mes dettes (tableau d'amortissement, simulateur), Simulateur Livret A / LEP.
10. Historique → Bilan (graphiques et tableau alternatif), Y remédier (statut fait / pas fait).
11. Réglages → Code PIN : passe l'app en arrière-plan plus d'une minute. L'écran de confidentialité doit masquer l'app, puis le code doit être demandé au retour.
12. Avec VoiceOver activé, ouvre une feuille modale : le focus doit être piégé dedans et la feuille doit se fermer par le bouton. Les montants doivent être lus.
13. Réglages → Sauvegarde → Exporter : la feuille de partage doit s'ouvrir avec le fichier `.json`.
14. Thème sombre (Réglages iOS) : vérifie les contrastes et la couleur de la barre d'état.
