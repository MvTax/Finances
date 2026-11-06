// accueil.js — l'écran qui se comprend en 2 secondes : reste à dépenser, jauge du jour, risque de découvert.

import { h, icone, mt, animerMontant, estMasque } from '../ui/dom.js';
import { carte, barre, bandeau, bouton, etatVide } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { etat, ecrireMeta, enregistrer } from '../store.js';
import { aller } from '../router.js';
import { resteADepenser, jaugeDuJour, soldes, projectionDecouvert, epargneDuMois, depensesVariables, coutDecouvert, reliquat, periodeBudget, estDepenseQuotidienne } from '../calculs.js';
import { prochainVirementArrondis, soldePoche } from '../epargne.js';
import { raisonner } from '../raisonnement.js';
import { aVenir } from './avenir.js';
import { listerAbonnements } from '../abonnements.js';
import { aujourdhui, ajouterJours, formatDate, formatDateCourte, formatJourLong, formatMois, diffJours, moisDe, dateDuMois } from '../dates.js';
import { formatEuros } from '../money.js';
import { categorie, contributionDepense } from '../categories.js';
import { exporterSauvegarde, feuilleRevenus } from './communs.js';
import { enregistrerVirementEpargne, virerArrondis, payerEcheancePret, payerEcheanceCredit } from '../actions.js';
import { ajouterAuCalendrier } from '../ics.js';
import { plafondEffectif } from './budgets.js';
import { blocCoffres } from './coffres.js';

export const titre = 'Accueil';
let dernierReste = null;

export function rendre(vue) {
  const auj = aujourdhui();
  const r = resteADepenser(etat, auj);
  const jauge = jaugeDuJour(etat, auj, etat.meta.jauge || null);
  const j0 = etat.meta.jauge;
  if (!j0 || j0.date !== jauge.instantane.date || j0.mois !== jauge.instantane.mois || j0.baseCentimes !== jauge.instantane.baseCentimes) ecrireMeta('jauge', jauge.instantane);
  const critique = jauge.critique && r.revenus.totalCentimes > 0;
  document.documentElement.classList.toggle('mode-critique', critique);

  const jour = formatJourLong(auj);
  const entete = h('header', { class: 'accueil-entete' },
    h('div', {}, h('p', { class: 'accueil-date' }, jour.charAt(0).toUpperCase() + jour.slice(1)), h('h1', { class: 'grand-titre' }, etat.profil.prenomAffichage ? `Bonjour ${etat.profil.prenomAffichage}` : 'Bonjour')));

  const ajout = h('button', { class: 'btn btn-principal btn-large ajout-depense', type: 'button', onclick: async () => { const { ouvrirSaisie } = await import('./saisie.js'); ouvrirSaisie(); } }, icone('plus'), h('span', {}, 'Ajouter une dépense'));
  // « Je me suis privé » juste sous l'ajout : un repas évité part à l'épargne en deux touches
  const prive = h('button', { class: 'btn btn-secondaire btn-large prive-accueil', type: 'button', onclick: async () => { const { feuillePrivation } = await import('./privation.js'); feuillePrivation(); } }, icone('tirelire'), h('span', {}, 'Je me suis privé → épargne'));

  if (!r.revenus.totalCentimes && !etat.transactions.length) {
    vue.replaceChildren(entete, hero(r, jauge), ajout,
      etatVide('importer', 'Commence par tes revenus', 'Saisis ton salaire et ta prime du mois, ou importe un relevé.',
        h('div', { class: 'groupe-boutons' }, bouton('Saisir mes revenus', () => feuilleRevenus(r.periode.mois), { classe: 'btn-principal' }), bouton('Importer un relevé', () => aller('reglages/import')))));
    return;
  }
  const rappels = bandeaux(r, auj);
  const analyse = raisonner(etat, auj);
  vue.replaceChildren(...[entete, hero(r, jauge, analyse), ajout, prive, blocCoffres(), carteAnalyse(r, jauge, analyse), essentiel(auj, rappels), rubriques(r, auj, rappels, critique)].filter(Boolean));
}

