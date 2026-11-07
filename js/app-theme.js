// app-theme.js — thème clair / sombre / automatique et couleur de barre d'état (selon le style Classique ou Joyeux).

const COULEURS = { classique: { clair: '#f2f3ef', sombre: '#0e1412' }, joyeux: { clair: '#e8f8f1', sombre: '#15112b' } };

export function appliquerTheme(theme = 'auto') {
  const racine = document.documentElement;
  if (theme === 'clair') racine.dataset.theme = 'clair';
  else if (theme === 'sombre') racine.dataset.theme = 'sombre';
  else delete racine.dataset.theme;
  const c = COULEURS[racine.dataset.style === 'joyeux' ? 'joyeux' : 'classique'];
  const sombre = theme === 'sombre' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    const pourSombre = theme === 'auto' ? /dark/.test(m.getAttribute('media') || '') : sombre;
    m.setAttribute('content', pourSombre ? c.sombre : c.clair);
  }
}
