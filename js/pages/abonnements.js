// pages/abonnements.js — mes abonnements : total, limite à ne pas dépasser, liste, conseils et alternatives gratuites.

import { h, icone, mt } from '../ui/dom.js';
import { carte, barre, bouton, etatVide, champMontant } from '../ui/composants.js';
import { ouvrirFeuille, confirmer } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { etat, enregistrer, majProfil, ecrireMeta } from '../store.js';
import { listerAbonnements } from '../abonnements.js';
import { tauxHoraire, equivalentTravail, periodeBudget } from '../calculs.js';
import { aujourdhui, formatDateCourte, formatDate } from '../dates.js';
import { formatEuros } from '../money.js';
import { aller } from '../router.js';

export const titre = 'Abonnements';

export function rendre(vue) {
  const auj = aujourdhui();
  const resilies = etat.meta.abonnementsResilies || {};
  const a = listerAbonnements(etat, auj, { resilies });
  const plafond = etat.profil.plafondAbonnementsCentimes ?? null;
  const th = tauxHoraire(etat, periodeBudget(auj, etat.profil).mois);
  const travail = a.aLimiterAnnuelCentimes > 0 ? equivalentTravail(a.aLimiterAnnuelCentimes, th) : null;
  const economies = Object.values(resilies).reduce((s, r) => s + (r.annuelCentimes || 0), 0);

  if (!a.liste.length && !economies) {
    vue.replaceChildren(retour(), h('h1', { class: 'titre-page' }, 'Abonnements'),
      etatVide('boucle', 'Aucun abonnement repéré', 'Les prélèvements réguliers (musique, vidéo, téléphone, sport…) apparaissent ici dès qu’ils sont dans tes opérations ou tes charges fixes.'));
    return;
  }

  const depasse = plafond !== null && a.aLimiterMensuelCentimes > plafond;
  const entete = h('section', { class: 'abo-entete' },
    h('p', { class: 'abo-libelle' }, 'Abonnements à limiter'),
    h('p', { class: `abo-total ${depasse ? 'negatif-texte' : ''}` }, mt(a.aLimiterMensuelCentimes), h('span', { class: 'abo-unite' }, ' par mois')),
    h('p', { class: 'petit' }, `Soit ${formatEuros(a.aLimiterAnnuelCentimes)} par an${travail ? `, environ ${travail} de travail` : ''}.`),
    plafond !== null
      ? h('div', { class: 'abo-limite' }, barre(a.aLimiterMensuelCentimes, plafond, { couleur: 'var(--f-abonnements)', label: `Abonnements ${formatEuros(a.aLimiterMensuelCentimes)} sur une limite de ${formatEuros(plafond)}` }),
        h('div', { class: 'ligne-cle-sans' }, h('span', { class: 'petit' }, depasse ? `Limite dépassée de ${formatEuros(a.aLimiterMensuelCentimes - plafond)}` : `Il te reste ${formatEuros(plafond - a.aLimiterMensuelCentimes)} sous ta limite`), h('button', { class: 'lien', type: 'button', onclick: () => feuilleLimite(a) }, 'Modifier')))
      : bouton('Me fixer une limite', () => feuilleLimite(a), { classe: 'btn-principal' }),
    a.essentiels.length ? h('p', { class: 'petit' }, `En plus, ${formatEuros(a.essentiels.reduce((s, x) => s + x.mensuelCentimes, 0))} par mois d’essentiels (téléphone, transport, carte).`) : null);

  const ligne = (x) => h('button', { type: 'button', class: 'ligne-abo', onclick: () => feuilleAbonnement(x) },
    h('span', { class: 'puce-cat', style: { '--c': x.essentiel ? 'var(--f-vivre)' : 'var(--f-abonnements)' }, 'aria-hidden': 'true' }, icone(x.essentiel ? 'telephone' : 'boucle')),
    h('span', { class: 'ligne-abo-texte' },
      h('span', { class: 'ligne-abo-nom' }, x.nom),
      h('span', { class: 'ligne-abo-sous' }, `${x.frequence}${x.prochain ? `, prochain le ${formatDateCourte(x.prochain)}` : ''}`)),
    h('span', { class: 'ligne-abo-droite' }, h('span', { class: 'ligne-abo-montant' }, mt(x.mensuelCentimes), h('small', {}, ' /mois')), h('span', { class: 'ligne-abo-an' }, `${formatEuros(x.annuelCentimes, { sansCentimes: true })} /an`)));

  vue.replaceChildren(...[
    retour(),
    h('h1', { class: 'titre-page' }, 'Abonnements'),
    entete,
    a.aLimiter.length ? carte('À limiter', h('div', { class: 'liste' }, a.aLimiter.map(ligne)), { id: 'abo-limiter' }) : null,
    a.essentiels.length ? carte('Essentiels', h('div', { class: 'liste' }, a.essentiels.map(ligne)), { id: 'abo-essentiels' }) : null,
    economies ? carte('Déjà résiliés', h('div', { class: 'liste-cles' },
      Object.entries(resilies).map(([, r]) => h('div', { class: 'ligne-cle' }, h('span', {}, r.nom, h('small', { class: 'petit' }, ` le ${formatDate(r.le)}`)), h('span', { class: 'vert-texte' }, `−${formatEuros(r.annuelCentimes, { sansCentimes: true })} /an`))),
      h('div', { class: 'ligne-cle forte' }, h('span', {}, 'Économisé par an'), h('span', { class: 'vert-texte' }, formatEuros(economies)))), { id: 'abo-resilies' }) : null,
    carte('Conseils', h('ul', { class: 'abo-conseils' },
      h('li', {}, 'Fais le tour des abonnements de ton iPhone : Réglages → ton nom → Abonnements. On y trouve souvent un essai gratuit devenu payant.'),
      h('li', {}, 'Un seul service vidéo à la fois : abonne-toi le mois où une série sort, résilie juste après.'),
      h('li', {}, 'Préfère les versions gratuites avec publicités pour ce que tu utilises peu.'),
      h('li', {}, 'Un abonnement à moins de 2 utilisations par semaine coûte plus cher que de payer à l’usage.'))),
  ].filter(Boolean));
}

