// aiguillage.js — choisit AVANT le premier affichage quelle app montrer : l'app d'origine, v100 (le Cockpit) ou v200 (la nouvelle app).
// Le choix est gardé sur l'appareil (localStorage « budget-app ») ; « ?app=v100 », « ?app=v200 » ou « ?app=origine » dans l'adresse le change.
// Les trois apps partagent les mêmes données : passer de l'une à l'autre ne touche à rien.
(function () {
  var choix = null;
  try {
    var m = /[?&]app=(v100|v200|origine)\b/.exec(location.search);
    if (m) localStorage.setItem('budget-app', m[1]);
    choix = localStorage.getItem('budget-app');
  } catch (e) { choix = null; }
  var racine = document.documentElement;
  if (choix === 'v100') {
    racine.dataset.app = 'v100';
    racine.dataset.theme = 'sombre';
    racine.style.background = '#070b16';
  } else if (choix === 'v200') {
    // v200 : claire, fond crème, barre d'état crème (les balises theme-color sont déjà lues : elles précèdent ce script)
    racine.dataset.app = 'v200';
    racine.dataset.theme = 'clair';
    racine.style.background = '#FBF6EC';
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i += 1) metas[i].setAttribute('content', '#FBF6EC');
    var cs = document.querySelector('meta[name="color-scheme"]');
    if (cs) cs.setAttribute('content', 'light');
  }
}());
