// prevision.js (page) — la prévision de fin de mois expliquée.

import { h, mt } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { etat } from '../store.js';
import { previsionFinDeMois, JOURS_MIN_FIABLE } from '../prevision.js';
import { aujourdhui, formatDateCourte } from '../dates.js';
import { formatEuros } from '../money.js';

/** Une phrase pour l'Accueil (null si pas encore assez de jours). */
export function phrasePrevision(p) {
  if (!p.fiable) return null;
  return p.previsionCentimes >= 0
    ? `À ce rythme (${formatEuros(p.rythmeCentimes)}/jour) : environ ${formatEuros(p.previsionCentimes)} de plus pour l’épargne d’ici le ${formatDateCourte(p.dateSalaire)}`
    : `À ce rythme, tu dépasses d’environ ${formatEuros(-p.previsionCentimes)} avant le salaire du ${formatDateCourte(p.dateSalaire)}`;
}

export function feuillePrevision() {
  const p = previsionFinDeMois(etat, aujourdhui());
  const ligne = (l, c, cls = '') => h('div', { class: `ligne-cle ${cls}` }, h('span', {}, l), typeof c === 'number' ? mt(c) : h('span', {}, c));
  return ouvrirFeuille({
    titre: 'Prévision de fin de mois',
    contenu: h('div', { class: 'formulaire' },
      !p.fiable ? h('p', {}, `Il faut ${JOURS_MIN_FIABLE} jours après le salaire pour connaître ton rythme. Reviens dans quelques jours.`) : null,
      p.fiable ? h('p', { class: `prevision-verdict ${p.previsionCentimes < 0 ? 'negatif-texte' : 'vert-texte'}` }, p.previsionCentimes < 0 ? `Dépassement prévu : ${formatEuros(-p.previsionCentimes)}` : `Il devrait rester environ ${formatEuros(p.previsionCentimes)}`) : null,
      h('div', { class: 'liste-cles' },
        ligne('Ton rythme (dépenses du quotidien par jour)', p.rythmeCentimes),
        ligne('Jours écoulés depuis le salaire', String(p.joursEcoules)),
        ligne(`Jours restants (salaire vers le ${formatDateCourte(p.dateSalaire)})`, String(p.joursRestants)),
        ligne('Pour tenir, maximum par jour', p.partMaxCentimes, 'forte')),
      p.fiable ? h('p', { class: 'petit' }, p.previsionCentimes >= 0
        ? 'Comme chaque reste du jour part à l’épargne à 5 h, ce montant devrait finir sur tes épargnes, au fil des jours.'
        : `Pour revenir à zéro, il faudrait dépenser en moyenne ${formatEuros(p.partMaxCentimes)} par jour au lieu de ${formatEuros(p.rythmeCentimes)} : une journée sans dépense de temps en temps aide beaucoup.`) : null,
      h('p', { class: 'petit' }, 'Calcul : reste jusqu’au salaire − ton rythme × jours restants. Ton rythme ne compte que les jours déjà passés de ce mois, pas les prélèvements ni les abonnements (déjà dans les charges).')),
  });
}
