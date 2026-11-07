// envies.js (page) — « Mes envies » : la carte de l'Accueil (barre en euros, au thème de l'envie), la liste dans les Réglages,
// l'ajout, et l'achat : bloqué tant que la barre n'est pas pleine, sauf « exception » (petit bouton, rarement utilisé).

import { h, icone, vibrer, estMasque } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { carte, champ, champMontant, bouton } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat, majProfil, nouvelId } from '../store.js';
import { fluxEnvies, typeEnvie, TYPES_ENVIE, estimationDuJour, journeesPourFinir, PART_SUPER_FLAMME, PART_JOUR, RETENUE_AVANCE } from '../envies.js';
import { jaugeDuJour, periodeBudget, depensesVariables } from '../calculs.js';
import { ajouterTransaction, nouvelleTransaction } from '../actions.js';
import { compteRevolut, compteParDefaut } from '../revolut.js';
import { aujourdhui, diffJours, formatDateCourte, formatJourLong, estIso } from '../dates.js';
import { formatEuros } from '../money.js';
import { confettis } from '../ui/fete.js';

const NS = 'http://www.w3.org/2000/svg';
const eur = (c) => (estMasque() ? '•••,•• €' : formatEuros(c));
const pct = (e) => (e.cibleCentimes ? Math.min(100, Math.floor((e.cumulCentimes / e.cibleCentimes) * 100)) : 0);

/** Le décor du rectangle selon le type : coucher de soleil néon et palmiers pour un jeu vidéo, un grand emoji sinon. */
function decor(type) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'envie-decor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 360 220');
  svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
  if (type === 'jeu') {
    svg.innerHTML = `
      <defs>
        <linearGradient id="envie-soleil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe56b"/><stop offset=".55" stop-color="#ff7a59"/><stop offset="1" stop-color="#ff2e93"/></linearGradient>
        <clipPath id="envie-bandes"><rect x="0" y="0" width="360" height="104"/><rect x="0" y="110" width="360" height="7"/><rect x="0" y="122" width="360" height="5"/><rect x="0" y="131" width="360" height="3"/></clipPath>
      </defs>
      <circle cx="262" cy="118" r="62" fill="url(#envie-soleil)" clip-path="url(#envie-bandes)"/>
      <g stroke="#ff4fd8" stroke-opacity=".35" stroke-width="1.1" fill="none">
        <path d="M0 150 H360 M0 162 H360 M0 178 H360 M0 198 H360"/>
        <path d="M180 140 L40 220 M180 140 L110 220 M180 140 L180 220 M180 140 L250 220 M180 140 L320 220 M180 140 L-60 220 M180 140 L420 220"/>
      </g>
      <g fill="#1a0533">
        <path d="M318 220 q-4 -60 6 -104 l5 1 q-8 44 -3 103 z"/>
        <path d="M324 114 q-30 -6 -48 10 q24 -4 46 -4 z M326 114 q-12 -22 -40 -26 q20 14 36 30 z M327 113 q8 -26 36 -32 q-20 16 -30 34 z M327 114 q28 -2 42 18 q-22 -8 -40 -14 z M325 113 q-24 6 -36 30 q18 -18 38 -26 z"/>
        <path d="M206 220 q-2 -40 8 -70 l4 1 q-8 30 -6 69 z"/>
        <path d="M214 150 q-22 -4 -34 8 q18 -3 33 -3 z M215 150 q-8 -16 -28 -18 q14 10 26 20 z M216 149 q6 -18 26 -22 q-14 10 -22 24 z M216 150 q20 -1 30 13 q-16 -6 -29 -10 z"/>
      </g>`;
  } else {
    svg.innerHTML = `<text x="300" y="150" font-size="120" text-anchor="middle" opacity=".22">${typeEnvie(type).emoji}</text>`;
  }
  return svg;
}

