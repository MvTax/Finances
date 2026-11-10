// cockpit.js (v100) — l'Accueil de v100 : un tableau de bord. Le grand cadran dit ce qu'il reste aujourd'hui,
// trois instruments (mois, score, série), six voyants (vert, ambre, rouge), les deux gestes du quotidien,
// le brief du jour, l'envie en cours, les épargnes et la trajectoire sur 12 mois. Mêmes chiffres que l'app d'origine.

import { h, icone, mt, estMasque } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { etatVide, bouton } from '../../ui/composants.js';
import { etat, ecrireMeta } from '../../store.js';
import { aller } from '../../router.js';
import { resteADepenser, jaugeDuJour, depensesVariables } from '../../calculs.js';
import { verdictMois } from '../../verdict.js';
import { previsionFinDeMois } from '../../prevision.js';
import { profilJeu } from '../../jeu.js';
import { aujourdhui, formatJourLong, formatMois } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { blocCoffres } from '../../pages/coffres.js';
import { carteEnvie } from '../../pages/envies.js';
import { elementsATraiter, ligneATraiter } from '../../pages/a-traiter.js';
import { bandeaux, aideJour, puceSansDepense, feuilleVerdict } from '../../pages/accueil.js';
import { phrasePrevision, feuillePrevision } from '../../pages/prevision.js';
import { feuilleJeu } from '../../pages/accueil-joyeux.js';
import { cadran, anneau, etincelle } from '../ui/graphes.js';
import { scoreBudget } from '../strategie/score.js';
import { briefDuJour } from '../strategie/brief.js';
import { projeter } from '../strategie/projection.js';

export const titre = 'Cockpit';

