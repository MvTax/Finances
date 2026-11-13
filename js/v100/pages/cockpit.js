// cockpit.js (v100) — l'Accueil de v100, volontairement court : ce qu'il reste aujourd'hui, les deux gestes du quotidien,
// puis trois lignes (épargne, mois, série), l'envie en cours et, s'il y en a une, la chose à faire.
// Aucun calcul n'est affiché ici : chaque « ? » ouvre une fiche (fiches.js) avec le schéma, le calcul et les statistiques.
// Le score, les voyants, la projection et les outils vivent dans l'onglet Stratégie.

import { h, icone, mt, estMasque } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { etatVide, bouton } from '../../ui/composants.js';
import { etat, ecrireMeta } from '../../store.js';
import { aller } from '../../router.js';
import { resteADepenser, jaugeDuJour } from '../../calculs.js';
import { verdictMois } from '../../verdict.js';
import { profilJeu } from '../../jeu.js';
import { aujourdhui, formatJourLong, formatDateCourte } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { carteEnvie } from '../../pages/envies.js';
import { elementsATraiter, ligneATraiter } from '../../pages/a-traiter.js';
import { bandeaux, puceSansDepense, feuilleVerdict } from '../../pages/accueil.js';
import { feuilleJeu } from '../../pages/accueil-joyeux.js';
import { cadran } from '../ui/graphes.js';
import { briefDuJour } from '../strategie/brief.js';
import { boutonQ, ficheJour, ficheMois, ficheEpargne, totalEpargne } from './fiches.js';

export const titre = 'Accueil';

const euros = (c) => (estMasque() ? '•••,•• €' : formatEuros(c));

/** Une ligne de l'Accueil : un nom, un chiffre, et le « ? » qui ouvre l'explication. */
function ligne({ ic, nom, valeur, sous = null, ouvrir, classe = '' }) {
  return h('button', { type: 'button', class: `ck-ligne ${classe}`, onclick: ouvrir },
    h('span', { class: 'ck-ligne-icone', 'aria-hidden': 'true' }, ic.length <= 2 ? ic : icone(ic)),
    h('span', { class: 'ck-ligne-texte' }, h('span', { class: 'ck-ligne-nom' }, nom), sous ? h('small', {}, sous) : null),
    h('strong', { class: 'ck-ligne-valeur' }, valeur),
    h('span', { class: 'q', 'aria-hidden': 'true' }, '?'),
    h('span', { class: 'sr' }, '. Plus d’explications'));
}

