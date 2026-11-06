// reglages.js — Profil & Finances, sécurité, Gemini, sauvegarde, comptes, règles, questions, pont.

import { h, icone, mt, definirMasquage } from '../ui/dom.js';
import { carte, bouton, champ, champMontant, interrupteur, selectionner, segment, etatVide, pastillesCategories } from '../ui/composants.js';
import { ouvrirFeuille, confirmer } from '../ui/sheet.js';
import { toast, toastErreur } from '../ui/toast.js';
import { etat, enregistrer, enregistrerLot, supprimerObjet, majProfil, majParametres, effacerTout, nouvelId } from '../store.js';
import { aller } from '../router.js';
import { demanderPersistance } from '../db.js';
import { revenusDuMois, periodeBudget, soldes, epargneCible } from '../calculs.js';
import { aujourdhui, formatDate, formatMois, ajouterJours, JOURS_LONGS } from '../dates.js';
import { formatEuros, versChamp } from '../money.js';
import { CATEGORIES, categorie, nomCategorie, definirNomsCategories } from '../categories.js';
import { libelleRegle } from '../rules.js';
import { exporterSauvegarde, feuilleRevenus, indicationEnvoiGemini } from './communs.js';
import { confirmerRevenus, declarerSolde, recategoriser } from '../actions.js';
import { listerModeles, testerCle, choisirFlashStable, MODELE_DEFAUT, iaDisponible } from '../gemini.js';
import { traiterFile, analyserFrigo } from '../ia.js';
import { definirPin, supprimerPin, PIN_EST_UN_VERROU } from '../securite.js';
import { appliquerTheme } from '../app-theme.js';
import { SCHEMA_VERSION } from '../migrations.js';
import { coller, recevoir, envoyerAchatsTicket, envoyerListeCourses, messageFrigo } from '../bridge.js';
import { choisirPhoto, compresserImage } from '../camera.js';
import { rendreImport } from './import.js';
import { versionApp } from '../version.js';

export const titre = 'Réglages';

// Sections des réglages : chacune s'ouvre sur sa propre page (#reglages/<section>).
const SECTIONS = {
  revenus: { titre: 'Revenus et logement', icone: 'mallette' },
  epargne: { titre: 'Épargne et arrondis', icone: 'tirelire' },
  operations: { titre: 'Opérations et catégories', icone: 'liste' },
  sauvegarde: { titre: 'Sauvegarde', icone: 'partage' },
  profil: { titre: 'Profil', icone: 'personnes' },
  confidentialite: { titre: 'Confidentialité et apparence', icone: 'cadenas' },
  gemini: { titre: 'Gemini (IA)', icone: 'etoile' },
  pont: { titre: 'App Repas & Courses', icone: 'panier' },
  diagnostic: { titre: 'Diagnostic', icone: 'recherche' },
  apropos: { titre: 'À propos', icone: 'info' },
};

export function rendre(vue, params = []) {
  const sous = params[0];
  if (sous === 'import') return rendreImport(vue);
  if (sous === 'questions') return rendreQuestions(vue);
  if (sous === 'regles') return rendreRegles(vue);
  if (sous === 'charges') return rendreCharges(vue);
  if (SECTIONS[sous]) return vue.replaceChildren(retour(), h('h1', { class: 'titre-page' }, SECTIONS[sous].titre), ...cartesSection(sous).filter(Boolean));
  rendreAccueilReglages(vue);
}

/** Page d'entrée : le bouton d'import du fichier, puis une ligne par section. */
function rendreAccueilReglages(vue) {
  const p = etat.profil; const pa = etat.parametres;
  const mois = periodeBudget(aujourdhui(), p).mois;
  const rev = revenusDuMois(etat, mois);
  const ia = iaDisponible();
  const nbQuestions = etat.questions.filter((q) => q.statut === 'ouverte').length;
  const der = etat.meta.derniereMiseAJour;
  const vide = !etat.transactions.length;
  const sect = (id, detail) => lien(SECTIONS[id].titre, detail, () => aller(`reglages/${id}`), SECTIONS[id].icone);
  vue.replaceChildren(
    h('h1', { class: 'titre-page' }, 'Réglages'),
    carte(null, h('div', { class: 'bloc-fichier' },
      h('p', { class: 'bloc-fichier-titre' }, 'Mon fichier budget-import-prive.json'),
      h('p', { class: 'petit' }, vide ? 'Remplit l’app avec ton historique, tes dettes et ton plan.' : der ? `Dernière mise à jour le ${formatDate(der.le.slice(0, 10))}. Tes saisies dans l’app sont toujours gardées.` : 'Met l’app à jour avec la dernière version du fichier. Tes saisies dans l’app sont gardées.'),
      bouton('Importer mon fichier', () => choisirFichierMiseAJour(), { classe: 'btn-principal btn-large', icone: 'telecharger' }))),
    carte('Mes données', h('div', { class: 'liste-liens' },
      nbQuestions ? lien('Questions sur tes relevés', `${nbQuestions} en attente`, () => aller('reglages/questions'), 'info') : null,
      sect('revenus', `${formatEuros(rev.totalCentimes)} ce mois-ci`),
      sect('epargne', `${formatEuros(epargneCible(etat, periodeBudget(aujourdhui(), p).mois, periodeBudget(aujourdhui(), p)))} possibles ce mois-ci`),
      sect('operations', 'relevés, prélèvements, catégories'),
      sect('sauvegarde', pa.derniereSauvegarde ? `dernière le ${formatDate(pa.derniereSauvegarde.slice(0, 10))}` : 'aucune pour l’instant'))),
    carte('L’app', h('div', { class: 'liste-liens' },
      sect('profil', p.prenomAffichage || 'prénom, jour de salaire'),
      sect('confidentialite', pa.pinHash ? 'code PIN actif' : 'sans code PIN'),
      lien('Forcer la mise à jour', `version ${versionApp}, tes données restent`, () => forcerMiseAJour(), 'boucle'))),
    h('details', { class: 'reglages-avance' },
      h('summary', {}, 'Avancé'),
      carte(null, h('div', { class: 'liste-liens' },
        sect('gemini', ia.ok ? 'activé' : 'désactivé'),
        sect('pont', 'échanges avec l’app Repas'),
        sect('diagnostic', 'tester toute l’app et me l’envoyer'),
        sect('apropos', `version ${versionApp}`)))),
  );
}

