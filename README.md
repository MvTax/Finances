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

L'accueil de démarrage tient en 4 écrans : revenus exacts, logement et charges fixes, épargne, confidentialité. Tu peux passer un écran ou le reprendre plus tard.

Pour démarrer avec ton historique, va dans **Réglages → Importer → choisir ton fichier `budget-import-prive.json` → Remplacer**. L'accueil de démarrage est alors pré-rempli : tu n'as plus qu'à confirmer.

### Mettre à jour depuis le fichier privé sans rien perdre

Quand le fichier privé change (nouvelles dettes, nouveau plan, nouveaux relevés), garde-le au même endroit avec le même nom et touche **Réglages → Mettre à jour depuis mon fichier**. L'app compare le fichier à ce qu'elle contient (`js/miseajour.js`) :

- ce qui vient du fichier et que tu n'as pas touché prend la nouvelle version ;
- ce que tu as saisi dans l'app (dépenses, versements, règles…) est toujours gardé ;
- ce que tu as modifié est gardé, champ par champ : seuls les champs que tu n'as pas changés sont mis à jour ;
- ce que tu as supprimé n'est pas recréé ;
- une saisie manuelle qui correspond à une nouvelle opération bancaire est rapprochée, sans doublon.

Un aperçu montre ce qui va changer avant de valider. Réappliquer le même fichier ne change rien.

## Le mois va d'un salaire à l'autre

Le mois budgétaire commence le jour où le salaire arrive réellement (opération « Salaire » importée ou revenus confirmés dans l'app) et se termine la veille du salaire suivant. Tant que le salaire attendu n'est pas arrivé, le mois en cours continue (7 jours au plus, puis le nouveau mois démarre le lendemain). L'accueil, les dépenses, le bilan et l'historique de l'épargne suivent ces mois de salaire à salaire.

**Reste du mois → épargne.** Dans les 3 jours avant le salaire, l'accueil affiche « Il te reste X € jusqu'au salaire ». Une fois le salaire arrivé, il propose « Reste de <mois> : X € → épargne » : ce qui n'a pas été dépensé part sur les poches selon leurs parts. Le montant ne dépasse jamais l'argent réellement présent sur les comptes à la fin du mois.

## Mon mois expliqué

Sous le chiffre du jour, une carte donne le verdict du mois (« Tu es dans les clous », « Mois à surveiller », « Mois serré », « Attention au découvert », « Budget du mois dépassé ») et sa raison principale. « Mon mois expliqué » détaille chaque point en trois temps : **constat** (le fait chiffré), **pourquoi** (ce que ça implique), **donc** (la décision concrète). Les points sont calculés sur le téléphone, sans IA (`js/raisonnement.js`) :

- **Habitudes face au budget** : médiane de la dépense du quotidien par jour sur les 3 derniers mois de salaire (un mois exceptionnel ne fausse pas le résultat), comparée au budget du jour ; manque estimé avant le salaire et poste qui pèse le plus.
- **Rythme du mois** : dépensé depuis le salaire comparé au budget, et ce qu'il restera au salaire à ce rythme.
- **Engagements** : part des prélèvements et remboursements dans les revenus (repère : 50 %), et ce qui change le mois suivant (dettes terminées, nouvelles échéances, épargne prévue).
- **Épargne** : pourquoi ce montant ce mois-ci.
- **Compte courant sur 7 jours** : alerte si un prélèvement n'est pas couvert, même quand le budget du mois est positif.
- **Abonnements** : leur coût exprimé en jours de budget.

Le calcul ligne par ligne reste disponible en bas de la feuille.

## Abonnements

L'accueil (Détails → Abonnements) et Réglages → Opérations et catégories mènent à la page **Abonnements** : coût par mois et par an, limite à ne pas dépasser (alerte sur l'accueil), liste « À limiter » et « Essentiels » (téléphone, transport, carte), conseils et alternatives gratuites pour chaque service connu, bouton « Je l'ai résilié » (économies cumulées). Les abonnements et les prélèvements automatiques comptent dans les charges du mois : ils n'entament jamais le budget du jour.

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

## Dépenses depuis une capture d'écran

Bouton + → « Importer une capture d'écran ». Tu peux choisir une ou plusieurs captures : un achat, un reçu, un mail de commande ou la liste des opérations de ta banque.

