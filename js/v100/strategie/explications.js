// explications.js (v100) — les calculs des fiches « ? » (fiches.js), en fonctions pures testées.
// Chaque fiche montre un calcul ligne par ligne : ici, on le refait avec LES MÊMES fonctions que l'app
// (resteADepenser, jaugeDuJour, aVirerEpargne, arrondiTransaction…), pour que la fiche dise exactement ce qui se passe.

import { jaugeDuJour, depensesVariables, arrondisPeriode, estDepenseQuotidienne, cagnotteArrondis } from '../../calculs.js';
import { contributionDepense } from '../../categories.js';
import { arrondiTransaction } from '../../epargne.js';
import { fluxEnvies } from '../../envies.js';
import { aVirerEpargne } from '../../virements.js';
import { SOURCE_RESTE } from '../../restes.js';

const somme = (liste, f) => liste.reduce((s, x) => s + f(x), 0);

/**
 * « D'où vient ta part du jour » : des revenus du mois jusqu'au reste pour vivre de ce matin.
 * Chaque ligne est calculée (rien n'est déduit par différence) ; la somme retombe au centime sur la base de la jauge.
 * @returns {{ etapes: Array<{ cle, nom, centimes, type: 'total'|'moins'|'plus' }>, baseCentimes, calculeCentimes, retombe,
 *   parJourCentimes, joursRestants, depensesDuJourCentimes, restantCentimes }}
 */
export function cascadeJour(etat, auj, j = jaugeDuJour(etat, auj, etat.meta?.jauge || null)) {
  const r = j.reste;
  // Ce qui est sorti du budget du mois AVANT aujourd'hui (aujourd'hui est compté à part, dans « dépensé aujourd'hui »)
  const depensesAvant = r.depensesVariablesCentimes - depensesVariables(etat, auj, auj);
  const deCoteAvant = r.privationsCentimes - somme((etat.privations || []).filter((p) => p.date === auj), (p) => p.montantCentimes);
  const arrondisAvant = r.arrondisCentimes - arrondisPeriode(etat, r.periode, auj);
  const lignes = [
    { cle: 'charges', nom: 'Charges fixes', centimes: r.chargesCentimes, type: 'moins' },
    { cle: 'dettes', nom: 'Crédits et remboursements', centimes: r.dettesCentimes, type: 'moins' },
    { cle: 'prevues', nom: 'Dépenses prévues', centimes: r.prevuesCentimes, type: 'moins' },
    { cle: 'epargne', nom: 'Épargne du mois', centimes: r.epargneCibleCentimes, type: 'moins' },
    // Plus de remboursements que d'achats depuis le salaire : la ligne ajoute au lieu de retirer
    depensesAvant >= 0 ? { cle: 'depense', nom: 'Déjà dépensé ce mois-ci', centimes: depensesAvant, type: 'moins' }
      : { cle: 'rembourse', nom: 'Remboursements reçus ce mois-ci', centimes: -depensesAvant, type: 'plus' },
    { cle: 'deCote', nom: 'Déjà mis de côté (restes des journées, repas, privations)', centimes: deCoteAvant, type: 'moins' },
    { cle: 'arrondis', nom: 'Arrondis déjà comptés', centimes: arrondisAvant, type: 'moins' },
  ].filter((e) => e.centimes !== 0);
  const revenus = r.revenus.totalCentimes;
  const calcule = lignes.reduce((s, e) => s + (e.type === 'plus' ? e.centimes : -e.centimes), revenus);
  const base = j.instantane.baseCentimes;
  return {
    etapes: [{ cle: 'revenus', nom: 'Tes revenus du mois', centimes: revenus, type: 'total' }, ...lignes, { cle: 'base', nom: 'Reste pour vivre, ce matin', centimes: base, type: 'total' }],
    baseCentimes: base, calculeCentimes: calcule, retombe: calcule === base,
    parJourCentimes: j.parJourCentimes, joursRestants: j.joursRestants, depensesDuJourCentimes: j.depensesDuJourCentimes, restantCentimes: j.restantAujourdhuiCentimes,
  };
}

/**
 * Ce que deviendrait un reste de journée clos ce soir (5 h) : exactement la règle du virement (aVirerEpargne, envies.js) —
 * part de l'envie seulement s'il y a une envie en cours qui peut encore recevoir, sinon tout entre le prêt et la sécurité.
 * On compare le virement prévu avec et sans ce reste : la différence est ce que la journée ajoute, poche par poche.
 * @returns {{ montantCentimes, envie: { id, nom }|null, envieCentimes, avanceCentimes, epargneCentimes,
 *   parPoche: Array<{ pocheId, montantCentimes }>, pretCentimes, securiteCentimes, pourcents: { pret, securite, envie, avance } }}
 */
