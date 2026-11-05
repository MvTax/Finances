// epargne.js (page) — poches, « Mon plan », « Mes dettes », arrondis, simulateurs.

import { h, icone, mt } from '../ui/dom.js';
import { carte, barre, bouton, champ, champMontant, onglets, etatVide, interrupteur, selectionner, statistique } from '../ui/composants.js';
import { ouvrirFeuille, confirmer } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { etat, enregistrer, enregistrerLot, nouvelId } from '../store.js';
import { aller } from '../router.js';
import { soldePoche, epargneNettePoche, cagnotteEnAttente, prochainVirementArrondis, simulerLivret, libellePeriodeArrondis, epargneNettePeriode } from '../epargne.js';
import { planDesMois, atteintes, scenariosPret, moisCourant, entreesDuMois } from '../plan.js';
import { tableauAmortissement, totalInterets, simulerRemboursementAnticipe, verifierCoherencePret, encoursCredit, resteDuPret, capitalRestantDu } from '../dettes.js';
import { aujourdhui, formatDate, formatMois, formatDateCourte, ajouterJours, ajouterMois, dateDuMois, moisDe, listeMois, dernierJour } from '../dates.js';
import { formatEuros } from '../money.js';
import { virerArrondis, enregistrerVirementEpargne, enregistrerReprise, payerEcheanceCredit, payerEcheancePret } from '../actions.js';
import { ajouterAuCalendrier } from '../ics.js';
import { periodeBudget } from '../calculs.js';

export const titre = 'Épargne';
let ongletActif = 'poches';

export function rendre(vue, params = []) {
  if (params[0]) ongletActif = params[0];
  const zone = h('div', { class: 'zone-onglet' });
  const dessiner = () => {
    const f = { poches: vuePoches, plan: vuePlan, dettes: vueDettes, simulateur: vueSimulateur }[ongletActif] || vuePoches;
    zone.replaceChildren(f());
  };
  vue.replaceChildren(
    h('h1', { class: 'titre-page' }, 'Épargne'),
    onglets([['poches', 'Poches'], ['plan', 'Mon plan'], ['dettes', 'Mes dettes'], ['simulateur', 'Simulateur']], ongletActif, (v) => { ongletActif = v; history.replaceState(null, '', `#epargne/${v}`); dessiner(); }),
    zone);
  dessiner();
}

