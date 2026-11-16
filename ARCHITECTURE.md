# Architecture

PWA statique (HTML, CSS, JavaScript en modules ES, sans build ni framework), servie par GitHub Pages sous `/<nom-du-depot>/`. Tous les chemins sont relatifs.

## Arborescence

```
index.html               coquille de l'app (barre d'onglets, conteneurs de pages, sprite d'icônes)
manifest.webmanifest     start_url "./", scope "./", id, icônes 192/512/maskable
sw.js                    cache versionné de la coquille (cache-first), pdf.js mis en cache à la demande
css/                     variables.css (thèmes clair/sombre), base.css, composants.css, pages.css, joyeux.css, envies.css ;
                         v200.css (la nouvelle app, toutes les règles sous :root[data-app="v200"], y compris l'habillage des pages héritées)
fonts/                   nunito.woff2, fredoka.woff2 (v200) et leurs licences OFL
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
  aiguillage.js          script classique chargé en premier : choisit l'app avant le premier affichage (v200 par défaut ;
                         « origine » si tu l'as choisie ; l'ancien choix « v100 » est réécrit en v200). choixApp testé dans v200.mjs
  habillage.js           appCourante(), estV200(), basculer('v200' | 'origine') (Réglages : « Revenir à l'ancienne app » / « Ouvrir la nouvelle app »)
  obligatoires.js        dépense obligatoire reconnue à la saisie (charge fixe, abonnement, ou « probable »)
  v200/                  la nouvelle app joyeuse (Aujourd'hui | Dépenses | + | Épargne | Résumé), mêmes données que l'origine
    pages/               aujourdhui, saisie (tuiles, molettes, glisser), privation, depenses, epargne (trois pots), resume
    ui/                  soleil (jauge), molette, glisser-valider, tuiles, confirmation (« C'est noté ! »), dessins
    calculs/             fonctions pures testées : commun, jour, habitudes, depenses, pots, resume, risques,
                         stats (moyenne, médiane, tendance, prévision de fin de mois), explications (partage du reste, arrondi d'une dépense)
                         Les Réglages, la modification d'une dépense, le virement, les mois passés, l'import et la rentrée d'argent
                         sont les pages d'origine (js/pages/), habillées par css/v200.css.
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
applepay.txt (iCloud, écrit par un Raccourci) ──► js/import/applepay.js : analyserFichier (lignes AP1) → planifierApplePay
        ──► js/v200/pages/applepay.js (revue) ──► actions.enregistrerApplePay ──► store
store ──► calculs.js / epargne.js / dettes.js ──► pages (Accueil, Dépenses, Épargne, Historique…)
```

L'état complet est chargé en mémoire au démarrage (quelques milliers de transactions : < 5 Mo) ; chaque modification est écrite immédiatement dans IndexedDB, puis un évènement `change` redessine la page visible.

### Paiements Apple Pay (1.43)

- `js/import/applepay.js` (fonctions pures) : `analyserLigne` / `analyserFichier` (format `AP1|horodatage|montant|carte|nom|commerçant`), `empreintePaiement`, `estProvisoire`, `compteDeCarte`, `transactionDepuisPaiement`, `planifierApplePay` → `{ aAjouter, aConfirmer, dejaLa, aCompleter, ignorees }`.
- `js/dates.js` : `jourBudgetDeHorodatage` (journée 5 h – 5 h, heure de Paris). `js/rules.js` : `marchandProche`. `js/import/pipeline.js` : `dedoublonner` laisse le relevé compléter un paiement Apple Pay (montant provisoire corrigé).
- `js/actions.js` : `enregistrerApplePay(plan, choix)`, `corrigerMontantProvisoire`, `confirmerMontant`. Écrans : `js/v200/pages/applepay.js`.
- Champs ajoutés, tous facultatifs, sans migration :
  - `transactions[].applePay` : `empreinte`, `horodatage`, `heure`, `carte`, `commercant`, `montantInitialCentimes`, `devise`, `montantDevise?`, `provisoire`, `raisonProvisoire` (`mot-cle` | `verification-carte`), `verifieLe`, `classement` (`regle` | `defaut` | `historique` | `a-classer` | `choix`), `montantSaisi?`. La transaction a `source: 'applepay'`.
  - `profil.applePay` : `cartes` (nom de carte → id de compte), `depuis` (AAAA-MM-JJ), `motsProvisoires` (liste de mots).
  - `meta.applePayVues` : empreintes des paiements déjà lus ; exportée (listée dans `META_HISTORIQUE`), réunie à la fusion.
  - `meta.applePayDernier` : `{ le, totaux, lues }`, date de la dernière lecture ; **non exportée**.

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