/** Contenu de chaque section (mêmes réglages qu'avant, rangés par thème). */
function cartesSection(id) {
  const p = etat.profil; const pa = etat.parametres;
  const mois = periodeBudget(aujourdhui(), p).mois;
  const rev = revenusDuMois(etat, mois);
  const ia = iaDisponible();
  const nbQuestions = etat.questions.filter((q) => q.statut === 'ouverte').length;
  if (id === 'revenus') return [
    carte('Revenus du mois', h('div', {},
      h('div', { class: 'liste-cles' },
        h('div', { class: 'ligne-cle' }, h('span', {}, `Salaire net (${formatMois(mois)})`), mt(rev.salaireCentimes)),
        h('div', { class: 'ligne-cle' }, h('span', {}, "Prime d'activité (CAF)"), mt(rev.primeActiviteCentimes)),
        ...(rev.autresEntrees || []).map((e) => h('div', { class: 'ligne-cle' }, h('span', {}, e.libelle), mt(e.montantCentimes))),
        h('div', { class: 'ligne-cle forte' }, h('span', {}, `Total ${rev.statut === 'attendu' ? '(attendu)' : '(confirmé)'}`), mt(rev.totalCentimes))),
      h('div', { class: 'groupe-boutons' }, bouton('Saisir au centime', () => feuilleRevenus(mois), { classe: 'btn-principal btn-petit' }), bouton('+ Ajouter une autre entrée', () => autreEntree(mois), { classe: 'btn-petit' }), bouton('Historique', () => historiqueRevenus(), { classe: 'btn-petit' })),
      h('p', { class: 'petit' }, 'Le taux horaire et les calculs du mois utilisent ces montants exacts. L’aide au logement n’y figure jamais.'))),
    carte('Logement', h('div', { class: 'formulaire' },
      champ('Loyer à payer (aide déjà déduite)', champMontant({ valeur: p.loyerAPayerCentimes || null, onValeur: (v) => { if (v !== null) majProfil({ loyerAPayerCentimes: v }); } }), 'Montant que tu paies réellement, utilisé tel quel dans les charges fixes.'),
      champ('Jour de prélèvement du loyer', h('input', { class: 'input', inputmode: 'numeric', value: p.jourLoyer ? String(p.jourLoyer) : '', onchange: (e) => { const j = Math.max(1, Math.min(31, Number(e.target.value) || 1)); majProfil({ jourLoyer: j }); const cf = etat.chargesFixes.find((c) => c.estLoyer); if (cf) enregistrer('chargesFixes', { ...cf, jourPrelevement: j }); } })),
      h('details', {}, h('summary', {}, 'Loyer brut et aide (facultatif, informatif)'),
        champ('Loyer brut', champMontant({ valeur: p.loyerBrutCentimes, onValeur: (v) => majProfil({ loyerBrutCentimes: v }) })),
        champ('Aide au logement', champMontant({ valeur: p.aideLogementCentimes, onValeur: (v) => majProfil({ aideLogementCentimes: v }) }), 'Aide versée au bailleur, non comptabilisée dans vos revenus.')))),
  ];
  if (id === 'epargne') return [
    carte('Comment l’épargne est calculée', h('div', { class: 'formulaire' },
      h('p', { class: 'petit' }, `L’épargne passe après tes dépenses obligatoires : prélèvements, remboursements, et le nécessaire du quotidien (courses, transports, santé, d’après tes 3 derniers mois). Elle prend le maximum de ce qui reste, sans montant fixe. Ce mois-ci : ${formatEuros(epargneCible(etat, periodeBudget(aujourdhui(), p).mois, periodeBudget(aujourdhui(), p)))}.`),
      champ('Quotidien obligatoire, au minimum', champMontant({ valeur: p.parametresPlan?.vieMinCentimes ?? 37500, onValeur: (v) => v !== null && majProfil({ parametresPlan: { ...p.parametresPlan, vieMinCentimes: v } }) }), 'Si tes 3 derniers mois montrent plus, c’est ce montant mesuré qui est gardé pour vivre.'),
      h('div', { class: 'deux-colonnes' },
        champ('Taux Livret A (%)', h('input', { class: 'input', inputmode: 'decimal', value: String(pa.tauxLivretA).replace('.', ','), onchange: (e) => majParametres({ tauxLivretA: Number(e.target.value.replace(',', '.')) || 0 }) })),
        champ('Taux LEP (%)', h('input', { class: 'input', inputmode: 'decimal', value: String(pa.tauxLEP).replace('.', ','), onchange: (e) => majParametres({ tauxLEP: Number(e.target.value.replace(',', '.')) || 0 }) }))),
      bouton('Enveloppes', () => aller('budgets'), { icone: 'balance' }))),
    carte('Arrondis à l’euro supérieur', h('div', { class: 'formulaire' },
      interrupteur('Activer la cagnotte d’arrondis', p.arrondi?.actif, (v) => majProfil({ arrondi: { ...p.arrondi, actif: v, depuis: p.arrondi?.depuis || aujourdhui() } })),
      champ('Fréquence du virement', segment([['hebdomadaire', 'Semaine'], ['quinzaine', '15 jours'], ['mensuelle', 'Mois']], p.arrondi?.frequence || 'hebdomadaire', (v) => majProfil({ arrondi: { ...p.arrondi, frequence: v } }), 'Fréquence')),
      champ('Jour du virement', selectionner(JOURS_LONGS.map((j, i) => [String(i + 1), j]), String(p.arrondi?.jourVirement || 4), (v) => majProfil({ arrondi: { ...p.arrondi, jourVirement: Number(v) } })), 'Hebdomadaire par défaut : petits montants réguliers, moins de risque de découvert.'),
      interrupteur('Arrondir aussi les charges fixes', p.arrondi?.inclureChargesFixes, (v) => majProfil({ arrondi: { ...p.arrondi, inclureChargesFixes: v } })),
      champ('Poche alimentée', selectionner(etat.poches.map((x) => [x.id, x.nom]), p.arrondi?.pocheId || 'poche-coussin', (v) => majProfil({ arrondi: { ...p.arrondi, pocheId: v } }))))),
  ];
  if (id === 'operations') return [
    carte(null, h('div', { class: 'liste-liens' },
      lien('Questions sur tes relevés', nbQuestions ? `${nbQuestions} en attente` : 'à jour', () => aller('reglages/questions'), 'info'),
      lien('Importer un relevé', 'PDF LCL ou Revolut, CSV', () => aller('reglages/import'), 'importer'),
      lien('Charges fixes', `${etat.chargesFixes.filter((c) => c.actif).length} actives`, () => aller('reglages/charges'), 'calendrier'),
      lien('Abonnements', 'liste, limite, alternatives gratuites', () => aller('abonnements'), 'boucle'),
      lien('Règles de catégorisation', `${etat.reglesCategorie.length} règles`, () => aller('reglages/regles'), 'liste'),
      lien('Catégories', `${CATEGORIES.length}`, () => feuilleCategories(), 'etoile'),
      lien('Comptes et soldes', `${etat.comptes.length} comptes`, () => feuilleComptes(), 'banque'))),
    carte('Règle Revolut', h('div', { class: 'formulaire' },
      interrupteur('Virement à un particulier = commande Uber Eats via un tiers', p.regleRevolut?.actif !== false, (v) => majProfil({ regleRevolut: { ...p.regleRevolut, actif: v } })),
      h('div', { class: 'deux-colonnes' },
        champ('Montant minimum', champMontant({ valeur: p.regleRevolut?.minCentimes ?? 1000, onValeur: (v) => v !== null && majProfil({ regleRevolut: { ...p.regleRevolut, minCentimes: v } }) })),
        champ('Montant maximum', champMontant({ valeur: p.regleRevolut?.maxCentimes ?? 1800, onValeur: (v) => v !== null && majProfil({ regleRevolut: { ...p.regleRevolut, maxCentimes: v } }) }))),
      h('p', { class: 'petit' }, 'Hors de cette fourchette, l’app te demande de qualifier le virement.'))),
  ];
  if (id === 'sauvegarde') return [
    carte('Sauvegarde', h('div', {},
      h('p', {}, pa.derniereSauvegarde ? `Dernière sauvegarde : ${formatDate(pa.derniereSauvegarde.slice(0, 10))}.` : 'Aucune sauvegarde pour l’instant.'),
      h('p', { class: 'petit' }, 'Fais-la chaque semaine : tes données ne vivent que sur cet iPhone (aucun serveur). Enregistre le fichier dans Fichiers ou iCloud Drive.'),
      h('div', { class: 'groupe-boutons' }, bouton('Exporter (partager le fichier)', () => exporterSauvegarde(), { classe: 'btn-principal btn-petit', icone: 'partage' }), bouton('Restaurer', () => aller('reglages/import'), { classe: 'btn-petit', icone: 'importer' })),
      stockage())),
  ];
  if (id === 'profil') return [
    carte('Profil', h('div', { class: 'formulaire' },
      champ('Prénom affiché', h('input', { class: 'input', value: p.prenomAffichage || '', onchange: (e) => majProfil({ prenomAffichage: e.target.value.trim() }) })),
      champ('Jour de salaire habituel', h('input', { class: 'input', inputmode: 'numeric', value: String(p.jourSalaireHabituel || 1), onchange: (e) => majProfil({ jourSalaireHabituel: Math.max(1, Math.min(28, Number(e.target.value) || 1)) }) }), 'Le mois budgétaire va de ce jour à la veille du salaire suivant.'),
      champ('Heures travaillées par mois', h('input', { class: 'input', inputmode: 'decimal', value: String(p.heuresMensuelles || 151.67).replace('.', ','), onchange: (e) => majProfil({ heuresMensuelles: Number(e.target.value.replace(',', '.')) || 151.67 }) })),
      champ('Nom du titulaire sur les relevés', h('input', { class: 'input', value: p.nomTitulaire || '', autocomplete: 'off', onchange: (e) => majProfil({ nomTitulaire: e.target.value.trim() }) }), 'Stocké uniquement sur cet iPhone : sert à reconnaître tes virements à toi-même.'))),
  ];
  if (id === 'confidentialite') return [
    carte('Confidentialité', h('div', { class: 'formulaire' },
      interrupteur('Mode 100 % local', pa.mode100Local, (v) => majParametres({ mode100Local: v }), 'Tout fonctionne par règles ; aucune requête réseau hors mise à jour de l’app.'),
      interrupteur('Masquer les montants', pa.masquageMontants, (v) => { definirMasquage(v); majParametres({ masquageMontants: v }); }),
      h('div', { class: 'ligne-reglage' }, h('span', { class: 'ligne-reglage-libelle' }, 'Code PIN', h('small', {}, PIN_EST_UN_VERROU)), pa.pinHash ? h('div', { class: 'groupe-boutons' }, bouton('Changer', () => feuillePin(), { classe: 'btn-petit' }), bouton('Supprimer', async () => { await supprimerPin(); toast('Code PIN supprimé.'); }, { classe: 'btn-petit btn-danger-texte' })) : bouton('Définir', () => feuillePin(), { classe: 'btn-petit' })))),
    carte('Apparence', segment([['auto', 'Automatique'], ['clair', 'Clair'], ['sombre', 'Sombre']], pa.theme || 'auto', async (v) => { await majParametres({ theme: v }); appliquerTheme(v); }, 'Thème')),
  ];
  if (id === 'gemini') return [
    carteGemini(ia),
  ];
  if (id === 'pont') return [
    cartePont(ia),
  ];
  if (id === 'diagnostic') return [
    carteDiagnostic(ia),
  ];
  if (id === 'apropos') return [
    carte('À propos', h('div', {},
      h('p', { class: 'petit' }, `Budget ${versionApp} · schéma de données ${SCHEMA_VERSION} · ${etat.transactions.length.toLocaleString('fr-FR')} transactions.`),
      bouton('Revoir l’accueil de démarrage', () => { majParametres({ onboarding: { ...pa.onboarding, termine: false, etape: 0 } }); aller('onboarding'); }, { classe: 'btn-petit' }),
      bouton('Effacer toutes les données', effacer, { classe: 'btn-danger-texte' }))),
  ];
  return [];
}