/** La carte de l'Accueil : l'envie en cours, sa barre en euros, ce que ce soir peut rapporter. */
export function carteEnvie() {
  const f = fluxEnvies(etat);
  if (!f.envies.length) {
    return h('section', { class: 'envie envie-vide', 'aria-label': 'Mes envies' },
      h('p', { class: 'envie-vide-titre' }, '🎁 Une envie ?'),
      h('p', { class: 'envie-vide-texte' }, 'Un jeu, des baskets… Ajoute-la : chaque journée sans dépense la rapproche, en euros.'),
      h('button', { type: 'button', class: 'btn btn-principal btn-petit', onclick: () => feuilleEditerEnvie() }, icone('plus'), h('span', {}, 'Ajouter une envie')));
  }
  const e = f.active || f.envies[f.envies.length - 1];
  const t = typeEnvie(e.type);
  const auj = aujourdhui();
  const j = jaugeDuJour(etat, auj, etat.meta?.jauge || null);
  const depense = depensesVariables(etat, auj, auj) > 0;
  const soir = estimationDuJour(j.restantAujourdhuiCentimes, depense, j.parJourCentimes);
  const nb = journeesPourFinir(e.resteCentimes, j.parJourCentimes);
  const sortie = e.sortieLe && e.sortieLe > auj ? diffJours(auj, e.sortieLe) : null;
  const autres = f.envies.filter((x) => x.id !== e.id && !(x.complete && x.achat)).length;
  const barre = h('div', { class: 'envie-barre', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(e.cibleCentimes / 100), 'aria-valuenow': String(e.cumulCentimes / 100), 'aria-label': `${e.nom} : ${formatEuros(e.cumulCentimes)} de côté sur ${formatEuros(e.cibleCentimes)}` },
    h('span', { class: 'envie-barre-plein', style: { width: `${pct(e)}%` } }), h('span', { class: 'envie-barre-pct' }, `${pct(e)} % de ${formatEuros(e.cibleCentimes, { sansCentimes: e.cibleCentimes % 100 === 0 })}`));
  let etatLigne;
  if (e.achat && !e.complete) etatLigne = h('p', { class: 'envie-statut avance' }, `Acheté en avance le ${formatDateCourte(e.achat.date)} : encore ${eur(e.resteCentimes)} à mériter`);
  else if (e.complete && !e.achat) etatLigne = h('p', { class: 'envie-statut debloque' }, '🔓 Débloqué : tu l’as mérité !');
  else if (e.complete && e.achat) etatLigne = h('p', { class: 'envie-statut debloque' }, '✓ Mérité jusqu’au bout');
  else etatLigne = h('p', { class: 'envie-soir' }, soir.superFlamme
    ? ['Ce soir si tu ne dépenses rien : ', h('strong', {}, `+${eur(soir.montantCentimes)}`)]
    : ['Ce soir : ', h('strong', {}, `+${eur(soir.montantCentimes)}`), ` (20 % de ce qui te reste). Une journée sans dépense : +${eur(soir.siRienCentimes)}`]);
  return h('section', { class: `envie envie-${t.id}`, 'aria-labelledby': `envie-${e.id}` },
    decor(t.id),
    h('div', { class: 'envie-contenu' },
      h('div', { class: 'envie-tete' },
        h('span', { class: 'envie-type' }, `${t.emoji} Mon envie`),
        h('button', { type: 'button', class: 'envie-liste', onclick: () => feuilleEnvies(), 'aria-label': 'Toutes mes envies' }, autres ? `+${autres}` : '', icone('suivant'))),
      h('button', { type: 'button', class: 'envie-titre', id: `envie-${e.id}`, onclick: () => feuilleEnvie(e.id) }, e.nom),
      sortie ? h('p', { class: 'envie-sortie' }, `Sort dans ${sortie} jour${sortie > 1 ? 's' : ''}`) : null,
      barre,
      h('div', { class: 'envie-chiffres' },
        h('p', {}, h('strong', {}, eur(e.cumulCentimes)), h('small', {}, 'de côté')),
        h('p', { class: 'droite' }, h('strong', {}, eur(e.resteCentimes)), h('small', {}, e.complete ? 'c’est bon !' : 'encore à mettre'))),
      etatLigne,
      !e.complete && nb ? h('p', { class: 'envie-rythme' }, `Encore ≈ ${nb} journée${nb > 1 ? 's' : ''} sans dépense`) : null,
      e.achat ? null : h('div', { class: 'envie-actions' },
        h('button', { type: 'button', class: `envie-acheter ${e.complete ? 'pret' : 'verrou'}`, disabled: !e.complete || null, onclick: () => feuilleAchat(e.id, false) },
          e.complete ? '🛒 Je l’achète' : `🔒 Je l’achète à ${eur(e.cibleCentimes)}`),
        e.complete ? null : h('button', { type: 'button', class: 'envie-exception', onclick: () => feuilleAchat(e.id, true) }, 'exception'))));
}

