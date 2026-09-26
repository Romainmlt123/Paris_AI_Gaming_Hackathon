import type { NpcId } from '../state/types.ts';
import { NPCS } from '../data/npcs.ts';
import { tts } from './api.ts';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export const settings = {
  sound: localStorage.getItem('ragots-sound') !== 'off',
  voice: localStorage.getItem('ragots-voice') !== 'off',
};
export function saveSettings(): void {
  localStorage.setItem('ragots-sound', settings.sound ? 'on' : 'off');
  localStorage.setItem('ragots-voice', settings.voice ? 'on' : 'off');
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.05, when = 0): void {
  const a = ac();
  if (!a || !settings.sound) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + when;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function blip(npc: NpcId | 'player'): void {
  const base = npc === 'player' ? 520 : NPCS[npc].blipPitch;
  tone(base * (0.9 + Math.random() * 0.25), 0.05, 'square', 0.025);
}
export const sfx = {
  tap: (): void => tone(880, 0.05, 'sine', 0.05),
  coin: (): void => { tone(988, 0.08, 'square', 0.04); tone(1319, 0.2, 'square', 0.04, 0.08); },
  bad: (): void => { tone(220, 0.25, 'sawtooth', 0.05); tone(165, 0.35, 'sawtooth', 0.05, 0.15); },
  good: (): void => { tone(660, 0.1, 'sine', 0.06); tone(880, 0.1, 'sine', 0.06, 0.1); tone(1100, 0.2, 'sine', 0.06, 0.2); },
  splash: (): void => tone(140, 0.25, 'triangle', 0.08),
  bite: (): void => { tone(1200, 0.06, 'square', 0.06); tone(1200, 0.06, 'square', 0.06, 0.1); },
  sting: (): void => { for (let k = 0; k < 6; k++) tone(300 + k * 40, 0.08, 'sawtooth', 0.03, k * 0.06); },
  pop: (): void => tone(600, 0.08, 'triangle', 0.07),
};

let current: HTMLAudioElement | null = null;
/** Voix Gradium ; retourne false si indisponible (le jeu reste jouable sans). */
export async function speak(npc: NpcId, text: string): Promise<boolean> {
  if (!settings.voice || !settings.sound) return false;
  const blob = await tts(npc, text);
  if (!blob) return false;
  current?.pause();
  current = new Audio(URL.createObjectURL(blob));
  try {
    await current.play();
    return true;
  } catch {
    return false;
  }
}
export function stopVoice(): void {
  current?.pause();
  current = null;
}

/** Micro → WAV 16 bits mono (format accepté par Gradium STT). */
export async function recordWav(maxMs: number, stopSignal: Promise<void>): Promise<Blob | null> {
  const a = ac();
  if (!a || !navigator.mediaDevices?.getUserMedia) return null;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return null;
  }
  const src = a.createMediaStreamSource(stream);
  const proc = a.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(proc);
  proc.connect(a.destination);
  await Promise.race([stopSignal, new Promise((r) => setTimeout(r, maxMs))]);
  proc.disconnect();
  src.disconnect();
  stream.getTracks().forEach((t) => t.stop());
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const rate = a.sampleRate;
  const buf = new ArrayBuffer(44 + len * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, len * 2, true);
  let o = 44;
  for (const c of chunks) for (let i = 0; i < c.length; i++) { v.setInt16(o, Math.max(-1, Math.min(1, c[i] ?? 0)) * 0x7fff, true); o += 2; }
  return new Blob([buf], { type: 'audio/wav' });
}