/**
 * Télécharge la dernière version publiée de l'app (en ignorant tous les caches) puis recharge.
 * Ne touche qu'aux fichiers de l'app : les données (IndexedDB) ne sont jamais effacées.
 */
export async function forcerMiseAJour() {
  if (!navigator.onLine) { toastErreur('Pas de connexion internet : la mise à jour ne peut pas être téléchargée.'); return; }
  const f = ouvrirFeuille({ titre: 'Mise à jour', contenu: h('div', { class: 'formulaire' }, h('p', { class: 'maj-etat' }, 'Recherche de la dernière version…'), h('p', { class: 'petit' }, 'Tes données restent sur ton téléphone.')) });
  const etape = (t) => { const el = document.querySelector('.maj-etat'); if (el) el.textContent = t; };
  try {
    const r = await fetch(`./sw.js?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`le serveur a répondu ${r.status}`);
    const texte = await r.text();
    const enLigne = texte.match(/const VERSION = '([^']+)'/)?.[1] || '?';
    const fichiers = [...new Set(texte.match(/'\.\/[^']*'/g) || [])].map((x) => x.slice(1, -1));
    etape(enLigne === versionApp ? `Tu as déjà la ${enLigne} : je la retélécharge en entier…` : `Version ${enLigne} trouvée (tu as la ${versionApp}). Téléchargement…`);
    // Rafraîchit le cache HTTP du navigateur pour chaque fichier de l'app
    let n = 0;
    await Promise.all(fichiers.map(async (u) => { try { await fetch(u, { cache: 'reload' }); } catch { /* fichier manquant : rechargé à la demande */ } n++; etape(`Téléchargement… ${n}/${fichiers.length}`); }));
    // Vide les fichiers de l'app gardés hors ligne (pas les données)
    if ('caches' in globalThis) for (const k of await caches.keys()) if (k.startsWith('budget-coquille')) await caches.delete(k);
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) {
      etape('Installation…');
      await reg.update().catch(() => {});
      const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
      for (let i = 0; i < 20 && reg.installing; i++) await attendre(250);
      if (reg.waiting) {
        const change = new Promise((ok) => navigator.serviceWorker.addEventListener('controllerchange', ok, { once: true }));
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        await Promise.race([change, attendre(3000)]);
      }
    }
    etape('Redémarrage de l’app…');
    location.reload();
  } catch (e) {
    f.fermer();
    toastErreur(`Mise à jour impossible : ${e.message}. Réessaie avec une connexion internet.`);
  }
}

/** Choix du fichier privé (même nom, même emplacement) puis mise à jour sans perte. */
function choisirFichierMiseAJour() {
  const input = h('input', { type: 'file', accept: '.json,application/json', class: 'sr', onchange: async (e) => {
    const fichier = e.target.files[0]; input.remove();
    if (!fichier) return;
    let objet;
    try { objet = JSON.parse(await fichier.text()); } catch { toastErreur('Ce fichier n’est pas un JSON valide.'); return; }
    const { lireSauvegarde } = await import('../sauvegarde.js');
    const r = lireSauvegarde(objet);
    if (!r.ok) { toastErreur(r.erreurs.join(' ')); return; }
    const { mettreAJourDepuisFichier } = await import('./import.js');
    await mettreAJourDepuisFichier(objet, r, { apres: () => aller('accueil') });
  } });
  document.body.append(input);
  input.click();
}

/** Diagnostic : teste toute l'app et produit un rapport détaillé à copier ou à partager. */
let optionGeminiDiag = null;
let dernierRapport = null;
function carteDiagnostic(ia) {
  if (optionGeminiDiag === null) optionGeminiDiag = ia.ok;
  return carte('Diagnostic', h('div', { class: 'formulaire' },
    h('p', { class: 'petit' }, 'Teste l’app de bout en bout (stockage, hors ligne, données, calculs, chaque page, sauvegarde, tests automatiques) et produit un rapport détaillé à m’envoyer pour corriger les erreurs. Le rapport ne contient ni libellés d’opérations, ni prénoms, ni clé.'),
    ia.ok ? interrupteur('Inclure les tests Gemini', optionGeminiDiag, (v) => { optionGeminiDiag = v; }, 'Envoie une phrase fictive et un bip de test, aucune de tes données') : null,
    bouton('Lancer le test complet', () => ouvrirDiagnostic(), { classe: 'btn-principal', icone: 'recherche' }),
    dernierRapport ? bouton('Revoir le dernier rapport', () => feuilleRapport(dernierRapport), { classe: 'btn-petit' }) : null));
}

async function ouvrirDiagnostic() {
  const { lancerDiagnostic } = await import('../diagnostic.js');
  const etatTexte = h('p', { class: 'diag-etat', 'aria-live': 'polite' }, 'Démarrage…');
  const remplissage = h('span', { class: 'diag-barre-remplie' });
  const barre = h('div', { class: 'diag-barre', role: 'progressbar', 'aria-label': 'Avancement du diagnostic', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, remplissage);
  const pourcent = h('p', { class: 'diag-pourcent' }, '0 %');
  const liste = h('ol', { class: 'diag-liste' });
  const zoneActions = h('div', { class: 'groupe-boutons' });
  const zoneActionsFin = h('div', { class: 'groupe-boutons diag-fin' });
  const f = ouvrirFeuille({ titre: 'Diagnostic', plein: true, contenu: h('div', { class: 'diag' },
    optionGeminiDiag && iaDisponible().ok ? indicationEnvoiGemini('une phrase fictive (« deux cafés à 3,20 euros hier »), un bip audio de 1 s et trois demandes « Réponds OK ». Aucune de tes données.') : null,
    etatTexte, h('div', { class: 'diag-avancement' }, barre, pourcent), zoneActions, liste, zoneActionsFin) });
  const symboles = { ok: '✓', avert: '!', echec: '✗', info: 'i' };
  let n = 0;
  try {
    const rapport = await lancerDiagnostic({ gemini: optionGeminiDiag && iaDisponible().ok, surProgres: (r, { fait, total }) => {
      n++;
      const pct = Math.round((fait / total) * 100);
      remplissage.style.width = `${pct}%`; barre.setAttribute('aria-valuenow', String(pct));
      pourcent.textContent = `${pct} % · ${fait}/${total}`;
      etatTexte.textContent = `Test en cours : ${r.section}…`;
      liste.append(h('li', { class: `diag-ligne diag-${r.statut}` }, h('span', { class: 'diag-symbole', 'aria-hidden': 'true' }, symboles[r.statut]), h('span', {}, h('strong', {}, `${r.section} › ${r.nom}`), h('small', {}, r.detail.split('\n')[0].slice(0, 220)))));
    } });
    dernierRapport = rapport;
    const nb = (s) => rapport.resultats.filter((x) => x.statut === s).length;
    etatTexte.textContent = `Terminé en ${(rapport.duree / 1000).toFixed(1)} s : ${nb('ok')} OK, ${nb('avert')} avertissement(s), ${nb('echec')} échec(s).`;
    etatTexte.className = `diag-etat ${nb('echec') ? 'negatif-texte' : nb('avert') ? 'orange-texte' : 'vert-texte'}`;
    zoneActions.replaceChildren(...actionsRapport(rapport));
    zoneActionsFin.replaceChildren(...actionsRapport(rapport));
    barre.classList.add('termine');
  } catch (e) {
    etatTexte.textContent = `Le diagnostic s’est arrêté : ${e.message}`;
    etatTexte.className = 'diag-etat negatif-texte';
  }
  return f;
}

function actionsRapport(rapport) {
  const nomFichier = `diagnostic-budget-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`;
  return [
    bouton('Copier le rapport', async () => {
      try { await navigator.clipboard.writeText(rapport.markdown); toast('Rapport copié : colle-le dans ta conversation avec Claude.', { type: 'succes' }); }
      catch {
        const zone = h('textarea', { class: 'input', readonly: true, rows: '8', 'aria-label': 'Rapport' }, rapport.markdown);
        ouvrirFeuille({ titre: 'Copie manuelle', contenu: h('div', {}, h('p', { class: 'petit' }, 'Sélectionne tout le texte puis Copier.'), zone) });
        setTimeout(() => { zone.focus(); zone.select(); }, 350);
      }
    }, { classe: 'btn-principal', icone: 'copier' }),
    bouton('Partager le fichier', async () => {
      const fichier = new File([rapport.markdown], nomFichier, { type: 'text/markdown' });
      if (navigator.canShare?.({ files: [fichier] })) { try { await navigator.share({ files: [fichier], title: 'Diagnostic Budget' }); } catch { /* partage annulé */ } return; }
      const a = h('a', { href: URL.createObjectURL(fichier), download: nomFichier }); document.body.append(a); a.click(); a.remove();
    }, { icone: 'partage' }),
  ];
}

function feuilleRapport(rapport) {
  ouvrirFeuille({ titre: 'Dernier rapport', plein: true, contenu: h('div', { class: 'diag' }, h('div', { class: 'groupe-boutons' }, actionsRapport(rapport)), h('pre', { class: 'diag-texte' }, rapport.markdown.split('## Données brutes')[0])) });
}

function lien(titreL, detail, action, ic) {
  return h('button', { type: 'button', class: 'ligne-lien', onclick: action }, icone(ic), h('span', { class: 'ligne-lien-texte' }, titreL, h('small', {}, detail)), icone('suivant'));
}

function stockage() {
  const zone = h('p', { class: 'petit', 'aria-live': 'polite' }, 'Stockage : vérification…');
  demanderPersistance().then((s) => {
    zone.textContent = !s.disponible ? 'Stockage persistant : non pris en charge par ce navigateur (fais des sauvegardes régulières).' :
      `Stockage persistant : ${s.persistant ? 'accordé — iOS ne purgera pas tes données' : 'refusé — installe l’app sur l’écran d’accueil et sauvegarde chaque semaine'}${s.usage !== null ? ` · ${(s.usage / 1048576).toFixed(1).replace('.', ',')} Mo utilisés` : ''}.`;
  });
  return zone;
}

function autreEntree(mois) {
  let lib = ''; let m = null;
  const f = ouvrirFeuille({
    titre: 'Autre entrée du mois',
    contenu: h('div', { class: 'formulaire' }, champ('Source', h('input', { class: 'input', placeholder: 'Vente Vinted, remboursement CPAM, pourboires…', oninput: (e) => { lib = e.target.value; } })), champ('Montant', champMontant({ onValeur: (v) => { m = v; }, autofocus: true }))),
    actions: [bouton('Annuler', () => f.fermer()), bouton('Ajouter', async () => {
      if (!lib.trim() || !m) { toast('Source et montant.', { type: 'erreur' }); return; }
      const r = revenusDuMois(etat, mois);
      const existant = etat.revenusMensuels.find((x) => x.mois === mois);
      await enregistrer('revenusMensuels', { ...(existant || { mois, salaireCentimes: r.salaireCentimes, primeActiviteCentimes: r.primeActiviteCentimes, statut: 'attendu' }), id: mois, mois, autresEntrees: [...(existant?.autresEntrees || []), { id: nouvelId('ae'), libelle: lib.trim(), montantCentimes: m }] });
      f.fermer(); toast('Entrée ajoutée aux revenus du mois.', { type: 'succes' });
    }, { classe: 'btn-principal' })],
  });
}

function historiqueRevenus() {
  const liste = [...etat.revenusMensuels].sort((a, b) => (a.mois < b.mois ? 1 : -1));
  ouvrirFeuille({
    titre: 'Revenus mois par mois', plein: true,
    contenu: liste.length ? h('div', { class: 'liste' }, liste.map((r) => h('button', { type: 'button', class: 'ligne-choix', onclick: () => feuilleRevenus(r.mois) },
      h('span', {}, formatMois(r.mois), h('small', {}, r.statut === 'confirme' ? ' · confirmé' : ' · attendu')),
      h('span', {}, mt((r.salaireCentimes || 0) + (r.primeActiviteCentimes || 0) + (r.autresEntrees || []).reduce((s, e) => s + e.montantCentimes, 0)))))) : etatVide('mallette', 'Aucun mois', 'Les revenus détectés à l’import apparaissent ici, modifiables au centime.'),
  });
}

function carteGemini(ia) {
  const pa = etat.parametres;
  const cle = h('input', { class: 'input', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, value: pa.cleGemini || '', placeholder: 'Clé API Google AI Studio', 'aria-label': 'Clé API Gemini' });
  cle.addEventListener('change', () => majParametres({ cleGemini: cle.value.trim() }));
  const liste = h('datalist', { id: 'modeles-gemini' });
  const modele = h('input', { class: 'input', 'aria-label': 'Modèle Gemini', list: 'modeles-gemini', value: pa.modeleGemini || MODELE_DEFAUT, autocapitalize: 'off', spellcheck: false, onchange: (e) => majParametres({ modeleGemini: e.target.value.trim() || null }) });
  const statut = h('p', { class: 'petit', 'aria-live': 'polite' });
  const appels = pa.appelsIA?.date === aujourdhui() ? pa.appelsIA.nb : 0;
  return carte('Gemini (facultatif)', h('div', { class: 'formulaire' },
    h('p', { class: 'petit' }, 'La clé est stockée uniquement sur cet iPhone, envoyée en en-tête (jamais dans l’URL) et jamais journalisée. Avant chaque envoi, l’app affiche ce qui part.'),
    champ('Clé API', cle),
    champ('Modèle', h('div', {}, modele, liste), 'Par défaut : le Flash stable le plus récent. Liste chargée depuis l’API.'),
    h('div', { class: 'groupe-boutons' },
      bouton('Charger les modèles', async () => {
        try { await majParametres({ cleGemini: cle.value.trim() }); const noms = await listerModeles(cle.value.trim()); liste.replaceChildren(...noms.map((n) => h('option', { value: n }))); const meilleur = choisirFlashStable(noms); statut.textContent = `${noms.length} modèles disponibles${meilleur ? ` · Flash stable le plus récent : ${meilleur}` : ''}.`; if (meilleur && !pa.modeleGemini) { modele.value = meilleur; await majParametres({ modeleGemini: meilleur }); } }
        catch (e) { statut.textContent = e.message; }
      }, { classe: 'btn-petit' }),
      bouton('Tester la clé', async () => { statut.textContent = 'Test en cours…'; try { await majParametres({ cleGemini: cle.value.trim() }); await testerCle(); statut.textContent = 'Clé valide : Gemini répond.'; } catch (e) { statut.textContent = e.message; } }, { classe: 'btn-petit' })),
    statut,
    h('p', { class: 'petit' }, `Appels aujourd'hui : ${appels}. ${ia.ok ? '' : ia.raison}`),
    etat.fileAttenteIA.length ? h('div', { class: 'ligne-reglage' }, h('span', {}, `${etat.fileAttenteIA.length} saisie(s) en attente d'analyse`), bouton('Analyser maintenant', async () => {
      try {
        const props = await traiterFile();
        if (!props.length) { toast('Rien n’a pu être analysé pour l’instant.'); return; }
        const { ouvrirSaisieAvec } = await import('./saisie-file.js');
        ouvrirSaisieAvec(props);
      } catch (e) { toastErreur(e.message); }
    }, { classe: 'btn-petit' })) : null));
}

