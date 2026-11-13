// fiches.js (v100) — les fiches d'explication. L'Accueil ne montre que le chiffre ; le « ? » ouvre la fiche :
// une phrase, un schéma, le calcul ligne par ligne, les statistiques, et un lien vers l'outil complet.

import { h, icone, mt, estMasque } from '../../ui/dom.js';
import { ouvrirFeuille } from '../../ui/sheet.js';
import { etat } from '../../store.js';
import { aller } from '../../router.js';
import { resteADepenser, jaugeDuJour, depensesVariables, estDepenseQuotidienne } from '../../calculs.js';
import { contributionDepense, nomCategorie } from '../../categories.js';
import { soldePoche, arrondiTransaction } from '../../epargne.js';
import { aVirerEpargne, JOURS_PAR_VIREMENT } from '../../virements.js';
import { partsReste, repartirReste, fluxEnvies } from '../../envies.js';
import { aujourdhui, formatDateCourte, formatJourLong, formatMois, JOURS_COURTS, JOURS_LONGS } from '../../dates.js';
import { formatEuros } from '../../money.js';
import { cascade, partage, fourchette, barres, barreRepere, etincelle } from '../ui/graphes.js';
import { statsDepenses, contexteDepense, previsionMois } from '../strategie/stats.js';
import { suiviEnveloppes } from '../strategie/enveloppes.js';
import { projeter } from '../strategie/projection.js';

const eur = (c) => (estMasque() ? '•••,•• €' : formatEuros(c));
const rond = (c) => (estMasque() ? '••• €' : formatEuros(c, { sansCentimes: true }));
const court = (c) => (estMasque() ? '••' : `${Math.round(c / 100)} €`);

/** Le « ? » : petit bouton rond qui ouvre une fiche. */
export function boutonQ(libelle, ouvrir) {
  return h('button', { type: 'button', class: 'q', 'aria-label': `Plus d’explications : ${libelle}`, onclick: (e) => { e.stopPropagation(); e.preventDefault(); ouvrir(); } }, '?');
}

const bloc = (titre, ...enfants) => h('section', { class: 'fiche-bloc' }, h('h3', { class: 'fiche-sous-titre' }, titre), ...enfants.flat().filter(Boolean));
const lignes = (liste) => h('div', { class: 'liste-cles' }, liste.filter(Boolean).map(([l, v, cls]) => h('div', { class: `ligne-cle ${cls || ''}` }, h('span', {}, l), typeof v === 'number' ? mt(v) : h('span', {}, v))));
const chiffres = (...cases) => h('div', { class: 'kpis' }, cases.filter(Boolean).map(([nom, valeur, note, classe]) => h('div', { class: `kpi ${classe || ''}` }, h('small', {}, nom), h('strong', {}, valeur), note ? h('em', {}, note) : null)));

/** Ouvre une fiche : résumé en une phrase, blocs, puis liens vers les outils. */
function ouvrirFiche({ titre, resume, blocs, liens = [] }) {
  let f;
  const lien = ([libelle, route]) => h('button', { type: 'button', class: 'btn btn-secondaire', onclick: () => { f.fermer(); aller(route); } }, h('span', {}, libelle), icone('suivant'));
  f = ouvrirFeuille({
    titre,
    contenu: h('div', { class: 'fiche' },
      h('p', { class: 'fiche-resume' }, resume),
      ...blocs.filter(Boolean),
      liens.length ? h('div', { class: 'fiche-liens' }, liens.map(lien)) : null),
  });
  return f;
}

/** Barres « par jour de la semaine » avec la part du jour en repère. */
function schemaSemaine(st, partCentimes) {
  return barres({
    valeurs: st.parJourSemaine.map((x) => ({ nom: JOURS_COURTS[x.jour - 1].replace('.', ''), valeur: x.moyenneCentimes, vide: !x.n, fort: st.jourCher?.jour === x.jour })),
    format: court, repere: partCentimes > 0 ? { valeur: partCentimes, texte: `ta part : ${court(partCentimes)}` } : null,
    description: `Dépense moyenne par jour de la semaine. ${st.jourCher ? `Le ${JOURS_LONGS[st.jourCher.jour - 1]} est le plus cher : ${formatEuros(st.jourCher.moyenneCentimes)}.` : ''}`,
  });
}