- La lecture se fait **sur le téléphone** (Tesseract, dans `vendor/tesseract`, téléchargé à la première capture puis gardé hors ligne). Rien n'est envoyé.
- L'app repère les montants en €, les dates (« Aujourd'hui », « Hier », « Mardi 3 novembre », « 05/11 ») et les libellés. Elle ignore les soldes et les plafonds. Sur un reçu, elle garde seulement le total.
- Les dépenses sont **ajoutées directement**. Celles déjà dans l'app (même montant, à 3 jours près) sont ignorées.
- Dans Dépenses, elles restent encadrées sous l'étiquette « Nouvelles dépenses » pendant 24 h, ou jusqu'à « C'est bon », puis elles rejoignent la liste normale. Une lecture incertaine porte « À vérifier », et « Retirer ces dépenses » annule l'import.
- Si rien n'est lu et que Gemini est activé, « Relire avec Gemini » envoie la capture recompressée, après l'avoir indiqué.

## Le mois en cours d'abord, les mois passés pour les statistiques

Le budget, le reste à dépenser et l'épargne se calculent avec **ce mois-ci seulement** (du salaire au salaire suivant) :

1. **Disponible** = revenus du mois − prélèvements (charges fixes, abonnements repérés, y compris ceux à venir) − remboursements du mois (d'après tes dettes).
2. **Quotidien obligatoire** = un montant réglable (375 € par défaut) gardé pour les courses, les transports et la santé.
3. **Épargne** = tout ce qui reste au-delà, moins 10 € de marge, par paliers de 10 €. Pas de montant fixe, et 0 si les obligations prennent tout.
4. **Dépenses** = ce que tu dépenses au fur et à mesure (saisies, captures, relevés). Si tu dépasses, l'épargne baisse d'abord, jusqu'à 0, avant que le budget soit « dépassé ».

Les mois passés (relevés, fiches de paie) ne changent pas ces chiffres. Ils alimentent la page **Statistiques** : moyennes, postes où tu dépenses le plus, ce mois-ci face à ta moyenne, habitudes, et des **conseils** par poste (quoi remplacer par quoi, alternatives gratuites).

## Dépenses à venir

Tuile « À venir » sur l'accueil, ou lien en haut de Dépenses. La page liste tout ce qui va partir d'ici le salaire : prélèvements et abonnements pas encore passés, remboursements de dettes, et les dépenses que tu as prévues toi-même. Tout est déjà réservé dans le calcul.

- **Prévoir une dépense** (anniversaire, billet, réparation…) : nom, montant, date, catégorie. Elle est réservée tout de suite, avant l'épargne, puis avant le budget du jour si l'épargne ne suffit pas.
- Quand tu la paies, l'app la retrouve dans tes opérations (même montant à 10 % près, à 7 jours près, même catégorie ou libellé proche) et ne la compte pas deux fois. Tu peux aussi la marquer « Déjà payée » ou la supprimer.
- Une dépense prévue d'un mois suivant est réservée dans le budget de son mois.

## Je me suis privé

Bouton + → « Je me suis privé → épargne », ou carte « Je me suis privé » dans Épargne. Tu choisis ce à quoi tu as renoncé : un menu au fast-food, une livraison, un resto, un café ou un VTC. L'app propose ton prix habituel (médiane de tes 90 derniers jours), ou un montant libre.

- Le montant sort de ta part du jour, comme la dépense l'aurait fait, et part à l'épargne au lieu d'être dépensé.
- La carte Épargne affiche ce que tu as mis de côté ce mois-ci et ce qu'il reste à virer sur ton livret. « C'est viré » range le montant dans ta poche Coussin.

### Repas à la maison, épargnés automatiquement

Activé par défaut, à partir du jour où l'app est mise à jour (rien de rétroactif). Réglages → Épargne et arrondis → « Repas à la maison → épargne » : interrupteur, et 1, 2 ou 3 repas par jour (2 par défaut).

- Chaque jour terminé sans repas dehors noté (fast-food, livraison, resto, ou « Je me suis privé » déjà saisi), chaque repas manquant met de côté le prix de ton menu habituel.
- Le montant ne dépasse jamais ce qui reste de la part prévue du jour, donc le budget ne peut pas passer en négatif à cause de ça.
- Tu as mangé dehors sans le noter ? Ajoute la dépense (même après coup) : le montant du jour s'ajuste. Une fois le montant viré (« C'est viré »), le jour est figé.
- L'accueil affiche chaque matin ce qui a été mis de côté la veille, avec un bouton « J'ai mangé dehors hier ».