function cartePont(ia) {
  const zone = h('div', { 'aria-live': 'polite' });
  return carte('Pont avec l’app Repas & Courses', h('div', {},
    h('p', { class: 'petit' }, 'Les deux apps ont des stockages séparés sur iPhone : on échange par lien, fichier ou presse-papier, toujours avec aperçu et confirmation.'),
    champ('Adresse de l\u2019app Repas (facultatif)', h('input', { class: 'input', type: 'url', inputmode: 'url', autocapitalize: 'off', placeholder: 'adresse github.io de l\u2019app Repas', value: etat.parametres.urlAppRepas || '', onchange: (e) => majParametres({ urlAppRepas: e.target.value.trim() }) }), 'Permet d\u2019envoyer un lien « #bridge=… » ; sinon un fichier ou le presse-papier.'),
    h('div', { class: 'groupe-boutons' },
      bouton('Coller depuis l’autre app', async () => { try { const r = await coller(); await recevoir(r); } catch (e) { toastErreur(e.message); } }, { classe: 'btn-petit', icone: 'copier' }),
      bouton('Envoyer mes derniers tickets', async () => { try { await envoyerAchatsTicket(); } catch (e) { toastErreur(e.message); } }, { classe: 'btn-petit', icone: 'ticket' }),
      ia.ok ? bouton('Photo du frigo', async () => {
        const f = await choisirPhoto(); if (!f) return;
        const img = await compresserImage(f);
        zone.replaceChildren(indicationEnvoiGemini('la photo du frigo ou des placards (recompressée, sans métadonnées).'), h('p', {}, 'Analyse…'));
        try {
          const r = await analyserFrigo(img);
          zone.replaceChildren(h('p', { class: 'message-frigo' }, messageFrigo(r)), h('p', { class: 'petit' }, `Repas possibles : ${r.repasPossibles.map((x) => x.nom).join(', ') || '—'}`), h('p', { class: 'petit' }, `Manquant : ${r.articlesManquants.map((x) => x.nom).join(', ') || 'rien'}`), bouton('Envoyer la liste à Repas & Courses', () => envoyerListeCourses(r), { classe: 'btn-principal btn-petit' }));
        } catch (e) { zone.replaceChildren(h('p', { class: 'erreur' }, e.message)); }
      }, { classe: 'btn-petit', icone: 'frigo' }) : null),
    zone,
    etat.parametres.profilNutrition ? h('p', { class: 'petit' }, `Profil nutrition reçu : interdits ${etat.parametres.profilNutrition.interdits.join(', ') || 'aucun'}.`) : null));
}

