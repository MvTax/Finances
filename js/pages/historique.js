// historique.js — Statistiques des mois passés (bilan, postes, mois par mois, marchands, problèmes) et Conseils.

import { h, icone, mt } from '../ui/dom.js';
import { aller } from '../router.js';
import { carte, onglets, bouton, etatVide, segment, statistique } from '../ui/composants.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { postesDepense, conseilsPoste } from '../conseils.js';
import { habitudes } from '../raisonnement.js';
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

export const titre = 'Statistiques';
let ongletActif = 'bilan';
let periode = '6';

/** Statistiques des mois passés (relevés, fiches de paie) et conseils. Le budget du mois, lui, ne dépend que du mois en cours. */
export function rendre(vue, params = []) {
  if (params[0]) ongletActif = params[0] === 'remedier' ? 'conseils' : params[0];
  const zone = h('div');
  const dessiner = () => zone.replaceChildren(ongletActif === 'conseils' ? vueConseils(dessiner) : vueBilan(dessiner));
  vue.replaceChildren(h('button', { class: 'lien retour', type: 'button', onclick: () => aller('depenses') }, icone('retour'), 'Dépenses'), h('h1', { class: 'titre-page' }, 'Statistiques'),
    h('p', { class: 'sous-titre-page' }, 'Tes mois passés, pour comprendre où part ton argent. Le budget du mois en cours ne dépend que de ce mois-ci.'),
    onglets([['bilan', 'Bilan'], ['conseils', 'Conseils']], ongletActif, (v) => { ongletActif = v; history.replaceState(null, '', `#statistiques/${v}`); dessiner(); }), zone);
  dessiner();
}

/** Mois passés seulement : du début de la période choisie à la veille du mois en cours. */
function bornes() {
  const tx = etat.transactions.filter((t) => !t.ajustement);
  if (!tx.length) return null;
  const premier = tx.reduce((m, t) => (t.date < m ? t.date : m), '9999-12-31');
  const courant = periodeBudget(aujourdhui(), etat.profil);
  const fin = ajouterJours(courant.debut, -1);
  if (fin < premier) return null;
  let debut = premier;
  if (periode !== 'tout') { let p = periodeBudget(fin, etat.profil); for (let i = 1; i < Number(periode); i++) p = periodeBudget(ajouterJours(p.debut, -1), etat.profil); debut = p.debut; }
  return { debut: debut < premier ? premier : debut, fin, courant };
}

const moisEnCours = (b) => ({ ...b.courant, aujourdhui: aujourdhui() });
/** Montant arrondi à l'euro, pour les moyennes et les estimations. */
const eur0 = (c) => formatEuros(Math.round(c / 100) * 100, { sansCentimes: true });

