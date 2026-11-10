// s-categories.js (v100) — Stratégie → Catégories : chaque enveloppe en direct (dépensé, plafond, rythme, reste par jour),
// ce que le plafond représente face à tes habitudes, et le levier. Toucher une enveloppe change son plafond.

import { h, estMasque, vibrer } from '../../ui/dom.js';
import { ouvrirFeuille } from '../../ui/sheet.js';
import { champ, champMontant, bouton } from '../../ui/composants.js';
import { toast } from '../../ui/toast.js';
import { etat, enregistrer } from '../../store.js';
import { aller } from '../../router.js';
import { aujourdhui, formatDateCourte } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { barreRepere } from '../ui/graphes.js';
import { entete, panneau, kpi } from '../ui/blocs.js';
import { suiviEnveloppes } from '../strategie/enveloppes.js';

const eur = (c) => (estMasque() ? '•••,•• €' : formatEuros(c));
const rond = (c) => (estMasque() ? '••• €' : formatEuros(c, { sansCentimes: true }));
const NOM_STATUT = { ok: 'dans le rythme', calme: 'en avance', chaud: 'ça chauffe', depasse: 'dépassée' };
const BARRE = { ok: 'ok', calme: 'bien', chaud: 'attention', depasse: 'critique' };
const LECTURE = { ambitieux: 'plafond ambitieux', realiste: 'plafond réaliste', large: 'plafond large' };

export function rendre(vue) {
  const auj = aujourdhui();
  const s = suiviEnveloppes(etat, auj);
  if (!s.lignes.length) {
    vue.replaceChildren(h('div', { class: 'st' }, entete('Catégories', 'Aucune enveloppe n’est réglée.'), bouton('Créer mes enveloppes', () => aller('budgets'), { classe: 'btn-principal' })));
    return;
  }
  const ligne = (l) => h('button', { type: 'button', class: 'env-ligne', onclick: () => feuillePlafond(l), 'aria-label': `${l.nom} : ${formatEuros(l.depenseCentimes)} sur ${formatEuros(l.plafondCentimes)}, ${NOM_STATUT[l.statut]}. Changer le plafond` },
    h('div', { class: 'env-tete' }, h('strong', {}, l.nom), h('span', {}, eur(l.depenseCentimes), h('small', {}, ` / ${rond(l.plafondCentimes)}`))),
    barreRepere({ part: l.plafondCentimes ? l.depenseCentimes / l.plafondCentimes : 0, repere: s.avancement, etat: BARRE[l.statut], description: `${Math.round((l.plafondCentimes ? l.depenseCentimes / l.plafondCentimes : 0) * 100)} % du plafond, ${Math.round(s.avancement * 100)} % du mois écoulé` }),
    h('div', { class: 'env-pied' },
      h('span', { class: `etat-puce etat-${l.statut}` }, NOM_STATUT[l.statut]),
      l.statut === 'depasse' ? h('span', {}, `${eur(-l.resteCentimes)} de trop`) : h('span', {}, `reste ${eur(l.resteCentimes)}, soit ${eur(l.parJourRestantCentimes)} par jour`),
      l.statut === 'chaud' ? h('span', {}, `à ce rythme : ${rond(l.rythmeFinCentimes)} à la fin`) : null),
    l.habitudePeriodes ? h('div', { class: 'env-pied' }, h('span', {}, `Ta moyenne sur ${l.habitudePeriodes} mois : ${rond(l.habitudeCentimes)}${l.lecture ? `, ${LECTURE[l.lecture]}` : ''}`),
      l.levierMensuelCentimes > 0 ? h('span', { class: 'etat-puce etat-calme' }, `levier ${rond(l.levierMensuelCentimes)} / mois`) : null) : null);

  vue.replaceChildren(h('div', { class: 'st' },
    entete('Catégories', `Du ${formatDateCourte(s.periode.debut)} au ${formatDateCourte(s.periode.fin)} : jour ${s.joursEcoules} sur ${s.periode.nbJours}. Le trait blanc montre où tu devrais en être aujourd’hui.`),
    h('div', { class: 'kpis trois' },
      kpi('PLAFONDS', rond(s.total.plafondCentimes)),
      kpi('DÉPENSÉ', rond(s.total.depenseCentimes)),
      kpi('RESTE', rond(s.total.resteCentimes), null, s.total.resteCentimes < 0 ? 'rouge' : 'vert')),
    panneau('Tes enveloppes', h('div', { class: 'env-liste' }, s.lignes.map(ligne)),
      s.horsEnveloppesCentimes > 0 ? h('p', { class: 'note' }, `${eur(s.horsEnveloppesCentimes)} dépensés dans des catégories sans enveloppe.`) : null),
    s.levierMensuelCentimes > 0 ? panneau('Ton levier',
      h('p', {}, `Tenir tes plafonds te fait dépenser ${rond(s.levierMensuelCentimes)} de moins par mois que tes habitudes, soit ${rond(s.levierMensuelCentimes * 12)} par an.`),
      h('p', { class: 'note' }, 'Le levier d’une enveloppe : ta moyenne des 3 derniers mois moins son plafond. Les enveloppes indispensables (courses, transports) n’en ont pas.')) : null,
    h('button', { type: 'button', class: 'btn btn-secondaire', onclick: () => aller('budgets') }, 'Créer une enveloppe, déplacer de l’argent entre deux enveloppes')));
}

function feuillePlafond(l) {
  const env = etat.enveloppes.find((x) => x.id === l.id);
  if (!env) return null;
  let montant = env.plafondMensuelCentimes || 0;
  const f = ouvrirFeuille({
    titre: l.nom,
    contenu: h('div', { class: 'formulaire' },
      l.habitudePeriodes ? h('p', { class: 'petit' }, `Ta moyenne des ${l.habitudePeriodes} derniers mois : ${formatEuros(l.habitudeCentimes)}. Ce mois-ci : ${formatEuros(l.depenseCentimes)} dépensés.`) : null,
      champ('Plafond par mois', champMontant({ valeur: montant, label: 'Plafond par mois', autofocus: true, onValeur: (v) => { montant = v; } })),
      bouton('Enregistrer', async () => {
        if (!(montant >= 0)) return;
        await enregistrer('enveloppes', { ...env, plafondMensuelCentimes: montant });
        f.fermer(); vibrer(15);
        toast(`${l.nom} : plafond à ${formatEuros(montant)}.`, { type: 'succes' });
      }, { classe: 'btn-principal btn-large' })),
  });
  return f;
}