function feuillePin() {
  let a = ''; let b = '';
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true });
  const f = ouvrirFeuille({
    titre: 'Code PIN',
    contenu: h('div', { class: 'formulaire' },
      h('p', { class: 'petit' }, PIN_EST_UN_VERROU),
      champ('Nouveau code (4 à 8 chiffres)', h('input', { class: 'input', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '8', oninput: (e) => { a = e.target.value; } })),
      champ('Confirmer', h('input', { class: 'input', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '8', oninput: (e) => { b = e.target.value; } })), erreur),
    actions: [bouton('Annuler', () => f.fermer()), bouton('Enregistrer', async () => {
      if (!/^\d{4,8}$/.test(a)) { erreur.hidden = false; erreur.textContent = '4 à 8 chiffres.'; return; }
      if (a !== b) { erreur.hidden = false; erreur.textContent = 'Les deux codes diffèrent.'; return; }
      await definirPin(a); f.fermer(); toast('Code PIN défini.', { type: 'succes' });
    }, { classe: 'btn-principal' })],
  });
}

function feuilleComptes() {
  const s = soldes(etat, aujourdhui());
  const f = ouvrirFeuille({
    titre: 'Comptes et soldes', plein: true,
    contenu: h('div', {}, s.comptes.map(({ compte: c, soldeCentimes }) => {
      let reel = null;
      return h('div', { class: 'compte-reglage' },
        h('div', { class: 'ligne-cle forte' }, h('span', {}, c.nom, h('small', {}, ` · ${({ courant: 'compte courant', neobanque: 'néobanque', especes: 'espèces', epargne: 'épargne' })[c.type]}`)), mt(soldeCentimes)),
        champ('Nom', h('input', { class: 'input', value: c.nom, onchange: (e) => enregistrer('comptes', { ...c, nom: e.target.value.trim() || c.nom }) })),
        champ('Solde réel aujourd’hui', champMontant({ onValeur: (v) => { reel = v; } }), 'Crée une seule ligne « Ajustement de solde » (hors dépenses et revenus) pour coller à la réalité ; elle se recalcule à chaque import.'),
        bouton('Déclarer ce solde', async () => { if (reel === null) return; await declarerSolde(c.id, reel); f.fermer(); toast(`Solde de ${c.nom} aligné sur ${formatEuros(reel)}.`, { type: 'succes' }); }, { classe: 'btn-petit' }));
    }), bouton('Ajouter un compte', async () => { await enregistrer('comptes', { id: nouvelId('cpt'), nom: 'Nouveau compte', type: 'courant', banque: 'autre', soldeInitialCentimes: 0, dateSoldeInitial: null, soldeReference: null }); f.fermer(); feuilleComptes(); }, { icone: 'plus' })),
  });
}

