import type { Emotion, NpcId } from './types.js';

export interface VoiceProfile {
  /** Gradium voice created with Voice Design (prompts in NOTES.md). */
  voiceId: string;
  accent: string;
  /** Gradium `padding_bonus`: negative = faster, positive = slower. */
  pace: number;
  /** Gradium `temp`: higher = more expressive / less stable. */
  temp: number;
}

export const VOICES: Record<NpcId, VoiceProfile> = {
  gaston: { voiceId: 'N2nkV9rUGFUXumgM', accent: 'fast-talking market-stall hustler, theatrical salesman', pace: -0.6, temp: 0.95 },
  josette: { voiceId: 'GgfEkEJtxZR7gnpy', accent: 'warm, bubbly village gossip', pace: -1.0, temp: 0.9 },
  marius: { voiceId: 's_k3kLBbgeK9-xUg', accent: 'slow, low drawl of an old sea dog', pace: 1.2, temp: 0.6 },
};

const EMOTION_PACE: Record<Emotion, number> = {
  joie: -0.3,
  neutre: 0,
  colere: -0.8,
  tristesse: 0.8,
  surprise: -0.4,
  mefiance: 0.3,
  amuse: -0.2,
};

const EMOTION_TEMP: Record<Emotion, number> = {
  joie: 0.1,
  neutre: 0,
  colere: 0.15,
  tristesse: -0.1,
  surprise: 0.1,
  mefiance: -0.05,
  amuse: 0.1,
};

export interface VoiceSettings {
  padding_bonus: number;
  temp: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Per-NPC delivery, nudged by the current emotion, kept inside Gradium's tested ranges. */
export function voiceSettings(npc: NpcId, emotion: Emotion): VoiceSettings {
  const v = VOICES[npc];
  return {
    padding_bonus: round2(clamp(v.pace + EMOTION_PACE[emotion], -4, 4)),
    temp: round2(clamp(v.temp + EMOTION_TEMP[emotion], 0.2, 1.3)),
  };
}

export const TTS_MAX_CHARS = 400;

/** Cleans a dialogue line for speech: no emojis/markup, ellipses become real pauses. */
export function speakableText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[*_~`#]/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .slice(0, TTS_MAX_CHARS)
    .replace(/\s*(?:…|\.{3,})\s*/g, ' <break time="0.5s" /> ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:\s*<break time="0\.5s" \/>)+/, '')
    .trim();
}