/** Toutes les envies, dans l'ordre où elles se remplissent. */
export function feuilleEnvies() {
  let f;
  const contenu = h('div', { class: 'envies-liste' });
  const dessiner = () => {
    const fl = fluxEnvies(etat);
    contenu.replaceChildren(...[
      fl.envies.length ? h('ol', { class: 'envies-ol' }, fl.envies.map((e, i) => h('li', {},
        h('button', { type: 'button', class: 'envie-ligne', onclick: () => { f.fermer(); feuilleEnvie(e.id); } },
          h('span', { class: 'envie-ligne-emoji', 'aria-hidden': 'true' }, typeEnvie(e.type).emoji),
          h('span', { class: 'envie-ligne-texte' }, h('strong', {}, e.nom),
            h('small', {}, e.complete ? (e.achat ? `acheté le ${formatDateCourte(e.achat.date)}, mérité` : 'débloqué') : e.achat ? `acheté en avance, ${formatEuros(e.resteCentimes)} à mériter` : `${formatEuros(e.cumulCentimes)} sur ${formatEuros(e.cibleCentimes)}`),
            h('span', { class: 'envie-mini-barre' }, h('span', { style: { width: `${pct(e)}%` } }))),
          icone('suivant')),
        h('span', { class: 'envie-ordre' },
          h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Monter ${e.nom}`, disabled: i === 0 || null, onclick: () => deplacer(e.id, -1).then(dessiner) }, '↑'),
          h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Descendre ${e.nom}`, disabled: i === fl.envies.length - 1 || null, onclick: () => deplacer(e.id, 1).then(dessiner) }, '↓'))))) : h('p', { class: 'petit' }, 'Aucune envie pour l’instant.'),
      bouton('Ajouter une envie', () => { f.fermer(); feuilleEditerEnvie(); }, { classe: 'btn-principal', icone: 'plus' }),
      regles(),
    ]);
  };
  dessiner();
  f = ouvrirFeuille({ titre: 'Mes envies', contenu, plein: true });
  return f;
}

function regles() {
  return h('details', { class: 'details-discret envies-regles' }, h('summary', {}, 'Comment ça se remplit'),
    h('p', { class: 'petit' }, `Seuls les restes du jour (ce que tu n’as pas dépensé de ta part du jour, compté à 5 h) remplissent tes envies : ${Math.round(PART_SUPER_FLAMME * 100)} % une journée sans aucune dépense, ${Math.round(PART_JOUR * 100)} % les autres jours. Le reste part à l’épargne comme avant. L’épargne du mois, les arrondis, les repas à la maison et les privations ne sont jamais touchés.`),
    h('p', { class: 'petit' }, 'L’argent de l’envie reste sur ton compte courant (il n’est pas viré sur l’épargne) : c’est lui qui paiera l’achat. Une envie se remplit à la fois, dans l’ordre de la liste.'),
    h('p', { class: 'petit' }, `Acheter avant que la barre soit pleine (exception) : la différence est une avance, reprise sur tes prochains virements d’épargne (au plus ${Math.round(RETENUE_AVANCE * 100)} % des restes et privations à virer à chaque fois). La barre continue de se remplir et ce qu’elle reçoit rembourse ton épargne : à la fin, ton épargne a reçu la même chose que si tu avais attendu.`));
}