function feuilleCategories() {
  ouvrirFeuille({
    titre: 'Catégories', plein: true,
    contenu: h('div', { class: 'formulaire' }, h('p', { class: 'petit' }, 'Renomme une catégorie : le changement s’applique partout.'),
      CATEGORIES.filter((c) => c.id !== 'ajustement').map((c) => champ(c.id, h('input', { class: 'input', value: nomCategorie(c.id), onchange: async (e) => { const noms = { ...(etat.parametres.nomsCategories || {}), [c.id]: e.target.value.trim() || c.nom }; await majParametres({ nomsCategories: noms }); definirNomsCategories(noms); } })))),
  });
}

async function effacer() {
  const ok1 = await confirmer({ titre: 'Effacer toutes les données ?', message: 'Transactions, règles, poches, plans, réglages : tout sera supprimé de cet iPhone. Exporte une sauvegarde avant si besoin.', ok: 'Continuer', danger: true });
  if (!ok1) return;
  const ok2 = await confirmer({ titre: 'Dernière confirmation', message: 'Cette action est définitive. Effacer maintenant ?', ok: 'Tout effacer', danger: true });
  if (!ok2) return;
  await effacerTout();
  location.replace('./');
}

// ---------------------------------------------------------------------------
// Sous-pages
// ---------------------------------------------------------------------------
function retour(vers = 'reglages', libelle = 'Réglages') { return h('button', { class: 'lien retour', type: 'button', onclick: () => aller(vers) }, icone('retour'), libelle); }

