// verifier.js — « Vérifier mon solde » : tu tapes le solde affiché par ta banque, l'app le compare à son calcul
// et te dit ce qui manque (dépenses non notées, entrée oubliée), puis propose de corriger.

import { h, icone, mt } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { champ, champMontant, bouton } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat } from '../store.js';
import { soldes } from '../calculs.js';
import { declarerSolde } from '../actions.js';
import { aujourdhui } from '../dates.js';
import { formatEuros } from '../money.js';

/** Écart entre la banque et l'app : négatif = dépenses non notées, positif = entrée non notée. */
export function ecartSolde(soldeAppCentimes, soldeBanqueCentimes) {
  const ecart = soldeBanqueCentimes - soldeAppCentimes;
  return { ecartCentimes: ecart, sens: ecart === 0 ? 'ok' : ecart < 0 ? 'manque' : 'surplus' };
}

export function feuilleVerification() {
  let f = null;
  const auj = aujourdhui();
  const comptes = soldes(etat, auj).comptes.filter((c) => c.compte.type !== 'epargne' && c.compte.type !== 'especes');
  const blocs = comptes.map(({ compte: c, soldeCentimes: app }) => {
    const resultat = h('div', { class: 'verif-resultat', 'aria-live': 'polite' });
    const montrer = (banque) => {
      if (banque === null || banque === undefined) { resultat.replaceChildren(); return; }
      const e = ecartSolde(app, banque);
      const x = Math.abs(e.ecartCentimes);
      if (e.sens === 'ok') { resultat.replaceChildren(h('p', { class: 'vert-texte verif-ok' }, icone('ok'), ' D’accord avec ta banque, au centime.')); return; }
      const ajouter = async (sens) => {
        f.fermer();
        const { ouvrirSaisie } = await import('./saisie.js');
        ouvrirSaisie('clavier', { sens, montantCentimes: x, libelle: sens === 'debit' ? 'Dépenses non notées' : 'Entrée non notée', compteId: c.id, date: auj, categorie: sens === 'debit' ? 'autres' : null });
      };
      const aligner = async () => { await declarerSolde(c.id, banque, auj); f.fermer(); toast(`Solde de ${c.nom} aligné sur ${formatEuros(banque)}.`, { type: 'succes' }); };
      resultat.replaceChildren(
        h('p', { class: `verif-ecart ${e.sens}` }, e.sens === 'manque' ? `Il te manque ${formatEuros(x)} de dépenses non notées.` : `Il y a ${formatEuros(x)} de plus que prévu : une entrée non notée ?`),
        h('p', { class: 'petit' }, e.sens === 'manque'
          ? 'Regarde dans ton appli bancaire les dépenses des derniers jours qui ne sont pas dans Budget. Attention : un paiement par carte d’aujourd’hui ou d’hier peut ne pas encore être débité par la banque.'
          : 'Un remboursement, un virement reçu, ou une dépense notée en double dans Budget ?'),
        h('div', { class: 'groupe-boutons' },
          e.sens === 'manque' ? bouton(`Ajouter ${formatEuros(x)} de dépenses`, () => ajouter('debit'), { classe: 'btn-petit btn-principal' })
            : bouton(`Ajouter une entrée de ${formatEuros(x)}`, () => ajouter('credit'), { classe: 'btn-petit btn-principal' }),
          bouton('Juste aligner le solde', aligner, { classe: 'btn-petit' })),
        h('p', { class: 'petit' }, '« Juste aligner » crée une ligne d’ajustement, sans dépense ni entrée : ton budget du jour ne change pas.'));
    };
    return h('section', { class: 'verif-compte' },
      h('div', { class: 'ligne-cle forte' }, h('span', {}, c.nom), h('span', {}, h('small', { class: 'petit' }, 'Dans Budget '), mt(app))),
      champ(`Solde affiché par ${c.nom} aujourd’hui`, champMontant({ label: `Solde ${c.nom} selon la banque`, onValeur: (v) => montrer(v) })),
      resultat);
  });
  f = ouvrirFeuille({
    titre: 'Vérifier mon solde',
    plein: true,
    contenu: h('div', { class: 'verif' },
      h('p', { class: 'petit' }, 'Ouvre ton appli bancaire et tape le solde affiché. Budget le compare à ce qu’il a calculé et te dit ce qui manque.'),
      comptes.length ? comptes.map((_, i) => blocs[i]) : h('p', {}, 'Aucun compte à vérifier.')),
  });
  return f;
}
