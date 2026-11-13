// confirmation.js (v100) — après une dépense ou une privation : une petite carte, trois lignes, qui s'efface seule.
// « C'est noté », ce qu'il reste aujourd'hui, où en est l'épargne. Le détail est derrière « Plus d'explications ».

import { h, icone, estMasque } from '../../ui/dom.js';
import { etat } from '../../store.js';
import { jaugeDuJour, resteADepenser, estDepenseQuotidienne } from '../../calculs.js';
import { arrondiDeLaDepense } from '../strategie/explications.js';
import { aujourdhui, formatDateCourte } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { estAnnoncee } from '../../sansdepense.js';
import { totalEpargne } from '../pages/fiches.js';

const DUREE = 9000;
let courante = null;
const eur = (c) => (estMasque() ? '•••,•• €' : formatEuros(c));

/**
 * Affiche la carte. lignes : [[libellé, valeur, classe?]]. Un seul bouton d'explication, un seul d'annulation.
 * @param {{ titre: string, lignes: Array<[string, string, string?]>, expliquer?: () => void, annuler?: () => void }} o
 */
export function confirmation({ titre, lignes, expliquer = null, annuler = null }) {
  courante?.fermer();
  let minuteur = null;
  const fermer = () => { clearTimeout(minuteur); el.classList.remove('visible'); setTimeout(() => el.remove(), 250); if (courante?.el === el) courante = null; };
  const el = h('div', { class: 'confirmation', role: 'status' },
    h('p', { class: 'confirmation-tete' }, icone('ok'), h('span', {}, titre),
      h('button', { type: 'button', class: 'confirmation-fermer', 'aria-label': 'Fermer', onclick: () => fermer() }, icone('fermer'))),
    h('div', { class: 'confirmation-lignes' }, lignes.filter(Boolean).map(([l, v, cls]) => h('p', { class: cls || '' }, h('span', {}, l), h('b', {}, v)))),
    h('div', { class: 'confirmation-boutons' },
      annuler ? h('button', { type: 'button', class: 'btn btn-secondaire btn-petit', onclick: () => { fermer(); annuler(); } }, 'Annuler') : null,
      expliquer ? h('button', { type: 'button', class: 'btn btn-secondaire btn-petit confirmation-plus', onclick: () => { fermer(); expliquer(); } }, 'Plus d’explications') : null));
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  const armer = (ms) => { clearTimeout(minuteur); minuteur = setTimeout(fermer, ms); };
  armer(DUREE);
  el.addEventListener('touchstart', () => clearTimeout(minuteur), { passive: true });
  el.addEventListener('touchend', () => armer(3000));
  courante = { el, fermer };
  return courante;
}

/** Après une dépense (ou une entrée) : la carte dit l'essentiel, la fiche explique tout. */
export function confirmerAjout(tx, { annuler = null } = {}) {
  const auj = aujourdhui();
  const j = jaugeDuJour(etat, auj, etat.meta?.jauge || null);
  const r = resteADepenser(etat, auj);
  const ep = totalEpargne(auj);
  const depense = tx.sens === 'debit';
  const arr = depense ? arrondiDeLaDepense(etat, tx, auj).centimes : 0; // le même arrondi que l'épargne compte
  const nom = tx.marchand || tx.libelle || '';
  const moisDepasse = r.resteCentimes < 0;
  const dispo = j.restantAujourdhuiCentimes;
  const jourLigne = moisDepasse ? ['Mois dépassé de', eur(-r.resteCentimes), 'alerte']
    : dispo >= 0 ? ['Il te reste aujourd’hui', eur(dispo)] : ['Dépassé aujourd’hui de', eur(-dispo), 'attention'];
  return confirmation({
    titre: `${depense ? 'Dépense notée' : 'Entrée notée'} : ${eur(tx.montantCentimes)}${nom ? `, ${nom}` : ''}${tx.date !== auj ? ` (${formatDateCourte(tx.date)})` : ''}`,
    lignes: [
      depense && estDepenseQuotidienne(tx) ? jourLigne : ['Ta part du jour', 'inchangée'],
      depense && tx.date === auj && estDepenseQuotidienne(tx) && estAnnoncee(etat, auj) ? ['Journée sans dépense', 'rompue', 'attention'] : null,
      ep.poches.length ? ['Ton épargne', arr ? `${eur(ep.totalCentimes)} (+${eur(arr)} d’arrondi)` : eur(ep.totalCentimes)] : null,
    ],
    annuler,
    expliquer: depense ? async () => { const { ficheDepense } = await import('../pages/fiches.js'); ficheDepense(tx); } : null,
  });
}

/** Après « Je me suis privé ». */
export function confirmerPrivation(montantCentimes) {
  const auj = aujourdhui();
  const j = jaugeDuJour(etat, auj, etat.meta?.jauge || null);
  const ep = totalEpargne(auj);
  return confirmation({
    titre: `Bravo : ${eur(montantCentimes)} mis de côté`,
    lignes: [
      j.restantAujourdhuiCentimes >= 0 ? ['Il te reste aujourd’hui', eur(j.restantAujourdhuiCentimes)] : ['Dépassé aujourd’hui de', eur(-j.restantAujourdhuiCentimes), 'attention'],
      ['Ton épargne', `${eur(ep.totalCentimes)}${ep.aVirerCentimes ? `, dont ${eur(ep.aVirerCentimes)} à virer` : ''}`],
    ],
    expliquer: async () => { const { ficheEpargne } = await import('../pages/fiches.js'); ficheEpargne(); },
  });
}
