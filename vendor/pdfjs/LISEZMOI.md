# pdf.js (embarqué)

Fichiers copiés depuis le paquet npm `pdfjs-dist@4.10.38`, build `legacy/build/` (module ES compatible Safari) :

- `pdf.min.mjs` — bibliothèque
- `pdf.worker.min.mjs` — worker
- `LICENSE` — licence Apache 2.0 (Mozilla)

Chargés uniquement à la demande par `js/import/pdf-loader.js` lors d'un import PDF, puis mis en cache par le service worker. Le reste de l'app n'en dépend pas.

Mise à jour : `npm i pdfjs-dist@<version>` dans un dossier de travail, puis recopier les deux fichiers de `legacy/build/`.