// ---------------------------------------------------------------------------
// Poches
// ---------------------------------------------------------------------------
function vuePoches() {
  const mois = moisCourant(etat);
  const proj = planDesMois(etat, mois, 60);
  const att = atteintes(etat, proj);
  const per = periodeBudget(aujourdhui(), etat.profil);
  const nette = epargneNettePeriode(etat.transactions, per.debut, per.fin);
  const objectif = etat.profil.objectifEpargneCentimes || 0;
  const planMois = proj[0]?.plan;
  const cartesPoches = etat.poches.filter((p) => p.actif !== false).map((p) => {
    const s = soldePoche(p);
    const n = epargneNettePoche(p);
    const dateAtt = att[p.id];
    // L'essentiel visible (solde, objectif, boutons) ; le reste replié dans « Détails »
    const notes = [
      h('p', { class: 'petit' }, `Placé sur ${p.compteSupport ? (/^(livret|lep|ldds)/i.test(p.compteSupport) ? `le ${p.compteSupport}` : p.compteSupport) : 'le livret'}${p.tauxAnnuel ? ` à ${String(p.tauxAnnuel).replace('.', ',')} %` : ''}.`),
      h('p', { class: 'petit' }, 'Épargne nette : ', mt(n.nette), n.reprises ? ` (versé ${formatEuros(n.versements)}, repris ${formatEuros(n.reprises)})` : ''),
      p.type === 'coussin' ? h('p', { class: 'petit' }, 'Uniquement pour les vrais imprévus. Le reprendre pour une dépense courante déclenche l’alerte « épargne reprise ».') : null,
      p.type === 'projet' && /voiture/i.test(p.nom) ? h('p', { class: 'petit' }, 'Avant l’achat, prévois le coût mensuel d’une voiture (assurance, carburant, entretien, stationnement) et ajoute-le aux charges fixes.') : null,
      (p.mouvements || []).length ? h('div', { class: 'liste-cles' }, [...p.mouvements].reverse().slice(0, 30).map((m) => h('div', { class: 'ligne-cle' }, h('span', {}, `${formatDate(m.date)}, ${m.motif || (m.sens === 'versement' ? 'versement' : 'reprise')}`), h('span', { class: m.sens === 'reprise' ? 'negatif-texte' : '' }, m.sens === 'reprise' ? '−' : '+', mt(m.montantCentimes))))) : null,
    ];
    return h('article', { class: 'poche' },
      h('div', { class: 'poche-tete' }, h('h3', {}, p.nom), h('span', { class: 'poche-solde' }, mt(s))),
      p.cibleCentimes ? barre(s, p.cibleCentimes, { etat: 'laiton', label: `${p.nom} : ${formatEuros(s)} sur ${formatEuros(p.cibleCentimes)}` }) : null,
      h('p', { class: 'petit' }, p.cibleCentimes ? ['Objectif ', mt(p.cibleCentimes), dateAtt ? `, atteint en ${formatMois(dateAtt)}` : ''] : 'Sans objectif chiffré'),
      p.type === 'remboursementAnticipe' && s >= (p.palierCentimes || 50000) ? h('p', { class: 'petit vert-texte' }, icone('ok'), ` Palier atteint : tu peux rembourser ${formatEuros(s)} par anticipation.`) : null,
      h('div', { class: 'groupe-boutons' }, bouton('Verser', () => feuilleMouvement(p, 'versement'), { classe: 'btn-petit btn-principal' }), bouton('Reprendre', () => feuilleMouvement(p, 'reprise'), { classe: 'btn-petit' }), bouton('Modifier', () => editerPoche(p), { classe: 'btn-petit' })),
      h('details', { class: 'details-discret' }, h('summary', {}, 'Détails'), h('div', { class: 'details-contenu' }, notes)));
  });
  // Arrondis
  const ar = etat.profil.arrondi || {};
  const cag = cagnotteEnAttente(etat.transactions, ar, etat.cagnotteArrondis);
  const prochaine = ar.actif ? prochainVirementArrondis(ar, aujourdhui(), ar.dernierVirement || null) : null;
  const arrondis = carte('Arrondis à virer', h('div', {},
    ar.actif ? h('div', { class: 'poche-tete' }, h('span', { class: 'petit' }, `Prochain virement le ${formatDate(prochaine)}`), h('span', { class: 'poche-solde' }, mt(cag.total))) : h('p', {}, 'Arrondis désactivés (Réglages → Arrondis).'),
    ar.actif ? h('div', { class: 'groupe-boutons' }, bouton("C'est fait", async () => { if (!cag.total) { toast('Rien à virer pour l’instant.'); return; } await virerArrondis(); toast('Arrondis virés.', { type: 'succes' }); }, { classe: 'btn-principal btn-petit', disabled: !cag.total }),
      bouton('Calendrier', () => ajouterAuCalendrier({ uid: 'arrondis@budget', titre: 'Virer les arrondis sur le Livret', description: 'Ouvre Budget pour voir le montant.', date: prochaine, heure: '19:00', recurrence: { hebdomadaire: 'WEEKLY', quinzaine: 'BIWEEKLY', mensuelle: 'MONTHLY' }[ar.frequence || 'hebdomadaire'], nomFichier: 'virement-arrondis' }), { classe: 'btn-petit', icone: 'calendrier' })) : null,
    ar.actif ? h('details', { class: 'details-discret' }, h('summary', {}, 'Comment ça marche'), h('p', { class: 'petit' }, `${cag.lignes.length} dépense${cag.lignes.length > 1 ? 's' : ''} arrondie${cag.lignes.length > 1 ? 's' : ''} à l'euro supérieur, à virer ${({ hebdomadaire: 'chaque semaine', quinzaine: 'tous les 15 jours', mensuelle: 'chaque mois' })[ar.frequence || 'hebdomadaire']}. C'est distinct de l'arrondi System'Épargne de la banque : les deux comptent, une seule fois chacun.`)) : null), { id: 'arrondis' });
  // Sources et objectif
  const progression = planMois ? planMois.allocationsPoches.reduce((s, a) => s + a.montantCentimes, 0) + (planMois.arrondisEstimesCentimes || 0) : 0;
  const sources = h('div', {},
    h('div', { class: 'liste-cles' },
      ligne('Épargne nette réelle', nette.nette),
      ligne('Virements vers le livret', nette.parType.virementLivret || 0),
      ligne("Arrondi System'Épargne (banque)", nette.parType.arrondiBanque || 0),
      ligne("Arrondis de l'app virés", nette.parType.arrondiApp || 0),
      nette.reprises ? ligne('Repris', nette.reprises) : null),
    objectif ? h('p', { class: 'petit' }, `Palier de ce mois : ${formatEuros(progression)} sur un objectif de ${formatEuros(objectif)}. Les 500 € viendront quand les dettes court terme seront soldées.`) : null);
  const histo = historiqueMensuel();
  const plus = carte('Pour aller plus loin', h('div', { class: 'liste-liens' },
    h('details', { class: 'details-ligne' }, h('summary', {}, `Épargne de ${formatMois(per.mois)}`), sources),
    histo ? h('details', { class: 'details-ligne' }, h('summary', {}, 'Historique des 12 derniers mois'), histo) : null), { id: 'plus-epargne' });
  return h('div', {}, h('div', { class: 'poches' }, cartesPoches), arrondis, plus, bouton('Nouvelle poche', () => editerPoche(null), { icone: 'plus' }));
}

function ligne(l, c) { return h('div', { class: 'ligne-cle' }, h('span', {}, l), mt(c)); }

function historiqueMensuel() {
  const tx = etat.transactions.filter((t) => t.epargne?.estEpargne);
  if (!tx.length) return null;
  const dates = tx.map((t) => t.date).sort();
  const mois = listeMois(moisDe(dates[0]), moisDe(aujourdhui())).slice(-12).reverse();
  return h('div', { class: 'liste-cles' }, mois.map((m) => { const n = epargneNettePeriode(tx, `${m}-01`, dernierJour(m)); return h('div', { class: 'ligne-cle' }, h('span', {}, formatMois(m)), h('span', { class: n.nette < 0 ? 'negatif-texte' : '' }, mt(n.nette), n.nbReprises ? h('small', {}, ` (${n.nbReprises} reprise${n.nbReprises > 1 ? 's' : ''})`) : null)); }));
}