/** Détail d'une envie : barre, chaque ajout, modifier, supprimer. */
export function feuilleEnvie(id) {
  const fl = fluxEnvies(etat);
  const e = fl.envies.find((x) => x.id === id);
  if (!e) return null;
  let f;
  const contenu = h('div', { class: 'feuille-sections' },
    h('div', { class: `envie envie-${typeEnvie(e.type).id} envie-mini` }, decor(typeEnvie(e.type).id),
      h('div', { class: 'envie-contenu' }, h('p', { class: 'envie-titre' }, e.nom),
        h('div', { class: 'envie-barre' }, h('span', { class: 'envie-barre-plein', style: { width: `${pct(e)}%` } }), h('span', { class: 'envie-barre-pct' }, `${pct(e)} %`)),
        h('div', { class: 'envie-chiffres' }, h('p', {}, h('strong', {}, eur(e.cumulCentimes)), h('small', {}, 'de côté')), h('p', { class: 'droite' }, h('strong', {}, eur(e.resteCentimes)), h('small', {}, `encore à mettre, sur ${eur(e.cibleCentimes)}`))))),
    e.achat ? h('p', { class: 'petit' }, `Acheté le ${formatJourLong(e.achat.date)} : ${formatEuros(e.achat.montantCentimes)}${e.achat.exception ? `, en avance. Avance : ${formatEuros(e.avanceCentimes)}, encore ${formatEuros(e.avanceRestanteCentimes)} à reprendre sur les virements d’épargne.` : '.'}`) : null,
    h('h3', { class: 'feuille-sous-titre' }, 'Chaque ajout'),
    e.contributions.length ? h('div', { class: 'liste-cles' }, [...e.contributions].reverse().map((c) => h('div', { class: 'ligne-cle' },
      h('span', {}, formatDateCourte(c.date), c.superFlamme ? h('span', { class: 'envie-tag-sf' }, ' super flamme') : ' reste du jour'),
      h('strong', { class: 'vert-texte' }, `+${formatEuros(c.montantCentimes)}`))))
      : h('p', { class: 'petit' }, 'Rien encore : le premier ajout arrive à 5 h du matin après une journée où il te reste quelque chose.'),
    h('div', { class: 'groupe-boutons' },
      bouton('Modifier', () => { f.fermer(); feuilleEditerEnvie(e); }, { classe: 'btn-petit', icone: 'reglages' }),
      bouton('Toutes mes envies', () => { f.fermer(); feuilleEnvies(); }, { classe: 'btn-petit' })),
    regles());
  f = ouvrirFeuille({ titre: `${typeEnvie(e.type).emoji} ${e.nom}`, contenu, plein: true });
  return f;
}

