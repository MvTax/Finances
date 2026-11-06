// onboarding.js — 4 écrans passables et reprenables : revenus, logement & charges, objectif, confidentialité.

import { h, icone, mt } from '../ui/dom.js';
import { champ, champMontant, bouton, interrupteur } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat, enregistrer, enregistrerLot, majProfil, majParametres, nouvelId } from '../store.js';
import { aller } from '../router.js';
import { revenusDuMois, periodeBudget } from '../calculs.js';
import { confirmerRevenus } from '../actions.js';
import { aujourdhui, formatMois } from '../dates.js';
import { formatEuros } from '../money.js';

export const titre = 'Bienvenue';
const ETAPES = ['Revenus', 'Logement & charges', 'Objectif', 'Confidentialité'];

export function rendre(vue) {
  const o = etat.parametres.onboarding || {};
  let etape = Math.min(o.etape || 0, 3);
  const zone = h('div', { class: 'onboarding-zone' });
  const progression = h('ol', { class: 'onboarding-etapes', 'aria-label': 'Étapes' });
  const dessiner = () => {
    progression.replaceChildren(...ETAPES.map((e, i) => h('li', { class: i === etape ? 'actif' : i < etape ? 'fait' : '', 'aria-current': i === etape ? 'step' : null }, h('span', { class: 'sr' }, `Étape ${i + 1} : `), e)));
    zone.replaceChildren([ecranRevenus, ecranLogement, ecranObjectif, ecranConfidentialite][etape]());
    zone.querySelector('h2')?.focus();
  };
  const suivant = async () => { etape++; await majParametres({ onboarding: { ...etat.parametres.onboarding, etape } }); if (etape > 3) return terminer(); dessiner(); };
  const precedent = () => { if (etape > 0) { etape--; dessiner(); } };
  const terminer = async () => { await majParametres({ onboarding: { ...etat.parametres.onboarding, termine: true, etape: 4 } }); aller('accueil', { remplacer: true }); };
  const nav = (avant) => h('div', { class: 'onboarding-nav' },
    etape > 0 ? bouton('Retour', precedent) : bouton('Passer', terminer),
    bouton(etape === 3 ? 'Terminer' : 'Continuer', async () => { if (avant && (await avant()) === false) return; await suivant(); }, { classe: 'btn-principal' }));

  function entete(t, texte) {
    return [h('h2', { class: 'onboarding-titre', tabindex: '-1' }, t), texte ? h('p', { class: 'onboarding-texte' }, texte) : null,
      o.prerempli ? h('p', { class: 'etiquette-prerempli' }, icone('ok'), ' Pré-rempli depuis ton import : confirme ou corrige.') : null];
  }

  function ecranRevenus() {
    const mois = periodeBudget(aujourdhui(), etat.profil).mois;
    const r = revenusDuMois(etat, mois);
    let sal = r.salaireCentimes || null; let prime = r.primeActiviteCentimes ?? null; let jour = etat.profil.jourSalaireHabituel || 1;
    let alsOk = true;
    const qAls = etat.questions.find((q) => q.type === 'als' && q.statut === 'ouverte');
    return h('div', { class: 'onboarding-ecran' }, ...entete(`Tes revenus de ${formatMois(mois)}`, 'Au centime près : salaire net reçu et prime d’activité. L’aide au logement versée au bailleur n’est jamais comptée comme revenu.'),
      champ('Salaire net', champMontant({ valeur: sal, onValeur: (v) => { sal = v; }, autofocus: true })),
      champ("Prime d'activité (CAF)", champMontant({ valeur: prime, onValeur: (v) => { prime = v; } })),
      champ('Jour de salaire habituel', h('input', { class: 'input', inputmode: 'numeric', value: String(jour), oninput: (e) => { jour = Math.max(1, Math.min(28, Number(e.target.value) || 1)); } })),
      qAls ? interrupteur('Classer les « VERSEMENT ALS » en entrée exceptionnelle (aide au logement), hors revenus', true, (v) => { alsOk = v; }) : null,
      nav(async () => {
        await majProfil({ jourSalaireHabituel: jour });
        if (sal !== null && prime !== null) await confirmerRevenus(mois, { salaireCentimes: sal, primeActiviteCentimes: prime });
        const qj = etat.questions.find((q) => q.type === 'jourSalaire' && q.statut === 'ouverte');
        if (qj) await enregistrer('questions', { ...qj, statut: 'repondue', reponse: { jour } });
        if (qAls) {
          await enregistrer('questions', { ...qAls, statut: 'repondue', reponse: { classement: alsOk ? 'entree-exceptionnelle' : 'autres-entrees' } });
          if (!alsOk) await enregistrerLot(etat.transactions.filter((t) => t.categorie === 'entree-exceptionnelle').map((t) => ({ collection: 'transactions', valeur: { ...t, categorie: 'autres-entrees' } })));
        }
      }));
  }

  function ecranLogement() {
    let loyer = etat.profil.loyerAPayerCentimes || null; let jour = etat.profil.jourLoyer || 5;
    const candidat = etat.chargesFixes.find((c) => c.estLoyer);
    const qLoyer = etat.questions.find((q) => q.type === 'loyer' && q.statut === 'ouverte');
    if (!loyer && qLoyer) { loyer = qLoyer.reponseProposee.montantCentimes; jour = qLoyer.reponseProposee.jour; }
    const coches = new Map(etat.chargesFixes.map((c) => [c.id, c.actif]));
    return h('div', { class: 'onboarding-ecran' }, ...entete('Logement et charges fixes', 'Le loyer que tu paies réellement (aide déjà déduite) et tes prélèvements réguliers.'),
      candidat ? h('p', { class: 'question-inline' }, icone('info'), ` Le prélèvement mensuel au montant variable du ${candidat.jourPrelevement} (${formatEuros(candidat.montantCentimes)} la dernière fois) semble être ton loyer.`) : null,
      champ('Loyer à payer', champMontant({ valeur: loyer, onValeur: (v) => { loyer = v; } }), 'Aide versée au bailleur, non comptabilisée dans vos revenus.'),
      champ('Jour de prélèvement du loyer', h('input', { class: 'input', inputmode: 'numeric', value: String(jour), oninput: (e) => { jour = Math.max(1, Math.min(31, Number(e.target.value) || 1)); } })),
      etat.chargesFixes.length ? h('fieldset', { class: 'champ' }, h('legend', {}, 'Charges fixes détectées'), etat.chargesFixes.map((c) => h('label', { class: 'case' }, h('input', { type: 'checkbox', checked: c.actif, onchange: (e) => coches.set(c.id, e.target.checked) }), `${c.estLoyer ? 'Loyer' : c.libelle} · le ${c.jourPrelevement} · ${formatEuros(c.montantCentimes)}`))) : h('p', { class: 'petit' }, 'Aucune charge détectée pour l’instant : elles apparaîtront après l’import d’un relevé.'),
      nav(async () => {
        await majProfil({ loyerAPayerCentimes: loyer || 0, jourLoyer: jour });
        const ops = etat.chargesFixes.map((c) => ({ collection: 'chargesFixes', valeur: { ...c, actif: coches.get(c.id), aConfirmer: false, ...(c.estLoyer ? { jourPrelevement: jour } : {}) } }));
        if (!candidat && loyer) ops.push({ collection: 'chargesFixes', valeur: { id: nouvelId('cf'), libelle: 'Loyer', estLoyer: true, montantCentimes: loyer, jourPrelevement: jour, categorie: 'logement', compteId: etat.comptes.find((x) => x.type === 'courant')?.id, motifDetection: 'LOYER', actif: true, origine: 'utilisateur' } });
        if (qLoyer) ops.push({ collection: 'questions', valeur: { ...qLoyer, statut: 'repondue', reponse: { estLoyer: true, montantCentimes: loyer, jour } } });
        await enregistrerLot(ops);
      }));
  }

  function ecranObjectif() {
    const plaisirEnv = etat.enveloppes.find((e) => e.sanctuarisee);
    let plaisir = plaisirEnv?.plafondMensuelCentimes ?? 5000;
    const coussin = etat.poches.find((p) => p.type === 'coussin');
    return h('div', { class: 'onboarding-ecran' }, ...entete('Ton épargne', 'Elle passe après tes dépenses obligatoires (loyer, prélèvements, dettes, courses, transports) : chaque mois, l’app met de côté le maximum de ce qui reste, sans montant fixe. Puis elle le répartit dans tes poches.'),
      coussin ? h('p', { class: 'petit' }, `Poche « ${coussin.nom} » : cible ${formatEuros(coussin.cibleCentimes)}, uniquement pour les vrais imprévus.`) : null,
      h('div', { class: 'liste-cles' }, etat.poches.filter((p) => p.actif !== false).map((p) => h('div', { class: 'ligne-cle' }, h('span', {}, p.nom), p.cibleCentimes ? mt(p.cibleCentimes) : h('span', {}, '—')))),
      champ('Enveloppe « Plaisir sans culpabilité »', champMontant({ valeur: plaisir, onValeur: (v) => { plaisir = v; } }), 'Dépensée sans alerte bloquante : un budget plaisir assumé évite de craquer ailleurs.'),
      nav(async () => {
        if (plaisirEnv) await enregistrer('enveloppes', { ...plaisirEnv, plafondMensuelCentimes: plaisir || 0 });
        else await enregistrer('enveloppes', { id: nouvelId('env'), nom: 'Plaisir sans culpabilité', categories: ['plaisir'], categorie: 'plaisir', plafondMensuelCentimes: plaisir || 0, vitale: false, sanctuarisee: true, report: false });
      }));
  }

  function ecranConfidentialite() {
    let cle = etat.parametres.cleGemini || ''; let local = etat.parametres.mode100Local;
    return h('div', { class: 'onboarding-ecran' }, ...entete('Confidentialité', 'Tout reste sur ton iPhone. Gemini est facultatif : il sert à la voix, aux tickets et au coach, avec l’indication de ce qui part avant chaque envoi.'),
      interrupteur('Mode 100 % local (aucun envoi)', local, (v) => { local = v; }),
      champ('Clé Gemini (facultatif)', h('input', { class: 'input', type: 'password', autocomplete: 'off', autocapitalize: 'off', value: cle, oninput: (e) => { cle = e.target.value.trim(); } }), 'Google AI Studio → « Get API key ». Restreins-la à ton domaine github.io.'),
      h('p', { class: 'petit' }, 'Code PIN, masquage des montants et sauvegarde : dans Réglages → Confidentialité et Sauvegarde. Le PIN est un verrou d’écran, pas un chiffrement.'),
      h('div', { class: 'groupe-boutons' }, bouton('Importer un relevé ou une sauvegarde', async () => { await majParametres({ cleGemini: cle, mode100Local: local, onboarding: { ...etat.parametres.onboarding, etape: 3 } }); aller('reglages/import'); }, { icone: 'importer' })),
      nav(async () => { await majParametres({ cleGemini: cle, mode100Local: local }); toast('C’est prêt.', { type: 'succes' }); }));
  }

  vue.replaceChildren(h('div', { class: 'onboarding' }, h('p', { class: 'surtitre' }, 'Budget'), progression, zone));
  dessiner();
}
