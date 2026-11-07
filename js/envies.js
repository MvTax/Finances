// envies.js — « Mes envies » : mettre de côté pour un plaisir (un jeu, des baskets…) avec ce que tu ne dépenses pas.
//
// D'où vient l'argent : de ce qui reste de ta part du jour, c'est-à-dire ce que tu avais le droit de dépenser moins ce
// que tu as dépensé (compté à 5 h du matin : reste du jour, repas à la maison, « Je me suis privé »).
// Exemple : 13 € de part, 3 € dépensés → 10 € ; rien dépensé → les 13 €. Ce reste est partagé :
//   40 % épargne du prêt (8000), 30 % épargne sécurité, 30 % l'envie en cours (voir PARTS_RESTE).
// Sans envie en cours, ses 30 % vont aux deux épargnes (même rapport 40/30).
// L'épargne du mois (le virement prévu) et les arrondis ne sont pas concernés : ils gardent leur répartition.
// La part de l'envie reste sur le compte courant (elle n'est pas virée sur l'épargne) : elle paiera l'achat.
// Une seule envie se remplit à la fois, dans l'ordre de la liste ; le surplus d'un jour passe à la suivante.
//
// Achat : bloqué tant que la barre n'est pas pleine. Exception : acheter avant. L'avance (prix − ce qui était de côté)
// est reprise sur les virements d'épargne suivants, au plus la moitié des restes et privations à virer à chaque fois,
// et la barre continue de se remplir ; ce qu'elle reçoit après l'achat part alors à l'épargne (elle rembourse).
// À la fin, l'épargne a reçu exactement ce qu'elle aurait reçu si tu avais attendu.
//
// Tout est recalculé depuis les données ; seules les parts des restes déjà virés sont figées (sur la ligne du reste).

import { depensesVariables, resteADepenser } from './calculs.js';
import { aujourdhui } from './dates.js';

/** Partage du reste de la journée, en %. */
export const PARTS_RESTE = { pret: 40, securite: 30, envie: 30 };
export const PART_ENVIE = PARTS_RESTE.envie / 100;

/**
 * Partage de la part « épargne » du reste de la journée entre le prêt et la sécurité (40/30, soit 4/7 et 3/7).
 * Si l'une des deux épargnes manque, tout va à l'autre ; sans aucune des deux, null (répartition habituelle).
 */
export function repartirReste(montantCentimes, poches = []) {
  const actives = poches.filter((p) => p.actif !== false);
  const pret = actives.find((p) => p.type === 'remboursementAnticipe');
  const secu = actives.find((p) => p.type === 'coussin');
  if (!(montantCentimes > 0)) return [];
  if (!pret && !secu) return null;
  if (!pret || !secu) return [{ pocheId: (pret || secu).id, montantCentimes }];
  const partPret = Math.round((montantCentimes * PARTS_RESTE.pret) / (PARTS_RESTE.pret + PARTS_RESTE.securite));
  return [{ pocheId: pret.id, montantCentimes: partPret }, { pocheId: secu.id, montantCentimes: montantCentimes - partPret }].filter((x) => x.montantCentimes > 0);
}
export const RETENUE_AVANCE = 0.5;

export const TYPES_ENVIE = [
  { id: 'jeu', nom: 'Jeu vidéo', emoji: '🎮', categorie: 'loisirs' },
  { id: 'tech', nom: 'High-tech', emoji: '📱', categorie: 'achats-en-ligne' },
  { id: 'mode', nom: 'Vêtements, baskets', emoji: '👟', categorie: 'vetements' },
  { id: 'sortie', nom: 'Sortie, concert', emoji: '🎟️', categorie: 'loisirs' },
  { id: 'voyage', nom: 'Voyage', emoji: '✈️', categorie: 'loisirs' },
  { id: 'maison', nom: 'Maison', emoji: '🛋️', categorie: 'maison' },
  { id: 'autre', nom: 'Autre', emoji: '🎁', categorie: 'plaisir' },
];
export const typeEnvie = (id) => TYPES_ENVIE.find((t) => t.id === id) || TYPES_ENVIE[TYPES_ENVIE.length - 1];

/** Super flamme : journée close sans aucune dépense du quotidien (prélèvements, abonnements et achats d'envie exclus). */
export function estSuperFlamme(etat, jour) {
  return depensesVariables(etat, jour, jour) <= 0;
}

const listeEnvies = (etat) => (etat.profil?.envies?.liste || []).filter((e) => !e.supprimee);

/**
 * Remplissage des envies.
 * @returns {{ envies: Array<envie & { cibleCentimes, cumulCentimes, resteCentimes, complete, avanceCentimes, avanceRestanteCentimes,
 *   contributions: Array<{ date, montantCentimes, superFlamme }> }>, parReste: Map<string, { envieId, part, garde }>,
 *   gardeAVirerCentimes, avanceRestanteCentimes, active }}
 */
