// depenses.js — Dépenses et Entrées : liste groupée par jour, recherche, filtres, détail, glisser pour agir.

import { h, icone, mt, annoncer } from '../ui/dom.js';
import { ligneTransaction, etatVide, segment, champ, champMontant, pastillesCategories, bouton, selectionner, interrupteur } from '../ui/composants.js';
import { ouvrirFeuille, confirmer } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { etat } from '../store.js';
import { CATEGORIES, categorie, natureTransaction, contributionDepense, categoriesDepense, categoriesEntree } from '../categories.js';
import { libelleRelatif, formatDate, aujourdhui, ajouterJours, estIso } from '../dates.js';
import { formatEuros } from '../money.js';
import { normaliserTexte } from '../rules.js';
import { modifierTransaction, supprimerTransaction, recategoriser, enregistrerReprise } from '../actions.js';
import { coutAnnuelRecurrent } from '../detecteurs.js';

export const titre = 'Dépenses';

const filtres = { texte: '', type: 'tout', categorie: '', periode: '90', compte: '', source: '', internes: false };
const TAILLE_LOT = 120;

export function rendre(vue) {
  const recherche = h('input', { type: 'search', class: 'input input-recherche', placeholder: 'Rechercher un marchand, un montant…', 'aria-label': 'Rechercher', value: filtres.texte, enterkeyhint: 'search' });
  const liste = h('div', { class: 'liste-jours', role: 'list' });
  const resume = h('p', { class: 'resume-filtres', 'aria-live': 'polite' });
  let attente;
  recherche.addEventListener('input', () => { clearTimeout(attente); attente = setTimeout(() => { filtres.texte = recherche.value; dessiner(); }, 180); });

  const typeSeg = segment([['tout', 'Tout'], ['debit', 'Dépenses'], ['credit', 'Entrées']], filtres.type, (v) => { filtres.type = v; dessiner(); }, 'Type');
  const boutonFiltres = h('button', { class: 'btn btn-secondaire btn-petit', type: 'button', onclick: () => feuilleFiltres(dessiner) }, icone('filtre'), h('span', {}, 'Filtres'));

  vue.replaceChildren(
    h('h1', { class: 'titre-page' }, 'Dépenses et entrées'),
    h('div', { class: 'barre-recherche' }, icone('recherche'), recherche),
    h('div', { class: 'barre-filtres' }, typeSeg, boutonFiltres),
    resume, liste);

  function dessiner() {
    const tx = filtrer();
    const total = tx.reduce((s, t) => s + contributionDepense(t), 0);
    resume.textContent = `${tx.length.toLocaleString('fr-FR')} opération${tx.length > 1 ? 's' : ''}${filtres.internes ? '' : ' (virements internes masqués)'} · dépenses nettes ${formatEuros(total)}`;
    if (!tx.length) {
      liste.replaceChildren(etatVide('liste', 'Aucune opération', etat.transactions.length ? 'Aucun résultat avec ces filtres.' : 'Ajoute une dépense avec le bouton + ou importe un relevé dans Réglages.'));
      return;
    }
    // Groupement par jour, rendu par lots (fluide même avec plusieurs milliers de lignes)
    const jours = new Map();
    for (const t of tx) { if (!jours.has(t.date)) jours.set(t.date, []); jours.get(t.date).push(t); }
    const entrees = [...jours.entries()];
    liste.replaceChildren();
    let i = 0;
    const sentinelle = h('div', { class: 'sentinelle', 'aria-hidden': 'true' });
    const lot = () => {
      const frag = document.createDocumentFragment();
      let n = 0;
      while (i < entrees.length && n < TAILLE_LOT) {
        const [date, lignes] = entrees[i++];
        n += lignes.length;
        const totalJour = lignes.reduce((s, t) => s + contributionDepense(t), 0);
        frag.append(h('section', { class: 'groupe-jour', role: 'listitem', 'aria-label': libelleRelatif(date) },
          h('h2', { class: 'groupe-jour-entete' }, h('span', {}, libelleRelatif(date)), h('span', { class: 'groupe-jour-total' }, totalJour ? mt(totalJour) : '')),
          lignes.map((t) => glissable(ligneTransaction(t, ouvrirDetail), t, dessiner))));
      }
      sentinelle.remove();
      liste.append(frag);
      if (i < entrees.length) { liste.append(sentinelle); observateur.observe(sentinelle); }
    };
    const observateur = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { observateur.disconnect(); lot(); } }, { rootMargin: '800px' });
    lot();
  }
  dessiner();
}

