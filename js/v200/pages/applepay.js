// applepay.js (v200) — « Récupérer mes paiements » Apple Pay.
// Un Raccourci iOS ajoute une ligne par paiement dans un fichier d'iCloud Drive (Budget/applepay.txt). Une app web ne
// peut pas lire iCloud seule : on choisit le fichier (sélecteur de fichiers), l'app le lit sur l'iPhone et propose
// d'ajouter ce qui manque. Rien n'est envoyé.
//  - feuille ouvrirApplePay : bouton « Récupérer mes paiements », première fois : aide du Raccourci + date de départ ;
//    après lecture : une phrase de bilan, puis Nouveaux (cochés), Déjà notée ?, À compléter, Déjà dans l'app (replié) ;
//    « Glisse pour noter » puis une petite carte ;
//  - feuille ouvrirVerifierMontant : un paiement « à vérifier » (station, péage…) confirmé ou corrigé aux molettes ;
//  - feuille ouvrirReglagesApplePay : étapes du Raccourci, carte → compte, mots « à vérifier », date de départ.
// La lecture et le classement sont dans js/import/applepay.js, l'enregistrement dans js/actions.js (testés) ;
// les phrases dans js/v200/calculs/depenses.js (testées). Ici, seulement l'affichage.

import { h, icone, vibrer, annoncer, estMasque } from '../../ui/dom.js';
import { ouvrirFeuille } from '../../ui/sheet.js';
import { selectionner } from '../../ui/composants.js';
import { etat, majProfil } from '../../store.js';
import { aujourdhui, ajouterJours, formatJourLong, libelleRelatif } from '../../dates.js';
import { periodeBudget } from '../../calculs.js';
import { formatEuros } from '../../money.js';
import { nomCategorie } from '../../categories.js';
import { analyserFichier, planifierApplePay, compteDeCarte } from '../../import/applepay.js';
import { enregistrerApplePay, corrigerMontantProvisoire, confirmerMontant } from '../../actions.js';
import { categoriesFavorites } from '../calculs/habitudes.js';
import { bilanApplePay, notesFichierApplePay, finApplePay, nomCourt } from '../calculs/depenses.js';
import { eur } from '../calculs/commun.js';
import { tuilesCategories, emojiCategorie } from '../ui/tuiles.js';
import { molettes } from '../ui/molette.js';
import { glisserValider } from '../ui/glisser-valider.js';
import { confirmerApplePay } from '../ui/confirmation.js';
import { puces } from './saisie.js';

const montant = (c) => (estMasque() ? '•••' : eur(c));
const pl = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const MSG_ICLOUD = 'S’il est dans iCloud, ouvre-le une fois dans Fichiers pour qu’il se télécharge.';

// ------------------------------------------------------------------ Aide : créer le Raccourci
const code = (t) => h('code', { class: 'v2-ap-code' }, t);
const ETAPES = () => [
  ['Ouvre ', h('strong', {}, 'Raccourcis'), ', onglet ', h('strong', {}, 'Automatisation'), ', puis ', h('strong', {}, '+'), '.'],
  ['Choisis ', h('strong', {}, 'Transaction'), ', coche tes cartes, puis ', h('strong', {}, 'Exécuter immédiatement'), '.'],
  ['Touche ', h('strong', {}, 'Nouveau raccourci vide'), '.'],
  ['Ajoute ', h('strong', {}, 'Formater la date'), ' : Date actuelle, format Personnalisé : ', code('yyyy-MM-dd\'T\'HH:mm:ssZZZZZ')],
  ['Ajoute ', h('strong', {}, 'Texte'), ' et écris : ', code('AP1|Date formatée|Montant|Carte|Nom|Commerçant'), ' Chaque mot est une variable à toucher : «\u00A0Date formatée\u00A0», puis Montant, Carte, Nom et Commerçant de «\u00A0Entrée du raccourci\u00A0».'],
  ['Ajoute ', h('strong', {}, 'Ajouter au fichier texte'), ' : ', code('Budget/applepay.txt'), ', avec « Créer une nouvelle ligne » activé.'],
  ['C’est tout. Le fichier est dans Fichiers › iCloud Drive › Raccourcis › Budget.'],
];

