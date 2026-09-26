// Voix des habitants (Gradium TTS via /api/tts). Bonus pur : silence si muet, si le serveur n'a pas de clé ou en cas de panne.
// Lecture via le même AudioContext que les bruitages (déjà déverrouillé par initAudio, donc OK sur iOS hors geste).
import type { NpcId } from '../state/types';
import { audioOut } from './sfx';
import { cleanForSpeech } from './speechText';

const CLIENT_TIMEOUT_MS = 6000;
const RETRY_AFTER_MS = 60_000;

let disabledUntil = 0;
let current: { abort: AbortController; source: AudioBufferSourceNode | null; done: () => void } | null = null;

/** Coupe la réplique en cours (requête ou lecture). Sans effet s'il n'y en a pas. */
export function stopSpeaking(): void {
  const c = current;
  current = null;
  if (!c) return;
  c.abort.abort();
  if (c.source) {
    try {
      c.source.stop();
    } catch (err) {
      console.debug('[voice] source déjà arrêtée :', err);
    }
    c.source.disconnect();
  }
  c.done();
}

export function isSpeaking(): boolean {
  return current !== null;
}

/** Faux tant que le serveur a répondu 503 il y a moins de 60 s (pas de clé Gradium ou service en panne). */
export function isVoiceAvailable(): boolean {
  return Date.now() >= disabledUntil;
}

/**
 * Fait dire `text` à `npc`. Annule la réplique précédente. Ne rejette jamais : se résout à la fin de la lecture,
 * ou tout de suite si muet / indisponible / en échec / annulé.
 */
export async function speak(npc: NpcId, text: string): Promise<void> {
  stopSpeaking();
  if (!audioOut() || !isVoiceAvailable()) return;
  const clean = cleanForSpeech(text);
  if (!clean) return;

  return new Promise<void>((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const me = { abort: new AbortController(), source: null as AudioBufferSourceNode | null, done };
    current = me;
    void fetchAndPlay(npc, clean, me).finally(() => {
      // Si rien n'est en lecture (échec, muet…), on libère tout de suite.
      if (!me.source) {
        if (current === me) current = null;
        done();
      }
    });
  });
}

async function fetchAndPlay(
  npc: NpcId,
  text: string,
  me: { abort: AbortController; source: AudioBufferSourceNode | null; done: () => void },
): Promise<void> {
  const timer = setTimeout(() => me.abort.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npc, text }),
      signal: me.abort.signal,
    });
    if (res.status === 503) {
      disabledUntil = Date.now() + RETRY_AFTER_MS;
      console.info('[voice] TTS indisponible, nouvel essai dans 60 s.');
      return;
    }
    if (!res.ok) {
      console.warn(`[voice] /api/tts → HTTP ${res.status}`);
      return;
    }
    const data = await res.arrayBuffer();
    clearTimeout(timer);
    if (current !== me) return; // une réplique plus récente a pris la main
    const out = audioOut();
    if (!out) return;
    const buffer = await out.c.decodeAudioData(data);
    if (current !== me || !audioOut()) return;
    const src = out.c.createBufferSource();
    src.buffer = buffer;
    src.connect(out.dest);
    src.onended = () => {
      src.disconnect();
      if (current === me) current = null;
      me.done();
    };
    me.source = src;
    src.start();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (current === me) console.warn(`[voice] timeout après ${CLIENT_TIMEOUT_MS} ms`);
      return;
    }
    console.warn('[voice] échec de la synthèse ou du décodage :', err);
  } finally {
    clearTimeout(timer);
  }
}
