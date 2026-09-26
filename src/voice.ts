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
  /** Stops recording and resolves with what was said (null when transcription failed). */
  stop(): Promise<string | null>;
  cancel(): void;
}

const LIVE_URL = 'wss://api.gradium.ai/api/speech/asr';
const LIVE_END_TIMEOUT_MS = 4000;

function pcmBase64(samples: Float32Array): string {
  let bin = '';
  for (const v of samples) {
    const s = Math.round(Math.max(-1, Math.min(1, v)) * 0x7fff) & 0xffff;
    bin += String.fromCharCode(s & 0xff, s >> 8);
  }
  return btoa(bin);
}

function asLiveMessage(data: unknown): { type: string; text: string } | null {
  if (typeof data !== 'string') return null;
  try {
    const msg: unknown = JSON.parse(data);
    if (typeof msg !== 'object' || msg === null || !('type' in msg) || typeof msg.type !== 'string') return null;
    return { type: msg.type, text: 'text' in msg && typeof msg.text === 'string' ? msg.text : '' };
  } catch {
    return null;
  }
}

/** Streams microphone audio to Gradium STT over WebSocket, reporting the transcript as it grows. */
function openLive(onText: (text: string) => void, onState: (live: boolean) => void): { push(samples: Float32Array): void; finish(): Promise<string | null>; close(): void } {
  const words: string[] = [];
  const pending: string[] = [];
  let ws: WebSocket | null = null;
  let ready = false;
  let failed = false;
  let done: (() => void) | null = null;
  const ended = new Promise<void>((resolve) => (done = resolve));
  const fail = (): void => {
    if (!failed) onState(false);
    failed = true;
    done?.();
  };
  const text = (): string => words.join(' ').replace(/\s+/g, ' ').trim();
  fetch('/api/stt-token', { method: 'POST', signal: AbortSignal.timeout(STT_TIMEOUT_MS) })
    .then(async (res) => {
      if (!res.ok) throw new Error(`/api/stt-token → HTTP ${res.status}`);
      const data: unknown = await res.json();
      const token = typeof data === 'object' && data !== null && 'token' in data ? data.token : null;
      if (typeof token !== 'string') throw new Error('no token');
      if (failed) return;
      const url = new URL(LIVE_URL);
      url.searchParams.set('token', token);
      const socket = new WebSocket(url);
      ws = socket;
      socket.onopen = () => socket.send(JSON.stringify({ type: 'setup', input_format: `pcm_${STT_RATE}`, json_config: { language: 'fr' } }));
      socket.onmessage = (e) => {
        const msg = asLiveMessage(e.data);
        if (!msg) return;
        if (msg.type === 'ready') {
          ready = true;
          onState(true);
          for (const chunk of pending.splice(0)) socket.send(JSON.stringify({ type: 'audio', audio: chunk }));
        } else if (msg.type === 'text' && msg.text) {
          words.push(msg.text);
          onText(text());
        } else if (msg.type === 'end_of_stream') done?.();
        else if (msg.type === 'error') fail();
      };
      socket.onerror = fail;
      socket.onclose = () => done?.();
    })
    .catch((err: unknown) => {
      console.warn(`[voice] live STT unavailable — ${describe(err)}`);
      fail();
    });
  return {
    push(samples) {
      if (failed) return;
      const chunk = pcmBase64(samples);
      if (ready && ws) ws.send(JSON.stringify({ type: 'audio', audio: chunk }));
      else pending.push(chunk);
    },
    async finish() {
      if (failed || !ready || !ws) return failed ? null : ready ? text() : null;
      ws.send(JSON.stringify({ type: 'end_of_stream' }));
      await Promise.race([ended, new Promise((r) => setTimeout(r, LIVE_END_TIMEOUT_MS))]);
      ws.close();
      return failed ? null : text();
    },
    close() {
      failed = true;
      ws?.close();
    },
  };
}

/**
 * Starts capturing the microphone. Rejects if permission is denied. Auto-stops after 12 s via `onLimit`.
 * `onText` receives the live transcript as the player speaks.
 */
export async function startRecording(onLimit: () => void, onText: (text: string) => void, onState: (live: boolean) => void): Promise<Recording> {
  stopSpeaking();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const ac = audio();
  await ac.resume();
  const source = ac.createMediaStreamSource(stream);
  const processor = ac.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  const live = openLive(onText, onState);
  processor.onaudioprocess = (e) => {
    const data = new Float32Array(e.inputBuffer.getChannelData(0));
    chunks.push(data);
    live.push(resample(data, ac.sampleRate, STT_RATE));
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
      const heard = await live.finish();
      if (heard !== null) return heard;
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Float32Array(total);
      let at = 0;
      for (const c of chunks) {
        merged.set(c, at);
        at += c.length;
      }
      return transcribe(floatToWav(resample(merged, ac.sampleRate, STT_RATE), STT_RATE));
    },
    cancel() {
      release();
      live.close();
    },
  };
}

/** Sends a recording to Gradium STT. Returns null on failure. */
async function transcribe(wav: Uint8Array<ArrayBuffer>): Promise<string | null> {
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