function vueBilan(redessiner) {
  const b = bornes();
  if (!b) return etatVide('graphique', 'Pas encore de mois passés', 'Importe tes relevés : les statistiques des mois précédents apparaissent ici.');
  const a = analyser(etat, b.debut, b.fin);
  a.mensuel = syntheseMensuelle(etat, b.debut, b.fin, { parSalaire: true }).map((m) => {
    // Fiche de paie du mois (revenus saisis ou importés) quand elle existe
    const f = (etat.revenusMensuels || []).find((r) => r.mois === m.mois && r.statut !== 'attendu');
    const fiche = f ? (f.salaireCentimes || 0) + (f.primeActiviteCentimes || 0) + (f.autresEntrees || []).reduce((s, x) => s + (x.montantCentimes || 0), 0) : null;
    return { ...m, revenusFiche: fiche, revenusRetenus: fiche ?? m.revenus };
  });
  const nbMois = Math.max(1, a.mensuel.length);
  const choix = segment([['3', '3 mois'], ['6', '6 mois'], ['12', '12 mois'], ['tout', 'Tout']], periode, (v) => { periode = v; redessiner(); }, 'Période');
  const postes = postesDepense(etat, { debut: b.debut, fin: b.fin, moisEnCours: moisEnCours(b) });
  const mensuel = histogramme({
    titre: 'Revenus et dépenses par mois (de salaire à salaire)',
    description: `Revenus (fiches de paie quand elles sont connues) et dépenses hors virements internes, épargne et prêts, de ${formatMois(moisDe(b.debut))} à ${formatMois(moisDe(b.fin))}.`,
    libelles: a.mensuel.map((m) => formatMois(m.mois, true)),
    series: [{ nom: 'Revenus', valeurs: a.mensuel.map((m) => m.revenusRetenus), classe: 'serie-revenus' }, { nom: 'Dépenses', valeurs: a.mensuel.map((m) => m.depenses), classe: 'serie-depenses' }, { nom: 'Épargne nette', valeurs: a.mensuel.map((m) => Math.max(0, m.epargneNette)), classe: 'serie-epargne' }],
  });
  const graphMarchands = barresHorizontales({ titre: 'Marchands', description: 'Montant et nombre de passages', colonne: 'Marchand', donnees: a.topMarchands.slice(0, 10).map((m) => ({ libelle: m.marchand, valeur: m.montantCentimes, texte: `${formatEuros(m.montantCentimes, { sansCentimes: true })} · ${m.passages}×` })) });
  return h('div', {}, choix,
    carte('En bref', enBref(a, postes, nbMois, b)),
    carte('Où part ton argent', h('div', {}, h('p', { class: 'petit' }, 'Moyenne par mois sur la période. Touche « Conseils » pour savoir quoi remplacer, et par quoi.'), listePostes(postes, b))),
    carte('Mois par mois', h('div', {}, h('p', { class: 'petit' }, 'Chaque mois va du jour du salaire à la veille du salaire suivant. Revenus : ta fiche de paie quand elle est connue.'), mensuel, tableMensuel(a.mensuel))),
    carte('Marchands', graphMarchands),
    carte('Problèmes détectés', problemes(a, nbMois)));
}

/** Les phrases qui résument les mois passés, et le mois en cours face à la moyenne. */
function enBref(a, postes, nbMois, b) {
  const moy = (k) => Math.round(a.mensuel.reduce((s, m) => s + m[k], 0) / nbMois);
  const hab = habitudes(etat, aujourdhui(), { nbMois: Math.min(nbMois, 3) });
  const top = postes.slice(0, 3);
  const auDessus = postes.filter((p) => p.ecartCentimes > Math.max(1500, p.attenduCeJourCentimes * 0.25)).sort((x, y) => y.ecartCentimes - x.ecartCentimes).slice(0, 3);
  const w = a.weekend;
  const lignes = [
    h('div', { class: 'stats-chiffres' },
      statistique('Revenus', eur0(moy('revenusRetenus')), { detail: 'par mois' }),
      statistique('Dépenses', eur0(moy('depenses')), { detail: 'par mois' }),
      statistique('Épargne nette', eur0(moy('epargneNette')), { detail: 'par mois', classe: moy('epargneNette') < 0 ? 'negatif' : '' })),
    top.length ? h('p', {}, 'Tu dépenses le plus en ', ...top.flatMap((p, i) => [i ? (i === top.length - 1 ? ' et ' : ', ') : '', h('strong', {}, p.nom), ` (${eur0(p.moyenneMensuelleCentimes)}/mois, ${Math.round(p.part * 100)} %)`]), '.') : null,
    hab ? h('p', {}, `Au quotidien, tu dépenses environ ${eur0(hab.parJourCentimes)} par jour${hab.familles[0] ? `, surtout en « ${hab.familles[0].nom} » (environ ${eur0(hab.familles[0].parSemaineCentimes)} par semaine)` : ''}.`) : null,
    w && w.parJourWeekend > w.parJourSemaine * 1.2 ? h('p', {}, `Le week-end coûte plus cher : ${formatEuros(w.parJourWeekend)} par jour, contre ${formatEuros(w.parJourSemaine)} en semaine.`) : null,
    auDessus.length
      ? h('div', { class: 'stats-alerte' }, h('p', {}, h('strong', {}, 'Ce mois-ci, tu es au-dessus de ta moyenne en :')),
        h('ul', {}, auDessus.map((p) => h('li', {}, `${p.nom} : ${formatEuros(p.ceMoisQuotidienCentimes)} depuis le salaire, contre ${formatEuros(p.attenduCeJourCentimes)} d’habitude à ce stade du mois `, h('button', { type: 'button', class: 'lien-inline', onclick: () => ouvrirConseils(p.id, b) }, 'Conseils')))))
      : h('p', { class: 'petit' }, 'Ce mois-ci, aucun poste ne dépasse nettement ta moyenne à ce stade du mois.'),
  ];
  return h('div', { class: 'stats-bref' }, lignes);
}

