# Tesseract.js (embarqué)

Lecture des captures d'écran **sur le téléphone**, sans rien envoyer. Chargé seulement à la première capture.

- `tesseract.esm.min.js`, `worker.min.js` — paquet npm `tesseract.js@5.1.1` (licence Apache 2.0, voir `LICENSE`)
- `tesseract-core-simd-lstm.wasm.js`, `tesseract-core-lstm.wasm.js` — paquet npm `tesseract.js-core@5.1.1` (le navigateur prend la version SIMD s'il sait la faire tourner)
- `fra-donnees.js` — paquet npm `@tesseract.js-data/fra@1.0.0`, modèle `4.0.0_best_int` (français, LSTM) : le fichier `fra.traineddata.gz` encodé en base64 dans un module JS, pour être servi partout comme un script

Les commentaires `sourceMappingURL` ont été retirés (fichiers .map non fournis).

Correctif local dans `worker.min.js` : à l'initialisation, une langue passée en objet `{ code, data }` était nommée par ses octets (`t.data`) au lieu de son code (`t.code`). Corrigé ici (une seule occurrence).