## Mon système d'épargne

En haut de la page Épargne. Deux poches suffisent : **Sécurité** (pour les imprévus, objectif 1 000 €) et **le prêt** (pour le rembourser en avance). Les mensualités du prêt sont prélevées directement sur le compte et ne passent pas par l'épargne.

Trois flux alimentent ces poches :

1. **Épargne du mois** : le maximum possible après les obligations. Elle est répartie selon la « Part pour la sécurité » (0, 10, 25 ou 50 %, 10 % par défaut), et le reste va au prêt, qui passe en premier. Une fois la Sécurité pleine, tout va au prêt. Le reste du mois, au salaire, est réparti de la même façon.
2. **Arrondis** à l'euro, chaque semaine, vers la poche choisie (le prêt par défaut). Une dépense déjà ronde (5,00 €, 12,00 €) met quand même 0,50 € de côté.
3. **Repas à la maison et privations**, chaque jour, vers la même poche.

La carte affiche aussi quand la poche du prêt sera pleine au rythme du plan.

Au premier lancement de la version 1.21, l'app range les poches une seule fois : une poche « Projet » vide (sans argent ni mouvement) est supprimée, la poche du prêt est activée sous le nom « Prêt 8 000 € » (selon le capital du prêt), reliée au prêt, avec 50 % de l'épargne du mois, et les arrondis, repas et privations vont vers elle. Une poche qui contient de l'argent n'est jamais supprimée.

### Paliers de réussite (Sécurité)

La poche Sécurité affiche 5 paliers, chacun avec sa couleur : Premier pas (10 % de l'objectif), Bon départ (25 %), Mi-chemin (50 %), Presque (75 %) et Objectif atteint (100 %). Les montants sont arrondis à 10 €. La barre prend la couleur du dernier palier atteint, et la carte indique le prochain palier et ce qu'il reste à mettre. Un message félicite à chaque palier franchi par un versement.

## Mon épargne et le virement de la semaine

En haut de l'Accueil et de la page Épargne, trois cases :

- **Épargne prêt** : ce qu'il y a dans la poche du prêt, et le pourcentage de l'objectif ;
- **Épargne sécurité** : ce qu'il y a dans la Sécurité, avec la couleur et le nom du palier atteint ;
- **Reste à virer vers l'épargne**, en dessous : le montant du virement de la semaine.

Le virement de la semaine regroupe :

1. la part de la semaine de l'épargne du mois. C'est ce qui reste à mettre ce mois-ci, divisé par le nombre de semaines jusqu'au salaire et arrondi à l'euro. Elle est calculée le lundi : une fois le virement fait, elle tombe à 0 jusqu'au lundi suivant ;
2. les arrondis en attente : **toutes les sorties du compte** sont arrondies à l'euro supérieur (courses, abonnements, loyer, prélèvements, échéances, remboursements à des proches), sauf les virements entre tes comptes et vers l'épargne. Ils sont comptés depuis le début du mois en cours (le salaire), même si le suivi a commencé après. L'arrondi sort du budget comme une dépense : il apparaît dans « Mon mois expliqué » et dans la dépense du jour ;
3. les repas à la maison et les privations pas encore virés.

La case indique **la date du virement** : le jour réglé (jeudi par défaut, Réglages → Arrondis → « Jour du virement »). Si ce jour est passé et que le virement n'est pas fait, elle affiche « À faire aujourd'hui ». Une fois le virement fait, elle annonce celui de la semaine suivante. « Rappel chaque semaine » ajoute un rappel hebdomadaire au calendrier.

Les deux cases d'épargne sont **mises à jour tout de suite** : dès que la cagnotte augmente (arrondi, repas à la maison, privation, part de l'épargne du mois), le montant est partagé entre les deux épargnes et ajouté à leur total, avec « dont X € à virer » et une partie hachurée sur la barre. Depuis la version 1.24, arrondis, repas et privations sont partagés comme l'épargne du mois (50/50) ; on peut encore les envoyer sur une seule poche dans « Mon système d'épargne ». La case « Reste à virer » donne aussi le partage, et le total d'ici le salaire. Si le virement ferait passer le compte courant sous 0 €, elle le signale. « J'ai fait le virement » ouvre le détail : la part de l'épargne du mois est modifiable, et la confirmation enregistre tout en une fois. Le rappel séparé des arrondis sur l'Accueil est remplacé par cette case.

