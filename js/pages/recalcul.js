// recalcul.js (page) — « Recalcul complet » : 1) tu tapes ce que chaque banque affiche, 2) l'app refait tout le calcul
// du mois sous tes yeux, 3) compte par compte : juste ou pas, le calcul en détail, et les pistes pour chaque écart.

import { h, icone, mt, vibrer } from '../ui/dom.js';
import { ouvrirFeuille } from '../ui/sheet.js';
import { champMontant, bouton } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat, ecrireMeta, surChangement } from '../store.js';
import { recalculComplet } from '../recalcul.js';
import { soldes } from '../calculs.js';
import { aVirerEpargne, compteEpargne } from '../virements.js';
import { fluxEnvies } from '../envies.js';
import { declarerSolde, enregistrerVirementInterne } from '../actions.js';
import { aujourdhui, ajouterJours, formatDateCourte } from '../dates.js';
import { formatEuros } from '../money.js';
import { aller } from '../router.js';

const FORCE = { forte: 'Très probable', moyenne: 'Possible', faible: 'À vérifier' };
const mouvementReduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const signe = (c) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${formatEuros(Math.abs(c))}`;

export function feuilleRecalcul() {
  const saisies = {};
  let f = null;
  let etape = 'saisie';
  let desabonner = null;
  const contenu = h('div', { class: 'recalcul' });
  const changer = (noeud) => {
    contenu.replaceChildren(noeud);
    noeud.classList.add('recalcul-entree');
    contenu.scrollIntoView?.({ block: 'start' });
  };

  // 1. Saisie : un champ par compte et par épargne
  const ecranSaisie = () => {
    const auj = aujourdhui();
    const comptes = soldes(etat, auj).comptes.filter((c) => c.compte.type !== 'epargne' && c.compte.type !== 'especes').map((c) => c.compte);
    const poches = (etat.poches || []).filter((p) => p.actif !== false);
    const champ = (id, titre, sousTitre) => h('label', { class: 'recalcul-champ' },
      h('span', { class: 'recalcul-champ-titre' }, titre, sousTitre ? h('small', {}, sousTitre) : null),
      champMontant({ valeur: saisies[id] ?? null, label: `Solde ${titre} à la banque`, onValeur: (v) => { if (v === null) delete saisies[id]; else saisies[id] = v; } }));
    return h('div', { class: 'recalcul-etape' },
      h('p', { class: 'recalcul-intro' }, 'Ouvre tes applis bancaires et tape ce qu’elles affichent maintenant. Laisse vide ce que tu ne veux pas vérifier. Un découvert : tape le signe moins (−120,50).'),
      h('h3', { class: 'feuille-sous-titre' }, 'Tes comptes'),
      ...comptes.map((c) => champ(c.id, c.nom, c.type === 'courant' ? 'compte courant' : c.type === 'neobanque' ? 'néobanque' : 'compte')),
      poches.length ? h('h3', { class: 'feuille-sous-titre' }, 'Tes épargnes') : null,
      ...poches.map((p) => champ(p.id, p.type === 'remboursementAnticipe' ? 'Épargne prêt' : p.type === 'coussin' ? 'Épargne sécurité' : p.nom, compteEpargne(p) ? `sur ${compteEpargne(p)}` : null)),
      bouton('Tout recalculer', () => lancer(), { classe: 'btn-principal btn-large', icone: 'boucle' }));
  };

  // 2. Le calcul sous tes yeux : une ligne cochée après l'autre
  const lancer = () => {
    if (!Object.keys(saisies).length) { toast('Tape au moins un solde.'); return; }
    etape = 'calcul';
    const auj = aujourdhui();
    const r = recalculComplet(etat, auj, saisies);
    const nbTx = etat.transactions.filter((t) => t.date >= r.periode.debut && t.date <= auj).length;
    const etapes = [
      `Solde de départ au ${formatDateCourte(ajouterJours(r.periode.debut, -1))}`,
      `${nbTx} opérations du mois, une par une`,
      'Charges fixes et prélèvements prévus',
      'Virements vers l’épargne et entre tes comptes',
      'Arrondis, reste de la journée, envies',
      'Comparaison avec ta banque',
    ];
    const liste = h('ol', { class: 'recalcul-progres' }, etapes.map((t) => h('li', {}, h('span', { class: 'recalcul-coche', 'aria-hidden': 'true' }), t)));
    changer(h('div', { class: 'recalcul-etape recalcul-calcul', 'aria-live': 'polite' }, h('p', { class: 'recalcul-calcul-titre' }, 'Je recalcule tout…'), liste));
    const items = [...liste.children];
    const pas = mouvementReduit() ? 0 : 230;
    items.forEach((li, i) => setTimeout(() => li.classList.add('fait'), pas * (i + 1)));
    setTimeout(() => montrer(r), pas * (items.length + 1) + (pas ? 150 : 0));
  };

  // 3. Résultat : compte par compte
  const montrer = (r = recalculComplet(etat, aujourdhui(), saisies)) => {
    etape = 'resultat';
    const auj = aujourdhui();
    if (etat.meta.derniereVerification !== auj) ecrireMeta('derniereVerification', auj).catch(() => {});
    const verifiees = r.lignes.filter((l) => l.banqueCentimes !== null);
    const ecarts = verifiees.filter((l) => l.ecartCentimes);
    if (!ecarts.length) vibrer(20);
    changer(h('div', { class: 'recalcul-etape' },
      h('div', { class: `recalcul-bilan ${ecarts.length ? 'ecart' : 'ok'}` },
        h('span', { class: 'recalcul-bilan-icone', 'aria-hidden': 'true' }, ecarts.length ? '🔎' : '✅'),
        h('p', {}, h('strong', {}, ecarts.length ? `${ecarts.length} écart${ecarts.length > 1 ? 's' : ''} trouvé${ecarts.length > 1 ? 's' : ''}` : 'Tout est juste, au centime'),
          h('small', {}, ecarts.length ? `${verifiees.length - ecarts.length} compte${verifiees.length - ecarts.length > 1 ? 's' : ''} juste${verifiees.length - ecarts.length > 1 ? 's' : ''} sur ${verifiees.length}. Les pistes sont classées de la plus probable à la moins probable.` : `${verifiees.length} compte${verifiees.length > 1 ? 's' : ''} vérifié${verifiees.length > 1 ? 's' : ''} : Budget et ta banque sont d’accord.`))),
      r.croisees.length ? h('section', { class: 'recalcul-croisees' }, h('h3', { class: 'feuille-sous-titre' }, 'Le plus probable'), r.croisees.map((p) => piste(p))) : null,
      ...r.lignes.map((l) => carteLigne(l, r)),
      h('div', { class: 'groupe-boutons' },
        bouton('Modifier les soldes', () => { etape = 'saisie'; changer(ecranSaisie()); }, { classe: 'btn-petit', icone: 'crayon' }),
        bouton('Recalculer', () => lancer(), { classe: 'btn-petit', icone: 'boucle' })),
      h('p', { class: 'petit' }, 'Un paiement par carte d’aujourd’hui ou d’hier peut ne pas encore être débité par la banque, et un virement entre deux banques met 1 à 2 jours ouvrés.')));
  };

  const piste = (p, ligne = null) => h('div', { class: `piste piste-${p.force}` },
    h('div', { class: 'piste-tete' }, h('strong', {}, p.titre), h('span', { class: 'piste-force' }, FORCE[p.force])),
    h('p', { class: 'petit' }, p.texte),
    p.action ? boutonAction(p.action, ligne) : null);

  const boutonAction = (a, ligne) => {
    const libelle = { depense: `Ajouter ${formatEuros(a.montantCentimes || 0)}`, entree: `Ajouter une entrée de ${formatEuros(a.montantCentimes || 0)}`, virementEpargne: 'Ouvrir le virement', interne: 'Noter ce virement', mouvementEpargne: a.sens === 'reprise' ? 'Noter le retrait' : 'Ajouter le versement', voirDepenses: 'Voir dans Dépenses' }[a.type];
    if (!libelle) return null;
    return bouton(libelle, async () => {
      if (a.type === 'depense' || a.type === 'entree') {
        const { ouvrirSaisie } = await import('./saisie.js');
        ouvrirSaisie('clavier', { sens: a.type === 'depense' ? 'debit' : 'credit', montantCentimes: a.montantCentimes, libelle: a.libelle || (a.type === 'entree' ? 'Entrée non notée' : 'Dépense'), categorie: a.categorie || null, compteId: a.compteId, date: a.date });
      } else if (a.type === 'virementEpargne') {
        const { feuilleVirement } = await import('./coffres.js');
        feuilleVirement(aVirerEpargne(etat, aujourdhui()));
      } else if (a.type === 'interne') {
        await enregistrerVirementInterne({ deId: a.deId, versId: a.versId, montantCentimes: a.montantCentimes, date: a.date });
        toast('Virement entre tes comptes noté.', { type: 'succes' });
      } else if (a.type === 'mouvementEpargne') {
        const { feuilleMouvement } = await import('./epargne.js');
        feuilleMouvement(etat.poches.find((p) => p.id === a.pocheId), a.sens);
      } else if (a.type === 'voirDepenses') {
        f.fermer(); aller('depenses');
      }
    }, { classe: `btn-petit ${ligne ? 'btn-secondaire' : 'btn-principal'}` });
  };

  const carteLigne = (l, r) => {
    const etatL = l.banqueCentimes === null ? 'non' : l.ecartCentimes ? 'ecart' : 'ok';
    const badge = etatL === 'non' ? 'pas vérifié' : etatL === 'ok' ? '✓ juste' : l.ecartCentimes < 0 ? `il manque ${formatEuros(-l.ecartCentimes)}` : `${formatEuros(l.ecartCentimes)} de plus`;
    const detail = l.sorte === 'compte' ? detailCompteNoeud(l, r) : detailEpargneNoeud(l);
    return h('section', { class: `recalcul-ligne ${etatL}` },
      h('div', { class: 'recalcul-ligne-tete' }, h('h3', {}, l.sorte === 'epargne' ? (l.poche.type === 'remboursementAnticipe' ? 'Épargne prêt' : l.poche.type === 'coussin' ? 'Épargne sécurité' : l.nom) : l.nom), h('span', { class: `recalcul-badge ${etatL}` }, badge)),
      h('div', { class: 'recalcul-chiffres' },
        h('p', {}, h('small', {}, 'Calculé par Budget'), mt(l.appCentimes)),
        h('p', {}, h('small', {}, 'Ta banque'), l.banqueCentimes === null ? h('span', { class: 'petit' }, '—') : mt(l.banqueCentimes))),
      l.pistes.length ? h('div', { class: 'recalcul-pistes' }, l.pistes.map((p) => piste(p, l))) : null,
      etatL === 'ecart' ? h('div', { class: 'recalcul-aligner' },
        bouton('Aucune piste ne colle : aligner', async () => {
          if (l.sorte === 'compte') { await declarerSolde(l.id, l.banqueCentimes, aujourdhui()); toast(`${l.nom} aligné sur ${formatEuros(l.banqueCentimes)}.`, { type: 'succes' }); }
          else { const { feuilleMouvement } = await import('./epargne.js'); feuilleMouvement(l.poche, l.ecartCentimes > 0 ? 'versement' : 'reprise'); }
        }, { classe: 'btn-danger-texte btn-petit' }),
        h('p', { class: 'petit' }, l.sorte === 'compte' ? 'Crée une ligne d’ajustement : ton budget du jour ne change pas.' : 'Note un versement ou un retrait du montant de l’écart.')) : null,
      detail);
  };

  const ligneCle = (libelle, montant, cls = '', signeAff = true) => h('div', { class: `ligne-cle ${cls}` }, h('span', {}, libelle), h('strong', {}, signeAff ? signe(montant) : formatEuros(montant)));

  const detailCompteNoeud = (l, r) => {
    const d = l.detail;
    const flux = fluxEnvies(etat);
    const envies = l.compte.type === 'courant' ? flux.envies.filter((e) => !e.achat && e.cumulCentimes > 0) : [];
    const attente = l.compte.type === 'courant' ? r.enAttenteCentimes : 0;
    return h('details', { class: 'details-discret recalcul-detail' }, h('summary', {}, 'Le calcul en détail'),
      h('div', { class: 'liste-cles' },
        ligneCle(`Solde au ${formatDateCourte(ajouterJours(d.periode.debut, -1))} (veille du salaire)`, d.debutCentimes, 'forte', false),
        ...d.lignes.map((x) => ligneCle(`${x.libelle} (${x.nb})`, x.montantCentimes)),
        ligneCle(`= Solde calculé au ${formatDateCourte(aujourdhui())}`, d.finCentimes, 'forte', false),
        l.banqueCentimes !== null ? ligneCle('Solde de ta banque', l.banqueCentimes, '', false) : null,
        l.banqueCentimes !== null ? ligneCle('Écart', l.ecartCentimes, l.ecartCentimes ? 'negatif' : '') : null),
      d.categories.length ? h('div', {}, h('p', { class: 'petit recalcul-cat-titre' }, 'Dont dépenses du quotidien :'),
        h('div', { class: 'liste-cles' }, d.categories.map((c) => ligneCle(c.nom, c.montantCentimes, '', false)))) : null,
      envies.length || attente ? h('p', { class: 'petit' }, 'Encore sur ce compte, c’est normal : ',
        [attente ? `${formatEuros(attente)} qui attendent le virement vers l’épargne` : null, ...envies.map((e) => `${formatEuros(e.cumulCentimes)} gardés pour ${e.nom}`)].filter(Boolean).join(', '), '.') : null);
  };

  const detailEpargneNoeud = (l) => {
    const d = l.detail;
    return h('details', { class: 'details-discret recalcul-detail' }, h('summary', {}, 'Le calcul en détail'),
      h('div', { class: 'liste-cles' },
        d.soldeInitialCentimes ? ligneCle('Solde de départ', d.soldeInitialCentimes, 'forte', false) : null,
        ligneCle('Versements notés dans Budget', d.versementsCentimes - d.soldeInitialCentimes),
        d.retraitsCentimes ? ligneCle('Retraits', -d.retraitsCentimes) : null,
        ligneCle('= Déjà sur ton épargne', d.appCentimes, 'forte', false),
        l.banqueCentimes !== null ? ligneCle('Ta banque', l.banqueCentimes, '', false) : null),
      d.enAttenteCentimes ? h('p', { class: 'petit' }, `Pas encore compté ici : ${formatEuros(d.enAttenteCentimes)} au prochain virement (le ${formatDateCourte(d.dateVirement)}). Sur l’Accueil, la case de cette épargne les inclut déjà.`) : null);
  };

  changer(ecranSaisie());
  desabonner = surChangement(() => { if (etape === 'resultat') montrer(); });
  f = ouvrirFeuille({ titre: 'Recalcul complet', contenu, plein: true, onFermer: () => desabonner?.() });
  return f;
}
