// privation.js (page) — « Je me suis privé » : choisir à quoi on a renoncé, le montant part à l'épargne.

import { h, icone, mt, vibrer } from '../ui/dom.js';
import { ouvrirFeuille, confirmer } from '../ui/sheet.js';
import { bouton, champ, champMontant, carte } from '../ui/composants.js';
import { toast } from '../ui/toast.js';
import { etat, supprimerObjet } from '../store.js';
import { ajouterPrivation, virerPrivations } from '../actions.js';
import { montantsHabituels, bilanPrivations } from '../privations.js';
import { periodeBudget } from '../calculs.js';
import { aujourdhui, formatDateCourte } from '../dates.js';
import { formatEuros, versChamp } from '../money.js';
import { categorie } from '../categories.js';

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
    const b = bilanPrivations(etat, periodeBudget(aujourdhui(), etat.profil));
    toast(`Bravo : ${formatEuros(montant)} mis de côté. À virer sur ton livret : ${formatEuros(b.aVirerCentimes)}.`, { type: 'succes', duree: 5000 });
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
  const per = periodeBudget(aujourdhui(), etat.profil);
  const b = bilanPrivations(etat, per);
  const dernieres = [...(etat.privations || [])].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 20);
  return carte('Je me suis privé', h('div', { class: 'carte-privations' },
    h('p', {}, b.nbMois ? `Ce mois-ci : ${b.nbMois} fois, ${formatEuros(b.moisCentimes)} mis de côté.` : 'Quand tu renonces à manger dehors, à un VTC ou à un café, mets le montant de côté ici.'),
    b.aVirerCentimes ? h('p', { class: 'privations-a-virer' }, icone('tirelire'), ' À virer sur ton livret : ', h('strong', {}, mt(b.aVirerCentimes))) : null,
    h('div', { class: 'groupe-boutons' },
      bouton('Je me suis privé', () => feuillePrivation(), { classe: 'btn-principal btn-petit', icone: 'plus' }),
      b.aVirerCentimes ? bouton('C’est viré', async () => { await virerPrivations(); toast(`${formatEuros(b.aVirerCentimes)} versés sur ton épargne.`, { type: 'succes' }); }, { classe: 'btn-petit' }) : null),
    b.totalCentimes ? h('p', { class: 'petit' }, `Depuis le début : ${formatEuros(b.totalCentimes)} mis de côté en te privant.`) : null,
    dernieres.length ? h('details', { class: 'details-discret' }, h('summary', {}, 'Détail'),
      h('div', { class: 'liste-cles' }, dernieres.map((p) => h('div', { class: 'ligne-cle' },
        h('span', {}, `${formatDateCourte(p.date)} · ${p.libelle}${p.vireLe ? ' · viré' : ''}`),
        h('span', { class: 'ligne-cle-valeur' }, mt(p.montantCentimes), p.vireLe ? null : h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Retirer ${p.libelle}`, onclick: async () => {
          if (await confirmer({ titre: 'Retirer ?', message: `« ${p.libelle} » (${formatEuros(p.montantCentimes)}) ne sera plus mis de côté.`, ok: 'Retirer' })) await supprimerObjet('privations', p.id);
        } }, icone('fermer'))))))) : null), { id: 'privations' });
}
