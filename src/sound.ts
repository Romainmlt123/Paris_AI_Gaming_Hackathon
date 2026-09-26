import { audioContext, isSoundOn } from './voice';

export type Track = 'title' | 'raft' | 'island' | 'interior' | 'tension' | 'fight' | 'death' | 'night' | 'gazette';
export type Sfx =
  | 'tap' | 'blip' | 'step' | 'good' | 'bad' | 'pop' | 'coin' | 'slap' | 'punch' | 'bonk'
  | 'splash' | 'bite' | 'catch' | 'door' | 'whoosh' | 'paper' | 'sparkle' | 'place';

const MUSIC_VOLUME = 0.32;
const FADE_MS = 900;
const ONE_SHOT: ReadonlySet<Track> = new Set(['death', 'gazette']);

const players = new Map<Track, HTMLAudioElement>();
let current: Track | null = null;
let duck = 1;
let unlocked = false;

function player(track: Track): HTMLAudioElement {
  let a = players.get(track);
  if (!a) {
    a = new Audio(`/audio/${track}.mp3`);
    a.loop = !ONE_SHOT.has(track);
    a.preload = 'auto';
    a.volume = 0;
    players.set(track, a);
  }
  return a;
}

function fade(a: HTMLAudioElement, to: number, then?: () => void): void {
  const from = a.volume;
  const start = performance.now();
  const step = (): void => {
    const k = Math.min(1, (performance.now() - start) / FADE_MS);
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else then?.();
  };
  requestAnimationFrame(step);
}

function target(): number {
  return MUSIC_VOLUME * duck;
}

function start(track: Track): void {
  if (!unlocked || !isSoundOn()) return;
  const a = player(track);
  if (a.paused) {
    if (ONE_SHOT.has(track) || a.ended) a.currentTime = 0;
    a.play().catch((err: unknown) => console.warn('[sound] music blocked', err));
  }
  fade(a, target());
}

/** Crossfades to `track`; replaying the current track is a no-op. */
export function music(track: Track): void {
  if (track === current) return;
  const prev = current;
  current = track;
  if (prev) {
    const a = player(prev);
    fade(a, 0, () => {
      if (current !== prev) a.pause();
    });
  }
  start(track);
}

export function currentMusic(): Track | null {
  return current;
}

/** Lowers the music while someone talks. */
export function duckMusic(on: boolean): void {
  duck = on ? 0.45 : 1;
  if (current && isSoundOn()) fade(player(current), target());
}

export function syncSound(): void {
  if (!current) return;
  if (isSoundOn()) start(current);
  else player(current).pause();
}

