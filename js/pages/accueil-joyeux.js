// accueil-joyeux.js — l'Accueil du style Joyeux : Sou la pièce et son humeur, le reste du jour en très grand,
// la série 🔥, le niveau, et les quêtes du jour. Les chiffres sont les mêmes que l'Accueil Classique.

import { h, icone, mt, estMasque } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { etat, ecrireMeta, majParametres } from '../store.js';
import { profilJeu, quetesDuJour, humeur, flammesDesJours, NIVEAUX, POINTS } from '../jeu.js';
import { mascotte, phraseDuJour } from '../ui/mascotte.js';
import { vientDeFeter, confettis } from '../ui/fete.js';
import { aujourdhui, formatDateCourte, ajouterJours } from '../dates.js';
import { formatEuros } from '../money.js';

let decalagePhrase = 0;
const PIECES = 10;

/** Le grand bloc du haut. extras : les puces déjà existantes (prévision, journée sans dépense) ; aideNode : le « ? ». */
export function heroJoyeux(r, j, { extras = [], aideNode = null } = {}) {
  const auj = aujourdhui();
  const moisDepasse = r.resteCentimes < 0;
  const dispo = j.restantAujourdhuiCentimes;
  const depasse = dispo < 0 && !moisDepasse;
  const hum = moisDepasse ? 'triste' : humeur(dispo, j.parJourCentimes);
  const montant = moisDepasse ? -r.resteCentimes : Math.abs(dispo);
  const p = profilJeu(etat, auj);
  const bulle = h('p', { class: 'hj-bulle', 'aria-live': 'polite' }, phraseDuJour(hum, auj, decalagePhrase));
  const sou = h('button', { type: 'button', class: `hj-sou ${vientDeFeter() ? 'saute' : ''}`, 'aria-label': 'Sou, ta pièce. Toucher pour une autre phrase', onclick: () => {
    decalagePhrase += 1; bulle.textContent = phraseDuJour(hum, auj, decalagePhrase);
    sou.classList.remove('saute'); void sou.offsetWidth; sou.classList.add('saute');
  } }, mascotte(hum, { taille: 92 }));
  const pleines = j.parJourCentimes > 0 ? Math.max(0, Math.min(PIECES, Math.ceil((Math.max(0, dispo) / j.parJourCentimes) * PIECES))) : 0;
  const pieces = h('div', { class: 'hj-pieces', role: 'img', 'aria-label': `${pleines} pièces sur ${PIECES} encore là aujourd’hui` },
    Array.from({ length: PIECES }, (_, i) => h('span', { class: i < pleines ? 'pleine' : '' })));
  const jours = j.joursRestants;
  return h('section', { class: `hero-joyeux humeur-${hum}`, 'aria-labelledby': 'hj-t' },
    h('div', { class: 'hj-haut' }, sou, bulle),
    h('h2', { id: 'hj-t', class: 'hj-libelle' }, moisDepasse ? 'Ce mois-ci, dépassé de' : depasse ? 'Aujourd’hui, dépassé de' : 'Il te reste aujourd’hui', aideNode),
    h('p', { class: `hj-montant ${depasse || moisDepasse ? 'depasse' : ''}` }, estMasque() ? '•••,•• €' : formatEuros(montant)),
    moisDepasse ? null : pieces,
    h('p', { class: 'hj-sous' }, moisDepasse ? 'Chaque journée sans dépense te rapproche de zéro.' : [`sur ${formatEuros(j.parJourCentimes)} pour la journée. Encore `, mt(r.resteCentimes), ` pour tenir ${jours} jour${jours > 1 ? 's' : ''}, jusqu’au salaire du ${formatDateCourte(r.periode.salaireAttenduLe || ajouterJours(r.periode.fin, 1))}.`]),
    h('div', { class: 'hj-stats' },
      h('button', { type: 'button', class: `hj-serie ${p.serie ? '' : 'eteinte'} ${p.superFlammeHier ? 'super' : ''}`, onclick: () => feuilleJeu(), 'aria-label': `Série de ${p.serie} jour${p.serie > 1 ? 's' : ''}${p.superFlammeHier ? ', super flamme hier' : ''}. Voir mes flammes et mes points` },
        h('span', { class: 'hj-flamme', 'aria-hidden': 'true' }, '🔥'), h('strong', {}, String(p.serie)), h('small', {}, p.serie > 1 ? 'jours' : 'jour')),
      h('button', { type: 'button', class: 'hj-niveau', onclick: () => feuilleJeu(), 'aria-label': `Niveau ${p.niveau.numero}, ${p.niveau.nom}, ${p.xp} points. Voir mes points` },
        h('span', { class: 'hj-niveau-emoji', 'aria-hidden': 'true' }, p.niveau.emoji),
        h('span', { class: 'hj-niveau-texte' },
          h('span', { class: 'hj-niveau-nom' }, `Niv. ${p.niveau.numero} : ${p.niveau.nom}`),
          h('span', { class: 'hj-xp' }, h('span', { style: { width: `${Math.round(p.progression * 100)}%` } })),
          h('small', {}, p.prochain ? `${p.xp} / ${p.prochain.xp} XP` : `${p.xp} XP, niveau max !`)))),
    ...extras.filter(Boolean));
}