### Où est chaque épargne, et l'historique de la cagnotte

Chaque épargne indique son compte. Au premier lancement de la version 1.26, si tu as un compte LCL et un compte Revolut, la Sécurité est rangée sur **Revolut** et la poche du prêt sur le **Livret A LCL** (une seule fois ; modifiable dans « Modifier cette poche » → Placement). La case « Reste à virer » dit sur quel compte virer chaque part. L'app ne compte jamais d'intérêts : seulement les sommes versées.

Les cartes des poches, sous « Mon système d'épargne », affichent le même montant qu'en haut (déjà viré + part à virer, « dont X € à virer »).

Toucher « Reste à virer vers l'épargne » (ou « Historique », ou « d'où ça vient » sur une poche) ouvre **l'historique de la cagnotte** du mois : chaque ajout avec sa source (arrondi de telle sortie, « 12,07 € arrondi à 13,00 € » ; repas à la maison ; privation ; épargne du mois), sa date, et « à virer » ou « viré le … ». Filtres par source et totaux par source en haut.

### Reste du jour → épargne (5 h du matin)

Ce qui reste de la part du jour part à l'épargne le lendemain à 5 h du matin. Exemple : le 7, il reste 1,23 € de la part du jour ; à 5 h le 8, 1,23 € s'ajoutent à la cagnotte (« Restes du jour » dans l'historique). La journée se termine à 5 h : une dépense notée à 1 h du matin le 8 est datée du 8, mais le 7 n'est clos qu'à 5 h.

- Reste = part du jour − dépenses, arrondis et privations du jour − repas à la maison automatiques (ils passent avant). Jamais négatif.
- Le reste sort du budget : la part des jours suivants ne grossit plus avec ce qui n'a pas été dépensé.
- C'est fait à l'ouverture de l'app, à 5 h si elle est ouverte, et quand elle revient au premier plan (une PWA ne tourne pas en arrière-plan sur iPhone). Un message l'annonce, et l'Accueil affiche « Il te restait X € hier ».
- Tant que le reste n'est pas viré, il est recalculé : une dépense oubliée, ajoutée après coup sur ce jour, le fait baisser.
- Dans l'historique de la cagnotte, chaque jour a sa ligne « Reste du jour », même à 0 € (« rien à ajouter : la part du jour a été utilisée »). La journée en cours a une ligne « à 5 h » avec le montant estimé « si la journée s'arrêtait maintenant » ; cette estimation n'est pas comptée dans le total à virer.
- Réglages → « Repas à la maison → épargne » → « Reste du jour → épargne » pour l'arrêter.

## Épargne sans intérêts

Réglages → Épargne et arrondis → « Épargne sans intérêts (0 %) ». Avec ce réglage, les poches sont sur un compte épargne qui ne rapporte rien. Le simulateur Livret A / LEP et les taux sont masqués, et les textes parlent de « compte épargne », pas de livret. L'app ne compte jamais d'intérêts dans les montants mis de côté : ce sont exactement les sommes versées.

## Mises à jour de l'app

- **Automatiques** : l'app vérifie la version en ligne au lancement, à chaque retour sur l'app et toutes les 30 minutes. La nouvelle version s'installe en arrière-plan puis s'applique toute seule (l'app redémarre). Si une fenêtre de saisie est ouverte, elle attend sa fermeture.
- **« Forcer la mise à jour »** (Réglages) réinstalle immédiatement la version en ligne.
- GitHub Pages garde les fichiers jusqu'à 10 minutes en cache. Pour ne jamais recevoir l'ancienne version, chaque version utilise ses propres adresses (`sw.js?v=…`, `fichier?v=…`), et la vérification lit `sw.js?t=<heure>` sans passer par le cache.
- Les données (IndexedDB) ne sont jamais touchées.
