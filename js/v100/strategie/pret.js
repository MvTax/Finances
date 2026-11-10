// pret.js (v100) — stratégie du prêt : simulation mois par mois (différé puis amortissement), remboursements anticipés
// alimentés par l'épargne prêt, comparaison de plans, gain de chaque euro remboursé, et le choix « durée ou mensualité ».
//
// Modèle (centimes entiers, intérêts mensuels arrondis au centime comme dettes.js) :
//  - pendant le différé (avant dateDebut) : chaque mois, intérêts sur le capital + assurance, aucun capital remboursé ;
//  - ensuite : mensualité constante (capital + intérêts) + assurance, jusqu'à extinction ;
//  - remboursement anticipé : baisse le capital tout de suite ; par défaut la mensualité ne change pas (durée réduite) ;
//  - l'assurance s'arrête avec le prêt.
// Les règles exactes de la banque (recalcul de la mensualité, frais) restent à confirmer auprès d'elle : voir HYPOTHESES.md.

import { interetsMensuels, mensualiteConstante, encoursCredit } from '../../dettes.js';
import { ajouterMoisDate, diffJours } from '../../dates.js';

const MAX_MOIS = 720;

/** Le prêt amortissable suivi (le premier actif avec taux, capital et date de début). */
export function creditPrincipal(etat) {
  return (etat.creditsBancaires || []).find((c) => c.actif !== false && c.type === 'amortissable' && c.dateDebut && c.capitalCentimes > 0 && c.tauxPourcent !== undefined && (c.mensualiteCentimes || c.dureeMois)) || null;
}

/** Capital restant dû à une date : capital − remboursements anticipés déjà faits − capital amorti par les échéances passées. */
export function capitalRestant(credit, dateIso) {
  const anticipes = (credit.remboursementsAnticipes || []).filter((r) => r.date <= dateIso).reduce((s, r) => s + (r.montantCentimes || 0), 0);
  const base = dateIso < credit.dateDebut ? credit.capitalCentimes : encoursCredit(credit, dateIso);
  return Math.max(0, base - anticipes);
}

/** Date de la première échéance strictement après `depuis` (même jour du mois que le début de l'amortissement). */
export function prochaineEcheancePret(credit, depuis) {
  const jour = Number(credit.dateDebut.slice(8, 10));
  // On part de l'échéance de début et on recule/avance mois par mois jusqu'à la première > depuis
  let k = Math.floor(diffJours(credit.dateDebut, depuis) / 30) - 2;
  let d = ajouterMoisDate(credit.dateDebut, k, jour);
  while (d <= depuis) { k += 1; d = ajouterMoisDate(credit.dateDebut, k, jour); }
  while (ajouterMoisDate(credit.dateDebut, k - 1, jour) > depuis) { k -= 1; d = ajouterMoisDate(credit.dateDebut, k, jour); }
  return { date: d, index: k };
}

/**
 * Simulateur pas à pas : un appel à `pas()` par échéance mensuelle.
 * @param {object} credit
 * @param {{ depuis, capitalCentimes?, pocheCentimes?, palierCentimes?, mode?: 'palier'|'solde'|'aucun', mensualiteCentimes? }} o
 */
