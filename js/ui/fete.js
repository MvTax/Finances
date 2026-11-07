// fete.js — le côté « jeu » du style Joyeux : style appliqué à la page, confettis, « +XP » qui s'envole,
// passage de niveau, et l'enregistrement des jours où l'app est ouverte (pour la série 🔥).
// En style Classique, rien de tout ça ne s'affiche (les points sont tout de même comptés depuis les données).

import { h } from './dom.js';
import { etat, ecrireMeta } from '../store.js';
import { profilJeu } from '../jeu.js';
import { aujourdhui } from '../dates.js';
import { periodeBudget } from '../calculs.js';
import { toast } from './toast.js';
import { appliquerTheme } from '../app-theme.js';

const COULEURS = ['#FFC531', '#FF4F79', '#6C4CF1', '#12C784', '#FF8A1F', '#3EC5FF'];
let derniereFete = 0;

export const estJoyeux = () => (etat.parametres?.style || 'classique') === 'joyeux';

/** Pose data-style sur <html> (les feuilles de style Joyeux s'y accrochent). */
export function appliquerStyle(style = etat.parametres?.style) {
  const racine = document.documentElement;
  if (style === 'joyeux') racine.dataset.style = 'joyeux';
  else delete racine.dataset.style;
  appliquerTheme(etat.parametres?.theme);
}

const mouvementReduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Une pluie de confettis (quelques dizaines de petits morceaux, retirés après l'animation). */
export function confettis({ nombre = 28, origine = null } = {}) {
  if (!estJoyeux() || mouvementReduit()) return;
  const x0 = origine?.x ?? innerWidth / 2;
  const y0 = origine?.y ?? innerHeight * 0.62;
  const zone = h('div', { class: 'confettis', 'aria-hidden': 'true' });
  for (let i = 0; i < nombre; i += 1) {
    const angle = (-90 + (Math.random() - 0.5) * 140) * (Math.PI / 180);
    const force = 140 + Math.random() * 220;
    zone.append(h('i', { style: {
      left: `${x0}px`, top: `${y0}px`, background: COULEURS[i % COULEURS.length],
      '--dx': `${Math.cos(angle) * force}px`, '--dy': `${Math.sin(angle) * force}px`,
      '--rot': `${Math.round((Math.random() - 0.5) * 900)}deg`, '--d': `${900 + Math.random() * 600}ms`,
      borderRadius: i % 3 === 0 ? '50%' : '2px', width: `${6 + (i % 4) * 2}px`, height: `${8 + (i % 3) * 3}px`,
    } }));
  }
  document.body.append(zone);
  setTimeout(() => zone.remove(), 1700);
}

/** « +10 XP » qui monte au-dessus de la barre d'onglets. */
function bulleXp(xp, texte) {
  const el = h('div', { class: 'bulle-xp', 'aria-hidden': 'true' }, h('strong', {}, `+${xp} XP`), texte ? h('span', {}, texte) : null);
  document.body.append(el);
  setTimeout(() => el.remove(), 1900);
}

/** La mascotte saute au prochain affichage de l'Accueil si on vient de fêter quelque chose. */
export const vientDeFeter = () => Date.now() - derniereFete < 2500;

/**
 * Fête une action : confettis + « +XP », puis vérifie le passage de niveau.
 * @param {'saisie'|'privation'|'virement'|'sansDepense'} quoi
 */
export async function feter(quoi, { xp = 0, texte = '', origine = null } = {}) {
  if (!estJoyeux()) return;
  derniereFete = Date.now();
  confettis({ nombre: quoi === 'saisie' ? 18 : 34, origine });
  if (xp) bulleXp(xp, texte);
  await verifierNiveau();
}

/** Passage de niveau : grand bandeau et plus de confettis, une seule fois par niveau. */
export async function verifierNiveau() {
  const p = profilJeu(etat, aujourdhui());
  const vu = etat.meta.jeu?.niveauVu || 1;
  if (p.niveau.numero <= vu) return null;
  await ecrireMeta('jeu', { ...(etat.meta.jeu || {}), niveauVu: p.niveau.numero });
  if (!estJoyeux()) return null;
  setTimeout(() => {
    confettis({ nombre: 60, origine: { x: innerWidth / 2, y: innerHeight * 0.4 } });
    toast(`${p.niveau.emoji} Niveau ${p.niveau.numero} : ${p.niveau.nom} !`, { type: 'succes', duree: 4500 });
  }, 600);
  return p.niveau;
}

/**
 * À l'ouverture : note le jour (série), et démarre le jeu au début du mois budgétaire en cours
 * (les points du mois déjà passés sont comptés, le niveau atteint n'est pas fêté).
 */
export async function noterJourVu() {
  if (!etat.parametres?.onboarding?.termine) return;
  const auj = aujourdhui();
  if (!etat.meta.jeu?.depuis) {
    const depuis = periodeBudget(auj, etat.profil).debut;
    const p = profilJeu({ ...etat, meta: { ...etat.meta, jeu: { depuis } } }, auj);
    await ecrireMeta('jeu', { depuis, niveauVu: p.niveau.numero });
  }
  const jours = etat.meta.joursVus || [];
  if (!jours.includes(auj)) await ecrireMeta('joursVus', [...jours, auj].sort().slice(-90));
}
