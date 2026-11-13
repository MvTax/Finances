# Hypothèses et choix

Ce fichier liste les décisions prises sans pouvoir demander, et les vérifications faites sur des sources externes. Les points qui dépendent de l'utilisateur sont posés **dans l'app** (onboarding, questions pré-remplies), jamais figés dans le code.

## Vérifications externes (novembre 2026)

| Sujet | Constat | Source |
|---|---|---|
| Modèles Gemini | `gemini-2.5-flash` est arrêté (arrêt annoncé le 16/10/2026). Les guides à jour citent `gemini-3.5-flash` (stable depuis mai 2026) puis `gemini-3.8-flash` (septembre 2026) comme Flash les plus récents. | [Gemini API — model lineup](https://claw.aguidetocloud.com/google/gemini-api/models/), [Migration Gemini 3.5 Flash](https://www.digitalapplied.com/blog/gemini-3-5-flash-api-developer-migration-guide), [Calendrier des arrêts](https://www.layer3labs.io/guides/gemini-model-deprecations) |
| Choix du modèle | Défaut `gemini-3.8-flash`, **remplacé automatiquement** par le Flash stable le plus récent renvoyé par `GET /v1beta/models` (filtre `generateContent`, sans `-preview`, `-lite`, `-tts`, `-live`). Si l'API répond « modèle introuvable », l'app recharge la liste et bascule. Champ libre dans Réglages. | — |
| Paramètres Gemini 3.x | `thinking_budget` remplacé par `thinkingLevel` ; on n'envoie ni `temperature` ni `topP` (valeurs par défaut recommandées sur les modèles récents). Sortie structurée : `responseMimeType: application/json` + `responseJsonSchema`, avec repli sur `responseSchema` si l'API refuse. La réponse est toujours validée côté client. | [Migration Gemini 3.5 Flash](https://www.digitalapplied.com/blog/gemini-3-5-flash-api-developer-migration-guide) |
| Audio Gemini | Types acceptés : `audio/wav`, `audio/mp3`, `audio/aiff`, `audio/aac`, `audio/ogg`, `audio/flac`, `audio/mpeg`, `audio/m4a`, `audio/opus`, `audio/webm`… `audio/mp4` n'est pas listé : l'enregistrement iOS (`audio/mp4`) est envoyé en `audio/m4a` (même conteneur), avec repli `audio/aac` puis message d'erreur clair. Requête inline ≤ 20 Mo. | [Audio understanding](https://ai.google.dev/gemini-api/docs/audio) |
| Safari iOS | Pas de notifications locales programmées sans serveur push ; `webkitSpeechRecognition` indisponible en mode écran d'accueil ; `MediaRecorder` produit de l'`audio/mp4` ; la permission micro est redemandée à chaque lancement d'une app web installée ; stockage isolé par app installée. | Comportements connus WebKit, vérifiés dans le cahier des charges |
| Passe Navigo | 90,80 €/mois en 2026 ; l'employeur rembourse 50 %. Utilisé par le coach (« Remplace les VTC par ton pass »). | [Île-de-France Mobilités](https://www.iledefrance-mobilites.fr/actualites/passe-navigo-augmentation-pourquoi) |
| Remboursement anticipé | Crédit à la consommation : pas d'indemnité si le total remboursé par anticipation sur 12 mois ≤ 10 000 €. | Code de la consommation, art. L312-34 |
| Taux des livrets | Livret A 1,7 % (depuis le 01/08/2026), LEP 2,5 % (plafond 10 000 €) : **paramètres modifiables** dans Réglages, jamais des constantes de calcul. | Donnée fournie par l'utilisateur |

## Choix de conception

- **Période budgétaire** : du jour de salaire à la veille du suivant (ex. 05/11 → 04/12), paramétrable. Avec un salaire au 1er, c'est le mois calendaire. Le bilan (Historique) reste en mois calendaires.
- **Date d'une dépense** : la date d'achat réelle lue dans le libellé (« CB … 30/09/26 »), bornée par la date comptable. Le **solde** d'un compte suit la date comptable.
- **Reste à dépenser** = revenus réels du mois − épargne cible (arrondis estimés inclus) − charges fixes (montant réel si déjà prélevées) − dettes datées du mois − dépenses variables. Les transactions rattachées à une charge fixe, une dette ou un prêt ne sont pas recomptées dans les dépenses variables.
- **Revenus non confirmés** : tant que le mois est « attendu », l'app affiche les montants du dernier mois connu, mais la projection de découvert ne compte **pas** l'argent qui n'est pas arrivé. La confirmation crée la ligne de salaire, rapprochée plus tard de la ligne bancaire (pas de doublon).
- **Ajustement de solde** : une ligne unique par compte, datée de la date de référence, exclue des dépenses et des revenus ; elle est recalculée à chaque import (elle disparaît quand les opérations manquantes arrivent).
- **Épargne** : toujours **nette** (versements − reprises). L'arrondi System'Épargne de la banque est compté via la ligne « TOTAL OPTION… » (la sous-ligne d'information n'est jamais comptée). Les arrondis de l'app sont une cagnotte distincte, comptée seulement une fois virée.
- **Règle Revolut 10–18 €** : un virement à un particulier dans la fourchette devient « Livraison de repas — Uber Eats via un tiers » (confiance haute si une recharge du même montant ±2 € le précède de 48 h au plus). Hors fourchette : « à qualifier ». Fourchette et activation réglables.
- **Prime d'activité** : détectée uniquement si le libellé **commence** par « VIREMENT CAF ». Un libellé contenant « CAF » ailleurs (ex. distributeur « …SCAFE ») n'est pas un revenu.
- **Salaire** : libellé contenant « Paie », « SALAIRE », « PAYE » ou virement « VIREMENT X » (sans civilité) ≥ 500 € reçu entre le 1er et le 10 sur au moins deux mois. La référence de période du libellé de paie n'est jamais utilisée pour dater le mois.
- **Virements internes** : appariés par motif de libellé + montant identique + date à ±3 jours, jamais par numéro de carte. Le nom du titulaire est lu dans l'en-tête du relevé (ou saisi) et sert à reconnaître les virements à soi-même ; il n'est stocké que localement.
- **Enveloppes** : une enveloppe peut regrouper plusieurs catégories (ex. « Repas dehors & livraison »).
- **Plan mensuel** (`proposerAllocation`) : tant qu'un crédit instantané a une échéance dans le mois, priorité au Coussin (vie courante ramenée vers son plancher, arrondis en plus) ; ensuite la vie courante cible passe d'abord et l'épargne prend le reste par paliers de 100 €, plafonnée à l'objectif mensuel quand toutes les dettes court terme sont soldées ; jamais de marge négative. Un plan déjà accepté est recalculé (vie courante puis épargne réduites) quand les revenus exacts sont saisis.
- **Code PIN** : verrou d'écran (empreinte PBKDF2-SHA-256, 210 000 itérations, sel aléatoire). **Les données ne sont pas chiffrées** : l'interface le dit.
- **Rappels** : bandeaux à l'ouverture + fichiers .ics (Calendrier). Aucune notification push.
- **Montants** : centimes entiers partout ; conversion texte → centimes par découpage de chaîne ; intérêts d'emprunt arrondis au centime avec l'arrondi bancaire.
- **v100, deux apps dans une page** : sur iOS, chaque icône d'écran d'accueil a son propre stockage ; une deuxième adresse n'aurait pas partagé les données. v100 est donc la même page avec un autre habillage (`data-app="v100"`), choisi par `js/aiguillage.js` avant le premier affichage. Aucune migration : v100 n'ajoute que `profil.partsReste`.
- **Plan du prêt (v100)** : simulation mensuelle, intérêts = capital × taux / 12 arrondis au centime, assurance fixe par mois, différé pris en compte. Un remboursement anticipé réduit le capital le mois même ; par défaut la mensualité est gardée et la durée raccourcit. L'option « garder la durée, payer moins » recalcule une mensualité constante sur les échéances restantes : la banque doit l'accepter. Aucuns frais de remboursement anticipé ne sont comptés (à vérifier sur le contrat). L'épargne étant déclarée sans intérêts, attendre ne rapporte rien : le conseil compare le coût du prêt au risque de manquer de coussin.
- **Projection (v100)** : revenus du mois en cours répétés ; charges fixes et dettes prises à leurs dates ; vie courante au plancher réglé ; taux de non-dépense mesuré sur les jours clos du mois (25 % par défaut sous 5 jours). Sous le plancher, le mois est marqué « survie » et l'épargne s'arrête.
- **Score Budget (v100)** : cinq cadrans de 20 points (budget du jour, épargne, sécurité, dettes, régularité). C'est un tableau de bord, pas une note de solvabilité.

## Statistiques de v100 (1.40)

Code : `js/v100/strategie/stats.js`. Ce qui suit décrit ce que fait le code.

- **La série** : la dépense du quotidien de chaque jour terminé, du plus ancien au plus récent. Les jours à 0 € sont comptés (ils tirent la moyenne vers le bas). La série commence au plus tard 90 jours avant aujourd'hui, et pas avant la première opération connue (pas de zéros avant le début du suivi). Le jour en cours est exclu : la série s'arrête à hier. Arrondis et privations n'y sont pas.
- **Deux fenêtres** : « global » sur toute la série (90 jours au plus), « récent » sur les 28 derniers jours. La moyenne, l'écart-type et la prévision affichées dans les fiches viennent de la fenêtre de 28 jours.
- **Médiane et quartiles** : sur la série triée, par interpolation linéaire entre deux jours voisins, arrondis au centime.
- **Écart-type** : de l'échantillon (division par n − 1), 0 s'il n'y a qu'un jour.
- **Coefficient de variation** : écart-type ÷ moyenne, arrondi à 2 décimales (0 si la moyenne est nulle). Lecture : jusqu'à 0,6 régulier, jusqu'à 1,1 variable, au-delà en dents de scie.
- **Tendance** : régression linéaire (moindres carrés) sur la moyenne glissante de 7 jours des 28 derniers jours. La pente est ramenée à « par semaine ». Sous 5 % de la moyenne récente par semaine (50 centimes au minimum), ou sous 7 jours de données : « stable ». Précision : la moyenne glissante n'est utilisée qu'à partir de 10 jours dans la fenêtre ; en dessous, la régression porte sur les jours bruts.
- **Prévision de fin de période** : reste du mois − jours restants × moyenne récente (28 jours). Le « reste du mois » vient du calcul du budget et contient déjà ce qui est dépensé aujourd'hui ; les jours restants sont ceux après aujourd'hui, jusqu'au jour avant le salaire. C'est équivalent à « dépensé + moyenne × jours restants » comparé au budget.
- **Fourchette à 80 %** : prévision ± 1,2816 × écart-type récent × √(jours restants). Elle suppose des jours indépendants entre eux et une loi normale. C'est une hypothèse simple : dans la vraie vie, un gros jour peut en entraîner un autre, et la loi des dépenses n'est pas symétrique.
- **Probabilité de tenir** : fonction de répartition de la loi normale (approximation d'Abramowitz et Stegun) de prévision ÷ (écart-type × √jours). Sans incertitude (écart-type nul ou aucun jour restant) : 100 % si la prévision est positive ou nulle, sinon 0 %.
- **Peu fiable** : sous 7 jours de données, les chiffres sont affichés mais marqués comme peu fiables.
- **Contexte d'une dépense** : comparée aux autres achats (débits) de la même catégorie sur les 90 derniers jours ; le rang est la part des achats de montant inférieur ou égal.
- **Limite générale** : tout suppose que les prochains jours ressemblent aux derniers.

Deux limites connues :
- Un jour où les remboursements dépassent les achats compte comme un jour sans dépense (0 €) : la série ne descend jamais sous zéro.
- « Sous ta part » compare les dépenses seules des 90 derniers jours à la part du jour d'aujourd'hui, et cette part inclut les arrondis et les privations. Les deux ne sont pas tout à fait de la même nature : le chiffre est un repère, pas une mesure exacte.
