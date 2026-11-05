// bilan-dimanche.js (V2) — bilan du dimanche par Gemini : réutilise coach.agregatsPourCoach sur 7 jours
// et PROMPT_COACH ; seul l'agrégat anonymisé est envoyé.

import { agregatsPourCoach } from '../coach.js';

export function agregatsSemaine(etat, finIso) {
  return agregatsPourCoach(etat, { fin: finIso, nbMois: 7 / 30.44 });
}
