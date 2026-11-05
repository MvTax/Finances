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

  const prenom = etat.profil.prenomAffichage ? `Bonjour ${etat.profil.prenomAffichage}` : 'Bonjour';
  const entete = h('div', { class: 'accueil-entete' },
    h('div', {}, h('p', { class: 'surtitre' }, formatJourLong(auj)), h('h1', { class: 'grand-titre' }, prenom)),
    h('div', { class: 'accueil-boutons' },
      h('button', { class: 'btn-icone', type: 'button', 'aria-label': 'Historique et bilan', onclick: () => aller('historique') }, icone('graphique'))));

  // ---- Chiffre principal
  const chiffre = h('p', { class: `chiffre-principal ${r.resteCentimes < 0 ? 'negatif' : ''}`, 'aria-live': 'polite' }, estMasque() ? '•••,•• €' : formatEuros(r.resteCentimes));
  if (!estMasque() && dernierReste !== null && dernierReste !== r.resteCentimes) animerMontant(chiffre, dernierReste, r.resteCentimes, (c) => formatEuros(c));
  dernierReste = r.resteCentimes;
  const travail = r.resteCentimes > 0 ? equivalentTravail(r.resteCentimes, th) : null;
  const hero = h('section', { class: `hero ${critique ? 'hero-critique' : ''}`, 'aria-labelledby': 'hero-t' },
    h('h2', { id: 'hero-t', class: 'hero-libelle' }, 'Reste à dépenser ce mois-ci'),
    chiffre,
    h('p', { class: 'hero-sous' }, `du ${formatDateCourte(r.periode.debut)} au ${formatDateCourte(r.periode.fin)}`, travail ? ` · ≈ ${travail} de travail` : '',
      r.revenus.statut === 'attendu' && r.revenus.totalCentimes ? h('span', { class: 'etiquette' }, 'revenus attendus') : null),
    jaugeBloc(jauge, th, critique));

  const blocs = [entete, hero, ...bandeaux(r, auj)];
  if (!r.revenus.totalCentimes && !etat.transactions.length) {
    blocs.push(etatVide('importer', 'Commence par tes revenus', 'Saisis ton salaire et ta prime du mois, ou importe un relevé : l’app calcule ensuite ce que tu peux dépenser chaque jour.',
      h('div', { class: 'groupe-boutons' }, bouton('Saisir mes revenus', () => feuilleRevenus(r.periode.mois), { classe: 'btn-principal' }), bouton('Importer un relevé', () => aller('reglages/import')))));
  }
  blocs.push(risqueDecouvert(auj));
  blocs.push(positionGlobale(auj));
  blocs.push(epargneBloc(auj));
  blocs.push(enveloppesBloc(r, critique));
  blocs.push(dernieres());
  vue.replaceChildren(...blocs.filter(Boolean));
}