function feuilleMouvement(poche, sens) {
  let montant = null; let motif = '';
  const avert = sens === 'reprise' ? h('div', { class: 'anti-reprise' },
    h('p', {}, icone('alerte'), h('strong', {}, ' Avant de reprendre :')),
    h('p', { class: 'petit' }, '1. Puise d’abord dans l’enveloppe Plaisir sans culpabilité. 2. Sinon, réduis une enveloppe non vitale (vases communicants). 3. Seulement ensuite, l’épargne.'),
    poche.type === 'coussin' ? h('p', { class: 'petit' }, 'Le Coussin est réservé aux vrais imprévus (panne, santé, perte de revenu).') : null,
    bouton('Ouvrir mes enveloppes', () => { f.fermer(); aller('budgets'); }, { classe: 'btn-petit' })) : null;
  const f = ouvrirFeuille({
    titre: sens === 'versement' ? `Verser sur « ${poche.nom} »` : `Reprendre de « ${poche.nom} »`,
    contenu: h('div', { class: 'formulaire' }, avert, champ('Montant', champMontant({ onValeur: (v) => { montant = v; }, autofocus: true })),
      sens === 'reprise' ? champ('Pour quoi ?', h('input', { class: 'input', placeholder: 'Imprévu, dépense courante…', oninput: (e) => { motif = e.target.value; } })) : null,
      h('p', { class: 'petit' }, sens === 'versement' ? 'Enregistre un virement réellement effectué depuis ton compte courant.' : 'La reprise est enregistrée et visible : elle réduit ton épargne nette du mois.')),
    actions: [bouton('Annuler', () => f.fermer()), bouton(sens === 'versement' ? "C'est fait" : 'Reprendre quand même', async () => {
      if (!montant || montant <= 0) { toast('Montant invalide.', { type: 'erreur' }); return; }
      if (sens === 'versement') await enregistrerVirementEpargne({ montantCentimes: montant, pocheId: poche.id, libelle: `Virement vers ${poche.nom}` });
      else {
        const p = { ...poche, mouvements: [...(poche.mouvements || []), { id: nouvelId('mv'), date: aujourdhui(), montantCentimes: montant, sens: 'reprise', motif: motif || 'Reprise' }] };
        await enregistrerLot([{ collection: 'poches', valeur: p }, { collection: 'evenements', valeur: { id: nouvelId('ev'), type: 'reprise', date: aujourdhui(), montantCentimes: montant, pocheId: poche.id, vu: false, motif } }]);
      }
      f.fermer(); toast(sens === 'versement' ? 'Versement enregistré.' : 'Reprise enregistrée.', { type: sens === 'versement' ? 'succes' : 'info' });
    }, { classe: sens === 'versement' ? 'btn-principal' : 'btn-danger' })],
  });
}

function editerPoche(poche) {
  const p = poche ? { ...poche } : { id: nouvelId('poche'), nom: '', type: 'autre', cibleCentimes: null, priorite: 3, partRepartition: 0, soldeInitialCentimes: 0, mouvements: [], compteSupport: 'Livret A', tauxAnnuel: etat.parametres.tauxLivretA, actif: true };
  const f = ouvrirFeuille({
    titre: poche ? p.nom : 'Nouvelle poche', plein: true,
    contenu: h('div', { class: 'formulaire' },
      champ('Nom', h('input', { class: 'input', value: p.nom, oninput: (e) => { p.nom = e.target.value; } })),
      champ('Type', selectionner([['coussin', 'Coussin de sécurité (priorité absolue)'], ['projet', 'Projet (voiture…)'], ['remboursementAnticipe', 'Remboursement anticipé d’un prêt'], ['autre', 'Autre']], p.type, (v) => { p.type = v; })),
      champ('Cible', champMontant({ valeur: p.cibleCentimes, onValeur: (v) => { p.cibleCentimes = v; } }), p.type === 'projet' ? 'Voiture : entre 2 000 et 2 500 €.' : null),
      champ('Solde de départ (déjà sur le livret)', champMontant({ valeur: p.soldeInitialCentimes, onValeur: (v) => { p.soldeInitialCentimes = v || 0; } })),
      p.type !== 'coussin' ? champ('Part de la répartition après le Coussin (%)', h('input', { class: 'input', inputmode: 'numeric', value: String(p.partRepartition ?? 0), oninput: (e) => { p.partRepartition = Math.max(0, Math.min(100, Number(e.target.value) || 0)); } })) : null,
      p.type === 'remboursementAnticipe' ? champ('Palier de remboursement anticipé', champMontant({ valeur: p.palierCentimes || 50000, onValeur: (v) => { p.palierCentimes = v; } })) : null,
      champ('Placement', selectionner([['Livret A', 'Livret A'], ['LEP', 'LEP (si éligible)'], ['Autre livret', 'Autre livret']], p.compteSupport, (v) => { p.compteSupport = v; p.tauxAnnuel = v === 'LEP' ? etat.parametres.tauxLEP : v === 'Livret A' ? etat.parametres.tauxLivretA : p.tauxAnnuel; })),
      interrupteur('Poche active', p.actif !== false, (v) => { p.actif = v; })),
    actions: [bouton('Annuler', () => f.fermer()), bouton('Enregistrer', async () => { if (!p.nom.trim()) { toast('Donne un nom.', { type: 'erreur' }); return; } await enregistrer('poches', p); f.fermer(); toast('Poche enregistrée.', { type: 'succes' }); }, { classe: 'btn-principal' })],
  });
}

