// saisie.js (v200) — « J'ai dépensé » sans clavier, en une feuille plein écran :
//  1. toucher une tuile (tes catégories favorites, ou « Autre ») ;
//  2. le montant part de ton montant habituel (montantDepart), 4 puces de tes montants fréquents, molettes pour ajuster ;
//  3. « Aujourd'hui » ou « Hier » ; « Ajouter un mot » facultatif (le seul endroit avec un clavier, replié) ;
//  4. glisser pour valider : la dépense est enregistrée par la même fonction que la saisie d'origine (ajouterTransaction).
// Objectif : 7,30 € de restauration rapide notés en deux secondes.

import { h, vibrer, annoncer } from '../../ui/dom.js';
import { ouvrirFeuille } from '../../ui/sheet.js';
import { etat } from '../../store.js';
import { aujourdhui, ajouterJours } from '../../dates.js';
import { nomCategorie } from '../../categories.js';
import { nouvelleTransaction, ajouterTransaction, supprimerTransaction } from '../../actions.js';
import { categoriesFavorites, montantsRapides, montantDepart } from '../calculs/habitudes.js';
import { noteAujourdhui } from '../calculs/jour.js';
import { eur } from '../calculs/commun.js';
import { tuilesCategories, emojiCategorie } from '../ui/tuiles.js';
import { molettes, montantParle } from '../ui/molette.js';
import { glisserValider } from '../ui/glisser-valider.js';
import { confirmerDepense } from '../ui/confirmation.js';

/** Puces à choix unique (rôle radio). */
export function puces(options, valeur, onChoix, etiquette) {
  const groupe = h('div', { class: 'v2-puces', role: 'radiogroup', 'aria-label': etiquette });
  const dessiner = (v) => groupe.replaceChildren(...options.map(([val, texte, aria]) => h('button', {
    type: 'button', role: 'radio', class: `v2-puce ${val === v ? 'actif' : ''}`, 'aria-checked': String(val === v), 'aria-label': aria || null,
    onclick: () => { dessiner(val); onChoix(val); },
  }, texte)));
  dessiner(valeur);
  return { element: groupe, dessiner };
}

/** « Ajouter un mot » : replié, s'ouvre sur un petit champ (le seul clavier de la saisie). */
export function ajouterUnMot(onMot, { placeholder = 'Un mot pour t’en souvenir' } = {}) {
  const champ = h('input', { class: 'input v2-mot-champ', type: 'text', maxlength: '40', autocomplete: 'off', enterkeyhint: 'done', placeholder, 'aria-label': 'Un mot (facultatif)',
    oninput: (e) => onMot(e.target.value), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } });
  const zone = h('div', { class: 'v2-mot' });
  const bouton = h('button', { type: 'button', class: 'v2-mot-bouton', 'aria-expanded': 'false', onclick: () => {
    zone.replaceChildren(champ); bouton.setAttribute('aria-expanded', 'true'); champ.focus();
  } }, '+ Ajouter un mot');
  zone.append(bouton);
  return zone;
}

export function ouvrirSaisieV200() {
  const auj = aujourdhui();
  const corps = h('div', { class: 'v2-saisie' });
  const f = ouvrirFeuille({ titre: 'J’ai dépensé', contenu: corps, plein: true });
  f.element.classList.add('v2-feuille');

  const etapeTuiles = () => {
    corps.replaceChildren(tuilesCategories({ favorites: categoriesFavorites(etat, auj), onChoix: (id) => etapeMontant(id) }));
  };

  const etapeMontant = (categorie) => {
    let date = auj; let mot = '';
    const depart = montantDepart(etat, categorie, auj) ?? 0;
    const rapides = montantsRapides(etat, categorie, auj);
    let pucesMontants = null; let glisser = null;
    const majValider = (c) => glisser.activer(c > 0, 'Choisis un montant');
    const roues = molettes({ valeur: depart, onChange: (c) => { majValider(c); pucesMontants?.dessiner(c); } });
    glisser = glisserValider({ texte: 'Glisse pour valider', libelle: () => `Valider : ${eur(roues.valeur())} en ${nomCategorie(categorie)}`, onValider: () => enregistrer() });
    pucesMontants = rapides.length ? puces(rapides.map((r) => [r.montantCentimes, eur(r.montantCentimes), `${montantParle(r.montantCentimes)}`]), depart,
      (c) => { roues.definir(c); annoncer(montantParle(c)); }, 'Tes montants habituels') : null;
    const pucesDate = puces([[auj, 'Aujourd’hui'], [ajouterJours(auj, -1), 'Hier']], date, (d) => { date = d; }, 'Quand ?');

    const choix = h('button', { type: 'button', class: 'v2-choix', 'aria-label': `${nomCategorie(categorie)} : changer de catégorie`, onclick: () => etapeTuiles() },
      h('span', { class: 'v2-choix-emoji', 'aria-hidden': 'true' }, emojiCategorie(categorie)),
      h('span', { class: 'v2-choix-nom' }, nomCategorie(categorie)),
      h('span', { class: 'v2-choix-changer', 'aria-hidden': 'true' }, 'changer'));

    async function enregistrer() {
      const montant = roues.valeur();
      if (!(montant > 0)) return;
      const etaitNote = noteAujourdhui(etat, auj);
      const tx = nouvelleTransaction({ sens: 'debit', montantCentimes: montant, libelle: mot.trim() || nomCategorie(categorie), categorie, date, source: 'manuel' });
      await ajouterTransaction(tx);
      vibrer(15);
      f.fermer('ajout');
      confirmerDepense(tx, { annuler: () => supprimerTransaction(tx), etaitNote });
    }

    majValider(depart);
    corps.replaceChildren(h('div', { class: 'v2-etape-montant' },
      choix,
      h('div', { class: 'v2-montant-carte' }, roues.element, pucesMontants?.element || null),
      pucesDate.element,
      ajouterUnMot((m) => { mot = m; }),
      glisser.element));
    corps.querySelector('.v2-roue-euros .v2-roue-fenetre')?.focus({ preventScroll: true });
  };

  etapeTuiles();
  return f;
}
