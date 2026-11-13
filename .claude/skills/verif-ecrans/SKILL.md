---
name: verif-ecrans
description: Vérifier les écrans de l'app Budget dans Chromium (Playwright) en largeur iPhone 390×844, avec données synthétiques — console, débordements, textes coupés.
---
# Vérifier les écrans
Playwright (Node) et Chromium sont déjà installés dans l'environnement : `require('playwright')` marche partout. Ne rien ajouter à `package.json`.
1. Serveur : `python3 -m http.server 8765` (en arrière-plan) à la racine du dépôt.
2. Données : sauvegarde synthétique `node tests/outils/generer-sauvegarde.mjs <sortie.json>` (hors dépôt, dans le scratchpad), restaurée dans une app vide.
3. Lancer `node tools/ecrans.mjs [--origine] [--capture <écran>]` : viewport 390×844, `?app=v100`, thème sombre. Pour chaque écran :
   - aucune erreur console ni exception de page ;
   - `document.documentElement.scrollWidth <= innerWidth` (pas de débordement horizontal) ;
   - pas de texte coupé (`scrollWidth > clientWidth` sur un élément texte sans ellipse voulue).
4. Capture d'écran **uniquement** de l'écran qui pose problème (deviceScaleFactor 1), dans le scratchpad.
5. Rendre un résumé court : écran → OK / problème (quoi, où).
