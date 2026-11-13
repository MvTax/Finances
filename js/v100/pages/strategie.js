// strategie.js (v100) — l'onglet Stratégie : tout ce que l'app calcule, rangé en une liste. Chaque ligne donne
// son résultat en quelques mots ; la toucher ouvre l'outil complet (#strategie/<outil>), avec ses schémas.

import { h, icone, estMasque } from '../../ui/dom.js';
import { etat } from '../../store.js';
import { aller } from '../../router.js';
import { aujourdhui, formatMois, formatDateCourte } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { partsReste } from '../../envies.js';
import { entete } from '../ui/blocs.js';
import { scoreBudget } from '../strategie/score.js';
import { projeter } from '../strategie/projection.js';
import { statsDepenses } from '../strategie/stats.js';
import { suiviEnveloppes } from '../strategie/enveloppes.js';
import { tresorerie } from '../strategie/tresorerie.js';
import { briefDuJour } from '../strategie/brief.js';
import { creditPrincipal } from '../strategie/pret.js';

export const titre = 'Stratégie';

const OUTILS = {
  score: () => import('./s-score.js'),
  pret: () => import('./s-pret.js'),
  projection: () => import('./s-projection.js'),
  habitudes: () => import('./s-habitudes.js'),
  coach: () => import('./s-coach.js'),
  categories: () => import('./s-categories.js'),
  repartition: () => import('./s-repartition.js'),
  tresorerie: () => import('./s-tresorerie.js'),
};
let jeton = 0;
const eur = (c) => (estMasque() ? '•••,•• €' : formatEuros(c));
const rond = (c) => (estMasque() ? '••• €' : formatEuros(c, { sansCentimes: true }));
/** Un résultat en quelques mots ; si le calcul échoue, la ligne reste, sans résultat. */
const essayer = (fn) => { try { return fn(); } catch (e) { console.warn('Stratégie', e?.message); return null; } };

export function rendre(vue, params = []) {
  const outil = OUTILS[params[0]];
  if (outil) {
    const moi = jeton += 1;
    outil().then((m) => { if (moi === jeton) m.rendre(vue, params.slice(1)); }).catch((e) => { vue.replaceChildren(h('div', { class: 'etat-vide' }, h('h2', {}, 'Cet outil n’a pas pu s’afficher'), h('p', {}, e.message))); });
    return;
  }
  jeton += 1;
  const auj = aujourdhui();
  const score = essayer(() => scoreBudget(etat, auj));
  const proj = essayer(() => projeter(etat, auj, { nbMois: 24 }));
  const st = essayer(() => statsDepenses(etat, auj));
  const env = essayer(() => suiviEnveloppes(etat, auj));
  const tr = essayer(() => tresorerie(etat, auj));
  const brief = essayer(() => briefDuJour(etat, auj));
  const parts = partsReste(etat);
  const jalon = (type) => proj?.jalons.find((x) => x.type === type);
  const prochain = proj?.jalons.find((x) => x.type !== 'survie');
  const aFaire = brief ? brief.priorites.filter((p) => p.gravite === 'critique' || p.gravite === 'attention').length : 0;

  const ligne = (ic, nom, resultat, route, classe = '') => h('button', { type: 'button', class: `ck-ligne ${classe}`, onclick: () => aller(route) },
    h('span', { class: 'ck-ligne-icone', 'aria-hidden': 'true' }, icone(ic)),
    h('span', { class: 'ck-ligne-texte' }, h('span', { class: 'ck-ligne-nom' }, nom), resultat ? h('small', {}, resultat) : null),
    icone('suivant'));

  const liste = h('section', { class: 'ck-lignes st-liste', 'aria-label': 'Ce que l’app calcule' },
    score ? ligne('etoile', 'Score Budget', `${score.total} sur 100, ${score.niveau.nom.toLowerCase()}`, 'strategie/score') : null,
    brief ? ligne('eclair', 'Brief du jour', aFaire ? `${aFaire} chose${aFaire > 1 ? 's' : ''} à faire` : 'rien d’urgent aujourd’hui', 'strategie/coach', aFaire ? 'a-faire' : '') : null,
    creditPrincipal(etat) ? ligne('banque', 'Plan du prêt', jalon('pretSolde') ? `soldé vers ${formatMois(jalon('pretSolde').mois)} à ce rythme` : 'date de fin, coût, meilleur rythme', 'strategie/pret') : null,
    ligne('graphique', 'Projection', prochain ? `${prochain.titre.toLowerCase()} en ${formatMois(prochain.mois)}` : 'les 12 prochains mois et tes « et si »', 'strategie/projection'),
    ligne('historique', 'Mes habitudes', st?.jours ? `${eur(st.recents.moyenne)} par jour en moyenne` : 'tes statistiques arrivent dès demain', 'strategie/habitudes'),
    ligne('liste', 'Catégories', env?.lignes.length ? (env.alertes.length ? `${env.alertes.length} à surveiller` : 'tout est dans les clous') : 'tes plafonds par catégorie', 'strategie/categories', env?.alertes.length ? 'a-faire' : ''),
    ligne('tirelire', 'Répartition', `${parts.pret} % prêt, ${parts.securite} % sécurité, ${parts.envie} % envie`, 'strategie/repartition'),
    tr ? ligne('calendrier', 'Trésorerie', `au plus bas ${rond(Math.min(tr.plusBas.soldeCentimes, tr.plusBasRythme.soldeCentimes))} le ${formatDateCourte(tr.plusBasRythme.soldeCentimes < tr.plusBas.soldeCentimes ? tr.plusBasRythme.date : tr.plusBas.date)}`, 'strategie/tresorerie', tr.risque === 'decouvert' ? 'a-faire' : '') : null);

  const outilBouton = (ic, nom, action) => h('button', { type: 'button', class: 'outil-mini', onclick: action }, icone(ic), h('span', {}, nom));
  const outils = h('section', { class: 'outils-mini', 'aria-label': 'Autres outils' },
    outilBouton('boucle', 'Abonnements', () => aller('abonnements')),
    outilBouton('graphique', 'Mois passés', () => aller('statistiques')),
    outilBouton('ok', 'Recalcul complet', async () => { const { feuilleRecalcul } = await import('../../pages/recalcul.js'); feuilleRecalcul(); }),
    outilBouton('panier', 'Et si j’achète ?', async () => { const { feuilleSimulateurAchat } = await import('../../pages/simulateur-achat.js'); feuilleSimulateurAchat(); }));

  vue.replaceChildren(h('div', { class: 'st' }, entete('Stratégie', 'Tout ce que l’app calcule pour toi. Touche une ligne pour voir le détail et les schémas.', { retour: null }), liste, outils));
}
