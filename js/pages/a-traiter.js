// a-traiter.js — une seule liste de ce qui attend une action de ta part (sauf le virement vers l'épargne, qui a sa case) :
// revenus à confirmer, questions sur les relevés, dépenses sans catégorie, sauvegarde, vérification du solde,
// remboursements à des proches, saisies en attente de Gemini… Une ligne sur l'Accueil avec le nombre, et la liste en un toucher.

import { h, icone, mt } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { bandeau, bouton, selectionner } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat } from '../store.js';
import { aller } from '../router.js';
import { recategoriser } from '../actions.js';
import { CATEGORIES, categorie } from '../categories.js';
import { periodeBudget, estDepenseQuotidienne } from '../calculs.js';
import { diffJours, formatDate, formatDateCourte } from '../dates.js';
import { exporterSauvegarde } from './communs.js';

export const JOURS_SAUVEGARDE = 7;
export const JOURS_VERIFICATION = 14;

/** Dépenses de ce mois-ci sans vraie catégorie (« Autres » ou vide). */
export function depensesSansCategorie(e, auj) {
  const per = periodeBudget(auj, e.profil);
  return (e.transactions || []).filter((t) => t.sens === 'debit' && t.date >= per.debut && t.date <= auj && !t.ajustement
    && (!t.categorie || t.categorie === 'autres') && !t.virementInterne?.estInterne && !t.epargne?.estEpargne && estDepenseQuotidienne(t));
}

/**
 * Les éléments à traiter. Les rappels d'action de l'Accueil (revenus, questions, proches…) plus les vérifications.
 * @param {Array} rappels  les bandeaux de l'Accueil ; seuls ceux qui demandent une action sont gardés
 */
export function elementsATraiter(rappels, auj) {
  const res = rappels.filter((b) => b.type !== 'info' || b.aTraiter);
  const sansCat = depensesSansCategorie(etat, auj);
  if (sansCat.length) res.push({ type: 'action', icone: 'filtre', titre: `${sansCat.length} dépense${sansCat.length > 1 ? 's' : ''} sans catégorie`, texte: 'Range-les pour des statistiques et des conseils justes.', actions: [bouton('Ranger', () => feuilleRanger(auj), { classe: 'btn-petit btn-principal' })] });
  const der = etat.parametres.derniereSauvegarde;
  if (etat.transactions.length && (!der || diffJours(der.slice(0, 10), auj) >= JOURS_SAUVEGARDE)) {
    res.push({ type: 'action', icone: 'telecharger', titre: der ? `Sauvegarde : la dernière date de ${diffJours(der.slice(0, 10), auj)} jours` : 'Aucune sauvegarde : tes données ne vivent que sur cet iPhone', texte: der ? `Dernière le ${formatDate(der.slice(0, 10))}.` : 'Un toucher, puis « Enregistrer dans Fichiers » → iCloud Drive.', actions: [bouton(etat.parametres.motDePasseSauvegarde ? 'Sauvegarder (chiffrée)' : 'Sauvegarder', () => exporterSauvegarde(), { classe: 'btn-petit btn-principal' })] });
  }
  const verif = etat.meta.derniereVerification;
  if (etat.transactions.length && (!verif || diffJours(verif, auj) >= JOURS_VERIFICATION)) {
    res.push({ type: 'action', icone: 'banque', titre: 'Vérifier ton solde avec la banque', texte: verif ? `Dernière vérification le ${formatDate(verif)}. Ça repère les dépenses oubliées.` : 'Tape le solde affiché par LCL et Revolut : l’app te dit ce qui manque.', actions: [bouton('Vérifier', async () => { const { feuilleVerification } = await import('./verifier.js'); feuilleVerification(); }, { classe: 'btn-petit btn-principal' })] });
  }
  if (etat.fileAttenteIA?.length) res.push({ type: 'action', icone: 'envoi', titre: `${etat.fileAttenteIA.length} saisie${etat.fileAttenteIA.length > 1 ? 's' : ''} en attente d’analyse`, texte: 'Envoyées à Gemini dès que tu es en ligne.', actions: [bouton('Voir', () => aller('reglages/gemini'), { classe: 'btn-petit' })] });
  return res;
}

/** Ligne de l'Accueil : « 3 choses à traiter », rien quand tout est fait. */
export function ligneATraiter(elements) {
  if (!elements.length) return null;
  const urgent = elements.some((x) => x.type === 'alerte');
  return h('button', { type: 'button', class: `ligne-a-traiter ${urgent ? 'urgent' : ''}`, onclick: () => feuilleATraiter(elements) },
    h('span', { class: 'a-traiter-badge', 'aria-hidden': 'true' }, String(elements.length)),
    h('span', { class: 'a-traiter-texte' }, h('strong', {}, `${elements.length} chose${elements.length > 1 ? 's' : ''} à traiter`), h('small', {}, elements.slice(0, 2).map((x) => (typeof x.titre === 'string' ? x.titre : '')).filter(Boolean).join(' · '))),
    icone('suivant'));
}

export function feuilleATraiter(elements) {
  const f = ouvrirFeuille({
    titre: 'À traiter',
    contenu: h('div', { class: 'bandeaux', onclick: (e) => { if (e.target.closest('.bandeau-actions button, .bandeau-fermer')) setTimeout(() => f.fermer(), 50); } },
      elements.map((b) => bandeau(b))),
  });
  return f;
}

/** Ranger les dépenses sans catégorie : une liste, un choix par ligne. */
function feuilleRanger(auj) {
  const liste = depensesSansCategorie(etat, auj);
  const options = CATEGORIES.filter((c) => c.nature === 'depense' && c.id !== 'autres').map((c) => [c.id, c.nom]);
  let restant = liste.length;
  const f = ouvrirFeuille({
    titre: 'Ranger les dépenses',
    contenu: h('div', { class: 'liste-cles ranger' }, liste.map((t) => {
      const ligne = h('div', { class: 'ligne-ranger' },
        h('span', { class: 'ligne-ranger-texte' }, h('strong', {}, t.marchand || t.libelle || 'Dépense'), h('small', {}, `${formatDateCourte(t.date)} · `, mt(t.montantCentimes))),
        selectionner([['', 'Choisir…'], ...options], '', async (v) => {
          if (!v) return;
          await recategoriser([t], v);
          ligne.classList.add('fait');
          restant -= 1;
          toast(`${t.marchand || t.libelle} : ${categorie(v).nom}.`, { type: 'succes' });
          if (!restant) setTimeout(() => f.fermer(), 400);
        }));
      return ligne;
    })),
  });
  return f;
}
