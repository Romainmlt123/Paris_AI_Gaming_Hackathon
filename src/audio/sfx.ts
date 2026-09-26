// Bruitages 100 % procéduraux (WebAudio, aucun fichier). Doux et cozy. Tout est no-op si muet ou sans WebAudio.
// Chaque son crée ses nodes, les programme puis les déconnecte à la fin (onended) : rien ne fuit.
import type { NpcId } from '../state/types';

const MUTE_KEY = 'ragots.muted';
/** Le son est un bonus activable : muet tant que le joueur ne l'a pas activé. */
// Son actif par défaut (il ne démarre qu'au premier geste) ; bouton 🔊 pour couper.
const DEFAULT_MUTED = false;
const MASTER_VOLUME = 0.7;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    const v = localStorage.getItem(MUTE_KEY);
    return v === null ? DEFAULT_MUTED : v === '1';
  } catch (err) {
    console.warn('[audio] localStorage illisible, état muet par défaut :', err);
    return DEFAULT_MUTED;
  }
}

function writeMuted(value: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch (err) {
    console.warn('[audio] impossible de mémoriser l\'état muet :', err);
  }
}

type AudioCtor = typeof AudioContext;
function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * À appeler sur un geste utilisateur (pointerdown/touchend/keydown) : crée l'AudioContext au besoin et le réveille
 * s'il est suspendu (politique autoplay, iOS). Idempotent et peu coûteux : on peut l'appeler à chaque tap.
 */
export function initAudio(): void {
  const Ctor = audioCtor();
  if (!Ctor) return;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch (err) {
      console.warn('[audio] WebAudio indisponible :', err);
      return;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(ctx.destination);
    document.addEventListener('visibilitychange', onVisibility);
    unlockIos(ctx);
  }
  if (ctx.state === 'suspended' && !document.hidden) {
    ctx
      .resume()
      .then(resumeAmbience)
      .catch((err: unknown) => console.warn('[audio] resume refusé :', err));
  } else {
    resumeAmbience();
  }
}

/** startAmbience() a pu être appelé avant que le contexte soit réveillé : on rattrape ici. */
function resumeAmbience(): void {
  if (ambienceWanted) startAmbienceNodes();
}

/** iOS ne « déverrouille » la sortie qu'après une lecture initiée dans le geste : un buffer muet suffit. */
function unlockIos(c: AudioContext): void {
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, 22050);
  src.connect(c.destination);
  src.onended = () => src.disconnect();
  src.start(0);
}

/** Onglet caché : on suspend le contexte (batterie), et on le réveille au retour. */
function onVisibility(): void {
  if (!ctx) return;
  if (document.hidden) {
    ctx.suspend().catch((err: unknown) => console.warn('[audio] suspend refusé :', err));
  } else {
    ctx.resume().catch((err: unknown) => console.warn('[audio] resume refusé :', err));
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  writeMuted(value);
  if (ctx && master) master.gain.setTargetAtTime(value ? 0 : MASTER_VOLUME, ctx.currentTime, 0.05);
  // L'ambiance coûte du CPU en continu : on la coupe vraiment quand on est muet, et on la relance au retour.
  if (value) stopAmbienceNodes();
  else if (ambienceWanted) startAmbienceNodes();
}

/** Sortie audio utilisable maintenant, ou null (muet, pas de WebAudio, contexte pas encore réveillé). */
export function audioOut(): { c: AudioContext; dest: AudioNode } | null {
  if (muted || !ctx || !master || ctx.state !== 'running') return null;
  return { c: ctx, dest: master };
}

// ---------------------------------------------------------------- primitives

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  attack?: number;
  /** Glissando vers cette fréquence sur la durée de la note. */
  toFreq?: number;
  /** Harmonique de cloche (ratio) ajoutée à faible volume. */
  bell?: number;
}

function tone(freq: number, at: number, dur: number, opts: ToneOpts = {}): void {
  const out = audioOut();
  if (!out) return;
  const { c, dest } = out;
  const t = c.currentTime + at;
  const vol = opts.vol ?? 0.15;
  const attack = opts.attack ?? 0.008;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  const oscs: OscillatorNode[] = [];
  const addOsc = (f: number, level: number, toF?: number): void => {
    const o = c.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(f, t);
    if (toF) o.frequency.exponentialRampToValueAtTime(toF, t + dur);
    if (level === 1) {
      o.connect(g);
    } else {
      const lg = c.createGain();
      lg.gain.value = level;
      o.connect(lg).connect(g);
      o.addEventListener('ended', () => lg.disconnect());
    }
    o.start(t);
    o.stop(t + dur + 0.02);
    oscs.push(o);
  };
  addOsc(freq, 1, opts.toFreq);
  if (opts.bell) addOsc(freq * opts.bell, 0.25, opts.toFreq ? opts.toFreq * opts.bell : undefined);
  const first = oscs[0];
  if (first) {
    first.onended = () => {
      for (const o of oscs) o.disconnect();
      g.disconnect();
    };
  }
}

