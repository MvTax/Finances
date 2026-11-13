---
name: nouvelle-version
description: Passer l'app Budget à un nouveau numéro de version (sw.js + js/version.js, cache, tests, vérifs, commit). À utiliser à chaque livraison.
---
# Nouvelle version
1. Choisir le numéro (x.y.z) : correctif → z+1 ; fonctionnalité → y+1.
2. `sw.js` : `const VERSION = 'x.y.z'` ; `js/version.js` : `versionApp = 'x.y.z'` (les deux identiques).
3. Tout fichier ajouté (js, css, police, icône) → liste de cache de `sw.js`. Fichier supprimé → retiré de la liste.
4. `npm test` (doit finir par « 0 en échec »), puis `npm run verif` (statique + confidentialité, tout en ✓).
5. Mettre à jour `ETAT.md` (version, une ligne par nouveauté).
6. Commit en français : `x.y.z : <ce qui change pour l'utilisateur>`, sur la branche de travail (`v100-simple`), puis push. Jamais sur `main` sans demande de mise en ligne.
