// fiche-epargne.js — une fiche par épargne : tout ce qui la concerne au même endroit (solde, paliers, historique,
// boutons, réglages). S'ouvre en touchant sa case, sur l'Accueil comme sur la page Épargne.

import { h, icone, mt } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { bouton, barre } from '../ui/composants.js';
import { etat, surChangement } from '../store.js';
import { soldePoche } from '../epargne.js';
import { paliersPoche } from '../paliers.js';
import { planDesMois, atteintes, moisCourant } from '../plan.js';
import { echeancesEntre } from '../dettes.js';
import { aVirerEpargne, historiqueCagnotte, compteEpargne, pocheDesEfforts } from '../virements.js';
import { aujourdhui, ajouterJours, formatDate, formatDateCourte, formatMois } from '../dates.js';
import { formatEuros } from '../money.js';
import { aide } from '../ui/aide.js';
import { partsReste } from '../envies.js';
import { blocPaliers, feuilleMouvement, editerPoche } from './epargne.js';
import { feuilleHistorique } from './coffres.js';

export function ficheEpargne(poche) {
  let f = null;
  const contenu = h('div', { class: 'fiche-epargne' });
  const dessiner = () => {
    const p = etat.poches.find((x) => x.id === poche.id) || poche;
    const auj = aujourdhui();
    const vire = soldePoche(p);
    const v = aVirerEpargne(etat, auj);
    const enAttente = v.parPoche.find((x) => x.pocheId === p.id)?.montantCentimes || 0;
    const s = vire + enAttente;
    const compte = compteEpargne(p);
    const pret = p.type === 'remboursementAnticipe';
    const att = p.cibleCentimes ? atteintes(etat, planDesMois(etat, moisCourant(etat), 60))[p.id] : null;
    const prochainPret = pret ? echeancesEntre(etat, auj, ajouterJours(auj, 800)).find((x) => x.creditId === p.creditId && x.montantCentimes > 2000) : null;
    const partage = !pocheDesEfforts(etat);
    const PARTS_RESTE = partsReste(etat);
    // Historique de cette épargne : virements et reprises enregistrés, puis ce qui l'attend cette semaine
    const mouvements = [...(p.mouvements || [])].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40);
    const hst = historiqueCagnotte(etat, auj);
    contenu.replaceChildren(...[
      h('div', { class: 'fiche-tete' },
        h('p', { class: 'fiche-compte' }, compte ? `Sur ton ${compte}` : 'Compte non renseigné'),
        h('p', { class: 'fiche-solde' }, mt(s), aide(p.nom, () => ({
          texte: 'Ce qui est déjà viré sur cette épargne (versements − retraits, depuis le solde de départ), plus sa part du prochain virement : elle est comptée dès qu’elle apparaît.',
          lignes: [p.soldeInitialCentimes ? ['Solde de départ', p.soldeInitialCentimes] : null, ['Déjà viré (versements − retraits)', vire - (p.soldeInitialCentimes || 0)], ['+ part du prochain virement', enAttente], ['= total', s, 'forte'], p.cibleCentimes ? ['Objectif', p.cibleCentimes] : null],
        }))),
        enAttente ? h('p', { class: 'fiche-attente' }, `dont ${formatEuros(enAttente)} au prochain virement · ${formatEuros(vire)} déjà virés`) : h('p', { class: 'fiche-attente' }, 'Tout est viré.')),
      paliersPoche(p, s) ? blocPaliers(p, s) : p.cibleCentimes ? h('div', {},
        barre(s, p.cibleCentimes, { etat: 'laiton', label: `${p.nom} : ${formatEuros(s)} sur ${formatEuros(p.cibleCentimes)}` }),
        h('p', { class: 'petit' }, `${Math.min(100, Math.round((s / p.cibleCentimes) * 100))} % de ${formatEuros(p.cibleCentimes, { sansCentimes: true })}${att ? `, objectif atteint en ${formatMois(att)} au rythme du plan` : ''}.`)) : null,
      h('div', { class: 'groupe-boutons' },
        bouton('Ajouter', () => feuilleMouvement(p, 'versement'), { classe: 'btn-petit btn-principal', icone: 'plus' }),
        bouton('Retirer', () => feuilleMouvement(p, 'reprise'), { classe: 'btn-petit' }),
        pret ? bouton('Plus de détails', async () => { const { feuilleRemboursement } = await import('./remboursement.js'); feuilleRemboursement(p); }, { classe: 'btn-petit', icone: 'info' }) : null),
      pret && prochainPret ? h('p', { class: 'petit' }, `Mensualités prélevées directement sur ton compte courant : ${formatEuros(prochainPret.montantCentimes)} à partir du ${formatDate(prochainPret.date)}. Cette épargne sert à rembourser en avance.`) : null,
      p.type === 'coussin' ? h('p', { class: 'petit' }, 'Uniquement pour les vrais imprévus (panne, santé, perte de revenu).') : null,
      h('h3', { class: 'sous-titre' }, 'Ce qui l’alimente'),
      h('p', { class: 'petit' }, `${p.partRepartition ?? 50} % de l’épargne du mois${partage ? ' et des arrondis' : pocheDesEfforts(etat)?.id === p.id ? ', plus tous les arrondis' : ''}, et ${p.type === 'remboursementAnticipe' ? PARTS_RESTE.pret : p.type === 'coussin' ? PARTS_RESTE.securite : 0} % du reste de chaque journée (ce que tu n’as pas dépensé de ta part du jour : ${PARTS_RESTE.pret} % prêt, ${PARTS_RESTE.securite} % sécurité, ${PARTS_RESTE.envie} % ton envie).`),
      h('button', { type: 'button', class: 'lien', onclick: () => feuilleHistorique() }, `D’où vient chaque ajout (${hst.lignes.filter((l) => !l.enCours && l.montantCentimes).length})`, icone('suivant')),
      h('h3', { class: 'sous-titre' }, 'Historique'),
      mouvements.length ? h('div', { class: 'liste-cles' }, mouvements.map((m) => h('div', { class: 'ligne-cle' },
        h('span', {}, formatDateCourte(m.date), ' · ', m.motif || (m.sens === 'versement' ? 'Virement' : 'Reprise')),
        h('span', { class: m.sens === 'reprise' ? 'negatif-texte' : 'vert-texte' }, m.sens === 'reprise' ? '−' : '+', mt(m.montantCentimes)))))
        : h('p', { class: 'petit' }, 'Aucun virement enregistré pour l’instant. Ils apparaissent ici quand tu touches « J’ai fait le virement ».'),
      p.soldeInitialCentimes ? h('p', { class: 'petit' }, `Solde de départ : ${formatEuros(p.soldeInitialCentimes)}.`) : null,
      h('button', { type: 'button', class: 'lien fiche-modifier', onclick: () => { f.fermer(); editerPoche(p); } }, icone('reglages'), 'Réglages de cette épargne (nom, objectif, compte, part)'),
    ].filter(Boolean));
  };
  dessiner();
  // La fiche suit les changements (versement, retrait, virement de la semaine) tant qu'elle est ouverte
  const desabonner = surChangement(() => dessiner());
  f = ouvrirFeuille({ titre: poche.type === 'remboursementAnticipe' ? 'Épargne prêt' : poche.type === 'coussin' ? 'Épargne sécurité' : poche.nom, contenu, plein: true, onFermer: () => desabonner() });
  return f;
}
