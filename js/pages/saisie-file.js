// saisie-file.js — propositions issues de la file d'attente IA : chaque saisie est confirmée une par une.

import { ouvrirSaisie } from './saisie.js';

export function ouvrirSaisieAvec(propositions) {
  const suivante = (i) => {
    if (i >= propositions.length) return;
    const { element, resultat } = propositions[i];
    const d = resultat.ticket
      ? { sens: 'debit', montantCentimes: resultat.ticket.totalCentimes, libelle: resultat.ticket.marchand, date: resultat.ticket.date, articles: resultat.ticket.articles, source: 'photo', confirmation: true }
      : { ...resultat, source: element.type === 'voix' ? 'voix' : 'texte', confirmation: true };
    const f = ouvrirSaisie('clavier', d);
    const fermerOrigine = f.element;
    const obs = new MutationObserver(() => { if (!document.contains(fermerOrigine)) { obs.disconnect(); setTimeout(() => suivante(i + 1), 300); } });
    obs.observe(document.body, { childList: true });
  };
  suivante(0);
}
