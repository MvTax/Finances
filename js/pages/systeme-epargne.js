// systeme-epargne.js — « Mon système d'épargne » : d'où vient l'argent mis de côté chaque mois et où il va.
// Deux poches suffisent : Sécurité (les imprévus) et le remboursement du prêt. Les mensualités du prêt, elles,
// sont prélevées directement sur le compte : elles ne passent pas par l'épargne.

import { h, icone, mt } from '../ui/dom.js';
import { carte, segment, selectionner, champ } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat, enregistrerLot, majProfil } from '../store.js';
import { resteADepenser, epargneDuMois } from '../calculs.js';
import { repartirVersement, soldePoche } from '../epargne.js';
import { planDesMois, atteintes } from '../plan.js';
import { bilanPrivations } from '../privations.js';
import { echeancesEntre } from '../dettes.js';
import { aujourdhui, ajouterJours, formatMois } from '../dates.js';
import { formatEuros } from '../money.js';
import { aVirerEpargne, compteEpargne } from '../virements.js';

/** Poche des efforts (arrondis, repas à la maison, privations) : réglage des arrondis, sinon la poche prêt. Null si partagés. */
export function pocheEfforts(e = etat) {
  const id = e.profil?.arrondi?.pocheId;
  if (id === 'partage') return null;
  return e.poches.find((p) => p.id === id && p.actif !== false) || e.poches.find((p) => p.type === 'remboursementAnticipe' && p.actif !== false) || e.poches.find((p) => p.actif !== false);
}

export function carteSysteme() {
  const auj = aujourdhui();
  const r = resteADepenser(etat, auj);
  const actives = etat.poches.filter((p) => p.actif !== false);
  const securite = actives.find((p) => p.type === 'coussin');
  const pret = actives.find((p) => p.type === 'remboursementAnticipe');
  const efforts = pocheEfforts();
  const aVirer = aVirerEpargne(etat, auj);
  const versEfforts = efforts ? `→ ${efforts.nom}` : '→ partagés entre les deux épargnes';
  const nom = (id) => etat.poches.find((p) => p.id === id)?.nom || 'Épargne';
  const vise = r.epargneCibleCentimes;
  const split = repartirVersement(vise, actives);
  const arrondis = epargneDuMois(etat, auj).cagnotteCentimes;
  const priv = bilanPrivations(etat, r.periode, r.privationsAuto || []);
  // Projection : quand la poche du prêt atteint sa cible, au rythme du plan (épargne du mois répartie)
  const proj = planDesMois(etat, r.periode.mois, 48);
  const att = pret ? atteintes(etat, proj)[pret.id] : null;
  const prochainPret = echeancesEntre(etat, auj, ajouterJours(auj, 800)).find((x) => x.creditId === pret?.creditId && x.montantCentimes > 2000);
  const partSecu = securite?.partRepartition ?? 10;
  const pleineSecu = securite && securite.cibleCentimes && soldePoche(securite) >= securite.cibleCentimes;

  const flux = (ic, quand, quoi, montant, vers) => h('div', { class: 'flux' },
    h('span', { class: 'flux-icone', 'aria-hidden': 'true' }, icone(ic)),
    h('span', { class: 'flux-texte' }, h('strong', {}, quoi), h('small', {}, quand), h('small', { class: 'flux-vers' }, vers)),
    h('span', { class: 'flux-droite' }, montant !== null ? mt(montant) : null));

  const changerPart = async (v) => {
    if (!securite || !pret) return;
    const part = Number(v);
    await enregistrerLot([{ collection: 'poches', valeur: { ...securite, partRepartition: part } }, { collection: 'poches', valeur: { ...pret, partRepartition: 100 - part } }]);
    toast(`Répartition : ${part} % sécurité, ${100 - part} % prêt.`, { type: 'succes' });
  };

  return carte('Mon système d’épargne', h('div', { class: 'systeme' },
    h('p', { class: 'petit' }, 'Chaque mois, l’app met de côté le maximum possible, en trois flux. Ta mensualité de prêt est prélevée directement sur ton compte : elle est déjà payée, elle ne passe pas par l’épargne.'),
    h('div', { class: 'flux-liste' },
      flux('tirelire', 'Chaque mois, après le salaire', 'Épargne du mois', vise,
        split.length ? split.map((s) => `${formatEuros(s.montantCentimes)} ${nom(s.pocheId)}`).join(' + ') : 'rien ce mois-ci'),
      flux('pieces', 'Chaque semaine', 'Arrondis à l’euro', arrondis, versEfforts),
      flux('burger', 'Chaque jour', 'Repas à la maison et privations', priv.moisCentimes, versEfforts),
      flux('calendrier', 'Au salaire', 'Le reste du mois', null, `réparti comme l’épargne du mois`)),
    securite && pret ? champ('Part pour la sécurité', segment([['0', '0 %'], ['10', '10 %'], ['25', '25 %'], ['50', '50 %']], String(partSecu), changerPart, 'Part pour la sécurité'),
      `Le prêt reçoit le reste (${100 - partSecu} %)${efforts ? `, et ${efforts.nom} reçoit tous les arrondis, repas et privations` : '. Les arrondis, repas et privations sont partagés de la même façon'}.${securite.cibleCentimes && partSecu ? ` Une fois ${securite.nom} à ${formatEuros(securite.cibleCentimes)}, tout va au prêt.` : ''}${pleineSecu ? ' C’est déjà le cas.' : ''}`) : null,
    actives.length ? champ('Arrondis, repas et privations vont dans', selectionner([['partage', 'Les deux épargnes (même partage)'], ...actives.map((p) => [p.id, p.nom])], efforts ? efforts.id : 'partage', (v) => majProfil({ arrondi: { ...etat.profil.arrondi, pocheId: v } }))) : null,
    pret ? h('div', { class: 'systeme-pret' },
      h('p', {}, h('strong', {}, `${pret.nom} : ${formatEuros(soldePoche(pret) + (aVirer.parPoche.find((x) => x.pocheId === pret.id)?.montantCentimes || 0))}`), pret.cibleCentimes ? ` sur ${formatEuros(pret.cibleCentimes)}` : '', compteEpargne(pret) ? `, sur ton ${compteEpargne(pret)}` : ''),
      h('p', { class: 'petit' }, att ? `Au rythme du plan (sans compter les arrondis ni les repas), la poche est pleine en ${formatMois(att)}.` : 'Au rythme actuel, la poche ne se remplit pas dans les 4 prochaines années : chaque arrondi et chaque repas à la maison compte.'),
      prochainPret ? h('p', { class: 'petit' }, `Mensualités prélevées directement : ${formatEuros(prochainPret.montantCentimes)} à partir du ${prochainPret.date.split('-').reverse().join('/')}. Avec la poche, tu pourras rembourser en avance, par tranches de ${formatEuros(pret.palierCentimes || 50000)}.`) : null) : null));
}
