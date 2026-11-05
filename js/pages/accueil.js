// accueil.js — l'écran qui se comprend en 2 secondes : reste à dépenser, jauge du jour, risque de découvert.

import { h, icone, mt, animerMontant, estMasque } from '../ui/dom.js';
import { carte, barre, bandeau, bouton, etatVide } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { etat, ecrireMeta, enregistrer } from '../store.js';
import { aller } from '../router.js';
import { resteADepenser, jaugeDuJour, soldes, projectionDecouvert, epargneDuMois, depensesVariables, coutDecouvert } from '../calculs.js';
import { prochainVirementArrondis, soldePoche } from '../epargne.js';
import { aujourdhui, ajouterJours, formatDate, formatDateCourte, formatJourLong, formatMois, diffJours, moisDe, dateDuMois } from '../dates.js';
import { formatEuros } from '../money.js';
import { categorie } from '../categories.js';
import { exporterSauvegarde, feuilleRevenus } from './communs.js';
import { enregistrerVirementEpargne, virerArrondis, payerEcheancePret, payerEcheanceCredit } from '../actions.js';
import { ajouterAuCalendrier } from '../ics.js';
import { plafondEffectif } from './budgets.js';

export const titre = 'Accueil';
let dernierReste = null;

export function rendre(vue) {
  const auj = aujourdhui();
  const r = resteADepenser(etat, auj);
  const jauge = jaugeDuJour(etat, auj, etat.meta.jauge || null);
  if (!etat.meta.jauge || etat.meta.jauge.date !== jauge.instantane.date || etat.meta.jauge.mois !== jauge.instantane.mois) ecrireMeta('jauge', jauge.instantane);
  const critique = jauge.critique && r.revenus.totalCentimes > 0;
  document.documentElement.classList.toggle('mode-critique', critique);

  const jour = formatJourLong(auj);
  const entete = h('header', { class: 'accueil-entete' },
    h('div', {}, h('p', { class: 'accueil-date' }, jour.charAt(0).toUpperCase() + jour.slice(1)), h('h1', { class: 'grand-titre' }, etat.profil.prenomAffichage ? `Bonjour ${etat.profil.prenomAffichage}` : 'Bonjour')));

  const ajout = h('button', { class: 'btn btn-principal btn-large ajout-depense', type: 'button', onclick: async () => { const { ouvrirSaisie } = await import('./saisie.js'); ouvrirSaisie(); } }, icone('plus'), h('span', {}, 'Ajouter une dépense'));

  if (!r.revenus.totalCentimes && !etat.transactions.length) {
    vue.replaceChildren(entete, hero(r, jauge), ajout,
      etatVide('importer', 'Commence par tes revenus', 'Saisis ton salaire et ta prime du mois, ou importe un relevé.',
        h('div', { class: 'groupe-boutons' }, bouton('Saisir mes revenus', () => feuilleRevenus(r.periode.mois), { classe: 'btn-principal' }), bouton('Importer un relevé', () => aller('reglages/import')))));
    return;
  }
  const rappels = bandeaux(r, auj);
  vue.replaceChildren(...[entete, hero(r, jauge), ajout, essentiel(auj, rappels), epargneResume(auj), rubriques(r, auj, rappels, critique)].filter(Boolean));
}