const ICONES_VOYANTS = { jour: 'eclair', compte: 'banque', virement: 'tirelire', enveloppes: 'liste', prelevements: 'calendrier', fin: 'graphique' };
const NOMS_VOYANTS = { jour: 'Jour', compte: 'Compte', virement: 'Épargne', enveloppes: 'Catég.', prelevements: 'Prélèv.', fin: 'Fin mois' };
const ETATS = { ok: 'tout va bien', attention: 'à surveiller', critique: 'alerte', eteint: 'pas de donnée' };
const euros = (c) => (estMasque() ? '•••,•• €' : formatEuros(c));
const eurosRonds = (c) => (estMasque() ? '••• €' : formatEuros(c, { sansCentimes: true }));

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
      h('h1', { class: 'grand-titre' }, etat.profil.prenomAffichage || 'Cockpit'),
      verdict ? h('button', { type: 'button', class: `ck-solde ${verdict.couleur}`, onclick: () => feuilleVerdict(auj), 'aria-label': `${verdict.compte?.nom || 'Compte'} : ${estMasque() ? 'montant masqué' : formatEuros(verdict.soldeCompteCentimes)}. ${verdict.titre}. Voir le détail` },
        h('small', {}, h('i', {}), verdict.compte?.nom || 'Compte'), h('strong', {}, euros(verdict.soldeCompteCentimes))) : null));

  if (!r.revenus.totalCentimes && !etat.transactions.length) {
    vue.replaceChildren(h('div', { class: 'ck' }, entete, etatVide('importer', 'Commence par tes revenus', 'Saisis ton salaire du mois ou importe un relevé : le cockpit s’allume dès qu’il a des chiffres.',
      h('div', { class: 'groupe-boutons' }, bouton('Importer un relevé', () => aller('reglages/import'), { classe: 'btn-principal' })))));
    return;
  }

  // --- Le tableau : cadran + instruments
  const moisDepasse = r.resteCentimes < 0;
  const dispo = j.restantAujourdhuiCentimes;
  const depasse = dispo < 0 && !moisDepasse;
  const etatCadran = moisDepasse ? 'critique' : depasse ? 'attention' : 'ok';
  const part = j.parJourCentimes > 0 ? Math.max(0, dispo) / j.parJourCentimes : 0;
  const montant = moisDepasse ? -r.resteCentimes : Math.abs(dispo);
  const prev = previsionFinDeMois(etat, auj);
  const score = scoreBudget(etat, auj);
  const jeu = profilJeu(etat, auj);
  const budgetMois = Math.max(1, Math.max(0, r.resteCentimes) + depensesVariables(etat, r.periode.debut, auj));
  const instrument = ({ part: p, etat: e = 'ok', centre, nom, valeur, onclick, description }) => h('button', { type: 'button', class: 'ck-instrument', onclick, 'aria-label': description },
    h('span', { class: 'ck-instrument-jauge' }, anneau({ part: p, etat: e }), h('span', { 'aria-hidden': 'true' }, centre)),
    h('span', { class: 'ck-instrument-texte' }, h('small', {}, nom), h('strong', {}, valeur)));
  const tableau = h('section', { class: `ck-tableau ${etatCadran}`, 'aria-labelledby': 'ck-t' },
    h('div', { class: 'ck-cadran' },
      cadran({ part: moisDepasse ? 0 : part, etat: etatCadran, description: moisDepasse ? `Budget du mois dépassé de ${formatEuros(montant)}` : depasse ? `Part du jour dépassée de ${formatEuros(montant)}` : `Il reste ${formatEuros(montant)} sur ${formatEuros(j.parJourCentimes)} aujourd’hui` }),
      h('div', { class: 'ck-cadran-centre' },
        h('h2', { id: 'ck-t', class: 'ck-libelle' }, moisDepasse ? 'MOIS DÉPASSÉ DE' : depasse ? 'DÉPASSÉ AUJOURD’HUI DE' : 'RESTE AUJOURD’HUI', aideJour(r, j)),
        h('p', { class: 'ck-montant' }, euros(montant)),
        h('p', { class: 'ck-sous' }, moisDepasse ? 'Vise zéro dépense aujourd’hui.' : ['sur ', mt(j.parJourCentimes), ' aujourd’hui']))),
    h('div', { class: 'ck-instruments' },
      instrument({ part: moisDepasse ? 0 : Math.max(0, r.resteCentimes) / budgetMois, etat: moisDepasse ? 'critique' : 'ok', centre: `${j.joursRestants}j`, nom: 'MOIS', valeur: eurosRonds(Math.max(0, r.resteCentimes)), onclick: () => aller('strategie/tresorerie'), description: `Reste du mois : ${formatEuros(r.resteCentimes)} pour ${j.joursRestants} jours. Voir la trésorerie` }),
      instrument({ part: score.total / 100, etat: score.total >= 65 ? 'bien' : score.total >= 35 ? 'ok' : 'attention', centre: score.total >= 65 ? '▲' : score.total >= 35 ? '●' : '▼', nom: 'SCORE', valeur: `${score.total} / 100`, onclick: () => aller('strategie'), description: `Score Budget : ${score.total} sur 100, ${score.niveau.nom}. Voir la stratégie` }),
      instrument({ part: Math.min(1, jeu.serie / 7), etat: 'or', centre: '🔥', nom: 'SÉRIE', valeur: `${jeu.serie} jour${jeu.serie > 1 ? 's' : ''}`, onclick: () => feuilleJeu(), description: `Série de ${jeu.serie} jours, niveau ${jeu.niveau.numero}. Voir mes points` })),
    h('div', { class: 'ck-puces' },
      prev && phrasePrevision(prev) ? h('button', { type: 'button', class: `hero-prevision ${prev.alerte ? 'alerte' : ''}`, onclick: () => feuillePrevision() }, icone(prev.alerte ? 'alerte' : 'graphique'), h('span', {}, phrasePrevision(prev))) : null,
      puceSansDepense(j)));

  // --- Voyants
  const brief = briefDuJour(etat, auj);
  const voyantsBloc = h('section', { class: 'ck-voyants', 'aria-label': 'Voyants' }, brief.voyants.map((v) => h('button', { type: 'button', class: `voyant voyant-${v.etat}`, 'aria-label': `${v.nom} : ${ETATS[v.etat]}. ${v.texte}`,
    onclick: () => { if (v.route && v.etat !== 'eteint') aller(v.route); else toast(`${v.nom} : ${v.texte}.`, { duree: 4000 }); } },
    h('span', { class: 'voyant-lampe', 'aria-hidden': 'true' }, icone(ICONES_VOYANTS[v.id])), h('span', { class: 'voyant-nom' }, NOMS_VOYANTS[v.id]))));

  // --- Les deux gestes
  const actions = h('div', { class: 'ck-actions' },
    h('button', { type: 'button', class: 'ck-action ck-action-depense', onclick: async () => { const { ouvrirSaisie } = await import('../../pages/saisie.js'); ouvrirSaisie(); } }, icone('plus'), h('span', {}, 'J’ai dépensé', h('small', {}, 'noter en 5 s'))),
    h('button', { type: 'button', class: 'ck-action', onclick: async () => { const { feuillePrivation } = await import('../../pages/privation.js'); feuillePrivation(); } }, icone('tirelire'), h('span', {}, 'Je me suis privé', h('small', {}, 'vers l’épargne'))));

  // --- Brief du jour : les 2 premières priorités
  const briefBloc = h('section', { class: 'panneau', 'aria-labelledby': 'ck-brief' },
    h('div', { class: 'panneau-tete' }, h('h2', { id: 'ck-brief', class: 'panneau-titre' }, 'Brief du jour'),
      h('button', { type: 'button', class: 'panneau-lien', onclick: () => aller('strategie/coach') }, 'Tout voir', icone('suivant'))),
    h('div', { class: 'priorites' }, brief.priorites.slice(0, 2).map((p) => lignePriorite(p))));

  // --- Trajectoire 12 mois
  let trajectoire = null;
  try {
    const proj = projeter(etat, auj, { nbMois: 12 });
    const L = proj.lignes;
    const pretActif = L[0].capitalPretCentimes > 0 || L.some((l) => l.capitalPretCentimes > 0);
    const prochains = proj.jalons.filter((x) => x.type !== 'survie').slice(0, 2);
    trajectoire = h('section', { class: 'panneau', 'aria-labelledby': 'ck-traj' },
      h('div', { class: 'panneau-tete' }, h('h2', { id: 'ck-traj', class: 'panneau-titre' }, 'Trajectoire 12 mois'),
        h('button', { type: 'button', class: 'panneau-lien', onclick: () => aller('strategie/projection') }, 'Projection', icone('suivant'))),
      h('div', { class: 'ck-trajets' },
        pretActif ? h('div', { class: 'ck-trajet' }, h('small', {}, 'PRÊT RESTANT'), h('strong', {}, eurosRonds(L[0].capitalPretCentimes)), h('em', {}, `${eurosRonds(L[L.length - 1].capitalPretCentimes)} en ${formatMois(L[L.length - 1].mois, true)}`),
          etincelle(L.map((l) => l.capitalPretCentimes), { classe: 'serie-1', description: 'Capital du prêt restant sur 12 mois' })) : null,
        h('div', { class: 'ck-trajet' }, h('small', {}, 'SÉCURITÉ'), h('strong', {}, eurosRonds(L[0].soldeSecuCentimes)), h('em', {}, `${eurosRonds(L[L.length - 1].soldeSecuCentimes)} en ${formatMois(L[L.length - 1].mois, true)}`),
          etincelle(L.map((l) => l.soldeSecuCentimes), { classe: 'serie-4', description: 'Épargne sécurité sur 12 mois' }))),
      prochains.length ? h('ol', { class: 'jalons' }, prochains.map((x) => h('li', { class: `jalon jalon-${x.type}` }, h('span', { class: 'jalon-mois' }, formatMois(x.mois, true)), h('span', { class: 'jalon-titre' }, x.titre)))) : null,
      h('p', { class: 'note' }, 'Si tu continues comme aujourd’hui. Change les hypothèses dans Projection.'));
  } catch (e) { console.warn('Trajectoire', e?.message); }

  const aTraiter = elementsATraiter(bandeaux(r, auj), auj);
  vue.replaceChildren(h('div', { class: 'ck' }, ...[entete, tableau, voyantsBloc, actions, briefBloc, carteEnvie(), blocCoffres(), trajectoire, ligneATraiter(aTraiter)].filter(Boolean)));
}

/** Une priorité du brief : pastille de gravité, titre, phrase ; touche = aller à l'écran concerné. */
export function lignePriorite(p) {
  const NOM = { critique: 'URGENT', attention: 'À FAIRE', bien: 'BIEN', info: 'À SAVOIR' };
  return h('button', { type: 'button', class: `priorite priorite-${p.gravite}`, onclick: () => { if (p.route) aller(p.route); else if (p.detail) toast(p.detail.pourquoi || p.texte, { duree: 6000 }); } },
    h('span', { class: 'priorite-point', 'aria-hidden': 'true' }),
    h('span', {}, h('span', { class: 'priorite-etat' }, NOM[p.gravite]), h('strong', {}, p.titre), h('small', {}, p.texte)),
    p.route ? icone('suivant') : h('span', {}));
}
