// budgets.js — enveloppes mensuelles, alertes 80/100 %, vases communicants, enveloppe « Plaisir sans culpabilité ».

import { h, icone, mt } from '../ui/dom.js';
import { carte, barre, bouton, champ, champMontant, etatVide, interrupteur, selectionner } from '../ui/composants.js';
import { ouvrirFeuille, confirmer } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { etat, enregistrer, enregistrerLot, supprimerObjet, nouvelId } from '../store.js';
import { periodeBudget, depensesVariables } from '../calculs.js';
import { aujourdhui, ajouterMois, dateDuMois, ajouterJours, formatMois } from '../dates.js';
import { formatEuros } from '../money.js';
import { categoriesDepense, nomCategorie } from '../categories.js';

export const titre = 'Budgets';

/** Plafond effectif du mois : plafond + vases communicants reçus − donnés. */
export function plafondEffectif(env, mois) {
  let p = env.plafondMensuelCentimes;
  for (const m of etat.mouvementsEnveloppes.filter((x) => x.mois === mois)) {
    if (m.versEnveloppeId === env.id) p += m.montantCentimes;
    if (m.deEnveloppeId === env.id) p -= m.montantCentimes;
  }
  return p;
}

export function consommation(env, periode) {
  const cats = env.categories || [env.categorie];
  return depensesVariables(etat, periode.debut, periode.fin, (t) => cats.includes(t.categorie));
}

/** Moyenne mensuelle réelle des 3 dernières périodes complètes (base des suggestions). */
export function moyenne3Mois(categories) {
  const p = periodeBudget(aujourdhui(), etat.profil);
  let total = 0;
  for (let k = 1; k <= 3; k++) {
    const debut = dateDuMois(ajouterMois(p.mois, -k), etat.profil.jourSalaireHabituel || 1);
    const fin = ajouterJours(dateDuMois(ajouterMois(p.mois, -k + 1), etat.profil.jourSalaireHabituel || 1), -1);
    total += depensesVariables(etat, debut, fin, (t) => categories.includes(t.categorie));
  }
  return Math.round(total / 3);
}

export function rendre(vue) {
  const p = periodeBudget(aujourdhui(), etat.profil);
  const env = etat.enveloppes;
  const lignes = env.map((e) => {
    const conso = consommation(e, p);
    const plafond = plafondEffectif(e, p.mois);
    const pct = plafond > 0 ? (conso / plafond) * 100 : 0;
    const depasse = conso > plafond;
    return h('div', { class: `enveloppe ${depasse ? 'depassee' : ''}` },
      h('button', { type: 'button', class: 'enveloppe-tete', onclick: () => editer(e) },
        h('span', { class: 'enveloppe-nom' }, e.nom, e.vitale ? h('span', { class: 'etiquette' }, 'vitale') : null, e.sanctuarisee ? h('span', { class: 'etiquette etiquette-plaisir' }, 'sans culpabilité') : null),
        h('span', {}, mt(conso), ' / ', mt(plafond))),
      barre(conso, plafond, { label: `${e.nom} : ${Math.round(pct)} %` }),
      h('p', { class: 'petit' }, (e.categories || [e.categorie]).map(nomCategorie).join(', ')),
      depasse && !e.sanctuarisee ? h('div', { class: 'vases' }, h('p', {}, icone('alerte'), ` Dépassement de ${formatEuros(conso - plafond)} : choisis l'enveloppe qui l'absorbe (ni le compte courant ni l'épargne).`), bouton('Choisir', () => vasesCommunicants(e, conso - plafond, p.mois), { classe: 'btn-principal btn-petit' }))
        : pct >= 80 && !e.sanctuarisee ? h('p', { class: 'petit orange-texte' }, icone('alerte'), ` ${Math.round(pct)} % utilisés : il reste ${formatEuros(plafond - conso)}.`) : null);
  });
  const totalPlafonds = env.reduce((s, e) => s + plafondEffectif(e, p.mois), 0);
  const totalConso = env.reduce((s, e) => s + consommation(e, p), 0);
  vue.replaceChildren(
    h('h1', { class: 'titre-page' }, 'Enveloppes'),
    h('p', { class: 'sous-titre-page' }, `${formatMois(p.mois).charAt(0).toUpperCase()}${formatMois(p.mois).slice(1)}, du ${p.debut.slice(8)}/${p.debut.slice(5, 7)} au ${p.fin.slice(8)}/${p.fin.slice(5, 7)}`),
    env.length ? carte(null, h('div', {}, h('div', { class: 'ligne-cle forte' }, h('span', {}, 'Total'), h('span', {}, mt(totalConso), ' / ', mt(totalPlafonds))), barre(totalConso, totalPlafonds))) : null,
    env.length ? h('div', { class: 'liste-enveloppes' }, lignes) : etatVide('balance', 'Pas encore d’enveloppe', 'Je peux te proposer des plafonds à partir de ta moyenne réelle des 3 derniers mois, réduite progressivement.'),
    h('div', { class: 'groupe-boutons' }, bouton('Suggérer des plafonds', suggerer, { classe: env.length ? 'btn-secondaire' : 'btn-principal', icone: 'ampoule' }), bouton('Nouvelle enveloppe', () => editer(null), { icone: 'plus' })));
}

