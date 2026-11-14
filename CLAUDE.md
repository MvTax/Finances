# Budget — PWA iPhone (consignes pour Claude)

Répondre en français simple : l'utilisateur n'est pas développeur. App faite pour lui seul.
**Lire `ETAT.md` en début de session ; le mettre à jour en fin de session.**

## Règles non négociables
1. Dépôt public : aucune donnée personnelle (nom, IBAN, compte, carte, commerçant local, e-mail, montant ou date réels). Tests = données synthétiques. `npm run verif` avant chaque commit (refuse aussi 10 chiffres d'affilée).
2. Argent en centimes entiers ; `formatEuros` / `mt` seulement à l'affichage.
3. Fuseau Europe/Paris, journée de 5 h à 5 h : toujours `aujourdhui()` (`js/dates.js`), jamais `new Date()` pour décider du jour.
4. Période budgétaire = d'un salaire au suivant (`periodeBudget`), pas le mois civil.
5. Chaque version : `VERSION` dans `sw.js` + `js/version.js`, tout nouveau fichier dans la liste de cache de `sw.js`.
6. IndexedDB : jamais de nouvelle version de base ; seulement des champs facultatifs dans `profil` ou `meta`.
7. Tout calcul nouveau ou modifié a ses tests (`tests/cas/*.mjs`, inscrits dans `tests/liste.mjs`), avec des dates fixes.
8. Textes : français simple, phrases courtes, tutoiement, chiffres issus des vraies données de l'appareil.
9. Clé Gemini sur l'appareil ; tout envoi annoncé (« Envoi à Gemini : … »).
10. Mot de passe des sauvegardes jamais écrit dans le fichier exporté.
11. Sauvegarde : ne pas changer `format` ni la structure de `contenu` ; nouvelle donnée → migration + `META_HISTORIQUE`.
12. L'app d'origine (styles Classique/Joyeux) ne doit pas changer ; l'app (nouvelle, joyeuse) = `html[data-app="v200"]`.
13. Branche de travail `v100-simple` ; `main` = en ligne (GitHub Pages). Fusion dans `main` seulement à la mise en ligne.
14. Valeurs personnelles (salaire, seuils, catégories…) : dans `profil`/réglages, calculées sur l'appareil, jamais dans le code.

## Où changer quoi
| Besoin | Fichier |
|---|---|
| Pages (Aujourd'hui, Dépenses, Épargne, Résumé) | `js/v200/pages/*.js` |
| Saisie / privation par gestes | `js/v200/pages/saisie.js`, `privation.js`, `js/v200/ui/` (molette, glisser-valider, tuiles) |
| Carte après une dépense/privation | `js/v200/ui/confirmation.js` |
| Calcul / statistique de l'app | `js/v200/calculs/*.js` + test dans `tests/cas/v200.mjs` |
| Dépenses obligatoires (loyer, abonnements) | `js/obligatoires.js` + `tests/cas/obligatoires.mjs` |
| Choix de l'app (v200 / origine) | `js/aiguillage.js`, `js/habillage.js` |
| Calcul commun (reste, jauge, épargne) | `js/calculs.js`, `js/epargne.js`, `js/envies.js` + test |
| Petits dessins SVG | `js/v200/ui/dessins.js`, `soleil.js` |
| Style | `css/v200.css`, règles sous `:root[data-app="v200"]` |
| Nouvelle donnée sauvegardée | `js/migrations.js` (`SCHEMA_VERSION`+1) + `META_HISTORIQUE` (`js/sauvegarde.js`) + test `tests/cas/migrations.mjs` |
| Nouveau fichier | liste de cache de `sw.js` |
| Export / restauration | `js/sauvegarde.js`, `js/store.js` (`remplacerTout`), `js/pages/import.js` |

## Sommaire de la doc (lire la section utile, pas tout)
- `README.md` : la nouvelle app (§ « La nouvelle app joyeuse »), sauvegarde (§ « Sauvegarde »), tests (§ « Tests »), système d'épargne (§ « Mon système d'épargne »), journée 5 h (§ « Journée de budget de 5 h à 5 h »).
- `ARCHITECTURE.md` : arborescence, flux de données, schéma IndexedDB, pièges iOS, règles de calcul.
- `HYPOTHESES.md` : choix de conception et méthodes statistiques.
- `IDEES.md` : idées futures — à lire seulement si l'utilisateur le demande.

## Commandes
`npm test` (n'affiche que les échecs) · `npm run test:detail` · `npm run verif` · `npm run fixtures` · `python3 -m http.server 8765` puis `http://localhost:8765/` · `node tools/ecrans.mjs` (écrans, `--origine`, `--aller-retour`).
Skills du projet : `nouvelle-version`, `ajouter-fonctionnalite`, `verif-ecrans`, `aller-retour-sauvegarde`.

## Mode chef de projet
La session principale ne code presque pas. Pour chaque demande :
1. **Reformuler** en tâche précise (but, écrans/fichiers, ce qui ne doit pas changer), 3 à 5 lignes en français simple, et la montrer.
2. Si c'est vraiment ambigu : **une seule** question. Sinon, continuer.
3. **Choisir l'agent** : chiffres ou sauvegarde → `calculs` ; grosse demande → `architecte` d'abord ; interface → `developpeur` ; minuscule → `retouches` ; très poussé et rare → `expert`. Lui donner la tâche + seulement les fichiers utiles (carte ci-dessus).
4. Faire passer **chaque** résultat par `verificateur` avant de le dire fini.
5. Répondre court : ce qui est fait, quel agent, comment le voir sur l'iPhone. Mettre `ETAT.md` à jour.
Qualité d'abord. `expert` (Fable, ~2× Opus) : l'annoncer en une ligne avec la raison et attendre « oui ». Jamais par défaut. Pas d'effort « max » sans accord.