function jaugeBloc(j, th, critique) {
  const dispo = j.restantAujourdhuiCentimes;
  return h('div', { class: `jauge-jour ${dispo < 0 ? 'depassee' : critique ? 'critique' : ''}` },
    h('div', { class: 'jauge-ligne' },
      h('span', { class: 'jauge-libelle' }, icone('sablier'), "Aujourd'hui"),
      h('span', { class: 'jauge-valeur' }, mt(Math.max(dispo, -999999)), h('span', { class: 'jauge-sur' }, ' / ', mt(j.parJourCentimes)))),
    barre(j.depensesDuJourCentimes, Math.max(1, j.parJourCentimes), { label: `Dépensé aujourd'hui : ${formatEuros(j.depensesDuJourCentimes)} sur ${formatEuros(j.parJourCentimes)}` }),
    h('p', { class: 'jauge-aide' }, critique ? 'Fin de mois critique : seules les enveloppes vitales sont affichées.' : `${j.joursRestants} jour${j.joursRestants > 1 ? 's' : ''} jusqu'au prochain salaire${th ? ` · 1 h de travail = ${formatEuros(th)}` : ''}`));
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
    if (evs.length) res.push(bandeau({ type: 'info', icone: 'calendrier', titre: 'Prélèvements dans les 3 jours', texte: evs.map((e) => `${formatDateCourte(e.date)} ${e.libelle} ${formatEuros(-e.montantCentimes)}`).join(' · ') }));
  }
  // Questions en attente
  const q = etat.questions.filter((x) => x.statut === 'ouverte').length;
  if (q) res.push(bandeau({ type: 'info', icone: 'info', titre: `${q} question${q > 1 ? 's' : ''} sur tes relevés`, texte: 'Pré-remplies avec ma meilleure supposition : confirme ou corrige.', actions: [bouton('Répondre', () => aller('reglages/questions'), { classe: 'btn-petit' })] }));
  // Sauvegarde hebdomadaire
  const der = etat.parametres.derniereSauvegarde;
  if (etat.transactions.length && (!der || diffJours(der.slice(0, 10), auj) >= 7)) {
    res.push(bandeau({ type: 'info', icone: 'telecharger', titre: 'Sauvegarde de la semaine', texte: der ? `Dernière sauvegarde le ${formatDate(der.slice(0, 10))}.` : 'Aucune sauvegarde : tes données ne vivent que sur cet iPhone.', actions: [bouton('Sauvegarder', () => exporterSauvegarde(), { classe: 'btn-petit' })] }));
  }
  if (!res.length) return [];
  // Trois rappels visibles au plus : l'écran doit se comprendre en 2 secondes
  const visibles = res.slice(0, 3);
  const autres = res.slice(3);
  return [h('div', { class: 'bandeaux' }, visibles, autres.length ? h('details', { class: 'autres-rappels' }, h('summary', {}, `${autres.length} autre${autres.length > 1 ? 's' : ''} rappel${autres.length > 1 ? 's' : ''}`), h('div', { class: 'bandeaux' }, autres)) : null)];
}

function risqueDecouvert(auj) {
  const p = projectionDecouvert(etat, auj, { jours: 7 });
  if (!p) return null;
  const pc = p.commissionCentimes;
  let contenu;
  if (p.chargeNonCouverte || p.premierNegatif) {
    const cible = p.loyerNonCouvert || p.chargeNonCouverte;
    const titreAlerte = cible ? `${p.compte.nom} ne couvre pas ${cible.estLoyer ? 'le loyer' : cible.libelle} du ${formatDateCourte(cible.date)}` : `${p.compte.nom} passe sous 0 € le ${formatDateCourte(p.premierNegatif.date)}`;
    contenu = h('div', { class: 'alerte-decouvert', role: 'alert' },
      h('p', { class: 'alerte-titre' }, icone('alerte'), titreAlerte),
      h('p', {}, cible ? `Solde projeté après ${cible.estLoyer ? 'le loyer' : 'ce prélèvement'} : ` : 'Solde projeté : ', mt(cible ? cible.soldeApresCentimes : p.premierNegatif.soldeCentimes, { classe: 'negatif' }),
        `. Solde actuel : `, mt(p.soldeActuelCentimes), '.'),
      p.nonCouverts.length > 1 ? h('p', { class: 'petit' }, 'Non couverts : ', p.nonCouverts.map((e) => `${formatDateCourte(e.date)} ${e.libelle} (${formatEuros(-e.montantCentimes)})`).join(', '), '.') : null,
      h('p', { class: 'petit' }, `Chaque opération passée à découvert peut coûter une commission d'intervention de ${formatEuros(pc)}.`, revenusNonConfirmes() ? ' Ton salaire n’est pas encore confirmé : il n’est pas compté.' : ''));
  } else {
    contenu = h('div', { class: 'ok-decouvert' },
      h('p', {}, icone('ok'), `${p.compte.nom} couvre les 7 prochains jours.`),
      p.loyer ? h('p', { class: 'petit' }, 'Solde restant après le loyer du ', formatDateCourte(p.loyer.date), ' et les prélèvements : ', mt(p.soldeApresChargesCentimes), '.') : h('p', { class: 'petit' }, 'Solde après prélèvements connus : ', mt(p.soldeApresChargesCentimes), `, avec ${formatEuros(p.rythmeCentimes)} de dépenses par jour.`));
  }
  return carte('Risque de découvert', contenu, { id: 'decouvert', classe: p.risque ? 'carte-alerte' : '' });
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
      h('p', {}, icone('info'), ` Ton compte courant est à `, mt(s.alerteAbri.courantCentimes, { classe: 'negatif' }), ' alors que ', mt(s.alerteAbri.abriCentimes), ' sont sur ta néobanque.'),
      h('p', { class: 'petit' }, `Rapatrier ${formatEuros(s.alerteAbri.rapatriableCentimes)} ramène le compte à 0 €. Le découvert t'a coûté ${formatEuros(cout.fraisCentimes)} de frais sur 12 mois, et chaque prélèvement passé à découvert peut déclencher une commission de ${formatEuros(etat.parametres.commissionInterventionCentimes || 800)}.`));
  }
  return carte('Position globale', h('div', {}, h('p', { class: 'total-global' }, mt(s.globalCentimes, { classe: s.globalCentimes < 0 ? 'negatif' : '' })), h('div', { class: 'liste-cles' }, lignes), abri), { id: 'position' });
}

