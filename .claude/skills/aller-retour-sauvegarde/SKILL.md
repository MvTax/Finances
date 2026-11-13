---
name: aller-retour-sauvegarde
description: Contrôler qu'un export complet restauré dans une app vide redonne exactement les mêmes données (listes, envies, restes, flammes, points, nouveaux compteurs).
---
# Aller-retour de sauvegarde
1. Générer une sauvegarde synthétique : `node tests/outils/generer-sauvegarde.mjs <scratchpad>/s.json` (jamais de vraies données dans le dépôt).
2. Test automatique : `npm test` (cas « aller-retour » de `tests/cas/migrations.mjs`).
3. Dans le navigateur (serveur `python3 -m http.server 8765` lancé, puis `node tools/ecrans.mjs --aller-retour`) : l'outil génère la sauvegarde, la restaure dans une app vide → Réglages → Sauvegarde et export → « Tout exporter » → compare les deux fichiers collection par collection, `profil`, `parametres` et clé par clé de `meta` (hors `exporteLe`, `modifieLe`, `derniereSauvegarde`).
4. Il restaure ensuite le fichier exporté dans une deuxième app vide et compare les chiffres de l'Accueil (reste du jour, épargne, mois, série, envie, solde) : identiques.
5. Toute différence = bogue : nouvelle clé `meta` absente de `META_HISTORIQUE`, migration manquante, champ perdu par `remplacerTout`.
