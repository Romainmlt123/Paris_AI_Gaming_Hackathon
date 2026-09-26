import { floatToWav, resample } from '../shared/wav';
import type { Emotion, NpcId } from '../shared/types';

const SOUND_KEY = 'ragots.sound';
const TTS_TIMEOUT_MS = 9000;
const STT_TIMEOUT_MS = 12000;
const STT_RATE = 24000;
const MAX_RECORD_MS = 12000;

let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;
let speakToken = 0;
let soundOn = localStorage.getItem(SOUND_KEY) !== 'off';

function audio(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

/** Mobile browsers only allow audio after a user gesture: resume the context on the first tap. */
export function unlockAudioOnGesture(): void {
  const unlock = (): void => {
    void audio().resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function isSoundOn(): boolean {
  return soundOn;
}

export function setSound(on: boolean): void {
  soundOn = on;
  localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  if (!on) stopSpeaking();
}

export function stopSpeaking(): void {
  speakToken += 1;
  if (!current) return;
  try {
    current.stop();
  } catch (err) {
    console.warn('[voice] stop failed', err);
  }
  current = null;
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

/** Speaks an NPC line in its Gradium voice. Never throws; silently skipped when sound is off or TTS fails. */
export async function speak(npc: NpcId, text: string, emotion: Emotion): Promise<void> {
  if (!soundOn) return;
  stopSpeaking();
  const token = speakToken;
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ npc, text, emotion }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    if (res.status === 204) return;
    if (!res.ok) throw new Error(`/api/tts → HTTP ${res.status}`);
    const ac = audio();
    const buffer = await ac.decodeAudioData(await res.arrayBuffer());
    if (token !== speakToken || !soundOn) return;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.connect(ac.destination);
    source.onended = () => {
      if (current === source) current = null;
    };
    current = source;
    source.start();
  } catch (err) {
    console.warn(`[voice] ${npc} TTS skipped — ${describe(err)}`);
  }
}

export function micSupported(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function';
}

export interface Recording {
  /** Stops recording and returns a 24 kHz mono WAV. */
  stop(): Promise<Uint8Array<ArrayBuffer>>;
  cancel(): void;
  /** Current input loudness, 0..1. */
  level(): number;
}

/** Starts capturing the microphone. Rejects if permission is denied. Auto-stops after 12 s via `onLimit`. */
export async function startRecording(onLimit: () => void): Promise<Recording> {
  stopSpeaking();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const ac = audio();
  await ac.resume();
  const source = ac.createMediaStreamSource(stream);
  const processor = ac.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let level = 0;
  processor.onaudioprocess = (e) => {
    const data = new Float32Array(e.inputBuffer.getChannelData(0));
    chunks.push(data);
    let sum = 0;
    for (const v of data) sum += v * v;
    level = Math.min(1, Math.sqrt(sum / data.length) * 6);
  };
  source.connect(processor);
  processor.connect(ac.destination);
  const limit = setTimeout(onLimit, MAX_RECORD_MS);
  const release = (): void => {
    clearTimeout(limit);
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
  };
  return {
    async stop() {
      release();
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Float32Array(total);
      let at = 0;
      for (const c of chunks) {
        merged.set(c, at);
        at += c.length;
      }
      return floatToWav(resample(merged, ac.sampleRate, STT_RATE), STT_RATE);
    },
      cancel: release,
    level: () => level,
  };
}

/** Sends a recording to Gradium STT. Returns null on failure. */
export async function transcribe(wav: Uint8Array<ArrayBuffer>): Promise<string | null> {
  try {
    const res = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: wav,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`/api/stt → HTTP ${res.status}`);
    const data: unknown = await res.json();
    const text = typeof data === 'object' && data !== null && 'text' in data ? data.text : null;
    return typeof text === 'string' ? text : null;
  } catch (err) {
    console.warn(`[voice] STT failed — ${describe(err)}`);
    return null;
  }
}
