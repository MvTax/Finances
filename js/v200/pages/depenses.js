// depenses.js (v200) — l'onglet Dépenses, très simple :
//  - en haut, UNE phrase : « Depuis le salaire : X » (période budgétaire, d'un salaire au suivant) ;
//  - une liste par jour (« Aujourd'hui », « Hier », « mardi 10 ») : emoji de catégorie, nom court, montant ;
//    les charges du mois ont une petite étiquette « du mois » (jamais en rouge) ;
//    une dépense peut-être obligatoire pose sa question oui / non sur la ligne ;
//  - toucher une ligne ouvre la feuille de modification de l'app (pages/depenses.js, ouvrirDetail) ;
//  - la période en cours d'abord, « Voir le mois d'avant » pour remonter ; lignes ajoutées par lots (fluide) ;
//  - tout en bas, discret : « Ajouter une rentrée d'argent » (la feuille de saisie habituelle, sur « Entrée »).
// Les calculs sont dans js/v200/calculs/depenses.js (testés) ; ici, seulement l'affichage.

import { h, icone, estMasque, annoncer } from '../../ui/dom.js';
import { etat } from '../../store.js';
import { aujourdhui } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { nomCategorie } from '../../categories.js';
import { confirmerObligatoire } from '../../actions.js';
import { eur } from '../calculs/commun.js';
import { joursDepenses, depuisSalaire, periodePrecedente, premiereDate } from '../calculs/depenses.js';
import { emojiCategorie } from '../ui/tuiles.js';

export const titre = 'Dépenses';

/** Lignes ajoutées d'un coup (puis par lots, quand on approche du bas). */
const TAILLE_LOT = 40;
/** Combien de périodes sont dépliées (gardé quand la page se redessine après une modification). */
let nbPeriodes = 1;
let pourAuj = null;

const montant = (c) => (estMasque() ? '•••' : eur(c));
const ETIQUETTES = { 'du-mois': 'du mois', probable: 'du mois ?', envie: 'envie', entree: 'rentrée' };

function ligne(l) {
  const t = l.tx;
  const entree = l.nature === 'entree';
  const credit = t.sens === 'credit'; // rentrée d'argent ou remboursement d'un achat : « + », en vert
  const etiquette = ETIQUETTES[l.nature];
  const ouvrir = async () => { const { ouvrirDetail } = await import('../../pages/depenses.js'); ouvrirDetail(t); };
  const aria = `${l.nom}, ${nomCategorie(t.categorie)}, ${entree ? 'rentrée de ' : credit ? 'remboursement de ' : ''}${formatEuros(t.montantCentimes)}${etiquette && !entree ? `, ${etiquette}` : ''}. Modifier`;
  const bouton = h('button', { type: 'button', class: 'v2-dep-ligne', onclick: ouvrir, 'aria-label': aria },
    h('span', { class: 'v2-dep-emoji', 'aria-hidden': 'true' }, entree ? '💶' : emojiCategorie(t.categorie)),
    h('span', { class: 'v2-dep-nom' }, l.nom),
    etiquette && !entree ? h('span', { class: `v2-dep-etiquette v2-dep-etiquette-${l.nature}`, 'aria-hidden': 'true' }, etiquette) : null,
    h('span', { class: `v2-dep-montant${credit ? ' v2-dep-montant-entree' : ''}${l.nature === 'du-mois' ? ' v2-dep-montant-du-mois' : ''}`, 'aria-hidden': 'true' }, `${credit ? '+' : ''}${montant(t.montantCentimes)}`));
  if (l.nature !== 'probable') return h('li', { class: 'v2-dep-item' }, bouton);
  // Question oui / non, sous la ligne (pas dans le bouton : deux boutons ne s'emboîtent pas)
  const repondre = async (oui, e) => {
    e.currentTarget.closest('.v2-dep-question')?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    await confirmerObligatoire(t.id, oui);
    annoncer(oui ? 'Noté : une dépense du mois, pas comptée dans ta journée.' : 'Noté : une dépense du quotidien.');
  };
  return h('li', { class: 'v2-dep-item avec-question' }, bouton,
    h('div', { class: 'v2-dep-question', role: 'group', 'aria-label': `${l.nom} : c’est une dépense obligatoire du mois ?` },
      h('span', { class: 'v2-dep-question-texte' }, 'Charge du mois ?'),
      h('button', { type: 'button', class: 'v2-puce', 'aria-label': `Oui, ${l.nom} est une dépense du mois`, onclick: (e) => repondre(true, e) }, 'Oui'),
      h('button', { type: 'button', class: 'v2-puce', 'aria-label': `Non, ${l.nom} est une dépense du quotidien`, onclick: (e) => repondre(false, e) }, 'Non')));
}

