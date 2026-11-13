// privation.js (page) — « Je me suis privé » : choisir à quoi on a renoncé, le montant part à l'épargne.

import { h, icone, mt, vibrer } from '../ui/dom.js';
import { ouvrirFeuille, confirmer } from '../ui/sheet.js';
import { bouton, champ, champMontant, carte } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat, supprimerObjet } from '../store.js';
import { ajouterPrivation } from '../actions.js';
import { montantsHabituels, bilanPrivations } from '../privations.js';
import { periodeBudget, resteADepenser, prixRepas } from '../calculs.js';
import { aujourdhui, formatDateCourte } from '../dates.js';
import { formatEuros, versChamp } from '../money.js';
import { categorie } from '../categories.js';
import { feter, estJoyeux } from '../ui/fete.js';
import { POINTS } from '../jeu.js';

/** Feuille « Je me suis privé ». */
export function feuillePrivation() {
  const options = montantsHabituels(etat);
  let choix = options[0];
  let montant = choix.montantCentimes;
  let libelleAutre = '';
  const champM = champMontant({ valeur: montant, onValeur: (v) => { montant = v; majBouton(); }, label: 'Montant mis de côté' });
  const libelleInput = h('input', { class: 'input', placeholder: 'Ce à quoi tu as renoncé', autocomplete: 'off', oninput: (e) => { libelleAutre = e.target.value; } });
  const zoneAutre = champ('Quoi', libelleInput);
  const valider = h('button', { type: 'button', class: 'btn btn-principal btn-large' });
  const majBouton = () => { valider.disabled = !(montant > 0) || null; valider.textContent = montant > 0 ? `Mettre ${formatEuros(montant)} de côté` : 'Indique un montant'; };
  const liste = h('div', { class: 'choix-privation', role: 'radiogroup', 'aria-label': 'À quoi as-tu renoncé ?' });
  const rendreChoix = () => {
    liste.replaceChildren(...[...options, { id: 'autre', libelle: 'Autre chose' }].map((o) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(choix.id === o.id), class: `choix-privation-option ${choix.id === o.id ? 'actif' : ''}`, style: { '--c': categorie(o.id === 'autre' ? 'plaisir' : o.categorie).couleur },
      onclick: () => { choix = o; if (o.montantCentimes) { montant = o.montantCentimes; champM.value = versChamp(o.montantCentimes); } zoneAutre.hidden = o.id !== 'autre'; rendreChoix(); majBouton(); },
    }, h('span', { class: 'choix-privation-nom' }, o.libelle),
      o.montantCentimes ? h('small', {}, o.habituel ? `${formatEuros(o.montantCentimes)}, ton prix habituel${o.marchand ? ` (${o.marchand})` : ''}` : `environ ${formatEuros(o.montantCentimes)}`) : h('small', {}, 'Tu choisis le montant'))));
  };
  zoneAutre.hidden = true;
  rendreChoix(); majBouton();
  valider.addEventListener('click', async () => {
    if (!(montant > 0)) return;
    const libelle = choix.id === 'autre' ? (libelleAutre.trim() || 'Dépense évitée') : choix.libelle;
    await ajouterPrivation({ categorie: choix.id === 'autre' ? 'autres' : choix.categorie, libelle, montantCentimes: montant });
    vibrer(20); f.fermer();
    const b = bilanPrivations(etat, periodeBudget(aujourdhui(), etat.profil), resteADepenser(etat, aujourdhui()).privationsAuto || []);
    feter('privation', { xp: POINTS.privation, texte: 'pièce mise de côté' });
    if (document.documentElement.dataset.app === 'v100') { import('../v100/ui/confirmation.js').then((m) => m.confirmerPrivation(montant)).catch(() => {}); return; }
    toast(`${estJoyeux() ? '🐷 ' : ''}Bravo : ${formatEuros(montant)} mis de côté. À virer sur ton compte épargne : ${formatEuros(b.aVirerCentimes)}.`, { type: 'succes', duree: 5000 });
  });
  const f = ouvrirFeuille({
    titre: 'Je me suis privé',
    contenu: h('div', { class: 'formulaire' },
      h('p', { class: 'petit' }, 'Tu as renoncé à une dépense ? Le montant part à l’épargne au lieu de rester dans ton budget du jour.'),
      liste, zoneAutre, champ('Montant mis de côté', champM), valider),
  });
  return f;
}

/** Carte de la page Épargne : ce mois-ci, à virer, historique. */
export function carteprivations() {
  const r = resteADepenser(etat, aujourdhui());
  const per = r.periode;
  const auto = r.privationsAuto || [];
  const b = bilanPrivations(etat, per, auto);
  const reg = etat.profil.repasAuto;
  const prix = prixRepas(etat);
  const dernieres = [...(etat.privations || []), ...auto].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 30);
  return carte('Je me suis privé', h('div', { class: 'carte-privations' },
    h('p', {}, b.nbMois ? `Ce mois-ci : ${formatEuros(b.moisCentimes)} mis de côté${b.nbAuto ? `, dont ${b.nbAuto} jour${b.nbAuto > 1 ? 's' : ''} de repas à la maison` : ''}.` : 'Quand tu renonces à manger dehors, à un VTC ou à un café, mets le montant de côté ici.'),
    reg?.actif ? h('p', { class: 'petit' }, `Automatique : chaque jour où tu ne notes pas de repas dehors, ${reg.repasParJour || 2} repas à ${formatEuros(prix)} (ton menu habituel) partent à l’épargne, sans dépasser ce qui reste de ta part du jour. Tu as mangé dehors sans le noter ? Ajoute la dépense : le montant s’ajuste.`) : null,
    // Le virement se fait avec celui de la semaine (« Reste à virer vers l’épargne », en haut)
    h('div', { class: 'groupe-boutons' },
      bouton('Je me suis privé', () => feuillePrivation(), { classe: 'btn-principal btn-petit', icone: 'plus' })),
    b.totalCentimes ? h('p', { class: 'petit' }, `Depuis le début : ${formatEuros(b.totalCentimes)} mis de côté en te privant.`) : null,
    dernieres.length ? h('details', { class: 'details-discret' }, h('summary', {}, 'Détail'),
      h('div', { class: 'liste-cles' }, dernieres.map((p) => h('div', { class: 'ligne-cle' },
        h('span', {}, `${formatDateCourte(p.date)} · ${p.libelle}${p.auto ? ' (auto)' : ''}${p.vireLe ? ' · viré' : ''}`),
        h('span', { class: 'ligne-cle-valeur' }, mt(p.montantCentimes), p.vireLe || p.auto || p.source === 'resteJour' ? null : h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Retirer ${p.libelle}`, onclick: async () => {
          if (await confirmer({ titre: 'Retirer ?', message: `« ${p.libelle} » (${formatEuros(p.montantCentimes)}) ne sera plus mis de côté.`, ok: 'Retirer' })) await supprimerObjet('privations', p.id);
        } }, icone('fermer'))))))) : null), { id: 'privations' });
}