export function simulateurPret(credit, o) {
  const jour = Number(credit.dateDebut.slice(8, 10));
  const assurance = credit.assuranceMensuelleCentimes || 0;
  const mensualite = o.mensualiteCentimes || credit.mensualiteCentimes || mensualiteConstante(credit.capitalCentimes, credit.tauxPourcent, credit.dureeMois);
  const mode = o.mode || 'palier';
  const palier = Math.max(1, o.palierCentimes ?? 50000);
  const s = { capital: o.capitalCentimes ?? capitalRestant(credit, o.depuis), poche: o.pocheCentimes || 0, index: prochaineEcheancePret(credit, o.depuis).index, interets: 0, assurance: 0, paye: 0, anticipes: [], n: 0 };
  const anticiper = (date, montant, source) => {
    const v = Math.min(s.capital, Math.max(0, montant));
    if (v <= 0) return 0;
    s.capital -= v; s.paye += v;
    s.anticipes.push({ date, montantCentimes: v, source });
    return v;
  };
  return {
    etat: s,
    mensualiteCentimes: mensualite,
    /** Date de la prochaine échéance (sans avancer). */
    prochaine: () => ajouterMoisDate(credit.dateDebut, s.index, jour),
    fini: () => s.capital <= 0,
    /** L'échéance qui vient, sans la jouer : date, différé ou non, montant à payer. */
    apercu() {
      const date = ajouterMoisDate(credit.dateDebut, s.index, jour);
      const differe = date < credit.dateDebut;
      if (s.capital <= 0) return { date, differe, echeanceCentimes: 0 };
      const interets = interetsMensuels(s.capital, credit.tauxPourcent);
      return { date, differe, echeanceCentimes: (differe ? 0 : Math.min(s.capital, mensualite - interets)) + interets + assurance };
    },
    /**
     * Joue l'échéance suivante. versementCentimes : ce que l'épargne prêt reçoit ce mois-ci ;
     * ponctuelCentimes : remboursement anticipé exceptionnel payé directement (hors poche).
     */
    pas(versementCentimes = 0, ponctuelCentimes = 0) {
      const date = ajouterMoisDate(credit.dateDebut, s.index, jour);
      const differe = date < credit.dateDebut;
      const capitalDebut = s.capital;
      const interets = s.capital > 0 ? interetsMensuels(s.capital, credit.tauxPourcent) : 0;
      let rembourse = 0;
      let ass = 0;
      if (s.capital > 0) {
        ass = assurance;
        if (!differe) {
          rembourse = Math.min(s.capital, mensualite - interets);
          if (rembourse <= 0) throw new Error('Mensualité insuffisante pour couvrir les intérêts');
        }
        s.capital -= rembourse;
        s.interets += interets; s.assurance += ass; s.paye += rembourse + interets + ass;
      }
      s.poche += Math.max(0, versementCentimes);
      let anticipe = 0;
      if (ponctuelCentimes > 0) anticipe += anticiper(date, ponctuelCentimes, 'ponctuel');
      if (s.capital > 0 && ((mode === 'palier' && s.poche >= palier) || (mode === 'solde' && s.poche >= s.capital))) {
        const v = anticiper(date, s.poche, 'poche');
        s.poche -= v; anticipe += v;
      }
      s.index += 1; s.n += 1;
      return { date, differe, capitalDebutCentimes: capitalDebut, interetsCentimes: interets, assuranceCentimes: ass, capitalRembourseCentimes: rembourse, echeanceCentimes: rembourse + interets + ass, anticipeCentimes: anticipe, capitalFinCentimes: s.capital, pocheCentimes: s.poche };
    },
  };
}

/**
 * Simulation complète jusqu'à la fin du prêt.
 * @param {{ depuis, capitalCentimes?, pocheCentimes?, versementMensuelCentimes?: number|((mois: string, date: string) => number),
 *   palierCentimes?, mode?, ponctuels?: Array<{ date, montantCentimes }>, mensualiteCentimes? }} o
 * @returns {{ lignes, finLe, nbEcheances, interetsCentimes, assuranceCentimes, coutCentimes, totalPayeCentimes, anticipes, pocheFinaleCentimes }}
 */