function epargneBloc(auj) {
  const e = epargneDuMois(etat, auj);
  const cible = e.cibleCentimes;
  const sources = [
    ['Virements vers le livret', e.nette.parType.virementLivret || 0],
    ["Arrondi de la banque", e.nette.parType.arrondiBanque || 0],
    ["Arrondis de l'app virés", e.nette.parType.arrondiApp || 0],
  ].filter(([, v]) => v);
  return carte('Épargne du mois', h('div', {},
    h('div', { class: 'ligne-cle forte' }, h('span', {}, 'Épargne nette réelle'), mt(e.nette.nette, { classe: e.nette.nette < 0 ? 'negatif' : '' })),
    e.nette.reprises ? h('p', { class: 'petit negatif-texte' }, `dont ${formatEuros(e.nette.reprises)} repris (${e.nette.nbReprises} retrait${e.nette.nbReprises > 1 ? 's' : ''})`) : null,
    sources.length ? h('p', { class: 'petit' }, sources.map(([l, v]) => `${l} ${formatEuros(v)}`).join(' · ')) : null,
    h('div', { class: 'ligne-cle' }, h('span', {}, 'Arrondis à virer'), mt(e.cagnotteCentimes)),
    cible ? h('div', {}, barre(Math.max(0, e.projectionCentimes), cible, { etat: e.projectionCentimes >= cible ? 'vert' : 'bleu', label: `Épargne projetée ${formatEuros(e.projectionCentimes)} sur ${formatEuros(cible)}` }), h('p', { class: 'petit' }, 'Objectif du mois : ', mt(cible), ' · projeté : ', mt(e.projectionCentimes))) : null,
    h('button', { class: 'lien', type: 'button', onclick: () => aller('epargne') }, 'Mes poches et mon plan', icone('suivant'))), { id: 'epargne-mois' });
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
      h('span', { class: 'ligne-enveloppe-haut' }, h('span', {}, e.nom, e.sanctuarisee ? h('span', { class: 'etiquette' }, 'sans culpabilité') : null), h('span', {}, mt(depense), ' / ', mt(plafond))),
      barre(depense, plafond, { label: `${e.nom} : ${formatEuros(depense)} sur ${formatEuros(plafond)}` }));
  });
  return carte(critique ? 'Enveloppes vitales' : 'Enveloppes', h('div', { class: 'enveloppes' }, lignes), { id: 'enveloppes' });
}

function dernieres() {
  const tx = [...etat.transactions].filter((t) => !t.ajustement).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.creeLe < b.creeLe ? 1 : -1))).slice(0, 6);
  if (!tx.length) return null;
  return carte('Dernières opérations', h('div', { class: 'liste' }, tx.map((t) => ligneTransaction(t, ouvrirDetail, { avecDate: true }))), { id: 'dernieres', action: h('button', { class: 'lien', type: 'button', onclick: () => aller('depenses') }, 'Tout voir') });
}

export { dateDuMois, categorie, payerEcheanceCredit };