/** Les deux gros boutons : noter une dépense, mettre une pièce de côté. */
export function boutonsJoyeux() {
  return h('div', { class: 'hj-actions' },
    h('button', { type: 'button', class: 'hj-bouton hj-bouton-depense', onclick: async () => { const { ouvrirSaisie } = await import('./saisie.js'); ouvrirSaisie(); } },
      h('span', { class: 'hj-bouton-icone', 'aria-hidden': 'true' }, icone('plus')), h('span', { class: 'hj-bouton-texte' }, 'J’ai dépensé'), h('span', { class: 'hj-xp-puce' }, `+${POINTS.saisie} XP`)),
    h('button', { type: 'button', class: 'hj-bouton hj-bouton-piece', onclick: async () => { const { feuillePrivation } = await import('./privation.js'); feuillePrivation(); } },
      h('span', { class: 'hj-bouton-icone', 'aria-hidden': 'true' }, '🐷'), h('span', { class: 'hj-bouton-texte' }, 'Je me suis privé'), h('span', { class: 'hj-xp-puce' }, `+${POINTS.privation} XP`)));
}

/** Les quêtes du jour : trois cases à cocher, qui se cochent toutes seules. */
export function carteQuetes() {
  const auj = aujourdhui();
  const q = quetesDuJour(etat, auj);
  const faites = q.filter((x) => x.faite).length;
  const agir = {
    noter: async () => { const { ouvrirSaisie } = await import('./saisie.js'); ouvrirSaisie(); },
    piece: async () => { const { feuillePrivation } = await import('./privation.js'); feuillePrivation(); },
    tenir: () => toast(`Si tu restes sous ta part jusqu’à ce soir, c’est +${POINTS.resteDuJour} XP à 5 h demain, et ce qui reste part à l’épargne.`, { duree: 5000 }),
  };
  return h('section', { class: 'quetes', 'aria-labelledby': 'quetes-t' },
    h('div', { class: 'quetes-tete' }, h('h2', { id: 'quetes-t' }, 'Quêtes du jour'), h('span', { class: 'quetes-compte' }, `${faites}/${q.length}`)),
    h('ul', { class: 'quetes-liste' }, q.map((x) => h('li', {},
      h('button', { type: 'button', class: `quete ${x.faite ? 'faite' : x.ratee ? 'ratee' : x.enCours ? 'en-cours' : ''}`, onclick: agir[x.id] },
        h('span', { class: 'quete-case', 'aria-hidden': 'true' }, x.faite ? icone('ok') : x.ratee ? '✕' : x.enCours ? '⏳' : ''),
        h('span', { class: 'quete-texte' }, h('span', { class: 'quete-titre' }, x.titre), h('small', {}, x.aide)),
        h('span', { class: 'hj-xp-puce' }, `+${x.xp}`),
        h('span', { class: 'sr' }, x.faite ? 'faite' : x.ratee ? 'ratée' : 'à faire'))))));
}

