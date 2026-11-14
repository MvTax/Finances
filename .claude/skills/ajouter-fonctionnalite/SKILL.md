---
name: ajouter-fonctionnalite
description: Ajouter ou modifier une fonctionnalité de l'app Budget au bon endroit, avec tests, version et vérifications.
---
# Ajouter une fonctionnalité
1. Trouver le fichier avec la carte « Où changer quoi » de `CLAUDE.md`. Ne lire que ces fichiers.
2. App joyeuse → code sous `js/v200/`, styles dans `css/v200.css` sous `:root[data-app="v200"]`. L'app d'origine ne doit pas bouger.
3. Calcul : fonction pure dans `js/v200/calculs/` (ou `js/calculs.js`…), centimes entiers, dates passées en paramètre (`aujourdhui()` côté page seulement). Tests dans `tests/cas/*.mjs` (inscrits dans `tests/liste.mjs`), dates fixes.
4. Donnée nouvelle : champ facultatif dans `profil`/`meta` ; si sauvegardée dans `meta` → `META_HISTORIQUE` ; si format modifié → migration `js/migrations.js` + test aller-retour.
5. Valeurs personnelles : jamais dans le code ; calculées depuis les données de l'appareil ou réglables.
6. Textes : français simple, tutoiement, phrases courtes.
7. Skill `nouvelle-version`, puis skill `verif-ecrans` sur les écrans touchés.
8. Une ligne dans `ETAT.md`.
