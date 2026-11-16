// applepay.mjs — paiements Apple Pay notés par un Raccourci (js/import/applepay.js) : lecture du fichier,
// empreintes, doublons, paiements « à vérifier », classement, enregistrement. Dates fixes, données inventées.
import { egal, vrai, egalProfond } from '../outils/assert.mjs';
import { estNode } from '../outils/env.mjs';
import { tx, etatBase } from '../outils/etat.mjs';
import { forcerAujourdhui } from '../../js/dates.js';
import { regleDepuisCorrection } from '../../js/rules.js';
import {
  lireMontantApplePay, analyserLigne, analyserFichier, empreintePaiement, estProvisoire, compteDeCarte, categorieParHistorique,
  transactionDepuisPaiement, planifierApplePay, fusionnerPaiementDansSaisie, FORMAT_LIGNE,
} from '../../js/import/applepay.js';

const A = '2026-11-16';
const L = (heure, montant, commercant, carte = 'Carte A', nom = '') => [FORMAT_LIGNE, heure, montant, carte, nom || commercant, commercant].join('|');
const fichier = (...lignes) => lignes.join('\n');
const analyser = (texte) => analyserFichier(texte, { auj: A });
const etat = (o = {}) => { const e = etatBase(o); e.reglesCategorie = o.reglesCategorie || []; e.meta = o.meta || {}; return e; };
const plan = (texte, e = etat(), o = {}) => planifierApplePay(analyser(texte), e, { auj: A, maintenant: `${A}T18:00:00.000Z`, ...o });

