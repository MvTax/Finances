# État du projet

- **En ligne (`main`)** : 1.46.1 (Épargne : « Recalculer l’épargne », « Détail » rangé comme la banque), mise en ligne le 2026-11-17
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
- 1.46.0 (branche, pas en ligne) : Épargne › bouton « Recalculer l’épargne » (refait les restes du jour pas encore virés, puis « Mis à jour : X → Y à virer » ou « Déjà à jour », `phraseRecalcul` dans `js/v200/calculs/pots.js`) et petit bouton « Détail » qui ouvre l’historique de la cagnotte (corrigé : la ligne « Avance d’une envie reprise » la faisait planter). Le Détail montre le même « À virer » que la page.
- 1.46.1 (branche, pas en ligne) : Détail de l’épargne rangé comme la liste de la banque (app joyeuse) : titre de mois, une ligne par opération avec le jour en gros et LUN/MAR… à gauche, du plus récent au plus ancien. Le salaire et la CAF du début du mois apparaissent en « début du mois » (montant en positif, jamais compté dans « À virer », `creditsDeDepart` dans `js/virements.js`). Les arrondis pas encore virés d’avant le salaire ont de nouveau une ligne chacun, à leur date, sous le salaire. L’app d’origine garde sa liste par jour, sans ces lignes.
- 1.47.0 (branche `claude/blissful-ritchie-2fx0ew`, pas en ligne) : une seule épargne, sur le Livret A LCL. Un seul virement (un montant = `semaineCentimes`, « sur ton Livret A LCL », libellé « Epargne 5/6/7 nov » sans « Pret »/« Securite ») avec « dont X pour le prêt, Y pour la sécurité » (`virementUnique`, `phraseDontVirement` dans `js/virements.js`). Onglet Épargne : « Tout est sur ton Livret A LCL : X pour l’épargne prêt (sur …), Y pour l’épargne sécurité. » (`repartitionEpargnes` dans `js/v200/calculs/pots.js`). Plus de Revolut pour l’épargne : `placerEpargnes` range Sécurité et prêt sur le Livret A LCL ; `unifierEpargneLcl` (une fois, clé meta `epargneUniqueLcl`, dans `META_HISTORIQUE`) remet la Sécurité sur le Livret A LCL, aussi après la restauration d’une ancienne sauvegarde. Partage prêt / sécurité inchangé. Schéma 4 inchangé (pas de nouvelle version de base).

## Reste à faire
- 1.47.0 sur l’iPhone : un seul virement sur le Livret A LCL, phrase « Tout est sur ton Livret A LCL » sous les pots, Sécurité bien passée de Revolut au Livret A LCL (fiche de la poche).
- Retour de l'utilisateur sur l'iPhone (1.42.0 à 1.45.0 : pastille « Sur mes comptes », « Payé », « Voir toutes », nouvelle aide du Raccourci).
- Essayer le Raccourci Apple Pay et le bouton « Récupérer Apple Pay » sur l'iPhone (ouverture du sélecteur de fichiers à confirmer).
- Essayer « Remplacer ? » (montant provisoire) avec un vrai relevé.
