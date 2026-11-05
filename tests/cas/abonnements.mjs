// abonnements.mjs — liste des abonnements, coût mensuel/annuel, alternatives, et exclusion du budget du jour.
import { egal, vrai } from '../outils/assert.mjs';
import { listerAbonnements, reconnaitre, mensualiser } from '../../js/abonnements.js';
import { estDepenseQuotidienne, resteADepenser, depensesVariables } from '../../js/calculs.js';
import { tx, etatBase } from '../outils/etat.mjs';

export default [
  { nom: 'abonnements : services reconnus, essentiels séparés, alternatives gratuites', fn: () => {
    egal(reconnaitre('PRLV SEPA SPOTIFY')?.cle, 'musique');
    egal(reconnaitre('CB NETFLIX.COM')?.cle, 'video');
    egal(reconnaitre('Bouygues Telecom')?.essentiel, true);
    vrai(reconnaitre('Spotify').alternatives.some((a) => /gratuit/i.test(a)));
    egal(mensualiser(4196, { periodiciteJours: 28 }), 4558);  // 365/28 ≈ 13 prélèvements par an
    egal(mensualiser(3495, { annuel: true }), 291);
  } },
  { nom: 'abonnements : liste depuis les charges fixes et les paiements récurrents, résiliés exclus', fn: () => {
    const e = etatBase({
      chargesFixes: [
        { id: 'sp', libelle: 'Spotify', montantCentimes: 707, jourPrelevement: 7, categorie: 'abonnements', actif: true },
        { id: 'bt', libelle: 'Bouygues Telecom', montantCentimes: 1899, jourPrelevement: 5, categorie: 'telephonie', actif: true },
        { id: 'gym', libelle: 'Salle de sport On Air', montantCentimes: 4196, periodiciteJours: 28, jourPrelevement: 28, categorie: 'sport', actif: true },
        { id: 'loyer', libelle: 'Loyer', estLoyer: true, montantCentimes: 23620, categorie: 'logement', actif: true },
      ],
      transactions: [tx({ id: 'np', date: '2026-10-10', montant: 1349, marchand: 'Netflix', categorie: 'abonnements' })],
    });
    const a = listerAbonnements(e, '2026-11-05');
    egal(a.liste.length, 4);                               // Spotify, Bouygues, salle, Netflix (pas le loyer)
    egal(a.essentiels.length, 1);
    egal(a.aLimiter[0].nom, 'Salle de sport On Air');      // trié par coût mensuel
    egal(a.aLimiterMensuelCentimes, 4558 + 1349 + 707);
    const r = listerAbonnements(e, '2026-11-05', { resilies: { 'cf:sp': { nom: 'Spotify' } } });
    egal(r.liste.length, 3);
  } },
  { nom: 'budget du jour : abonnements et prélèvements comptent dans les charges, pas dans les dépenses du jour', fn: () => {
    vrai(!estDepenseQuotidienne({ categorie: 'abonnements', sens: 'debit' }));
    vrai(!estDepenseQuotidienne({ categorie: 'telephonie', sens: 'debit', libellePrincipal: 'PRLV SEPA Bouygues Telecom' }));
    vrai(estDepenseQuotidienne({ categorie: 'vtc', sens: 'debit', libellePrincipal: 'CB UBER' }));
    const e = etatBase({
      revenusMensuels: [{ mois: '2026-11', salaireCentimes: 100000, primeActiviteCentimes: 0, autresEntrees: [], statut: 'confirme' }],
      transactions: [
        tx({ id: 'u', date: '2026-11-05', montant: 836, marchand: 'Uber', categorie: 'vtc' }),
        tx({ id: 'ap', date: '2026-11-05', montant: 999, marchand: 'Apple', categorie: 'abonnements' }),
        tx({ id: 'pr', date: '2026-11-05', montant: 2000, marchand: 'Assurance', libellePrincipal: 'PRLV SEPA ASSURANCE', categorie: 'autres' }),
      ],
    });
    egal(depensesVariables(e, '2026-11-05', '2026-11-05'), 836);          // seul Uber entame le budget du jour
    const r = resteADepenser(e, '2026-11-05');
    vrai(r.charges.some((c) => c.transactionId === 'ap') && r.charges.some((c) => c.transactionId === 'pr'), 'comptés en charges');
    egal(r.resteCentimes, 100000 - r.epargneCibleCentimes - 999 - 2000 - 836 - r.dettesCentimes - (r.chargesCentimes - 2999));
  } },
];
