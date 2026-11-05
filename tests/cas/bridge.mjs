import { egal, vrai } from '../outils/assert.mjs';
import { construireEnveloppe, encoder, decoder, valider, messageFrigo, TAILLE_MAX_FRAGMENT } from '../../js/bridge.js';

const liste = { joursCouverts: 2, reportCoursesAu: '2026-11-08', economieEstimeeCentimes: 1600, ingredientsDisponibles: [{ nom: 'Œufs', quantite: 6, unite: 'pièce' }], repasPossibles: [{ nom: 'Omelette', ingredients: ['Œufs'] }], articlesManquants: [{ nom: 'Pain', quantite: 1, unite: 'pièce', rayon: 'Boulangerie', prixEstimeCentimes: 120, essentiel: true }] };

export default [
  { nom: 'pont : aller-retour encodage → décodage (fragment d’URL compressé), empreinte valide', fn: async () => {
    const env = await construireEnveloppe('liste_courses', liste, { emisLe: '2026-11-05T08:00:00.000Z' });
    const charge = await encoder(env);
    vrai(charge.length < TAILLE_MAX_FRAGMENT);
    const lu = await decoder(`#bridge=${charge}`);
    egal(JSON.stringify(lu), JSON.stringify(env));
    vrai((await valider(lu)).ok);
  } },
  { nom: 'pont : message modifié ou contrat inconnu refusé', fn: async () => {
    const env = await construireEnveloppe('profil_nutrition', { interdits: ['sucreries'], budgetRepasCibleCentimes: 15000 }, { source: 'repas' });
    vrai((await valider(env)).ok);
    vrai(!(await valider({ ...env, donnees: { interdits: ['rien'] } })).ok, 'empreinte');
    vrai(!(await valider({ ...env, contrat: 'autre' })).ok);
    vrai(!(await valider({ ...env, version: 2 })).ok);
    vrai(!(await valider(await construireEnveloppe('achats_ticket', { tickets: [{ date: 'hier', marchand: 'X', articles: [] }] }))).ok);
  } },
  { nom: 'pont : message frigo', fn: () => {
    egal(messageFrigo(liste).replace(/ | /g, ' '), 'Tu as de quoi tenir 2 jours de plus. Courses décalées au 08/11 : tu économises 16,00 € cette semaine.');
  } },
];
