# Architecture

PWA statique (HTML, CSS, JavaScript en modules ES, sans build ni framework), servie par GitHub Pages sous `/<nom-du-depot>/`. Tous les chemins sont relatifs.

## Arborescence

```
index.html               coquille de l'app (barre d'onglets, conteneurs de pages, sprite d'icônes)
manifest.webmanifest     start_url "./", scope "./", id, icônes 192/512/maskable
sw.js                    cache versionné de la coquille (cache-first), pdf.js mis en cache à la demande
css/                     variables.css (thèmes clair/sombre), base.css, composants.css, pages.css ; cockpit.css (v100, toutes les règles sous :root[data-app="v100"])
js/
  app.js                 démarrage : base, PIN, onboarding, routeur, bandeaux, SW, retour au premier plan
  router.js              navigation par hash (#accueil, #depenses, #epargne, #reglages, #historique…)
  db.js                  mini-wrapper IndexedDB (promesses, transactions, index)
  migrations.js          versions du schéma + migrations (stores V1, stores V2 prêts)
  store.js               état en mémoire + écriture dans IndexedDB + évènements « change »
  money.js, dates.js     centimes entiers, formats fr-FR, Europe/Paris, semaine du lundi
  categories.js, rules.js catégories, nature comptable, normalisation des marchands, règles
  calculs.js             reste à dépenser, jauge, position globale, projection de découvert
  epargne.js, dettes.js  poches, arrondis, plan mensuel ; amortissement, remboursement anticipé
  detecteurs.js, coach.js comportements coûteux ; plan d'action par règles + agrégats anonymisés pour Gemini
  saisie.js              analyse locale d'une phrase (« deux fois 3,20 hier chez Lidl »)
  import/                lcl-pdf.js, revolut-pdf.js, csv.js, pipeline.js, pdf-loader.js
  gemini.js, prompts.js  client REST generateContent + prompts versionnés en français
  voice.js, camera.js    MediaRecorder (audio/mp4 sur iOS), compression JPEG sans EXIF
  charts.js              graphiques SVG accessibles (titre, description, tableau alternatif)
  bridge.js              contrat « budget-repas » v1 (fragment d'URL, fichier, presse-papier)
  securite.js            PIN (PBKDF2), masquage, écran de confidentialité
  sauvegarde.js          export/import JSON (format du fichier d'import privé)
  ics.js                 événements Calendrier (.ics) pour les rappels
  ui/                    sheet.js (feuille modale), toast.js, composants.js, icones.js
  pages/                 accueil, depenses, budgets, epargne, historique, reglages, onboarding, saisie, import
  v2/                    interfaces documentées des fonctionnalités V2 (aucune interface utilisateur)
  aiguillage.js          script classique chargé en premier : choisit l'app (origine ou v100) avant le premier affichage
  v100/                  l'app « Cockpit » : bascule.js, ui/ (graphes SVG, blocs), pages/ (cockpit, strategie, s-*),
                         strategie/ (moteurs purs : pret, projection, rythmes, enveloppes, tresorerie, score, repartition, brief)
    pages/fiches.js      les fiches « ? » (schéma, calcul, statistiques) ouvertes depuis l'Accueil
    pages/s-score.js     Stratégie → Score Budget ; pages/s-habitudes.js : Stratégie → Mes habitudes (statistiques)
    ui/confirmation.js   la petite carte après une dépense ou une privation (se ferme seule après 9 s)
    strategie/stats.js   statistiques des dépenses du quotidien (moyenne, médiane, tendance, prévision de fin de mois)
    strategie/explications.js  calculs ligne par ligne des fiches (mêmes fonctions que l'app)
vendor/pdfjs/            pdf.js « legacy » (ES module) embarqué, chargé uniquement pour l'import PDF
icons/                   PNG 180, 192, 512, maskable 512 + SVG source
tools/                   icones.html (régénère les PNG), verif-confidentialite.mjs, verif-statique.mjs, ecrans.mjs (écrans dans Chromium, sauvegarde synthétique)
tests/                   tests Node (node --test), fixtures synthétiques, tests/index.html (Safari)
  outils/                generer-sauvegarde.mjs (sauvegarde synthétique), fausse-idb.mjs (fausse base pour Node), rapport-court.mjs (npm test : seulement les échecs)
CLAUDE.md, ETAT.md, IDEES.md  à la racine : consignes pour Claude, état du projet, idées futures
.claude/                 agents/ et skills/ : l'équipe et les procédures de Claude (pas chargés par l'app)
```

