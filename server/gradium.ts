import { speakableText, VOICES, voiceSettings } from '../shared/voices.js';
import { pcmToWav } from '../shared/wav.js';
import type { Emotion, NpcId } from '../shared/types.js';

const BASE = 'https://api.gradium.ai/api/post/speech';
const TTS_RATE = 22050;

export class GradiumError extends Error {}

function gradiumKey(): string {
  const key = process.env.GRADIUM_API_KEY || process.env.GRADIUM_KEY;
  if (!key) throw new GradiumError('missing GRADIUM_API_KEY');
  return key;
}

async function readBody<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new GradiumError(`body read failed (${reason})`);
  }
}

async function call(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new GradiumError(`network/timeout (${reason})`);
  }
  if (!res.ok) throw new GradiumError(`HTTP ${res.status}: ${(await readBody(() => res.text())).slice(0, 200)}`);
  return res;
}

/** Synthesises an NPC line in its own voice. Returns a WAV file, or null when there is nothing to say. */
export async function synthesize(npc: NpcId, text: string, emotion: Emotion, timeoutMs: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const clean = speakableText(text);
  if (!clean) return null;
  const res = await call(
    `${BASE}/tts`,
    {
      method: 'POST',
      headers: { 'x-api-key': gradiumKey(), 'content-type': 'application/json' },
      body: JSON.stringify({
        text: clean,
        voice_id: VOICES[npc].voiceId,
        output_format: `pcm_${TTS_RATE}`,
        only_audio: true,
        json_config: voiceSettings(npc, emotion),
      }),
    },
    timeoutMs,
  );
  return pcmToWav(new Uint8Array(await readBody(() => res.arrayBuffer())), TTS_RATE);
}

interface AsrMessage {
  type?: string;
  text?: string;
  message?: string;
}

/** Transcribes a French WAV recording. */
export async function transcribe(wav: Uint8Array<ArrayBuffer>, timeoutMs: number): Promise<string> {
  const config = encodeURIComponent(JSON.stringify({ language: 'en' }));
  const res = await call(
    `${BASE}/asr?json_config=${config}`,
    { method: 'POST', headers: { 'x-api-key': gradiumKey(), 'content-type': 'audio/wav' }, body: wav },
    timeoutMs,
  );
  const words: string[] = [];
  for (const line of (await readBody(() => res.text())).split('\n')) {
    if (!line.trim()) continue;
    let msg: AsrMessage;
    try {
      msg = JSON.parse(line) as AsrMessage;
    } catch {
      throw new GradiumError(`ASR: invalid NDJSON line ${line.slice(0, 80)}`);
    }
    if (msg.type === 'text' && msg.text) words.push(msg.text);
    else if (msg.type === 'error') throw new GradiumError(`ASR error: ${msg.message ?? line.slice(0, 120)}`);
  }
  return words.join(' ').replace(/\s+/g, ' ').trim();
}