export function rendre(vue) {
  const auj = aujourdhui();
  const r = resteADepenser(etat, auj);
  const j = jaugeDuJour(etat, auj, etat.meta.jauge || null);
  const j0 = etat.meta.jauge;
  if (!j0 || j0.date !== j.instantane.date || j0.mois !== j.instantane.mois || j0.baseCentimes !== j.instantane.baseCentimes) ecrireMeta('jauge', j.instantane);
  document.documentElement.classList.remove('mode-critique');
  const jour = formatJourLong(auj);
  const verdict = etat.comptes.length ? verdictMois(etat, auj) : null;
  const entete = h('header', { class: 'ck-tete' },
    h('div', { class: 'ck-entete' },
      h('p', { class: 'ck-date' }, jour.charAt(0).toUpperCase() + jour.slice(1)),
      h('a', { class: 'btn-icone', href: '#reglages', 'aria-label': 'Réglages' }, icone('reglages'))),
    h('div', { class: 'ck-salut' },
      h('h1', { class: 'grand-titre' }, etat.profil.prenomAffichage || 'Accueil'),
      verdict ? h('button', { type: 'button', class: `ck-solde ${verdict.couleur}`, onclick: () => feuilleVerdict(auj), 'aria-label': `${verdict.compte?.nom || 'Compte'} : ${estMasque() ? 'montant masqué' : formatEuros(verdict.soldeCompteCentimes)}. ${verdict.titre}. Voir le détail` },
        h('small', {}, h('i', {}), verdict.compte?.nom || 'Compte'), h('strong', {}, euros(verdict.soldeCompteCentimes))) : null));

  if (!r.revenus.totalCentimes && !etat.transactions.length) {
    vue.replaceChildren(h('div', { class: 'ck' }, entete, etatVide('importer', 'Commence par tes revenus', 'Saisis ton salaire du mois ou importe un relevé : l’Accueil s’allume dès qu’il a des chiffres.',
      h('div', { class: 'groupe-boutons' }, bouton('Importer un relevé', () => aller('reglages/import'), { classe: 'btn-principal' })))));
    return;
  }

  // --- Le cadran : ce qu'il reste aujourd'hui, et rien d'autre
  const moisDepasse = r.resteCentimes < 0;
  const dispo = j.restantAujourdhuiCentimes;
  const depasse = dispo < 0 && !moisDepasse;
  const etatCadran = moisDepasse ? 'critique' : depasse ? 'attention' : 'ok';
  const part = j.parJourCentimes > 0 ? Math.max(0, dispo) / j.parJourCentimes : 0;
  const montant = moisDepasse ? -r.resteCentimes : Math.abs(dispo);
  const tableau = h('section', { class: `ck-tableau ${etatCadran}`, 'aria-labelledby': 'ck-t' },
    h('div', { class: 'ck-cadran' },
      cadran({ part: moisDepasse ? 0 : part, etat: etatCadran, description: moisDepasse ? `Budget du mois dépassé de ${formatEuros(montant)}` : depasse ? `Part du jour dépassée de ${formatEuros(montant)}` : `Il reste ${formatEuros(montant)} sur ${formatEuros(j.parJourCentimes)} aujourd’hui` }),
      h('div', { class: 'ck-cadran-centre' },
        h('h2', { id: 'ck-t', class: 'ck-libelle' }, moisDepasse ? 'MOIS DÉPASSÉ DE' : depasse ? 'DÉPASSÉ AUJOURD’HUI DE' : 'RESTE AUJOURD’HUI', boutonQ('ce que tu peux dépenser aujourd’hui', ficheJour)),
        h('p', { class: 'ck-montant' }, euros(montant)),
        h('p', { class: 'ck-sous' }, moisDepasse ? 'Vise zéro dépense aujourd’hui.' : ['sur ', mt(j.parJourCentimes), ' aujourd’hui']))),
    h('div', { class: 'ck-puces' }, puceSansDepense(j)));

  // --- Les deux gestes
  const actions = h('div', { class: 'ck-actions' },
    h('button', { type: 'button', class: 'ck-action ck-action-depense', onclick: async () => { const { ouvrirSaisie } = await import('../../pages/saisie.js'); ouvrirSaisie(); } }, icone('plus'), h('span', {}, 'J’ai dépensé')),
    h('button', { type: 'button', class: 'ck-action', onclick: async () => { const { feuillePrivation } = await import('../../pages/privation.js'); feuillePrivation(); } }, icone('tirelire'), h('span', {}, 'Je me suis privé')));

  // --- Trois lignes : épargne, mois, série
  const ep = totalEpargne(auj);
  const jeu = profilJeu(etat, auj);
  const lignes = h('section', { class: 'ck-lignes', 'aria-label': 'En bref' },
    ep.poches.length ? ligne({ ic: 'tirelire', nom: 'Ton épargne', valeur: euros(ep.totalCentimes), sous: ep.aVirerCentimes ? ['dont ', mt(ep.aVirerCentimes), ' à virer'] : 'tout est viré', ouvrir: ficheEpargne }) : null,
    ligne({ ic: 'calendrier', nom: 'Ce mois-ci', valeur: moisDepasse ? `−${euros(-r.resteCentimes)}` : euros(r.resteCentimes), sous: moisDepasse ? 'budget dépassé' : `pour ${j.joursRestants} jour${j.joursRestants > 1 ? 's' : ''}, jusqu’au ${formatDateCourte(r.periode.fin)}`, ouvrir: ficheMois, classe: moisDepasse ? 'alerte' : '' }),
    ligne({ ic: '🔥', nom: 'Ta série', valeur: `${jeu.serie} jour${jeu.serie > 1 ? 's' : ''}`, sous: `niveau ${jeu.niveau.numero}, ${jeu.niveau.nom.toLowerCase()}`, ouvrir: () => feuilleJeu() }));

  // --- Une seule chose à faire, quand il y en a une
  const premiere = briefDuJour(etat, auj).priorites.find((p) => p.gravite === 'critique' || p.gravite === 'attention');
  const aFaire = premiere ? h('button', { type: 'button', class: `ck-afaire ck-afaire-${premiere.gravite}`, onclick: () => { if (premiere.route) aller(premiere.route); else toast(premiere.detail?.pourquoi || premiere.texte, { duree: 6000 }); } },
    h('span', { class: 'ck-afaire-point', 'aria-hidden': 'true' }),
    h('span', {}, h('small', {}, premiere.gravite === 'critique' ? 'Urgent' : 'À faire'), h('strong', {}, premiere.titre)),
    icone('suivant')) : null;

  const aTraiter = elementsATraiter(bandeaux(r, auj), auj);
  const comprendre = h('button', { type: 'button', class: 'ck-comprendre', onclick: () => aller('strategie') }, h('span', {}, 'Tout comprendre : score, prêt, projection'), icone('suivant'));
  vue.replaceChildren(h('div', { class: 'ck' }, ...[entete, tableau, actions, aFaire, lignes, carteEnvie(), ligneATraiter(aTraiter), comprendre].filter(Boolean)));
}

/** Une priorité du brief : pastille de gravité, titre, phrase ; touche = aller à l'écran concerné. */
export function lignePriorite(p) {
  const NOM = { critique: 'URGENT', attention: 'À FAIRE', bien: 'BIEN', info: 'À SAVOIR' };
  return h('button', { type: 'button', class: `priorite priorite-${p.gravite}`, onclick: () => { if (p.route) aller(p.route); else if (p.detail) toast(p.detail.pourquoi || p.texte, { duree: 6000 }); } },
    h('span', { class: 'priorite-point', 'aria-hidden': 'true' }),
    h('span', {}, h('span', { class: 'priorite-etat' }, NOM[p.gravite]), h('strong', {}, p.titre), h('small', {}, p.texte)),
    p.route ? icone('suivant') : h('span', {}));
}
