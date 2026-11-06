// capture.js (page) — « Importer une capture d'écran » : une ou plusieurs captures (achat, reçu, liste d'opérations
// de la banque) sont lues sur le téléphone et les dépenses sont AJOUTÉES DIRECTEMENT. Elles apparaissent encadrées
// « Nouvelles dépenses » en haut de la liste (24 h, ou jusqu'à « C'est bon »), puis rejoignent la liste normale.
// Celles déjà dans l'app (même montant à 3 jours près) ne sont pas ajoutées une deuxième fois.

import { h } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { bouton } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat, enregistrerLot, nouvelId } from '../store.js';
import { aujourdhui, estIso } from '../dates.js';
import { nouvelleTransaction, compteCourant } from '../actions.js';
import { iaDisponible } from '../gemini.js';
import { analyserCaptureIA } from '../ia.js';
import { compresserImage } from '../camera.js';
import { aller } from '../router.js';
import { indicationEnvoiGemini } from './communs.js';
import { lireCapture, extraireOperations, fusionnerCaptures, dejaPresente, devinerBanque } from '../capture.js';

/** Choix d'une ou plusieurs images (photothèque, fichiers ou appareil photo). */
function choisirImages() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr' });
    input.addEventListener('change', () => { resolve([...(input.files || [])]); input.remove(); }, { once: true });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); }, { once: true });
    document.body.append(input);
    input.click();
  });
}

/** Enregistre les opérations lues (sans doublon) et les marque « nouvelles ». */
export async function ajouterDepuisCapture(operations, { banque = null } = {}) {
  const compteId = (banque && etat.comptes.find((c) => c.banque === banque)?.id) || compteCourant()?.id;
  const lot = nouvelId('cap');
  const le = new Date().toISOString();
  const ajouts = []; let ignorees = 0;
  for (const o of operations) {
    if (dejaPresente(etat, o) || dejaPresente({ transactions: ajouts.map((a) => a.valeur) }, o)) { ignorees++; continue; }
    const tx = nouvelleTransaction({ sens: o.sens, montantCentimes: o.montantCentimes, libelle: o.libelle, categorie: o.categorie || null, date: estIso(o.date) ? o.date : aujourdhui(), compteId, source: 'capture' });
    tx.nouveauCapture = { lot, le, aVerifier: !!o.incertain || !!o.dateDevinee };
    ajouts.push({ collection: 'transactions', valeur: tx });
  }
  if (ajouts.length) await enregistrerLot(ajouts);
  return { ajoutees: ajouts.length, ignorees, lot };
}

/** Point d'entrée : choix des captures, lecture, ajout, puis ouverture de la liste des dépenses. */
export async function importerCapture() {
  const fichiers = await choisirImages();
  if (!fichiers.length) return;
  const corps = h('div', { class: 'capture' });
  const f = ouvrirFeuille({ titre: fichiers.length > 1 ? `${fichiers.length} captures d’écran` : 'Capture d’écran', contenu: corps });
  const ia = iaDisponible();

  const attente = (texte, avecGemini = false) => corps.replaceChildren(h('div', { class: 'vue-attente' },
    avecGemini
      ? indicationEnvoiGemini(`${fichiers.length > 1 ? 'les captures recompressées' : 'la capture recompressée'} (sans métadonnées), la date du jour et la liste des catégories. Rogne avant ce que tu ne veux pas envoyer (nom, IBAN…).`)
      : h('p', { class: 'petit' }, 'Lecture sur ton téléphone : rien n’est envoyé.'),
    h('div', { class: 'spinner', role: 'progressbar', 'aria-label': 'Lecture en cours' }),
    h('p', { 'aria-live': 'polite' }, texte)));

  function rien(source, message) {
    corps.replaceChildren(h('div', { class: 'capture-vide' },
      h('p', {}, message || 'Je n’ai trouvé aucun montant en euros sur cette capture.'),
      message ? null : h('p', { class: 'petit' }, 'Une capture de la liste des opérations de ton appli bancaire, ou d’un reçu avec son total, marche le mieux.'),
      ia.ok && source !== 'gemini' ? bouton('Relire avec Gemini', () => lireAvecGemini(), { classe: 'btn-principal' }) : null,
      bouton('Saisir à la main', async () => { f.fermer(); const { ouvrirSaisie } = await import('./saisie.js'); ouvrirSaisie('clavier'); }, { classe: 'btn-secondaire' })));
  }

  async function terminer(operations, banque, source) {
    if (!operations.length) return rien(source);
    const r = await ajouterDepuisCapture(operations, { banque });
    if (!r.ajoutees) return rien(source, `Tout ce que j’ai lu est déjà dans l’app (${r.ignorees} opération${r.ignorees > 1 ? 's' : ''}).`);
    f.fermer();
    aller('depenses');
    toast(`${r.ajoutees} dépense${r.ajoutees > 1 ? 's ajoutées' : ' ajoutée'}${r.ignorees ? `, ${r.ignorees} déjà dans l’app` : ''}.`, { type: 'succes' });
  }

  async function lireAvecGemini() {
    attente('Lecture par Gemini…', true);
    const listes = []; let banque = null;
    try {
      for (const fichier of fichiers) {
        const r = await analyserCaptureIA(await compresserImage(fichier, { max: 1600, qualite: 0.85 }));
        banque = banque || r.banque;
        listes.push(r.operations);
      }
    } catch (e) { return rien('gemini', e.message || 'Gemini n’a pas pu lire la capture.'); }
    return terminer(fusionnerCaptures(listes), banque, 'gemini');
  }

  attente('Lecture de la capture…');
  const listes = []; const lignesToutes = [];
  try {
    for (let i = 0; i < fichiers.length; i++) {
      const lignes = await lireCapture(fichiers[i], { surProgres: (t) => attente(fichiers.length > 1 ? `${t} (${i + 1}/${fichiers.length})` : t) });
      lignesToutes.push(...lignes);
      listes.push(extraireOperations(lignes, aujourdhui()).operations);
    }
  } catch (e) {
    console.error(e);
    return rien('telephone', `La lecture sur le téléphone a échoué (${e?.message || e}).`);
  }
  return terminer(fusionnerCaptures(listes), devinerBanque(lignesToutes), 'telephone');
}