/** Le bloc sapin : ce que tu peux dépenser aujourd'hui, et le reste du mois. Rien d'autre. */
function hero(r, j) {
  const dispo = j.restantAujourdhuiCentimes;
  const depasse = dispo < 0;
  const valeur = h('p', { class: `jauge-valeur ${depasse ? 'depassee' : ''}`, 'aria-live': 'polite' }, estMasque() ? '•••,•• €' : formatEuros(depasse ? -dispo : dispo));
  const chiffre = h('span', { class: `chiffre-principal ${r.resteCentimes < 0 ? 'negatif' : ''}` }, estMasque() ? '•••,•• €' : formatEuros(r.resteCentimes));
  if (!estMasque() && dernierReste !== null && dernierReste !== r.resteCentimes) animerMontant(chiffre, dernierReste, r.resteCentimes, (c) => formatEuros(c));
  dernierReste = r.resteCentimes;
  const pct = j.parJourCentimes > 0 ? Math.min(100, Math.max(0, Math.round((j.depensesDuJourCentimes / j.parJourCentimes) * 100))) : 0;
  return h('section', { class: `hero ${j.critique && r.revenus.totalCentimes > 0 ? 'hero-critique' : ''}`, 'aria-labelledby': 'hero-t' },
    h('h2', { id: 'hero-t', class: 'hero-libelle' }, depasse ? 'Budget du jour dépassé de' : 'Tu peux dépenser aujourd’hui'),
    valeur,
    h('div', { class: 'hero-jauge', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': `Dépensé aujourd'hui : ${formatEuros(j.depensesDuJourCentimes)} sur ${formatEuros(j.parJourCentimes)}` },
      h('span', { style: { width: `${pct}%` } })),
    h('div', { class: 'hero-mois' },
      h('p', { class: 'hero-aide' }, 'Reste ce mois-ci ', chiffre),
      h('p', { class: 'hero-aide' }, `${j.joursRestants} jour${j.joursRestants > 1 ? 's' : ''}`)));
}

/** L'essentiel : l'alerte de découvert et les deux rappels les plus urgents, une ligne chacun. */
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
  for (const b of rappels.slice(0, 2)) lignes.push(ligneEssentiel({ ...b, onclick: () => feuilleRappel(b) }));
  if (!lignes.length) return null;
  return carte('L’essentiel', h('div', { class: 'liste' }, lignes), { id: 'essentiel' });
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

/** Résumé de l'épargne en une ligne : ce mois-ci et le total des poches. */
function epargneResume(auj) {
  const e = epargneDuMois(etat, auj);
  const cible = e.cibleCentimes;
  const poches = etat.poches.filter((p) => p.actif !== false).reduce((s, p) => s + soldePoche(p), 0);
  return h('button', { type: 'button', class: 'resume-epargne', onclick: () => aller('epargne') },
    h('span', { class: 'resume-epargne-haut' }, h('span', { class: 'resume-epargne-titre' }, 'Épargne'),
      h('span', { class: 'resume-epargne-valeur' }, mt(Math.max(0, e.nette.nette)), cible ? h('span', { class: 'sur' }, ' sur ') : null, cible ? mt(cible) : null)),
    cible ? barre(Math.max(0, e.nette.nette), cible, { etat: 'laiton', label: `Épargne du mois : ${formatEuros(e.nette.nette)} sur ${formatEuros(cible)}` }) : null,
    h('span', { class: 'resume-epargne-bas' }, 'Ce mois-ci. Dans tes poches : ', mt(poches), icone('suivant', 'chevron')));
}

/** Une rubrique par sujet : un bouton chacun, le détail s'ouvre à la demande. */
function rubriques(r, auj, rappels, critique) {
  const s = soldes(etat, auj);
  const depMois = depensesVariables(etat, r.periode.debut, r.periode.fin);
  const envTotal = etat.enveloppes.reduce((t, e) => t + plafondEffectif(e, r.periode.mois), 0);
  const nbDettes = etat.creditsBancaires.filter((c) => c.actif !== false).length + etat.prets.filter((x) => x.statut !== 'solde' && x.sens === 'empruntéParMoi').length;
  const tuile = (ic, nom, valeur, onclick) => h('button', { type: 'button', class: 'tuile', onclick }, h('span', { class: 'tuile-icone', 'aria-hidden': 'true' }, icone(ic)), h('span', { class: 'tuile-nom' }, nom), h('span', { class: 'tuile-valeur' }, valeur));
  return h('section', { class: 'rubriques', 'aria-labelledby': 'rubriques-t' },
    h('h2', { id: 'rubriques-t', class: 'carte-titre rubriques-titre' }, 'Détails'),
    h('div', { class: 'grille-tuiles' },
      tuile('banque', 'Comptes', mt(s.globalCentimes, { classe: s.globalCentimes < 0 ? 'negatif' : '' }), () => ouvrirFeuille({ titre: 'Tes comptes', contenu: h('div', { class: 'feuille-sections' }, positionGlobale(auj), h('h3', { class: 'feuille-sous-titre' }, 'Les 7 prochains jours'), risqueDecouvert(auj)) })),
      tuile('liste', 'Dépenses du mois', mt(depMois), () => aller('depenses')),
      tuile('panier', 'Enveloppes', envTotal ? [mt(depMois), ' sur ', mt(envTotal)] : 'À créer', () => { const f = ouvrirFeuille({ titre: critique ? 'Enveloppes vitales' : 'Enveloppes du mois', contenu: enveloppesBloc(r, critique) || etatVide('panier', 'Aucune enveloppe', 'Crée tes enveloppes pour suivre chaque poste de dépense.'), actions: [bouton('Modifier les enveloppes', () => { f.fermer(); aller('budgets'); })] }); }),
      tuile('cle', 'Dettes', nbDettes ? `${nbDettes} en cours` : 'Aucune', () => aller('epargne/dettes')),
      tuile('cloche', 'Rappels', rappels.length ? `${rappels.length} à voir` : 'Rien à faire', () => feuilleRappels(rappels)),
      tuile('graphique', 'Bilan', 'Mois par mois', () => aller('historique'))));
}

function bandeaux(r, auj) {
  const res = [];
  const mois = r.periode.mois;
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
  for (const v of etat.virementsPrevus.filter((x) => !x.fait && (x.rappelLe || x.date) <= auj)) {
    const proj = projectionDecouvert(etat, auj, { inclureRythme: false, jours: Math.max(3, diffJours(auj, v.date) + 3) });
    const risque = proj && proj.soldeApresChargesCentimes < 0;
    res.push(({ type: 'action', icone: 'tirelire', titre: `Épargne : ${formatEuros(v.montantCentimes)} vers ${etat.poches.find((p) => p.id === v.pocheId)?.nom || 'ton livret'}`,
      texte: risque ? `Attention : avec ce virement, ton compte passerait sous 0 € avant le ${formatDate(v.date)}. Reporte-le.` : `Programme le virement pour le ${formatDate(v.date)} (après le loyer et les échéances).`,
      actions: [
        bouton("C'est fait", async () => { await enregistrerVirementEpargne({ montantCentimes: v.montantCentimes, pocheId: v.pocheId, virementPrevuId: v.id, date: auj }); toast('Virement d’épargne enregistré.', { type: 'succes' }); }, { classe: 'btn-principal btn-petit' }),
        bouton('Calendrier', () => ajouterAuCalendrier({ uid: `${v.id}@budget`, titre: `Virer ${formatEuros(v.montantCentimes)} sur l'épargne`, description: 'Rappel Budget', date: v.date, heure: '09:00', nomFichier: 'virement-epargne' }), { classe: 'btn-petit', icone: 'calendrier' }),
        bouton('Reporter', async () => { await enregistrer('virementsPrevus', { ...v, rappelLe: ajouterJours(auj, 3), date: v.date < ajouterJours(auj, 3) ? ajouterJours(auj, 3) : v.date }); toast('Reporté de 3 jours.'); }, { classe: 'btn-petit' }),
      ] }));
  }
  // Arrondis à virer
  const ar = etat.profil.arrondi;
  if (ar?.actif) {
    const prochaine = prochainVirementArrondis(ar, auj, ar.dernierVirement || null);
    const cag = epargneDuMois(etat, auj).cagnotteCentimes;
    if (cag > 0 && prochaine <= auj) {
      const proj = projectionDecouvert(etat, auj, { inclureRythme: false, jours: 3 });
      const risque = proj && proj.soldeActuelCentimes - cag < 0;
      res.push(({ type: 'action', icone: 'pieces', titre: `Vire ${formatEuros(cag)} sur ton Livret`, texte: risque ? 'Ton compte courant ne le permet pas sans découvert : reporte à la semaine prochaine.' : 'Cagnotte « Arrondis à virer » de la période.',
        actions: [
          bouton("C'est fait", async () => { await virerArrondis(); toast('Arrondis virés : cagnotte remise à zéro.', { type: 'succes' }); }, { classe: 'btn-principal btn-petit' }),
          bouton('Calendrier', () => ajouterAuCalendrier({ uid: 'arrondis@budget', titre: 'Virer les arrondis sur le Livret', description: 'Ouvre Budget pour voir le montant exact.', date: prochainVirementArrondis(ar, ajouterJours(auj, 1), auj), heure: '19:00', recurrence: { hebdomadaire: 'WEEKLY', quinzaine: 'BIWEEKLY', mensuelle: 'MONTHLY' }[ar.frequence], nomFichier: 'virement-arrondis' }), { classe: 'btn-petit', icone: 'calendrier' }),
        ] }));
    }
  }
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
  const mois = moisDe(aujourdhui());
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
