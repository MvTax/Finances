// sans-depense.js (page) — annoncer une journée sans dépense, et le calendrier de celles déjà faites.

import { h, icone, mt } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { bouton } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat, ecrireMeta } from '../store.js';
import { calendrierSansDepense, estAnnoncee, serieSansDepense } from '../sansdepense.js';
import { aujourdhui, formatDateCourte } from '../dates.js';
import { formatEuros } from '../money.js';
import { feter } from '../ui/fete.js';

export async function annoncerSansDepense(jour = aujourdhui(), oui = true) {
  const jours = { ...(etat.meta.sansDepense?.jours || {}) };
  if (oui) jours[jour] = { annonceLe: new Date().toISOString() }; else delete jours[jour];
  await ecrireMeta('sansDepense', { jours }, { avertir: true });
  if (oui && jour === aujourdhui()) feter('sansDepense', { texte: 'à gagner si tu tiens' });
}

const LIBELLES = { tenue: 'tenue', rompue: 'rompue', enCours: 'en cours', sansDepense: 'sans dépense (non annoncée)', libre: '', futur: '' };

export function feuilleSansDepense() {
  let f = null;
  const contenu = h('div', { class: 'sd' });
  const dessiner = () => {
    const auj = aujourdhui();
    const c = calendrierSansDepense(etat, auj);
    const annoncee = estAnnoncee(etat, auj);
    const serie = serieSansDepense(etat, auj);
    const jour = c.enCours;
    contenu.replaceChildren(
      h('div', { class: `sd-aujourdhui sd-${jour.statut}` },
        h('p', { class: 'sd-titre' }, annoncee ? (jour.statut === 'rompue' ? `Journée rompue : ${formatEuros(jour.depensesCentimes)} dépensés aujourd’hui` : 'Aujourd’hui : journée sans dépense en cours') : 'Aujourd’hui, je ne dépense rien ?'),
        h('p', { class: 'petit' }, annoncee
          ? (jour.statut === 'rompue' ? 'Pas grave : ce qui reste de ta part du jour part quand même à l’épargne à 5 h demain.' : `Si tu tiens, toute ta part du jour (${formatEuros(c.partDuJourCentimes)}) part à l’épargne demain à 5 h : repas à la maison, privations et reste du jour.`)
          : `Annonce-le : l’app suit ta journée, et à 5 h demain toute ta part du jour (${formatEuros(c.partDuJourCentimes)}) part à l’épargne si tu ne dépenses rien.`),
        annoncee ? bouton('Annuler l’annonce', async () => { await annoncerSansDepense(auj, false); dessiner(); }, { classe: 'btn-petit' })
          : bouton('J’annonce une journée sans dépense', async () => { await annoncerSansDepense(auj, true); toast('C’est parti : journée sans dépense annoncée.', { type: 'succes' }); dessiner(); }, { classe: 'btn-principal', icone: 'ok' })),
      h('div', { class: 'sd-resume' },
        h('div', {}, h('small', {}, 'Journées tenues'), h('strong', {}, `${c.nbTenues}`, h('span', { class: 'sd-sur' }, ` / ${c.nbAnnoncees}`))),
        h('div', {}, h('small', {}, 'Ce qu’elles ont rapporté'), h('strong', { class: 'vert-texte' }, mt(c.rapporteCentimes))),
        h('div', {}, h('small', {}, 'Série en cours'), h('strong', {}, `${serie} j`))),
      h('div', { class: 'sd-calendrier', role: 'table', 'aria-label': 'Calendrier des 5 dernières semaines' },
        h('div', { class: 'sd-ligne sd-entete', role: 'row' }, ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => h('span', { role: 'columnheader' }, x))),
        c.semaines.map((s) => h('div', { class: 'sd-ligne', role: 'row' }, s.map((b) => h('span', {
          role: 'cell', class: `sd-jour sd-${b.statut} ${b.annoncee ? 'annoncee' : ''} ${b.jour === auj ? 'aujourdhui' : ''}`,
          title: `${formatDateCourte(b.jour)}${LIBELLES[b.statut] ? ` : ${LIBELLES[b.statut]}` : ''}${b.statut === 'tenue' ? `, ${formatEuros(b.misDeCoteCentimes)} mis de côté` : ''}`,
          'aria-label': `${formatDateCourte(b.jour)}${LIBELLES[b.statut] ? `, ${LIBELLES[b.statut]}` : ''}${b.statut === 'tenue' ? `, ${formatEuros(b.misDeCoteCentimes)} mis de côté` : ''}`,
        }, String(Number(b.jour.slice(8))))))),
      ),
      h('div', { class: 'sd-legende' },
        h('span', {}, h('i', { class: 'sd-pastille sd-tenue' }), 'tenue'),
        h('span', {}, h('i', { class: 'sd-pastille sd-rompue' }), 'rompue'),
        h('span', {}, h('i', { class: 'sd-pastille sd-enCours' }), 'en cours'),
        h('span', {}, h('i', { class: 'sd-pastille sd-sansDepense' }), 'sans dépense, non annoncée')),
      h('p', { class: 'petit' }, 'Une journée compte comme tenue quand aucune dépense du quotidien n’y est notée (les prélèvements et abonnements ne comptent pas). Ce qu’elle rapporte : privations, repas à la maison et reste du jour.'));
  };
  dessiner();
  f = ouvrirFeuille({ titre: 'Journées sans dépense', contenu, plein: true });
  return f;
}

export { icone };
