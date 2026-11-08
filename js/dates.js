// dates.js — dates métier au format ISO « AAAA-MM-JJ », fuseau Europe/Paris, semaine du lundi.
// Les calculs passent par des dates UTC à minuit pour éviter les sauts d'heure d'été.

export const FUSEAU = 'Europe/Paris';

let horlogeForcee = null;
/** Pour les tests : force la date du jour (« 2026-11-05 ») ou null pour revenir à l'horloge réelle. */
export function forcerAujourdhui(iso) { horlogeForcee = iso; }

const FMT_ISO = new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' });
const FMT_HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hour12: false });

/** Une journée de budget commence à 5 h du matin : entre minuit et 5 h, c'est encore la veille (soirée, sortie…). */
export const HEURE_DEBUT_JOUR = 5;

/** Date du jour à Paris, « AAAA-MM-JJ », au sens du budget : jusqu'à 5 h du matin, c'est encore la veille. */
export function aujourdhui() {
  if (horlogeForcee) return horlogeForcee;
  return isoDepuisDate(new Date(Date.now() - HEURE_DEBUT_JOUR * 3600 * 1000));
}

export function isoDepuisDate(d) {
  const parts = FMT_ISO.formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function heureParis(d = new Date()) { return FMT_HEURE.format(d); }

export function versUTC(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j));
}
function depuisUTC(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function estIso(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(versUTC(s).getTime()) && depuisUTC(versUTC(s)) === s; }

export function ajouterJours(iso, n) { const d = versUTC(iso); d.setUTCDate(d.getUTCDate() + n); return depuisUTC(d); }
export function diffJours(a, b) { return Math.round((versUTC(b) - versUTC(a)) / 86400000); }
/** 1 = lundi … 7 = dimanche */
export function jourSemaine(iso) { const j = versUTC(iso).getUTCDay(); return j === 0 ? 7 : j; }
export function estWeekend(iso) { return jourSemaine(iso) >= 6; }
export function moisDe(iso) { return iso.slice(0, 7); }
export function anneeDe(iso) { return Number(iso.slice(0, 4)); }
export function joursDansMois(mois) { const [a, m] = mois.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); }
export function premierJour(mois) { return mois + '-01'; }
export function dernierJour(mois) { return `${mois}-${String(joursDansMois(mois)).padStart(2, '0')}`; }
export function ajouterMois(mois, n) {
  const [a, m] = mois.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
/** Même jour du mois décalé de n mois, borné au dernier jour (31/01 + 1 mois → 28/02). */
export function ajouterMoisDate(iso, n, jourVoulu) {
  const mois = ajouterMois(moisDe(iso), n);
  const j = Math.min(jourVoulu || Number(iso.slice(8, 10)), joursDansMois(mois));
  return `${mois}-${String(j).padStart(2, '0')}`;
}
export function dateDuMois(mois, jour) { return `${mois}-${String(Math.min(jour, joursDansMois(mois))).padStart(2, '0')}`; }
export function compareIso(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
export function maxIso(a, b) { return a > b ? a : b; }
export function minIso(a, b) { return a < b ? a : b; }
/** Lundi de la semaine de la date. */
export function debutSemaine(iso) { return ajouterJours(iso, 1 - jourSemaine(iso)); }
/** Prochaine date (strictement après iso) tombant le jour de semaine js (1 = lundi). */
export function prochainJourSemaine(iso, js, inclus = false) {
  let d = inclus ? iso : ajouterJours(iso, 1);
  while (jourSemaine(d) !== js) d = ajouterJours(d, 1);
  return d;
}

export const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const JOURS_LONGS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

// Mois abrégés tels qu'imprimés par Revolut (avec et sans point, avec et sans accent)
const MOIS_ABREGES = {
  'janv': 1, 'jan': 1, 'janvier': 1,
  'févr': 2, 'fevr': 2, 'fév': 2, 'fev': 2, 'février': 2, 'fevrier': 2,
  'mars': 3, 'mar': 3,
  'avr': 4, 'avril': 4,
  'mai': 5,
  'juin': 6,
  'juil': 7, 'juillet': 7,
  'août': 8, 'aout': 8, 'aoû': 8,
  'sept': 9, 'sep': 9, 'septembre': 9,
  'oct': 10, 'octobre': 10,
  'nov': 11, 'novembre': 11,
  'déc': 12, 'dec': 12, 'décembre': 12, 'decembre': 12,
};

export function numeroMois(abr) {
  const k = abr.toLowerCase().replace(/\.$/, '').normalize('NFC');
  return MOIS_ABREGES[k] ?? null;
}

/** « 18 nov. 2025 » → « 2025-11-18 » ; null si invalide. */
export function parseDateRevolut(s) {
  const m = String(s).trim().match(/^(\d{1,2})\s+([a-zA-Zéèûôà]+\.?)\s+(\d{4})$/);
  if (!m) return null;
  const mo = numeroMois(m[2]);
  if (!mo) return null;
  const iso = `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return estIso(iso) ? iso : null;
}

/**
 * Date LCL « JJ.MM » sans année, rattachée à la période du relevé.
 * Une date dont le mois est postérieur au mois de fin de période appartient à l'année précédente
 * (ex. « ANCIEN SOLDE 31.12 » dans le relevé de janvier).
 */
export function parseDateLCL(jjmm, periodeFin) {
  const m = String(jjmm).match(/^(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const finA = anneeDe(periodeFin);
  const finM = Number(periodeFin.slice(5, 7));
  const mo = Number(m[2]);
  // Une opération ne peut pas être postérieure à la fin de période : un mois plus grand = année précédente.
  const annee = mo > finM ? finA - 1 : finA;
  const iso = `${annee}-${m[2]}-${m[1]}`;
  return estIso(iso) ? iso : null;
}

/** « 30.09.2026 » → « 2026-09-30 » */
export function parseDatePointee(s) {
  const m = String(s).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** « 30/09/26 » ou « 30/09/2026 » → ISO. Le siècle est 2000. */
export function parseDateSlash(s) {
  const m = String(s).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return estIso(iso) ? iso : null;
}

/** « 2026-11-05 » → « 05/11/2026 » */
export function formatDate(iso) { if (!iso) return ''; return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`; }
/** « 05/11 » */
export function formatDateCourte(iso) { return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : ''; }
/** « jeudi 5 novembre » */
export function formatJourLong(iso, avecAnnee = false) {
  const j = Number(iso.slice(8, 10));
  const s = `${JOURS_LONGS[jourSemaine(iso) - 1]} ${j === 1 ? '1er' : j} ${MOIS_LONGS[Number(iso.slice(5, 7)) - 1]}`;
  return avecAnnee ? `${s} ${iso.slice(0, 4)}` : s;
}
/** « novembre 2026 » */
export function formatMois(mois, court = false) {
  const nom = MOIS_LONGS[Number(mois.slice(5, 7)) - 1];
  const COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return court ? `${COURTS[Number(mois.slice(5, 7)) - 1]} ${mois.slice(2, 4)}` : `${nom} ${mois.slice(0, 4)}`;
}
export function libelleRelatif(iso, ref = aujourdhui()) {
  const d = diffJours(iso, ref);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  if (d === -1) return 'Demain';
  if (d > 1 && d < 7) return JOURS_LONGS[jourSemaine(iso) - 1].replace(/^./, (c) => c.toUpperCase());
  return formatJourLong(iso, anneeDe(iso) !== anneeDe(ref));
}

/** Interprète « hier », « avant-hier », « samedi dernier », « lundi », « le 3 », « 03/11 » dans une phrase. */
export function extraireDatePhrase(phrase, ref = aujourdhui()) {
  const p = phrase.toLowerCase();
  if (/\bavant[- ]hier\b/.test(p)) return { date: ajouterJours(ref, -2), motif: /\bavant[- ]hier\b/ };
  if (/\bhier\b/.test(p)) return { date: ajouterJours(ref, -1), motif: /\bhier\b/ };
  if (/\baujourd'?hui\b|\bce matin\b|\bce midi\b|\bce soir\b/.test(p)) return { date: ref, motif: /\baujourd'?hui\b|\bce (matin|midi|soir)\b/ };
  const jm = p.match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)( dernier)?\b/);
  if (jm) {
    const js = JOURS_LONGS.indexOf(jm[1]) + 1;
    let d = ajouterJours(ref, -1);
    while (jourSemaine(d) !== js) d = ajouterJours(d, -1);
    return { date: d, motif: new RegExp(`\\b${jm[1]}( dernier)?\\b`) };
  }
  const ds = p.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (ds) {
    const a = ds[3] ? (ds[3].length === 2 ? 2000 + Number(ds[3]) : Number(ds[3])) : anneeDe(ref);
    let iso = `${a}-${ds[2].padStart(2, '0')}-${ds[1].padStart(2, '0')}`;
    if (estIso(iso)) {
      if (!ds[3] && iso > ref) iso = `${a - 1}${iso.slice(4)}`;
      return { date: iso, motif: new RegExp(ds[0].replace(/\//g, '\\/')) };
    }
  }
  const le = p.match(/\ble (\d{1,2})(?:er)?\b(?! ?(?:€|euros?|fois|x))/);
  if (le) {
    const j = Number(le[1]);
    let mois = moisDe(ref);
    if (j > Number(ref.slice(8, 10))) mois = ajouterMois(mois, -1);
    if (j >= 1 && j <= joursDansMois(mois)) return { date: dateDuMois(mois, j), motif: new RegExp(`\\ble ${le[1]}(er)?\\b`) };
  }
  return null;
}

/** Itère sur les mois de debut à fin inclus (« AAAA-MM »). */
export function listeMois(debut, fin) {
  const res = [];
  for (let m = debut; m <= fin; m = ajouterMois(m, 1)) res.push(m);
  return res;
}