export function fluxEnvies(etat, { auto = null, aujourdhuiIso = aujourdhui() } = {}) {
  const depuis = etat.profil?.envies?.depuis || '9999-12-31';
  const envies = listeEnvies(etat).map((e) => ({ ...e, cibleCentimes: e.achat ? e.achat.montantCentimes : e.montantCentimes, cumulCentimes: 0, cumulAvantAchatCentimes: 0, contributions: [] }));
  const parId = new Map(envies.map((e) => [e.id, e]));
  const parReste = new Map();
  if (!envies.length) return { envies, parReste, gardeAVirerCentimes: 0, avanceRestanteCentimes: 0, active: null };
  // Ce que chaque journée a mis de côté sans rien dépenser : reste du jour, repas à la maison, « Je me suis privé »
  const autoListe = auto ?? (resteADepenser(etat, aujourdhuiIso).privationsAuto || []);
  const parJour = new Map();
  for (const p of [...(etat.privations || []), ...autoListe]) {
    if (!(p.montantCentimes > 0) || p.date < depuis) continue;
    if (!parJour.has(p.date)) parJour.set(p.date, []);
    parJour.get(p.date).push(p);
  }
  const ordre = (p) => (p.source === 'resteJour' ? 0 : p.auto ? 1 : 2);
  const compter = (e, date, montant, superFlamme) => {
    e.cumulCentimes += montant;
    if (!e.achat || date < e.achat.date) e.cumulAvantAchatCentimes += montant;
    const der = e.contributions[e.contributions.length - 1];
    if (der && der.date === date) der.montantCentimes += montant; else e.contributions.push({ date, montantCentimes: montant, superFlamme });
  };
  for (const date of [...parJour.keys()].sort()) {
    const items = parJour.get(date).sort((x, y) => ordre(x) - ordre(y));
    // Déjà virés : la part de l'envie a été figée au moment du virement (avant les envies : rien)
    for (const p of items.filter((x) => x.vireLe)) {
      const e = p.envieId ? parId.get(p.envieId) : null;
      if (e && p.partEnvieCentimes > 0) compter(e, date, p.partEnvieCentimes, !!p.superFlamme);
    }
    const libres = items.filter((x) => !x.vireLe);
    if (!libres.length) continue;
    const sf = date < aujourdhuiIso && estSuperFlamme(etat, date);
    const base = libres.reduce((t, p) => t + p.montantCentimes, 0);
    let dispo = Math.floor(base * PART_ENVIE);
    // La part du jour est prise ligne par ligne (le reste du jour d'abord), pour pouvoir la figer au virement
    const lignes = libres.map((p) => ({ p, libre: p.montantCentimes }));
    while (dispo > 0) {
      const e = envies.find((x) => x.cumulCentimes < x.cibleCentimes);
      if (!e) break;
      let part = Math.min(dispo, e.cibleCentimes - e.cumulCentimes);
      compter(e, date, part, sf);
      dispo -= part;
      // Avant l'achat, la part reste sur le compte pour payer l'envie ; après un achat en avance, elle rembourse l'épargne
      const gardee = !(e.achat && date >= e.achat.date);
      for (const l of lignes) {
        if (part <= 0) break;
        const m = Math.min(part, l.libre);
        if (m <= 0) continue;
        l.libre -= m; part -= m;
        const deja = parReste.get(l.p.id) || { envieId: e.id, part: 0, garde: 0, superFlamme: sf };
        parReste.set(l.p.id, { ...deja, part: deja.part + m, garde: deja.garde + (gardee ? m : 0) });
      }
    }
  }
  let avanceRestante = 0;
  for (const e of envies) {
    e.resteCentimes = Math.max(0, e.cibleCentimes - e.cumulCentimes);
    e.complete = e.resteCentimes === 0;
    e.avanceCentimes = e.achat ? Math.max(0, e.achat.montantCentimes - e.cumulAvantAchatCentimes) : 0;
    const retenu = (e.achat?.retenues || []).reduce((s, r) => s + r.montantCentimes, 0);
    e.avanceRestanteCentimes = Math.max(0, e.avanceCentimes - retenu);
    avanceRestante += e.avanceRestanteCentimes;
  }
  const gardeAVirer = [...parReste.values()].reduce((s, x) => s + x.garde, 0);
  // L'envie en cours : la première pas encore pleine (même achetée en avance), sinon la dernière pleine pas encore achetée
  const active = envies.find((e) => !e.complete) || envies.find((e) => e.complete && !e.achat) || null;
  return { envies, parReste, gardeAVirerCentimes: gardeAVirer, avanceRestanteCentimes: avanceRestante, active };
}

/** Ce qui est repris sur un virement pour rembourser les avances : au plus la moitié de ce qui reste à virer (hors épargne du mois). */
export function retenueAvance(flux, privationsNettesCentimes) {
  if (!flux.avanceRestanteCentimes || privationsNettesCentimes <= 0) return 0;
  return Math.min(flux.avanceRestanteCentimes, Math.floor(privationsNettesCentimes * RETENUE_AVANCE));
}

/** Ce qu'aujourd'hui peut rapporter à l'envie ce soir (estimation) : si rien n'est dépensé, ou avec ce qui reste. */
export function estimationDuJour(restantCentimes, depenseAujourdhui, partCentimes) {
  return { superFlamme: !depenseAujourdhui, montantCentimes: Math.floor(Math.max(0, restantCentimes) * PART_ENVIE), siRienCentimes: Math.floor(Math.max(0, partCentimes) * PART_ENVIE) };
}

/** Combien de journées sans dépense il faut encore (à part du jour constante). */
export function journeesPourFinir(resteCentimes, partCentimes) {
  const parJour = Math.floor(partCentimes * PART_ENVIE);
  return parJour > 0 ? Math.ceil(resteCentimes / parJour) : null;
}

/** Répartit la retenue sur les envies achetées en avance, la plus ancienne d'abord. */
export function repartirRetenue(flux, montantCentimes) {
  const res = [];
  let reste = montantCentimes;
  for (const e of flux.envies) {
    if (reste <= 0) break;
    const m = Math.min(reste, e.avanceRestanteCentimes);
    if (m > 0) { res.push({ envieId: e.id, montantCentimes: m }); reste -= m; }
  }
  return res;
}
