// composants.js — briques d'interface réutilisables.

import { h, icone, mt } from './dom.js';
import { categorie, natureTransaction, FAMILLES } from '../categories.js';
import { parseMontant, versChamp } from '../money.js';
import { libelleRelatif } from '../dates.js';

/** Section groupée façon iOS : titre posé sur le fond, contenu dans un bloc blanc. */
export function carte(titre, contenu, o = {}) {
  return h('section', { class: `carte ${o.classe || ''}`.trim(), 'aria-labelledby': o.id ? `${o.id}-t` : null },
    titre ? h('div', { class: 'carte-entete' }, h('h2', { class: 'carte-titre', id: o.id ? `${o.id}-t` : null }, titre), o.action || null) : null,
    h('div', { class: 'carte-corps' }, contenu));
}

/** Barre de progression : vert, orange au-delà de 80 %, rouge au-delà de 100 %. */
export function barre(valeur, max, o = {}) {
  const pct = max > 0 ? Math.round((valeur / max) * 100) : 0;
  const etat = o.etat || (pct > 100 ? 'rouge' : pct >= 80 ? 'orange' : 'vert');
  return h('div', { class: `barre barre-${etat}`, style: o.couleur ? { '--c': o.couleur } : null, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, Math.max(0, pct))), 'aria-label': o.label || `${pct} %` },
    h('div', { class: 'barre-remplie', style: { width: `${Math.min(100, Math.max(0, pct))}%` } }));
}

export function bandeau({ type = 'info', icone: ic = 'info', titre, texte, actions = [], fermer }) {
  return h('div', { class: `bandeau bandeau-${type}`, role: type === 'alerte' ? 'alert' : 'status' },
    h('div', { class: 'bandeau-icone' }, icone(ic)),
    h('div', { class: 'bandeau-texte' }, titre ? h('strong', {}, titre) : null, texte ? h('p', {}, texte) : null,
      actions.length ? h('div', { class: 'bandeau-actions' }, actions) : null),
    fermer ? h('button', { class: 'btn-icone bandeau-fermer', type: 'button', 'aria-label': 'Masquer', onclick: fermer }, icone('fermer')) : null);
}

export function bouton(libelle, onclick, o = {}) {
  return h('button', { class: `btn ${o.classe || 'btn-secondaire'}`, type: o.type || 'button', onclick, disabled: o.disabled || null, 'aria-label': o.aria || null },
    o.icone ? icone(o.icone) : null, libelle ? h('span', {}, libelle) : null);
}

export function etatVide(ic, titre, texte, action) {
  return h('div', { class: 'etat-vide' }, h('div', { class: 'etat-vide-icone' }, icone(ic)), h('h3', {}, titre), h('p', {}, texte), action || null);
}

export function squelette(n = 3) {
  return h('div', { class: 'squelettes', 'aria-busy': 'true', 'aria-label': 'Chargement' }, Array.from({ length: n }, () => h('div', { class: 'squelette' })));
}

export function interrupteur(libelle, coche, onChange, aide) {
  const id = `sw-${Math.random().toString(36).slice(2, 8)}`;
  const input = h('input', { type: 'checkbox', role: 'switch', id, class: 'interrupteur-input', checked: !!coche, onchange: (e) => onChange(e.target.checked) });
  return h('div', { class: 'ligne-reglage' },
    h('label', { for: id, class: 'ligne-reglage-libelle' }, libelle, aide ? h('small', {}, aide) : null),
    h('span', { class: 'interrupteur' }, input, h('span', { class: 'interrupteur-piste', 'aria-hidden': 'true' })));
}

/** Champ de saisie avec libellé (16 px minimum, jamais de zoom iOS). */
export function champ(libelle, input, aide) {
  if (!input.id) input.id = `ch-${Math.random().toString(36).slice(2, 8)}`;
  return h('div', { class: 'champ' }, h('label', { for: input.id }, libelle), input, aide ? h('small', { class: 'aide' }, aide) : null);
}

/** Champ montant : clavier décimal iOS (virgule), accepte « 4,89 », « 4.89 », « 1 234,56 ». */
export function champMontant({ valeur = null, onValeur, placeholder = '0,00', id, autofocus = false, label }) {
  const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', class: 'input input-montant', placeholder, id: id || null, value: valeur !== null && valeur !== undefined ? versChamp(valeur) : '', 'aria-label': label || null });
  input.addEventListener('input', () => {
    const c = parseMontant(input.value);
    input.setAttribute('aria-invalid', input.value && c === null ? 'true' : 'false');
    onValeur?.(c);
  });
  if (autofocus) setTimeout(() => input.focus(), 320);
  return input;
}