function vasesCommunicants(env, depassement, mois) {
  const p = periodeBudget(aujourdhui(), etat.profil);
  const candidates = etat.enveloppes.filter((x) => x.id !== env.id).map((x) => ({ e: x, reste: plafondEffectif(x, mois) - consommation(x, p) })).filter((x) => x.reste > 0).sort((a, b) => (a.e.vitale ? 1 : 0) - (b.e.vitale ? 1 : 0) || b.reste - a.reste);
  if (!candidates.length) { toast('Aucune enveloppe n’a de reste : réduis une dépense ou ajuste les plafonds le mois prochain.', { type: 'erreur' }); return; }
  const f = ouvrirFeuille({
    titre: `Absorber ${formatEuros(depassement)}`,
    contenu: h('div', { class: 'liste' }, candidates.map(({ e, reste }) => h('button', { type: 'button', class: 'ligne-choix', onclick: async () => {
      const montant = Math.min(depassement, reste);
      await enregistrer('mouvementsEnveloppes', { id: nouvelId('vase'), mois, deEnveloppeId: e.id, versEnveloppeId: env.id, montantCentimes: montant });
      f.fermer();
      toast(`${formatEuros(montant)} pris sur « ${e.nom} ».${montant < depassement ? ' Il reste un dépassement : choisis une autre enveloppe.' : ''}`);
    } }, h('span', {}, e.nom, e.vitale ? h('small', {}, ' (vitale)') : null), h('span', {}, 'reste ', mt(reste))))),
  });
}

async function suggerer() {
  const groupes = [
    ['Courses', ['courses'], true],
    ['Repas dehors & livraison', ['restauration-rapide', 'livraison', 'restaurants'], false],
    ['Transports', ['transports', 'velo', 'vtc', 'train'], true],
    ['Hygiène & divers', ['beaute', 'pharmacie', 'sante', 'coiffeur', 'maison', 'autres'], true],
    ['Shopping', ['vetements', 'achats-en-ligne'], false],
    ['Sorties & loisirs', ['loisirs', 'voyages'], false],
  ];
  const propositions = groupes.map(([nom, cats, vitale]) => {
    const moy = moyenne3Mois(cats);
    const reduction = vitale ? 0.9 : 0.75; // on réduit davantage le non vital
    return { nom, cats, vitale, moyenne: moy, plafond: Math.max(1000, Math.round((moy * reduction) / 500) * 500) };
  });
  const ok = await confirmer({ titre: 'Plafonds suggérés', message: propositions.map((x) => `${x.nom} : ${formatEuros(x.plafond)} (moyenne ${formatEuros(x.moyenne)})`).join(' · ') + ' · Plaisir sans culpabilité : 50,00 €. Chaque mois, les plafonds non vitaux peuvent baisser encore de 10 %.', ok: 'Créer ces enveloppes' });
  if (!ok) return;
  const existants = new Set(etat.enveloppes.map((e) => e.nom));
  const nouvelles = propositions.filter((x) => !existants.has(x.nom)).map((x) => ({ id: nouvelId('env'), nom: x.nom, categories: x.cats, categorie: x.cats[0], plafondMensuelCentimes: x.plafond, vitale: x.vitale, sanctuarisee: false, report: false }));
  if (!existants.has('Plaisir sans culpabilité')) nouvelles.push({ id: nouvelId('env'), nom: 'Plaisir sans culpabilité', categories: ['plaisir'], categorie: 'plaisir', plafondMensuelCentimes: 5000, vitale: false, sanctuarisee: true, report: false });
  await enregistrerLot(nouvelles.map((v) => ({ collection: 'enveloppes', valeur: v })));
  toast(`${nouvelles.length} enveloppes créées.`, { type: 'succes' });
}

function editer(env) {
  const e = env ? { ...env, categories: [...(env.categories || [env.categorie])] } : { id: nouvelId('env'), nom: '', categories: [], plafondMensuelCentimes: 0, vitale: false, sanctuarisee: false, report: false };
  const nom = h('input', { class: 'input', value: e.nom, oninput: (x) => { e.nom = x.target.value; } });
  const plafond = champMontant({ valeur: e.plafondMensuelCentimes, onValeur: (v) => { e.plafondMensuelCentimes = v; } });
  const cats = h('div', { class: 'cases' }, categoriesDepense().map((c) => h('label', { class: 'case' }, h('input', { type: 'checkbox', checked: e.categories.includes(c.id), onchange: (x) => { e.categories = x.target.checked ? [...e.categories, c.id] : e.categories.filter((k) => k !== c.id); } }), c.nom)));
  const f = ouvrirFeuille({
    titre: env ? e.nom : 'Nouvelle enveloppe', plein: true,
    contenu: h('div', { class: 'formulaire' }, champ('Nom', nom), champ('Plafond mensuel', plafond),
      interrupteur('Enveloppe vitale', e.vitale, (v) => { e.vitale = v; }, 'Seules les enveloppes vitales restent affichées en fin de mois critique.'),
      interrupteur('Sans culpabilité (exclue des alertes bloquantes)', e.sanctuarisee, (v) => { e.sanctuarisee = v; }),
      h('fieldset', { class: 'champ' }, h('legend', {}, 'Catégories couvertes'), cats)),
    actions: [
      env ? bouton('Supprimer', async () => { f.fermer(); await supprimerObjet('enveloppes', e.id); toast('Enveloppe supprimée.'); }, { classe: 'btn-danger-texte' }) : bouton('Annuler', () => f.fermer()),
      bouton('Enregistrer', async () => {
        if (!e.nom.trim() || !e.categories.length || !(e.plafondMensuelCentimes >= 0)) { toast('Nom, plafond et au moins une catégorie.', { type: 'erreur' }); return; }
        e.categorie = e.categories[0];
        await enregistrer('enveloppes', e); f.fermer(); toast('Enveloppe enregistrée.', { type: 'succes' });
      }, { classe: 'btn-principal' }),
    ],
  });
}

export { selectionner };