function groupe(jour) {
  const id = `v2-jour-${jour.date}`;
  return h('section', { class: 'v2-dep-jour', 'aria-labelledby': id },
    h('h2', { class: 'v2-dep-jour-titre', id }, jour.titre.charAt(0).toUpperCase() + jour.titre.slice(1)),
    h('ul', { class: 'v2-dep-liste', role: 'list' }, jour.lignes.map(ligne)));
}

export function rendre(vue) {
  const auj = aujourdhui();
  if (pourAuj !== auj) { nbPeriodes = 1; pourAuj = auj; }
  const resume = depuisSalaire(etat, auj);
  const premier = premiereDate(etat);

  // Les périodes dépliées, de la plus récente à la plus ancienne
  const periodes = [resume.periode];
  while (periodes.length < nbPeriodes && premier && periodes[periodes.length - 1].debut > premier) periodes.push(periodePrecedente(etat, periodes[periodes.length - 1], auj));
  const fin = periodes[periodes.length - 1];
  const encore = !!premier && fin.debut > premier;
  const jours = periodes.flatMap((p, i) => joursDepenses(etat, p.debut, i === 0 ? '9999-12-31' : p.fin, auj));

  const r = resume;
  const dont = r.duMoisCentimes > 0 && r.duMoisCentimes < r.totalCentimes ? `dont ${montant(r.duMoisCentimes)} du mois` : r.duMoisCentimes > 0 ? 'seulement des charges du mois' : null;
  const entete = h('header', { class: 'v2-dep-tete' },
    h('h1', { class: 'v2-titre' }, 'Mes dépenses'),
    h('p', { class: 'v2-dep-resume' }, r.totalCentimes > 0
      ? [h('span', { class: 'v2-dep-resume-avant' }, 'Depuis le salaire', h('span', { class: 'sr' }, ' : ')), h('strong', { class: 'v2-dep-resume-montant' }, montant(r.totalCentimes)), dont ? h('span', { class: 'v2-dep-resume-dont' }, dont) : null]
      : h('span', { class: 'v2-dep-resume-avant' }, r.phrase)));

  const liste = h('div', { class: 'v2-dep-jours' });
  const pied = h('div', { class: 'v2-dep-pied' },
    encore ? h('button', { type: 'button', class: 'v2-dep-plus', onclick: () => { nbPeriodes += 1; rendre(vue); } }, icone('calendrier'), h('span', {}, 'Voir le mois d’avant')) : null,
    h('button', { type: 'button', class: 'v2-dep-rentree', onclick: async () => { const { ouvrirSaisie } = await import('../../pages/saisie.js'); ouvrirSaisie('clavier', { sens: 'credit' }); } },
      h('span', { 'aria-hidden': 'true' }, '💶'), h('span', {}, 'Ajouter une rentrée d’argent')));

  const vide = !jours.length ? h('div', { class: 'v2-dep-vide' },
    h('span', { class: 'v2-dep-vide-emoji', 'aria-hidden': 'true' }, '🌱'),
    h('p', {}, etat.transactions.length ? 'Rien de noté depuis le salaire.' : 'Aucune dépense pour l’instant.'),
    h('p', { class: 'v2-dep-vide-aide' }, 'Touche le + en bas pour noter ta première dépense.')) : null;

  vue.replaceChildren(h('div', { class: 'v2-dep' }, entete, vide, liste, pied));

  // Rendu par lots : une première fournée tout de suite, la suite quand on approche du bas
  let i = 0;
  const sentinelle = h('div', { class: 'v2-dep-sentinelle', 'aria-hidden': 'true' });
  let observateur = null;
  const lot = () => {
    const frag = document.createDocumentFragment();
    let n = 0;
    while (i < jours.length && n < TAILLE_LOT) { n += jours[i].lignes.length; frag.append(groupe(jours[i])); i += 1; }
    sentinelle.remove();
    liste.append(frag);
    if (i < jours.length) {
      liste.append(sentinelle);
      observateur ??= new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { observateur.unobserve(sentinelle); lot(); } }, { rootMargin: '900px' });
      observateur.observe(sentinelle);
    } else observateur?.disconnect();
  };
  lot();
}