const phraseTendance = (t) => (t.sens === 'stable' ? 'Ton rythme est stable depuis 4 semaines.'
  : `Tes dépenses ${t.sens === 'hausse' ? 'montent' : 'baissent'} d’environ ${eur(Math.abs(t.parSemaineCentimes))} par jour, chaque semaine.`);

const phraseProba = (p) => {
  const n = Math.round(p.probaTenir * 10);
  if (p.attenduCentimes >= 0 && n >= 9) return 'À ce rythme, tu finis le mois sans dépasser, presque à coup sûr.';
  if (n <= 1) return 'À ce rythme, le mois sera dépassé, presque à coup sûr.';
  return `À ce rythme, tu as ${n} chances sur 10 de finir le mois sans dépasser.`;
};

// ---------- Aujourd'hui ----------

/** Pourquoi ce montant aujourd'hui : du salaire jusqu'à la part du jour, puis ce qui est déjà parti. */
export function ficheJour() {
  const auj = aujourdhui();
  const r = resteADepenser(etat, auj);
  const j = jaugeDuJour(etat, auj, etat.meta?.jauge || null);
  const st = statsDepenses(etat, auj);
  const base = j.instantane?.baseCentimes ?? r.resteCentimes + j.depensesDuJourCentimes;
  const revenus = r.revenus.totalCentimes;
  // « Déjà dépensé ce mois-ci » est le solde des autres lignes : la cascade retombe toujours au centime
  const dejaParti = revenus - r.chargesCentimes - r.dettesCentimes - r.prevuesCentimes - r.epargneCibleCentimes - base;
  const dispo = j.restantAujourdhuiCentimes;
  const sousPart = st.serie.filter((x) => x.centimes <= j.parJourCentimes).length;
  ouvrirFiche({
    titre: 'Ce que tu peux dépenser aujourd’hui',
    resume: dispo >= 0 ? `Il te reste ${eur(dispo)} aujourd’hui, sur ${eur(j.parJourCentimes)}.` : `Tu as dépassé ta part du jour de ${eur(-dispo)}. Demain repart sur une nouvelle part.`,
    blocs: [
      bloc('D’où vient ta part du jour',
        cascade({ format: rond, description: 'Du revenu du mois jusqu’à ce qu’il reste pour vivre', etapes: [
          { nom: 'Tes revenus du mois', centimes: revenus, type: 'total' },
          { nom: 'Charges fixes', centimes: r.chargesCentimes, type: 'moins' },
          r.dettesCentimes ? { nom: 'Crédits et remboursements', centimes: r.dettesCentimes, type: 'moins' } : null,
          r.prevuesCentimes ? { nom: 'Dépenses prévues', centimes: r.prevuesCentimes, type: 'moins' } : null,
          r.epargneCibleCentimes ? { nom: 'Épargne du mois', centimes: r.epargneCibleCentimes, type: 'moins' } : null,
          dejaParti > 0 ? { nom: 'Déjà dépensé ou mis de côté', centimes: dejaParti, type: 'moins' } : null,
          { nom: 'Reste pour vivre, ce matin', centimes: Math.max(0, base), type: 'total' },
        ].filter(Boolean) }),
        lignes([
          ['Reste pour vivre, ce matin', base],
          ['÷ jours jusqu’au salaire', String(j.joursRestants)],
          ['= ta part du jour', j.parJourCentimes, 'forte'],
          ['− dépensé aujourd’hui (arrondis et privations compris)', j.depensesDuJourCentimes],
          [dispo >= 0 ? '= reste aujourd’hui' : '= dépassement', Math.abs(dispo), 'forte'],
        ])),
      st.jours ? bloc('Tes habitudes',
        chiffres(
          ['EN MOYENNE', eur(st.recents.moyenne), 'par jour, sur 4 semaines', st.recents.moyenne > j.parJourCentimes ? 'or' : 'vert'],
          ['UN JOUR NORMAL', eur(st.recents.mediane), 'la moitié de tes jours sont en dessous'],
          ['SOUS TA PART', `${sousPart} j sur ${st.jours}`, 'jours finis sous la part d’aujourd’hui'],
          ['SANS DÉPENSE', `${st.joursSansDepense} j`, `sur ${st.jours} jours`]),
        schemaSemaine(st, j.parJourCentimes),
        h('p', { class: 'note' }, [st.jourCher ? `Ton jour le plus cher : le ${JOURS_LONGS[st.jourCher.jour - 1]} (${eur(st.jourCher.moyenneCentimes)} en moyenne). ` : '', phraseTendance(st.tendance), st.fiable ? '' : ' Peu de jours observés : ces chiffres vont s’affiner.'].join(''))) : null,
      h('p', { class: 'note' }, 'La journée va de 5 h du matin à 5 h le lendemain. Ce que tu ne dépenses pas part à l’épargne le lendemain à 5 h.'),
    ],
    liens: [['Toutes mes habitudes', 'strategie/habitudes'], ['Mon compte jusqu’au salaire', 'strategie/tresorerie']],
  });
}