## Flux de données

```
PDF/CSV ──► pdf-loader (pdf.js) ──► parseur local (LCL / Revolut / CSV) ──► contrôle de réconciliation
        ──► pipeline : normalisation → dédoublonnage → internes/épargne → règle Revolut → remboursements
                       → catégorisation (règles utilisateur → import → défaut → Gemini optionnel)
        ──► écran de revue ──► store (mémoire) ──► IndexedDB
saisie (clavier / voix / photo) ──► carte de confirmation ──► store
store ──► calculs.js / epargne.js / dettes.js ──► pages (Accueil, Dépenses, Épargne, Historique…)
```

L'état complet est chargé en mémoire au démarrage (quelques milliers de transactions : < 5 Mo) ; chaque modification est écrite immédiatement dans IndexedDB, puis un évènement `change` redessine la page visible.

## Schéma IndexedDB (version 2)

| Store | Clé | Index | Contenu |
|---|---|---|---|
| meta | cle | | schemaVersion, historique des migrations, instantané de la jauge |
| profil | cle | | profil (1 document) |
| parametres | cle | | thème, mode 100 % local, clé et modèle Gemini, PIN, masquage… |
| revenusMensuels | mois | | salaire et prime exacts, autres entrées, statut attendu/confirmé |
| comptes | id | | courant, néobanque, espèces, épargne ; solde initial ; solde de référence |
| transactions | id | date, compteId, categorie, importId, empreinte | toutes les opérations |
| chargesFixes | id | | prélèvements récurrents détectés ou saisis |
| enveloppes, mouvementsEnveloppes | id | mois | plafonds et vases communicants |
| poches | id | | cible, solde initial, mouvements (versement / reprise) |
| planMensuel | mois | | revenus, charges, dettes, allocations, vie courante, marge, statut |
| creditsBancaires, prets | id | | échéanciers, remboursements |
| reglesCategorie | id | | motif → catégorie (origine utilisateur / import / défaut) |
| cagnotteArrondis | id | transactionId | arrondis virés |
| fileAttenteIA | id | | saisies à analyser plus tard (audio, texte, photo) |
| planAction, imports, evenements, questions, virementsPrevus | id | | coach, historique d'import, alertes vues, questions d'onboarding, virements programmés |
| **V2** gamelles, joursSansDepense, listeEnvies, checkins, bridgeRecus | id / date | date | prêts pour les fonctionnalités V2 |

Migration 1 → 2 : création des stores V2 ; chaque transaction reçoit `drapeaux` et `aQualifier`. Les sauvegardes d'une version antérieure sont migrées à l'import (`migrerContenu`).

## Pièges iOS / Safari pris en compte

1. `viewport-fit=cover` + `env(safe-area-inset-*)` sur l'en-tête, la barre d'onglets et les feuilles modales ; `100dvh`.
2. Champs à 16 px minimum (sinon zoom automatique) ; `inputmode="decimal"` (virgule sur le clavier français).
3. Clavier : `visualViewport` + `scrollIntoView` ; la barre d'onglets est masquée quand le clavier est ouvert.
4. `overscroll-behavior` maîtrisé, `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`, `user-select: none` sur l'interface.
5. Pas de `webkitSpeechRecognition` en mode installé : `MediaRecorder` + `getUserMedia`, type MIME détecté (`audio/mp4` sur iOS), permission redemandée à chaque lancement.
6. Pas de notification programmée : bandeaux à l'ouverture + fichiers `.ics`.
7. Stockage : `navigator.storage.persist()` demandé, résultat affiché ; sauvegarde hebdomadaire rappelée (iOS peut purger les données d'un site non installé).
8. Service worker : enregistrement relatif, mise à jour vérifiée au retour au premier plan, bandeau « Nouvelle version », `skipWaiting` puis rechargement sur `controllerchange`.
9. Web Share API pour l'export (fichier) avec repli téléchargement ; `<input type="file">` pour l'import.
10. Caméra : `<input capture="environment">`, recompression canvas (supprime EXIF/GPS, orientation appliquée par `createImageBitmap`).
11. Un lien ouvert depuis une app installée part dans Safari : le pont avec l'autre app passe par le fragment d'URL, un fichier ou le presse-papier.
12. `navigator.standalone === false` → écran d'aide à l'installation.

## Règles de calcul (résumé)

Voir `HYPOTHESES.md` pour le détail. Les fonctions de calcul sont pures et testées sous Node (`tests/*.test.mjs`).
