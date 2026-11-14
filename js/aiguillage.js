// aiguillage.js — choisit AVANT le premier affichage quelle app montrer : v200 (la nouvelle app joyeuse, par défaut)
// ou l'app d'origine (styles Classique / Joyeux), si tu l'as choisie dans les Réglages.
// Le choix est gardé sur l'appareil (localStorage « budget-app ») ; « ?app=v200 » ou « ?app=origine » dans l'adresse le change.
// L'ancien Cockpit (« v100 ») n'existe plus : ce choix-là, gardé ou demandé, ouvre v200 (et il est réécrit).
// Les deux apps partagent les mêmes données : passer de l'une à l'autre ne touche à rien.
(function () {
  /**
   * Quelle app ouvrir. demandee : la valeur de ?app= (ou null) ; gardee : la valeur de localStorage (ou null).
   * → { app: 'v200' | 'origine', aGarder: valeur à écrire dans localStorage, ou null s'il n'y a rien à changer }
   */
  function choixApp(demandee, gardee) {
    var voulue = demandee || gardee;
    var app = voulue === 'origine' ? 'origine' : 'v200';
    var aGarder = (demandee && demandee !== gardee) || (gardee && gardee !== app) ? app : null;
    return { app: app, aGarder: aGarder };
  }
  globalThis.choixAppBudget = choixApp; // pour les tests (tests/cas/v200.mjs)
  // Chargé comme module (tests) : on s'arrête là. Dans l'app, c'est un script classique du <head>.
  if (typeof document === 'undefined' || !document.currentScript) return;

  var choix = { app: 'v200', aGarder: null };
  try {
    var m = /[?&]app=(v100|v200|origine)\b/.exec(location.search);
    choix = choixApp(m ? m[1] : null, localStorage.getItem('budget-app'));
    if (choix.aGarder) localStorage.setItem('budget-app', choix.aGarder);
  } catch (e) { choix = { app: 'v200', aGarder: null }; }
  if (choix.app !== 'v200') return;
  // v200 : claire, fond crème, barre d'état crème (les balises theme-color sont déjà lues : elles précèdent ce script)
  var racine = document.documentElement;
  racine.dataset.app = 'v200';
  racine.dataset.theme = 'clair';
  racine.style.background = '#FBF6EC';
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var i = 0; i < metas.length; i += 1) metas[i].setAttribute('content', '#FBF6EC');
  var cs = document.querySelector('meta[name="color-scheme"]');
  if (cs) cs.setAttribute('content', 'light');
}());