function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

interface NoiseOpts {
  filter?: BiquadFilterType;
  freq?: number;
  toFreq?: number;
  q?: number;
  vol?: number;
  attack?: number;
}

function noise(at: number, dur: number, opts: NoiseOpts = {}): void {
  const out = audioOut();
  if (!out) return;
  const { c, dest } = out;
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  const f = c.createBiquadFilter();
  f.type = opts.filter ?? 'lowpass';
  f.frequency.setValueAtTime(opts.freq ?? 1500, t);
  if (opts.toFreq) f.frequency.exponentialRampToValueAtTime(opts.toFreq, t + dur);
  f.Q.value = opts.q ?? 0.7;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.1, t + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    g.disconnect();
  };
  // Départ aléatoire dans le buffer : deux bruits successifs ne sonnent pas identiques.
  src.start(t, Math.random() * 1.5, dur + 0.05);
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

// ---------------------------------------------------------------- bruitages

interface BlipVoice {
  freq: number;
  dur: number;
  /** Intervalle minimal entre deux blips (ms) : le typewriter peut appeler blip() à chaque lettre. */
  minGapMs: number;
  type: OscillatorType;
}

export const BLIP_VOICES: Record<NpcId, BlipVoice> = {
  gaston: { freq: 196, dur: 0.045, minGapMs: 55, type: 'triangle' },
  josette: { freq: 660, dur: 0.035, minGapMs: 45, type: 'triangle' },
  marius: { freq: 123, dur: 0.075, minGapMs: 110, type: 'sine' },
};
const DEFAULT_BLIP: BlipVoice = { freq: 330, dur: 0.04, minGapMs: 50, type: 'triangle' };
let lastBlip = 0;

/** Petit bip de texte qui s'écrit. `pitch` = id d'habitant (voix dédiée) ou fréquence en Hz. Auto-limité en cadence. */
export function blip(pitch: NpcId | number): void {
  const v = typeof pitch === 'number' ? { ...DEFAULT_BLIP, freq: pitch } : BLIP_VOICES[pitch];
  const now = performance.now();
  if (now - lastBlip < v.minGapMs) return;
  lastBlip = now;
  tone(v.freq * rand(0.96, 1.05), 0, v.dur, { type: v.type, vol: 0.06, attack: 0.004 });
}

export function pickup(): void {
  tone(1319, 0, 0.12, { vol: 0.12, bell: 2 });
  tone(1760, 0.07, 0.22, { vol: 0.12, bell: 2 });
}

export function coins(up: boolean): void {
  const notes = up ? [1568, 2093, 2637] : [1568, 1175];
  notes.forEach((f, i) => tone(f, i * 0.06, 0.25, { type: 'triangle', vol: 0.07, bell: 2.76 }));
}

export function splash(): void {
  noise(0, 0.55, { freq: 2500, toFreq: 300, vol: 0.14, attack: 0.02 });
  for (let i = 0; i < 4; i++) tone(rand(1200, 2200), 0.12 + i * rand(0.05, 0.09), 0.06, { vol: 0.04, toFreq: rand(2400, 3200) });
}

/** Moulinet : cliquetis réguliers qui accélèrent un peu. */
export function reel(): void {
  let t = 0;
  for (let i = 0; i < 12; i++) {
    noise(t, 0.025, { filter: 'bandpass', freq: 3200, q: 4, vol: 0.08, attack: 0.002 });
    t += 0.055 - i * 0.002;
  }
}

/** Plouf du bouchon qui plonge. */
export function bite(): void {
  tone(520, 0, 0.16, { vol: 0.14, toFreq: 140 });
  noise(0.02, 0.2, { freq: 900, toFreq: 250, vol: 0.06 });
}

