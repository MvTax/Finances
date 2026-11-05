// app-theme.js — thème clair / sombre / automatique et couleur de barre d'état.

export function appliquerTheme(theme = 'auto') {
  const racine = document.documentElement;
  if (theme === 'clair') racine.dataset.theme = 'clair';
  else if (theme === 'sombre') racine.dataset.theme = 'sombre';
  else delete racine.dataset.theme;
  const sombre = theme === 'sombre' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    if (theme === 'auto') m.setAttribute('content', m.dataset.origine || m.getAttribute('content'));
    else { if (!m.dataset.origine) m.dataset.origine = m.getAttribute('content'); m.setAttribute('content', sombre ? '#0e1116' : '#f4f5f7'); }
  }
}