export function segment(options, valeur, onChange, label) {
  const groupe = h('div', { class: 'segment', role: 'radiogroup', 'aria-label': label || null });
  const rendre = (v) => {
    groupe.replaceChildren(...options.map(([val, lib]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(val === v), class: `segment-option ${val === v ? 'actif' : ''}`,
      onclick: () => { rendre(val); onChange(val); },
    }, lib)));
  };
  rendre(valeur);
  return groupe;
}

/** Pastilles de catégories. Avec { grouper: true }, elles sont rangées par famille sous un intitulé coloré. */
export function pastillesCategories(ids, choisie, onChoix, o = {}) {
  const conteneur = h('div', { class: o.grouper ? 'pastilles-familles' : 'pastilles', role: 'radiogroup', 'aria-label': 'Catégorie' });
  const pastille = (id, sel) => {
    const c = categorie(id);
    return h('button', { type: 'button', role: 'radio', 'aria-checked': String(id === sel), class: `pastille ${id === sel ? 'active' : ''}`, style: { '--c': c.couleur }, onclick: () => { rendre(id); onChoix(id); } },
      icone(c.icone), h('span', {}, c.nom));
  };
  const rendre = (sel) => {
    if (!o.grouper) { conteneur.replaceChildren(...ids.map((id) => pastille(id, sel))); return; }
    conteneur.replaceChildren(...FAMILLES.map((f) => {
      const membres = ids.filter((id) => categorie(id).famille === f.id);
      if (!membres.length) return null;
      return h('div', { class: 'famille-pastilles', style: { '--c': f.couleur } },
        h('p', { class: 'famille-intitule' }, h('span', { class: 'point-famille', 'aria-hidden': 'true' }), f.nom),
        h('div', { class: 'pastilles' }, membres.map((id) => pastille(id, sel))));
    }).filter(Boolean));
  };
  rendre(choisie);
  return conteneur;
}

export function puceCategorie(id) {
  const c = categorie(id);
  return h('span', { class: 'puce-cat', style: { '--c': c.couleur }, 'aria-hidden': 'true' }, icone(c.icone));
}

/** Ligne de transaction : marchand et catégorie à gauche, montant (et date si demandée) à droite. */
/** Compte à signaler par une petite étiquette dans les listes (Revolut). Réglé par la page qui affiche la liste. */
let compteEtiquete = null;
export function definirCompteEtiquete(id, nom = 'Revolut') { compteEtiquete = id ? { id, nom } : null; }

export function ligneTransaction(tx, onClick, o = {}) {
  const n = natureTransaction(tx);
  const neutre = ['interne', 'epargne', 'ajustement', 'pret', 'deblocage'].includes(n);
  const signe = tx.sens === 'credit' ? '+' : '−';
  const c = categorie(tx.categorie);
  return h('button', { type: 'button', class: `ligne-tx ${neutre ? 'neutre' : ''} ${tx.sens}`, onclick: () => onClick?.(tx), dataset: { id: tx.id } },
    puceCategorie(tx.categorie),
    h('span', { class: 'ligne-tx-texte' },
      h('span', { class: 'ligne-tx-titre' }, tx.libelle || tx.marchand || 'Sans libellé'),
      h('span', { class: 'ligne-tx-sous' }, tx.aQualifier || o.aVerifier ? h('span', { class: 'a-qualifier' }, 'À vérifier') : null,
        compteEtiquete && tx.compteId === compteEtiquete.id ? h('span', { class: 'etiquette-compte' }, compteEtiquete.nom) : null, c.nom)),
    h('span', { class: 'ligne-tx-droite' },
      h('span', { class: 'ligne-tx-montant' }, h('span', { class: 'signe', 'aria-hidden': 'true' }, signe), mt(tx.montantCentimes), h('span', { class: 'sr' }, tx.sens === 'credit' ? ' en entrée' : ' en sortie')),
      o.avecDate ? h('span', { class: 'ligne-tx-date' }, libelleRelatif(tx.date)) : null));
}

export function statistique(libelle, valeur, o = {}) {
  return h('div', { class: `stat ${o.classe || ''}`.trim() }, h('span', { class: 'stat-libelle' }, libelle), h('span', { class: 'stat-valeur' }, valeur), o.detail ? h('span', { class: 'stat-detail' }, o.detail) : null);
}

export function onglets(liste, actif, onChange) {
  const nav = h('div', { class: 'onglets-internes', role: 'tablist' });
  const rendre = (v) => nav.replaceChildren(...liste.map(([id, lib]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === v), class: `onglet-interne ${id === v ? 'actif' : ''}`, onclick: () => { rendre(id); onChange(id); } }, lib)));
  rendre(actif);
  return nav;
}

export function selectionner(options, valeur, onChange, o = {}) {
  const s = h('select', { class: 'input', id: o.id || null, 'aria-label': o.aria || null, onchange: (e) => onChange(e.target.value) },
    options.map(([v, l]) => h('option', { value: v, selected: v === valeur ? true : null }, l)));
  return s;
}
