// confirmation.js (v200) — après une dépense ou une privation : une petite carte sobre et joyeuse.
// Une pièce tombe dans le pot, « C'est noté ! », une seule ligne utile, la flamme du jour si elle s'allume, et « Annuler »
// (qui supprime vraiment). Elle se ferme seule après ~6 s, et dès qu'on change de page.
// Dépense obligatoire reconnue (loyer, facture, abonnement) : « Charge du mois, pas comptée dans ta journée ».
// Reconnue « probable » : UNE question oui / non, la réponse est enregistrée (confirmerObligatoire).

import { h, icone, estMasque } from '../../ui/dom.js';
import { etat } from '../../store.js';
import { estDepenseQuotidienne } from '../../calculs.js';
import { aujourdhui, ajouterJours, formatDateCourte } from '../../dates.js';
import { nomCategorie } from '../../categories.js';
import { arrondiDeLaDepense } from '../calculs/explications.js';
import { confirmerObligatoire } from '../../actions.js';
import { serieJours } from '../../jeu.js';
import { eur } from '../calculs/commun.js';
import { bulleDuJour, noteAujourdhui, ligneDuJour, ligneCharge } from '../calculs/jour.js';

export const DUREE = 6000;
const DUREE_QUESTION = 10000;
let courante = null;
const montant = (c) => (estMasque() ? '•••' : eur(c));

/** Le pot et la pièce qui tombe dedans (dessin, sans texte). */
function pot(classe = '') {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64'); svg.setAttribute('class', `v2-pot ${classe}`.trim()); svg.setAttribute('aria-hidden', 'true');
  // contenu fixe, sans aucune donnée
  svg.innerHTML = '<g class="v2-pot-piece"><circle cx="32" cy="14" r="9"/><circle cx="32" cy="14" r="5.5" class="v2-pot-piece-creux"/></g>'
    + '<rect x="14" y="24" width="36" height="7" rx="3.5" class="v2-pot-couvercle"/>'
    + '<path d="M17 31h30v19a8 8 0 0 1-8 8H25a8 8 0 0 1-8-8z" class="v2-pot-corps"/>'
    + '<rect x="27" y="22.5" width="10" height="3" rx="1.5" class="v2-pot-fente"/>';
  return svg;
}

/**
 * La carte. lignes : éléments déjà construits. question : { texte, oui, non } facultative.
 * @returns {{ el, fermer }}
 */
function carte({ titre, sous, lignes = [], flamme = null, annuler = null, question = null, classe = '' }) {
  courante?.fermer();
  let minuteur = null;
  const fermer = () => {
    clearTimeout(minuteur); window.removeEventListener('hashchange', fermer);
    el.classList.remove('visible'); setTimeout(() => el.remove(), 250);
    if (courante?.el === el) courante = null;
  };
  const zoneLignes = h('div', { class: 'v2-conf-lignes' }, lignes);
  const zoneQuestion = question ? h('div', { class: 'v2-conf-question' },
    h('p', {}, question.texte),
    h('div', { class: 'v2-conf-oui-non' },
      h('button', { type: 'button', class: 'v2-puce', onclick: async () => { zoneQuestion.remove(); zoneLignes.replaceChildren(...await question.repondre(true)); armer(3500); } }, 'Oui'),
      h('button', { type: 'button', class: 'v2-puce', onclick: async () => { zoneQuestion.remove(); zoneLignes.replaceChildren(...await question.repondre(false)); armer(3500); } }, 'Non'))) : null;
  const el = h('div', { class: `confirmation v2-conf ${classe}`.trim(), role: 'status' },
    h('div', { class: 'v2-conf-tete' },
      pot(),
      h('div', { class: 'v2-conf-titres' }, h('p', { class: 'v2-conf-titre' }, titre), sous ? h('p', { class: 'v2-conf-sous' }, sous) : null),
      h('button', { type: 'button', class: 'v2-conf-fermer', 'aria-label': 'Fermer', onclick: () => fermer() }, icone('fermer'))),
    zoneLignes,
    zoneQuestion,
    flamme || annuler ? h('div', { class: 'v2-conf-pied' },
      flamme ? h('span', { class: 'v2-flamme' }, h('span', { 'aria-hidden': 'true' }, '🔥'), flamme) : h('span'),
      annuler ? h('button', { type: 'button', class: 'v2-conf-annuler', onclick: async () => { fermer(); await annuler(); } }, 'Annuler') : null) : null);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  function armer(ms) { clearTimeout(minuteur); minuteur = setTimeout(fermer, ms); }
  armer(question ? DUREE_QUESTION : DUREE);
  window.addEventListener('hashchange', fermer);
  // Le doigt sur la carte la retient ; elle repart quand on la lâche
  el.addEventListener('pointerdown', () => clearTimeout(minuteur));
  el.addEventListener('pointerup', () => armer(3000));
  courante = { el, fermer };
  return courante;
}

