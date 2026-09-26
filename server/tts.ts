// Voix des habitants via Gradium TTS (REST one-shot). Le son est un bonus : toute panne renvoie 503 et le jeu reste muet.
// Doc : https://docs.gradium.ai/api-reference/endpoint/tts-post
import { env, hasGradium } from './env.ts';
import { NPC_IDS } from '../src/state/types.ts';
import type { NpcId } from '../src/state/types.ts';
import { cleanForSpeech, TTS_MAX_CHARS } from '../src/audio/speechText.ts';
import type { HandlerResult } from './handlers.ts';

const GRADIUM_TTS_URL = 'https://api.gradium.ai/api/post/speech/tts';
const TTS_TIMEOUT_MS = 5000;

interface VoiceProfile {
  voiceId: string;
  /** padding_bonus : négatif = plus rapide, positif = plus lent (plage testée -4..4). */
  paddingBonus: number;
  /** temp : 0.7 par défaut ; plus haut = plus expressif/varié. */
  temp: number;
}

// Voix « flagship » françaises (catalogue https://docs.gradium.ai/guides/voices/flagship-voices).
// Aucune voix âgée au catalogue : Marius = voix posée + débit ralenti.
const VOICES: Record<NpcId, VoiceProfile> = {
  // « Marius » (sic) du catalogue : voix de vendeur énergique et sûr de lui, parfaite pour le bagou de Gaston.
  gaston: { voiceId: 'biuhvu17TxVKOcyy', paddingBonus: -0.5, temp: 0.8 },
  // « Coralie » : jeune Parisienne pétillante, rapide, rieuse.
  josette: { voiceId: 'ZeSg853xFACESHHI', paddingBonus: -0.3, temp: 0.8 },
  // « Gaspard » : voix chaude et posée, ralentie pour le pêcheur philosophe.
  marius: { voiceId: 'iEu63s1rhn_kegTr', paddingBonus: 1.8, temp: 0.6 },
};

function unavailable(error: string): HandlerResult {
  return { status: 503, json: { error } };
}

function parseRequest(body: unknown): { npc: NpcId; text: string } | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'body doit être un objet';
  const { npc, text } = body as Record<string, unknown>;
  if (typeof npc !== 'string' || !(NPC_IDS as readonly string[]).includes(npc)) return 'npc invalide';
  if (typeof text !== 'string' || text.length > TTS_MAX_CHARS) return `text invalide (string ≤ ${TTS_MAX_CHARS})`;
  const clean = cleanForSpeech(text);
  if (!clean) return 'text vide après nettoyage';
  return { npc: npc as NpcId, text: clean };
}

/** POST /api/tts {npc, text} → audio/wav binaire, ou 503 JSON si Gradium absent/en panne. */
export async function handleTts(body: unknown): Promise<HandlerResult> {
  const parsed = parseRequest(body);
  if (typeof parsed === 'string') return { status: 400, json: { error: parsed } };
  if (!hasGradium) return unavailable('TTS indisponible (GRADIUM_API_KEY absente)');

  const voice = VOICES[parsed.npc];
  const label = `tts:${parsed.npc}`;
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  try {
    const res = await fetch(GRADIUM_TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.gradiumApiKey },
      body: JSON.stringify({
        text: parsed.text,
        voice_id: voice.voiceId,
        // WAV 48 kHz mono : seul format lu partout (l'Ogg/Opus n'est pas fiable sur Safari iOS).
        output_format: 'wav',
        only_audio: true,
        // L'API REST attend json_config sous forme de chaîne JSON.
        json_config: JSON.stringify({ padding_bonus: voice.paddingBonus, temp: voice.temp }),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Corps en texte brut (« error from server <code>: <raison> ») : ne contient jamais la clé.
      const detail = (await res.text()).slice(0, 200);
      console.error(`[${label}] HTTP ${res.status} en ${Date.now() - start} ms : ${detail}`);
      return unavailable(`TTS en échec (HTTP ${res.status})`);
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.length < 100) {
      console.error(`[${label}] audio vide (${audio.length} octets)`);
      return unavailable('TTS en échec (audio vide)');
    }
    console.log(`[${label}] ok en ${Date.now() - start} ms (${audio.length} octets, ${parsed.text.length} car.)`);
    return { status: 200, binary: audio, contentType: res.headers.get('content-type') ?? 'audio/wav' };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? `timeout après ${TTS_TIMEOUT_MS} ms` : String(err);
    console.error(`[${label}] échec en ${Date.now() - start} ms : ${reason}`);
    return unavailable('TTS en échec');
  } finally {
    clearTimeout(timer);
  }
}
