// etat.mjs — fabrique d'états synthétiques pour les tests de calcul.

let n = 0;
export function tx(o) {
  n += 1;
  return {
    id: o.id || `t${n}`, date: o.date, dateComptable: o.dateComptable || o.date, montantCentimes: o.montant, sens: o.sens || 'debit',
    categorie: o.categorie || 'courses', compteId: o.compteId || 'courant', marchand: o.marchand || 'Marchand', libelle: o.marchand || 'Marchand',
    libellePrincipal: o.libellePrincipal || o.marchand || 'Marchand', libelleBrut: o.libelleBrut || o.marchand || 'Marchand',
    source: o.source || 'texte', virementInterne: { estInterne: !!o.interne, transactionLieeId: null }, epargne: { estEpargne: !!o.epargne, type: o.typeEpargne || null },
    chargeFixeId: o.chargeFixeId || null, pretId: o.pretId || null, remboursementDe: o.remboursementDe || null, ajustement: !!o.ajustement, creeLe: '2026-01-01T00:00:00Z', ...o.extra,
  };
}

export function etatBase(extra = {}) {
  return {
    profil: { jourSalaireHabituel: 5, heuresMensuelles: 151.67, loyerAPayerCentimes: 30000, arrondi: { actif: false, frequence: 'hebdomadaire', jourVirement: 4, inclureChargesFixes: false, depuis: '2026-01-01' }, regleRevolut: { actif: true, minCentimes: 1000, maxCentimes: 1800 } },
    parametres: { commissionInterventionCentimes: 800 },
    comptes: [{ id: 'courant', nom: 'Courant', type: 'courant', soldeInitialCentimes: 0, dateSoldeInitial: '2025-12-31' }, { id: 'neo', nom: 'Néo', type: 'neobanque', soldeInitialCentimes: 0, dateSoldeInitial: '2025-12-31' }],
    transactions: [], revenusMensuels: [], chargesFixes: [], planMensuel: [], creditsBancaires: [], prets: [], poches: [], cagnotteArrondis: [], virementsPrevus: [], enveloppes: [], mouvementsEnveloppes: [],
    ...extra,
  };
}
