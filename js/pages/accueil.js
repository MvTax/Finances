// accueil.js — l'écran qui se comprend en 2 secondes : reste à dépenser, jauge du jour, risque de découvert.

import { h, icone, mt, animerMontant, estMasque } from '../ui/dom.js';
import { carte, barre, bandeau, bouton, ligneTransaction, etatVide } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat, ecrireMeta, enregistrer } from '../store.js';
import { aller } from '../router.js';
import { resteADepenser, jaugeDuJour, soldes, projectionDecouvert, epargneDuMois, tauxHoraire, equivalentTravail, depensesVariables, coutDecouvert } from '../calculs.js';
import { prochainVirementArrondis } from '../epargne.js';
import { aujourdhui, ajouterJours, formatDate, formatDateCourte, formatJourLong, formatMois, diffJours, moisDe, dateDuMois } from '../dates.js';
import { formatEuros } from '../money.js';
import { categorie } from '../categories.js';
import { exporterSauvegarde, feuilleRevenus } from './communs.js';
import { enregistrerVirementEpargne, virerArrondis, payerEcheancePret, payerEcheanceCredit } from '../actions.js';
import { ajouterAuCalendrier } from '../ics.js';
import { ouvrirDetail } from './depenses.js';
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
  const th = tauxHoraire(etat, r.periode.mois);

  const jour = formatJourLong(auj);
  const entete = h('header', { class: 'accueil-entete' },
    h('div', {}, h('p', { class: 'accueil-date' }, jour.charAt(0).toUpperCase() + jour.slice(1)), h('h1', { class: 'grand-titre' }, etat.profil.prenomAffichage ? `Bonjour ${etat.profil.prenomAffichage}` : 'Bonjour')),
    h('button', { class: 'btn-icone', type: 'button', 'aria-label': 'Historique et bilan', onclick: () => aller('historique') }, icone('graphique')));

  const blocs = [entete, hero(r, jauge, th, critique)];
  const rappels = bandeaux(r, auj);
  if (rappels) blocs.push(carte('À faire', rappels, { id: 'a-faire' }));
  if (!r.revenus.totalCentimes && !etat.transactions.length) {
    blocs.push(etatVide('importer', 'Commence par tes revenus', 'Saisis ton salaire et ta prime du mois, ou importe un relevé. L’app calcule ensuite ce que tu peux dépenser chaque jour.',
      h('div', { class: 'groupe-boutons' }, bouton('Saisir mes revenus', () => feuilleRevenus(r.periode.mois), { classe: 'btn-principal' }), bouton('Importer un relevé', () => aller('reglages/import')))));
  }
  blocs.push(risqueDecouvert(auj));
  blocs.push(positionGlobale(auj));
  blocs.push(enveloppesBloc(r, critique));
  blocs.push(epargneBloc(auj));
  blocs.push(dernieres());
  vue.replaceChildren(...blocs.filter(Boolean));
}

