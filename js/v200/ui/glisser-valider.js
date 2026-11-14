// glisser-valider.js (v200) — « Glisse pour valider » : un rond qu'on pousse vers la droite (au moins 85 % de la course).
// Le rail garde 24 px de marge aux bords de l'écran (le geste « retour » d'iOS part du bord gauche).
// Toujours accessible sans glisser : la cible au bout du rail est un vrai bouton « Valider » (VoiceOver, animations réduites).

import { h, icone, reduitMouvement, vibrer } from '../../ui/dom.js';

export const SEUIL_VALIDATION = 0.85;

/**
 * @param {{ texte: string, libelle: () => string, onValider: () => Promise<void>|void }} o
 *   texte : ce qui est écrit dans le rail ; libelle : le nom du bouton « Valider … » pour VoiceOver.
 * @returns {{ element, activer: (oui: boolean, texteInactif?: string) => void, reinitialiser: () => void }}
 */
export function glisserValider({ texte, libelle = () => 'Valider', onValider }) {
  const rond = h('span', { class: 'v2-glisser-rond', 'aria-hidden': 'true' }, icone('suivant'));
  const etiquette = h('span', { class: 'v2-glisser-texte', 'aria-hidden': 'true' }, texte);
  const valider = h('button', { type: 'button', class: 'v2-glisser-ok', 'aria-label': libelle() }, icone('ok'));
  const remplissage = h('span', { class: 'v2-glisser-trace', 'aria-hidden': 'true' });
  const rail = h('div', { class: 'v2-glisser', 'data-glisse': '' }, remplissage, etiquette, rond, valider);

  let actif = true; let enCours = false; let x0 = null; let dx = 0; let course = 0; let id = null;
  const poser = (x, anime) => {
    rond.style.transition = anime ? '' : 'none'; remplissage.style.transition = anime ? '' : 'none';
    rond.style.transform = `translateX(${x}px)`;
    remplissage.style.width = `${x + rond.offsetWidth}px`;
    etiquette.style.opacity = String(Math.max(0, 1 - (x / Math.max(1, course)) * 1.6));
  };
  // Le rond part de sa marge et s'arrête à la même marge, à droite
  const mesurer = () => { course = Math.max(0, rail.clientWidth - rond.offsetWidth - 2 * rond.offsetLeft); };
  const lancer = async () => {
    if (!actif || enCours) return;
    enCours = true; rail.classList.add('valide'); vibrer(18);
    mesurer(); poser(course, !reduitMouvement());
    try { await onValider(); } catch (err) { rail.classList.remove('valide'); poser(0, true); throw err; } finally { enCours = false; }
  };

  rond.addEventListener('pointerdown', (e) => {
    if (!actif || enCours || e.button > 0) return;
    mesurer();
    x0 = e.clientX; dx = 0; id = e.pointerId;
    try { rond.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    rail.classList.add('tire');
    e.preventDefault();
  });
  rond.addEventListener('pointermove', (e) => {
    if (x0 === null || e.pointerId !== id) return;
    dx = Math.max(0, Math.min(course, e.clientX - x0));
    poser(dx, false);
  });
  const fin = (e) => {
    if (x0 === null || (e && e.pointerId !== id)) return;
    x0 = null; id = null; rail.classList.remove('tire');
    if (course > 0 && dx >= SEUIL_VALIDATION * course) lancer();
    else { poser(0, true); etiquette.style.opacity = ''; }
  };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) rond.addEventListener(t, fin);
  valider.addEventListener('click', () => lancer());

  return {
    element: rail,
    activer(oui, texteInactif = texte) {
      actif = !!oui;
      rail.classList.toggle('inactif', !actif);
      valider.disabled = !actif || null;
      valider.setAttribute('aria-label', actif ? libelle() : texteInactif);
      etiquette.textContent = actif ? texte : texteInactif;
    },
    reinitialiser() { rail.classList.remove('valide'); poser(0, false); etiquette.style.opacity = ''; },
  };
}
