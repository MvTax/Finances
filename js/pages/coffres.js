// coffres.js — en tête d'Accueil et d'Épargne : les deux épargnes (prêt, sécurité) et ce qu'il reste à virer cette semaine.

import { h, icone, mt, vibrer } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { champMontant, champ } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat } from '../store.js';
import { aller } from '../router.js';
import { soldePoche } from '../epargne.js';
import { paliersPoche } from '../paliers.js';
import { aVirerEpargne } from '../virements.js';
import { projectionDecouvert } from '../calculs.js';
import { virerSemaine } from '../actions.js';
import { aujourdhui, formatDateCourte, ajouterJours } from '../dates.js';
import { formatEuros } from '../money.js';

const nomPoche = (id) => etat.poches.find((p) => p.id === id)?.nom || 'Épargne';

/** Une case d'épargne : nom, ce qu'il y a dedans, progression vers l'objectif. */
function coffre(p, surClic) {
  const s = soldePoche(p);
  const pal = paliersPoche(p, s);
  const pct = p.cibleCentimes ? Math.min(100, Math.round((s / p.cibleCentimes) * 100)) : 0;
  const classe = p.type === 'remboursementAnticipe' ? 'coffre-pret' : `coffre-secu ${pal?.courant ? pal.courant.classe : 'palier-0'}`;
  return h('button', { type: 'button', class: `coffre ${classe}`, onclick: surClic, 'aria-label': `${p.nom} : ${formatEuros(s)}${p.cibleCentimes ? ` sur ${formatEuros(p.cibleCentimes)}` : ''}` },
    h('span', { class: 'coffre-nom' }, p.type === 'remboursementAnticipe' ? 'Épargne prêt' : 'Épargne sécurité'),
    h('span', { class: 'coffre-solde' }, mt(s)),
    p.cibleCentimes ? h('span', { class: 'coffre-barre', 'aria-hidden': 'true' }, h('span', { style: { width: `${pct}%` } })) : null,
    h('small', { class: 'coffre-detail' }, p.cibleCentimes ? `${pct} % de ${formatEuros(p.cibleCentimes, { sansCentimes: true })}${pal?.courant ? ` · ${pal.courant.nom}` : ''}` : 'sans objectif'));
}

/**
 * Bloc « Mon épargne » : deux cases côte à côte, et la case « À virer » en dessous.
 * @param {{ surPoche?: (poche) => void }} o  clic sur une case (par défaut : aller à la page Épargne)
 */
export function blocCoffres(o = {}) {
  const actives = etat.poches.filter((p) => p.actif !== false);
  const pret = actives.find((p) => p.type === 'remboursementAnticipe');
  const secu = actives.find((p) => p.type === 'coussin');
  const cases = [pret, secu].filter(Boolean);
  if (!cases.length) return null;
  const v = aVirerEpargne(etat, aujourdhui());
  const ouvrir = (p) => (o.surPoche ? o.surPoche(p) : aller('epargne'));
  const repartition = v.parPoche.filter((x) => x.montantCentimes > 0);
  const salaire = formatDateCourte(ajouterJours(v.finPeriode, 1));
  const proj = v.semaineCentimes ? projectionDecouvert(etat, aujourdhui(), { inclureRythme: false, jours: 3 }) : null;
  const risque = proj && proj.soldeActuelCentimes - v.semaineCentimes < 0;

  const virer = h('div', { class: `coffre-virer ${v.semaineCentimes ? '' : 'a-jour'}` },
    h('div', { class: 'coffre-virer-tete' },
      h('span', { class: 'coffre-nom' }, 'Reste à virer vers l’épargne'),
      h('span', { class: 'coffre-virer-montant' }, mt(v.semaineCentimes))),
    h('p', { class: 'coffre-detail' }, v.semaineCentimes
      ? `Cette semaine${repartition.length > 1 ? ' : ' + repartition.map((x) => `${formatEuros(x.montantCentimes)} sur ${nomPoche(x.pocheId)}`).join(', ') : repartition.length ? ` : tout sur ${nomPoche(repartition[0].pocheId)}` : ''}.`
      : 'Rien à virer cette semaine : c’est à jour.'),
    risque ? h('p', { class: 'coffre-detail coffre-alerte' }, icone('alerte'), ' Ton compte courant passerait sous 0 € : vire seulement ce qui ne te met pas à découvert, ou attends le salaire.') : null,
    v.totalCentimes > v.semaineCentimes ? h('p', { class: 'coffre-detail' }, `D’ici le salaire du ${salaire} : ${formatEuros(v.totalCentimes)} en tout.`) : null,
    v.semaineCentimes ? h('button', { type: 'button', class: 'btn btn-principal btn-petit coffre-virer-btn', onclick: () => feuilleVirement(v) }, icone('ok'), h('span', {}, 'J’ai fait le virement')) : null);

  return h('section', { class: 'coffres', 'aria-label': 'Mon épargne' },
    h('div', { class: 'coffres-grille' }, cases.map((p) => coffre(p, () => ouvrir(p)))),
    virer);
}

/** Feuille de confirmation : détail du virement de la semaine, part de l'épargne du mois modifiable. */
function feuilleVirement(v) {
  let mois = v.moisSemaineCentimes;
  const total = h('strong', {});
  const valider = h('button', { type: 'button', class: 'btn btn-principal btn-large' });
  const maj = () => {
    const t = (mois || 0) + v.arrondisCentimes + v.privationsCentimes;
    total.textContent = formatEuros(t);
    valider.textContent = `J’ai viré ${formatEuros(t)}`;
    valider.disabled = !(t > 0) || null;
  };
  const ligne = (libelle, montant) => h('div', { class: 'ligne-cle' }, h('span', {}, libelle), mt(montant));
  const champMois = v.moisRestantCentimes ? champ('Épargne du mois', champMontant({ valeur: mois, label: 'Épargne du mois virée', onValeur: (c) => { mois = c && c > 0 ? c : 0; maj(); } }),
    `Proposé : ${formatEuros(v.moisSemaineCentimes)} cette semaine (il reste ${formatEuros(v.moisRestantCentimes)} à mettre ce mois-ci). Change le montant si tu as viré autre chose.`) : null;
  valider.addEventListener('click', async () => {
    valider.disabled = true;
    const t = await virerSemaine({ epargneMoisCentimes: mois || 0, auto: v.privationsAuto });
    vibrer(20); f.fermer();
    toast(`${formatEuros(t)} virés sur ton épargne. Bravo !`, { type: 'succes' });
  });
  maj();
  const f = ouvrirFeuille({
    titre: 'Virement de la semaine',
    contenu: h('div', { class: 'formulaire' },
      h('p', { class: 'petit' }, 'Fais le virement depuis ton appli bancaire, puis confirme ici : les montants passent dans tes épargnes.'),
      champMois,
      h('div', { class: 'liste-cles' },
        v.arrondisCentimes ? ligne('Arrondis', v.arrondisCentimes) : null,
        v.privationsCentimes ? ligne('Repas à la maison et privations', v.privationsCentimes) : null,
        h('div', { class: 'ligne-cle forte' }, h('span', {}, 'Total à virer'), total)),
      v.parPoche.length > 1 ? h('p', { class: 'petit' }, 'Répartition prévue : ', v.parPoche.map((x) => `${formatEuros(x.montantCentimes)} sur ${nomPoche(x.pocheId)}`).join(', '), '.') : null,
      valider),
  });
  return f;
}
