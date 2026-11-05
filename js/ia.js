// ia.js — tâches Gemini (voix, texte, ticket, catégorisation, coach, frigo) avec validation stricte
// et file d'attente locale quand le réseau ou le quota manque.

import { genererJSON, ErreurGemini } from './gemini.js';
import * as P from './prompts.js';
import { CATEGORIES } from './categories.js';
import { aujourdhui, estIso, ajouterJours } from './dates.js';
import { etat, enregistrer, supprimerObjet, nouvelId } from './store.js';
import { agregatsPourCoach, validerCarteIA } from './coach.js';
import { mimePourGemini, MIME_REPLI, blobEnBase64 } from './voice.js';

const IDS = CATEGORIES.map((c) => c.id);
const listeCategories = () => CATEGORIES.filter((c) => c.id !== 'ajustement').map((c) => `${c.id} (${c.nom})`).join(', ');
const contexte = () => `Date du jour : ${aujourdhui()} (fuseau Europe/Paris). Catégories autorisées : ${listeCategories()}.`;

export function validerTransactionIA(o) {
  if (!o || !['debit', 'credit'].includes(o.sens)) return null;
  if (!Number.isInteger(o.montantCentimes) || o.montantCentimes <= 0 || o.montantCentimes > 10000000) return null;
  const date = estIso(o.date) && o.date <= ajouterJours(aujourdhui(), 1) && o.date >= ajouterJours(aujourdhui(), -400) ? o.date : aujourdhui();
  return {
    sens: o.sens,
    montantCentimes: o.montantCentimes,
    libelle: String(o.libelle || o.marchand || '').slice(0, 80),
    marchand: String(o.marchand || '').slice(0, 60),
    categorie: IDS.includes(o.categorie) ? o.categorie : (o.sens === 'credit' ? 'autres-entrees' : 'autres'),
    date,
    sucre: !!o.sucre,
    confiance: Math.max(0, Math.min(1, Number(o.confiance) || 0)),
  };
}

export async function analyserVoix(blob, mimeOrigine) {
  const base64 = await blobEnBase64(blob);
  let mime = mimePourGemini(mimeOrigine);
  for (let i = 0; i < 3; i++) {
    try {
      return await genererJSON({ systeme: P.PROMPT_VOIX, schema: P.SCHEMA_VOIX, valider: validerTransactionIA, parts: [{ text: contexte() + ' Transcris puis structure cette dépense ou entrée dictée.' }, { inlineData: { mimeType: mime, data: base64 } }], reflexion: 'faible', timeoutMs: 60000 });
    } catch (e) {
      if (e.code === 'format' && MIME_REPLI[mime]) { mime = MIME_REPLI[mime]; continue; }
      if (e.code === 'format') throw new ErreurGemini(`Gemini refuse le format audio de cet appareil (${mimeOrigine}). Utilise la saisie au clavier.`, 'format');
      throw e;
    }
  }
  throw new ErreurGemini('Format audio non accepté.', 'format');
}

export async function analyserTexteIA(texte) {
  return genererJSON({ systeme: P.PROMPT_VOIX, schema: P.SCHEMA_VOIX, valider: validerTransactionIA, parts: [{ text: `${contexte()}\nPhrase : « ${texte.slice(0, 500)} »` }], reflexion: 'faible' });
}

export function validerTicket(o) {
  if (!o || !Array.isArray(o.articles) || !Number.isInteger(o.totalCentimes) || o.totalCentimes < 0) return null;
  const articles = o.articles.filter((a) => a && typeof a.nom === 'string' && Number.isInteger(a.prixCentimes)).slice(0, 150).map((a) => ({
    nom: a.nom.slice(0, 80), prixCentimes: a.prixCentimes, quantite: Number(a.quantite) > 0 ? Number(a.quantite) : 1,
    categorie: IDS.includes(a.categorie) ? a.categorie : 'courses', sucre: !!a.sucre, marque: String(a.marque || '').slice(0, 40),
    typeMarque: ['distributeur', 'nationale', 'inconnue'].includes(a.typeMarque) ? a.typeMarque : 'inconnue',
    economieDistributeurCentimes: Number.isInteger(a.economieDistributeurCentimes) && a.economieDistributeurCentimes > 0 ? a.economieDistributeurCentimes : 0,
  }));
  const somme = articles.reduce((s, a) => s + a.prixCentimes, 0);
  return {
    marchand: String(o.marchand || 'Ticket').slice(0, 60),
    date: estIso(o.date) && o.date <= aujourdhui() ? o.date : aujourdhui(),
    totalCentimes: o.totalCentimes,
    articles,
    sommeArticlesCentimes: somme,
    ecartCentimes: o.totalCentimes - somme,
    economieDistributeurCentimes: articles.reduce((s, a) => s + a.economieDistributeurCentimes, 0),
    confiance: Number(o.confiance) || 0,
  };
}

export async function analyserTicket(image) {
  return genererJSON({ systeme: P.PROMPT_TICKET, schema: P.SCHEMA_TICKET, valider: validerTicket, parts: [{ text: contexte() }, { inlineData: { mimeType: image.mime, data: image.base64 } }], timeoutMs: 60000, reflexion: 'faible' });
}

