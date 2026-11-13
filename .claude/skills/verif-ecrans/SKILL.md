---
name: verif-ecrans
description: Vérifier les écrans de l'app Budget dans Chromium (Playwright) en largeur iPhone 390×844, avec données synthétiques — console, débordements, textes coupés, fiches, carte de confirmation.
---
# Vérifier les écrans
Playwright (Node) et Chromium sont déjà installés dans l'environnement : `require('playwright')` marche partout. Ne rien ajouter à `package.json`.
1. Serveur : `python3 -m http.server 8765` (en arrière-plan) à la racine du dépôt.
2. Lancer `node tools/ecrans.mjs` (v100), puis `node tools/ecrans.mjs --origine` (styles Classique puis Joyeux), puis `node tools/ecrans.mjs --aller-retour`.
   L'outil génère lui-même la sauvegarde synthétique (dans le dossier temporaire du système), la restaure dans une app vide par le vrai flux (Réglages → Importer → Remplacer), fige l'horloge sur la date du générateur, bloque le service worker (code toujours frais).
   Options : `--capture <écran>[,<écran>…]` (ex. `accueil`, `fiche-jour`, `carte-depense`, `habitudes`, `tout`), `--aujourdhui AAAA-MM-JJ`, `--url`.
3. Contrôles, pour chaque écran : erreurs console et exceptions ; débordement horizontal ; texte caché par un cadre (sans ellipse voulue) ou qui déborde ; schéma SVG déformé par le CSS ; bouton sans texte ni `aria-label` ; « ? » sans `aria-label` explicite.
   En plus : feuilles (défilement interne, taille, fermeture par bouton, fond et glissement), carte de confirmation (au-dessus de la barre d'onglets, non couverte, fermée au changement de page et après 9 s, « Annuler » supprime vraiment), lignes de l'Accueil en `<button>`, hauteur de l'Accueil (≤ ~1,5 écran), histogramme de « Mes habitudes ». Origine : la saisie affiche toujours le message habituel.
4. Capture **uniquement** des écrans corrigés ou qui posent problème (`--capture`), puis les regarder.
5. Sortie : une ligne par écran, « OK » ou le problème précis ; code de sortie 1 s'il y a un problème. Rendre un résumé court.
