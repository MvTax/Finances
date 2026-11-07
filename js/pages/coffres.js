// coffres.js — en tête d'Accueil et d'Épargne : les deux épargnes (prêt, sécurité) et le prochain virement (tous les 3 jours).

import { h, icone, mt, vibrer } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { champMontant, champ } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat } from '../store.js';
import { aller } from '../router.js';
import { soldePoche } from '../epargne.js';
import { paliersPoche } from '../paliers.js';
import { aVirerEpargne, historiqueCagnotte, compteEpargne, pocheDesEfforts, libelleVirement, JOURS_PAR_VIREMENT } from '../virements.js';
import { projectionDecouvert } from '../calculs.js';
import { virerSemaine } from '../actions.js';
import { aujourdhui, formatDateCourte, formatJourLong, ajouterJours } from '../dates.js';
import { ajouterAuCalendrier } from '../ics.js';
import { formatEuros } from '../money.js';
import { aide } from '../ui/aide.js';
import { feter } from '../ui/fete.js';
import { POINTS } from '../jeu.js';

const nomPoche = (id) => etat.poches.find((p) => p.id === id)?.nom || 'Épargne';
/** « ton Livret A LCL (Prêt 8 000 €) » ou le nom de la poche si son compte n'est pas renseigné. */
const ouVirer = (id) => { const p = etat.poches.find((x) => x.id === id); const c = compteEpargne(p); return c ? `${/^livret/i.test(c) ? 'ton ' : ''}${c} (${p.type === 'coussin' ? 'sécurité' : p.type === 'remboursementAnticipe' ? 'prêt' : p.nom})` : nomPoche(id); };

/**
 * Une ligne par virement à faire : montant, compte, et le libellé à mettre dans l'appli bancaire (« Epargne 5/6/7 nov Pret »),
 * avec un bouton pour le copier.
 */
function ligneVirement(x, jours) {
  const p = etat.poches.find((q) => q.id === x.pocheId);
  const libelle = libelleVirement(jours, p);
  const copier = h('button', { type: 'button', class: 'btn-copier', 'aria-label': `Copier le libellé ${libelle}`, onclick: async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(libelle); toast(`Libellé copié : ${libelle}`, { type: 'succes' }); }
    catch { toast(`Libellé : ${libelle}`); }
  } }, icone('copier'), h('span', {}, 'Copier'));
  return h('div', { class: 'virement-ligne' },
    h('div', { class: 'virement-ligne-haut' }, h('strong', {}, formatEuros(x.montantCentimes)), h('span', {}, ` sur ${ouVirer(x.pocheId)}`)),
    h('small', { class: 'virement-libelle-titre' }, 'Libellé à mettre dans le virement'),
    h('div', { class: 'virement-ligne-libelle' }, h('span', { class: 'virement-libelle' }, libelle), copier));
}

/**
 * Une case d'épargne : ce qu'il y a dedans, mis à jour tout de suite avec sa part de ce qui reste à virer
 * (le partage entre les deux épargnes se fait dès que la cagnotte augmente, sans attendre le virement).
 */
function coffre(p, enAttente, surClic) {
  const vire = soldePoche(p);
  const s = vire + enAttente;
  const pal = paliersPoche(p, s);
  const pct = p.cibleCentimes ? Math.min(100, Math.round((s / p.cibleCentimes) * 100)) : 0;
  const pctVire = p.cibleCentimes ? Math.min(pct, Math.round((vire / p.cibleCentimes) * 100)) : 0;
  const classe = p.type === 'remboursementAnticipe' ? 'coffre-pret' : `coffre-secu ${pal?.courant ? pal.courant.classe : 'palier-0'}`;
  return h('button', { type: 'button', class: `coffre ${classe}`, onclick: surClic,
    'aria-label': `${p.nom} : ${formatEuros(s)}${enAttente ? `, dont ${formatEuros(enAttente)} à virer` : ''}${p.cibleCentimes ? ` sur ${formatEuros(p.cibleCentimes)}` : ''}` },
    h('span', { class: 'coffre-nom' }, p.type === 'remboursementAnticipe' ? 'Épargne prêt' : 'Épargne sécurité'),
    compteEpargne(p) ? h('small', { class: 'coffre-compte' }, compteEpargne(p)) : null,
    h('span', { class: 'coffre-solde' }, mt(s)),
    p.cibleCentimes ? h('span', { class: 'coffre-barre', 'aria-hidden': 'true' },
      h('span', { class: 'coffre-barre-vire', style: { width: `${pctVire}%` } }),
      enAttente ? h('span', { class: 'coffre-barre-attente', style: { width: `${Math.max(0, pct - pctVire)}%` } }) : null) : null,
    enAttente ? h('small', { class: 'coffre-attente' }, `dont ${formatEuros(enAttente)} à virer`) : null,
    h('small', { class: 'coffre-detail' }, p.cibleCentimes ? `${pct} % de ${formatEuros(p.cibleCentimes, { sansCentimes: true })}${pal?.courant ? ` · ${pal.courant.nom}` : ''}` : 'sans objectif'));
}