/** « Comment créer le Raccourci », replié. */
export function aideRaccourci({ ouvert = false } = {}) {
  return h('details', { class: 'v2-ap-aide', open: ouvert || null },
    h('summary', {}, h('span', { 'aria-hidden': 'true' }, '🧭'), h('span', {}, 'Comment créer le Raccourci')),
    h('ol', { class: 'v2-ap-etapes' }, ETAPES().map((e) => h('li', {}, e))));
}

// ------------------------------------------------------------------ Date de départ
/** Puces « Depuis le salaire », « Le mois d'avant », « Aujourd'hui » (et la date déjà choisie si elle est autre). */
function choixDepuis(valeur, onChoix) {
  const auj = aujourdhui();
  const debut = periodeBudget(auj, etat.profil).debut;
  const avant = periodeBudget(ajouterJours(debut, -1), etat.profil).debut;
  const options = [[debut, 'Depuis le salaire'], [avant, 'Le mois d’avant'], [auj, 'Aujourd’hui']];
  if (valeur && !options.some(([d]) => d === valeur)) options.unshift([valeur, formatJourLong(valeur)]);
  const phrase = h('p', { class: 'v2-ap-sous-texte' });
  const dire = (d) => { phrase.textContent = `Les paiements à partir du ${formatJourLong(d)}.`; };
  const p = puces(options, valeur, (d) => { dire(d); onChoix(d); }, 'À partir de quand ?');
  dire(valeur);
  return h('div', { class: 'v2-ap-depuis' }, p.element, phrase);
}

// ------------------------------------------------------------------ Feuille « un montant aux molettes »
/**
 * Une feuille avec les molettes et un bouton. pareil : texte du bouton tant que le montant n'a pas bougé.
 * onValider(centimes, inchange) est appelé, puis la feuille se ferme.
 */
export function feuilleMontant({ titre, texte = null, valeur = 0, pareil = null, onValider }) {
  const corps = h('div', { class: 'v2-saisie' });
  const f = ouvrirFeuille({ titre, contenu: corps, plein: true });
  f.element.classList.add('v2-feuille');
  const btn = h('button', { type: 'button', class: 'btn btn-principal btn-large v2-ap-bouton' });
  const roues = molettes({ valeur, onChange: () => maj() });
  function maj() {
    const c = roues.valeur();
    btn.textContent = pareil && c === valeur ? pareil : c > 0 ? `Noter ${eur(c)}` : 'Choisis un montant';
    btn.disabled = !(c > 0);
  }
  btn.addEventListener('click', async () => {
    const c = roues.valeur();
    if (!(c > 0)) return;
    btn.disabled = true;
    try { await onValider(c, c === valeur); } finally { f.fermer('ok'); }
  });
  maj();
  corps.replaceChildren(h('div', { class: 'v2-etape-montant' },
    texte ? h('p', { class: 'v2-ap-intro' }, texte) : null,
    h('div', { class: 'v2-montant-carte' }, roues.element),
    btn));
  corps.querySelector('.v2-roue-euros .v2-roue-fenetre')?.focus({ preventScroll: true });
  return f;
}

/** Un paiement « à vérifier » (onglet Dépenses) : le confirmer tel quel, ou le corriger aux molettes. */
export function ouvrirVerifierMontant(tx) {
  const nom = nomCourt(tx);
  const texte = tx.applePay?.raisonProvisoire === 'verification-carte'
    ? `${nom} : un si petit montant est souvent une vérification de carte. Regarde ton relevé ou ton ticket.`
    : `${nom} : ce montant peut encore changer (station, péage, hôtel…). Regarde ton relevé ou ton ticket.`;
  return feuilleMontant({
    titre: 'Montant à vérifier', texte, valeur: tx.montantCentimes, pareil: 'C’est le bon montant',
    onValider: async (c, inchange) => {
      if (inchange) await confirmerMontant(tx.id); else await corrigerMontantProvisoire(tx.id, c);
      vibrer(12);
      annoncer(inchange ? 'Montant confirmé.' : `Montant corrigé : ${formatEuros(c)}.`);
    },
  });
}