// ---------- Ce mois-ci ----------

export function ficheMois() {
  const auj = aujourdhui();
  const r = resteADepenser(etat, auj);
  const j = jaugeDuJour(etat, auj, etat.meta?.jauge || null);
  const st = statsDepenses(etat, auj);
  const p = st.prevision;
  const depense = depensesVariables(etat, r.periode.debut, auj);
  const depasse = r.resteCentimes < 0;
  ouvrirFiche({
    titre: 'Ton mois',
    resume: depasse ? `Le budget du mois est dépassé de ${eur(-r.resteCentimes)}. Chaque jour sans dépense te ramène vers zéro.`
      : `Il te reste ${eur(r.resteCentimes)} pour ${j.joursRestants} jour${j.joursRestants > 1 ? 's' : ''}, jusqu’au ${formatDateCourte(r.periode.fin)}.`,
    blocs: [
      st.jours && p.joursRestants > 0 ? bloc('Où tu finiras, à ton rythme',
        fourchette({ bas: p.basCentimes, attendu: p.attenduCentimes, haut: p.hautCentimes, format: rond, description: `Fin de mois probable : ${formatEuros(p.attenduCentimes)}, entre ${formatEuros(p.basCentimes)} et ${formatEuros(p.hautCentimes)}` }),
        h('p', { class: 'note' }, `${phraseProba(p)} La fourchette couvre 8 cas sur 10, d’après tes ${Math.min(28, st.jours)} derniers jours.${p.fiable ? '' : ' Peu de jours observés : prends-la comme un ordre de grandeur.'}`)) : null,
      bloc('Le calcul', lignes([
        ['Dépensé depuis le salaire', depense],
        ['Reste du mois', r.resteCentimes, 'forte'],
        ['Jours après aujourd’hui', String(p.joursRestants)],
        st.jours ? ['Ton rythme (moyenne sur 4 semaines)', `${eur(p.rythmeCentimes)} par jour`] : null,
        ['Le rythme à ne pas dépasser', `${eur(p.rythmeMaxCentimes)} par jour`],
        st.jours ? ['= fin de mois probable', p.attenduCentimes, 'forte'] : null,
      ])),
      st.jours ? h('p', { class: 'note' }, phraseTendance(st.tendance)) : null,
    ],
    liens: [['Mon compte jour par jour', 'strategie/tresorerie'], ['Mes catégories', 'strategie/categories']],
  });
}

// ---------- Épargne ----------

/** Total affiché sur l'Accueil : ce qui est viré sur chaque épargne + ce qui attend le prochain virement. */
export function totalEpargne(auj = aujourdhui()) {
  const actives = etat.poches.filter((p) => p.actif !== false);
  const v = aVirerEpargne(etat, auj);
  const attente = (id) => v.parPoche.find((x) => x.pocheId === id)?.montantCentimes || 0;
  const poches = actives.map((p) => ({ poche: p, soldeCentimes: soldePoche(p), attenteCentimes: attente(p.id) }));
  const vire = poches.reduce((t, x) => t + x.soldeCentimes, 0);
  const aVirer = poches.reduce((t, x) => t + x.attenteCentimes, 0);
  return { poches, vireCentimes: vire, aVirerCentimes: aVirer, totalCentimes: vire + aVirer, virement: v };
}