function filtrer() {
  const t = normaliserTexte(filtres.texte);
  const depuis = filtres.periode === 'tout' ? '0000-00-00' : ajouterJours(aujourdhui(), -Number(filtres.periode));
  const montantCherche = /^\d+([.,]\d{1,2})?$/.test(filtres.texte.trim()) ? filtres.texte.trim().replace('.', ',') : null;
  return etat.transactions.filter((x) => {
    if (x.date < depuis) return false;
    const n = natureTransaction(x);
    if (!filtres.internes && (n === 'interne' || x.ajustement)) return false;
    if (filtres.type !== 'tout' && x.sens !== filtres.type) return false;
    if (filtres.categorie && x.categorie !== filtres.categorie) return false;
    if (filtres.compte && x.compteId !== filtres.compte) return false;
    if (filtres.source && x.source !== filtres.source) return false;
    if (t) {
      const cible = normaliserTexte(`${x.libelle} ${x.marchand} ${x.libellePrincipal} ${categorie(x.categorie).nom}`);
      if (!cible.includes(t) && !(montantCherche && formatEuros(x.montantCentimes).includes(montantCherche))) return false;
    }
    return true;
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.creeLe < b.creeLe ? 1 : -1)));
}

function feuilleFiltres(apres) {
  const cats = [['', 'Toutes les catégories'], ...CATEGORIES.map((c) => [c.id, c.nom])];
  const f = ouvrirFeuille({
    titre: 'Filtres',
    contenu: h('div', { class: 'formulaire' },
      champ('Catégorie', selectionner(cats, filtres.categorie, (v) => { filtres.categorie = v; })),
      champ('Période', selectionner([['30', '30 derniers jours'], ['90', '3 derniers mois'], ['365', '12 derniers mois'], ['tout', 'Tout']], filtres.periode, (v) => { filtres.periode = v; })),
      champ('Compte', selectionner([['', 'Tous les comptes'], ...etat.comptes.map((c) => [c.id, c.nom])], filtres.compte, (v) => { filtres.compte = v; })),
      champ('Source', selectionner([['', 'Toutes'], ['import', 'Relevé importé'], ['texte', 'Clavier'], ['voix', 'Voix'], ['photo', 'Ticket photo'], ['confirmation', 'Confirmation']], filtres.source, (v) => { filtres.source = v; })),
      interrupteur('Afficher les virements internes', filtres.internes, (v) => { filtres.internes = v; })),
    actions: [bouton('Réinitialiser', () => { Object.assign(filtres, { categorie: '', periode: '90', compte: '', source: '', internes: false }); f.fermer(); }), bouton('Appliquer', () => f.fermer(), { classe: 'btn-principal' })],
    onFermer: apres,
  });
}

