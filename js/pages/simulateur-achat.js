// simulateur-achat.js — « Et si j'achète ? » : tape un montant, vois l'effet avant d'acheter.

import { h, icone, mt } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { champ, champMontant, segment, bouton } from '../ui/composants.js';
import { etat } from '../store.js';
import { simulerAchat } from '../simulation.js';
import { aujourdhui, formatJourLong, formatDateCourte } from '../dates.js';
import { formatEuros } from '../money.js';

const NOM_COULEUR = { vert: 'verte', orange: 'orange', rouge: 'rouge' };

export function feuilleSimulateurAchat() {
  let montant = null;
  let type = 'plaisir';
  const resultat = h('div', { class: 'simu-resultat', 'aria-live': 'polite' });
  const auj = aujourdhui();
  const dessiner = () => {
    if (!(montant > 0)) { resultat.replaceChildren(h('p', { class: 'petit' }, 'Tape le prix de ce que tu veux acheter.')); return; }
    const s = simulerAchat(etat, auj, { montantCentimes: montant, categorie: type === 'plaisir' ? 'plaisir' : 'maison' });
    const ligne = (titre, avant, apres, fmt = (x) => mt(x)) => h('div', { class: 'simu-ligne' },
      h('span', { class: 'simu-titre' }, titre),
      h('span', { class: 'simu-valeurs' }, avant === null ? '—' : fmt(avant), icone('suivant'), h('strong', { class: apres !== null && avant !== null && apres < avant ? 'negatif-texte' : '' }, apres === null ? '—' : fmt(apres))));
    const pastille = (c) => h('span', { class: `simu-pastille ${c}` }, NOM_COULEUR[c]);
    resultat.replaceChildren(...[
      h('div', { class: `simu-verdict ${s.sansRisque ? 'ok' : 'attendre'}` },
        h('p', { class: 'simu-verdict-titre' }, icone(s.sansRisque ? 'ok' : 'calendrier'),
          s.sansRisque ? 'Sans risque dès aujourd’hui' : `Sans risque à partir du ${formatJourLong(s.dateSansRisque)}`),
        h('p', { class: 'petit' }, s.sansRisque
          ? (s.epargnePerdueCentimes ? `Il sera pris sur ce qui reste de ta part du jour : ${formatEuros(s.epargnePerdueCentimes)} de moins pour l’épargne demain matin, rien d’autre ne change.` : 'Ton budget l’absorbe sans toucher à l’épargne.')
          : `Aujourd’hui, ${s.raisons.join(', ')}. Après le salaire, il sera pris sur le budget du mois suivant.`)),
      ligne('Reste aujourd’hui', s.avant.aujourdhuiCentimes, s.apres.aujourdhuiCentimes),
      ligne('Part des jours suivants', s.avant.partSuivantsCentimes, s.apres.partSuivantsCentimes),
      ligne('Épargne du mois', s.avant.epargneCentimes, s.apres.epargneCentimes),
      s.epargnePerdueCentimes ? h('div', { class: 'simu-ligne' }, h('span', { class: 'simu-titre' }, 'Ce que l’épargne perd en tout'), h('strong', { class: 'negatif-texte' }, '−', mt(s.epargnePerdueCentimes))) : null,
      h('div', { class: 'simu-ligne' }, h('span', { class: 'simu-titre' }, 'Ta pastille'), h('span', { class: 'simu-valeurs' }, pastille(s.avant.couleur), icone('suivant'), pastille(s.apres.couleur))),
      h('div', { class: 'groupe-boutons' },
        bouton(`Je l’achète : noter ${formatEuros(montant)}`, async () => { f.fermer(); const { ouvrirSaisie } = await import('./saisie.js'); ouvrirSaisie('clavier', { sens: 'debit', montantCentimes: montant }); }, { classe: 'btn-petit btn-principal' }),
        s.sansRisque ? null : bouton('Rappel le jour du salaire', async () => { const { ajouterAuCalendrier } = await import('../ics.js'); ajouterAuCalendrier({ titre: `Achat prévu : ${formatEuros(montant)}`, description: 'Tu as prévu cet achat après le salaire. Vérifie d’abord avec « Et si j’achète ? » dans Budget.', date: s.dateSansRisque, heure: '18:00', nomFichier: 'achat-prevu' }); }, { classe: 'btn-petit', icone: 'calendrier' })),
      h('p', { class: 'petit' }, `Calculé pour un achat aujourd’hui (${formatDateCourte(auj)}). Comme ce qui reste de ta part du jour part à l’épargne chaque matin, attendre quelques jours dans le mois ne libère pas d’argent : c’est aujourd’hui ou après le salaire.`),
    ].filter(Boolean));
  };
  dessiner();
  const f = ouvrirFeuille({
    titre: 'Et si j’achète ?',
    plein: true,
    contenu: h('div', { class: 'formulaire simu' },
      champ('Prix', champMontant({ label: 'Prix de l’achat', autofocus: true, onValeur: (v) => { montant = v; dessiner(); } })),
      champ('C’est plutôt', segment([['plaisir', 'Une envie'], ['necessaire', 'Un besoin']], type, (v) => { type = v; dessiner(); }, 'Type d’achat'), 'Une envie compte dans les dépenses évitables de ta pastille.'),
      resultat),
  });
  return f;
}
