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
- 1.41.2 : squelette de v200, la nouvelle app claire (`?app=v200`, Réglages → « Essayer la nouvelle app » / « Revenir à… ») : `js/habillage.js` (`appCourante`), `css/v200.css` (crème, corail, Nunito), onglets Aujourd'hui | Dépenses | + | Épargne | Résumé (Dépenses, Épargne, Résumé = pages d'origine pour l'instant), écran Aujourd'hui (soleil-jauge, deux gros boutons, une phrase du jour : `js/v200/calculs/jour.js`). Branche `v100-simple`, pas encore en ligne.
- 1.41.3 : v200, saisie et privation sans clavier : tuiles des catégories favorites, molettes euros / centimes (glisser, + / − avec appui long, VoiceOver), « Glisse pour valider » (+ bouton Valider), carte « C'est noté ! » (pièce dans le pot, flamme, Annuler, question « dépense obligatoire ? »). `node tools/ecrans.mjs --v200` vérifie tout le parcours. Branche `v100-simple`, pas encore en ligne.
- 1.41.4 : v200, onglets Dépenses et Épargne : liste par jour (« Aujourd'hui », « Hier », « mardi 10 »), une phrase « Depuis le salaire : X », étiquette « du mois », question oui / non sur la ligne, toucher = feuille de modification, « Voir le mois d'avant », « Ajouter une rentrée d'argent » ; trois pots dessinés (Sécurité, Prêt, Envie) avec leur feuille en 2-3 phrases, bouton « À virer : X », phrase des arrondis (`js/v200/calculs/depenses.js`, `pots.js`). Branche `v100-simple`, pas encore en ligne.
- 1.41.5 : v200, onglet Résumé : météo du mois (soleil, nuage, orage), bascule « Ce mois-ci / Cette année » (où part l'argent en barres, comparaison, série, épargne ; 12 pastilles calme / moyen / chargé), jusqu'à 3 préventions, « Voir le détail » vers les mois passés ; dessins faits main (`js/v200/ui/dessins.js`, animations coupées si « Réduire les animations »). Branche `v100-simple`, pas encore en ligne.

## Prochaine étape
Attendre le retour de l'utilisateur sur l'iPhone ; idées possibles dans `IDEES.md` (seulement sur demande).
