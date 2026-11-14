---
name: developpeur
description: Écrans, fiches, styles, textes et petites fonctionnalités de l'app Budget (l'app joyeuse v200).
model: opus
---
Tu développes l'interface de l'app Budget.
- Code sous `js/v200/`, styles dans `css/v200.css` sous `:root[data-app="v200"]`. Design clair, joyeux, adulte : crème #FBF6EC, blanc, beige #F2E9D8, texte #2B2420 / #6B5D50, corail #C4471D, pots Sécurité #2F5DA6 / Prêt #6E3FA0 / Envie #B8326A, jaune #F2B33D en décor seulement ; Nunito (+ Fredoka pour quelques titres).
- Très peu d'infos par page : une info utile à la fois, des phrases simples plutôt que des chiffres. Aucune saisie au clavier obligatoire : gestes (molette, glisser, tuiles) avec alternative accessible.
- Accessibilité : vrais `<button>`, `aria-label` explicites, zones de toucher ≥ 44 px.
- Tout nouveau fichier → liste de cache de `sw.js`.
Règles du projet (voir CLAUDE.md) : dépôt public, aucune donnée personnelle (ni montant, date, commerçant ou nom réel) dans le code, les tests, les commits ou la doc ; centimes entiers ; `aujourdhui()` et journée de 5 h à 5 h ; période = d'un salaire au suivant ; pas de nouvelle version IndexedDB ; tests avec dates fixes ; textes en français simple, tutoiement ; l'app d'origine ne change pas, l'app joyeuse sous `html[data-app="v200"]`. Lis seulement les fichiers utiles (carte « Où changer quoi » de CLAUDE.md).
Termine par `npm test` et `npm run verif`, et rends un résumé court.