export default [
  { nom: 'Apple Pay : montants lus comme Cartes les affiche (espaces insécables, devise devant, milliers, remboursement)', fn: () => {
    const m = (s) => { const r = lireMontantApplePay(s); return r && [r.centimes, r.sens, r.devise]; };
    egalProfond(m('12,50 €'), [1250, 'debit', 'EUR']);
    egalProfond(m('12,50\u00A0€'), [1250, 'debit', 'EUR'], 'espace insécable');
    egalProfond(m('1\u202F234,56\u00A0€'), [123456, 'debit', 'EUR'], 'espace fine');
    egalProfond(m('€12.50'), [1250, 'debit', 'EUR']);
    egalProfond(m('1 234,56 €'), [123456, 'debit', 'EUR']);
    egalProfond(m('-4,00 €'), [400, 'credit', 'EUR'], 'remboursement');
    egalProfond(m('USD 8.00'), [800, 'debit', 'USD']);
    egalProfond(m('12,5 €'), [1250, 'debit', 'EUR']);
    egalProfond(m('3,20'), [320, 'debit', '?'], 'sans devise écrite');
    egal(lireMontantApplePay(''), null); egal(lireMontantApplePay('abc'), null); egal(lireMontantApplePay(null), null);
  } },
  { nom: 'Apple Pay : lignes vides, commentaires, format plus récent, champs manquants, commerçant vide ou avec « | »', fn: () => {
    egal(analyserLigne('').statut, 'vide'); egal(analyserLigne('   ').statut, 'vide');
    egal(analyserLigne('# mon fichier').statut, 'commentaire');
    egal(analyserLigne('AP2|2026-11-16T12:00:00+01:00|1,00 €|Carte A|X|Y|Z').statut, 'format-recent');
    const manque = analyserLigne('AP1|2026-11-16T12:00:00+01:00|1,00 €');
    egal(manque.statut, 'cassee'); vrai(manque.raison.length > 5);
    egal(analyserLigne('bonjour').statut, 'cassee');
    const sansCommercant = analyserLigne('AP1|2026-11-16T12:00:00+01:00|4,20 €|Carte A|EPICERIE TEST|');
    egal(sansCommercant.statut, 'ok'); egal(sansCommercant.commercant, 'EPICERIE TEST', 'commerçant vide → champ Nom');
    egal(analyserLigne('AP1|2026-11-16T12:00:00+01:00|4,20 €|Carte A|EPICERIE TEST').commercant, 'EPICERIE TEST', '5 champs acceptés');
    egal(analyserLigne('AP1|2026-11-16T12:00:00+01:00|4,20 €|Carte A|X|BAR | TEST').commercant, 'BAR | TEST', 'tout ce qui suit le 5e « | »');
    egal(analyserLigne('AP1|2026-13-01T12:00:00+01:00|4,20 €|Carte A|X|Y').statut, 'cassee', 'mois 13');
    egal(analyserLigne('AP1|2026-11-16T12:00:00+01:00|abc|Carte A|X|Y').statut, 'cassee');
    egal(analyserLigne('AP1|2026-11-16T12:00:00+01:00||Carte A|X|Y').statut, 'sans-montant');
    egal(analyserLigne('AP1|2026-11-16T12:00:00+01:00|USD 8.00|Carte A|X|Y').statut, 'devise');
  } },
  { nom: 'Apple Pay : fichier avec BOM et CRLF, deux lignes collées, paiement futur, comptes de lecture', fn: () => {
    const texte = '\uFEFF# Paiements\r\n' + L('2026-11-16T12:34:56+01:00', '12,50 €', 'BOULANGERIE TEST') + '\r\n\r\n'
      + L('2026-11-15T09:00:00+01:00', '3,00 €', 'CAFE TEST') + L('2026-11-15T10:00:00+01:00', '4,00 €', 'KIOSQUE TEST') + '\n'
      + L('2026-11-20T10:00:00+01:00', '5,00 €', 'PLUS TARD TEST') + '\nAP2|x|y\nAP1|2026-11-16\n'
      + L('2026-11-14T10:00:00+01:00', 'USD 8.00', 'BOUTIQUE TEST') + '\n' + L('2026-11-14T11:00:00+01:00', '', 'SANS MONTANT TEST');
    const a = analyser(texte);
    egalProfond(a.paiements.map((p) => p.commercant), ['BOULANGERIE TEST', 'CAFE TEST', 'KIOSQUE TEST', 'BOUTIQUE TEST', 'SANS MONTANT TEST']);
    egalProfond(a.comptes, { lues: 8, vides: 2, cassees: 1, devises: 1, sansMontant: 1, futures: 1, doublesDansFichier: 0, formatRecent: 1 });
    egal(a.erreurs.length, 2);
    egal(a.paiements[0].date, A); egal(a.paiements[0].heure, '12:34'); egal(a.paiements[0].centimes, 1250);
    egal(analyser(L('2026-11-17T23:00:00+01:00', '1,50 €', 'DEMAIN TEST')).paiements.length, 1, 'demain est accepté (décalage d’horloge)');
  } },
  { nom: 'Apple Pay : empreinte stable (carte renommée, relecture, fichier plus long), secondes absentes → numéro d’occurrence', fn: () => {
    const l1 = L('2026-11-16T12:34:56+01:00', '12,50 €', 'BOULANGERIE TEST');
    const l2 = L('2026-11-16T13:00:00+01:00', '2,00 €', 'CAFE TEST');
    const e1 = analyser(fichier(l1, l2)).paiements.map((p) => p.empreinte);
    egalProfond(analyser(fichier(l1, l2)).paiements.map((p) => p.empreinte), e1, 'deux lectures identiques');
    egal(analyser(L('2026-11-16T12:34:56+01:00', '12,50 €', 'BOULANGERIE TEST', 'Ma carte renommée')).paiements[0].empreinte, e1[0], 'la carte n’entre pas');
    egal(analyser(L('2026-11-16T11:34:56Z', '12,50 €', 'BOULANGERIE TEST')).paiements[0].empreinte, e1[0], 'même instant écrit autrement');
    const plusLong = analyser(fichier(l1, l2, L('2026-11-16T18:00:00+01:00', '9,90 €', 'LIBRAIRIE TEST'))).paiements.map((p) => p.empreinte);
    egalProfond(plusLong.slice(0, 2), e1, 'les anciennes lignes gardent leur empreinte');
    vrai(/^[0-9a-f]{14}$/.test(e1[0]), e1[0]);
    // Deux lignes identiques avec secondes : une seule (ligne écrite deux fois)
    const double = analyser(fichier(l1, l1));
    egal(double.paiements.length, 1); egal(double.comptes.doublesDansFichier, 1);
    // Sans secondes : deux cafés à la même minute = deux paiements, #0 et #1
    const cafe = L('2026-11-16T08:02', '2,00 €', 'CAFE TEST');
    const deux = analyser(fichier(cafe, cafe)).paiements;
    egal(deux.length, 2); vrai(deux[0].empreinte !== deux[1].empreinte);
    egal(deux[0].empreinte, empreintePaiement(deux[0], 0)); egal(deux[1].empreinte, empreintePaiement(deux[1], 1));
    egalProfond(analyser(fichier(cafe, cafe, l2)).paiements.slice(0, 2).map((p) => p.empreinte), deux.map((p) => p.empreinte));
  } },
  { nom: 'Apple Pay : relire le même fichier n’ajoute rien ; paiements avant « depuis » ignorés', fn: () => {
    const texte = fichier(L('2026-11-16T12:34:56+01:00', '12,50 €', 'BOULANGERIE TEST'), L('2026-11-10T09:00:00+01:00', '3,00 €', 'CAFE TEST'));
    const p1 = plan(texte);
    egal(p1.aAjouter.length, 2);
    const vues = p1.aAjouter.map((t) => t.applePay.empreinte);
    const p2 = plan(texte, etat({ meta: { applePayVues: vues } }));
    egal(p2.aAjouter.length, 0); egal(p2.ignorees.dejaVues, 2);
    const p3 = plan(texte, etat({ transactions: p1.aAjouter }));
    egal(p3.aAjouter.length, 0, 'empreinte portée par une opération'); egal(p3.ignorees.dejaVues, 2);
    const e = etat(); e.profil.applePay = { depuis: '2026-11-12', cartes: {}, motsProvisoires: [] };
    const p4 = plan(texte, e);
    egal(p4.aAjouter.length, 1); egal(p4.ignorees.avantDebut, 1);
  } },
  { nom: 'Apple Pay : saisie à la main du même paiement → à confirmer, jamais fusionnée d’office ; une saisie pour un seul paiement', fn: () => {
    const saisie = tx({ id: 's1', date: A, montant: 250, marchand: 'Café', categorie: 'restaurants', source: 'texte' });
    const autre = tx({ id: 's2', date: A, montant: 250, marchand: 'Boulangerie Test', categorie: 'restaurants', source: 'voix' });
    const p = plan(fichier(L('2026-11-16T08:10:00+01:00', '2,50 €', 'BOULANGERIE TEST'), L('2026-11-16T09:10:00+01:00', '2,50 €', 'BOULANGERIE TEST')), etat({ transactions: [saisie, autre] }));
    egal(p.aConfirmer.length, 2); egal(p.aAjouter.length, 0);
    egal(p.aConfirmer[0].existante.id, 's2', 'le nom proche passe devant'); egal(p.aConfirmer[0].raison, 'saisie-main');
    egal(p.aConfirmer[1].existante.id, 's1');
    const seule = plan(fichier(L('2026-11-16T08:10:00+01:00', '2,50 €', 'BOULANGERIE TEST'), L('2026-11-16T09:10:00+01:00', '2,50 €', 'BOULANGERIE TEST')), etat({ transactions: [saisie] }));
    egal(seule.aConfirmer.length, 1); egal(seule.aAjouter.length, 1, 'deux paiements, une saisie : un seul rapproché');
    // Autre jour : pas la même dépense… sauf entre 4 h et 6 h (une saisie de la veille au soir)
    egal(plan(L('2026-11-15T12:00:00+01:00', '2,50 €', 'BOULANGERIE TEST'), etat({ transactions: [saisie] })).aConfirmer.length, 0);
    const nuit = plan(L('2026-11-17T05:30:00+01:00', '2,50 €', 'BOULANGERIE TEST'), etat({ transactions: [saisie] }));
    egal(nuit.aConfirmer.length, 1);
    // Montant différent ou entrée d'argent : pas de rapprochement
    egal(plan(L('2026-11-16T08:10:00+01:00', '2,60 €', 'BOULANGERIE TEST'), etat({ transactions: [saisie] })).aConfirmer.length, 0);
    egal(plan(L('2026-11-16T08:10:00+01:00', '-2,50 €', 'BOULANGERIE TEST'), etat({ transactions: [saisie] })).aConfirmer.length, 0);
  } },
  { nom: 'Apple Pay : relevé déjà importé → déjà là (nom proche) ou à confirmer (sans nom proche) ; autre devise → à compléter', fn: () => {
    const releve = tx({ id: 'r1', date: '2026-11-18', montant: 1250, marchand: 'Boulangerie Test', libellePrincipal: 'CB BOULANGERIE TEST 16/11', source: 'import' });
    const p = plan(L('2026-11-16T12:34:56+01:00', '12,50 €', 'BOULANGERIE TEST'), etat({ transactions: [releve] }));
    egal(p.dejaLa.length, 1); egal(p.dejaLa[0].existante.id, 'r1'); egal(p.aAjouter.length, 0);
    const anonyme = tx({ id: 'r2', date: '2026-11-17', montant: 1250, marchand: 'Paiement Sans Contact', libellePrincipal: 'CB PAIEMENT SANS CONTACT', source: 'import' });
    const q = plan(L('2026-11-16T12:34:56+01:00', '12,50 €', 'BOULANGERIE TEST'), etat({ transactions: [anonyme] }));
    egal(q.aConfirmer.length, 1); egal(q.aConfirmer[0].raison, 'releve-sans-nom');
    egal(plan(L('2026-11-16T12:34:56+01:00', '12,50 €', 'BOULANGERIE TEST'), etat({ transactions: [{ ...releve, date: '2026-11-22' }] })).aAjouter.length, 1, 'trop tard pour être la même');
    const d = plan(L('2026-11-16T12:34:56+01:00', 'USD 8.00', 'BOUTIQUE TEST'));
    egal(d.aCompleter.length, 1); egal(d.aCompleter[0].raison, 'devise'); egal(d.aCompleter[0].tx.applePay.devise, 'USD'); egal(d.aAjouter.length, 0);
  } },
  { nom: 'Apple Pay : paiements « à vérifier » (station, péage, 1 €, tes mots) ; garde-fou Énergie', fn: () => {
    const p = (commercant, centimes = 3000) => ({ commercant, nom: commercant, centimes, sens: 'debit' });
    egalProfond(estProvisoire(p('STATION TEST')), { provisoire: true, raison: 'mot-cle' });
    egalProfond(estProvisoire(p('PÉAGE TEST')), { provisoire: true, raison: 'mot-cle' });
    egalProfond(estProvisoire(p('HOTEL TEST')), { provisoire: true, raison: 'mot-cle' });
    egalProfond(estProvisoire(p('BOULANGERIE TEST', 100)), { provisoire: true, raison: 'verification-carte' });
    egalProfond(estProvisoire(p('BOULANGERIE TEST', 101)), { provisoire: false, raison: null });
    egalProfond(estProvisoire(p('LAVAGE TEST'), ['lavage']), { provisoire: true, raison: 'mot-cle' });
    egal(estProvisoire({ ...p('STATION TEST'), sens: 'credit' }).provisoire, false, 'un remboursement n’est jamais provisoire');
    egal(estProvisoire(p('POSTE TEST')).provisoire, false, 'pas de faux positif dans un mot');
    const station = transactionDepuisPaiement({ ...p('TOTALENERGIES'), date: A, empreinte: 'x' }, { compteId: 'courant', maintenant: `${A}T12:00:00Z` });
    egal(station.applePay.provisoire, true); egal(station.categorie, 'autres', 'pas une facture d’énergie'); egal(station.applePay.classement, 'a-classer');
    const facture = transactionDepuisPaiement({ ...p('EDF'), date: A, empreinte: 'y' }, { compteId: 'courant', maintenant: `${A}T12:00:00Z` });
    egal(facture.categorie, 'energie'); egal(facture.applePay.provisoire, false);
  } },
  { nom: 'Apple Pay : classement — tes règles, puis règles par défaut, puis ton historique, sinon à classer', fn: () => {
    const opts = (o = {}) => ({ compteId: 'courant', maintenant: `${A}T12:00:00Z`, ...o });
    const p = (commercant) => ({ commercant, nom: commercant, centimes: 1500, sens: 'debit', date: A, empreinte: commercant });
    const defaut = transactionDepuisPaiement(p('CARREFOUR'), opts());
    egal(defaut.categorie, 'courses'); egal(defaut.applePay.classement, 'defaut'); egal(defaut.source, 'applepay');
    const regle = regleDepuisCorrection({ marchand: 'Carrefour', sens: 'debit' }, 'maison', 'r1');
    const perso = transactionDepuisPaiement(p('CARREFOUR'), opts({ regles: [regle] }));
    egal(perso.categorie, 'maison'); egal(perso.applePay.classement, 'regle');
    const historique = [tx({ date: '2026-10-01', montant: 900, marchand: 'Epicerie Test', categorie: 'courses' }), tx({ date: '2026-10-08', montant: 900, marchand: 'Epicerie Test', categorie: 'courses' }), tx({ date: '2026-10-09', montant: 900, marchand: 'Epicerie Test', categorie: 'maison' })];
    egal(categorieParHistorique(historique, 'EPICERIE TEST'), 'courses');
    const hist = transactionDepuisPaiement(p('EPICERIE TEST'), opts({ historique }));
    egal(hist.categorie, 'courses'); egal(hist.applePay.classement, 'historique');
    const inconnu = transactionDepuisPaiement(p('ATELIER TEST'), opts({ historique }));
    egal(inconnu.categorie, 'autres'); egal(inconnu.applePay.classement, 'a-classer');
    egal(inconnu.date, A); egal(inconnu.dateComptable, A); egal(inconnu.montantCentimes, 1500); egal(inconnu.applePay.montantInitialCentimes, 1500);
    egal(categorieParHistorique([], 'X'), null);
  } },
  { nom: 'Apple Pay : carte → compte (ton choix, nom de la banque dans la carte, sinon compte courant)', fn: () => {
    const comptes = [{ id: 'neo', nom: 'Revolut', type: 'neobanque', banque: 'revolut' }, { id: 'lcl', nom: 'LCL', type: 'courant', banque: 'lcl' }];
    egal(compteDeCarte('Carte Revolut', {}, comptes), 'neo');
    egal(compteDeCarte('LCL Visa', {}, comptes), 'lcl');
    egal(compteDeCarte('Carte A', {}, comptes), 'lcl', 'compte courant par défaut');
    egal(compteDeCarte('Carte A', { cartes: { 'Carte A': 'neo' } }, comptes), 'neo', 'ton choix');
    egal(compteDeCarte('Carte A', { cartes: { 'Carte A': 'disparu' } }, comptes), 'lcl', 'choix d’un compte supprimé : ignoré');
    egal(compteDeCarte('Carte A', {}, []), null);
  } },
  { nom: 'Apple Pay : le paiement complète ta saisie (catégorie, montant, libellé gardés ; commerçant ajouté s’il manquait)', fn: () => {
    const saisie = tx({ id: 's', date: A, montant: 250, marchand: 'Dépense', categorie: 'restaurants', source: 'texte' });
    const t = transactionDepuisPaiement({ commercant: 'BOULANGERIE TEST', nom: '', centimes: 250, sens: 'debit', date: A, empreinte: 'abc' }, { compteId: 'courant', maintenant: `${A}T12:00:00Z` });
    const f = fusionnerPaiementDansSaisie(saisie, t);
    egal(f.id, 's'); egal(f.categorie, 'restaurants'); egal(f.montantCentimes, 250); egal(f.source, 'texte');
    egal(f.marchand, 'Boulangerie Test'); egal(f.applePay.empreinte, 'abc');
    const nommee = fusionnerPaiementDansSaisie({ ...saisie, marchand: 'Pain', libelle: 'Pain' }, t);
    egal(nommee.marchand, 'Pain'); egal(nommee.libelle, 'Pain');
  } },
  { nom: 'Apple Pay : enregistrement (cocher, catégorie, oui/non, montant tapé) puis relecture sans doublon', fn: async () => {
    if (!estNode) return; // Dans Safari, la vraie base contient tes données : ce test ne tourne que sous Node
    const { fausseIndexedDB } = await import('../outils/fausse-idb.mjs');
    const avant = globalThis.indexedDB;
    globalThis.indexedDB = fausseIndexedDB();
    forcerAujourdhui(A);
    const store = await import('../../js/store.js');
    const actions = await import('../../js/actions.js');
    try {
      await store.effacerTout();
      const base = etatBase({ transactions: [tx({ id: 's1', date: A, montant: 250, marchand: 'Dépense', categorie: 'restaurants', source: 'texte' })] });
      await store.remplacerTout({ ...base, reglesCategorie: [], meta: {} });
      const texte = fichier(
        L('2026-11-16T08:10:00+01:00', '2,50 €', 'BOULANGERIE TEST'),
        L('2026-11-16T12:00:00+01:00', '9,00 €', 'ATELIER TEST'),
        L('2026-11-16T13:00:00+01:00', '4,00 €', 'KIOSQUE TEST'),
        L('2026-11-15T13:00:00+01:00', '1,00 €', 'STATION TEST'),
        L('2026-11-15T14:00:00+01:00', 'USD 8.00', 'BOUTIQUE TEST'));
      const p = planifierApplePay(analyser(texte), store.etat, { auj: A, maintenant: `${A}T18:00:00.000Z` });
      egal(p.aAjouter.length, 3); egal(p.aConfirmer.length, 1); egal(p.aCompleter.length, 1);
      const [atelier, kiosque, station] = p.aAjouter;
      const r = await actions.enregistrerApplePay(p, {
        ignorer: [kiosque.id], categories: { [atelier.id]: 'loisirs' }, memes: { [p.aConfirmer[0].tx.id]: true },
        montants: { [p.aCompleter[0].tx.id]: 750 }, auj: A, maintenant: `${A}T18:00:00.000Z`,
      });
      egalProfond(r, { ajoutees: 3, fusionnees: 1, ignorees: 1, dejaLa: 0, enAttente: 0 });
      const parNom = (n) => store.etat.transactions.find((t) => t.marchand === n);
      egal(parNom('Atelier Test').categorie, 'loisirs');
      vrai(store.etat.reglesCategorie.some((x) => x.origine === 'utilisateur' && x.categorie === 'loisirs'), 'règle mémorisée');
      egal(parNom('Boutique Test').montantCentimes, 750); egal(parNom('Boutique Test').applePay.devise, 'USD');
      const s1 = store.etat.transactions.find((t) => t.id === 's1');
      egal(s1.applePay.commercant, 'BOULANGERIE TEST'); egal(s1.categorie, 'restaurants'); egal(s1.marchand, 'Boulangerie Test');
      egal(store.etat.transactions.length, 4, 'saisie + 3 ajouts (kiosque décoché)');
      egal(store.etat.meta.applePayVues.length, 5); egalProfond(store.etat.meta.applePayVues, [...store.etat.meta.applePayVues].sort());
      egal(store.etat.meta.applePayDernier.totaux.ajoutees, 3);
      // Relire le même fichier : rien de nouveau, le paiement décoché ne revient pas
      const p2 = planifierApplePay(analyser(texte), store.etat, { auj: A });
      egal(p2.aAjouter.length + p2.aConfirmer.length + p2.aCompleter.length, 0); egal(p2.ignorees.dejaVues, 5);
      // Montant provisoire : corrigé ou confirmé
      const st = parNom('Station Test');
      vrai(st.applePay.provisoire && !st.applePay.verifieLe);
      const corrige = await actions.corrigerMontantProvisoire(st.id, 4520, { maintenant: `${A}T19:00:00.000Z` });
      egal(corrige.montantCentimes, 4520); egal(corrige.applePay.verifieLe, `${A}T19:00:00.000Z`); egal(corrige.applePay.montantInitialCentimes, 100);
      const ok = await actions.confirmerMontant(parNom('Atelier Test').id, { maintenant: `${A}T19:00:00.000Z` });
      egal(ok.applePay.verifieLe, `${A}T19:00:00.000Z`);
      // Choix de compte et date de début mémorisés dans le profil
      await actions.enregistrerApplePay({ aAjouter: [], aConfirmer: [], dejaLa: [], aCompleter: [] }, { cartes: { 'Carte A': 'neo' }, depuis: '2026-11-01', maintenant: `${A}T20:00:00.000Z` });
      egalProfond(store.etat.profil.applePay, { cartes: { 'Carte A': 'neo' }, depuis: '2026-11-01', motsProvisoires: [] });
    } finally {
      await store.effacerTout();
      forcerAujourdhui(null);
      if (avant === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = avant;
    }
  } },
];