const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);

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
  const auj = aujourdhui();
  const v = aVirerEpargne(etat, auj);
  const ouvrir = async (p) => { if (o.surPoche) return o.surPoche(p); const { ficheEpargne } = await import('./fiche-epargne.js'); ficheEpargne(p); };
  const repartition = v.parPoche.filter((x) => x.montantCentimes > 0);
  const attente = (id) => v.parPoche.find((x) => x.pocheId === id)?.montantCentimes || 0;
  const salaire = formatDateCourte(ajouterJours(v.finPeriode, 1));
  const proj = v.semaineCentimes ? projectionDecouvert(etat, auj, { inclureRythme: false, jours: 3 }) : null;
  const risque = proj && proj.soldeActuelCentimes - v.semaineCentimes < 0;
  const quand = !v.semaineCentimes ? `Prochain virement : ${formatJourLong(v.dateVirement)}`
    : v.dateVirement === auj ? (v.enRetard ? `À faire aujourd’hui (prévu ${formatJourLong(v.datePrevue)})` : 'À faire aujourd’hui')
      : `À faire le ${formatJourLong(v.dateVirement)}`;
  const rappel = () => ajouterAuCalendrier({ uid: 'virement-epargne-3-jours@budget', titre: 'Virement vers l’épargne', description: 'Ouvre Budget : la case « Reste à virer vers l’épargne » donne les montants et les libellés à copier.', date: v.dateVirement, heure: '19:00', recurrence: 'TOUS_LES_3_JOURS', nomFichier: 'virement-epargne' });

  const virer = h('div', { class: `coffre-virer ${v.semaineCentimes ? '' : 'a-jour'} ${v.enRetard ? 'en-retard' : ''}` },
    h('button', { type: 'button', class: 'coffre-virer-tete', onclick: () => feuilleHistorique(), 'aria-label': `Reste à virer vers l’épargne : ${formatEuros(v.semaineCentimes)}. Voir l’historique de la cagnotte` },
      h('span', { class: 'coffre-nom' }, 'Reste à virer vers l’épargne'),
      h('span', { class: 'coffre-virer-montant' }, mt(v.semaineCentimes), icone('suivant'))),
    h('p', { class: 'coffre-virer-date' }, icone('calendrier'), h('span', {}, majuscule(quand)), h('small', { class: 'coffre-virer-numero' }, `virement ${v.numeroProchain} sur ${v.nbVirements}`)),
    v.semaineCentimes ? h('div', { class: 'virements-libelles' }, repartition.map((x) => ligneVirement(x, v.joursCouverts))) : h('p', { class: 'coffre-detail' }, 'Rien à virer pour l’instant : c’est à jour.'),
    v.semaineCentimes ? h('p', { class: 'coffre-detail' }, 'Déjà compté dans tes épargnes ci-dessus.') : null,
    risque ? h('p', { class: 'coffre-detail coffre-alerte' }, icone('alerte'), ' Ton compte courant passerait sous 0 € : vire seulement ce qui ne te met pas à découvert, ou attends le salaire.') : null,
    v.totalCentimes > v.semaineCentimes ? h('p', { class: 'coffre-detail' }, `D’ici le salaire du ${salaire} : ${formatEuros(v.totalCentimes)} en tout.`) : null,
    h('div', { class: 'groupe-boutons coffre-virer-boutons' },
      v.semaineCentimes ? h('button', { type: 'button', class: 'btn btn-principal btn-petit', onclick: () => feuilleVirement(v) }, icone('ok'), h('span', {}, 'J’ai fait le virement')) : null,
      h('button', { type: 'button', class: 'btn btn-secondaire btn-petit', onclick: () => feuilleHistorique() }, icone('historique'), h('span', {}, 'Historique')),
      h('button', { type: 'button', class: 'btn btn-secondaire btn-petit', onclick: rappel }, icone('calendrier'), h('span', {}, `Rappel tous les ${JOURS_PAR_VIREMENT} jours`))));

  return h('section', { class: 'coffres', 'aria-label': 'Mon épargne' },
    h('p', { class: 'coffres-titre' }, 'Mon épargne', aide('Mon épargne', () => ({
      texte: `Chaque case montre ce qui est déjà viré sur l’épargne, plus sa part du prochain virement (« dont … à virer »). « Reste à virer » regroupe la part de l’épargne du mois (un virement tous les ${JOURS_PAR_VIREMENT} jours, ${v.nbVirements} ce mois-ci : le ${v.datesVirements.map((d) => Number(d.slice(8))).join(', ')}), les arrondis, les repas à la maison, les privations et les restes du jour pas encore virés.`,
      lignes: [['Part de l’épargne du mois (ce virement)', v.moisSemaineCentimes], ['Arrondis', v.arrondisCentimes], ['Repas, privations, restes du jour', v.privationsCentimes], ['= reste à virer', v.semaineCentimes, 'forte'], ['Épargne du mois prévue', v.moisCibleCentimes], ['Déjà virée ce mois-ci', v.moisDejaCentimes]],
      note: 'Partage : 50 % sécurité, 50 % prêt (réglable dans « Mon système d’épargne »).',
    }))),
    h('div', { class: 'coffres-grille' }, cases.map((p) => coffre(p, attente(p.id), () => ouvrir(p)))),
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
    `Proposé : ${formatEuros(v.moisSemaineCentimes)} pour ce virement (${v.numeroVirement} sur ${v.nbVirements} ; il reste ${formatEuros(v.moisRestantCentimes)} à mettre ce mois-ci). Change le montant si tu as viré autre chose.`) : null;
  valider.addEventListener('click', async () => {
    valider.disabled = true;
    const t = await virerSemaine({ epargneMoisCentimes: mois || 0, auto: v.privationsAuto });
    vibrer(20); f.fermer();
    feter('virement', { xp: POINTS.virement, texte: 'virement fait' });
    toast(`${formatEuros(t)} virés sur ton épargne. Bravo !`, { type: 'succes' });
  });
  maj();
  const f = ouvrirFeuille({
    titre: `Virement ${v.numeroVirement} sur ${v.nbVirements}`,
    contenu: h('div', { class: 'formulaire' },
      h('p', { class: 'petit' }, `Fais le virement depuis ton appli bancaire${v.dateVirement === aujourdhui() ? '' : ` (prévu le ${formatJourLong(v.dateVirement)})`}, puis confirme ici : la case « Reste à virer » repasse à 0 €.`),
      champMois,
      h('div', { class: 'liste-cles' },
        v.arrondisCentimes ? ligne('Arrondis', v.arrondisCentimes) : null,
        v.privationsCentimes ? ligne('Restes du jour, repas et privations', v.privationsCentimes) : null,
        h('div', { class: 'ligne-cle forte' }, h('span', {}, 'Total à virer'), total)),
      v.parPoche.length ? h('div', { class: 'virements-libelles' }, v.parPoche.filter((x) => x.montantCentimes > 0).map((x) => ligneVirement(x, v.joursCouverts))) : null,
      valider),
  });
  return f;
}

