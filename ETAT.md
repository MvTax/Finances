# État du projet

- **En ligne (`main`)** : 1.40.0 (v100 simplifié)
- **Branche de travail** : `v100-simple` (identique à `main`)

## Dernières fonctionnalités
- 1.39.0 : v100, le Cockpit (deuxième habillage dans la même page, mêmes données).
- 1.39.1 : export complet (JSON avec historique) et tableau CSV.
- 1.40.0 : Accueil v100 court (un chiffre, une phrase) ; fiches « ? » avec schémas et calcul détaillé.
- 1.40.0 : statistiques en coulisses (médiane, écart-type, tendance, prévision à 80 %).
- 1.40.0 : carte de confirmation après une dépense ou une privation ; Stratégie en liste ; Score ; Mes habitudes.
- 1.40.0 : fiches justes au centime, écrans vérifiés en 390 × 844 (`tools/ecrans.mjs`).
- Mise en place : CLAUDE.md, skills du projet, agents (chef de projet).
- 1.41.0 : dépenses obligatoires reconnues à la saisie (`js/obligatoires.js`) : un loyer, une facture ou un abonnement noté à la main compte dans le mois, pas dans la part du jour (rattaché à la charge fixe, ou `horsPartDuJour`) ; cas « probable » prêt pour une question oui/non (`confirmerObligatoire`). Branche `v100-simple`, pas encore en ligne.
- 1.41.1 : calculs de v200 sans écran (`js/v200/calculs/`) : catégories et montants habituels, risque du mois, résumé du mois et de l'année, préventions du jour. Branche `v100-simple`, pas encore en ligne.

## Prochaine étape
Attendre le retour de l'utilisateur sur l'iPhone ; idées possibles dans `IDEES.md` (seulement sur demande).
