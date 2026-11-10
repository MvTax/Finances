// aiguillage.js — choisit AVANT le premier affichage quelle app montrer : l'app d'origine, ou v100 (le Cockpit).
// Le choix est gardé sur l'appareil (localStorage « budget-app ») ; « ?app=v100 » ou « ?app=origine » dans l'adresse le change.
// Les deux apps partagent les mêmes données : passer de l'une à l'autre ne touche à rien.
(function () {
  var choix = null;
  try {
    var m = /[?&]app=(v100|origine)\b/.exec(location.search);
    if (m) localStorage.setItem('budget-app', m[1]);
    choix = localStorage.getItem('budget-app');
  } catch (e) { choix = null; }
  if (choix === 'v100') {
    var racine = document.documentElement;
    racine.dataset.app = 'v100';
    racine.dataset.theme = 'sombre';
    racine.style.background = '#070b16';
  }
}());
