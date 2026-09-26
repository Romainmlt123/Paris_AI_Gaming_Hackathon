import { getItem, isItemId } from '../data/items';
import { NPCS } from '../data/npcs';
import {
  EMOTIONS, NPC_IDS, TALK_EVENT_KINDS,
  type AbsenceResponse, type DealProposal, type Emotion, type GameState, type Intent, type IntentKind,
  type NpcId, type RumorTransfer, type TalkEvent, type TalkEventKind, type TalkResponse,
} from '../state/types';
import { MAX_DISTORTION } from './rumors';

export const REPLY_MAX = 280;
export const SUGGESTION_MAX = 40;
export const TALK_DELTA_MAX = 15;
export const ABSENCE_RELATION_MAX = 20;
export const ABSENCE_BOND_MAX = 15;
export const RECAP_MAX_LINES = 6;

const INTENT_KINDS: readonly IntentKind[] = ['confront', 'gossip', 'thank', 'ask', 'offer', 'mock'];

type Obj = Record<string, unknown>;

// ---------- Primitives ----------
function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}
function text(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
function clampInt(v: unknown, max: number, min = -max): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function isNpc(v: unknown): v is NpcId {
  return oneOf(NPC_IDS, v);
}

/** Accepte un objet, ou une chaîne JSON (éventuellement entourée de ```json). */
function parseRaw(raw: unknown): Obj | null {
  if (isObj(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed: unknown = JSON.parse(stripped);
    return isObj(parsed) ? parsed : null;
  } catch (err) {
    console.warn('[validate] JSON IA illisible, repli :', err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------- Morceaux ----------
export function validateIntent(v: unknown): Intent | null {
  if (!isObj(v) || !oneOf(INTENT_KINDS, v.kind)) return null;
  const t = text(v.text, 200);
  if (t === '') return null;
  const about = typeof v.about === 'string' && v.about.trim() !== '' ? v.about.trim() : null;
  return { kind: v.kind, text: t, about };
}

function validateEvent(v: unknown): TalkEvent | null {
  if (!isObj(v) || !oneOf<TalkEventKind>(TALK_EVENT_KINDS, v.kind)) return null;
  const t = text(v.text, 200);
  return t === '' ? null : { kind: v.kind, text: t };
}

/** Deal borné : objet connu, qty 1..10, prix total entier dans [0.5×, 2×] de la référence. Sinon null. */
export function validateDeal(v: unknown): DealProposal | null {
  if (!isObj(v) || !isItemId(v.itemId) || (v.direction !== 'buy' && v.direction !== 'sell')) return null;
  if (typeof v.qty !== 'number' || !Number.isInteger(v.qty) || v.qty < 1 || v.qty > 10) return null;
  if (typeof v.price !== 'number' || !Number.isFinite(v.price)) return null;
  const item = getItem(v.itemId);
  const ref = (v.direction === 'buy' ? item.price : item.sellPrice) * v.qty;
  if (ref <= 0) return null;
  const price = Math.round(v.price);
  if (price < Math.ceil(ref * 0.5) || price > Math.floor(ref * 2)) return null;
  return { itemId: v.itemId, direction: v.direction, qty: v.qty, price };
}

// ---------- Conversation ----------
export function fallbackTalkResponse(npc: NpcId, seed = 0): TalkResponse {
  const lines = NPCS[npc].fallbackReplies;
  const reply = lines[Math.abs(Math.floor(seed)) % lines.length] ?? '…';
  return { reply, emotion: 'neutre', events: [], relationDelta: 0, reason: '', intent: null, suggestions: [], deal: null, fallback: true };
}

export interface TalkValidationContext {
  npc: NpcId;
  /** Varie la réplique de secours (ex. longueur de l'historique). */
  seed?: number;
}

export function validateTalkResponse(raw: unknown, ctx: TalkValidationContext): TalkResponse {
  const o = parseRaw(raw);
  const fallback = fallbackTalkResponse(ctx.npc, ctx.seed);
  if (!o) return fallback;
  const reply = text(o.reply, REPLY_MAX);
  if (reply === '') return fallback;

  const emotion: Emotion = oneOf(EMOTIONS, o.emotion) ? o.emotion : 'neutre';
  const events = arr(o.events).map(validateEvent).filter((e): e is TalkEvent => e !== null).slice(0, 3);
  const suggestions = arr(o.suggestions)
    .map((s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''))
    .filter((s) => s !== '' && s.length <= SUGGESTION_MAX)
    .slice(0, 3);
  const relationDelta = clampInt(o.relationDelta, TALK_DELTA_MAX);
  return {
    reply,
    emotion,
    events,
    relationDelta,
    reason: text(o.reason, 120),
    intent: validateIntent(o.intent),
    suggestions,
    deal: validateDeal(o.deal),
  };
}

// ---------- Absence ----------
function validateTransfer(v: unknown, state: GameState): RumorTransfer | null {
  if (!isObj(v) || !isNpc(v.from) || !isNpc(v.to) || v.from === v.to) return null;
  const sourceId = typeof v.sourceId === 'string' ? v.sourceId : '';
  const exists = state.facts.some((f) => f.id === sourceId) || state.rumors.some((r) => r.id === sourceId);
  const t = text(v.text, REPLY_MAX);
  if (!exists || t === '') return null;
  return { from: v.from, to: v.to, sourceId, text: t, distortion: clampInt(v.distortion, MAX_DISTORTION, 0) };
}

function pairOf(v: Obj): { a: NpcId; b: NpcId } | null {
  return isNpc(v.a) && isNpc(v.b) && v.a !== v.b ? { a: v.a, b: v.b } : null;
}

/** null si la réponse est inexploitable (non objet) : l'appelant utilise simulateAbsenceFallback. */
export function validateAbsenceResponse(raw: unknown, state: GameState): AbsenceResponse | null {
  const o = parseRaw(raw);
  if (!o) return null;
  const conversations = arr(o.conversations).flatMap((v) => {
    const p = isObj(v) ? pairOf(v) : null;
    const summary = isObj(v) ? text(v.summary, 200) : '';
    return p && summary !== '' ? [{ ...p, summary }] : [];
  });
  const transfers = arr(o.transfers).map((v) => validateTransfer(v, state)).filter((t): t is RumorTransfer => t !== null);
  const bondDeltas = arr(o.bondDeltas).flatMap((v) => {
    const p = isObj(v) ? pairOf(v) : null;
    return p && isObj(v) ? [{ ...p, delta: clampInt(v.delta, ABSENCE_BOND_MAX) }] : [];
  });
  const relationDeltas = arr(o.relationDeltas).flatMap((v) =>
    isObj(v) && isNpc(v.npc) ? [{ npc: v.npc, delta: clampInt(v.delta, ABSENCE_RELATION_MAX), reason: text(v.reason, 120) }] : [],
  );
  const intents = arr(o.intents).flatMap((v) => {
    const intent = isObj(v) ? validateIntent(v.intent) : null;
    return intent && isObj(v) && isNpc(v.npc) ? [{ npc: v.npc, intent }] : [];
  });
  const recap = arr(o.recap).map((l) => text(l, 200)).filter((l) => l !== '').slice(0, RECAP_MAX_LINES);
  return { conversations, transfers, bondDeltas, relationDeltas, intents, recap };
}