export function simulerPret(credit, o) {
  const sim = simulateurPret(credit, o);
  const versement = typeof o.versementMensuelCentimes === 'function' ? o.versementMensuelCentimes : () => o.versementMensuelCentimes || 0;
  const ponctuels = [...(o.ponctuels || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const lignes = [];
  let avant = o.depuis;
  while (!sim.fini() && lignes.length < MAX_MOIS) {
    const date = sim.prochaine();
    const ponctuel = ponctuels.filter((p) => p.date > avant && p.date <= date).reduce((s, p) => s + p.montantCentimes, 0);
    // Un remboursement ponctuel daté d'aujourd'hui (avant la première échéance) compte dès la première échéance
    const premier = !lignes.length ? ponctuels.filter((p) => p.date <= avant).reduce((s, p) => s + p.montantCentimes, 0) : 0;
    lignes.push(sim.pas(versement(date.slice(0, 7), date), ponctuel + premier));
    avant = date;
  }
  const s = sim.etat;
  return {
    lignes, finLe: lignes.length ? lignes[lignes.length - 1].date : o.depuis, nbEcheances: lignes.length,
    interetsCentimes: s.interets, assuranceCentimes: s.assurance, coutCentimes: s.interets + s.assurance,
    totalPayeCentimes: s.paye, anticipes: s.anticipes, pocheFinaleCentimes: s.poche, mensualiteCentimes: sim.mensualiteCentimes,
  };
}

/**
 * Avant le début de l'amortissement : rembourser R maintenant, puis soit garder la mensualité (durée réduite),
 * soit garder la durée (mensualité réduite, si la banque accepte de la recalculer).
 */
export function dureeOuMensualite(credit, depuis, montantCentimes) {
  const capital = capitalRestant(credit, depuis);
  const r = Math.min(capital, Math.max(0, montantCentimes));
  const base = simulerPret(credit, { depuis, mode: 'aucun' });
  const duree = simulerPret(credit, { depuis, mode: 'aucun', ponctuels: [{ date: depuis, montantCentimes: r }] });
  const avantAmortissement = depuis < credit.dateDebut;
  let mensualite = null;
  if (avantAmortissement && capital - r > 0 && credit.dureeMois) {
    const m = mensualiteConstante(capital - r, credit.tauxPourcent, credit.dureeMois);
    const sim = simulerPret(credit, { depuis, mode: 'aucun', ponctuels: [{ date: depuis, montantCentimes: r }], mensualiteCentimes: m });
    mensualite = { mensualiteCentimes: m, baisseMensuelleCentimes: base.mensualiteCentimes - m, finLe: sim.finLe, coutCentimes: sim.coutCentimes, economieCentimes: base.coutCentimes - sim.coutCentimes };
  }
  return {
    montantCentimes: r, base: { finLe: base.finLe, coutCentimes: base.coutCentimes, mensualiteCentimes: base.mensualiteCentimes },
    duree: { finLe: duree.finLe, moisGagnes: base.nbEcheances - duree.nbEcheances, coutCentimes: duree.coutCentimes, economieCentimes: base.coutCentimes - duree.coutCentimes, mensualiteCentimes: base.mensualiteCentimes },
    mensualite,
  };
}

/**
 * Le plan complet du prêt : où j'en suis, ce que coûte de ne rien faire, et les plans comparés.
 * @param {{ pocheCentimes, versementMensuelCentimes, palierCentimes, tauxEpargnePourcent, coussinCentimes, coussinCibleCentimes }} o
 */
export function planPret(credit, depuis, o = {}) {
  const capital = capitalRestant(credit, depuis);
  const poche = Math.max(0, o.pocheCentimes || 0);
  const versement = Math.max(0, o.versementMensuelCentimes || 0);
  const palier = o.palierCentimes || 50000;
  const sim = (extra) => simulerPret(credit, { depuis, capitalCentimes: capital, ...extra });
  const base = sim({ mode: 'aucun' });
  const resume = (id, titre, s, detail) => ({
    id, titre, detail, finLe: s.finLe, nbEcheances: s.nbEcheances, coutCentimes: s.coutCentimes, interetsCentimes: s.interetsCentimes,
    economieCentimes: base.coutCentimes - s.coutCentimes, moisGagnes: base.nbEcheances - s.nbEcheances, anticipes: s.anticipes, lignes: s.lignes,
  });
  const plans = [resume('base', 'Sans rien faire', base, 'Tu paies les échéances prévues, sans remboursement en avance.')];
  if (versement > 0 || poche > 0) {
    plans.push(resume('palier', `Rembourser par paliers de ${Math.round(palier / 100)} €`, sim({ mode: 'palier', palierCentimes: palier, pocheCentimes: poche, versementMensuelCentimes: versement }), 'Ton réglage actuel : dès que l’épargne prêt atteint le palier, elle part en remboursement.'));
    plans.push(resume('mensuel', 'Rembourser chaque mois', sim({ mode: 'palier', palierCentimes: 1, pocheCentimes: poche, versementMensuelCentimes: versement }), 'Tout ce qui arrive sur l’épargne prêt est remboursé le mois même.'));
    plans.push(resume('solde', 'Tout garder, solder d’un coup', sim({ mode: 'solde', pocheCentimes: poche, versementMensuelCentimes: versement }), 'Tu gardes l’épargne prêt jusqu’à pouvoir tout rembourser en une fois.'));
  }
  // Ce que rapporte un remboursement de 100 € aujourd'hui
  const cent = sim({ mode: 'aucun', ponctuels: [{ date: depuis, montantCentimes: 10000 }] });
  const gain100 = { economieCentimes: base.coutCentimes - cent.coutCentimes, joursGagnes: diffJours(cent.finLe, base.finLe) };
  // Ce que coûte chaque mois d'attente : intérêts d'un mois sur le capital actuel
  const interetsMois = interetsMensuels(capital, credit.tauxPourcent);
  const tauxEpargne = o.tauxEpargnePourcent || 0;
  const conseil = conseilPret({ credit, capital, tauxEpargne, coussin: o.coussinCentimes || 0, coussinCible: o.coussinCibleCentimes || 0, interetsMois });
  const meilleur = [...plans].sort((a, b) => a.coutCentimes - b.coutCentimes || (a.finLe < b.finLe ? -1 : 1))[0];
  return {
    credit, capitalCentimes: capital, pocheCentimes: poche, versementMensuelCentimes: versement, palierCentimes: palier,
    enDiffere: depuis < credit.dateDebut, debutAmortissement: credit.dateDebut, mensualiteCentimes: base.mensualiteCentimes, assuranceCentimes: credit.assuranceMensuelleCentimes || 0,
    interetsMoisCentimes: interetsMois, base: plans[0], plans, meilleurId: meilleur.id, gain100, conseil, tauxEpargnePourcent: tauxEpargne,
    progression: credit.capitalCentimes ? Math.max(0, Math.min(1, 1 - capital / credit.capitalCentimes)) : 0,
  };
}

/** L'ordre de priorité, avec ses raisons chiffrées (aucun conseil de placement : seulement l'arithmétique du prêt). */
export function conseilPret({ credit, capital, tauxEpargne, coussin, coussinCible, interetsMois }) {
  const raisons = [];
  const coutPar1000 = interetsMensuels(100000, credit.tauxPourcent); // intérêts d'un mois pour 1 000 € non remboursés
  if (coussinCible > 0 && coussin < coussinCible) {
    raisons.push(`Ta sécurité n’est pas encore pleine. Attendre pour rembourser coûte peu : environ ${(coutPar1000 / 100).toFixed(2).replace('.', ',')} € par mois pour 1 000 € non remboursés.`);
    raisons.push('Un imprévu sans coussin coûte bien plus cher (découvert, crédit instantané).');
    return { code: 'coussinDabord', titre: 'La sécurité d’abord, le prêt ensuite', raisons, coutPar1000Centimes: coutPar1000, interetsMoisCentimes: interetsMois };
  }
  if (tauxEpargne > credit.tauxPourcent) {
    raisons.push(`Ton épargne rapporte ${String(tauxEpargne).replace('.', ',')} %, plus que les ${String(credit.tauxPourcent).replace('.', ',')} % du prêt : la garder rapporte plus que rembourser.`);
    return { code: 'garderEpargne', titre: 'Garder l’épargne rapporte plus', raisons, coutPar1000Centimes: coutPar1000, interetsMoisCentimes: interetsMois };
  }
  raisons.push(tauxEpargne > 0
    ? `Le prêt te coûte ${String(credit.tauxPourcent).replace('.', ',')} %, ton épargne rapporte ${String(tauxEpargne).replace('.', ',')} % : rembourser gagne la différence.`
    : `Ton épargne ne rapporte pas d’intérêts : chaque euro remboursé en avance est un gain net de ${String(credit.tauxPourcent).replace('.', ',')} % par an.`);
  if (capital > 0) raisons.push(`Aujourd’hui le prêt te coûte ${(interetsMois / 100).toFixed(2).replace('.', ',')} € d’intérêts par mois.`);
  return { code: 'rembourserTot', titre: 'Rembourser dès que possible', raisons, coutPar1000Centimes: coutPar1000, interetsMoisCentimes: interetsMois };
}
