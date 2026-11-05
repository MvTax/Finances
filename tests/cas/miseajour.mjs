// miseajour.mjs — mise à jour depuis le fichier privé sans perdre les saisies et modifications faites dans l'app.
import { egal, vrai } from '../outils/assert.mjs';
import { planifierMiseAJour, resumeMiseAJour, cleNaturelle } from '../../js/miseajour.js';

const S = '2026-11-05T04:30:00.000Z';          // estampille du fichier
const APP = '2026-11-06T10:00:00.000Z';        // date d'une modification faite dans l'app
const tx = (id, o = {}) => ({ id, compteId: 'lcl', date: '2026-10-01', sens: 'debit', montantCentimes: 1000, categorie: 'courses', source: 'import', empreinteDedoublonnage: `lcl|debit|1000|${id.toUpperCase()}`, creeLe: S, modifieLe: S, ...o });

export default [
  { nom: 'mise à jour : fichier appliqué, saisies et modifications de l’app gardées', fn: () => {
    const local = {
      transactions: [
        tx('a'),                                                            // jamais touchée
        tx('b', { categorie: 'loisirs', modifieLe: APP }),                  // recatégorisée dans l'app
        tx('c', { source: 'texte', empreinteDedoublonnage: null, date: '2026-11-06', modifieLe: APP, creeLe: APP }), // saisie manuelle
        tx('r'),                                                            // retirée du nouveau fichier
      ],
      prets: [{ id: 'p1', personneAlias: 'Proche', montantCentimes: 20000, echeancier: [], creeLe: S, modifieLe: S }],
      poches: [{ id: 'q', nom: 'Coussin', partRepartition: null, mouvements: [{ id: 'm', montantCentimes: 500 }], creeLe: S, modifieLe: APP }],
      profil: { cle: 'profil', jourLoyer: 8, prenomAffichage: 'Moi modifié' },
      parametres: { cle: 'parametres', theme: 'sombre', cleGemini: 'secret' },
    };
    const contenu = {
      transactions: [tx('a', { categorie: 'logement' }), tx('b', { montantCentimes: 999 }), tx('d', { date: '2026-11-02' }), tx('e')],
      prets: [{ id: 'p1', personneAlias: 'Proche renommé', montantCentimes: 20000, echeancier: [], creeLe: S, modifieLe: S }],
      poches: [{ id: 'q', nom: 'Coussin', partRepartition: 25, mouvements: [], creeLe: S, modifieLe: S }],
      profil: { cle: 'profil', jourLoyer: 9, prenomAffichage: 'Moi' },
      parametres: { cle: 'parametres', theme: 'auto' },
    };
    const supprimes = { transactions: { ids: ['e'], naturelles: [] } };
    const plan = planifierMiseAJour(local, contenu, { estampilles: [S], supprimes, baseProfil: { jourLoyer: 8, prenomAffichage: 'Moi' } });
    const ecrit = (id) => plan.ecritures.find((x) => x.valeur.id === id)?.valeur;
    egal(ecrit('a').categorie, 'logement');                 // intacte → version du fichier
    egal(ecrit('b'), undefined);                            // modifiée dans l'app → gardée
    egal(ecrit('c'), undefined);                            // saisie manuelle → jamais touchée
    egal(ecrit('d').date, '2026-11-02');                    // nouvelle → ajoutée
    egal(ecrit('e'), undefined);                            // supprimée dans l'app → pas recréée
    egal(ecrit('p1').personneAlias, 'Proche renommé');      // dette intacte → mise à jour
    egal(ecrit('q'), undefined);                            // poche avec un versement → gardée
    egal(JSON.stringify(plan.suppressions), JSON.stringify([{ collection: 'transactions', cle: 'r' }])); // retirée du fichier, intacte → supprimée
    vrai(!plan.suppressions.some((x) => x.cle === 'c'));
    egal(plan.profil.jourLoyer, 9);                         // champ non modifié dans l'app → fichier
    egal(plan.profil.prenomAffichage, 'Moi modifié');       // champ modifié dans l'app → gardé
    egal(plan.parametres.theme, 'sombre'); egal(plan.parametres.cleGemini, 'secret'); // réglages de l'app et secrets intacts
    egal(plan.totaux.gardes, 2); egal(plan.totaux.ignores, 1); egal(plan.totaux.ajouts, 1); egal(plan.totaux.majs, 2);
    vrai(/1 ajout/.test(resumeMiseAJour(plan)));
  } },
  { nom: 'mise à jour : identifiants différents reconnus par la clé naturelle (pas de doublon)', fn: () => {
    const local = { transactions: [tx('ancien-id', { empreinteDedoublonnage: 'lcl|debit|1000|LIDL' }), tx('perso', { empreinteDedoublonnage: 'lcl|debit|1000|LIDL', date: '2026-10-02', modifieLe: APP, categorie: 'loisirs' })] };
    const contenu = { transactions: [tx('nouvel-id', { empreinteDedoublonnage: 'lcl|debit|1000|LIDL', categorie: 'courses', libelle: 'x' }), tx('nouvel-id-2', { empreinteDedoublonnage: 'lcl|debit|1000|LIDL', date: '2026-10-02' })] };
    const plan = planifierMiseAJour(local, contenu, { estampilles: [S] });
    egal(plan.ecritures.length, 1);
    egal(plan.ecritures[0].valeur.id, 'ancien-id');         // l'identifiant local est conservé
    egal(plan.suppressions.length, 0);
    egal(plan.totaux.gardes, 1);                            // celle modifiée dans l'app reste telle quelle
    egal(cleNaturelle('transactions', { empreinteDedoublonnage: 'k', date: '2026-01-01' }), 'k|2026-01-01');
  } },
  { nom: 'mise à jour : une saisie manuelle est rapprochée de la nouvelle opération bancaire', fn: () => {
    const manuelle = tx('m', { source: 'texte', empreinteDedoublonnage: null, date: '2026-11-07', montantCentimes: 489, categorie: 'courses', modifieLe: APP, creeLe: APP });
    const banque = tx('n', { date: '2026-11-08', montantCentimes: 489, empreinteDedoublonnage: 'lcl|debit|489|BOULANGERIE' });
    const plan = planifierMiseAJour({ transactions: [manuelle] }, { transactions: [banque] }, { estampilles: [S] });
    egal(plan.totaux.rapprochements, 1); egal(plan.totaux.ajouts, 0);
    egal(plan.ecritures[0].valeur.id, 'm');
  } },
  { nom: 'mise à jour : fusion champ par champ d’un objet modifié dans l’app (versement gardé, nouvelle part appliquée)', fn: () => {
    const base = { id: 'q', nom: 'Coussin', partRepartition: null, mouvements: [], cibleCentimes: 100000, creeLe: S, modifieLe: S };
    const local = { poches: [{ ...base, mouvements: [{ id: 'm', montantCentimes: 500 }], nom: 'Mon coussin', modifieLe: APP }] };
    const contenu = { poches: [{ ...base, partRepartition: 25, nom: 'Coussin de sécurité' }] };
    const plan = planifierMiseAJour(local, contenu, { estampilles: [S], bases: { poches: { q: base } } });
    const v = plan.ecritures[0].valeur;
    egal(v.partRepartition, 25);                 // seul le fichier l'a changé → appliqué
    egal(v.mouvements.length, 1);                // le versement fait dans l'app est gardé
    egal(v.nom, 'Mon coussin');                  // changé des deux côtés → ta version
    egal(v.modifieLe, APP);                      // reste « modifié dans l'app »
    egal(JSON.stringify(plan.conflits[0].champs), '["nom"]');
  } },
  { nom: 'mise à jour : les références suivent l’identifiant local (opération ↔ charge fixe)', fn: () => {
    const cfLocal = { id: 'cf-ancien', compteId: 'lcl', motifDetection: 'LOYER', libelle: 'Loyer', montantCentimes: 23620, creeLe: S, modifieLe: S };
    const local = { chargesFixes: [cfLocal], transactions: [] };
    const contenu = { chargesFixes: [{ ...cfLocal, id: 'cf-nouveau', montantCentimes: 23700 }], transactions: [tx('t1', { chargeFixeId: 'cf-nouveau' })] };
    const plan = planifierMiseAJour(local, contenu, { estampilles: [S] });
    egal(plan.ecritures.find((e) => e.collection === 'chargesFixes').valeur.id, 'cf-ancien');
    egal(plan.ecritures.find((e) => e.collection === 'transactions').valeur.chargeFixeId, 'cf-ancien');
  } },
  { nom: 'mise à jour : un fichier identique ne change rien', fn: () => {
    const l = { transactions: [tx('a'), tx('b')], prets: [{ id: 'p', personneAlias: 'X', creeLe: S, modifieLe: S }] };
    const plan = planifierMiseAJour(l, structuredClone(l), { estampilles: [S] });
    egal(plan.ecritures.length, 0); egal(plan.suppressions.length, 0); egal(resumeMiseAJour(plan), 'Rien de nouveau dans ce fichier');
  } },
];