const ligne = (texte, classe = '') => h('p', { class: `v2-conf-ligne ${classe}`.trim() }, texte);

/** « Il te reste 15 € aujourd'hui. » (ou le dépassement) */
function ligneJour(auj) {
  const l = ligneDuJour(bulleDuJour(etat, auj), montant);
  return ligne(l.texte, l.ton);
}

/** La flamme du jour vient de s'allumer (première dépense notée ou première privation aujourd'hui). */
function flammeAllumee(auj, etaitNote) {
  if (etaitNote || !noteAujourdhui(etat, auj)) return null;
  const n = serieJours(etat, auj);
  return n > 1 ? `+1 · ${n} jours de suite` : '+1 · ta première flamme';
}

/** « Charge du mois… » : ce que la dépense obligatoire change vraiment pour la journée (voir ligneCharge). */
const ligneChargeDe = (tx, auj) => ligne(ligneCharge(etat, tx.id, auj, montant).texte);

/**
 * Après une dépense (enregistrée avec ajouterTransaction, qui a déjà reconnu une éventuelle dépense obligatoire).
 * @param tx la dépense enregistrée ; o.annuler : supprime la dépense ; o.etaitNote : une flamme brûlait déjà aujourd'hui
 */
export function confirmerDepense(tx, { annuler = null, etaitNote = null } = {}) {
  const auj = aujourdhui();
  const avant = etaitNote ?? noteAujourdhui({ ...etat, transactions: (etat.transactions || []).filter((t) => t.id !== tx.id) }, auj);
  const depense = tx.sens === 'debit';
  const arr = depense ? arrondiDeLaDepense(etat, tx, auj).centimes : 0;
  const quand = tx.date === auj ? '' : tx.date === ajouterJours(auj, -1) ? ' · hier' : ` · ${formatDateCourte(tx.date)}`;
  const sous = `${montant(tx.montantCentimes)} · ${nomCategorie(tx.categorie)}${quand}`;
  const lignesQuotidiennes = () => [
    tx.date === auj ? ligneJour(auj) : ligne('C’est noté pour ce jour-là : ta journée d’aujourd’hui ne change pas.'),
    arr ? ligne(`🪙 ${montant(arr)} d’arrondi part à ton épargne.`, 'discret') : null,
  ].filter(Boolean);
  let lignes; let question = null;
  if (tx.obligatoireProbable) {
    lignes = [];
    question = {
      texte: 'C’est une dépense obligatoire du mois ?',
      repondre: async (oui) => { await confirmerObligatoire(tx.id, oui); return oui ? [ligneChargeDe(tx, auj)] : lignesQuotidiennes(); },
    };
  } else if (depense && (tx.chargeFixeId || tx.horsPartDuJour || !estDepenseQuotidienne(tx))) lignes = [ligneChargeDe(tx, auj)];
  else lignes = lignesQuotidiennes();
  return carte({ titre: 'C’est noté !', sous, lignes, question, annuler, flamme: depense ? flammeAllumee(auj, avant) : null });
}

/**
 * Après « Je me suis privé ».
 * @param p la privation enregistrée (ajouterPrivation) ; o.annuler : la retire ; o.etaitNote : une flamme brûlait déjà
 */
export function confirmerPrivation(p, { annuler = null, etaitNote = false } = {}) {
  const auj = aujourdhui();
  return carte({
    titre: 'Bravo !', sous: `${montant(p.montantCentimes)} mis de côté · ${p.libelle}`, classe: 'v2-conf-privation',
    lignes: [ligne('Le montant part à ton épargne.'), p.date === auj ? ligneJour(auj) : null].filter(Boolean),
    annuler, flamme: flammeAllumee(auj, etaitNote),
  });
}

/**
 * Après « Récupérer mes paiements » Apple Pay (totaux d'enregistrerApplePay) : combien sont ajoutés,
 * ce qui attend encore ta réponse, et ta journée si des paiements d'aujourd'hui ont été ajoutés.
 */
export function confirmerApplePay(totaux, { sous, lignes = [] }) {
  const auj = aujourdhui();
  const jour = totaux.ajoutees ? ligneJour(auj) : null;
  return carte({ titre: totaux.ajoutees || totaux.fusionnees ? 'C’est noté !' : 'C’est à jour', sous, lignes: [...lignes.map((l) => ligne(l, 'discret')), jour].filter(Boolean) });
}
