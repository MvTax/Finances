// aujourdhui.js (v200) — l'écran Aujourd'hui, volontairement très court :
//  1. une grosse bulle « Tu peux encore dépenser X aujourd'hui », avec le soleil-jauge qui se vide doucement ;
//  2. deux gros boutons « J'ai dépensé » / « Je me suis privé » ;
//  3. une seule phrase du jour (série, prévention, ou ce qui partira ce soir vers les pots).
// Dans l'en-tête, une petite pastille « Reste du mois » (vert / orange / rouge) qui mène au Résumé.
// Les calculs sont dans js/v200/calculs/jour.js (testés) ; ici, seulement l'affichage.

import { h, icone, estMasque } from '../../ui/dom.js';
import { etat, ecrireMeta } from '../../store.js';
import { aujourdhui, formatJourLong } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { eur } from '../calculs/commun.js';
import { bulleDuJour, phraseDuJour, texteBulle, resteDuMois } from '../calculs/jour.js';
import { soleil } from '../ui/soleil.js';

export const titre = 'Aujourd’hui';

const montant = (c) => (estMasque() ? '•••' : eur(c));

function bulle(b) {
  if (b.etat === 'vide') {
    return h('section', { class: 'v2-bulle vide', 'aria-labelledby': 'v2-bulle-t' },
      soleil({ part: 1, description: 'Soleil plein : ta journée commence' }),
      h('h2', { id: 'v2-bulle-t', class: 'v2-bulle-vide-titre' }, 'Note ta première dépense'),
      h('p', { class: 'v2-bulle-apres' }, 'Deux gestes suffisent, sans clavier.'));
  }
  const t = texteBulle(b, montant);
  const description = b.etat === 'ok'
    ? `Soleil rempli à ${Math.round(b.part * 100)} % : il reste ${formatEuros(b.montantCentimes)} sur ${formatEuros(b.parJourCentimes)} aujourd’hui`
    : 'Soleil vide : plus rien à dépenser aujourd’hui';
  // Mois dépassé : une phrase douce en titre, le montant exact dans la phrase d'en dessous (pas de gros chiffre rouge)
  const titre = t.titre
    ? h('h2', { id: 'v2-bulle-t', class: 'v2-bulle-vide-titre' }, t.titre)
    : h('h2', { id: 'v2-bulle-t', class: 'v2-bulle-texte' },
      h('span', { class: 'v2-bulle-avant' }, t.avant),
      h('span', { class: 'v2-bulle-montant' }, t.montant),
      t.apres ? h('span', { class: 'v2-bulle-apres' }, t.apres) : null);
  return h('section', { class: `v2-bulle ${b.etat}`, 'aria-labelledby': 'v2-bulle-t' },
    soleil({ part: b.part, description }),
    titre,
    t.suite ? h('p', { class: 'v2-bulle-apres' }, t.suite) : null);
}

/** La pastille « Reste du mois » : le montant jusqu'au salaire, en couleur ; la phrase dit la même chose aux lecteurs d'écran. */
function pastilleReste(r) {
  const masque = estMasque();
  const libelle = r.depasse ? 'Mois dépassé de' : 'Reste du mois';
  const valeur = masque ? '•••' : formatEuros(Math.abs(r.montantCentimes));
  const dit = masque
    ? `${r.depasse ? 'Mois dépassé' : 'Reste du mois : montant masqué'}. ${r.depasse ? '' : r.phrase}`
    : r.depasse ? r.phrase : `Reste du mois : ${valeur}. ${r.phrase}`;
  return h('a', { class: `v2-reste-mois ${r.couleur}`, href: '#resume', 'aria-label': `${dit.trim()} Voir le résumé.` },
    h('span', { class: 'v2-reste-mois-libelle', 'aria-hidden': 'true' }, libelle),
    h('span', { class: 'v2-reste-mois-montant', 'aria-hidden': 'true' }, valeur));
}

export function rendre(vue) {
  const auj = aujourdhui();
  const b = bulleDuJour(etat, auj);
  // La part du jour est figée pour la journée (comme l'Accueil d'origine)
  const snap = b.jauge.instantane; const j0 = etat.meta.jauge;
  if (b.etat !== 'vide' && (!j0 || j0.date !== snap.date || j0.mois !== snap.mois || j0.baseCentimes !== snap.baseCentimes)) ecrireMeta('jauge', snap);
  document.documentElement.classList.remove('mode-critique');

  const jour = formatJourLong(auj);
  const prenom = etat.profil.prenomAffichage;
  const reste = b.etat === 'vide' ? null : pastilleReste(resteDuMois(etat, auj, b.jauge));
  const entete = h('header', { class: 'v2-tete' },
    h('div', { class: 'v2-tete-texte' },
      h('h1', { class: 'v2-titre' }, prenom ? `Bonjour ${prenom}` : 'Aujourd’hui'),
      h('p', { class: 'v2-date' }, jour.charAt(0).toUpperCase() + jour.slice(1))),
    reste,
    h('a', { class: 'v2-rond', href: '#reglages', 'aria-label': 'Réglages' }, icone('curseurs')));

  const actions = h('div', { class: 'v2-actions' },
    h('button', { type: 'button', class: 'v2-action v2-action-depense', onclick: async () => { const { ouvrirSaisie } = await import('../../pages/saisie.js'); ouvrirSaisie(); } },
      h('span', { class: 'v2-action-icone', 'aria-hidden': 'true' }, icone('plus')), h('span', {}, 'J’ai dépensé')),
    h('button', { type: 'button', class: 'v2-action v2-action-privation', onclick: async () => { const { feuillePrivation } = await import('../../pages/privation.js'); feuillePrivation(); } },
      h('span', { class: 'v2-action-icone', 'aria-hidden': 'true' }, icone('tirelire')), h('span', {}, 'Je me suis privé')));

  const p = phraseDuJour(etat, auj);
  const phrase = p ? h('p', { class: `v2-phrase v2-phrase-${p.type}` }, h('span', { class: 'v2-phrase-emoji', 'aria-hidden': 'true' }, p.emoji), h('span', {}, p.phrase)) : null;

  vue.replaceChildren(h('div', { class: 'v2-jour' }, entete, bulle(b), actions, phrase));
}
