# État du projet

- **En ligne (`main`)** : 1.45.0 (solde des comptes en haut à droite, toutes les catégories du mois dans le Résumé), mise en ligne le 2026-11-16
- **Branche de travail** : `v100-simple` (à ramener au niveau de `main` avant la prochaine version) ; la 1.43.0, la 1.44.0 et la 1.45.0 ont été faites sur `claude/apple-pay-icloud-automation-bka5am`

## Dernières livraisons (en ligne jusqu'à la 1.43.0)
- 1.41.0 : dépenses obligatoires reconnues à la saisie (`js/obligatoires.js`) : comptées dans le mois, pas dans la part du jour ; cas « probable » → question oui / non.
- 1.41.1 : calculs de v200 sans écran (`js/v200/calculs/`) : catégories et montants habituels, risque du mois, résumé, préventions.
- 1.41.2 : squelette de v200 (crème, corail, Nunito) : onglets Aujourd'hui | Dépenses | + | Épargne | Résumé, écran Aujourd'hui (soleil-jauge).
- 1.41.3 : saisie et privation sans clavier : tuiles, molettes euros / centimes, « Glisse pour valider », carte « C'est noté ! ».
- 1.41.4 : onglets Dépenses (liste par jour, « du mois », question oui / non) et Épargne (trois pots, « À virer »).
- 1.41.5 : onglet Résumé (météo du mois, mois / année, préventions, « Voir le détail ») ; dessins faits main.
- 1.42.0 : v200 devient l'app par défaut (ancien choix « v100 » réécrit en v200 ; « origine » gardée) ; le Cockpit v100 est retiré (pages, styles, police Saira, onglet Stratégie, moteurs) ; `stats.js` et `explications.js` déplacés dans `js/v200/calculs/` ; Réglages v200 regroupés (Sauvegarde en haut, « Revenir à l'ancienne app », partage du reste du jour) ; pages héritées harmonisées (css/v200.css) ; `tools/ecrans.mjs` en v200 par défaut.
- 1.43.0 : paiements Apple Pay récupérés depuis un fichier iCloud écrit par un Raccourci (classement, doublons, montants à vérifier).
- 1.44.0 (branche, pas en ligne) : pastille « Reste du mois » en couleur sur Aujourd'hui (→ Résumé) ; « À payer ce mois-ci » dans Dépenses avec bouton « Payé » et « Annuler » ; dépenses du mois jamais comptées deux fois ; aide du Raccourci Apple Pay mise à jour (déclencheur « Cartes », `/applepay.txt` dans iCloud Drive › Raccourcis).
- 1.45.0 : la pastille d'Aujourd'hui devient « Sur mes comptes » (solde courant + néobanque, `soldeComptesDepense` dans `js/v200/calculs/jour.js`, couleur du mois, rouge si négatif) ; Résumé › Mois : « Voir toutes (N) » / « Réduire » déplie toutes les catégories (`resumeMois(...).toutes`).
- 1.46.0 (branche, pas en ligne) : Épargne › bouton « Recalculer l’épargne » (refait les restes du jour pas encore virés, puis « Mis à jour : X → Y à virer » ou « Déjà à jour », `phraseRecalcul` dans `js/v200/calculs/pots.js`) et petit bouton « Détail » qui ouvre l’historique de la cagnotte (corrigé : la ligne « Avance d’une envie reprise » la faisait planter). Le Détail montre maintenant le même « À virer » que la page (ligne « Arrondis d’avant le salaire » : arrondis pas encore virés d’avant le salaire, `historiqueCagnotte`).

## Reste à faire
- Retour de l'utilisateur sur l'iPhone (1.42.0 à 1.45.0 : pastille « Sur mes comptes », « Payé », « Voir toutes », nouvelle aide du Raccourci).
- Essayer le Raccourci Apple Pay et le bouton « Récupérer Apple Pay » sur l'iPhone (ouverture du sélecteur de fichiers à confirmer).
- Essayer « Remplacer ? » (montant provisoire) avec un vrai relevé.
