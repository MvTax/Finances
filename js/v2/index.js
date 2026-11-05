// v2/index.js — fonctionnalités V2 : architecture prête, NON branchée sur l'interface.
// Chaque module expose des fonctions pures documentées ; les stores IndexedDB existent déjà (schéma 2)
// et chaque fonctionnalité a son drapeau dans parametres.fonctionnalitesV2 (faux par défaut).
//
// | Drapeau             | Module                  | Store              |
// |---------------------|-------------------------|--------------------|
// | gamelle             | gamelle.js              | gamelles           |
// | radarVente          | radar-vente.js          | —                  |
// | joursSansDepense    | jours-sans-depense.js   | joursSansDepense   |
// | freinAchat          | frein-achat.js          | listeEnvies        |
// | modeRayon           | mode-rayon.js           | —                  |
// | antiCraquage        | anti-craquage.js        | —                  |
// | checkinSoir         | checkin-soir.js         | checkins           |
// | bilanDimanche       | bilan-dimanche.js       | —                  |
// Le détecteur d'abonnements/doublons (detecteurs.js) et le simulateur LEP (epargne.js → simulerLivret)
// sont déjà actifs en V1 ; l'alerte « avant prélèvement » est le bandeau « Prélèvements dans les 3 jours ».
//
// Lien profond #ajout-vocal : il ouvre la saisie vocale. LIMITE iOS documentée : un Raccourci « Ouvrir l'URL »
// ouvre Safari, pas la PWA installée (stockage séparé) ; il n'est donc utile que si l'app est utilisée dans Safari.

export * as gamelle from './gamelle.js';
export * as joursSansDepense from './jours-sans-depense.js';
export * as freinAchat from './frein-achat.js';
export * as radarVente from './radar-vente.js';
export * as antiCraquage from './anti-craquage.js';
export * as checkinSoir from './checkin-soir.js';
export * as bilanDimanche from './bilan-dimanche.js';
export * as modeRayon from './mode-rayon.js';