/** Postes de dépense avec barre, moyenne mensuelle et bouton « Conseils ». */
function listePostes(postes, b) {
  if (!postes.length) return etatVide('graphique', 'Aucune dépense', 'Pas de dépense sur cette période.');
  const max = postes[0].moyenneMensuelleCentimes || 1;
  return h('div', { class: 'postes' }, postes.slice(0, 15).map((p) => h('div', { class: 'poste', style: { '--c': categorie(p.id).couleur } },
    h('span', { class: 'puce-cat', 'aria-hidden': 'true' }, icone(categorie(p.id).icone)),
    h('div', { class: 'poste-texte' },
      h('span', { class: 'poste-nom' }, p.nom),
      h('div', { class: 'poste-barre', 'aria-hidden': 'true' }, h('span', { style: { width: `${Math.max(2, Math.round((p.moyenneMensuelleCentimes / max) * 100))}%` } })),
      h('small', { class: 'poste-detail' }, h('strong', { class: 'poste-montant' }, `${eur0(p.moyenneMensuelleCentimes)}/mois`), ` · ${Math.round(p.part * 100)} %${p.ceMoisCentimes > 0 ? ` · ce mois-ci ${eur0(p.ceMoisCentimes)}` : ''}`)),
    h('button', { type: 'button', class: 'btn btn-secondaire btn-petit poste-conseils', onclick: () => ouvrirConseils(p.id, b), 'aria-label': `Conseils pour ${p.nom}` }, icone('ampoule'), h('span', {}, 'Conseils')))));
}

/** Feuille « Conseils » d'un poste : chiffres, quoi remplacer par quoi, astuces, gratuit. */
export function ouvrirConseils(id, b = bornes()) {
  if (!b) return;
  const c = conseilsPoste(etat, id, { debut: b.debut, fin: b.fin, aujourdhui: aujourdhui() });
  const liste = (titreL, items) => (items.length ? h('section', { class: 'conseil-bloc' }, h('h3', {}, titreL), h('ul', {}, items)) : null);
  ouvrirFeuille({
    titre: `Conseils : ${c.nom}`,
    contenu: h('div', { class: 'conseils-feuille' },
      h('div', { class: 'conseil-chiffres' },
        h('p', {}, `En moyenne ${eur0(c.moyenneMensuelleCentimes)} par mois${c.passages ? `, ${c.passages} paiement${c.passages > 1 ? 's' : ''} sur la période` : ''}.`),
        c.marchands.length ? h('p', { class: 'petit' }, `Surtout : ${c.marchands.slice(0, 3).map((m) => `${m.nom} (${eur0(m.centimes)})`).join(', ')}.`) : null,
        c.economieMensuelleCentimes ? h('p', { class: 'conseil-economie' }, icone('pieces'), ` En réduisant de ${Math.round(c.tauxVise * 100)} % : environ ${eur0(c.economieMensuelleCentimes)} par mois, ${eur0(c.economieAnnuelleCentimes)} par an.`) : null,
        c.essentiel ? h('p', { class: 'petit' }, 'Poste nécessaire : on l’optimise, on ne le supprime pas.') : null),
      liste('Remplacer', c.remplacer.map(([avant, apres]) => h('li', {}, h('span', { class: 'conseil-avant' }, avant), h('span', { 'aria-hidden': 'true' }, ' → '), h('span', { class: 'sr' }, ' par '), h('strong', {}, apres)))),
      c.abonnements.length ? h('section', { class: 'conseil-bloc' }, h('h3', {}, 'Tes abonnements'), c.abonnements.map((s) => h('div', { class: 'conseil-abo' },
        h('p', {}, h('strong', {}, s.nom), ` · ${formatEuros(s.mensuelCentimes)} /mois`), s.conseil ? h('p', { class: 'petit' }, s.conseil) : null,
        s.alternatives.length ? h('p', { class: 'petit' }, 'Gratuit ou moins cher : ', s.alternatives.join(', '), '.') : null))) : null,
      liste('Astuces', c.astuces.map((x) => h('li', {}, x))),
      liste('Gratuit ou presque', c.gratuit.map((x) => h('li', {}, x)))),
  });
}