const SOURCES = {
  arrondi: { icone: 'pieces', nom: 'Arrondi', total: 'Arrondis' },
  repas: { icone: 'burger', nom: 'Repas à la maison', total: 'Repas à la maison' },
  privation: { icone: 'tirelire', nom: 'Privation', total: 'Privations' },
  reste: { icone: 'sablier', nom: 'Reste du jour', total: 'Restes du jour' },
  mois: { icone: 'calendrier', nom: 'Épargne du mois', total: 'Épargne du mois' },
};

/** Historique de la cagnotte : chaque ajout du mois, sa source, et s'il est déjà viré. */
export function feuilleHistorique() {
  const hst = historiqueCagnotte(etat, aujourdhui());
  let filtre = 'tout';
  const liste = h('div', { class: 'histo-liste' });
  const parSource = (src) => hst.lignes.filter((l) => l.source === src && !l.enCours).reduce((s, l) => s + l.montantCentimes, 0);
  const dessiner = () => {
    const lignes = hst.lignes.filter((l) => filtre === 'tout' || l.source === filtre);
    let jour = null;
    const items = [];
    for (const l of lignes) {
      if (l.date !== jour) { jour = l.date; items.push(h('h3', { class: 'histo-jour' }, l.date === aujourdhui() ? 'Aujourd’hui' : formatJourLong(l.date))); }
      const src = SOURCES[l.source];
      items.push(h('div', { class: `histo-ligne histo-${l.source}${l.enCours ? ' en-cours' : ''}` },
        h('span', { class: 'histo-icone', 'aria-hidden': 'true' }, icone(src.icone)),
        h('span', { class: 'histo-texte' }, h('strong', {}, l.libelle), h('small', {}, l.libelle === src.nom ? l.detail : `${src.nom} · ${l.detail}`)),
        h('span', { class: 'histo-droite' }, h('span', { class: `histo-montant ${l.montantCentimes ? '' : 'nul'}` }, l.enCours ? '≈ ' : '', l.montantCentimes ? '+' : '', mt(l.montantCentimes)),
          h('small', { class: l.enCours ? 'histo-encours' : l.vireLe ? 'histo-vire' : l.montantCentimes ? 'histo-attente' : 'histo-vire' }, l.enCours ? 'à 5 h' : l.vireLe ? `viré le ${formatDateCourte(l.vireLe)}` : l.montantCentimes ? 'à virer' : 'rien à virer'))));
    }
    liste.replaceChildren(...(items.length ? items : [h('p', { class: 'petit' }, 'Rien pour l’instant.')]));
  };
  const filtres = h('div', { class: 'histo-filtres', role: 'group', 'aria-label': 'Filtrer par source' },
    [['tout', 'Tout'], ['arrondi', 'Arrondis'], ['reste', 'Restes du jour'], ['repas', 'Repas'], ['privation', 'Privations'], ['mois', 'Épargne du mois']]
      .filter(([k]) => k === 'tout' || hst.lignes.some((l) => l.source === k))
      .map(([k, t]) => h('button', { type: 'button', class: `histo-filtre ${k === filtre ? 'actif' : ''}`, 'aria-pressed': String(k === filtre),
        onclick: (e) => { filtre = k; for (const b of filtres.children) { b.classList.toggle('actif', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); } dessiner(); } }, t)));
  dessiner();
  return ouvrirFeuille({
    titre: 'Historique de la cagnotte',
    plein: true,
    contenu: h('div', { class: 'histo' },
      h('div', { class: 'histo-resume' },
        h('div', {}, h('small', {}, 'À virer'), h('strong', {}, mt(hst.aVirerCentimes))),
        h('div', {}, h('small', {}, 'Déjà viré ce mois-ci'), h('strong', {}, mt(hst.vireCentimes)))),
      h('div', { class: 'liste-cles histo-sources' }, Object.entries(SOURCES).filter(([k]) => parSource(k)).map(([k, s]) => h('div', { class: 'ligne-cle' }, h('span', {}, s.total), mt(parSource(k))))),
      h('p', { class: 'petit' }, `Depuis le salaire du ${formatDateCourte(hst.periode.debut)}. ${pocheDesEfforts(etat) ? `Arrondis, repas et privations vont sur ${nomPoche(pocheDesEfforts(etat).id)} ; l’épargne du mois est partagée entre tes deux épargnes.` : 'Chaque ajout est partagé entre tes deux épargnes dès qu’il apparaît, sans attendre le virement.'}`),
      filtres, liste),
  });
}
