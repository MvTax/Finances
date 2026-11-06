// avenir.js — « Dépenses à venir » : tout ce qui va partir d'ici le salaire (prélèvements, abonnements,
// remboursements, dépenses que tu as prévues). Tout est déjà retiré du budget du jour.
// Une dépense prévue est ajoutée à la main ; elle disparaît d'elle-même quand elle est retrouvée dans tes opérations.

import { h, icone, mt } from '../ui/dom.js';
import { carte, bouton, champ, champMontant, selectionner, etatVide } from '../ui/composants.js';
import { ouvrirFeuille, confirmer } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { etat, enregistrer, supprimerObjet, nouvelId } from '../store.js';
import { aller } from '../router.js';
import { periodeBudget, chargesFixesPeriode, abonnementsAVenir, dettesPeriode, depensesPrevuesPeriode } from '../calculs.js';
import { aujourdhui, ajouterJours, diffJours, formatDateCourte } from '../dates.js';
import { formatEuros } from '../money.js';
import { categoriesDepense, categorie } from '../categories.js';

export const titre = 'Dépenses à venir';

/** Tout ce qui part d'ici la fin de la période (salaire suivant), trié par date. */
export function aVenir(etat, auj = aujourdhui()) {
  const per = periodeBudget(auj, etat.profil || {});
  const items = [];
  for (const c of chargesFixesPeriode(etat, per)) if (!c.payee) items.push({ type: 'prelevement', libelle: c.libelle, date: c.date, montantCentimes: c.montantPrevuCentimes, categorie: c.categorie });
  for (const a of abonnementsAVenir(etat, per, auj)) items.push({ type: 'prelevement', libelle: a.libelle, date: a.date, montantCentimes: a.montantPrevuCentimes, categorie: 'abonnements' });
  for (const d of dettesPeriode(etat, per)) if (!d.payee) items.push({ type: 'dette', libelle: d.libelle, date: d.date, montantCentimes: d.montantCentimes, categorie: 'credits' });
  const prevuesPeriode = depensesPrevuesPeriode(etat, per);
  for (const d of prevuesPeriode) if (!d.realisee) items.push({ type: 'prevue', prevue: d, libelle: d.libelle, date: d.date, montantCentimes: d.montantCentimes, categorie: d.categorie || 'autres' });
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.montantCentimes - a.montantCentimes));
  const plusTard = (etat.depensesPrevues || []).filter((d) => d.date > per.fin && !d.faite).sort((a, b) => (a.date < b.date ? -1 : 1));
  const faites = prevuesPeriode.filter((d) => d.realisee);
  return { periode: per, items, totalCentimes: items.reduce((s, x) => s + x.montantCentimes, 0), plusTard, faites };
}

const TYPES = { prelevement: 'Prélèvement', dette: 'Remboursement', prevue: 'Prévue' };
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dans = (n) => (n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : `dans ${n} jours`);

export function rendre(vue) {
  const auj = aujourdhui();
  const a = aVenir(etat, auj);
  const salaire = formatDateCourte(a.periode.salaireAttenduLe || ajouterJours(a.periode.fin, 1));
  const ligne = (x) => {
    const passe = x.date < auj;
    const contenu = [
      h('span', { class: 'avenir-date' }, h('strong', {}, x.date === auj ? 'Auj.' : x.date.slice(8, 10)), h('small', {}, x.date === auj ? '' : MOIS_COURTS[Number(x.date.slice(5, 7)) - 1])),
      h('span', { class: 'avenir-texte' },
        h('span', { class: 'avenir-libelle' }, x.libelle),
        h('small', {}, h('span', { class: `avenir-type avenir-${x.type}` }, TYPES[x.type]), ' ', passe ? 'date passée, pas encore vue sur tes opérations' : dans(diffJours(auj, x.date)))),
      h('span', { class: 'avenir-montant' }, '−', mt(x.montantCentimes)),
    ];
    return x.type === 'prevue'
      ? h('button', { type: 'button', class: 'avenir-ligne cliquable', onclick: () => feuillePrevue(x.prevue), 'aria-label': `${x.libelle}, ${formatEuros(x.montantCentimes)}, le ${formatDateCourte(x.date)} : modifier` }, ...contenu)
      : h('div', { class: 'avenir-ligne' }, ...contenu);
  };
  vue.replaceChildren(
    h('button', { class: 'lien retour', type: 'button', onclick: () => aller('depenses') }, icone('retour'), 'Dépenses'),
    h('h1', { class: 'titre-page' }, 'Dépenses à venir'),
    carte(null, h('div', { class: 'avenir-total' },
      h('p', { class: 'petit' }, `D’ici le salaire du ${salaire}`),
      h('p', { class: 'grand-montant' }, mt(a.totalCentimes)),
      h('p', { class: 'petit' }, 'Tout est déjà réservé : ces montants ne sont pas dans ton budget du jour, tu n’as rien à mettre de côté toi-même. Une dépense que tu prévois passe avant l’épargne.'),
      bouton('Prévoir une dépense', () => feuillePrevue(), { classe: 'btn-principal', icone: 'plus' }))),
    carte('D’ici le salaire', a.items.length ? h('div', { class: 'avenir-liste' }, a.items.map(ligne)) : etatVide('calendrier', 'Rien à venir', 'Aucun prélèvement ni remboursement d’ici le salaire.')),
    a.plusTard.length ? carte('Plus tard', h('div', {}, h('p', { class: 'petit' }, 'Réservées dans le budget de leur mois.'),
      h('div', { class: 'avenir-liste' }, a.plusTard.map((d) => ligne({ type: 'prevue', prevue: d, libelle: d.libelle, date: d.date, montantCentimes: d.montantCentimes }))))) : '',
    a.faites.length ? h('details', { class: 'details-discret' }, h('summary', {}, `Déjà faites ce mois-ci (${a.faites.length})`),
      h('div', { class: 'liste-cles' }, a.faites.map((d) => h('div', { class: 'ligne-cle' }, h('span', {}, `${formatDateCourte(d.date)} · ${d.libelle}${d.transactionId ? ' (retrouvée dans tes opérations)' : ''}`), mt(d.montantCentimes))))) : '',
  );
}