export function ficheEpargne() {
  const auj = aujourdhui();
  const t = totalEpargne(auj);
  const v = t.virement;
  const j = jaugeDuJour(etat, auj, etat.meta?.jauge || null);
  const parts = partsReste(etat);
  const dispo = Math.max(0, j.restantAujourdhuiCentimes);
  const actives = etat.poches.filter((p) => p.actif !== false);
  const envie = fluxEnvies(etat).active;
  // Même règle que la clôture de 5 h : la part de l'envie d'abord, le reste entre prêt et sécurité
  const versEnvie = envie ? Math.round((dispo * parts.envie) / 100) : 0;
  const rep = repartirReste(dispo - versEnvie, actives, parts) || [];
  const vers = (type) => { const poche = actives.find((x) => x.type === type); return rep.find((x) => x.pocheId === poche?.id)?.montantCentimes || 0; };
  let proj = null;
  try { proj = projeter(etat, auj, { nbMois: 12 }); } catch { proj = null; }
  const jalon = (type) => proj?.jalons.find((x) => x.type === type);
  const secu = t.poches.find((x) => x.poche.type === 'coussin');
  const pret = t.poches.find((x) => x.poche.type === 'remboursementAnticipe');
  const cartePoche = (x, quand) => (x ? h('div', { class: 'fiche-poche' },
    h('div', { class: 'fiche-poche-tete' }, h('strong', {}, x.poche.nom), h('span', {}, eur(x.soldeCentimes + x.attenteCentimes), x.poche.cibleCentimes ? h('small', {}, ` sur ${rond(x.poche.cibleCentimes)}`) : null)),
    x.poche.cibleCentimes ? barreRepere({ part: Math.min(1, (x.soldeCentimes + x.attenteCentimes) / x.poche.cibleCentimes), etat: 'ok', description: `${x.poche.nom} : ${formatEuros(x.soldeCentimes + x.attenteCentimes)} sur ${formatEuros(x.poche.cibleCentimes)}` }) : null,
    h('p', { class: 'note' }, [`${eur(x.soldeCentimes)} déjà virés`, x.attenteCentimes ? `, ${eur(x.attenteCentimes)} à virer` : '', quand ? `. ${quand}` : '.'].join(''))) : null);
  const L = proj?.lignes || [];
  ouvrirFiche({
    titre: 'Ton épargne',
    resume: `Tu as ${eur(t.totalCentimes)} d’épargne${t.aVirerCentimes ? `, dont ${eur(t.aVirerCentimes)} à virer` : ''}.`,
    blocs: [
      bloc('Où elle est',
        cartePoche(secu, jalon('coussin') ? `Pleine vers ${formatMois(jalon('coussin').mois)} si tu continues comme ça` : null),
        cartePoche(pret, jalon('pretSolde') ? `Prêt soldé vers ${formatMois(jalon('pretSolde').mois)} si tu continues comme ça` : null)),
      bloc('Ce que la journée d’aujourd’hui peut ajouter',
        partage({ description: `Partage du reste de la journée : ${parts.pret} % prêt, ${parts.securite} % sécurité, ${parts.envie} % envie`, parts: [
          { nom: `Prêt (${parts.pret} %)`, valeur: parts.pret, classe: 'serie-1', texte: eur(vers('remboursementAnticipe')) },
          { nom: `Sécurité (${parts.securite} %)`, valeur: parts.securite, classe: 'serie-4', texte: eur(vers('coussin')) },
          { nom: `${envie ? envie.nom : 'Envie'} (${parts.envie} %)`, valeur: parts.envie, classe: 'serie-2', texte: envie ? eur(versEnvie) : 'aucune envie en cours' },
        ] }),
        h('p', { class: 'note' }, dispo > 0 ? `Si tu ne dépenses plus rien aujourd’hui, ${eur(dispo)} partent à l’épargne demain à 5 h, partagés comme ça.` : 'Aujourd’hui, ta part du jour est dépensée : rien à partager ce soir.')),
      v.totalCentimes || v.semaineCentimes ? bloc('Ce qui attend d’être viré', lignes([
        ['Épargne du mois (ce virement)', v.moisSemaineCentimes],
        ['Arrondis de tes dépenses', v.arrondisCentimes],
        ['Repas à la maison, privations, restes des journées', v.privationsCentimes],
        ['= à virer maintenant', v.semaineCentimes, 'forte'],
        ['Prochain virement', v.dateVirement === auj ? 'aujourd’hui' : `le ${formatJourLong(v.dateVirement)}`],
      ]), h('p', { class: 'note' }, `Un virement tous les ${JOURS_PAR_VIREMENT} jours. La part de ton envie reste sur le compte, pour l’achat.`)) : null,
      L.length > 1 ? bloc('Dans 12 mois, si tu continues comme ça',
        h('div', { class: 'fiche-trajets' },
          h('div', {}, h('small', {}, 'SÉCURITÉ'), h('strong', {}, rond(L[L.length - 1].soldeSecuCentimes)), etincelle(L.map((l) => l.soldeSecuCentimes), { classe: 'serie-4', description: 'Épargne sécurité sur 12 mois' })),
          L.some((l) => l.capitalPretCentimes > 0) ? h('div', {}, h('small', {}, 'PRÊT RESTANT'), h('strong', {}, rond(L[L.length - 1].capitalPretCentimes)), etincelle(L.map((l) => l.capitalPretCentimes), { classe: 'serie-1', description: 'Capital du prêt restant sur 12 mois' })) : null)) : null,
    ],
    liens: [['Mon épargne en détail', 'epargne'], ['Changer le partage', 'strategie/repartition'], ['Plan du prêt', 'strategie/pret']],
  });
}