function retour() { return h('button', { class: 'lien retour', type: 'button', onclick: () => aller('accueil') }, icone('retour'), 'Accueil'); }

function feuilleAbonnement(x) {
  const s = x.service;
  const f = ouvrirFeuille({
    titre: x.nom,
    contenu: h('div', { class: 'formulaire' },
      h('div', { class: 'liste-cles' },
        h('div', { class: 'ligne-cle' }, h('span', {}, 'Prélèvement'), h('span', {}, mt(x.montantCentimes), ` ${x.frequence}`)),
        h('div', { class: 'ligne-cle' }, h('span', {}, 'Par mois'), mt(x.mensuelCentimes)),
        h('div', { class: 'ligne-cle forte' }, h('span', {}, 'Par an'), mt(x.annuelCentimes))),
      s ? h('p', {}, s.conseil) : h('p', {}, 'Demande-toi si tu l’as utilisé ce mois-ci. Sinon, résilie-le : tu pourras toujours le reprendre plus tard.'),
      s?.alternatives?.length ? h('div', {}, h('p', { class: 'champ-libelle' }, x.essentiel ? 'Pour payer moins' : 'Alternatives gratuites'), h('ul', { class: 'abo-alternatives' }, s.alternatives.map((t) => h('li', {}, t)))) : null),
    actions: [
      bouton('Garder', () => f.fermer()),
      bouton('Je l’ai résilié', async () => {
        const ok = await confirmer({ titre: `${x.nom} résilié ?`, message: `Il ne sera plus compté dans tes charges. Tu économises ${formatEuros(x.annuelCentimes)} par an.`, ok: 'Oui, résilié' });
        if (!ok) return;
        if (x.chargeFixeId) { const c = etat.chargesFixes.find((y) => y.id === x.chargeFixeId); if (c) await enregistrer('chargesFixes', { ...c, actif: false, resilieLe: aujourdhui() }); }
        await ecrireMeta('abonnementsResilies', { ...(etat.meta.abonnementsResilies || {}), [x.cle]: { nom: x.nom, mensuelCentimes: x.mensuelCentimes, annuelCentimes: x.annuelCentimes, le: aujourdhui() } }, { avertir: true });
        f.fermer(); toast(`${x.nom} résilié : ${formatEuros(x.annuelCentimes)} économisés par an.`, { type: 'succes' });
      }, { classe: 'btn-principal' }),
    ],
  });
}

function feuilleLimite(a) {
  const suggestion = Math.floor((a.aLimiterMensuelCentimes * 0.7) / 500) * 500;
  let valeur = etat.profil.plafondAbonnementsCentimes ?? suggestion;
  const f = ouvrirFeuille({
    titre: 'Limite pour tes abonnements',
    contenu: h('div', { class: 'formulaire' },
      h('p', { class: 'petit' }, `Tes abonnements à limiter coûtent ${formatEuros(a.aLimiterMensuelCentimes)} par mois. Une limite à ${formatEuros(suggestion)} (−30 %) est un bon début.`),
      champMontant({ valeur, onValeur: (v) => { valeur = v; }, label: 'Limite par mois' })),
    actions: [bouton('Annuler', () => f.fermer()), bouton('Enregistrer', async () => { await majProfil({ plafondAbonnementsCentimes: valeur ?? null }); f.fermer(); toast('Limite enregistrée.', { type: 'succes' }); }, { classe: 'btn-principal' })],
  });
}