/** Le bloc sapin : ce que tu peux dépenser aujourd'hui, puis le reste du mois. */
function hero(r, j, th, critique) {
  const dispo = j.restantAujourdhuiCentimes;
  const depasse = dispo < 0;
  const valeur = h('p', { class: `jauge-valeur ${depasse ? 'depassee' : ''}`, 'aria-live': 'polite' }, estMasque() ? '•••,•• €' : formatEuros(depasse ? -dispo : dispo));
  const chiffre = h('span', { class: `chiffre-principal ${r.resteCentimes < 0 ? 'negatif' : ''}` }, estMasque() ? '•••,•• €' : formatEuros(r.resteCentimes));
  if (!estMasque() && dernierReste !== null && dernierReste !== r.resteCentimes) animerMontant(chiffre, dernierReste, r.resteCentimes, (c) => formatEuros(c));
  dernierReste = r.resteCentimes;
  const travail = r.resteCentimes > 0 ? equivalentTravail(r.resteCentimes, th) : null;
  const pct = j.parJourCentimes > 0 ? Math.min(100, Math.max(0, Math.round((j.depensesDuJourCentimes / j.parJourCentimes) * 100))) : 0;
  return h('section', { class: `hero ${critique ? 'hero-critique' : ''}`, 'aria-labelledby': 'hero-t' },
    h('h2', { id: 'hero-t', class: 'hero-libelle' }, depasse ? 'Budget du jour dépassé de' : 'Tu peux dépenser aujourd’hui'),
    valeur,
    h('div', { class: 'hero-jauge', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': `Dépensé aujourd'hui : ${formatEuros(j.depensesDuJourCentimes)} sur ${formatEuros(j.parJourCentimes)}` },
      h('span', { style: { width: `${pct}%` } })),
    h('p', { class: 'hero-aide' }, 'Dépensé aujourd’hui ', mt(j.depensesDuJourCentimes), ' sur ', mt(j.parJourCentimes)),
    h('div', { class: 'hero-mois' },
      h('div', {}, h('p', { class: 'hero-aide' }, 'Reste ce mois-ci'), chiffre),
      h('div', { class: 'hero-mois-droite' },
        h('p', {}, `${j.joursRestants} jour${j.joursRestants > 1 ? 's' : ''}`),
        h('p', { class: 'hero-aide' }, `jusqu’au ${formatDateCourte(r.periode.fin)}`))),
    travail ? h('p', { class: 'hero-aide' }, `Soit environ ${travail} de travail.`) : null,
    critique ? h('p', { class: 'hero-note' }, 'Fin de mois serrée : seules les enveloppes vitales sont affichées.') : null,
    r.revenus.statut === 'attendu' && r.revenus.totalCentimes ? h('p', { class: 'hero-note' }, 'Calcul fait avec tes revenus attendus, à confirmer.') : null);
}

function bandeaux(r, auj) {
  const res = [];
  const mois = r.periode.mois;
  // Revenus du mois à confirmer
  if (r.revenus.statut === 'attendu') {
    const recuDetecte = etat.transactions.find((t) => t.categorie === 'salaire' && t.source === 'import' && t.date >= r.periode.debut);
    res.push(bandeau({ type: 'action', icone: 'mallette', titre: `Revenus de ${formatMois(mois)}`, texte: recuDetecte ? `Virement de salaire détecté (${formatEuros(recuDetecte.montantCentimes)}). Confirme le salaire et la prime exacts.` : `Salaire et prime d'activité attendus${r.revenus.totalCentimes ? ` (≈ ${formatEuros(r.revenus.totalCentimes)})` : ''} : saisis les montants exacts reçus.`, actions: [bouton('Saisir les montants', () => feuilleRevenus(mois), { classe: 'btn-principal btn-petit' })] }));
  }
  // Reprises d'épargne récentes
  for (const ev of etat.evenements.filter((e) => e.type === 'reprise' && !e.vu).slice(0, 2)) {
    const p = etat.poches.find((x) => x.id === ev.pocheId);
    res.push(bandeau({ type: 'alerte', icone: 'tirelire', titre: `Tu as repris ${formatEuros(ev.montantCentimes)} de ton épargne`, texte: `Le ${formatDate(ev.date)}${p ? ` (${p.nom})` : ''}. La prochaine fois, puise d'abord dans l'enveloppe Plaisir ou réduis une enveloppe non vitale.`, fermer: async () => { await enregistrer('evenements', { ...ev, vu: true }); } }));
  }
  // Virements d'épargne prévus
  for (const v of etat.virementsPrevus.filter((x) => !x.fait && (x.rappelLe || x.date) <= auj)) {
    const proj = projectionDecouvert(etat, auj, { inclureRythme: false, jours: Math.max(3, diffJours(auj, v.date) + 3) });
    const risque = proj && proj.soldeApresChargesCentimes < 0;
    res.push(bandeau({ type: 'action', icone: 'tirelire', titre: `Épargne : ${formatEuros(v.montantCentimes)} vers ${etat.poches.find((p) => p.id === v.pocheId)?.nom || 'ton livret'}`,
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
      res.push(bandeau({ type: 'action', icone: 'pieces', titre: `Vire ${formatEuros(cag)} sur ton Livret`, texte: risque ? 'Ton compte courant ne le permet pas sans découvert : reporte à la semaine prochaine.' : 'Cagnotte « Arrondis à virer » de la période.',
        actions: [
          bouton("C'est fait", async () => { await virerArrondis(); toast('Arrondis virés : cagnotte remise à zéro.', { type: 'succes' }); }, { classe: 'btn-principal btn-petit' }),
          bouton('Calendrier', () => ajouterAuCalendrier({ uid: 'arrondis@budget', titre: 'Virer les arrondis sur le Livret', description: 'Ouvre Budget pour voir le montant exact.', date: prochainVirementArrondis(ar, ajouterJours(auj, 1), auj), heure: '19:00', recurrence: { hebdomadaire: 'WEEKLY', quinzaine: 'BIWEEKLY', mensuelle: 'MONTHLY' }[ar.frequence], nomFichier: 'virement-arrondis' }), { classe: 'btn-petit', icone: 'calendrier' }),
        ] }));
    }
  }
  // Échéances proches (proches et crédits) arrivées
  for (const p of etat.prets.filter((x) => x.statut !== 'solde' && x.sens === 'empruntéParMoi')) {
    for (const e of p.echeancier.filter((x) => !x.payee && x.date <= ajouterJours(auj, 2))) {
      res.push(bandeau({ type: 'action', icone: 'personnes', titre: `Rembourser ${p.personneAlias} : ${formatEuros(e.montantCentimes)}`, texte: `Prévu le ${formatDate(e.date)}${p.objet ? ` (${p.objet})` : ''}.`, actions: [bouton("C'est fait", async () => { await payerEcheancePret(p.id, e.date); toast('Remboursement enregistré.', { type: 'succes' }); }, { classe: 'btn-principal btn-petit' })] }));
    }
  }
  // Prélèvements dans les 3 jours
  const proj3 = projectionDecouvert(etat, auj, { inclureRythme: false, jours: 3 });
  if (proj3?.evenements.length) {
    const evs = proj3.evenements.filter((e) => e.type === 'charge' || e.type === 'credit');
    if (evs.length) res.push(bandeau({ type: 'info', icone: 'calendrier', titre: 'Prélèvements dans les 3 jours', texte: evs.map((e) => h('span', { class: 'ligne-mini' }, h('span', {}, `${formatDateCourte(e.date)}  ${e.libelle}`), mt(-e.montantCentimes))) }));
  }
  // Questions en attente
  const q = etat.questions.filter((x) => x.statut === 'ouverte').length;
  if (q) res.push(bandeau({ type: 'info', icone: 'info', titre: `${q} question${q > 1 ? 's' : ''} sur tes relevés`, texte: 'Pré-remplies avec ma meilleure supposition : confirme ou corrige.', actions: [bouton('Répondre', () => aller('reglages/questions'), { classe: 'btn-petit' })] }));
  // Sauvegarde hebdomadaire
  const der = etat.parametres.derniereSauvegarde;
  if (etat.transactions.length && (!der || diffJours(der.slice(0, 10), auj) >= 7)) {
    res.push(bandeau({ type: 'info', icone: 'telecharger', titre: 'Sauvegarde de la semaine', texte: der ? `Dernière sauvegarde le ${formatDate(der.slice(0, 10))}.` : 'Aucune sauvegarde : tes données ne vivent que sur cet iPhone.', actions: [bouton('Sauvegarder', () => exporterSauvegarde(), { classe: 'btn-petit' })] }));
  }
  if (!res.length) return null;
  // Trois rappels visibles au plus : l'écran doit se comprendre en 2 secondes
  const visibles = res.slice(0, 3);
  const autres = res.slice(3);
  return h('div', { class: 'bandeaux' }, visibles, autres.length ? h('details', { class: 'autres-rappels' }, h('summary', {}, `Voir ${autres.length} autre${autres.length > 1 ? 's' : ''} rappel${autres.length > 1 ? 's' : ''}`), h('div', { class: 'bandeaux' }, autres)) : null);
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
  return carte(p.risque || p.chargeNonCouverte || p.premierNegatif ? 'À surveiller' : 'Découvert', contenu, { id: 'decouvert', classe: p.risque ? 'carte-alerte' : '' });
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
  return carte('Tes comptes', h('div', { class: 'liste-cles' },
    h('div', { class: 'ligne-cle forte' }, h('span', {}, 'Au total'), mt(s.globalCentimes, { classe: `total-global ${s.globalCentimes < 0 ? 'negatif' : ''}` })), lignes, abri), { id: 'position' });
}

function epargneBloc(auj) {
  const e = epargneDuMois(etat, auj);
  const cible = e.cibleCentimes;
  return carte('Épargne', h('div', { class: 'liste-cles' },
    h('div', { class: 'ligne-cle' }, h('span', {}, 'Épargné ce mois-ci'), mt(e.nette.nette, { classe: e.nette.nette < 0 ? 'negatif' : 'laiton-texte' })),
    e.nette.reprises ? h('div', { class: 'ligne-cle' }, h('span', {}, `Repris (${e.nette.nbReprises} retrait${e.nette.nbReprises > 1 ? 's' : ''})`), mt(e.nette.reprises, { classe: 'negatif' })) : null,
    h('div', { class: 'ligne-cle' }, h('span', {}, 'Arrondis à virer'), mt(e.cagnotteCentimes)),
    cible ? h('div', { class: 'ligne-objectif' },
      h('div', { class: 'ligne-cle-sans' }, h('span', {}, 'Objectif du mois'), h('span', {}, mt(Math.max(0, e.projectionCentimes)), ' sur ', mt(cible))),
      barre(Math.max(0, e.projectionCentimes), cible, { etat: 'laiton', label: `Épargne projetée ${formatEuros(e.projectionCentimes)} sur ${formatEuros(cible)}` })) : null,
    h('button', { class: 'ligne-lien', type: 'button', onclick: () => aller('epargne') }, h('span', { class: 'ligne-lien-texte' }, 'Mes poches, mon plan et mes dettes'), icone('suivant'))), { id: 'epargne-mois' });
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
  return carte(critique ? 'Enveloppes vitales' : 'Enveloppes du mois', h('div', { class: 'enveloppes' }, lignes), { id: 'enveloppes', action: h('button', { class: 'lien', type: 'button', onclick: () => aller('budgets') }, 'Modifier') });
}

function dernieres() {
  const tx = [...etat.transactions].filter((t) => !t.ajustement).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.creeLe < b.creeLe ? 1 : -1))).slice(0, 6);
  if (!tx.length) return null;
  return carte('Dernières opérations', h('div', { class: 'liste' }, tx.map((t) => ligneTransaction(t, ouvrirDetail, { avecDate: true }))), { id: 'dernieres', action: h('button', { class: 'lien', type: 'button', onclick: () => aller('depenses') }, 'Tout voir') });
}

export { dateDuMois, categorie, payerEcheanceCredit };