// ---------------------------------------------------------------------------
// Mon plan
// ---------------------------------------------------------------------------
function vuePlan() {
  const mois = moisCourant(etat);
  const proj = planDesMois(etat, mois, 48);
  const att = atteintes(etat, proj);
  const cur = proj[0].plan;
  const nomPoche = (id) => etat.poches.find((p) => p.id === id)?.nom || id;
  const allocation = carte(`Allocation de ${formatMois(mois)}`, h('div', {},
    h('div', { class: 'liste-cles' },
      ligne('Revenus', cur.revenusCentimes),
      ligne('Charges fixes', -cur.chargesFixesCentimes),
      ligne('Dettes du mois (crédits, proches)', -cur.dettesDuMoisCentimes),
      h('div', { class: 'ligne-cle forte' }, h('span', {}, 'Disponible'), mt(cur.disponibleCentimes)),
      ...cur.allocationsPoches.map((a) => ligne(`Épargne → ${nomPoche(a.pocheId)}${a.date ? ` (le ${formatDateCourte(a.date)})` : ''}`, a.montantCentimes)),
      cur.arrondisEstimesCentimes ? ligne('Arrondis estimés', cur.arrondisEstimesCentimes) : null,
      ligne('Vie courante', cur.vieCouranteCentimes),
      h('div', { class: 'ligne-cle forte' }, h('span', {}, 'Marge'), mt(cur.margeCentimes))),
    cur.vieDetail ? h('details', { class: 'details-discret' }, h('summary', {}, 'Détail de la vie courante'), h('div', { class: 'liste-cles' }, cur.vieDetail.map((v) => ligne(v.libelle, v.montantCentimes)))) : null,
    cur.objectif ? h('p', { class: 'objectif' }, icone('etoile'), ` Objectif n° 1 du mois : ${cur.objectif}.`) : null,
    proj[0].stocke && cur.statut !== 'accepte' ? bouton('Accepter ce plan', () => accepterPlan(cur), { classe: 'btn-principal' }) : !proj[0].stocke ? bouton('Accepter ce plan', () => accepterPlan(cur), { classe: 'btn-principal' }) : h('p', { class: 'vert-texte' }, icone('ok'), ' Plan accepté.')), { id: 'allocation' });

  const lignesProj = proj.slice(0, 24).map((l) => h('tr', {},
    h('th', { scope: 'row' }, formatMois(l.mois, true)),
    h('td', {}, mt(l.plan.allocationsPoches.reduce((s, a) => s + a.montantCentimes, 0) + (l.plan.arrondisEstimesCentimes || 0))),
    ...etat.poches.filter((p) => p.actif !== false).map((p) => h('td', {}, mt(l.soldes[p.id] || 0))),
    h('td', {}, mt(l.plan.margeCentimes))));
  const tableau = detailsLigne('Projection mois par mois', h('div', { class: 'tableau-defile' }, h('table', { class: 'tableau' },
    h('caption', { class: 'sr' }, 'Épargne mensuelle et soldes projetés des poches'),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Mois'), h('th', { scope: 'col' }, 'Épargne'), ...etat.poches.filter((p) => p.actif !== false).map((p) => h('th', { scope: 'col' }, p.nom)), h('th', { scope: 'col' }, 'Marge'))),
    h('tbody', {}, lignesProj))),
  h('div', { class: 'liste-cles' }, etat.poches.filter((p) => p.cibleCentimes && p.actif !== false).map((p) => h('div', { class: 'ligne-cle' }, h('span', {}, `${p.nom} (${formatEuros(p.cibleCentimes)})`), h('span', {}, att[p.id] ? formatMois(att[p.id]) : 'au-delà de 4 ans')))));

  const sc = scenariosPret(etat, mois, 60);
  const scen = sc ? detailsLigne('Effet sur la fin du prêt', h('div', {},
    h('div', { class: 'liste-cles', role: 'list', 'aria-label': 'Scénarios de remboursement anticipé' },
      [['Sans remboursement anticipé', sc.sansAnticipe], ['Tout sur le projet, puis le prêt', sc.projet], ['Répartition (réglable)', sc.repartition], ['Tout sur le remboursement anticipé', sc.pret]].map(([nom, x]) => {
        const gain = sc.sansAnticipe.interetsCentimes - x.interetsCentimes;
        return h('div', { class: 'ligne-cle', role: 'listitem' },
          h('span', { class: 'ligne-scenario' }, nom, h('small', {}, `Prêt soldé le ${formatDate(x.finLe)}`)),
          gain > 0 ? h('span', { class: 'ligne-cle-valeur' }, mt(gain, { classe: 'vert-texte' }), h('small', {}, ' d’intérêts en moins')) : h('span', { class: 'ligne-cle-valeur' }, 'référence'));
      })),
    h('p', { class: 'petit' }, `Chaque euro remboursé par anticipation rapporte le taux du prêt (${String(sc.credit.tauxPourcent).replace('.', ',')} % saisi) contre ${String(etat.parametres.tauxLivretA).replace('.', ',')} % sur le Livret A.`),
    reglageRepartition())) : null;
  return h('div', {}, allocation, carte('Pour aller plus loin', h('div', { class: 'liste-liens' }, tableau, scen), { id: 'plus-plan' }));
}

