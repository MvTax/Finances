// historique.js — Bilan (mois par mois, catégories, marchands, problèmes) et « Y remédier » (plan d'action).

import { h, icone, mt } from '../ui/dom.js';
import { carte, onglets, bouton, etatVide, segment } from '../ui/composants.js';
import { toast, toastErreur } from '../ui/toast.js';
import { etat, enregistrer, enregistrerLot } from '../store.js';
import { analyser, syntheseMensuelle } from '../detecteurs.js';
import { depensesParCategorie, periodeBudget } from '../calculs.js';
import { planActionLocal, totalEconomies, LIBELLES_ACTIONS } from '../coach.js';
import { histogramme, barresHorizontales } from '../charts.js';
import { aujourdhui, ajouterJours, formatMois, moisDe, ajouterMois, dernierJour } from '../dates.js';
import { formatEuros } from '../money.js';
import { categorie, nomCategorie } from '../categories.js';
import { iaDisponible } from '../gemini.js';
import { coachIA } from '../ia.js';
import { indicationEnvoiGemini } from './communs.js';

export const titre = 'Historique';
let ongletActif = 'bilan';
let periode = '6';

export function rendre(vue, params = []) {
  if (params[0]) ongletActif = params[0];
  const zone = h('div');
  const dessiner = () => zone.replaceChildren(ongletActif === 'remedier' ? vueRemedier() : vueBilan(dessiner));
  vue.replaceChildren(h('h1', { class: 'titre-page' }, 'Historique'),
    onglets([['bilan', 'Bilan'], ['remedier', 'Y remédier']], ongletActif, (v) => { ongletActif = v; history.replaceState(null, '', `#historique/${v}`); dessiner(); }), zone);
  dessiner();
}

function bornes() {
  const tx = etat.transactions.filter((t) => !t.ajustement);
  if (!tx.length) return null;
  const fin = tx.reduce((m, t) => (t.date > m ? t.date : m), '0000-00-00');
  const premier = tx.reduce((m, t) => (t.date < m ? t.date : m), '9999-12-31');
  // Mois de salaire à salaire : on remonte n périodes depuis la dernière opération
  let debut = premier;
  if (periode !== 'tout') { let p = periodeBudget(fin > aujourdhui() ? aujourdhui() : fin, etat.profil); for (let i = 1; i < Number(periode); i++) p = periodeBudget(ajouterJours(p.debut, -1), etat.profil); debut = p.debut; }
  return { debut: debut < premier ? premier : debut, fin: fin > aujourdhui() ? aujourdhui() : fin };
}

function vueBilan(redessiner) {
  const b = bornes();
  if (!b) return etatVide('graphique', 'Pas encore de données', 'Importe tes relevés ou ajoute des dépenses : le bilan apparaît ici.');
  const a = analyser(etat, b.debut, b.fin);
  a.mensuel = syntheseMensuelle(etat, b.debut, b.fin, { parSalaire: true });
  const nbMois = Math.max(1, a.mensuel.length);
  const choix = segment([['3', '3 mois'], ['6', '6 mois'], ['12', '12 mois'], ['tout', 'Tout']], periode, (v) => { periode = v; redessiner(); }, 'Période');
  const mensuel = histogramme({
    titre: 'Revenus et dépenses par mois (de salaire à salaire)',
    description: `Revenus réels (salaire et prime) et dépenses hors virements internes, épargne et prêts, de ${formatMois(moisDe(b.debut))} à ${formatMois(moisDe(b.fin))}.`,
    libelles: a.mensuel.map((m) => formatMois(m.mois, true)),
    series: [{ nom: 'Revenus', valeurs: a.mensuel.map((m) => m.revenus), classe: 'serie-revenus' }, { nom: 'Dépenses', valeurs: a.mensuel.map((m) => m.depenses), classe: 'serie-depenses' }, { nom: 'Épargne nette', valeurs: a.mensuel.map((m) => Math.max(0, m.epargneNette)), classe: 'serie-epargne' }],
  });
  const cats = depensesParCategorie(etat, b.debut, b.fin).slice(0, 10);
  const graphCats = barresHorizontales({ titre: 'Catégories où tu dépenses le plus', description: 'Total sur la période', colonne: 'Catégorie', donnees: cats.map((c) => ({ libelle: categorie(c.categorie).nom, valeur: c.montantCentimes, couleur: categorie(c.categorie).couleur })) });
  const graphMarchands = barresHorizontales({ titre: 'Marchands', description: 'Montant et nombre de passages', colonne: 'Marchand', donnees: a.topMarchands.slice(0, 10).map((m) => ({ libelle: m.marchand, valeur: m.montantCentimes, texte: `${formatEuros(m.montantCentimes, { sansCentimes: true })} · ${m.passages}×` })) });
  return h('div', {}, choix,
    carte('Mois par mois', h('div', {}, h('p', { class: 'petit' }, 'Chaque mois va du jour du salaire à la veille du salaire suivant.'), mensuel, tableMensuel(a.mensuel))),
    carte('Où part ton argent', graphCats),
    carte('Marchands', graphMarchands),
    carte('Problèmes détectés', problemes(a, nbMois)));
}

