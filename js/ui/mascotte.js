// mascotte.js — « Sou », la pièce qui vit sur l'Accueil du style Joyeux. Son visage suit ce qui te reste aujourd'hui.
// Dessin original (SVG en ligne, aucun fichier externe).

const NS = 'http://www.w3.org/2000/svg';

const VISAGES = {
  // Yeux fermés en arcs, grand sourire ouvert
  ravie: `<path d="M34 50 q6 -7 12 0" class="sou-trait"/><path d="M58 50 q6 -7 12 0" class="sou-trait"/>
    <path d="M38 62 q14 16 28 0 z" class="sou-bouche"/><path d="M45 68 q7 5 14 0" class="sou-langue"/>`,
  contente: `<ellipse cx="40" cy="50" rx="4" ry="5.5" class="sou-oeil"/><ellipse cx="64" cy="50" rx="4" ry="5.5" class="sou-oeil"/>
    <circle cx="41.5" cy="48" r="1.4" class="sou-reflet"/><circle cx="65.5" cy="48" r="1.4" class="sou-reflet"/>
    <path d="M40 63 q12 10 24 0" class="sou-trait"/>`,
  inquiete: `<path d="M33 41 l10 3" class="sou-trait fin"/><path d="M71 41 l-10 3" class="sou-trait fin"/>
    <ellipse cx="40" cy="51" rx="3.6" ry="5" class="sou-oeil"/><ellipse cx="64" cy="51" rx="3.6" ry="5" class="sou-oeil"/>
    <path d="M41 66 q4 -4 8 0 t8 0 t8 0" class="sou-trait fin"/>`,
  pile: `<ellipse cx="40" cy="49" rx="4.6" ry="6" class="sou-oeil"/><ellipse cx="64" cy="49" rx="4.6" ry="6" class="sou-oeil"/>
    <circle cx="41.8" cy="47" r="1.6" class="sou-reflet"/><circle cx="65.8" cy="47" r="1.6" class="sou-reflet"/>
    <ellipse cx="52" cy="66" rx="5" ry="6" class="sou-bouche"/>`,
  triste: `<path d="M33 44 l10 -3" class="sou-trait fin"/><path d="M71 44 l-10 -3" class="sou-trait fin"/>
    <ellipse cx="40" cy="52" rx="3.6" ry="4.6" class="sou-oeil"/><ellipse cx="64" cy="52" rx="3.6" ry="4.6" class="sou-oeil"/>
    <path d="M41 69 q11 -9 22 0" class="sou-trait"/><path d="M70 58 q3 6 0 8 q-3 -2 0 -8 z" class="sou-larme"/>`,
};

export const PHRASES = {
  ravie: ['Tranquille, t’as de la marge !', 'Journée en or, continue !', 'On est large aujourd’hui 😎'],
  contente: ['Ça roule, continue comme ça.', 'Tout va bien, on garde le cap.', 'Joli, t’es dans les clous.'],
  inquiete: ['Doucement, ça fond…', 'Il en reste un peu, on fait gaffe ?', 'Encore un petit effort pour tenir.'],
  pile: ['Pile poil ! Plus rien à dépenser aujourd’hui.', 'Zéro pile, on s’arrête là ?'],
  triste: ['Oups, c’est dépassé. Demain on se rattrape !', 'Pas grave, demain ça repart à neuf.'],
};

/** Une phrase pour l'humeur, stable sur la journée (pas de changement à chaque affichage). */
export function phraseDuJour(humeur, dateIso, decalage = 0) {
  const liste = PHRASES[humeur] || PHRASES.contente;
  const graine = [...dateIso].reduce((s, c) => s + c.charCodeAt(0), 0) + decalage;
  return liste[graine % liste.length];
}

/** Le SVG de Sou. */
export function mascotte(humeur = 'contente', { taille = 96, titre = 'Sou, ta pièce' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 104 104');
  svg.setAttribute('width', String(taille));
  svg.setAttribute('height', String(taille));
  svg.setAttribute('class', `sou sou-${humeur}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', titre);
  svg.innerHTML = `
    <ellipse cx="52" cy="98" rx="26" ry="4" class="sou-ombre"/>
    <g class="sou-corps">
      <circle cx="52" cy="52" r="44" class="sou-piece"/>
      <circle cx="52" cy="52" r="35" class="sou-bord"/>
      <path d="M22 36 a34 34 0 0 1 22 -20" class="sou-brillance"/>
      <ellipse cx="31" cy="60" rx="6" ry="3.6" class="sou-joue"/><ellipse cx="73" cy="60" rx="6" ry="3.6" class="sou-joue"/>
      ${VISAGES[humeur] || VISAGES.contente}
    </g>`;
  return svg;
}