function detailsLigne(titre, ...contenus) {
  return h('details', { class: 'details-ligne' }, h('summary', {}, titre), h('div', { class: 'details-contenu' }, contenus));
}

function reglageRepartition() {
  const projet = etat.poches.find((p) => p.type === 'projet');
  const pret = etat.poches.find((p) => p.type === 'remboursementAnticipe');
  if (!projet || !pret) return null;
  const val = projet.partRepartition ?? 50;
  const sortie = h('output', {}, `${val} % projet / ${100 - val} % prêt`);
  return h('div', { class: 'champ' }, h('label', { for: 'repartition' }, 'Répartition après le Coussin'),
    h('input', { id: 'repartition', type: 'range', min: '0', max: '100', step: '10', value: String(val), class: 'curseur', oninput: (e) => { sortie.textContent = `${e.target.value} % projet / ${100 - e.target.value} % prêt`; },
      onchange: async (e) => { const v = Number(e.target.value); await enregistrerLot([{ collection: 'poches', valeur: { ...projet, partRepartition: v } }, { collection: 'poches', valeur: { ...pret, partRepartition: 100 - v } }]); } }), sortie);
}

async function accepterPlan(plan) {
  const js = etat.profil.jourSalaireHabituel || 1;
  const lendemain = ajouterJours(dateDuMois(plan.mois, js), 1);
  const ops = [{ collection: 'planMensuel', valeur: { ...plan, id: plan.mois, statut: 'accepte' } }];
  for (const a of plan.allocationsPoches) {
    if (etat.virementsPrevus.some((v) => v.mois === plan.mois && v.pocheId === a.pocheId)) continue;
    ops.push({ collection: 'virementsPrevus', valeur: { id: nouvelId('vp'), mois: plan.mois, date: a.date || lendemain, rappelLe: lendemain, libelle: `Virement ${etat.poches.find((p) => p.id === a.pocheId)?.nom || 'épargne'}`, montantCentimes: a.montantCentimes, pocheId: a.pocheId, fait: false, type: 'epargne' } });
  }
  await enregistrerLot(ops);
  toast('Plan accepté : le rappel de virement apparaîtra le lendemain du salaire.', { type: 'succes' });
}

// ---------------------------------------------------------------------------
// Mes dettes
// ---------------------------------------------------------------------------
function vueDettes() {
  const auj = aujourdhui();
  const credits = etat.creditsBancaires.filter((c) => c.actif !== false).map((c) => c.type === 'amortissable' ? carteAmortissable(c, auj) : carteInstantane(c, auj));
  const prets = etat.prets.filter((p) => p.statut !== 'solde' || resteDuPret(p) > 0).map((p) => {
    const reste = resteDuPret(p);
    const prochaine = p.echeancier.find((e) => !e.payee);
    return h('article', { class: 'dette-ligne' },
      h('div', { class: 'poche-tete' }, h('h3', {}, p.sens === 'empruntéParMoi' ? p.personneAlias : `${p.personneAlias} me doit`, p.objet ? h('small', {}, ` (${p.objet})`) : null), mt(reste, { classe: 'poche-solde-petit' })),
      prochaine ? h('div', { class: 'prochaine' }, h('span', { class: 'petit' }, `Prochain : ${formatEuros(prochaine.montantCentimes)} le ${formatDateCourte(prochaine.date)}`),
        p.sens === 'empruntéParMoi' ? bouton("C'est fait", () => payerEcheancePret(p.id, prochaine.date), { classe: 'btn-petit btn-principal' }) : null) : h('p', { class: 'petit vert-texte' }, 'Tout est remboursé.'),
      p.echeancier.length > 1 || p.depenseEtalee ? h('details', { class: 'details-discret' }, h('summary', {}, 'Échéancier'), h('div', { class: 'details-contenu' },
        p.depenseEtalee ? h('p', { class: 'petit' }, `Dépense « ${p.objet} » de ${formatEuros(p.montantCentimes)} étalée : chaque remboursement compte une seule fois dans sa catégorie.`) : null,
        h('div', { class: 'liste-cles' }, p.echeancier.map((e) => h('div', { class: 'ligne-cle' }, h('span', {}, formatDate(e.date)), h('span', {}, mt(e.montantCentimes), e.payee ? h('span', { class: 'etiquette vert' }, 'payé') : null)))))) : null);
  });
  const totalDu = etat.creditsBancaires.filter((c) => c.actif !== false).reduce((t, c) => t + (c.type === 'amortissable' ? (() => { try { return capitalRestantDu(tableauAmortissement(c), auj, c.capitalCentimes); } catch { return c.capitalCentimes || 0; } })() : encoursCredit(c, auj)), 0)
    + etat.prets.filter((p) => p.sens === 'empruntéParMoi').reduce((t, p) => t + resteDuPret(p), 0);
  return h('div', {},
    h('div', { class: 'resume-dettes' }, h('span', { class: 'petit' }, 'Total à rembourser'), h('span', { class: 'grand-montant' }, mt(totalDu))),
    credits.length ? h('div', { class: 'zone-onglet' }, credits) : null,
    carte('Proches', h('div', { class: 'liste-dettes' }, prets.length ? prets : h('p', { class: 'petit' }, 'Aucune dette enregistrée.')), { id: 'proches' }),
    h('div', { class: 'groupe-boutons' }, bouton('Ajouter une dette', () => editerPret(null), { icone: 'plus' }), bouton('Ajouter un crédit', () => editerCredit(null), { icone: 'plus' })));
}