/** Catégorisation en lot des marchands inconnus : uniquement marchand normalisé + montant moyen + passages. */
export function lotInconnus(transactions) {
  const m = new Map();
  for (const t of transactions) {
    if (t.personne || t.role === 'versParticulier' || t.role === 'depuisParticulier') continue; // jamais de particulier
    if (!m.has(t.marchand)) m.set(t.marchand, { marchand: t.marchand, total: 0, passages: 0 });
    const e = m.get(t.marchand); e.total += t.montantCentimes; e.passages++;
  }
  return [...m.values()].slice(0, 80).map((e) => ({ marchand: e.marchand, montantMoyenCentimes: Math.round(e.total / e.passages), passages: e.passages }));
}

export async function categoriserInconnus(transactions) {
  const lot = lotInconnus(transactions);
  if (!lot.length) return new Map();
  const r = await genererJSON({
    systeme: P.PROMPT_CATEGORISATION, schema: P.SCHEMA_CATEGORISATION, reflexion: 'faible',
    valider: (o) => (Array.isArray(o?.resultats) ? o : null),
    parts: [{ text: `Catégories autorisées : ${listeCategories()}.\nMarchands : ${JSON.stringify(lot)}` }],
  });
  const res = new Map();
  for (const x of r.resultats) if (IDS.includes(x.categorie) && Number(x.confiance) >= 0.6) res.set(x.marchand, x.categorie);
  return res;
}

export async function coachIA() {
  const agregats = agregatsPourCoach(etat);
  const r = await genererJSON({ systeme: P.PROMPT_COACH, schema: P.SCHEMA_COACH, valider: (o) => (Array.isArray(o?.cartes) ? o : null), parts: [{ text: JSON.stringify(agregats) }], timeoutMs: 60000 });
  return r.cartes.map(validerCarteIA).filter(Boolean);
}

export function validerFrigo(o) {
  if (!o || !Number.isInteger(o.joursCouverts) || !Array.isArray(o.ingredientsDisponibles)) return null;
  return {
    joursCouverts: Math.max(0, Math.min(14, o.joursCouverts)),
    reportCoursesAu: estIso(o.reportCoursesAu) ? o.reportCoursesAu : ajouterJours(aujourdhui(), o.joursCouverts),
    economieEstimeeCentimes: Number.isInteger(o.economieEstimeeCentimes) ? Math.max(0, o.economieEstimeeCentimes) : 0,
    ingredientsDisponibles: o.ingredientsDisponibles.filter((x) => x?.nom).slice(0, 80),
    repasPossibles: (o.repasPossibles || []).filter((x) => x?.nom).slice(0, 20),
    articlesManquants: (o.articlesManquants || []).filter((x) => x?.nom).slice(0, 40),
  };
}

export async function analyserFrigo(image) {
  return genererJSON({ systeme: P.PROMPT_FRIGO, schema: P.SCHEMA_FRIGO, valider: validerFrigo, parts: [{ text: contexte() }, { inlineData: { mimeType: image.mime, data: image.base64 } }], timeoutMs: 60000 });
}

/** Repli explicite (avec consentement) : PDF de relevé non reconnu envoyé à Gemini. */
export async function analyserRelevePDF(base64) {
  return genererJSON({
    systeme: P.PROMPT_RELEVE_REPLI, schema: P.SCHEMA_RELEVE_REPLI, timeoutMs: 90000,
    valider: (o) => (Array.isArray(o?.operations) ? { operations: o.operations.filter((x) => estIso(x.date) && Number.isInteger(x.montantCentimes) && x.montantCentimes > 0 && ['debit', 'credit'].includes(x.sens)) } : null),
    parts: [{ text: 'Relevé à analyser.' }, { inlineData: { mimeType: 'application/pdf', data: base64 } }],
  });
}

// ---------------------------------------------------------------------------
// File d'attente locale
// ---------------------------------------------------------------------------

export async function mettreEnFile(type, donnees) {
  return enregistrer('fileAttenteIA', { id: nouvelId('ia'), type, donnees, essais: 0 });
}

/** Analyse les éléments en attente ; renvoie les propositions (jamais ajoutées sans confirmation). */
export async function traiterFile() {
  const propositions = [];
  for (const it of [...etat.fileAttenteIA]) {
    try {
      let r;
      if (it.type === 'voix') {
        const bin = Uint8Array.from(atob(it.donnees.base64), (c) => c.charCodeAt(0));
        r = await analyserVoix(new Blob([bin], { type: it.donnees.mime }), it.donnees.mime);
      } else if (it.type === 'texte') r = await analyserTexteIA(it.donnees.texte);
      else if (it.type === 'photo') r = { ticket: await analyserTicket(it.donnees) };
      propositions.push({ element: it, resultat: r });
      await supprimerObjet('fileAttenteIA', it.id);
    } catch (e) {
      await enregistrer('fileAttenteIA', { ...it, essais: (it.essais || 0) + 1, derniereErreur: e.message });
      if (e instanceof ErreurGemini && !e.mettreEnFile) break;
    }
  }
  return propositions;
}