/** Mes points : niveau, comment en gagner, ce qui a rapporté ce mois-ci, la série. */
export function feuilleJeu() {
  const auj = aujourdhui();
  const p = profilJeu(etat, auj);
  const ligne = (texte, xp) => h('div', { class: 'ligne-cle' }, h('span', {}, texte), h('strong', { class: 'xp-nombre' }, `${xp} XP`));
  const d = p.details;
  const f = ouvrirFeuille({
    titre: 'Mes points',
    plein: true,
    contenu: h('div', { class: 'jeu-feuille' },
      h('div', { class: 'jeu-niveau' },
        h('span', { class: 'jeu-niveau-emoji', 'aria-hidden': 'true' }, p.niveau.emoji),
        h('p', { class: 'jeu-niveau-nom' }, `Niveau ${p.niveau.numero} : ${p.niveau.nom}`),
        h('div', { class: 'hj-xp grand' }, h('span', { style: { width: `${Math.round(p.progression * 100)}%` } })),
        h('p', { class: 'petit' }, p.prochain ? `${p.xp} XP. Encore ${p.prochain.xp - p.xp} XP pour ${p.prochain.emoji} ${p.prochain.nom}.` : `${p.xp} XP : tu as tout débloqué !`)),
      h('div', { class: 'jeu-serie' }, h('span', { 'aria-hidden': 'true', class: p.superFlammeHier ? 'flamme-super' : '' }, '🔥'), h('p', {}, h('strong', {}, `${p.serie} jour${p.serie > 1 ? 's' : ''} d’affilée`), h('small', {}, 'Flamme : un jour où tu notes une dépense. Super flamme (bleue) : une journée sans aucune dépense, elle garde la série et remplit ton envie.'))),
      h('ol', { class: 'flammes-jours', 'aria-label': 'Tes 14 derniers jours' }, flammesDesJours(etat, auj, 14).map((d) => h('li', { class: d.statut, title: d.date },
        h('span', { 'aria-hidden': 'true' }, d.statut === 'rien' ? '·' : d.statut === 'enCours' ? '…' : '🔥'),
        h('small', {}, String(Number(d.date.slice(8)))),
        h('span', { class: 'sr' }, `${formatDateCourte(d.date)} : ${d.statut === 'super' ? 'super flamme' : d.statut === 'flamme' ? 'flamme' : d.statut === 'enCours' ? 'en cours' : 'rien'}`)))),
      h('h3', { class: 'sous-titre' }, 'Comment gagner des points'),
      h('div', { class: 'liste-cles' },
        ligne('Noter une dépense (6 par jour au plus)', POINTS.saisie),
        ligne('Première dépense notée du jour', POINTS.jourNote),
        ligne('« Je me suis privé »', POINTS.privation),
        ligne('Finir la journée sous ta part', POINTS.resteDuJour),
        ligne('Virement vers l’épargne', POINTS.virement),
        ligne('Super flamme : journée sans aucune dépense', POINTS.sansDepense)),
      h('h3', { class: 'sous-titre' }, `Gagnés depuis le ${formatDateCourte(p.depuis)}`),
      h('div', { class: 'liste-cles' },
        ligne('Dépenses notées', d.saisies + d.joursNotes), ligne('Privations', d.privations), ligne('Journées sous ta part', d.restes),
        ligne('Super flammes', d.sansDepense), ligne('Virements', d.virements),
        h('div', { class: 'ligne-cle forte' }, h('span', {}, 'Total'), h('strong', {}, `${p.xp} XP`))),
      h('h3', { class: 'sous-titre' }, 'Les niveaux'),
      h('ol', { class: 'jeu-niveaux' }, NIVEAUX.map((n, i) => h('li', { class: p.xp >= n.xp ? 'atteint' : '' },
        h('span', { 'aria-hidden': 'true' }, n.emoji), h('span', {}, `${i + 1}. ${n.nom}`), h('small', {}, `${n.xp} XP`)))),
      h('p', { class: 'petit' }, 'Les points sont recalculés depuis tes données : supprimer une dépense notée retire ses points.'),
      h('button', { type: 'button', class: 'lien', onclick: async () => { f.fermer(); await majParametres({ style: 'classique' }); toast('Style Classique remis. Le Joyeux t’attend dans Réglages, Confidentialité et apparence.'); } }, 'Revenir au style Classique')),
  });
  return f;
}

/** Classique : une fois, la proposition d'essayer le style Joyeux. */
export function banniereJoyeux() {
  if (etat.meta.banniereJoyeux) return null;
  const el = h('section', { class: 'banniere-joyeux', 'aria-label': 'Nouveau : le style Joyeux' },
    h('span', { class: 'banniere-joyeux-sou', 'aria-hidden': 'true' }, mascotte('ravie', { taille: 52 })),
    h('p', {}, h('strong', {}, 'Nouveau : le style Joyeux'), h('small', {}, 'Couleurs, une mascotte, des points et des quêtes. Les mêmes chiffres, en plus fun.')),
    h('div', { class: 'banniere-joyeux-boutons' },
      h('button', { type: 'button', class: 'btn btn-principal btn-petit', onclick: async () => {
        await ecrireMeta('banniereJoyeux', 'essaye');
        await majParametres({ style: 'joyeux' });
        setTimeout(() => confettis({ nombre: 50, origine: { x: innerWidth / 2, y: innerHeight * 0.3 } }), 150);
      } }, 'Essayer'),
      h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Plus tard', onclick: async () => { await ecrireMeta('banniereJoyeux', 'ferme'); el.remove(); toast('Tu le trouveras dans Réglages, Confidentialité et apparence.'); } }, icone('fermer'))));
  return el;
}