function rendreQuestions(vue) {
  const qs = etat.questions;
  vue.replaceChildren(retour('reglages/operations', 'Opérations et catégories'), h('h1', { class: 'titre-page' }, 'Questions sur tes relevés'),
    qs.length ? h('div', {}, qs.map(carteQuestion)) : etatVide('ok', 'Aucune question', 'Tout est qualifié.'));
}

function carteQuestion(q) {
  const ouverte = q.statut === 'ouverte';
  const rp = q.reponseProposee || {};
  const valider = async (reponse, extra = async () => {}) => { await extra(); await enregistrer('questions', { ...q, statut: 'repondue', reponse }); toast('Réponse enregistrée.', { type: 'succes' }); };
  let corps;
  if (q.type === 'loyer') {
    let m = rp.montantCentimes; let j = rp.jour;
    corps = h('div', { class: 'formulaire' }, champ('Loyer à payer', champMontant({ valeur: m, onValeur: (v) => { m = v; } })), champ('Jour de prélèvement', h('input', { class: 'input', inputmode: 'numeric', value: String(j), oninput: (e) => { j = Number(e.target.value) || j; } })),
      h('div', { class: 'groupe-boutons' }, bouton('Oui, c’est mon loyer', () => valider({ estLoyer: true, montantCentimes: m, jour: j }, async () => { await majProfil({ loyerAPayerCentimes: m, jourLoyer: j }); const cf = etat.chargesFixes.find((c) => c.estLoyer); if (cf) await enregistrer('chargesFixes', { ...cf, jourPrelevement: j, aConfirmer: false }); }), { classe: 'btn-principal btn-petit' }),
        bouton('Non', () => valider({ estLoyer: false }, async () => { const cf = etat.chargesFixes.find((c) => c.estLoyer); if (cf) await enregistrer('chargesFixes', { ...cf, estLoyer: false, libelle: cf.motifDetection }); }), { classe: 'btn-petit' })));
  } else if (q.type === 'jourSalaire') {
    let j = rp.jour;
    corps = h('div', { class: 'formulaire' }, champ('Jour', h('input', { class: 'input', inputmode: 'numeric', value: String(j), oninput: (e) => { j = Number(e.target.value) || j; } })), bouton('Confirmer', () => valider({ jour: j }, () => majProfil({ jourSalaireHabituel: j })), { classe: 'btn-principal btn-petit' }));
  } else if (q.type === 'pret') {
    corps = h('div', {}, bouton('Compléter le prêt', () => aller('epargne/dettes'), { classe: 'btn-principal btn-petit' }), bouton('Plus tard', () => {}, { classe: 'btn-petit' }));
  } else if (q.type === 'epargne') {
    let s = rp.soldeCentimes;
    corps = h('div', { class: 'formulaire' }, champ('Solde actuel de ton épargne', champMontant({ valeur: s, onValeur: (v) => { s = v; } })), bouton('Confirmer', () => valider({ soldeCentimes: s }, async () => { const p = etat.poches.find((x) => x.type === 'coussin'); if (p) await enregistrer('poches', { ...p, soldeInitialCentimes: s || 0 }); }), { classe: 'btn-principal btn-petit' }));
  } else if (q.type === 'qualification') {
    const txs = etat.transactions.filter((t) => (q.transactionIds || []).includes(t.id));
    corps = h('div', {}, h('div', { class: 'liste' }, txs.slice(0, 8).map((t) => h('p', { class: 'petit' }, `${formatDate(t.date)} · ${t.libelle} · ${formatEuros(t.montantCentimes)}`))),
      pastillesCategories(['prets-proches', 'livraison', 'autres', 'virements-internes', 'epargne', 'loisirs'], rp.categorie, async (id) => { await recategoriser(txs, id); await valider({ categorie: id }); }));
  } else {
    corps = h('div', { class: 'groupe-boutons' }, bouton('Oui', () => valider({ ok: true }), { classe: 'btn-principal btn-petit' }), bouton('Non', () => valider({ ok: false }), { classe: 'btn-petit' }));
  }
  return carte(q.titre, h('div', {}, h('p', {}, q.texte), ouverte ? corps : h('p', { class: 'vert-texte' }, icone('ok'), ' Répondu.'), !ouverte ? bouton('Modifier', () => enregistrer('questions', { ...q, statut: 'ouverte' }), { classe: 'btn-petit' }) : null));
}