function carteInstantane(c, auj) {
  const encours = encoursCredit(c, auj);
  const ech = c.echeancier || [];
  const prochaine = ech.find((e) => !e.payee);
  return carte(c.libelle, h('div', {},
    h('div', { class: 'poche-tete' }, h('span', { class: 'petit' }, 'Reste à rembourser'), mt(encours, { classe: 'poche-solde' })),
    prochaine ? h('div', { class: 'prochaine' }, h('span', { class: 'petit' }, `Prochaine échéance : ${formatEuros(prochaine.montantCentimes)} le ${formatDateCourte(prochaine.date)}`),
      prochaine.date <= ajouterJours(auj, 3) ? bouton("C'est fait", () => payerEcheanceCredit(c.id, prochaine.date), { classe: 'btn-petit btn-principal' }) : null) : null,
    h('details', { class: 'details-discret' }, h('summary', {}, 'Échéancier'), h('div', { class: 'details-contenu' },
      h('div', { class: 'liste-cles' }, ech.map((e) => h('div', { class: 'ligne-cle' }, h('span', {}, formatDate(e.date)), h('span', {}, mt(e.montantCentimes), e.payee ? h('span', { class: 'etiquette vert' }, 'payée') : null)))),
      c.fraisCentimes ? h('p', { class: 'petit' }, `Frais payés : ${formatEuros(c.fraisCentimes)}. Aucun nouveau déblocage : sortir de ce cycle passe avant l’épargne.`) : null))), { classe: 'carte-alerte' });
}

