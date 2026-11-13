---
name: aller-retour-sauvegarde
description: Contrôler qu'un export complet restauré dans une app vide redonne exactement les mêmes données (listes, envies, restes, flammes, points, nouveaux compteurs).
---
# Aller-retour de sauvegarde
1. Générer une sauvegarde synthétique : `node tests/outils/generer-sauvegarde.mjs <scratchpad>/s.json` (jamais de vraies données dans le dépôt).
2. Test automatique : `npm test` (cas « aller-retour » de `tests/cas/migrations.mjs`).
3. Dans le navigateur (`node tools/ecrans.mjs --aller-retour`) : restaurer s.json dans une app vide → « Tout exporter » → comparer les deux fichiers collection par collection et clé par clé de `meta` (hors `exporteLe`, `modifieLe`).
4. Vérifier aussi les compteurs calculés (reste du jour, épargne, flammes, points, statistiques) avant/après : identiques.
5. Toute différence = bogue : nouvelle clé `meta` absente de `META_HISTORIQUE`, migration manquante, champ perdu par `remplacerTout`.