/** Le bloc sapin : ce que tu peux dépenser aujourd'hui, et le reste du mois. Rien d'autre. */
function hero(r, j, analyse = null) {
  const moisDepasse = r.resteCentimes < 0;
  const dispo = j.restantAujourdhuiCentimes;
  const depasse = dispo < 0 && !moisDepasse;
  const montantAffiche = moisDepasse ? -r.resteCentimes : depasse ? -dispo : dispo;
  const valeur = h('p', { class: `jauge-valeur ${depasse || moisDepasse ? 'depassee' : ''}`, 'aria-live': 'polite' }, estMasque() ? '•••,•• €' : formatEuros(montantAffiche));
  const chiffre = h('span', { class: `chiffre-principal ${r.resteCentimes < 0 ? 'negatif' : ''}` }, estMasque() ? '•••,•• €' : formatEuros(r.resteCentimes));
  if (!estMasque() && dernierReste !== null && dernierReste !== r.resteCentimes) animerMontant(chiffre, dernierReste, r.resteCentimes, (c) => formatEuros(c));
  dernierReste = r.resteCentimes;
  const pct = j.parJourCentimes > 0 ? Math.min(100, Math.max(0, Math.round((j.depensesDuJourCentimes / j.parJourCentimes) * 100))) : 0;
  return h('section', { class: `hero ${j.critique && r.revenus.totalCentimes > 0 ? 'hero-critique' : ''}`, 'aria-labelledby': 'hero-t' },
    h('h2', { id: 'hero-t', class: 'hero-libelle' }, moisDepasse ? 'Ce mois-ci, tu as dépassé de' : depasse ? 'Aujourd’hui, tu as dépassé de' : 'Aujourd’hui, tu peux dépenser'),
    valeur,
    h('div', { class: 'hero-jauge', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': `Dépensé aujourd'hui : ${formatEuros(j.depensesDuJourCentimes)} sur ${formatEuros(j.parJourCentimes)}` },
      h('span', { style: { width: `${pct}%` } })),
    h('div', { class: 'hero-mois' },
      h('p', { class: 'hero-aide' }, 'Pour tenir jusqu’au salaire ', chiffre)),
    h('p', { class: 'hero-aide hero-periode' }, `Prochain salaire vers le ${formatDateCourte(r.periode.salaireAttenduLe || ajouterJours(r.periode.fin, 1))}, dans ${j.joursRestants} jour${j.joursRestants > 1 ? 's' : ''}`),
    analyse ? null : h('button', { type: 'button', class: 'hero-lien', onclick: () => feuilleCalcul(r, j) }, 'Pourquoi ce chiffre ?', icone('suivant')));
}

/** Le verdict du mois en une carte : la conclusion et sa raison principale. */
function carteAnalyse(r, j, a) {
  if (!a || !r.revenus.totalCentimes) return null;
  return h('section', { class: `analyse analyse-${a.niveau}`, 'aria-labelledby': 'analyse-t' },
    h('div', { class: 'analyse-tete' }, h('span', { class: 'analyse-point', 'aria-hidden': 'true' }), h('h2', { id: 'analyse-t', class: 'analyse-titre' }, a.titre)),
    h('p', { class: 'analyse-phrase' }, a.phrase),
    a.points.length ? h('button', { type: 'button', class: 'lien analyse-lien', onclick: () => feuilleCalcul(r, j, a) }, `Mon mois expliqué en ${a.points.length} points`, icone('suivant')) : null);
}

/** Un point du raisonnement : constat → pourquoi → donc. */
function blocRaison(p, allerVers) {
  return h('article', { class: `raison raison-${p.ton}` },
    h('h3', { class: 'raison-titre' }, h('span', { class: 'raison-point', 'aria-hidden': 'true' }), p.titre),
    h('p', { class: 'raison-constat' }, p.constat),
    h('p', { class: 'raison-pourquoi' }, p.pourquoi),
    p.donc ? h('p', { class: 'raison-donc' }, h('strong', {}, 'Donc : '), p.donc) : null,
    p.action ? h('button', { type: 'button', class: 'lien raison-action', onclick: allerVers(p.action.route) }, p.action.libelle, icone('suivant')) : null);
}

/** Le mois expliqué : le raisonnement d'abord, puis le calcul ligne par ligne pour vérifier. */
function feuilleCalcul(r, j, a = raisonner(etat, aujourdhui())) {
  let f;
  const aller2 = (route) => () => { f.fermer(); aller(route); };
  const ligne = (signe, titre, montant, detail, action) => h('div', { class: 'calcul-ligne' },
    h('span', { class: 'calcul-signe', 'aria-hidden': 'true' }, signe),
    h('span', { class: 'calcul-texte' }, h('span', { class: 'calcul-titre' }, titre), detail ? h('span', { class: 'calcul-detail' }, detail) : null, action || null),
    mt(montant, { classe: 'calcul-montant' }));
  const lien = (texte, route) => h('button', { type: 'button', class: 'lien calcul-lien', onclick: typeof route === 'function' ? route : aller2(route) }, texte);
  const liste = (items) => h('details', { class: 'details-discret' }, h('summary', {}, `Voir les ${items.length} lignes`),
    h('div', { class: 'liste-mini' }, items.map((x) => h('div', { class: 'ligne-mini' }, h('span', {}, h('span', { class: 'ligne-mini-date' }, formatDateCourte(x.date)), x.libelle, x.paye || x.payee ? h('span', { class: 'etiquette vert' }, 'payé') : null), mt(x.montantPrevuCentimes ?? x.montantCentimes)))));
  const rev = r.revenus;
  const nbDep = etat.transactions.filter((t) => t.date >= r.periode.debut && t.date <= aujourdhui() && t.sens === 'debit' && contributionDepense(t) > 0 && estDepenseQuotidienne(t)).length;
  // Anomalies visibles (import mélangé avec l'accueil de démarrage)
  const anomalies = [];
  const loyers = r.charges.filter((c) => c.estLoyer);
  if (loyers.length > 1) anomalies.push(`Le loyer est compté ${loyers.length} fois (${loyers.map((c) => formatEuros(c.montantPrevuCentimes)).join(' + ')}).`);
  const courants = etat.comptes.filter((c) => c.type === 'courant');
  if (courants.length > 1) anomalies.push(`Il y a ${courants.length} comptes courants (${courants.map((c) => c.nom).join(', ')}).`);
  f = ouvrirFeuille({
    titre: 'Mon mois expliqué',
    contenu: h('div', { class: 'calcul' },
      anomalies.length ? h('div', { class: 'alerte-abri' }, h('p', {}, h('strong', {}, 'Ce calcul contient des erreurs d’import : ')), anomalies.map((x) => h('p', { class: 'petit' }, x)),
        h('p', { class: 'petit' }, 'Pour corriger : Réglages → Importer mon fichier → « Tout remplacer à la place » (tes saisies sont gardées).')) : null,
      h('div', { class: `analyse analyse-${a.niveau} analyse-feuille` }, h('div', { class: 'analyse-tete' }, h('span', { class: 'analyse-point', 'aria-hidden': 'true' }), h('p', { class: 'analyse-titre' }, a.titre)), h('p', { class: 'analyse-phrase' }, a.phrase)),
      a.points.map((p) => blocRaison(p, aller2)),
      h('details', { class: 'calcul-details' }, h('summary', {}, 'Le calcul, ligne par ligne'),
      h('p', { class: 'petit' }, `Mois du ${formatDateCourte(r.periode.debut)} (arrivée du salaire) au ${formatDateCourte(r.periode.fin)}.`),
      ligne('+', 'Revenus du mois', rev.totalCentimes, `salaire ${formatEuros(rev.salaireCentimes || 0)} + prime d’activité ${formatEuros(rev.primeActiviteCentimes || 0)}${rev.statut === 'attendu' ? ' — attendus, pas encore confirmés' : ''}`, lien('Modifier', () => { f.fermer(); feuilleRevenus(r.periode.mois); })),
      ligne('−', 'Épargne (le maximum possible)', r.epargneCibleCentimes, `ce qui reste après les charges, les dettes et ${formatEuros(r.besoinsVitauxCentimes || 0)} pour le quotidien obligatoire (courses, transports, santé)${r.epargneCibleCentimes < (r.epargneViseeCentimes ?? 0) ? ` ; prévu ${formatEuros(r.epargneViseeCentimes)}, réduit par les dépenses du mois` : ''}`, lien('Mon plan', 'epargne/plan')),
      ligne('−', 'Charges et abonnements', r.chargesCentimes, `${r.charges.length} prélèvements (loyer, téléphone, transport, abonnements…)`, h('span', {}, liste(r.charges), lien('Charges fixes', 'reglages/charges'))),
      ligne('−', 'Dettes du mois', r.dettesCentimes, `${r.dettes.length} échéances, payées ou à venir`, h('span', {}, liste(r.dettes), lien('Mes dettes', 'epargne/dettes'))),
      r.privationsCentimes ? ligne('−', 'Mis de côté en te privant', r.privationsCentimes, `${r.privations.length} fois ce mois-ci : part à l’épargne au lieu d’être dépensé`, lien('Voir', 'epargne')) : null,
      r.arrondisCentimes ? ligne('−', 'Arrondis vers l’épargne', r.arrondisCentimes, 'chaque sortie du compte arrondie à l’euro supérieur depuis le salaire (abonnements et prélèvements compris)', lien('Voir', 'epargne')) : null,
      r.prevuesCentimes ? ligne('−', 'Dépenses à venir (prévues)', r.prevuesCentimes, `${r.prevues.filter((d) => !d.realisee).length} dépense${r.prevues.filter((d) => !d.realisee).length > 1 ? 's' : ''} que tu as prévue${r.prevues.filter((d) => !d.realisee).length > 1 ? 's' : ''}, réservée${r.prevues.filter((d) => !d.realisee).length > 1 ? 's' : ''} d’avance`, lien('Voir', 'avenir')) : null,
      ligne('−', 'Dépenses du quotidien', r.depensesVariablesCentimes, `${nbDep} dépense${nbDep > 1 ? 's' : ''} depuis le salaire (hors prélèvements et abonnements)`, lien('Voir', 'depenses')),
      h('div', { class: `calcul-ligne calcul-total ${r.resteCentimes < 0 ? 'negatif-texte' : ''}` }, h('span', { class: 'calcul-signe' }, '='), h('span', { class: 'calcul-texte' }, h('span', { class: 'calcul-titre' }, 'Reste jusqu’au salaire')), mt(r.resteCentimes, { classe: 'calcul-montant' })),
      h('h3', { class: 'feuille-sous-titre' }, 'Budget du jour'),
      h('p', {}, r.resteCentimes < 0
        ? `Le mois est déjà dépassé de ${formatEuros(-r.resteCentimes)} : il n’y a plus de budget par jour. Chaque jour sans dépense t’aide à revenir à zéro.`
        : `Reste au début de la journée ${formatEuros(r.resteCentimes + j.depensesDuJourCentimes)} ÷ ${j.joursRestants} jour${j.joursRestants > 1 ? 's' : ''} restant${j.joursRestants > 1 ? 's' : ''} = ${formatEuros(j.parJourCentimes)} par jour. Dépensé${(etat.privations || []).some((p) => p.date === j.instantane.date) ? ' ou mis de côté' : ''} aujourd’hui : ${formatEuros(j.depensesDuJourCentimes)}, il reste ${formatEuros(j.restantAujourdhuiCentimes)}.`),
      h('p', { class: 'petit' }, 'Le budget par jour est fixé le matin : ce que tu dépenses dans la journée le fait baisser, il est recalculé le lendemain.'))),
  });
}

/** À faire : deux lignes au plus (alerte de découvert d'abord, puis les rappels les plus urgents). */
function essentiel(auj, rappels) {
  const lignes = [];
  const p = projectionDecouvert(etat, auj, { jours: 7 });
  if (p && (p.chargeNonCouverte || p.premierNegatif)) {
    const cible = p.loyerNonCouvert || p.chargeNonCouverte;
    lignes.push(ligneEssentiel({ type: 'alerte', icone: 'alerte',
      titre: cible ? `${p.compte.nom} ne couvre pas ${cible.estLoyer ? 'le loyer' : cible.libelle} du ${formatDateCourte(cible.date)}` : `${p.compte.nom} passe sous 0 € le ${formatDateCourte(p.premierNegatif.date)}`,
      valeur: mt(cible ? cible.soldeApresCentimes : p.premierNegatif.soldeCentimes, { classe: 'negatif' }),
      onclick: () => ouvrirFeuille({ titre: 'Risque de découvert', contenu: risqueDecouvert(auj) }) }));
  }
  const plafondAbo = etat.profil.plafondAbonnementsCentimes;
  if (plafondAbo !== null && plafondAbo !== undefined) {
    const abo = listerAbonnements(etat, auj, { resilies: etat.meta.abonnementsResilies || {} });
    if (abo.aLimiterMensuelCentimes > plafondAbo) lignes.push(ligneEssentiel({ type: 'alerte', icone: 'boucle', titre: `Abonnements au-dessus de ta limite de ${formatEuros(plafondAbo)}`, valeur: mt(abo.aLimiterMensuelCentimes - plafondAbo, { classe: 'negatif' }), onclick: () => aller('abonnements') }));
  }
  const montres = rappels.slice(0, Math.max(0, 2 - lignes.length));
  for (const b of montres) lignes.push(ligneEssentiel({ ...b, onclick: () => feuilleRappel(b) }));
  if (!lignes.length) return null;
  const action = rappels.length > montres.length ? h('button', { class: 'lien', type: 'button', onclick: () => feuilleRappels(rappels) }, `Tout voir (${rappels.length})`) : null;
  return carte('À faire', h('div', { class: 'liste' }, lignes), { id: 'essentiel', action });
}

function ligneEssentiel({ type = 'info', icone: ic, titre, valeur, onclick }) {
  return h('button', { type: 'button', class: `ligne-essentiel ligne-essentiel-${type}`, onclick },
    h('span', { class: 'bandeau-icone', 'aria-hidden': 'true' }, icone(ic)),
    h('span', { class: 'ligne-essentiel-titre' }, titre),
    valeur ? h('span', { class: 'ligne-essentiel-valeur' }, valeur) : null,
    icone('suivant', 'chevron'));
}

/** Un rappel ouvert en grand, avec ses boutons ; la feuille se ferme dès qu'on agit. */
function feuilleRappel(b) {
  const f = ouvrirFeuille({ titre: b.titre, contenu: h('div', { class: 'bandeaux', onclick: (e) => { if (e.target.closest('button')) setTimeout(() => f.fermer(), 50); } }, bandeau({ ...b, titre: null })) });
}

function feuilleRappels(rappels) {
  const f = ouvrirFeuille({ titre: 'Rappels', contenu: h('div', { class: 'bandeaux', onclick: (e) => { if (e.target.closest('.bandeau-actions button, .bandeau-fermer')) setTimeout(() => f.fermer(), 50); } }, rappels.map((b) => bandeau(b))) });
}

/** Quatre raccourcis : mon argent, mes dépenses, mon épargne, mes abonnements. */
function rubriques(r, auj, rappels, critique) {
  const s = soldes(etat, auj);
  const depMois = depensesVariables(etat, r.periode.debut, r.periode.fin);
  const abo = listerAbonnements(etat, auj, { resilies: etat.meta.abonnementsResilies || {} });
  const tuile = (ic, nom, valeur, onclick) => h('button', { type: 'button', class: 'tuile', onclick }, h('span', { class: 'tuile-icone', 'aria-hidden': 'true' }, icone(ic)), h('span', { class: 'tuile-nom' }, nom), h('span', { class: 'tuile-valeur' }, valeur));
  const poches = etat.poches.filter((p) => p.actif !== false).reduce((t, p) => t + soldePoche(p), 0);
  return h('section', { class: 'rubriques', 'aria-label': 'Raccourcis' },
    h('div', { class: 'grille-tuiles' },
      tuile('banque', 'Mon argent', mt(s.globalCentimes, { classe: s.globalCentimes < 0 ? 'negatif' : '' }), () => ouvrirFeuille({ titre: 'Mon argent', contenu: h('div', { class: 'feuille-sections' }, positionGlobale(auj), h('h3', { class: 'feuille-sous-titre' }, 'Les 7 prochains jours'), risqueDecouvert(auj)) })),
      tuile('liste', 'Mes dépenses', [mt(depMois), ' ce mois'], () => aller('depenses')),
      tuile('tirelire', 'Mon épargne', mt(poches), () => aller('epargne')),
      tuile('boucle', 'Abonnements', abo.liste.length ? [mt(abo.aLimiterMensuelCentimes), ' /mois'] : 'Aucun', () => aller('abonnements')),
      tuile('calendrier', 'À venir', [mt(aVenir(etat, auj).totalCentimes), ' d’ici le salaire'], () => aller('avenir')),
      tuile('graphique', 'Statistiques', 'Mois passés et conseils', () => aller('statistiques'))));
}

function bandeaux(r, auj) {
  const res = [];
  const mois = r.periode.mois;
  // Reste du mois : versé sur l'épargne après le salaire ; aperçu dans les 3 jours qui le précèdent
  const rel = reliquat(etat, auj);
  const faits = etat.meta.reliquats || {};
  const repartition = etat.poches.filter((p) => p.actif !== false && p.partRepartition).sort((a, b) => b.partRepartition - a.partRepartition).map((p) => `${p.partRepartition} % ${p.nom.toLowerCase().replace(/^prêt de/, 'prêt de')}`).join(', ');
  if (rel.precedent.montantCentimes > 0 && !faits[rel.precedent.mois]) {
    const m = rel.precedent.montantCentimes;
    res.push({ type: 'action', icone: 'tirelire', titre: `Reste de ${formatMois(rel.precedent.mois).replace(/ \d{4}$/, '')} : ${formatEuros(m)} → épargne`,
      texte: `Ce que tu n’as pas dépensé entre le ${formatDateCourte(rel.precedent.debut)} et le ${formatDateCourte(rel.precedent.fin)} part sur ton compte épargne${repartition ? ` (${repartition})` : ''}. Fais le virement, puis touche « C’est fait ».`,
      actions: [
        bouton("C'est fait", async () => { await enregistrerVirementEpargne({ montantCentimes: m, pocheId: null, date: auj, libelle: `Reste de ${formatMois(rel.precedent.mois)} vers l’épargne` }); await ecrireMeta('reliquats', { ...faits, [rel.precedent.mois]: { montantCentimes: m, le: auj, statut: 'vire' } }, { avertir: true }); toast(`${formatEuros(m)} versés sur ton épargne.`, { type: 'succes' }); }, { classe: 'btn-principal btn-petit' }),
        bouton('Garder sur le compte', async () => { await ecrireMeta('reliquats', { ...faits, [rel.precedent.mois]: { montantCentimes: m, le: auj, statut: 'garde' } }, { avertir: true }); toast('Gardé sur le compte.'); }, { classe: 'btn-petit' }),
      ] });
  } else if (rel.courant.avantSalaire && rel.courant.montantCentimes > 0) {
    res.push({ type: 'info', icone: 'tirelire', titre: `Il te reste ${formatEuros(rel.courant.montantCentimes)} jusqu’au salaire`,
      texte: `Ce qui restera à l’arrivée du salaire (vers le ${formatDateCourte(rel.courant.prochainSalaire)}) ira sur ton épargne.` });
  }
  // Repas à la maison d'hier, épargnés automatiquement
  const hierAuto = (r.privationsAuto || []).find((p) => p.date === ajouterJours(auj, -1));
  if (hierAuto) {
    res.push({ type: 'info', icone: 'tirelire', titre: `Hier : ${hierAuto.libelle}, ${formatEuros(hierAuto.montantCentimes)} mis de côté`,
      texte: 'Aucun repas dehors noté hier : l’argent part à l’épargne. Tu as mangé dehors ? Ajoute la dépense, le montant s’ajuste.',
      actions: [bouton('J’ai mangé dehors hier', async () => { const { ouvrirSaisie } = await import('./saisie.js'); ouvrirSaisie('clavier', { passee: true, date: ajouterJours(auj, -1), categorie: 'restauration-rapide' }); }, { classe: 'btn-petit' })] });
  }
  // Revenus du mois à confirmer
  if (r.revenus.statut === 'attendu') {
    const recuDetecte = etat.transactions.find((t) => t.categorie === 'salaire' && t.source === 'import' && t.date >= r.periode.debut);
    res.push(({ type: 'action', icone: 'mallette', titre: `Confirme tes revenus de ${formatMois(mois).replace(/ \d{4}$/, '')}`, texte: recuDetecte ? `Virement de salaire détecté (${formatEuros(recuDetecte.montantCentimes)}). Confirme le salaire et la prime exacts.` : `Salaire et prime d'activité attendus${r.revenus.totalCentimes ? ` (≈ ${formatEuros(r.revenus.totalCentimes)})` : ''} : saisis les montants exacts reçus.`, actions: [bouton('Saisir les montants', () => feuilleRevenus(mois), { classe: 'btn-principal btn-petit' })] }));
  }
  // Reprises d'épargne récentes
  for (const ev of etat.evenements.filter((e) => e.type === 'reprise' && !e.vu).slice(0, 2)) {
    const p = etat.poches.find((x) => x.id === ev.pocheId);
    res.push(({ type: 'alerte', icone: 'tirelire', titre: `Tu as repris ${formatEuros(ev.montantCentimes)} de ton épargne`, texte: `Le ${formatDate(ev.date)}${p ? ` (${p.nom})` : ''}. La prochaine fois, puise d'abord dans l'enveloppe Plaisir ou réduis une enveloppe non vitale.`, fermer: async () => { await enregistrer('evenements', { ...ev, vu: true }); } }));
  }
  // Virements d'épargne prévus
  // Les virements d'épargne du plan sont remplacés par le virement de la semaine (« Reste à virer vers l’épargne »)
  for (const v of etat.virementsPrevus.filter((x) => !x.fait && x.type !== 'epargne' && (x.rappelLe || x.date) <= auj)) {
    const proj = projectionDecouvert(etat, auj, { inclureRythme: false, jours: Math.max(3, diffJours(auj, v.date) + 3) });
    const risque = proj && proj.soldeApresChargesCentimes < 0;
    res.push(({ type: 'action', icone: 'tirelire', titre: `Épargne : ${formatEuros(v.montantCentimes)} vers ${etat.poches.find((p) => p.id === v.pocheId)?.nom || 'ton épargne'}`,
      texte: risque ? `Attention : avec ce virement, ton compte passerait sous 0 € avant le ${formatDate(v.date)}. Reporte-le.` : `Programme le virement pour le ${formatDate(v.date)} (après le loyer et les échéances).`,
      actions: [
        bouton("C'est fait", async () => { await enregistrerVirementEpargne({ montantCentimes: v.montantCentimes, pocheId: v.pocheId, virementPrevuId: v.id, date: auj }); toast('Virement d’épargne enregistré.', { type: 'succes' }); }, { classe: 'btn-principal btn-petit' }),
        bouton('Calendrier', () => ajouterAuCalendrier({ uid: `${v.id}@budget`, titre: `Virer ${formatEuros(v.montantCentimes)} sur l'épargne`, description: 'Rappel Budget', date: v.date, heure: '09:00', nomFichier: 'virement-epargne' }), { classe: 'btn-petit', icone: 'calendrier' }),
        bouton('Reporter', async () => { await enregistrer('virementsPrevus', { ...v, rappelLe: ajouterJours(auj, 3), date: v.date < ajouterJours(auj, 3) ? ajouterJours(auj, 3) : v.date }); toast('Reporté de 3 jours.'); }, { classe: 'btn-petit' }),
      ] }));
  }
  // Arrondis, repas et privations à virer : regroupés dans « Reste à virer vers l’épargne » (bloc Mon épargne, en haut)
  // Échéances proches (proches et crédits) arrivées
  // Remboursements aux proches arrivés à échéance, le plus proche d'abord
  const echeances = etat.prets.filter((x) => x.statut !== 'solde' && x.sens === 'empruntéParMoi')
    .flatMap((p) => p.echeancier.filter((x) => !x.payee && x.date <= ajouterJours(auj, 2)).map((e) => ({ p, e })))
    .sort((a, b) => (a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : 0));
  for (const { p, e } of echeances) {
    res.push(({ type: 'action', icone: 'personnes', titre: `Rembourser ${p.personneAlias} : ${formatEuros(e.montantCentimes)}`, texte: `Prévu ${e.date === auj ? 'aujourd’hui' : `le ${formatDate(e.date)}`}${p.objet ? ` (${p.objet})` : ''}.`, actions: [bouton("C'est fait", async () => { await payerEcheancePret(p.id, e.date); toast('Remboursement enregistré.', { type: 'succes' }); }, { classe: 'btn-principal btn-petit' })] }));
  }
  // Prélèvements dans les 3 jours
  const proj3 = projectionDecouvert(etat, auj, { inclureRythme: false, jours: 3 });
  if (proj3?.evenements.length) {
    const evs = proj3.evenements.filter((e) => e.type === 'charge' || e.type === 'credit');
    if (evs.length) res.push(({ type: 'info', icone: 'calendrier', titre: 'Prélèvements dans les 3 jours', texte: evs.map((e) => h('span', { class: 'ligne-mini' }, h('span', {}, `${formatDateCourte(e.date)}  ${e.libelle}`), mt(-e.montantCentimes))) }));
  }
  // Questions en attente
  const q = etat.questions.filter((x) => x.statut === 'ouverte').length;
  if (q) res.push(({ type: 'info', icone: 'info', titre: `${q} question${q > 1 ? 's' : ''} sur tes relevés`, texte: 'Pré-remplies avec ma meilleure supposition : confirme ou corrige.', actions: [bouton('Répondre', () => aller('reglages/questions'), { classe: 'btn-petit' })] }));
  // Sauvegarde hebdomadaire
  const der = etat.parametres.derniereSauvegarde;
  if (etat.transactions.length && (!der || diffJours(der.slice(0, 10), auj) >= 7)) {
    res.push(({ type: 'info', icone: 'telecharger', titre: 'Sauvegarde de la semaine', texte: der ? `Dernière sauvegarde le ${formatDate(der.slice(0, 10))}.` : 'Aucune sauvegarde : tes données ne vivent que sur cet iPhone.', actions: [bouton('Sauvegarder', () => exporterSauvegarde(), { classe: 'btn-petit' })] }));
  }
  return res;
}

function risqueDecouvert(auj) {
  const p = projectionDecouvert(etat, auj, { jours: 7 });
  if (!p) return null;
  const pc = p.commissionCentimes;
  let contenu;
  if (p.chargeNonCouverte || p.premierNegatif) {
    const cible = p.loyerNonCouvert || p.chargeNonCouverte;
    const titreAlerte = cible ? `${p.compte.nom} ne couvre pas ${cible.estLoyer ? 'le loyer' : cible.libelle} du ${formatDateCourte(cible.date)}` : `${p.compte.nom} passe sous 0 € le ${formatDateCourte(p.premierNegatif.date)}`;
    const lignesNC = p.nonCouverts.map((e) => h('div', { class: 'ligne-mini' }, h('span', {}, h('span', { class: 'ligne-mini-date' }, formatDateCourte(e.date)), e.libelle), mt(-e.montantCentimes)));
    contenu = h('div', { class: 'alerte-decouvert', role: 'alert' },
      h('p', { class: 'alerte-titre' }, icone('alerte'), titreAlerte),
      h('div', { class: 'liste-cles' },
        h('div', { class: 'ligne-cle' }, h('span', {}, 'Solde actuel'), mt(p.soldeActuelCentimes)),
        h('div', { class: 'ligne-cle' }, h('span', {}, cible ? (cible.estLoyer ? 'Après le loyer' : 'Après ce prélèvement') : 'Solde projeté'), mt(cible ? cible.soldeApresCentimes : p.premierNegatif.soldeCentimes, { classe: 'negatif' }))),
      p.nonCouverts.length > 1 ? h('details', { class: 'non-couverts' }, h('summary', {}, `${p.nonCouverts.length} prélèvements non couverts`), h('div', { class: 'liste-mini' }, lignesNC)) : null,
      h('p', { class: 'petit' }, `Chaque opération passée à découvert peut coûter ${formatEuros(pc)} de commission.`, revenusNonConfirmes() ? ' Ton salaire n’est pas encore confirmé, il n’est donc pas compté.' : ''));
  } else {
    contenu = h('div', { class: 'ok-decouvert' },
      h('p', {}, icone('ok'), `${p.compte.nom} couvre les 7 prochains jours`),
      p.loyer ? h('p', { class: 'petit' }, 'Il restera ', mt(p.soldeApresChargesCentimes), ` après le loyer du ${formatDateCourte(p.loyer.date)} et les prélèvements.`) : h('p', { class: 'petit' }, 'Il restera ', mt(p.soldeApresChargesCentimes), ` après les prélèvements connus, à ${formatEuros(p.rythmeCentimes)} de dépenses par jour.`));
  }
  return h('div', { class: 'carte-corps', id: 'decouvert' }, contenu);
}

function revenusNonConfirmes() {
  const mois = periodeBudget(aujourdhui(), etat.profil).mois;
  const r = etat.revenusMensuels.find((x) => x.mois === mois);
  return !r || r.statut !== 'confirme';
}

function positionGlobale(auj) {
  const s = soldes(etat, auj);
  if (!s.comptes.length) return null;
  const lignes = s.comptes.filter((c) => c.compte.type !== 'epargne').map((c) => h('div', { class: 'ligne-cle' }, h('span', {}, c.compte.nom), mt(c.soldeCentimes, { classe: c.soldeCentimes < 0 ? 'negatif' : '' })));
  let abri = null;
  if (s.alerteAbri) {
    const cout = coutDecouvert(etat, ajouterJours(auj, -365), auj);
    abri = h('div', { class: 'alerte-abri' },
      h('p', {}, 'Ton compte courant est à ', mt(s.alerteAbri.courantCentimes, { classe: 'negatif' }), ' alors que ', mt(s.alerteAbri.abriCentimes), ' sont sur ta néobanque.'),
      h('p', { class: 'petit' }, `Rapatrier ${formatEuros(s.alerteAbri.rapatriableCentimes)} ramène le compte à 0 €. Le découvert t'a coûté ${formatEuros(cout.fraisCentimes)} de frais en 12 mois.`));
  }
  return h('div', { class: 'carte-corps' }, h('div', { class: 'liste-cles' },
    h('div', { class: 'ligne-cle forte' }, h('span', {}, 'Au total'), mt(s.globalCentimes, { classe: `total-global ${s.globalCentimes < 0 ? 'negatif' : ''}` })), lignes), abri);
}

function enveloppesBloc(r, critique) {
  let env = etat.enveloppes;
  if (!env.length) return null;
  if (critique) env = env.filter((e) => e.vitale);
  const lignes = env.map((e) => {
    const cats = e.categories || [e.categorie];
    const depense = depensesVariables(etat, r.periode.debut, r.periode.fin, (t) => cats.includes(t.categorie));
    const plafond = plafondEffectif(e, r.periode.mois);
    return h('button', { class: 'ligne-enveloppe', type: 'button', onclick: () => aller('budgets') },
      h('span', { class: 'ligne-enveloppe-haut' }, h('span', { class: 'ligne-enveloppe-nom' }, e.nom), h('span', { class: 'ligne-enveloppe-valeur' }, mt(depense), h('span', { class: 'sur' }, ' sur '), mt(plafond))),
      barre(depense, plafond, { couleur: categorie(cats[0]).couleur, label: `${e.nom} : ${formatEuros(depense)} sur ${formatEuros(plafond)}` }));
  });
  return h('div', { class: 'enveloppes' }, lignes);
}

export { dateDuMois, categorie, payerEcheanceCredit };
