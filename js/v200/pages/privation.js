// privation.js (v200) — « Je me suis privé » sans clavier : toucher ce à quoi tu as renoncé (le montant part de ton prix
// habituel), ajuster aux molettes, glisser pour mettre de côté. Enregistré par la même fonction que l'app d'origine (ajouterPrivation).

import { h, vibrer } from '../../ui/dom.js';
import { ouvrirFeuille } from '../../ui/sheet.js';
import { etat, supprimerObjet } from '../../store.js';
import { aujourdhui } from '../../dates.js';
import { ajouterPrivation } from '../../actions.js';
import { montantsHabituels } from '../../privations.js';
import { noteAujourdhui } from '../calculs/jour.js';
import { eur } from '../calculs/commun.js';
import { molettes } from '../ui/molette.js';
import { glisserValider } from '../ui/glisser-valider.js';
import { confirmerPrivation } from '../ui/confirmation.js';
import { ajouterUnMot } from './saisie.js';

/** Nom court et emoji de chaque renoncement (privations.js, RENONCEMENTS). */
const COURT = {
  'restauration-rapide': ['🍔', 'Fast-food'], livraison: ['🛵', 'Livraison'], restaurants: ['🍽️', 'Resto'],
  cafe: ['☕', 'Café'], vtc: ['🚕', 'VTC'], autre: ['✨', 'Autre chose'],
};

export function feuillePrivationV200() {
  const corps = h('div', { class: 'v2-saisie' });
  const f = ouvrirFeuille({ titre: 'Je me suis privé', contenu: corps, plein: true });
  f.element.classList.add('v2-feuille');
  const options = [...montantsHabituels(etat), { id: 'autre', categorie: 'autres', libelle: 'Autre chose', montantCentimes: 0 }];

  const etapeChoix = () => {
    const grille = h('div', { class: 'v2-tuiles', role: 'group', 'aria-label': 'À quoi as-tu renoncé ?' },
      options.map((o) => h('button', { type: 'button', class: 'v2-tuile', 'data-renoncement': o.id, onclick: () => etapeMontant(o) },
        h('span', { class: 'v2-tuile-emoji', 'aria-hidden': 'true' }, COURT[o.id]?.[0] || '✨'),
        h('span', { class: 'v2-tuile-nom' }, COURT[o.id]?.[1] || o.libelle),
        o.montantCentimes ? h('small', { class: 'v2-tuile-prix' }, eur(o.montantCentimes)) : null)));
    corps.replaceChildren(h('div', { class: 'v2-tuiles-zone' }, h('h3', { class: 'v2-question' }, 'À quoi as-tu renoncé ?'), grille));
  };

  const etapeMontant = (o) => {
    let mot = '';
    let glisser = null;
    const roues = molettes({ valeur: o.montantCentimes || 0, onChange: (c) => glisser.activer(c > 0, 'Choisis un montant') });
    glisser = glisserValider({ texte: 'Glisse pour épargner', libelle: () => `Mettre ${eur(roues.valeur())} de côté`, onValider: () => enregistrer() });
    glisser.activer((o.montantCentimes || 0) > 0, 'Choisis un montant');
    const [emoji, nom] = COURT[o.id] || ['✨', o.libelle];
    async function enregistrer() {
      const montant = roues.valeur();
      if (!(montant > 0)) return;
      const etaitNote = noteAujourdhui(etat, aujourdhui());
      const libelle = o.id === 'autre' ? (mot.trim() || 'Dépense évitée') : (mot.trim() ? `${o.libelle} (${mot.trim()})` : o.libelle);
      const p = await ajouterPrivation({ categorie: o.categorie, libelle, montantCentimes: montant });
      vibrer(20);
      f.fermer('ajout');
      confirmerPrivation(p, { annuler: () => supprimerObjet('privations', p.id), etaitNote });
    }
    corps.replaceChildren(h('div', { class: 'v2-etape-montant' },
      h('button', { type: 'button', class: 'v2-choix', 'aria-label': `${nom} : changer`, onclick: () => etapeChoix() },
        h('span', { class: 'v2-choix-emoji', 'aria-hidden': 'true' }, emoji), h('span', { class: 'v2-choix-nom' }, nom), h('span', { class: 'v2-choix-changer', 'aria-hidden': 'true' }, 'changer')),
      h('div', { class: 'v2-montant-carte' }, roues.element, h('p', { class: 'v2-montant-note' }, o.habituel ? 'Ton prix habituel' : o.montantCentimes ? 'Un prix courant : ajuste-le' : 'Combien as-tu gardé ?')),
      ajouterUnMot((m) => { mot = m; }),
      glisser.element));
    corps.querySelector('.v2-roue-euros .v2-roue-fenetre')?.focus({ preventScroll: true });
  };

  etapeChoix();
  return f;
}
