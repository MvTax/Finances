import { egal } from '../outils/assert.mjs';
import { analyserPhrase } from '../../js/saisie.js';
import { validerTransactionIA, validerTicket } from '../../js/ia.js';
import { choisirFlashStable } from '../../js/gemini.js';
import { mimePourGemini } from '../../js/voice.js';
import { dimensionsCibles } from '../../js/camera.js';
import { forcerAujourdhui } from '../../js/dates.js';

export default [
  { nom: 'saisie locale : « 2 fois 3,20 café hier », « reçu 20 balles de ma sœur »', fn: () => {
    const a = analyserPhrase('2 fois 3,20 café hier', '2026-11-05');
    egal(a.montantCentimes, 640); egal(a.date, '2026-11-04'); egal(a.sens, 'debit'); egal(a.libelle, 'Café');
    const b = analyserPhrase("j'ai reçu 20 balles de ma sœur", '2026-11-05');
    egal(b.sens, 'credit'); egal(b.montantCentimes, 2000);
    const c = analyserPhrase('4,89 chez Lidl', '2026-11-05'); egal(c.montantCentimes, 489); egal(c.libelle, 'Lidl');
  } },
  { nom: 'IA : réponses validées côté client (montant entier, catégorie autorisée, date plausible)', fn: () => {
    forcerAujourdhui('2026-11-05');
    egal(validerTransactionIA({ sens: 'debit', montantCentimes: 450, libelle: 'Pain', categorie: 'inexistante', date: '2026-11-04', confiance: 0.9 }).categorie, 'autres');
    egal(validerTransactionIA({ sens: 'debit', montantCentimes: 4.5, libelle: 'x', categorie: 'courses', date: '2026-11-04', confiance: 1 }), null);
    egal(validerTransactionIA({ sens: 'debit', montantCentimes: 450, libelle: 'x', categorie: 'courses', date: '2030-01-01', confiance: 1 }).date, '2026-11-05');
    const t = validerTicket({ marchand: 'Lidl', date: '2026-11-03', totalCentimes: 300, articles: [{ nom: 'A', prixCentimes: 100, quantite: 1, categorie: 'courses' }, { nom: 'B', prixCentimes: 150, quantite: 1, categorie: 'courses', typeMarque: 'nationale', economieDistributeurCentimes: 40 }] });
    egal(t.ecartCentimes, 50); egal(t.economieDistributeurCentimes, 40);
    forcerAujourdhui(null);
  } },
  { nom: 'Gemini : choix du Flash stable le plus récent ; correspondance MIME audio iOS', fn: () => {
    egal(choisirFlashStable(['models/gemini-2.5-flash', 'models/gemini-3.8-flash', 'models/gemini-3.8-flash-lite', 'models/gemini-3.9-flash-preview', 'models/gemini-3.5-flash']), 'gemini-3.8-flash');
    egal(mimePourGemini('audio/mp4'), 'audio/m4a'); egal(mimePourGemini('audio/webm;codecs=opus'), 'audio/webm');
  } },
  { nom: 'caméra : redimensionnement à 1200 px de grand côté', fn: () => {
    egal(JSON.stringify(dimensionsCibles(4032, 3024)), JSON.stringify({ largeur: 1200, hauteur: 900 }));
    egal(JSON.stringify(dimensionsCibles(800, 600)), JSON.stringify({ largeur: 800, hauteur: 600 }));
  } },
];