/** Ajouter ou modifier une envie : nom, type, prix, date de sortie (facultative). */
export function feuilleEditerEnvie(existante = null) {
  let nom = existante?.nom || '';
  let type = existante?.type || 'jeu';
  let montant = existante?.montantCentimes ?? null;
  let sortie = existante?.sortieLe || '';
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true });
  const types = h('div', { class: 'envie-types', role: 'radiogroup', 'aria-label': 'Type' });
  const rendreTypes = () => types.replaceChildren(...TYPES_ENVIE.map((t) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(t.id === type), class: `puce-cat ${t.id === type ? 'active' : ''}`, onclick: () => { type = t.id; rendreTypes(); } }, `${t.emoji} ${t.nom}`)));
  rendreTypes();
  const valider = async () => {
    if (!nom.trim()) { erreur.hidden = false; erreur.textContent = 'Donne un nom à ton envie.'; return; }
    if (!(montant > 0)) { erreur.hidden = false; erreur.textContent = 'Indique le prix.'; return; }
    const envies = etat.profil.envies || {};
    const liste = [...(envies.liste || [])];
    const valeur = { ...(existante ? liste.find((x) => x.id === existante.id) : {}), nom: nom.trim(), type, montantCentimes: montant, sortieLe: estIso(sortie) ? sortie : null };
    if (existante) { const i = liste.findIndex((x) => x.id === existante.id); liste[i] = valeur; }
    else liste.push({ ...valeur, id: nouvelId('envie'), creeLe: aujourdhui(), achat: null });
    // Première envie : les restes du jour comptent depuis le salaire (ceux déjà virés sur l'épargne restent à l'épargne)
    await majProfil({ envies: { depuis: envies.depuis || periodeBudget(aujourdhui(), etat.profil).debut, liste } });
    f.fermer(); vibrer(15);
    toast(existante ? 'Envie modifiée.' : `${typeEnvie(type).emoji} ${nom.trim()} ajouté à tes envies.`, { type: 'succes' });
  };
  const f = ouvrirFeuille({
    titre: existante ? 'Modifier l’envie' : 'Nouvelle envie',
    contenu: h('div', { class: 'formulaire' },
      champ('Ce que tu veux', h('input', { class: 'input', value: nom, placeholder: 'GTA 6', maxlength: '40', oninput: (ev) => { nom = ev.target.value; } })),
      champ('Type', types),
      champ('Prix', champMontant({ valeur: montant, label: 'Prix', onValeur: (v) => { montant = v; } })),
      champ('Date de sortie (facultatif)', h('input', { class: 'input', type: 'date', value: sortie, onchange: (ev) => { sortie = ev.target.value; } }), 'Pour un compte à rebours sur la carte.'),
      erreur,
      bouton(existante ? 'Enregistrer' : 'Ajouter l’envie', valider, { classe: 'btn-principal btn-large' }),
      existante && !existante.achat ? bouton('Supprimer cette envie', async () => { await supprimer(existante.id); f.fermer(); toast('Envie supprimée : ce qu’elle avait reçu passe à la suivante (ou revient à l’épargne).'); }, { classe: 'btn-danger-texte' }) : null),
  });
  return f;
}

/** Achat : quand la barre est pleine, ou en exception (avance reprise sur les virements d'épargne). */
export function feuilleAchat(id, exception) {
  const e = fluxEnvies(etat).envies.find((x) => x.id === id);
  if (!e) return null;
  let montant = e.cibleCentimes;
  const rev = compteRevolut(etat);
  let compteId = compteParDefaut(etat)?.id;
  const avance = () => Math.max(0, (montant || 0) - e.cumulCentimes);
  const note = h('p', { class: 'petit', 'aria-live': 'polite' });
  const maj = () => { note.textContent = exception ? `Avance : ${formatEuros(avance())}. Elle sera reprise sur tes prochains virements d’épargne, et la barre continue jusqu’à ${formatEuros(montant || e.cibleCentimes)}.` : `Payé avec les ${formatEuros(Math.min(montant || 0, e.cumulCentimes))} mis de côté : ton budget du jour ne bouge pas.`; };
  maj();
  const puce = rev ? h('button', { type: 'button', class: 'puce-revolut', 'aria-pressed': 'false', onclick: () => { compteId = compteId === rev.id ? compteParDefaut(etat)?.id : rev.id; puce.classList.toggle('active', compteId === rev.id); puce.setAttribute('aria-pressed', String(compteId === rev.id)); } }, icone('banque'), h('span', {}, 'Payé avec Revolut')) : null;
  const f = ouvrirFeuille({
    titre: exception ? `Exception : ${e.nom} maintenant` : `${e.nom} : débloqué !`,
    contenu: h('div', { class: 'formulaire' },
      exception ? h('p', {}, `Tu as ${formatEuros(e.cumulCentimes)} de côté sur ${formatEuros(e.cibleCentimes)}. Normalement, on attend que la barre soit pleine. Une exception, c’est rare : tu continueras à le mériter après l’achat.`)
        : h('p', {}, `Tu as mis ${formatEuros(e.cumulCentimes)} de côté. Bravo, tu l’as mérité.`),
      champ('Prix payé', champMontant({ valeur: montant, label: 'Prix payé', onValeur: (v) => { montant = v; maj(); } })),
      puce, note,
      bouton(exception ? 'Je l’achète quand même' : `J’ai acheté ${e.nom}`, async () => {
        if (!(montant > 0)) return;
        await acheter(e, { montantCentimes: montant, compteId, exception });
        f.fermer(); vibrer(25);
        confettis({ nombre: 60, origine: { x: innerWidth / 2, y: innerHeight * 0.35 } });
        toast(exception ? `${e.nom} acheté en avance. La barre continue : encore ${formatEuros(Math.max(0, montant - e.cumulCentimes))} à mériter.` : `${e.nom} acheté. Profite, tu l’as mérité !`, { type: 'succes', duree: 5000 });
      }, { classe: exception ? 'btn-secondaire btn-large' : 'btn-principal btn-large' })),
  });
  return f;
}

