// express.js — ajout express : les dépenses que tu refais souvent (Vélib' 3 €, distributeur, menu…), en un toucher.
// Apprises de tes 90 derniers jours : même marchand au moins 2 fois ; le montant proposé est celui qui revient le plus.

import { estDepenseQuotidienne } from './calculs.js';
import { ajouterJours } from './dates.js';

/**
 * @returns {Array<{ cle, marchand, libelle, montantCentimes, categorie, compteId, nb, derniere }>}
 */
export function depensesFrequentes(etat, dateIso, n = 6) {
  const depuis = ajouterJours(dateIso, -90);
  const groupes = new Map();
  for (const t of etat.transactions || []) {
    if (t.sens !== 'debit' || t.date < depuis || t.date > dateIso || t.ajustement) continue;
    if (t.virementInterne?.estInterne || t.epargne?.estEpargne || !estDepenseQuotidienne(t)) continue;
    const marchand = (t.marchand || t.libelle || '').trim();
    if (!marchand || /^(dépense|inconnu)$/i.test(marchand)) continue;
    const cle = marchand.toLowerCase();
    const g = groupes.get(cle) || { cle, marchand, libelle: t.libelle || marchand, montants: new Map(), categorie: t.categorie, compteId: t.compteId, nb: 0, derniere: '' };
    g.nb += 1;
    g.montants.set(t.montantCentimes, (g.montants.get(t.montantCentimes) || 0) + 1);
    if (t.date >= g.derniere) { g.derniere = t.date; g.categorie = t.categorie || g.categorie; g.compteId = t.compteId || g.compteId; g.libelle = t.libelle || g.libelle; }
    groupes.set(cle, g);
  }
  return [...groupes.values()]
    .filter((g) => g.nb >= 2)
    .map((g) => {
      // Montant le plus fréquent ; à égalité, le plus récent n'est pas connu ici : on prend le plus petit
      const [montantCentimes] = [...g.montants.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      return { cle: g.cle, marchand: g.marchand, libelle: g.libelle, montantCentimes, categorie: g.categorie, compteId: g.compteId, nb: g.nb, derniere: g.derniere };
    })
    .sort((a, b) => b.nb - a.nb || (a.derniere < b.derniere ? 1 : -1))
    .slice(0, n);
}