/** Browsers block audio until a gesture: start the pending music on the first tap or key. */
export function unlockMusicOnGesture(): void {
  const unlock = (): void => {
    unlocked = true;
    if (current) start(current);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

// ---------- Synthesized effects ----------

let bus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function out(ac: AudioContext): GainNode {
  if (!bus) {
    bus = ac.createGain();
    bus.gain.value = 0.55;
    bus.connect(ac.destination);
  }
  return bus;
}

function noise(ac: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

interface Tone {
  type?: OscillatorType;
  f: number;
  f2?: number;
  at?: number;
  dur: number;
  vol: number;
}

function tone(ac: AudioContext, t: Tone): void {
  const t0 = ac.currentTime + (t.at ?? 0);
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = t.type ?? 'square';
  o.frequency.setValueAtTime(t.f, t0);
  if (t.f2) o.frequency.exponentialRampToValueAtTime(t.f2, t0 + t.dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(t.vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + t.dur);
  o.connect(g).connect(out(ac));
  o.start(t0);
  o.stop(t0 + t.dur + 0.02);
}

interface Noise {
  at?: number;
  dur: number;
  vol: number;
  filter: BiquadFilterType;
  f: number;
  f2?: number;
  q?: number;
}

function hiss(ac: AudioContext, n: Noise): void {
  const t0 = ac.currentTime + (n.at ?? 0);
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const bq = ac.createBiquadFilter();
  bq.type = n.filter;
  bq.Q.value = n.q ?? 1;
  bq.frequency.setValueAtTime(n.f, t0);
  if (n.f2) bq.frequency.exponentialRampToValueAtTime(n.f2, t0 + n.dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(n.vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
  src.connect(bq).connect(g).connect(out(ac));
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + n.dur + 0.02);
}

const RECIPES: Record<Sfx, (ac: AudioContext, pitch: number) => void> = {
  tap: (ac) => tone(ac, { type: 'triangle', f: 660, f2: 880, dur: 0.06, vol: 0.18 }),
  blip: (ac, p) => tone(ac, { type: 'square', f: 420 * p * (0.94 + Math.random() * 0.12), dur: 0.035, vol: 0.05 }),
  step: (ac) => hiss(ac, { dur: 0.07, vol: 0.12, filter: 'bandpass', f: 500 + Math.random() * 300, q: 1.2 }),
  good: (ac) => [523, 659, 784].forEach((f, i) => tone(ac, { type: 'triangle', f, at: i * 0.07, dur: 0.16, vol: 0.16 })),
  bad: (ac) => [392, 311].forEach((f, i) => tone(ac, { type: 'sawtooth', f, f2: f * 0.94, at: i * 0.12, dur: 0.2, vol: 0.08 })),
  pop: (ac) => tone(ac, { type: 'sine', f: 520, f2: 980, dur: 0.09, vol: 0.2 }),
  coin: (ac) => {
    tone(ac, { type: 'square', f: 988, dur: 0.07, vol: 0.1 });
    tone(ac, { type: 'square', f: 1319, at: 0.07, dur: 0.22, vol: 0.1 });
  },
  slap: (ac) => {
    hiss(ac, { dur: 0.12, vol: 0.6, filter: 'highpass', f: 1800 });
    tone(ac, { type: 'sine', f: 240, f2: 120, dur: 0.08, vol: 0.3 });
  },
  punch: (ac) => {
    tone(ac, { type: 'sine', f: 160 + Math.random() * 60, f2: 45, dur: 0.18, vol: 0.55 });
    hiss(ac, { dur: 0.1, vol: 0.35, filter: 'lowpass', f: 1400, f2: 300 });
  },
  bonk: (ac) => {
    tone(ac, { type: 'square', f: 300, f2: 70, dur: 0.35, vol: 0.3 });
    tone(ac, { type: 'triangle', f: 1400, f2: 1300, at: 0.02, dur: 0.5, vol: 0.12 });
    hiss(ac, { dur: 0.15, vol: 0.4, filter: 'lowpass', f: 900 });
  },
  splash: (ac) => {
    hiss(ac, { dur: 0.45, vol: 0.4, filter: 'bandpass', f: 2500, f2: 500, q: 0.7 });
    tone(ac, { type: 'sine', f: 600, f2: 180, dur: 0.14, vol: 0.2 });
  },
  bite: (ac) => [880, 1175, 880, 1175].forEach((f, i) => tone(ac, { type: 'square', f, at: i * 0.06, dur: 0.06, vol: 0.1 })),
  catch: (ac) => [523, 659, 784, 1047].forEach((f, i) => tone(ac, { type: 'square', f, at: 0.15 + i * 0.08, dur: i === 3 ? 0.35 : 0.1, vol: 0.09 })),
  door: (ac) => {
    tone(ac, { type: 'triangle', f: 180, f2: 110, dur: 0.18, vol: 0.3 });
    tone(ac, { type: 'triangle', f: 1320, at: 0.1, dur: 0.4, vol: 0.08 });
    tone(ac, { type: 'triangle', f: 1760, at: 0.16, dur: 0.4, vol: 0.06 });
  },
  whoosh: (ac) => hiss(ac, { dur: 0.9, vol: 0.35, filter: 'bandpass', f: 300, f2: 3000, q: 2 }),
  paper: (ac) => {
    for (let i = 0; i < 4; i++) hiss(ac, { at: i * 0.07, dur: 0.08, vol: 0.18, filter: 'highpass', f: 2500 + Math.random() * 2000 });
  },
  sparkle: (ac) => [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(ac, { type: 'triangle', f, at: i * 0.06, dur: 0.3, vol: 0.1 })),
  place: (ac) => {
    tone(ac, { type: 'sine', f: 220, f2: 140, dur: 0.12, vol: 0.35 });
    tone(ac, { type: 'triangle', f: 1047, at: 0.08, dur: 0.2, vol: 0.1 });
  },
};

/** Plays a tiny synthesized effect; `pitch` scales tonal effects (used for NPC blips). */
export function sfx(name: Sfx, pitch = 1): void {
  if (!isSoundOn()) return;
  const ac = audioContext();
  if (ac.state !== 'running') return;
  RECIPES[name](ac, pitch);
}
