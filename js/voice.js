// voice.js — enregistrement vocal (MediaRecorder + getUserMedia), compatible Safari iOS en mode installé.
// webkitSpeechRecognition n'est PAS utilisé (indisponible en mode écran d'accueil).

export const DUREE_MAX_MS = 30000;
const CANDIDATS = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

export function voixDisponible() {
  return !!(navigator.mediaDevices?.getUserMedia && globalThis.MediaRecorder);
}

/** Type MIME réellement produit par l'appareil (souvent audio/mp4 sur iOS). */
export function choisirMime() {
  if (!globalThis.MediaRecorder?.isTypeSupported) return '';
  return CANDIDATS.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

/** Correspondance vers un type accepté par Gemini (audio/mp4 n'est pas listé : même conteneur que m4a). */
export function mimePourGemini(type) {
  const base = String(type || '').split(';')[0].trim().toLowerCase();
  return { 'audio/mp4': 'audio/m4a', 'audio/x-m4a': 'audio/m4a', 'audio/aac': 'audio/aac', 'audio/webm': 'audio/webm', 'audio/ogg': 'audio/ogg', 'audio/mpeg': 'audio/mpeg', 'audio/wav': 'audio/wav' }[base] || base || 'audio/m4a';
}
export const MIME_REPLI = { 'audio/m4a': 'audio/aac', 'audio/aac': 'audio/mpeg' };

export function messageErreurMicro(e) {
  const n = e?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Accès au micro refusé. Autorise le micro quand iOS le demande (il le redemande à chaque lancement de l’app), ou utilise « Je ne peux pas parler, écrire ».';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Aucun micro disponible sur cet appareil.';
  if (n === 'NotReadableError') return 'Le micro est utilisé par une autre app (appel en cours ?).';
  return `Enregistrement impossible : ${e?.message || 'erreur inconnue'}.`;
}

/**
 * Démarre un enregistrement.
 * @param {{ surNiveau?: (0..1) => void, surFin?: (resultat) => void }} o
 * @returns {Promise<{ arreter: () => Promise<{blob, mime, dureeMs}>, annuler: () => void }>}
 */
export async function demarrerEnregistrement(o = {}) {
  const flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = choisirMime();
  const rec = new MediaRecorder(flux, mime ? { mimeType: mime } : undefined);
  const morceaux = [];
  rec.ondataavailable = (e) => { if (e.data?.size) morceaux.push(e.data); };
  const debut = performance.now();
  // Niveau sonore réel (AnalyserNode) pour l'animation
  let ctx = null; let raf = 0;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    const src = ctx.createMediaStreamSource(flux);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const boucle = () => {
      an.getByteTimeDomainData(buf);
      let s = 0; for (const v of buf) s += ((v - 128) / 128) ** 2;
      o.surNiveau?.(Math.min(1, Math.sqrt(s / buf.length) * 4));
      raf = requestAnimationFrame(boucle);
    };
    boucle();
  } catch { /* l'animation est facultative */ }
  let annule = false;
  const nettoyer = () => { cancelAnimationFrame(raf); flux.getTracks().forEach((t) => t.stop()); ctx?.close?.(); };
  const fin = new Promise((resolve) => {
    rec.onstop = () => {
      nettoyer();
      if (annule) { resolve(null); return; }
      const type = rec.mimeType || mime || 'audio/mp4';
      resolve({ blob: new Blob(morceaux, { type }), mime: type, dureeMs: performance.now() - debut });
    };
  });
  rec.start(250);
  const minuteur = setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, DUREE_MAX_MS);
  fin.then((r) => { clearTimeout(minuteur); if (r) o.surFin?.(r); });
  return {
    arreter: () => { if (rec.state !== 'inactive') rec.stop(); return fin; },
    annuler: () => { annule = true; clearTimeout(minuteur); if (rec.state !== 'inactive') rec.stop(); else nettoyer(); },
    debut,
  };
}

export function blobEnBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