/** Onglet « Conseils » : postes où agir en premier, puis les actions chiffrées. */
function vueConseils(redessiner) {
  const b = bornes();
  const postes = b ? postesDepense(etat, { debut: b.debut, fin: b.fin, moisEnCours: moisEnCours(b) }) : [];
  const agir = postes.map((p) => ({ p, c: conseilsPoste(etat, p.id, { debut: b.debut, fin: b.fin, aujourdhui: aujourdhui() }) }))
    .filter(({ c }) => !c.essentiel && c.economieMensuelleCentimes >= 500).sort((x, y) => y.c.economieMensuelleCentimes - x.c.economieMensuelleCentimes).slice(0, 6);
  return h('div', {},
    agir.length ? carte('Où agir en premier', h('div', { class: 'liste-liens' }, agir.map(({ p, c }) => h('button', { type: 'button', class: 'ligne-lien', onclick: () => ouvrirConseils(p.id, b) },
      icone(categorie(p.id).icone), h('span', { class: 'ligne-lien-texte' }, p.nom, h('small', {}, `${eur0(p.moyenneMensuelleCentimes)}/mois · environ ${eur0(c.economieMensuelleCentimes)} à gagner chaque mois`)), icone('suivant'))))) : null,
    vueRemedier());
}

function tableMensuel(m) {
  return h('div', { class: 'tableau-defile' }, h('table', { class: 'tableau' }, h('caption', { class: 'sr' }, 'Synthèse mensuelle'),
    h('thead', {}, h('tr', {}, ['Mois', 'Revenus', 'Dépenses', 'Crédits', 'Épargne nette', 'Solde'].map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, m.map((x) => h('tr', {}, h('th', { scope: 'row' }, formatMois(x.mois, true)), h('td', {}, mt(x.revenusRetenus ?? x.revenus)), h('td', {}, mt(x.depenses)), h('td', {}, mt(x.dettes)), h('td', { class: x.epargneNette < 0 ? 'negatif-texte' : '' }, mt(x.epargneNette)), h('td', { class: x.solde < 0 ? 'negatif-texte' : '' }, mt(x.solde)))))));
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
  const total = totalEconomies(cartes);
  const ia = iaDisponible();
  const zone = h('div', { class: 'cartes-action' }, cartes.length ? cartes.map(carteAction) : etatVide('ampoule', 'Rien à signaler', 'Importe quelques semaines de dépenses pour obtenir des actions chiffrées.'));
  return h('div', {},
    carte(null, h('div', {}, h('p', { class: 'petit' }, 'Économie potentielle des actions'), h('p', { class: 'grand-montant' }, mt(total), h('small', {}, ' / mois')), h('p', { class: 'petit' }, `soit ${formatEuros(total * 12)} par an, qui iraient directement à l’épargne.`))),
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