function rendreRegles(vue) {
  const regles = [...etat.reglesCategorie].sort((a, b) => (a.origine === 'utilisateur' ? -1 : 1) - (b.origine === 'utilisateur' ? -1 : 1));
  vue.replaceChildren(retour('reglages/operations', 'Opérations et catégories'), h('h1', { class: 'titre-page' }, 'Règles de catégorisation'),
    h('p', { class: 'petit' }, 'Ordre : tes règles → règles importées → règles par défaut → Gemini (si activé). Corriger une catégorie crée une règle.'),
    regles.length ? h('div', { class: 'liste' }, regles.map((r) => h('div', { class: 'ligne-regle' },
      h('span', {}, h('strong', {}, libelleRegle(r)), h('small', {}, ` → ${nomCategorie(r.categorie)} · ${r.origine === 'utilisateur' ? 'toi' : 'import'}`)),
      h('div', { class: 'groupe-boutons' },
        selectionner(CATEGORIES.map((c) => [c.id, c.nom]), r.categorie, (v) => enregistrer('reglesCategorie', { ...r, categorie: v }), { aria: `Catégorie de la règle ${libelleRegle(r)}` }),
        h('button', { class: 'btn-icone', type: 'button', 'aria-label': `Supprimer la règle ${libelleRegle(r)}`, onclick: async () => { await supprimerObjet('reglesCategorie', r.id); rendreRegles(vue); } }, icone('corbeille')))))) : etatVide('liste', 'Aucune règle', 'Corrige la catégorie d’une opération : la règle apparaît ici.'));
}

function rendreCharges(vue) {
  const dessiner = () => rendreCharges(vue);
  vue.replaceChildren(retour('reglages/operations', 'Opérations et catégories'), h('h1', { class: 'titre-page' }, 'Charges fixes'),
    h('p', { class: 'petit' }, 'Détectées automatiquement à l’import (prélèvements réguliers). Elles entrent dans le reste à dépenser et la projection de découvert.'),
    h('div', { class: 'liste' }, [...etat.chargesFixes].sort((a, b) => a.jourPrelevement - b.jourPrelevement).map((c) => {
      let m = c.montantCentimes; let j = c.jourPrelevement;
      return h('details', { class: `charge ${c.actif ? '' : 'inactive'}` },
        h('summary', {}, h('span', {}, c.estLoyer ? `Loyer (${c.libelle})` : c.libelle, c.aConfirmer ? h('span', { class: 'etiquette' }, 'à confirmer') : null, !c.actif ? h('span', { class: 'etiquette' }, 'inactive') : null), h('span', {}, `le ${c.jourPrelevement} · `, mt(c.estLoyer && etat.profil.loyerAPayerCentimes ? etat.profil.loyerAPayerCentimes : c.montantCentimes))),
        h('div', { class: 'formulaire' },
          c.montantVariable ? h('p', { class: 'petit' }, `Montant variable : de ${formatEuros(c.montantMinCentimes)} à ${formatEuros(c.montantMaxCentimes)}.`) : null,
          champ('Montant', champMontant({ valeur: m, onValeur: (v) => { m = v; } })), champ('Jour', h('input', { class: 'input', inputmode: 'numeric', value: String(j), oninput: (e) => { j = Number(e.target.value) || j; } })),
          interrupteur('Active', c.actif, async (v) => { await enregistrer('chargesFixes', { ...c, actif: v }); }),
          h('div', { class: 'groupe-boutons' }, bouton('Enregistrer', async () => { await enregistrer('chargesFixes', { ...c, montantCentimes: m ?? c.montantCentimes, jourPrelevement: j, aConfirmer: false }); toast('Charge enregistrée.'); dessiner(); }, { classe: 'btn-principal btn-petit' }),
            bouton('Supprimer', async () => { await supprimerObjet('chargesFixes', c.id); dessiner(); }, { classe: 'btn-petit btn-danger-texte' }))));
    })),
    bouton('Ajouter une charge fixe', () => {
      let lib = ''; let m = null; let j = 1; let cat = 'abonnements';
      const f = ouvrirFeuille({ titre: 'Nouvelle charge fixe', contenu: h('div', { class: 'formulaire' }, champ('Libellé', h('input', { class: 'input', oninput: (e) => { lib = e.target.value; } })), champ('Montant', champMontant({ onValeur: (v) => { m = v; } })), champ('Jour du mois', h('input', { class: 'input', inputmode: 'numeric', oninput: (e) => { j = Number(e.target.value) || 1; } })), champ('Catégorie', selectionner(CATEGORIES.map((c) => [c.id, c.nom]), cat, (v) => { cat = v; }))),
        actions: [bouton('Annuler', () => f.fermer()), bouton('Ajouter', async () => { if (!lib || !m) return; await enregistrer('chargesFixes', { id: nouvelId('cf'), libelle: lib, montantCentimes: m, jourPrelevement: j, categorie: cat, compteId: etat.comptes.find((c) => c.type === 'courant')?.id, motifDetection: lib.toUpperCase(), actif: true, origine: 'utilisateur' }); f.fermer(); dessiner(); }, { classe: 'btn-principal' })] });
    }, { icone: 'plus' }));
}

export { confirmerRevenus, categorie, versChamp, ajouterJours, enregistrerLot };
