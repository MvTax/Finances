// money.js — tout l'argent de l'app est en CENTIMES ENTIERS.
// Aucune conversion texte → centimes ne passe par une multiplication flottante :
// on découpe la chaîne (partie entière / partie décimale) et on assemble des entiers.

const ESPACES = /[\s   ']/g;

/**
 * Convertit un texte saisi ou lu dans un relevé en centimes entiers.
 * Accepte « 4,89 », « 4.89 », « 1,70 », « 12 », « 1 234,56 », « 1.234,56 », « -14,00€ », « +3 € ».
 * Renvoie null si le texte n'est pas un montant valide (jamais NaN).
 */
export function parseMontant(texte) {
  if (texte === null || texte === undefined) return null;
  if (typeof texte === 'number') {
    if (!Number.isFinite(texte)) return null;
    return parseMontant(String(texte));
  }
  let s = String(texte).trim().replace(/€|eur(os?)?/gi, '').replace(ESPACES, '');
  if (!s) return null;
  let signe = 1;
  if (s[0] === '-' || s[0] === '−') { signe = -1; s = s.slice(1); }
  else if (s[0] === '+') { s = s.slice(1); }
  if (!/^[0-9.,]+$/.test(s)) return null;
  const derVirgule = s.lastIndexOf(',');
  const derPoint = s.lastIndexOf('.');
  let entier;
  let decimales = '';
  if (derVirgule >= 0 && derPoint >= 0) {
    // Les deux séparateurs : le dernier est le séparateur décimal, l'autre sépare les milliers.
    const sep = derVirgule > derPoint ? ',' : '.';
    const autre = sep === ',' ? '.' : ',';
    const idx = s.lastIndexOf(sep);
    entier = s.slice(0, idx).split(autre).join('');
    decimales = s.slice(idx + 1);
    if (entier.includes(sep)) return null;
  } else if (derVirgule >= 0 || derPoint >= 0) {
    const sep = derVirgule >= 0 ? ',' : '.';
    const morceaux = s.split(sep);
    if (morceaux.length > 2) {
      // « 1.234.567 » : séparateurs de milliers uniquement
      if (morceaux.slice(1).every((m) => m.length === 3)) { entier = morceaux.join(''); }
      else return null;
    } else {
      const [a, b] = morceaux;
      if (sep === '.' && b.length === 3 && a.length >= 1 && a.length <= 3 && a !== '0') {
        // « 1.234 » : on considère un séparateur de milliers (aucun prix courant n'a 3 décimales)
        entier = a + b;
      } else {
        entier = a;
        decimales = b;
      }
    }
  } else {
    entier = s;
  }
  if (entier === '') entier = '0';
  if (!/^\d+$/.test(entier) || !/^\d*$/.test(decimales)) return null;
  if (decimales.length > 2) return null;
  decimales = (decimales + '00').slice(0, 2);
  const valeur = Number(entier) * 100 + Number(decimales);
  if (!Number.isSafeInteger(valeur)) return null;
  return signe * valeur;
}

const FORMAT = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Formate des centimes en « 1 234,56 € » (espaces insécables fr-FR). */
export function formatEuros(centimes, options = {}) {
  if (centimes === null || centimes === undefined || Number.isNaN(centimes)) return '—';
  const c = Math.trunc(centimes);
  const signe = c < 0 ? '−' : (options.signe && c > 0 ? '+' : '');
  const abs = Math.abs(c);
  if (options.sansCentimes && abs % 100 === 0) return signe + FORMAT_ENTIER.format(abs / 100);
  // Division exacte en deux entiers pour éviter tout artefact flottant d'affichage
  const euros = Math.floor(abs / 100);
  const cts = abs % 100;
  const texte = FORMAT.format(euros + cts / 100);
  return signe + texte;
}

/** Format court sans symbole : « 1 234,56 ». */
export function formatNombre(centimes) {
  const c = Math.trunc(centimes || 0);
  const abs = Math.abs(c);
  const ent = Math.floor(abs / 100).toLocaleString('fr-FR');
  return (c < 0 ? '−' : '') + ent + ',' + String(abs % 100).padStart(2, '0');
}

/** Valeur à mettre dans un champ de saisie : « 4,89 ». */
export function versChamp(centimes) {
  if (centimes === null || centimes === undefined) return '';
  const abs = Math.abs(Math.trunc(centimes));
  return (centimes < 0 ? '-' : '') + Math.floor(abs / 100) + ',' + String(abs % 100).padStart(2, '0');
}

/** Arrondi à l'euro supérieur : 4,89 € → 0,11 € ; 12,00 € → 0 €. */
export function arrondiEuroSuperieur(centimes) {
  const abs = Math.abs(Math.trunc(centimes));
  const reste = abs % 100;
  return reste === 0 ? 0 : 100 - reste;
}

export function somme(liste, cle) {
  let total = 0;
  for (const el of liste) total += cle ? (typeof cle === 'function' ? cle(el) : el[cle]) || 0 : el || 0;
  return total;
}

/**
 * Division entière arrondie « au plus proche, égalité au pair » (arrondi bancaire).
 * num et den entiers (den > 0). Exact tant que |num| < 2^53.
 */
export function divArrondiBancaire(num, den) {
  if (den <= 0) throw new Error('Dénominateur invalide');
  const signe = num < 0 ? -1 : 1;
  const n = Math.abs(num);
  const q = Math.floor(n / den);
  const r = n - q * den;
  const deux = 2 * r;
  let res = q;
  if (deux > den || (deux === den && q % 2 === 1)) res = q + 1;
  return signe * res;
}

/** Pourcentage entier (arrondi bancaire) : part(15000, 50) → 7500. */
export function pourcentageDe(centimes, pourcent) {
  return divArrondiBancaire(centimes * Math.round(pourcent * 100), 10000);
}

/**
 * Répartit un total selon des parts (en %) sans perdre ni créer de centime
 * (méthode du plus fort reste).
 */
export function repartir(total, parts) {
  const sommeParts = parts.reduce((a, b) => a + b, 0) || 1;
  const bruts = parts.map((p) => (total * p) / sommeParts);
  const res = bruts.map((b) => Math.floor(b));
  let reste = total - res.reduce((a, b) => a + b, 0);
  const ordre = bruts.map((b, i) => [b - Math.floor(b), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < ordre.length && reste > 0; k++, reste--) res[ordre[k][1]] += 1;
  return res;
}

// --------------------------------------------------------------------------
// Montants « parlés » ou tapés en langage naturel (secours local, sans IA)
// --------------------------------------------------------------------------

const UNITES = {
  zero: 0, zéro: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, septante: 70, huitante: 80, octante: 80, nonante: 90,
};

/** Convertit une suite de mots français en nombre entier (« quatre-vingt-dix-neuf » → 99). Null si inconnu. */
export function motsVersNombre(texte) {
  const mots = texte.toLowerCase().replace(/-/g, ' ').replace(/\bet\b/g, ' ').split(/\s+/).filter(Boolean);
  if (!mots.length) return null;
  let total = 0;
  let courant = 0;
  let vu = false;
  for (let i = 0; i < mots.length; i++) {
    const m = mots[i];
    if (m in UNITES) {
      const v = UNITES[m];
      if (m === 'vingt' && courant > 0 && courant % 100 === 4) { courant = courant - 4 + 80; } // quatre vingt
      else courant += v;
      vu = true;
    } else if (m === 'vingts' && courant % 100 === 4) { courant = courant - 4 + 80; vu = true; }
    else if (m === 'cent' || m === 'cents') { courant = (courant || 1) * 100; vu = true; }
    else if (m === 'mille') { total += (courant || 1) * 1000; courant = 0; vu = true; }
    else if (/^\d+$/.test(m)) { courant += Number(m); vu = true; }
    else return null;
  }
  return vu ? total + courant : null;
}

/**
 * Extrait un montant d'une phrase : « 4,89 », « quatre euros cinquante », « deux fois 3,20 » (= 6,40),
 * « 20 balles », « 3 euros 20 », « 1 234,56 € ». Renvoie { centimes, debut, fin } ou null.
 */
export function extraireMontantPhrase(phrase) {
  const p = ' ' + phrase.toLowerCase().replace(/ | /g, ' ') + ' ';
  const NB = '(?:\\d{1,3}(?:[  ]\\d{3})+|\\d+)(?:[.,]\\d{1,2})?';
  const MOTS = '(?:zéro|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingts?|trente|quarante|cinquante|soixante|cent|cents|mille|et|-)';
  const MOTS_NB = `(?:${MOTS}(?:[\\s-]+${MOTS})*)`;
  const UNITE = '(?:€|euros?|balles?)';

  // « deux fois 3,20 » / « 2 x 3,20 »
  const reFois = new RegExp(`(${NB}|${MOTS_NB})\\s*(?:fois|x|×)\\s*(${NB}|${MOTS_NB})\\s*(?:${UNITE})?(?:\\s*(\\d{1,2}|${MOTS_NB}))?`, 'i');
  const mf = p.match(reFois);
  if (mf) {
    const n = /\d/.test(mf[1]) ? Number(mf[1]) : motsVersNombre(mf[1]);
    let prix = /\d/.test(mf[2]) ? parseMontant(mf[2]) : (motsVersNombre(mf[2]) ?? null);
    if (prix !== null && !/\d/.test(mf[2])) prix *= 100;
    if (prix !== null && mf[3] && !/[.,]/.test(mf[2])) {
      const c = /\d/.test(mf[3]) ? Number(mf[3]) : motsVersNombre(mf[3]);
      if (c !== null && c < 100) prix += c;
    }
    if (n && prix !== null) return { centimes: n * prix, debut: mf.index - 1, fin: mf.index - 1 + mf[0].length };
  }

  // « 3 euros 20 », « quatre euros cinquante », « 20 balles »
  const reUnite = new RegExp(`(${NB}|${MOTS_NB})\\s*${UNITE}(?:\\s+(\\d{1,2}|${MOTS_NB})(?=\\s|$))?`, 'i');
  const mu = p.match(reUnite);
  if (mu) {
    let c = /\d/.test(mu[1]) ? parseMontant(mu[1]) : (motsVersNombre(mu[1]) !== null ? motsVersNombre(mu[1]) * 100 : null);
    if (c !== null && mu[2] && !/[.,]/.test(mu[1])) {
      const cts = /\d/.test(mu[2]) ? Number(mu[2].length === 1 ? mu[2] + '0' : mu[2]) : motsVersNombre(mu[2]);
      if (cts !== null && cts < 100) c += cts;
    }
    if (c !== null) return { centimes: c, debut: mu.index - 1, fin: mu.index - 1 + mu[0].length };
  }

  // nombre nu « 4,89 »
  const reNb = new RegExp(`(?:^|\\s)(${NB})(?=\\s|$)`);
  const mn = p.match(reNb);
  if (mn) {
    const c = parseMontant(mn[1]);
    if (c !== null) return { centimes: c, debut: mn.index, fin: mn.index + mn[0].length - 1 };
  }
  return null;
}