/** Ajout ou modification d'une dépense prévue. */
export function feuillePrevue(existante = null) {
  const auj = aujourdhui();
  const d = existante ? { ...existante } : { libelle: '', montantCentimes: null, date: ajouterJours(auj, 7), categorie: 'autres', compteId: (etat.comptes.find((c) => c.type === 'courant' && c.banque !== 'autre') || etat.comptes[0])?.id || null };
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true });
  const cats = categoriesDepense().map((c) => [c.id, c.nom]);
  const enregistrerPrevue = async () => {
    if (!d.libelle.trim()) { erreur.hidden = false; erreur.textContent = 'Donne un nom à cette dépense.'; return; }
    if (!d.montantCentimes || d.montantCentimes <= 0) { erreur.hidden = false; erreur.textContent = 'Indique un montant.'; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) { erreur.hidden = false; erreur.textContent = 'Indique une date.'; return; }
    await enregistrer('depensesPrevues', { id: d.id || nouvelId('prev'), libelle: d.libelle.trim(), montantCentimes: d.montantCentimes, date: d.date, categorie: d.categorie || 'autres', compteId: d.compteId || null, faite: !!d.faite });
    f.fermer();
    toast(existante ? 'Dépense prévue modifiée.' : `Dépense prévue : ${formatEuros(d.montantCentimes)} le ${formatDateCourte(d.date)}, réservée dans ton budget.`, { type: 'succes' });
  };
  const f = ouvrirFeuille({
    titre: existante ? 'Dépense prévue' : 'Prévoir une dépense',
    contenu: h('div', { class: 'formulaire' },
      h('p', { class: 'petit' }, 'Elle est réservée tout de suite : elle passe avant l’épargne, puis avant ton budget du jour si l’épargne ne suffit pas. Quand tu la paies, l’app la retrouve dans tes opérations et ne la compte pas deux fois.'),
      champ('Quoi', h('input', { class: 'input', value: d.libelle, placeholder: 'Anniversaire, billet de train, contrôle technique…', autocomplete: 'off', oninput: (e) => { d.libelle = e.target.value; } })),
      h('div', { class: 'deux-colonnes' },
        champ('Montant', champMontant({ valeur: d.montantCentimes, onValeur: (v) => { d.montantCentimes = v; } })),
        champ('Date', h('input', { class: 'input', type: 'date', value: d.date, min: existante ? null : auj, onchange: (e) => { d.date = e.target.value; } }))),
      champ('Catégorie', selectionner(cats, d.categorie, (v) => { d.categorie = v; })),
      etat.comptes.length > 1 ? champ('Compte', selectionner(etat.comptes.map((c) => [c.id, c.nom]), d.compteId, (v) => { d.compteId = v; })) : null,
      erreur),
    actions: [
      existante ? bouton('Supprimer', async () => {
        const ok = await confirmer({ titre: 'Supprimer cette dépense prévue ?', message: `« ${existante.libelle} » ne sera plus réservée dans ton budget.`, ok: 'Supprimer', danger: true });
        if (!ok) return;
        await supprimerObjet('depensesPrevues', existante.id); f.fermer(); toast('Dépense prévue supprimée.');
      }, { classe: 'btn-danger-texte' }) : bouton('Annuler', () => f.fermer()),
      existante && !existante.faite ? bouton('Déjà payée', async () => { await enregistrer('depensesPrevues', { ...existante, faite: true }); f.fermer(); toast('Notée comme payée : elle n’est plus réservée.', { type: 'succes' }); }) : null,
      bouton('Enregistrer', enregistrerPrevue, { classe: 'btn-principal' }),
    ].filter(Boolean),
  });
  return f;
}

export { diffJours, categorie };