// ---------- Une dépense qui vient d'être notée ----------

/** L'effet d'une dépense : sur la journée, sur l'épargne (arrondi), sur son enveloppe, et sa place dans tes habitudes. */
export function ficheDepense(tx) {
  const auj = aujourdhui();
  const r = resteADepenser(etat, auj);
  const j = jaugeDuJour(etat, auj, etat.meta?.jauge || null);
  const quotidienne = tx.sens === 'debit' && estDepenseQuotidienne(tx) && contributionDepense(tx) > 0;
  const duJour = tx.date === auj;
  const arr = etat.profil.arrondi?.actif ? (arrondiTransaction(tx, etat.profil.arrondi) || 0) : 0;
  const autres = Math.max(0, j.depensesDuJourCentimes - (quotidienne && duJour ? tx.montantCentimes + arr : 0));
  const dispo = j.restantAujourdhuiCentimes;
  const nom = tx.marchand || tx.libelle || nomCategorie(tx.categorie);
  const ctx = contexteDepense(etat, tx, auj, j.parJourCentimes);
  const env = suiviEnveloppes(etat, auj).lignes.find((l) => l.categories.includes(tx.categorie));
  const p = previsionMois(etat, auj);
  const st = statsDepenses(etat, auj);
  const parts = partsReste(etat);
  ouvrirFiche({
    titre: 'Cette dépense, en détail',
    resume: `${eur(tx.montantCentimes)}, ${nom}. ${!quotidienne ? 'Elle ne touche pas à ta part du jour.' : !duJour ? `Elle compte pour le ${formatDateCourte(tx.date)}.` : dispo >= 0 ? `Il te reste ${eur(dispo)} aujourd’hui.` : `Ta part du jour est dépassée de ${eur(-dispo)}.`}`,
    blocs: [
      quotidienne && duJour ? bloc('Sur ta journée',
        cascade({ format: eur, description: 'De ta part du jour à ce qu’il reste', etapes: [
          { nom: 'Ta part du jour', centimes: j.parJourCentimes, type: 'total' },
          autres > 0 ? { nom: 'Déjà dépensé aujourd’hui', centimes: autres, type: 'moins' } : null,
          { nom: 'Cette dépense', centimes: tx.montantCentimes, type: 'moins' },
          arr ? { nom: 'Son arrondi, vers l’épargne', centimes: arr, type: 'moins' } : null,
          { nom: dispo >= 0 ? 'Reste aujourd’hui' : 'Reste aujourd’hui (dépassé)', centimes: Math.max(0, dispo), type: 'total' },
        ].filter(Boolean) }),
        h('p', { class: 'note' }, dispo > 0 ? `Si tu t’arrêtes là, ${eur(dispo)} partent à l’épargne demain à 5 h : ${parts.pret} % prêt, ${parts.securite} % sécurité, ${parts.envie} % envie.`
          : dispo < 0 ? `Le dépassement est repris sur les ${Math.max(1, j.joursRestants - 1)} jours suivants : environ ${eur(Math.round(-dispo / Math.max(1, j.joursRestants - 1)))} de moins par jour.` : 'Ta part du jour est pile dépensée.')) : null,
      arr ? bloc('Sur ton épargne', lignes([
        [`Arrondi à l’euro du dessus`, arr],
        ['Il part à l’épargne', 'au prochain virement'],
      ])) : null,
      bloc('Dans tes habitudes',
        chiffres(
          ctx.partDuJour !== null && quotidienne ? ['PART DE TA JOURNÉE', `${Math.round(ctx.partDuJour * 100)} %`, `de tes ${eur(j.parJourCentimes)} du jour`, ctx.partDuJour > 1 ? 'rouge' : ctx.partDuJour > 0.6 ? 'or' : ''] : null,
          ctx.categorie.n ? [nomCategorie(tx.categorie).toUpperCase(), eur(ctx.categorie.moyenneCentimes), `en moyenne par achat, ${ctx.categorie.n} en 3 mois`] : null,
          ctx.marchand.n > 1 ? ['ICI CE MOIS-CI', eur(ctx.marchand.totalCentimes), `${ctx.marchand.n} fois depuis le salaire`] : null,
          st.jours ? ['TA MOYENNE', eur(st.recents.moyenne), 'par jour, sur 4 semaines'] : null),
        ctx.categorie.n >= 4 ? h('p', { class: 'note' }, ctx.categorie.rang >= 90 ? `C’est un de tes plus gros achats dans cette catégorie : plus cher que ${ctx.categorie.rang} % des autres.`
          : ctx.categorie.rang <= 35 ? 'C’est un petit achat pour cette catégorie.' : `Un achat ordinaire pour cette catégorie (ta médiane : ${eur(ctx.categorie.medianeCentimes)}).`) : null),
      env && env.plafondCentimes > 0 ? bloc(`Ton enveloppe « ${env.nom} »`,
        barreRepere({ part: Math.min(1, env.part), repere: Math.min(1, env.attenduCentimes / env.plafondCentimes), etat: env.statut === 'depasse' ? 'critique' : env.statut === 'chaud' ? 'attention' : 'ok', description: `${formatEuros(env.depenseCentimes)} dépensés sur ${formatEuros(env.plafondCentimes)}` }),
        h('p', { class: 'note' }, env.resteCentimes >= 0 ? `${eur(env.depenseCentimes)} sur ${eur(env.plafondCentimes)} : il reste ${eur(env.resteCentimes)}, soit ${eur(env.parJourRestantCentimes)} par jour. Le trait blanc montre où tu devrais en être aujourd’hui.`
          : `${eur(env.depenseCentimes)} sur ${eur(env.plafondCentimes)} : dépassée de ${eur(-env.resteCentimes)}.`)) : null,
      st.jours && p.joursRestants > 0 ? bloc('Sur ta fin de mois',
        fourchette({ bas: p.basCentimes, attendu: p.attenduCentimes, haut: p.hautCentimes, format: rond, description: `Fin de mois probable : ${formatEuros(p.attenduCentimes)}` }),
        h('p', { class: 'note' }, `Il reste ${eur(r.resteCentimes)} pour le mois. ${phraseProba(p)}`)) : null,
    ],
    liens: [['Toutes mes habitudes', 'strategie/habitudes']],
  });
}