/** Essaim d'abeilles (~1 s), bourdonnement doux et vibrant. */
export function buzz(): void {
  const out = audioOut();
  if (!out) return;
  const { c, dest } = out;
  const t = c.currentTime;
  const dur = 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.15);
  g.gain.setValueAtTime(0.05, t + dur - 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.connect(g).connect(dest);
  const lfo = c.createOscillator();
  lfo.frequency.value = 9;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 12;
  lfo.connect(lfoGain);
  const oscs = [196, 201, 247].map((f) => {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    lfoGain.connect(o.frequency);
    o.connect(lp);
    return o;
  });
  for (const node of [lfo, ...oscs]) {
    node.start(t);
    node.stop(t + dur + 0.05);
  }
  lfo.onended = () => {
    for (const node of [lfo, lfoGain, ...oscs, lp, g]) node.disconnect();
  };
}

/** Feuillage secoué : quelques froissements aigus. */
export function shake(): void {
  for (let i = 0; i < 4; i++) {
    noise(i * 0.11 + rand(0, 0.03), 0.16, { filter: 'bandpass', freq: rand(2500, 4200), q: 1.2, vol: 0.08, attack: 0.03 });
  }
}

export function gaugeUp(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.3, { type: 'triangle', vol: 0.09, bell: 2 }));
}

/** Descente triste, un peu traînante. */
export function gaugeDown(): void {
  [392, 330, 262].forEach((f, i) => tone(f, i * 0.2, 0.38, { type: 'triangle', vol: 0.09, toFreq: f * 0.97, attack: 0.02 }));
}

/** Pose de déco : petit arpège + scintillement. */
export function place(): void {
  [659, 784, 988, 1319].forEach((f, i) => tone(f, i * 0.06, 0.25, { vol: 0.08, bell: 3 }));
  tone(2637, 0.28, 0.4, { vol: 0.03, bell: 1.5 });
}

/** Carillon doux de la tombée de la nuit. */
export function night(): void {
  [784, 659, 523, 392].forEach((f, i) => tone(f, i * 0.38, 1.6, { vol: 0.07, bell: 2.76, attack: 0.01 }));
}

export function uiTap(): void {
  tone(900, 0, 0.05, { vol: 0.05, toFreq: 700, attack: 0.003 });
}

// ---------------------------------------------------------------- ambiance

let ambienceWanted = false;
let ambienceNodes: AudioNode[] = [];
let ambienceSources: AudioScheduledSourceNode[] = [];
let gullTimer: ReturnType<typeof setTimeout> | null = null;

/** Vagues (bruit filtré modulé lentement) + mouettes lointaines occasionnelles. Volume bas. Idempotent. */
export function startAmbience(): void {
  ambienceWanted = true;
  startAmbienceNodes();
}

export function stopAmbience(): void {
  ambienceWanted = false;
  stopAmbienceNodes();
}

function startAmbienceNodes(): void {
  if (ambienceSources.length > 0) return;
  const out = audioOut();
  if (!out) return;
  const { c, dest } = out;
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const g = c.createGain();
  g.gain.value = 0.035;
  // Ressac : une LFO très lente module le volume (± 0.025) et une autre la brillance.
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.11;
  const lfoAmp = c.createGain();
  lfoAmp.gain.value = 0.025;
  lfo.connect(lfoAmp).connect(g.gain);
  const lfo2 = c.createOscillator();
  lfo2.frequency.value = 0.07;
  const lfo2Amp = c.createGain();
  lfo2Amp.gain.value = 180;
  lfo2.connect(lfo2Amp).connect(lp.frequency);
  src.connect(lp).connect(g).connect(dest);
  src.start();
  lfo.start();
  lfo2.start();
  ambienceSources = [src, lfo, lfo2];
  ambienceNodes = [lp, g, lfoAmp, lfo2Amp];
  scheduleGull();
}

function stopAmbienceNodes(): void {
  if (gullTimer) clearTimeout(gullTimer);
  gullTimer = null;
  for (const s of ambienceSources) {
    try {
      s.stop();
    } catch (err) {
      // stop() lève si la source n'a jamais démarré : sans conséquence ici, on déconnecte quand même.
      console.debug('[audio] source d\'ambiance déjà arrêtée :', err);
    }
    s.disconnect();
  }
  for (const n of ambienceNodes) n.disconnect();
  ambienceSources = [];
  ambienceNodes = [];
}

function scheduleGull(): void {
  gullTimer = setTimeout(() => {
    gull();
    scheduleGull();
  }, rand(9000, 22000));
}

/** Mouette lointaine : deux cris glissés, filtrés et très bas. */
function gull(): void {
  const calls = Math.random() < 0.5 ? 2 : 3;
  for (let i = 0; i < calls; i++) {
    const at = i * rand(0.22, 0.3);
    const f = rand(1300, 1600);
    tone(f, at, 0.2, { type: 'triangle', vol: 0.012, toFreq: f * 0.72, attack: 0.03 });
  }
}