export function partageDuReste(etat, auj, montantCentimes) {
  const m = Math.max(0, Math.round(montantCentimes || 0));
  const flux = fluxEnvies(etat, { aujourdhuiIso: auj });
  const envie = flux.active ? { id: flux.active.id, nom: flux.active.nom } : null;
  const vide = { montantCentimes: m, envie, envieCentimes: 0, avanceCentimes: 0, epargneCentimes: 0, parPoche: [], pretCentimes: 0, securiteCentimes: 0, pourcents: { pret: 0, securite: 0, envie: 0, avance: 0 } };
  if (!m) return vide;
  const avant = aVirerEpargne(etat, auj);
  const ligne = { id: `simulation-${auj}`, date: auj, jour: auj, source: SOURCE_RESTE, categorie: 'autres', libelle: 'Reste du budget du jour', montantCentimes: m, vireLe: null };
  const apres = aVirerEpargne({ ...etat, privations: [...(etat.privations || []), ligne] }, auj);
  const partReste = (v, id) => v.parPoche.find((x) => x.pocheId === id)?.detail?.reste || 0;
  const ids = [...new Set([...avant.parPoche, ...apres.parPoche].map((x) => x.pocheId))];
  const parPoche = ids.map((pocheId) => ({ pocheId, montantCentimes: partReste(apres, pocheId) - partReste(avant, pocheId) })).filter((x) => x.montantCentimes);
  const poches = etat.poches || [];
  const type = (id) => poches.find((p) => p.id === id)?.type;
  const pret = somme(parPoche.filter((x) => type(x.pocheId) === 'remboursementAnticipe'), (x) => x.montantCentimes);
  const securite = somme(parPoche.filter((x) => type(x.pocheId) === 'coussin'), (x) => x.montantCentimes);
  const envieCentimes = apres.enviesCentimes - avant.enviesCentimes;
  const avanceCentimes = apres.retenueAvanceCentimes - avant.retenueAvanceCentimes;
  const pc = (c) => Math.round((c * 100) / m);
  return {
    montantCentimes: m, envie, envieCentimes, avanceCentimes, epargneCentimes: apres.privationsCentimes - avant.privationsCentimes,
    parPoche, pretCentimes: pret, securiteCentimes: securite,
    pourcents: { pret: pc(pret), securite: pc(securite), envie: pc(envieCentimes), avance: pc(avanceCentimes) },
  };
}

/** Le partage en pourcentages, même quand il n'y a rien à partager aujourd'hui (calculé sur 100 € pour montrer la règle). */
export function reglePartage(etat, auj) {
  return partageDuReste(etat, auj, 10000).pourcents;
}

/**
 * L'arrondi d'une dépense, tel que l'épargne le compte (epargne.js) : réglage profil.arrondi actif, dépense éligible
 * (pas un virement interne, pas de l'épargne, pas un ajustement, arrondi non désactivé sur la dépense).
 * @returns {{ centimes, aVirer: boolean }} aVirer : il est dans la cagnotte du prochain virement
 */
export function arrondiDeLaDepense(etat, tx, auj) {
  const ar = etat.profil?.arrondi;
  const centimes = ar?.actif ? arrondiTransaction(tx, ar) : 0;
  if (!centimes) return { centimes: 0, aVirer: false };
  return { centimes, aVirer: cagnotteArrondis(etat, auj).lignes.some((l) => l.transactionId === tx.id) };
}

/**
 * Une dépense sur la journée : part du jour − déjà dépensé − cette dépense − son arrondi = reste aujourd'hui (au centime).
 * @returns {{ quotidienne, duJour, compteAujourdhui, contributionCentimes, arrondiCentimes, arrondiAVirer, autresCentimes, etapes }}
 */
export function effetDepense(etat, tx, auj, j = jaugeDuJour(etat, auj, etat.meta?.jauge || null)) {
  const contribution = tx.sens === 'debit' && estDepenseQuotidienne(tx) ? contributionDepense(tx) : 0;
  const quotidienne = contribution > 0;
  const duJour = tx.date === auj;
  const arr = arrondiDeLaDepense(etat, tx, auj);
  // Ce que la jauge compte aujourd'hui pour CETTE opération : sa dépense (si du quotidien) et son arrondi (toujours, s'il y en a un)
  const dansLaJauge = duJour && (etat.transactions || []).some((t) => t.id === tx.id);
  const compte = dansLaJauge ? contribution + arr.centimes : 0;
  const autres = j.depensesDuJourCentimes - compte;
  const etapes = [
    { cle: 'part', nom: 'Ta part du jour', centimes: j.parJourCentimes, type: 'total' },
    autres ? { cle: 'autres', nom: autres > 0 ? 'Déjà dépensé aujourd’hui (arrondis et privations compris)' : 'Remboursé aujourd’hui', centimes: Math.abs(autres), type: autres > 0 ? 'moins' : 'plus' } : null,
    dansLaJauge && contribution ? { cle: 'depense', nom: 'Cette dépense', centimes: contribution, type: 'moins' } : null,
    dansLaJauge && arr.centimes ? { cle: 'arrondi', nom: 'Son arrondi, vers l’épargne', centimes: arr.centimes, type: 'moins' } : null,
    { cle: 'reste', nom: j.restantAujourdhuiCentimes >= 0 ? 'Reste aujourd’hui' : 'Reste aujourd’hui (dépassé)', centimes: j.restantAujourdhuiCentimes, type: 'total' },
  ].filter(Boolean);
  return { quotidienne, duJour, compteAujourdhuiCentimes: compte, contributionCentimes: contribution, arrondiCentimes: arr.centimes, arrondiAVirer: arr.aVirer, autresCentimes: autres, etapes };
}

/** Somme signée d'une cascade (hors totaux), à partir de son premier total : sert aux contrôles. */
export function totalCascade(etapes) {
  return etapes.slice(1, -1).reduce((s, e) => s + (e.type === 'plus' ? e.centimes : -e.centimes), etapes[0].centimes);
}