async function acheter(e, { montantCentimes, compteId, exception }) {
  const date = aujourdhui();
  const tx = nouvelleTransaction({ sens: 'debit', montantCentimes, libelle: e.nom, categorie: typeEnvie(e.type).categorie, date, compteId, source: 'envie' });
  tx.envieId = e.id;
  await ajouterTransaction(tx);
  const liste = (etat.profil.envies?.liste || []).map((x) => (x.id === e.id ? { ...x, achat: { date, montantCentimes, txId: tx.id, exception: !!exception, retenues: [] } } : x));
  await majProfil({ envies: { ...etat.profil.envies, liste } });
}

async function deplacer(id, sens) {
  const liste = [...(etat.profil.envies?.liste || [])];
  const i = liste.findIndex((x) => x.id === id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= liste.length) return;
  [liste[i], liste[j]] = [liste[j], liste[i]];
  await majProfil({ envies: { ...etat.profil.envies, liste } });
}

async function supprimer(id) {
  await majProfil({ envies: { ...etat.profil.envies, liste: (etat.profil.envies?.liste || []).filter((x) => x.id !== id) } });
}

/** Réglages → Mes envies. */
export function cartesReglagesEnvies() {
  const fl = fluxEnvies(etat);
  return [
    carte(null, h('div', { class: 'formulaire' },
      h('p', { class: 'petit' }, 'Mets de côté pour un plaisir avec ce que tu ne dépenses pas. La barre de l’Accueil montre l’argent de côté et ce qu’il reste.'),
      fl.envies.length ? h('div', { class: 'liste-liens' }, fl.envies.map((e) => h('button', { type: 'button', class: 'ligne-lien', onclick: () => feuilleEnvie(e.id) },
        h('span', { 'aria-hidden': 'true', class: 'envie-ligne-emoji' }, typeEnvie(e.type).emoji),
        h('span', { class: 'ligne-lien-texte' }, e.nom, h('small', {}, e.complete ? (e.achat ? 'acheté, mérité' : 'débloqué') : `${formatEuros(e.cumulCentimes)} sur ${formatEuros(e.cibleCentimes)}${e.achat ? ', acheté en avance' : ''}`)),
        icone('suivant')))) : null,
      h('div', { class: 'groupe-boutons' },
        bouton('Ajouter une envie', () => feuilleEditerEnvie(), { classe: 'btn-principal', icone: 'plus' }),
        fl.envies.length > 1 ? bouton('Changer l’ordre', () => feuilleEnvies(), { classe: 'btn-secondaire' }) : null),
      regles())),
  ];
}

