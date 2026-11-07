// ics.js — rappels via le Calendrier (iOS ne permet pas de notification locale programmée sans serveur).

const pad = (n) => String(n).padStart(2, '0');

function echapper(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }

/**
 * Construit un fichier .ics.
 * @param {{ uid, titre, description, date (AAAA-MM-JJ), heure ('09:00'), dureeMinutes, recurrence: null|'WEEKLY'|'BIWEEKLY'|'MONTHLY', joursDuMois?: number[] (chaque mois, ces jours-là), rappelMinutes }} e
 */
export function construireICS(e) {
  const [a, m, j] = e.date.split('-');
  const [hh, mm] = (e.heure || '09:00').split(':');
  const debut = `${a}${m}${j}T${hh}${mm}00`;
  const finDate = new Date(Date.UTC(+a, +m - 1, +j, +hh, +mm + (e.dureeMinutes || 15)));
  const fin = `${finDate.getUTCFullYear()}${pad(finDate.getUTCMonth() + 1)}${pad(finDate.getUTCDate())}T${pad(finDate.getUTCHours())}${pad(finDate.getUTCMinutes())}00`;
  const maintenant = new Date();
  const stamp = `${maintenant.getUTCFullYear()}${pad(maintenant.getUTCMonth() + 1)}${pad(maintenant.getUTCDate())}T${pad(maintenant.getUTCHours())}${pad(maintenant.getUTCMinutes())}00Z`;
  const rrule = e.joursDuMois?.length ? `RRULE:FREQ=MONTHLY;BYMONTHDAY=${e.joursDuMois.join(',')}` : { WEEKLY: 'RRULE:FREQ=WEEKLY', BIWEEKLY: 'RRULE:FREQ=WEEKLY;INTERVAL=2', MONTHLY: 'RRULE:FREQ=MONTHLY', TOUS_LES_3_JOURS: 'RRULE:FREQ=DAILY;INTERVAL=3' }[e.recurrence] || null;
  const lignes = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Budget//Rappels//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT', `UID:${e.uid || stamp + '@budget'}`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Paris:${debut}`, `DTEND;TZID=Europe/Paris:${fin}`,
    `SUMMARY:${echapper(e.titre)}`, `DESCRIPTION:${echapper(e.description || '')}`,
    rrule,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${echapper(e.titre)}`, `TRIGGER:-PT${e.rappelMinutes ?? 0}M`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return lignes.join('\r\n') + '\r\n';
}

/** Ouvre le fichier .ics (iOS propose « Ajouter au Calendrier »). */
export async function ajouterAuCalendrier(e) {
  const contenu = construireICS(e);
  const nom = `${(e.nomFichier || 'rappel-budget').replace(/[^a-z0-9-]/gi, '-')}.ics`;
  const fichier = new File([contenu], nom, { type: 'text/calendar' });
  try {
    if (navigator.canShare?.({ files: [fichier] })) { await navigator.share({ files: [fichier], title: e.titre }); return true; }
  } catch (err) { if (err?.name === 'AbortError') return false; }
  const url = URL.createObjectURL(fichier);
  const a = document.createElement('a');
  a.href = url; a.download = nom; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}
