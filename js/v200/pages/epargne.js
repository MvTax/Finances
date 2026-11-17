// epargne.js (v200) — l'onglet Épargne en trois pots illustrés qui se remplissent : Sécurité, Prêt, Envie.
//  - toucher un pot ouvre une petite feuille : 2 ou 3 phrases (combien, ce qui manque, à quel rythme) ;
//  - « À virer : X » quand un virement vers l'épargne est à faire : il ouvre le flux habituel (coffres.js, feuilleVirement) ;
//  - « Recalculer l'épargne » : refait les restes du jour pas encore virés, redessine, et dit ce qui a changé ;
//    à côté, « Détail » ouvre l'historique de la cagnotte (arrondis, restes, repas, privations) ;
//  - une phrase sur les arrondis du mois.
// Pas de tableau. Les calculs sont dans js/v200/calculs/pots.js (testés) ; ici, seulement l'affichage.
// Les anciens sous-écrans (#epargne/plan, #epargne/dettes…) restent ceux de l'app d'origine.

import { h, icone, estMasque } from '../../ui/dom.js';
import { ouvrirFeuille } from '../../ui/sheet.js';
import { etat } from '../../store.js';
import { aujourdhui } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { eur } from '../calculs/commun.js';
import { potsEpargne, phraseRecalcul } from '../calculs/pots.js';
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

// Message du dernier recalcul : gardé ici pour survivre au redessin de la page, puis oublié.
let messageRecalcul = null;
let recalculEnCours = false;

async function recalculer(vue, bouton) {
  if (recalculEnCours) return;
  recalculEnCours = true;
  bouton.disabled = true;
  bouton.setAttribute('aria-busy', 'true');
  let msg;
  try {
    const avant = potsEpargne(etat, aujourdhui()).virement.montantCentimes;
    const { cloturerJoursPasses } = await import('../../actions.js');
    await cloturerJoursPasses();
    const apres = potsEpargne(etat, aujourdhui()).virement.montantCentimes;
    msg = phraseRecalcul(avant, apres, { masque: estMasque() });
  } catch (e) {
    console.warn('Recalcul de l’épargne', e?.message);
    msg = 'Le calcul n’a pas marché. Réessaie dans un instant.';
  }
  messageRecalcul = msg;
  try { await rendre(vue); } finally { recalculEnCours = false; }
}

function blocRecalcul(vue) {
  const message = h('p', { class: 'v2-recalcul-message', role: 'status', 'aria-live': 'polite' });
  const bouton = h('button', { type: 'button', class: 'v2-recalcul-bouton', onclick: () => recalculer(vue, bouton) },
    h('span', { class: 'v2-recalcul-icone', 'aria-hidden': 'true' }, icone('boucle')), h('span', {}, 'Recalculer l’épargne'));
  const detail = h('button', { type: 'button', class: 'v2-recalcul-detail', 'aria-label': 'Voir le détail des arrondis et des privations',
    onclick: async () => { const { feuilleHistorique } = await import('../../pages/coffres.js'); feuilleHistorique()?.element?.classList.add('v2-feuille'); } },
    h('span', { class: 'v2-recalcul-detail-pastille', 'aria-hidden': 'true' }, icone('liste')));
  const bloc = h('div', { class: 'v2-recalcul' }, h('div', { class: 'v2-recalcul-ligne' }, bouton, detail), message);
  if (messageRecalcul) {
    const texte = messageRecalcul;
    messageRecalcul = null;
    // Écrit un peu après l'affichage : la zone existe déjà, le lecteur d'écran l'annonce
    setTimeout(() => { message.textContent = texte; }, 60);
    setTimeout(() => bouton.focus({ preventScroll: true }), 0);
  }
  return bloc;
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
    blocRecalcul(vue),
    h('p', { class: 'v2-phrase v2-phrase-arrondis' }, h('span', { class: 'v2-phrase-emoji', 'aria-hidden': 'true' }, '🪙'), h('span', {}, estMasque() && arrondis.centimes ? 'Tes arrondis ce mois-ci : •••' : arrondis.phrase))));
}