// ------------------------------------------------------------------ Récupérer mes paiements
/** « Hier », « Mercredi » ; avec l'heure : « Hier, 8 h 02 ». */
const jourDe = (date, auj) => libelleRelatif(date, auj).replace(/'/g, '’');
const quand = (tx, auj, { heure = true } = {}) => {
  const jour = jourDe(tx.date, auj);
  const h0 = heure ? tx.applePay?.heure : null;
  return h0 ? `${jour}, ${h0.replace(/^0(\d)/, '$1').replace(':', ' h ')}` : jour;
};

function section(titre, ...contenu) {
  return h('section', { class: 'v2-ap-section' }, h('h3', { class: 'v2-ap-titre' }, titre), ...contenu);
}

export function ouvrirApplePay() {
  const auj = aujourdhui();
  const profilAP = etat.profil.applePay || {};
  const premiere = !profilAP.depuis;
  let depuis = profilAP.depuis || periodeBudget(auj, etat.profil).debut;
  const corps = h('div', { class: 'v2-saisie v2-ap' });
  const f = ouvrirFeuille({ titre: 'Paiements Apple Pay', contenu: corps, plein: true });
  f.element.classList.add('v2-feuille');

  const message = h('p', { class: 'v2-ap-message', role: 'alert' });
  const dire = (t) => { message.textContent = t || ''; message.hidden = !t; };
  const input = h('input', { type: 'file', accept: '.txt,text/plain', class: 'sr', tabindex: '-1', 'aria-hidden': 'true',
    onchange: (e) => { const fichier = e.target.files?.[0]; e.target.value = ''; if (fichier) lire(fichier); } });

  const accueil = () => {
    dire('');
    corps.replaceChildren(h('div', { class: 'v2-ap-accueil' },
      h('p', { class: 'v2-ap-intro' }, 'Ton iPhone note chaque paiement Apple Pay dans un fichier. L’app le lit ici et ajoute ce qui manque. Rien n’est envoyé.'),
      premiere ? aideRaccourci() : null,
      premiere ? section('À partir de quand ?', choixDepuis(depuis, (d) => { depuis = d; })) : null,
      message,
      h('button', { type: 'button', class: 'btn btn-principal btn-large v2-ap-bouton', onclick: () => input.click() },
        icone('telecharger'), h('span', {}, 'Récupérer mes paiements')),
      h('p', { class: 'v2-ap-sous-texte v2-ap-centre' }, 'Choisis applepay.txt dans iCloud Drive › Raccourcis › Budget.'),
      premiere ? null : aideRaccourci(),
      input));
  };

  async function lire(fichier) {
    let texte;
    try { texte = await fichier.text(); } catch { dire(`Je n’arrive pas à lire ce fichier. ${MSG_ICLOUD}`); return; }
    if (!String(texte || '').replace(/^﻿/, '').trim()) { dire(`Le fichier est vide. ${MSG_ICLOUD}`); return; }
    const analyse = analyserFichier(texte, { auj });
    if (!analyse.paiements.length) {
      dire(analyse.comptes.formatRecent ? 'Ce fichier vient d’un Raccourci plus récent : mets l’app à jour.' : 'Aucun paiement Apple Pay dans ce fichier. Choisis bien applepay.txt.');
      return;
    }
    const etatPlan = { ...etat, profil: { ...etat.profil, applePay: { ...profilAP, depuis } } };
    const plan = planifierApplePay(analyse, etatPlan, { auj, maintenant: new Date().toISOString() });
    const choix = { ignorer: new Set(), categories: {}, memes: {}, montants: {}, cartes: {}, ...(premiere ? { depuis } : {}) };
    const b = bilanApplePay(plan);
    if (b.rienDeNouveau) { await terminer(plan, choix, b.phrase); return; }
    revue(plan, choix, b);
  }

  async function terminer(plan, choix, sousRien = null) {
    const totaux = await enregistrerApplePay(plan, choix);
    vibrer(15);
    f.fermer('ajout');
    const fin = finApplePay(totaux);
    confirmerApplePay(totaux, !totaux.ajoutees && !totaux.fusionnees && sousRien ? { sous: sousRien, lignes: fin.lignes } : fin);
  }

  function revue(plan, choix, b) {
    const redessins = new Map();
    let glisser = null;
    const aNoter = () => plan.aAjouter.filter((t) => !choix.ignorer.has(t.id)).length
      + plan.aConfirmer.filter(({ tx }) => choix.memes[tx.id] === false).length
      + plan.aCompleter.filter(({ tx }) => !choix.ignorer.has(tx.id) && choix.montants[tx.id] > 0).length;
    const majValider = () => {
      if (!glisser) return;
      glisser.activer(true);
      const n = aNoter();
      glisser.element.querySelector('.v2-glisser-ok')?.setAttribute('aria-label', n ? `Noter ${pl(n, 'paiement', 'paiements')}` : 'Terminer');
    };

    // Carte → compte : seulement pour une carte inconnue, quand il y a plusieurs comptes
    const tous = [...plan.aAjouter, ...plan.aConfirmer.map((x) => x.tx), ...plan.aCompleter.map((x) => x.tx)];
    const cartesInconnues = etat.comptes.length > 1
      ? [...new Map(tous.filter((t) => t.applePay?.carte && !profilAP.cartes?.[t.applePay.carte]).map((t) => [t.applePay.carte, t.compteId])).entries()]
      : [];
    for (const [carte, compteId] of cartesInconnues) if (compteId) choix.cartes[carte] = compteId;
    const zoneCartes = cartesInconnues.length ? section(cartesInconnues.length > 1 ? 'Tes cartes, sur quel compte ?' : 'Ta carte, sur quel compte ?', ...cartesInconnues.map(([carte, compteId]) => h('div', { class: 'v2-ap-carte' },
      h('p', { class: 'v2-ap-carte-nom' }, h('span', { 'aria-hidden': 'true' }, '💳 '), carte),
      puces(etat.comptes.map((c) => [c.id, c.nom]), compteId, (id) => { choix.cartes[carte] = id; }, `Compte de la carte ${carte}`).element))) : null;

    // Nouveaux : « à classer » d'abord
    const changerCategorie = (tx) => {
      const fc = ouvrirFeuille({ titre: nomCourt(tx), plein: true, contenu: h('div', { class: 'v2-saisie' }, tuilesCategories({
        favorites: categoriesFavorites(etat, auj),
        onChoix: (id) => {
          // Un geste = tout le commerçant (comme à l'import d'un relevé)
          for (const t of plan.aAjouter) if (t.marchand === tx.marchand && t.sens === tx.sens) { choix.categories[t.id] = id; redessins.get(t.id)?.(); }
          fc.fermer('choix');
          annoncer(`${nomCourt(tx)} : ${nomCategorie(id)}.`);
        },
      })) });
      fc.element.classList.add('v2-feuille');
    };
    const itemNouveau = (tx) => {
      const li = h('li', { class: 'v2-ap-item' });
      const nom = nomCourt(tx);
      const dessiner = () => {
        const coche = !choix.ignorer.has(tx.id);
        const cat = choix.categories[tx.id] || tx.categorie;
        const aClasser = tx.applePay?.classement === 'a-classer' && !choix.categories[tx.id];
        const credit = tx.sens === 'credit';
        li.classList.toggle('decoche', !coche);
        li.classList.toggle('a-classer', aClasser);
        li.replaceChildren(
          h('button', { type: 'button', role: 'checkbox', class: `v2-ap-coche${coche ? ' actif' : ''}`, 'aria-checked': String(coche),
            'aria-label': `Ajouter ${nom}, ${formatEuros(tx.montantCentimes)}`,
            onclick: () => { if (coche) choix.ignorer.add(tx.id); else choix.ignorer.delete(tx.id); dessiner(); majValider(); li.querySelector('.v2-ap-coche')?.focus(); } },
          h('span', { class: 'v2-ap-coche-rond', 'aria-hidden': 'true' }, coche ? icone('ok') : null)),
          h('button', { type: 'button', class: 'v2-ap-ligne', onclick: () => changerCategorie(tx),
            'aria-label': `${nom}, ${aClasser ? 'à classer' : nomCategorie(cat)}, ${credit ? 'remboursement de ' : ''}${formatEuros(tx.montantCentimes)}, ${quand(tx, auj)}${tx.applePay?.provisoire ? ', montant à vérifier' : ''}. Changer la catégorie` },
            h('span', { class: 'v2-dep-emoji', 'aria-hidden': 'true' }, emojiCategorie(cat)),
            h('span', { class: 'v2-ap-texte', 'aria-hidden': 'true' },
              h('span', { class: 'v2-ap-nom' }, nom),
              h('span', { class: 'v2-ap-sous' }, aClasser ? h('strong', {}, 'à classer') : nomCategorie(cat), ` · ${quand(tx, auj, { heure: false })}`)),
            h('span', { class: 'v2-ap-droite', 'aria-hidden': 'true' },
              h('span', { class: `v2-dep-montant${credit ? ' v2-dep-montant-entree' : ''}` }, `${credit ? '+' : ''}${montant(tx.montantCentimes)}`),
              tx.applePay?.provisoire ? h('span', { class: 'v2-dep-etiquette v2-dep-etiquette-verifier' }, 'à vérifier') : null)));
      };
      redessins.set(tx.id, dessiner);
      dessiner();
      return li;
    };
    const nouveaux = [...plan.aAjouter].sort((a, c) => (c.applePay?.classement === 'a-classer') - (a.applePay?.classement === 'a-classer') || (a.date < c.date ? 1 : a.date > c.date ? -1 : 0));
    const nbAClasser = nouveaux.filter((t) => t.applePay?.classement === 'a-classer').length;
    const zoneNouveaux = nouveaux.length ? section(`Nouveaux (${nouveaux.length})`,
      nbAClasser ? h('p', { class: 'v2-ap-sous-texte' }, `${pl(nbAClasser, 'paiement est', 'paiements sont')} à classer : touche-les pour choisir.`) : null,
      h('ul', { class: 'v2-dep-liste v2-ap-liste', role: 'list' }, nouveaux.map(itemNouveau)),
      nouveaux.some((t) => t.applePay?.provisoire) ? h('p', { class: 'v2-ap-sous-texte' }, '« à vérifier » : le montant peut encore changer (station, péage, hôtel…). Ton relevé le corrigera.') : null) : null;

    // Déjà notée ?
    const itemConfirmer = ({ tx, existante, raison }) => {
      const question = raison === 'releve-montant'
        ? `Le relevé dit ${montant(existante.montantCentimes)} au lieu de ${montant(tx.montantCentimes)}. C’est le même paiement ?`
        : raison === 'releve-sans-nom'
          ? `Ton relevé a « ${nomCourt(existante)} » au même montant, ${jourDe(existante.date, auj).toLowerCase()}. C’est ce paiement ?`
          : `Tu as déjà noté « ${nomCourt(existante)} » (${montant(existante.montantCentimes)}), ${jourDe(existante.date, auj).toLowerCase()}. C’est ce paiement ?`;
      return h('li', { class: 'v2-ap-question' },
        h('div', { class: 'v2-ap-question-tete' },
          h('span', { class: 'v2-dep-emoji', 'aria-hidden': 'true' }, emojiCategorie(existante.categorie || tx.categorie)),
          h('span', { class: 'v2-ap-texte' }, h('span', { class: 'v2-ap-nom' }, nomCourt(tx)), h('span', { class: 'v2-ap-sous' }, `Apple Pay · ${quand(tx, auj)}`)),
          h('span', { class: 'v2-dep-montant' }, montant(tx.montantCentimes))),
        h('p', { class: 'v2-ap-question-texte' }, question),
        puces([[true, 'Oui, c’est la même'], [false, 'Non, c’en est une autre']], choix.memes[tx.id], (v) => { choix.memes[tx.id] = v; majValider(); }, `${nomCourt(tx)} : ${question}`).element);
    };
    const zoneConfirmer = plan.aConfirmer.length ? section('Déjà notée ?',
      h('ul', { class: 'v2-ap-questions', role: 'list' }, plan.aConfirmer.map(itemConfirmer)),
      h('p', { class: 'v2-ap-sous-texte' }, 'Sans réponse, la question reviendra la prochaine fois.')) : null;

    // À compléter : autre devise, ou sans montant
    const itemCompleter = ({ tx, raison }) => {
      const li = h('li', { class: 'v2-ap-question' });
      const nom = nomCourt(tx);
      const dessiner = () => {
        const m = choix.montants[tx.id];
        const decote = choix.ignorer.has(tx.id);
        li.classList.toggle('decoche', decote);
        li.replaceChildren(
          h('div', { class: 'v2-ap-question-tete' },
            h('span', { class: 'v2-dep-emoji', 'aria-hidden': 'true' }, emojiCategorie(tx.categorie)),
            h('span', { class: 'v2-ap-texte' }, h('span', { class: 'v2-ap-nom' }, nom), h('span', { class: 'v2-ap-sous' }, quand(tx, auj)))),
          h('p', { class: 'v2-ap-question-texte' }, raison === 'devise'
            ? `Payé ${tx.applePay?.montantDevise || 'dans une autre devise'}. Combien en euros sur ton relevé ?`
            : 'Le montant manque. Combien as-tu payé ?'),
          h('div', { class: 'v2-puces' },
            h('button', { type: 'button', class: `v2-puce${m > 0 && !decote ? ' actif' : ''}`, disabled: decote || null, 'aria-label': m > 0 ? `${nom} : ${formatEuros(m)}, changer le montant` : `${nom} : choisir le montant en euros`,
              onclick: () => feuilleMontant({ titre: nom, texte: 'Le montant en euros, comme sur ton relevé.', valeur: m || 0, onValider: (c) => { choix.montants[tx.id] = c; dessiner(); majValider(); } }) },
            m > 0 ? `${montant(m)} · changer` : 'Choisir le montant'),
            h('button', { type: 'button', class: `v2-puce${decote ? ' actif' : ''}`, 'aria-pressed': String(decote),
              onclick: () => { if (decote) choix.ignorer.delete(tx.id); else choix.ignorer.add(tx.id); dessiner(); majValider(); } }, 'Laisser de côté')));
      };
      dessiner();
      return li;
    };
    const zoneCompleter = plan.aCompleter.length ? section('À compléter',
      h('ul', { class: 'v2-ap-questions', role: 'list' }, plan.aCompleter.map(itemCompleter))) : null;

    // Déjà dans l'app (replié)
    const nbDeja = plan.dejaLa.length + (plan.ignorees?.dejaVues || 0);
    const zoneDeja = nbDeja ? h('details', { class: 'v2-ap-deja' },
      h('summary', {}, `Déjà dans l’app (${nbDeja})`),
      plan.dejaLa.length ? h('ul', { class: 'v2-ap-deja-liste', role: 'list' }, plan.dejaLa.map(({ tx }) => h('li', {},
        h('span', { class: 'v2-ap-nom' }, nomCourt(tx)), h('span', { class: 'v2-ap-sous' }, quand(tx, auj)), h('span', { class: 'v2-ap-deja-montant' }, montant(tx.montantCentimes))))) : null,
      plan.ignorees?.dejaVues ? h('p', { class: 'v2-ap-sous-texte' }, `${pl(plan.ignorees.dejaVues, 'paiement déjà récupéré', 'paiements déjà récupérés')} avant.`) : null) : null;

    const notes = notesFichierApplePay(plan.comptes);
    glisser = glisserValider({ texte: 'Glisse pour noter', libelle: () => 'Noter', onValider: async () => {
      try { await terminer(plan, choix); } catch (e) { dire(`Impossible d’enregistrer : ${e.message}`); glisser.reinitialiser(); }
    } });
    majValider();
    corps.replaceChildren(h('div', { class: 'v2-ap-revue' },
      h('p', { class: 'v2-ap-bilan' }, `${b.phrase}.`.replace('?.', '?')),
      notes.length ? h('p', { class: 'v2-ap-sous-texte' }, notes.join(' ')) : null,
      message,
      zoneCartes, zoneNouveaux, zoneConfirmer, zoneCompleter, zoneDeja,
      glisser.element));
    dire('');
    corps.closest('.feuille-corps')?.scrollTo?.({ top: 0 });
  }

  accueil();
  return f;
}

// ------------------------------------------------------------------ Réglages
/** Réglages › Paiements Apple Pay : étapes du Raccourci, carte → compte, mots « à vérifier », date de départ. */
export function ouvrirReglagesApplePay() {
  const corps = h('div', { class: 'v2-ap v2-ap-reglages' });
  const f = ouvrirFeuille({ titre: 'Paiements Apple Pay', contenu: corps, plein: true });
  f.element.classList.add('v2-feuille');
  let aideOuverte = false;
  const dessiner = () => {
    const ap = etat.profil.applePay || {};
    const sauver = async (partiel) => {
      const a = etat.profil.applePay || {};
      aideOuverte = !!corps.querySelector('.v2-ap-aide')?.open;
      await majProfil({ applePay: { cartes: { ...(a.cartes || {}) }, depuis: a.depuis || null, motsProvisoires: [...(a.motsProvisoires || [])], ...partiel } });
      dessiner();
    };
    // Cartes : celles déjà choisies et celles vues sur tes paiements
    const cartes = [...new Set([...Object.keys(ap.cartes || {}), ...etat.transactions.map((t) => t.applePay?.carte).filter(Boolean)])].sort();
    let zoneCartes;
    if (!cartes.length) zoneCartes = h('p', { class: 'v2-ap-sous-texte' }, 'Tes cartes apparaîtront après ta première récupération.');
    else if (etat.comptes.length <= 1) zoneCartes = h('p', { class: 'v2-ap-sous-texte' }, `Tous tes paiements vont sur « ${etat.comptes[0]?.nom || 'ton compte'} ».`);
    else {
      zoneCartes = h('div', { class: 'v2-ap-cartes' }, cartes.map((carte, i) => {
        const id = `v2-ap-carte-${i}`;
        return h('div', { class: 'v2-ap-carte-ligne' },
          h('label', { for: id, class: 'v2-ap-carte-nom' }, h('span', { 'aria-hidden': 'true' }, '💳 '), carte),
          selectionner(etat.comptes.map((c) => [c.id, c.nom]), compteDeCarte(carte, ap, etat.comptes), (v) => sauver({ cartes: { ...(ap.cartes || {}), [carte]: v } }), { id }));
      }));
    }
    // Mots « à vérifier »
    const mots = ap.motsProvisoires || [];
    const champ = h('input', { class: 'input', type: 'text', maxlength: '30', autocomplete: 'off', enterkeyhint: 'done', placeholder: 'Un mot du commerçant', 'aria-label': 'Nouveau mot à vérifier',
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterMot(); } } });
    const ajouterMot = () => {
      const m = champ.value.trim().replace(/\s+/g, ' ');
      if (!m || mots.some((x) => x.toLowerCase() === m.toLowerCase())) { champ.value = ''; return; }
      sauver({ motsProvisoires: [...mots, m] });
    };
    corps.replaceChildren(
      h('p', { class: 'v2-ap-intro' }, 'Un Raccourci note chaque paiement Apple Pay dans un fichier. Dans Dépenses, « Récupérer Apple Pay » le lit.'),
      aideRaccourci({ ouvert: aideOuverte }),
      section('Tes cartes', zoneCartes),
      section('Mots « à vérifier »',
        h('p', { class: 'v2-ap-sous-texte' }, 'Un paiement chez un commerçant qui contient un de ces mots est noté « à vérifier » : son montant peut changer.'),
        mots.length ? h('ul', { class: 'v2-ap-mots', role: 'list' }, mots.map((m) => h('li', {},
          h('span', {}, m),
          h('button', { type: 'button', class: 'v2-ap-mot-retirer', 'aria-label': `Retirer le mot ${m}`, onclick: () => sauver({ motsProvisoires: mots.filter((x) => x !== m) }) }, icone('fermer'))))) : null,
        h('div', { class: 'v2-ap-mot-ajout' }, champ, h('button', { type: 'button', class: 'v2-puce', onclick: ajouterMot }, 'Ajouter'))),
      section('À partir de quand ?',
        choixDepuis(ap.depuis || periodeBudget(aujourdhui(), etat.profil).debut, (d) => sauver({ depuis: d })),
        ap.depuis ? null : h('p', { class: 'v2-ap-sous-texte' }, 'Pas encore choisi : ce sera demandé à ta première récupération.')));
  };
  dessiner();
  return f;
}
