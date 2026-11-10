// s-repartition.js (v100) — Stratégie → Répartition : où va chaque euro mis de côté. Compare les préréglages sur 24 mois,
// dit lequel suit l'ordre de priorité, et applique celui que tu choisis (ou ton propre réglage).

import { h, vibrer } from '../../ui/dom.js';
import { bouton } from '../../ui/composants.js';
import { toast } from '../../ui/toast.js';
import { etat, majProfil, enregistrer } from '../../store.js';
import { aujourdhui, formatMois } from '../../dates.js';
import { entete, panneau, reglette, parImage } from '../ui/blocs.js';
import { comparerPartages, evaluerPartage } from '../strategie/repartition.js';
import { normaliserParts } from '../strategie/projection.js';

const ml = (m) => (m ? formatMois(m, true) : null);

function bande(parts) {
  return h('div', { class: 'partage-bande', role: 'img', 'aria-label': `Prêt ${parts.pret} %, sécurité ${parts.securite} %, envie ${parts.envie} %` },
    h('span', { class: 'p-pret', style: { width: `${parts.pret}%` } }), h('span', { class: 'p-secu', style: { width: `${parts.securite}%` } }), h('span', { class: 'p-envie', style: { width: `${parts.envie}%` } }));
}

function resultats(r) {
  return h('div', { class: 'plan-chiffres' },
    h('p', {}, h('small', {}, 'SÉCURITÉ PLEINE'), h('b', {}, ml(r.coussinMois) || '—')),
    h('p', {}, h('small', {}, 'PRÊT SOLDÉ'), h('b', {}, ml(r.pretSoldeMois) || 'après 24 mois')),
    h('p', {}, h('small', {}, 'ENVIE DÉBLOQUÉE'), h('b', {}, ml(r.envieMois) || '—')));
}

async function appliquer(parts, partEpargnePret) {
  await majProfil({ partsReste: parts });
  const poches = (etat.poches || []).filter((p) => p.actif !== false);
  const pret = poches.find((p) => p.type === 'remboursementAnticipe'); const secu = poches.find((p) => p.type === 'coussin');
  if (pret && secu) {
    await enregistrer('poches', { ...pret, partRepartition: partEpargnePret });
    await enregistrer('poches', { ...secu, partRepartition: 100 - partEpargnePret });
  }
  vibrer(15);
  toast('Répartition appliquée. Elle vaut pour les prochains virements.', { type: 'succes' });
}

export function rendre(vue) {
  const auj = aujourdhui();
  const c = comparerPartages(etat, auj);
  const legende = () => h('div', { class: 'partage-legende' }, h('span', {}, h('i', { class: 'pastille-serie serie-1' }), 'Prêt'), h('span', {}, h('i', { class: 'pastille-serie serie-4' }), 'Sécurité'), h('span', {}, h('i', { class: 'pastille-serie serie-2' }), 'Envie'));
  const carte = (x) => h('div', { class: `partage ${x.id === c.conseille ? 'conseille' : ''} ${x.id === c.actuel.prereglage ? 'choisi' : ''}` },
    h('div', { class: 'plan-tete' }, h('strong', {}, x.nom), x.id === c.actuel.prereglage ? h('span', { class: 'plan-badge' }, 'ton réglage') : x.id === c.conseille ? h('span', { class: 'plan-badge' }, 'conseillé') : null),
    h('p', { class: 'note' }, `${x.pourquoi} Reste des journées : ${x.parts.pret} / ${x.parts.securite} / ${x.parts.envie}. Épargne du mois : ${x.partEpargnePret} % prêt, ${100 - x.partEpargnePret} % sécurité.`),
    bande(x.parts), resultats(x.resultat),
    x.id === c.actuel.prereglage ? null : bouton('Appliquer', () => appliquer(x.parts, x.partEpargnePret), { classe: 'btn-secondaire btn-petit' }));

  // Réglage à la main
  let perso = { ...c.actuel.parts }; let persoEpargne = c.actuel.partEpargnePret;
  const zonePerso = h('div', { class: 'partage' });
  const dessinerPerso = () => {
    const parts = normaliserParts(perso);
    const r = evaluerPartage(etat, auj, { parts, partEpargnePret: persoEpargne });
    zonePerso.replaceChildren(h('p', { class: 'note' }, `Reste des journées : ${parts.pret} % prêt, ${parts.securite} % sécurité, ${parts.envie} % envie.`), bande(parts), resultats(r),
      bouton('Appliquer ce réglage', () => appliquer(parts, persoEpargne), { classe: 'btn-principal btn-petit' }));
  };
  const maj = parImage(dessinerPerso);
  dessinerPerso();

  vue.replaceChildren(h('div', { class: 'st' },
    entete('Répartition', 'Deux sources alimentent ton épargne : l’épargne du mois (le virement prévu) et le reste de tes journées. Voici où elles vont, et ce que ça change sur 24 mois.'),
    panneau('Ton réglage aujourd’hui', bande(c.actuel.parts), legende(), resultats(c.actuel.resultat),
      h('p', { class: 'note' }, `Épargne du mois : ${c.actuel.partEpargnePret} % prêt, ${100 - c.actuel.partEpargnePret} % sécurité.`)),
    panneau('Comparer', h('p', { class: 'note' }, c.conseille === 'securite' ? 'Ordre conseillé : la sécurité d’abord (un imprévu sans coussin coûte plus cher que les intérêts du prêt), puis le prêt.' : c.conseille === 'pret' ? 'Ta sécurité est pleine : le prêt passe devant.' : 'Sécurité pleine et prêt soldé : garde l’équilibre.'),
      h('div', { class: 'partages' }, c.lignes.map(carte))),
    panneau('Régler à la main',
      reglette({ libelle: 'Reste des journées : part du prêt', min: 0, max: 100, pas: 5, valeur: perso.pret, format: (x) => `${x} %`, onChange: (x) => { perso.pret = x; maj(); } }),
      reglette({ libelle: 'Reste des journées : part de la sécurité', min: 0, max: 100, pas: 5, valeur: perso.securite, format: (x) => `${x} %`, onChange: (x) => { perso.securite = x; maj(); }, note: 'Ce qui reste va à ton envie en cours.' }),
      reglette({ libelle: 'Épargne du mois : part du prêt', min: 0, max: 100, pas: 5, valeur: persoEpargne, format: (x) => `${x} %`, onChange: (x) => { persoEpargne = x; maj(); }, note: 'Le reste va à la sécurité.' }),
      zonePerso),
    h('p', { class: 'note' }, 'Quand la sécurité est pleine, sa part passe au prêt ; quand le prêt est soldé, sa part passe à la sécurité. Les arrondis gardent leur réglage.')));
}