function carteAmortissable(c, auj) {
  let tableau = null; let erreur = null;
  try { tableau = tableauAmortissement(c); } catch (e) { erreur = e.message; }
  const coh = c.capitalCentimes && c.mensualiteCentimes ? verifierCoherencePret({ capitalCentimes: c.capitalCentimes, mensualiteCentimes: c.mensualiteCentimes, dureesAnnonceesMois: c.dureesAnnonceesMois || (c.dureeMois ? [c.dureeMois] : []) }) : null;
  const restant = tableau ? capitalRestantDu(tableau, auj, c.capitalCentimes) : c.capitalCentimes;
  let montantSim = 50000;
  const resultatSim = h('div', { 'aria-live': 'polite' });
  const simuler = () => {
    if (!tableau) return;
    const dateV = auj > c.dateDebut ? auj : c.dateDebut;
    const r = simulerRemboursementAnticipe(c, { date: dateV, montantCentimes: montantSim || 0 });
    resultatSim.replaceChildren(h('div', { class: 'liste-cles' },
      ligne('Intérêts économisés', r.interetsEconomises),
      h('div', { class: 'ligne-cle' }, h('span', {}, 'Nouvelle date de fin'), h('span', {}, `${formatDate(r.nouvelleFin)} (au lieu du ${formatDate(r.ancienneFin)}, ${r.moisGagnes} mois de moins)`)),
      h('div', { class: 'ligne-cle' }, h('span', {}, 'Indemnité'), h('span', {}, r.sansIndemnite ? 'aucune (moins de 10 000 € remboursés sur 12 mois)' : 'possible : vérifie ton contrat'))),
      h('p', { class: 'petit' }, 'Préviens ta banque par écrit (lettre ou messagerie sécurisée) en précisant « réduction de durée, mensualité inchangée ».'));
  };
  const sim = h('div', { class: 'simulateur' }, champ('Versement anticipé', champMontant({ valeur: montantSim, onValeur: (v) => { montantSim = v; simuler(); } })), resultatSim);
  setTimeout(simuler, 0);
  return carte(c.libelle, h('div', {},
    c.aConfirmer?.length ? h('div', { class: 'a-confirmer' }, icone('info'), ' À confirmer avec ton offre de prêt ', bouton('Compléter', () => editerCredit(c), { classe: 'btn-petit btn-principal' })) : null,
    coh && !coh.coherent ? h('details', { class: 'avertissement avertissement-replie', role: 'alert' }, h('summary', {}, icone('alerte'), ` Mensualité de ${formatEuros(c.mensualiteCentimes)} à vérifier`), h('p', { class: 'petit' }, `Elle rembourse ${formatEuros(c.capitalCentimes)} en ${coh.dureeMin} à ${coh.dureeMax} mois (taux 5 à 9 %). ${coh.mensualitesParDuree.map((m) => `Sur ${m.dureeMois / 12} ans, elle serait de ${formatEuros(m.min)} à ${formatEuros(m.max)}`).join(' ; ')}.`)) : null,
    h('div', { class: 'poche-tete' }, h('span', { class: 'petit' }, 'Capital restant dû'), mt(restant, { classe: 'poche-solde' })),
    h('p', { class: 'petit' }, `${formatEuros(c.mensualiteCentimes || 0)} par mois`, c.dateDebut > auj ? `, à partir du ${formatDate(c.dateDebut)}` : ''),
    erreur ? h('p', { class: 'erreur' }, erreur) : null,
    h('details', { class: 'details-discret' }, h('summary', {}, 'Détails et simulateur'), h('div', { class: 'details-contenu' },
      c.differe && c.dateDebut > auj ? h('p', { class: 'petit' }, `Différé actuel : ${formatEuros(c.differe.mensualiteCentimes)} par mois.`) : null,
    h('div', { class: 'liste-cles' }, ligne('Mensualité', c.mensualiteCentimes || 0), h('div', { class: 'ligne-cle' }, h('span', {}, 'Taux (TAEG)'), h('span', {}, `${String(c.tauxPourcent ?? '—').replace('.', ',')} %`)), tableau ? ligne('Intérêts totaux', totalInterets(tableau)) : null, tableau ? h('div', { class: 'ligne-cle' }, h('span', {}, 'Fin'), h('span', {}, formatDate(tableau[tableau.length - 1].date))) : null),
    tableau ? h('details', {}, h('summary', {}, `Tableau d'amortissement (${tableau.length} échéances)`), h('div', { class: 'tableau-defile' }, h('table', { class: 'tableau' }, h('caption', { class: 'sr' }, 'Tableau d’amortissement'),
      h('thead', {}, h('tr', {}, ['N°', 'Date', 'Mensualité', 'Capital', 'Intérêts', 'Restant dû'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, tableau.map((l) => h('tr', {}, h('td', {}, String(l.numero)), h('td', {}, formatDate(l.date)), h('td', {}, mt(l.mensualiteCentimes)), h('td', {}, mt(l.capitalCentimes)), h('td', {}, mt(l.interetsCentimes)), h('td', {}, mt(l.capitalRestantCentimes)))))))) : null,
      h('h3', { class: 'sous-titre' }, 'Remboursement anticipé'), sim))));
}

function editerCredit(credit) {
  const c = credit ? { ...credit } : { id: nouvelId('credit'), libelle: '', type: 'amortissable', capitalCentimes: null, tauxPourcent: null, mensualiteCentimes: null, dureeMois: null, dateDebut: aujourdhui(), echeancier: [], actif: true };
  const f = ouvrirFeuille({
    titre: credit ? c.libelle : 'Nouveau crédit', plein: true,
    contenu: h('div', { class: 'formulaire' },
      champ('Nom', h('input', { class: 'input', value: c.libelle, oninput: (e) => { c.libelle = e.target.value; } })),
      champ('Type', selectionner([['amortissable', 'Prêt amortissable (mensualités)'], ['instantane', 'Crédit instantané (échéances datées)']], c.type, (v) => { c.type = v; })),
      champ('Capital emprunté', champMontant({ valeur: c.capitalCentimes, onValeur: (v) => { c.capitalCentimes = v; } })),
      champ('Mensualité', champMontant({ valeur: c.mensualiteCentimes, onValeur: (v) => { c.mensualiteCentimes = v; } })),
      champ('Durée (mois)', h('input', { class: 'input', inputmode: 'numeric', value: c.dureeMois ? String(c.dureeMois) : '', oninput: (e) => { c.dureeMois = Number(e.target.value) || null; } })),
      champ('TAEG (%)', h('input', { class: 'input', inputmode: 'decimal', value: c.tauxPourcent !== null && c.tauxPourcent !== undefined ? String(c.tauxPourcent).replace('.', ',') : '', oninput: (e) => { c.tauxPourcent = Number(e.target.value.replace(',', '.')) || 0; } })),
      champ('Date de la 1re échéance', h('input', { class: 'input', type: 'date', value: c.dateDebut || '', oninput: (e) => { c.dateDebut = e.target.value; } }))),
    actions: [bouton('Annuler', () => f.fermer()), bouton('Enregistrer', async () => {
      if (!c.libelle || !c.capitalCentimes) { toast('Nom et capital obligatoires.', { type: 'erreur' }); return; }
      c.aConfirmer = [];
      await enregistrer('creditsBancaires', c);
      // Le différé (charge fixe) s'arrête la veille de la 1re échéance
      const differe = etat.chargesFixes.find((x) => /différé/i.test(x.libelle));
      if (differe && c.type === 'amortissable' && c.dateDebut) await enregistrer('chargesFixes', { ...differe, finLe: ajouterJours(c.dateDebut, -1) });
      f.fermer(); toast('Crédit enregistré.', { type: 'succes' });
    }, { classe: 'btn-principal' })],
  });
}

function editerPret(pret) {
  const p = pret ? { ...pret } : { id: nouvelId('pret'), personneAlias: '', sens: 'empruntéParMoi', montantCentimes: null, objet: '', date: aujourdhui(), echeancier: [], remboursements: [], statut: 'enCours' };
  let nb = 1; let premiere = ajouterJours(dateDuMois(moisDe(aujourdhui()), etat.profil.jourSalaireHabituel || 1), 1);
  if (premiere < aujourdhui()) premiere = ajouterJours(dateDuMois(ajouterMois(moisDe(aujourdhui()), 1), etat.profil.jourSalaireHabituel || 1), 1);
  const f = ouvrirFeuille({
    titre: 'Prêt ou dette avec un proche', plein: true,
    contenu: h('div', { class: 'formulaire' },
      champ('Sens', selectionner([['empruntéParMoi', 'Je dois de l’argent'], ['preteParMoi', 'On me doit de l’argent']], p.sens, (v) => { p.sens = v; })),
      champ('Personne (alias)', h('input', { class: 'input', value: p.personneAlias, oninput: (e) => { p.personneAlias = e.target.value; } })),
      champ('Montant total', champMontant({ valeur: p.montantCentimes, onValeur: (v) => { p.montantCentimes = v; } })),
      champ('Objet (facultatif)', h('input', { class: 'input', value: p.objet || '', oninput: (e) => { p.objet = e.target.value; } })),
      champ('Nombre de remboursements mensuels', h('input', { class: 'input', inputmode: 'numeric', value: '1', oninput: (e) => { nb = Math.max(1, Math.min(24, Number(e.target.value) || 1)); } })),
      champ('Premier remboursement', h('input', { class: 'input', type: 'date', value: premiere, oninput: (e) => { premiere = e.target.value; } }), 'Par défaut : le lendemain du salaire.')),
    actions: [bouton('Annuler', () => f.fermer()), bouton('Enregistrer', async () => {
      if (!p.personneAlias || !p.montantCentimes) { toast('Personne et montant obligatoires.', { type: 'erreur' }); return; }
      if (!pret) {
        const base = Math.floor(p.montantCentimes / nb);
        p.echeancier = Array.from({ length: nb }, (_, i) => ({ date: ajouterMois(premiere.slice(0, 7), i) + premiere.slice(7), montantCentimes: i === nb - 1 ? p.montantCentimes - base * (nb - 1) : base, payee: false }));
      }
      await enregistrer('prets', p); f.fermer(); toast('Enregistré.', { type: 'succes' });
    }, { classe: 'btn-principal' })],
  });
}

// ---------------------------------------------------------------------------
// Simulateur livrets
// ---------------------------------------------------------------------------
function vueSimulateur() {
  let capital = 0; let mensuel = 10000; let duree = 24;
  let tauxA = etat.parametres.tauxLivretA; let tauxL = etat.parametres.tauxLEP;
  const sortie = h('div', { 'aria-live': 'polite' });
  const calc = () => {
    const depart = ajouterMois(moisDe(aujourdhui()), 1);
    const a = simulerLivret({ capitalInitialCentimes: capital, versementMensuelCentimes: mensuel, jourVersement: (etat.profil.jourSalaireHabituel || 1) + 1, tauxPourcent: tauxA, plafondCentimes: 2295000, moisDepart: depart, nbMois: duree });
    const l = simulerLivret({ capitalInitialCentimes: capital, versementMensuelCentimes: mensuel, jourVersement: (etat.profil.jourSalaireHabituel || 1) + 1, tauxPourcent: tauxL, plafondCentimes: etat.parametres.plafondLEPCentimes || 1000000, moisDepart: depart, nbMois: duree });
    sortie.replaceChildren(h('table', { class: 'tableau' }, h('caption', { class: 'sr' }, 'Comparaison Livret A et LEP'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Année'), h('th', { scope: 'col' }, `Livret A ${String(tauxA).replace('.', ',')} %`), h('th', { scope: 'col' }, `LEP ${String(tauxL).replace('.', ',')} %`))),
      h('tbody', {}, a.lignes.map((x, i) => h('tr', {}, h('th', { scope: 'row' }, String(x.annee)), h('td', {}, mt(x.soldeFinCentimes), h('small', {}, ` (+${formatEuros(x.interetsCentimes)})`)), h('td', {}, mt(l.lignes[i]?.soldeFinCentimes || 0), h('small', {}, ` (+${formatEuros(l.lignes[i]?.interetsCentimes || 0)})`)))))),
    h('p', { class: 'petit' }, 'Intérêts calculés par quinzaine (un versement compte à partir du 1er ou du 16 suivant), capitalisés au 31 décembre. Le LEP est réservé aux revenus modestes : vérifie ton éligibilité avec ton revenu fiscal de référence.'));
  };
  calc();
  return carte('Simulateur Livret A / LEP', h('div', { class: 'formulaire' },
    champ('Capital de départ', champMontant({ valeur: capital, onValeur: (v) => { capital = v || 0; calc(); } })),
    champ('Versement mensuel', champMontant({ valeur: mensuel, onValeur: (v) => { mensuel = v || 0; calc(); } })),
    champ('Durée (mois)', h('input', { class: 'input', inputmode: 'numeric', value: String(duree), oninput: (e) => { duree = Math.max(1, Math.min(120, Number(e.target.value) || 1)); calc(); } })),
    h('div', { class: 'deux-colonnes' },
      champ('Taux Livret A (%)', h('input', { class: 'input', inputmode: 'decimal', value: String(tauxA).replace('.', ','), oninput: (e) => { tauxA = Number(e.target.value.replace(',', '.')) || 0; calc(); } })),
      champ('Taux LEP (%)', h('input', { class: 'input', inputmode: 'decimal', value: String(tauxL).replace('.', ','), oninput: (e) => { tauxL = Number(e.target.value.replace(',', '.')) || 0; calc(); } }))),
    sortie));
}

export { entreesDuMois, etatVide, confirmer, enregistrerReprise };