function tableMensuel(m) {
  return h('div', { class: 'tableau-defile' }, h('table', { class: 'tableau' }, h('caption', { class: 'sr' }, 'Synthèse mensuelle'),
    h('thead', {}, h('tr', {}, ['Mois', 'Revenus', 'Dépenses', 'Crédits', 'Épargne nette', 'Solde'].map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, m.map((x) => h('tr', {}, h('th', { scope: 'row' }, formatMois(x.mois, true)), h('td', {}, mt(x.revenus)), h('td', {}, mt(x.depenses)), h('td', {}, mt(x.dettes)), h('td', { class: x.epargneNette < 0 ? 'negatif-texte' : '' }, mt(x.epargneNette)), h('td', { class: x.solde < 0 ? 'negatif-texte' : '' }, mt(x.solde)))))));
}

function probleme(ic, titreP, texte, niveau = 'info') {
  return h('div', { class: `probleme probleme-${niveau}` }, h('span', { class: 'probleme-icone' }, icone(ic)), h('div', {}, h('strong', {}, titreP), h('p', {}, texte)));
}

function problemes(a, nbMois) {
  const l = [];
  const pm = (c) => formatEuros(Math.round(c / nbMois));
  if (a.creditInstant.nbDeblocages) l.push(probleme('cle', 'Crédit instantané', `${a.creditInstant.nbDeblocages} déblocage(s) pour ${formatEuros(a.creditInstant.totalDebloqueCentimes)}, ${formatEuros(a.creditInstant.fraisCentimes)} de frais. Chaque échéance ampute le mois suivant.`, 'alerte'));
  if (a.frais.totalCentimes) l.push(probleme('banque', 'Frais bancaires', `${formatEuros(a.frais.totalCentimes)} sur la période (≈ ${formatEuros(a.frais.annuelCentimes)} par an) : ${a.frais.parType.map(([k, v]) => `${k} ${formatEuros(v)}`).join(', ')}.`, a.frais.parType.some(([k]) => /incident/i.test(k)) ? 'alerte' : 'info'));
  if (a.decouverts.joursNegatifs) l.push(probleme('alerte', 'Découverts', `${a.decouverts.joursNegatifs} jours sous 0 € (${a.decouverts.episodes} épisode(s), plus bas ${formatEuros(a.decouverts.plusBasCentimes)}).${a.decouverts.abri.length ? ` ${a.decouverts.abri.length} mise(s) à l'abri sur la néobanque pendant un découvert.` : ''}`, 'alerte'));
  if (a.epargne.nbReprises) l.push(probleme('tirelire', 'Épargne reprise', `${a.epargne.nbReprises} reprises pour ${formatEuros(a.epargne.repriseCentimes)} ; épargne nette ${formatEuros(a.epargne.nette)}. Jour médian des reprises : le ${a.epargne.joursMedian}.`, a.epargne.nette <= 0 ? 'alerte' : 'info'));
  if (a.livraison.commandes) l.push(probleme('sac', 'Livraison de repas', `${a.livraison.commandes} commandes pour ${formatEuros(a.livraison.totalCentimes)} (≈ ${pm(a.livraison.totalCentimes)}/mois), dont ${a.livraison.nbTiers} via un tiers (${formatEuros(a.livraison.tiersCentimes)}). Panier moyen ${formatEuros(a.livraison.panierMoyenCentimes)}.`));
  if (a.vtc.nb) l.push(probleme('voiture', 'VTC', `${a.vtc.nb} trajets pour ${formatEuros(a.vtc.totalCentimes)} (≈ ${pm(a.vtc.totalCentimes)}/mois)${a.vtc.passTransport.length ? ' alors que tu paies un pass transport.' : '.'}`));
  if (a.restaurationRapide.nb) l.push(probleme('burger', 'Restauration rapide', `${a.restaurationRapide.nb} passages pour ${formatEuros(a.restaurationRapide.totalCentimes)}, surtout ${a.restaurationRapide.parMarchand.slice(0, 3).map(([m, v]) => `${m} (${formatEuros(v)})`).join(', ')}.`));
  if (a.shopping.nb) l.push(probleme('tshirt', 'Shopping', `${a.shopping.nb} achats vêtements, beauté et en ligne pour ${formatEuros(a.shopping.totalCentimes)}.`));
  if (a.especes.totalCentimes) l.push(probleme('billet', 'Espèces', `${a.especes.nb} retraits pour ${formatEuros(a.especes.totalCentimes)}, dont ${formatEuros(a.especes.nonJustifieCentimes)} non justifiés${a.especes.fraisCentimes ? ` (+${formatEuros(a.especes.fraisCentimes)} de frais)` : ''}.`, a.especes.nonJustifieCentimes > 30000 ? 'alerte' : 'info'));
  if (a.proches.liste.length) l.push(probleme('personnes', 'Prêts et flux avec les proches', `Reçu ${formatEuros(a.proches.totalEntrees)}, envoyé ${formatEuros(a.proches.totalSorties)} (hors revenus et dépenses).`));
  if (a.micro.nb) l.push(probleme('fleches', 'Micro-virements répétés', `${a.micro.nb} petits virements à des particuliers hors commandes (${formatEuros(a.micro.totalCentimes)}).`));
  for (const d of a.doublons) l.push(probleme('boucle', 'Abonnements en doublon', `${d.libelle} : ${d.elements.map((e) => `${e.marchand} ${formatEuros(e.mensuelCentimes)}/mois`).join(', ')}.`));
  if (a.velo.suspectes) l.push(probleme('velo', 'Vélo en libre-service', `${a.velo.suspectes} débits en double le même jour (${formatEuros(a.velo.suspectesCentimes)}) : probables pénalités de dépassement.`));
  const w = a.weekend;
  l.push(probleme('calendrier', 'Week-end', w.parJourWeekend > w.parJourSemaine * 1.2 ? `Fuite du week-end : ${formatEuros(w.parJourWeekend)} par jour de week-end contre ${formatEuros(w.parJourSemaine)} en semaine (≈ ${formatEuros(w.surcoutMensuel)} de plus par mois).` : `Pas de fuite du week-end : ${formatEuros(w.parJourWeekend)} par jour de week-end contre ${formatEuros(w.parJourSemaine)} en semaine.`));
  return h('div', { class: 'problemes' }, l);
}

// ---------------------------------------------------------------------------
// Y remédier
// ---------------------------------------------------------------------------
function vueRemedier() {
  const cartesStockees = etat.planAction;
  const locales = planActionLocal(etat);
  const parId = new Map(cartesStockees.map((c) => [c.id, c]));
  const cartes = [...cartesStockees.filter((c) => c.source === 'gemini'), ...locales.map((c) => ({ ...c, ...(parId.get(c.id) ? { statut: parId.get(c.id).statut } : {}) }))];
  const objectif = etat.profil.objectifEpargneCentimes || 50000;
  const total = totalEconomies(cartes);
  const ia = iaDisponible();
  const zone = h('div', { class: 'cartes-action' }, cartes.length ? cartes.map(carteAction) : etatVide('ampoule', 'Rien à signaler', 'Importe quelques semaines de dépenses pour obtenir des actions chiffrées.'));
  return h('div', {},
    carte(null, h('div', {}, h('p', { class: 'petit' }, 'Économie potentielle des actions'), h('p', { class: 'grand-montant' }, mt(total), h('small', {}, ' / mois')), h('p', { class: 'petit' }, `soit ${formatEuros(total * 12)} par an, pour un objectif d'épargne de ${formatEuros(objectif)} par mois.`))),
    ia.ok ? h('div', { class: 'bloc-ia' }, indicationEnvoiGemini('des totaux anonymisés : marchands normalisés, montants, nombres de passages, frais et crédits. Aucun libellé bancaire, IBAN ni nom de particulier.'), bouton('Demander au coach Gemini', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const nouvelles = await coachIA();
        await enregistrerLot([...etat.planAction.filter((c) => c.source === 'gemini').map((c) => ({ collection: 'planAction', valeur: c, supprimer: true })), ...nouvelles.map((c) => ({ collection: 'planAction', valeur: { ...c, statut: 'aFaire', date: aujourdhui() } }))]);
        toast(`${nouvelles.length} actions du coach ajoutées.`, { type: 'succes' });
      } catch (err) { toastErreur(err.message); } finally { btn.disabled = false; }
    }, { classe: 'btn-secondaire', icone: 'ia' })) : h('p', { class: 'petit' }, 'Plan calculé par règles locales (aucune donnée envoyée).'),
    zone);
}

function carteAction(c) {
  const statut = c.statut || 'aFaire';
  const maj = async (s) => { await enregistrer('planAction', { ...c, statut: s, date: aujourdhui() }); };
  return h('article', { class: `carte-action action-${c.action} ${statut === 'ignore' ? 'ignoree' : ''}` },
    h('div', { class: 'carte-action-tete' }, h('span', { class: `badge-action badge-${c.action}` }, LIBELLES_ACTIONS[c.action]), h('h3', {}, c.marchand), c.source === 'gemini' ? h('span', { class: 'etiquette' }, 'Gemini') : null),
    h('p', { class: 'constat' }, c.constat),
    h('p', { class: 'consigne' }, c.consigne),
    c.economieMensuelleCentimes ? h('p', { class: 'economie' }, icone('pieces'), ' ', mt(c.economieMensuelleCentimes), ' / mois · ', mt(c.economieAnnuelleCentimes), ' / an') : null,
    h('div', { class: 'segment-statut' }, segment([['fait', 'Fait'], ['aFaire', 'Pas fait'], ['ignore', 'Ignoré']], statut, maj, `Statut de l'action ${c.marchand}`)));
}

export { nomCategorie, dernierJour };
