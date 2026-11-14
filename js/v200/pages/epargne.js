// epargne.js (v200) — l'onglet Épargne en trois pots illustrés qui se remplissent : Sécurité, Prêt, Envie.
//  - toucher un pot ouvre une petite feuille : 2 ou 3 phrases (combien, ce qui manque, à quel rythme) ;
//  - « À virer : X » quand un virement vers l'épargne est à faire : il ouvre le flux habituel (coffres.js, feuilleVirement) ;
//  - une phrase sur les arrondis du mois.
// Pas de tableau. Les calculs sont dans js/v200/calculs/pots.js (testés) ; ici, seulement l'affichage.
// Les anciens sous-écrans (#epargne/plan, #epargne/dettes…) restent ceux de l'app d'origine.

import { h, icone, estMasque } from '../../ui/dom.js';
import { ouvrirFeuille } from '../../ui/sheet.js';
import { etat } from '../../store.js';
import { aujourdhui } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { eur } from '../calculs/commun.js';
import { potsEpargne } from '../calculs/pots.js';
import { pot as dessinPot } from '../ui/dessins.js';

export const titre = 'Épargne';

const montant = (c) => (estMasque() ? '•••' : eur(c));

function feuillePot(p) {
  const plus = async () => {
    f.fermer();
    if (p.poche) { const { ficheEpargne } = await import('../../pages/fiche-epargne.js'); ficheEpargne(p.poche); return; }
    const m = await import('../../pages/envies.js');
    if (p.envie) m.feuilleEnvie(p.envie.id); else m.feuilleEditerEnvie();
  };
  const f = ouvrirFeuille({
    titre: `Pot ${p.nom}`,
    contenu: h('div', { class: 'v2-pot-fiche' },
      h('div', { class: `v2-pot-fiche-dessin v2-pot-${p.id}` }, dessinPot(p.id, remplissage(p)),
        h('span', { class: 'v2-pot-fiche-montant' }, montant(p.soldeCentimes)),
        p.cibleCentimes ? h('span', { class: 'v2-pot-fiche-cible' }, `sur ${montant(p.cibleCentimes)}`) : null),
      h('div', { class: 'v2-pot-fiche-phrases' }, p.phrases.map((x) => h('p', {}, x))),
      h('button', { type: 'button', class: 'v2-lien-doux', onclick: plus }, h('span', {}, p.poche || p.envie ? 'Ajouter, retirer, tout voir' : 'Choisir une envie'), icone('suivant'))),
  });
  f.element.classList.add('v2-feuille');
}

/** Remplissage du dessin (0..1), au plus juste (le pourcentage affiché, lui, est arrondi vers le bas). */
const remplissage = (p) => (p.cibleCentimes ? Math.min(1, p.soldeCentimes / p.cibleCentimes) : p.soldeCentimes > 0 ? 1 : 0);

function carte(p) {
  const description = `Pot ${p.nom} : ${formatEuros(p.soldeCentimes)}${p.cibleCentimes ? ` sur ${formatEuros(p.cibleCentimes)}, ${p.pourcent} %` : ''}${p.envie ? `, pour « ${p.envie.nom} »` : ''}. Voir le détail`;
  return h('li', { class: 'v2-pot-item' },
    h('button', { type: 'button', class: `v2-pot-carte v2-pot-${p.id}${p.complet ? ' complet' : ''}`, 'aria-label': estMasque() ? `Pot ${p.nom}. Voir le détail` : description, onclick: () => feuillePot(p) },
      dessinPot(p.id, remplissage(p)),
      h('span', { class: 'v2-pot-nom', 'aria-hidden': 'true' }, p.nom),
      h('span', { class: 'v2-pot-montant', 'aria-hidden': 'true' }, montant(p.soldeCentimes)),
      h('span', { class: 'v2-pot-sous', 'aria-hidden': 'true' }, p.complet ? 'plein 🎉' : p.cibleCentimes ? (p.pourcent >= 1 ? `${p.pourcent} % de ${montant(p.cibleCentimes)}` : `objectif ${montant(p.cibleCentimes)}`) : p.envie ? '' : 'à choisir'),
      p.envie ? h('span', { class: 'v2-pot-envie-nom', 'aria-hidden': 'true' }, p.envie.nom) : null));
}

export async function rendre(vue, params = []) {
  // Sous-écrans de l'app d'origine (Mon plan, Mes dettes, simulateur) : inchangés
  if (params[0]) { const m = await import('../../pages/epargne.js'); m.rendre(vue, params); return; }
  const auj = aujourdhui();
  const { pots, virement: v, arrondis } = potsEpargne(etat, auj);
  const total = pots.reduce((s, p) => s + (p.id === 'envie' ? 0 : p.soldeCentimes), 0);

  const entete = h('header', { class: 'v2-ep-tete' },
    h('h1', { class: 'v2-titre' }, 'Mon épargne'),
    total > 0 ? h('p', { class: 'v2-date' }, `${montant(total)} de côté dans tes pots`) : h('p', { class: 'v2-date' }, 'Tes pots se remplissent à chaque virement.'));

  const virer = v.aFaire
    ? h('button', { type: 'button', class: 'v2-virer', onclick: async () => { const { feuilleVirement } = await import('../../pages/coffres.js'); feuilleVirement(v.details); },
      'aria-label': `À virer : ${formatEuros(v.montantCentimes)}. ${v.phrase} Ouvrir le virement` },
      h('span', { class: 'v2-virer-icone', 'aria-hidden': 'true' }, '🪙'),
      h('span', { class: 'v2-virer-textes', 'aria-hidden': 'true' },
        h('span', { class: 'v2-virer-titre' }, `À virer : ${montant(v.montantCentimes)}`),
        h('span', { class: 'v2-virer-quand' }, v.phrase)),
      icone('suivant'))
    : h('p', { class: 'v2-phrase' }, h('span', { class: 'v2-phrase-emoji', 'aria-hidden': 'true' }, '✨'), h('span', {}, v.phrase.replace(/^Tout est viré ✨ /, 'Tout est viré. ')));

  vue.replaceChildren(h('div', { class: 'v2-ep' },
    entete,
    h('ul', { class: 'v2-pots', role: 'list' }, pots.map(carte)),
    virer,
    h('p', { class: 'v2-phrase v2-phrase-arrondis' }, h('span', { class: 'v2-phrase-emoji', 'aria-hidden': 'true' }, '🪙'), h('span', {}, estMasque() && arrondis.centimes ? 'Tes arrondis ce mois-ci : •••' : arrondis.phrase))));
}