/** Glisser une ligne vers la gauche : Supprimer / Catégoriser. */
function glissable(ligne, tx, apres) {
  const actions = h('div', { class: 'actions-glisse', 'aria-hidden': 'true' },
    h('button', { class: 'act-cat', type: 'button', tabindex: '-1', onclick: () => feuilleCategorie(tx) }, icone('crayon'), 'Catégorie'),
    h('button', { class: 'act-suppr', type: 'button', tabindex: '-1', onclick: () => suppression(tx, apres) }, icone('corbeille'), 'Supprimer'));
  const enveloppe = h('div', { class: 'glisse' }, actions, ligne);
  let x0 = null; let y0 = null; let dx = 0; let horizontal = null;
  ligne.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; horizontal = null; ligne.style.transition = 'none'; }, { passive: true });
  ligne.addEventListener('touchmove', (e) => {
    if (x0 === null) return;
    const ddx = e.touches[0].clientX - x0; const ddy = e.touches[0].clientY - y0;
    if (horizontal === null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) horizontal = Math.abs(ddx) > Math.abs(ddy);
    if (!horizontal) return;
    dx = Math.min(0, Math.max(-176, ddx + (enveloppe.classList.contains('ouverte') ? -176 : 0)));
    ligne.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  ligne.addEventListener('touchend', () => {
    ligne.style.transition = '';
    if (horizontal) {
      const ouvrir = dx < -70;
      enveloppe.classList.toggle('ouverte', ouvrir);
      ligne.style.transform = ouvrir ? 'translateX(-176px)' : '';
      for (const b of actions.querySelectorAll('button')) b.tabIndex = ouvrir ? 0 : -1;
    }
    x0 = null;
  });
  ligne.addEventListener('click', (e) => { if (enveloppe.classList.contains('ouverte')) { e.stopImmediatePropagation(); enveloppe.classList.remove('ouverte'); ligne.style.transform = ''; } }, true);
  return enveloppe;
}

async function suppression(tx, apres) {
  const annuler = await supprimerTransaction(tx);
  apres?.();
  toast(`« ${tx.libelle} » supprimée.`, { action: { libelle: 'Annuler', fn: async () => { await annuler(); apres?.(); } } });
}

function feuilleCategorie(tx) {
  const ids = (tx.sens === 'credit' ? [...categoriesEntree(), ...categoriesDepense()] : categoriesDepense()).map((c) => c.id);
  const f = ouvrirFeuille({ titre: `Catégorie : ${tx.libelle}`, contenu: pastillesCategories(ids, tx.categorie, async (id) => { f.fermer(); await appliquerCategorie(tx, id); }) });
}

async function appliquerCategorie(tx, id) {
  const { similaires } = await modifierTransaction(tx, { categorie: id, aQualifier: false });
  annoncer(`Catégorie ${categorie(id).nom} enregistrée`);
  if (similaires.length) {
    const ok = await confirmer({ titre: 'Règle mémorisée', message: `Les prochaines opérations « ${tx.marchand} » seront classées en « ${categorie(id).nom} ». Appliquer aussi aux ${similaires.length} opérations similaires déjà enregistrées ?`, ok: 'Appliquer', annuler: 'Non merci' });
    if (ok) { await recategoriser(similaires, id); toast(`${similaires.length} opérations recatégorisées.`, { type: 'succes' }); }
  } else toast('Règle mémorisée pour ce marchand.', { type: 'succes' });
}

/** Détail d'une opération : modification, suppression, articles d'un ticket, coût annuel. */
export function ouvrirDetail(tx) {
  const c = categorie(tx.categorie);
  let montant = tx.montantCentimes; let libelle = tx.libelle; let date = tx.date; let cat = tx.categorie; let justification = tx.justificationCentimes ?? null;
  const n = natureTransaction(tx);
  const recurrent = n === 'depense' ? coutAnnuelRecurrent(etat, tx.marchand, aujourdhui()) : null;
  const compte = etat.comptes.find((x) => x.id === tx.compteId);
  const infos = h('div', { class: 'liste-cles' },
    ligne('Compte', compte?.nom || '—'),
    tx.libellePrincipal && tx.libellePrincipal !== tx.libelle ? ligne('Libellé bancaire', tx.libellePrincipal) : null,
    tx.dateComptable && tx.dateComptable !== tx.date ? ligne('Date comptable', formatDate(tx.dateComptable)) : null,
    ligne('Source', { import: 'Relevé importé', texte: 'Clavier', voix: 'Voix', photo: 'Ticket photo', confirmation: 'Confirmation', ajustement: 'Ajustement', bridge: 'Autre app' }[tx.source] || tx.source),
    n === 'interne' ? ligne('Nature', 'Virement interne (exclu des dépenses et revenus)') : null,
    n === 'epargne' ? ligne('Nature', tx.sens === 'debit' ? 'Versement vers l’épargne' : 'Reprise d’épargne') : null,
    tx.optionSystemEpargneCentimes ? ligne("Arrondi System'Épargne (information)", formatEuros(tx.optionSystemEpargneCentimes)) : null,
    tx.remboursementDe ? ligne('Remboursement de', etat.transactions.find((x) => x.id === tx.remboursementDe)?.libelle || 'achat d’origine') : null,
    tx.regleRevolut ? ligne('Règle appliquée', 'Virement 10–18 € à un particulier = commande Uber Eats via un tiers') : null);
  const articles = tx.articles?.length ? h('div', { class: 'articles' }, h('h3', {}, 'Articles du ticket'), tx.articles.map((a) => h('div', { class: 'ligne-cle' }, h('span', {}, `${a.quantite > 1 ? a.quantite + ' × ' : ''}${a.nom}${a.sucre ? ' · sucré' : ''}${a.typeMarque === 'nationale' ? ' · marque nationale' : ''}`), mt(a.prixCentimes)))) : null;
  const editable = !tx.ajustement;
  const champs = editable ? h('div', { class: 'formulaire' },
    champ('Montant', champMontant({ valeur: montant, onValeur: (v) => { montant = v; } })),
    champ('Libellé', h('input', { class: 'input', value: libelle, oninput: (e) => { libelle = e.target.value; } })),
    champ('Date', h('input', { class: 'input', type: 'date', value: date, oninput: (e) => { date = e.target.value; } })),
    champ('Catégorie', selectionner(CATEGORIES.filter((x) => x.id !== 'ajustement').map((x) => [x.id, x.nom]), cat, (v) => { cat = v; })),
    tx.categorie === 'especes' && tx.sens === 'debit' ? champ('Montant justifié (ce que ce retrait a payé)', champMontant({ valeur: justification, onValeur: (v) => { justification = v; } }), 'Les espèces non justifiées sont signalées dans le bilan.') : null) : h('p', { class: 'texte-feuille' }, 'Cette ligne aligne le solde affiché sur ton solde réel. Elle est exclue des dépenses et des revenus et se recalcule à chaque import.');
  const f = ouvrirFeuille({
    titre: tx.libelle,
    contenu: h('div', {},
      h('div', { class: 'detail-entete' }, h('span', { class: 'puce-cat grande', style: { '--c': c.couleur } }, icone(c.icone)), h('p', { class: `detail-montant ${tx.sens}` }, tx.sens === 'credit' ? '+' : '−', mt(tx.montantCentimes)), h('p', { class: 'petit' }, `${c.nom} · ${libelleRelatif(tx.date)}`)),
      recurrent ? h('p', { class: 'cout-annuel' }, icone('boucle'), ` ${recurrent.passages} fois en 30 jours : ${formatEuros(recurrent.moyenCentimes)} × ${String(recurrent.parSemaine).replace('.', ',')} fois/semaine ≈ ${formatEuros(recurrent.annuelCentimes)} par an`) : null,
      infos, articles, champs,
      n === 'epargne' && tx.sens === 'credit' ? bouton('Signaler comme reprise d’épargne', async () => { await enregistrerReprise(tx); toast('Reprise enregistrée.'); }) : null),
    actions: editable ? [
      bouton('Supprimer', async () => { f.fermer(); await suppression(tx); }, { classe: 'btn-danger-texte', icone: 'corbeille' }),
      bouton('Enregistrer', async () => {
        if (montant === null || montant <= 0) { toast('Montant invalide.', { type: 'erreur' }); return; }
        if (!estIso(date)) { toast('Date invalide.', { type: 'erreur' }); return; }
        const changements = { montantCentimes: montant, libelle, date };
        if (justification !== null) changements.justificationCentimes = justification;
        f.fermer();
        if (cat !== tx.categorie) { await modifierTransaction(tx, changements); await appliquerCategorie({ ...tx, ...changements }, cat); }
        else { await modifierTransaction(tx, changements); toast('Modifications enregistrées.', { type: 'succes' }); }
      }, { classe: 'btn-principal' }),
    ] : null,
  });
}

function ligne(l, v) { return h('div', { class: 'ligne-cle' }, h('span', {}, l), h('span', { class: 'ligne-cle-valeur' }, v)); }
