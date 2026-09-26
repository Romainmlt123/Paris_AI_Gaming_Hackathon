import { NPC_IDS, EMOTIONS } from './types.js';
import type { Emotion, NpcId, SimResult, TalkEvent, TalkResult } from './types.js';
import { clamp } from './relations.js';

export const TALK_DELTA_MIN = -20;
export const TALK_DELTA_MAX = 10;
export const BOND_DELTA_LIMIT = 15;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asEmotion(value: unknown): Emotion {
  return EMOTIONS.find((e) => e === value) ?? 'neutre';
}

export function asNpcId(value: unknown): NpcId | null {
  return NPC_IDS.find((id) => id === value) ?? null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseEvent(value: unknown): TalkEvent | null {
  if (!isRecord(value)) return null;
  const text = str(value.text, 160);
  const severity = num(value.severity);
  if (!text || severity === null) return null;
  return { text, severity: clamp(Math.round(severity), -3, 3) };
}

/** Turns raw AI output into a bounded TalkResult, or null if unusable. */
export function parseTalkResult(raw: unknown): TalkResult | null {
  if (!isRecord(raw)) return null;
  const reply = str(raw.reply, 320);
  if (!reply) return null;
  const delta = num(raw.relationDelta) ?? 0;
  return {
    reply,
    emotion: asEmotion(raw.emotion),
    relationDelta: clamp(Math.round(delta), TALK_DELTA_MIN, TALK_DELTA_MAX),
    reason: str(raw.reason, 120) ?? '',
    events: list(raw.events)
      .map(parseEvent)
      .filter((e): e is TalkEvent => e !== null)
      .slice(0, 2),
    intent: str(raw.intent, 140),
    suggestions: list(raw.suggestions)
      .map((s) => str(s, 48))
      .filter((s): s is string => s !== null)
      .slice(0, 3),
    source: 'ai',
  };
}

function parsePair(value: Record<string, unknown>): { a: NpcId; b: NpcId } | null {
  const a = asNpcId(value.a);
  const b = asNpcId(value.b);
  return a && b && a !== b ? { a, b } : null;
}

/** Shape-checks an AI absence simulation. Game-rule legality is enforced in applySimResult. */
export function parseSimResult(raw: unknown): SimResult | null {
  if (!isRecord(raw)) return null;
  const result: SimResult = { conversations: [], transfers: [], intents: [], bondChanges: [], source: 'ai' };
  for (const item of list(raw.conversations).slice(0, 6)) {
    if (!isRecord(item)) continue;
    const pair = parsePair(item);
    const summary = str(item.summary, 220);
    if (pair && summary) result.conversations.push({ ...pair, summary });
  }
  for (const item of list(raw.transfers).slice(0, 8)) {
    if (!isRecord(item)) continue;
    const from = asNpcId(item.from);
    const to = asNpcId(item.to);
    const factId = str(item.factId, 20);
    const text = str(item.text, 220);
    if (from && to && factId && text && from !== to) result.transfers.push({ from, to, factId, text });
  }
  for (const item of list(raw.intents).slice(0, 3)) {
    if (!isRecord(item)) continue;
    const npc = asNpcId(item.npc);
    const text = str(item.text, 140);
    if (npc && text) result.intents.push({ npc, text });
  }
  result.thoughts = [];
  for (const item of list(raw.thoughts).slice(0, 3)) {
    if (!isRecord(item)) continue;
    const npc = asNpcId(item.npc);
    const text = str(item.text, 160);
    if (npc && text) result.thoughts.push({ npc, text });
  }
  for (const item of list(raw.bondChanges).slice(0, 3)) {
    if (!isRecord(item)) continue;
    const pair = parsePair(item);
    const delta = num(item.delta);
    if (pair && delta !== null) {
      result.bondChanges.push({ ...pair, delta: clamp(Math.round(delta), -BOND_DELTA_LIMIT, BOND_DELTA_LIMIT) });
    }
  }
  return result.conversations.length || result.transfers.length ? result : null;
}
