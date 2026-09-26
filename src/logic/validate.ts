import { ITEMS } from '../data/items.ts';
import { pickFallback, type FallbackSituation } from '../data/fallbacks.ts';
import { NPCS } from '../data/npcs.ts';
import type { ClaimCheck, DealProposal, Emotion, Intent, IntentKind, NpcContext, NpcId, TalkEvent, TalkEventKind, TalkResponse } from '../state/types.ts';
import { EMOTIONS, NPC_IDS, TALK_EVENT_KINDS } from '../state/types.ts';
import { clamp, MAX_TALK_DELTA } from './relations.ts';

const INTENT_KINDS: IntentKind[] = ['confront', 'gossip', 'thank', 'ask', 'offer', 'mock', 'react'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseEvents(v: unknown): TalkEvent[] {
  if (!Array.isArray(v)) return [];
  const out: TalkEvent[] = [];
  for (const e of v.slice(0, 3)) {
    if (!isRecord(e)) continue;
    const kind = e.kind;
    const text = str(e.text, 160);
    if (typeof kind !== 'string' || !(TALK_EVENT_KINDS as readonly string[]).includes(kind) || !text) continue;
    const target = typeof e.target === 'string' && ((NPC_IDS as readonly string[]).includes(e.target) || e.target === 'player') ? (e.target as NpcId | 'player') : null;
    out.push({ kind: kind as TalkEventKind, text, target });
  }
  return out;
}

function parseIntent(v: unknown): Intent | null {
  if (!isRecord(v)) return null;
  const kind = v.kind;
  const text = str(v.text, 140);
  if (typeof kind !== 'string' || !INTENT_KINDS.includes(kind as IntentKind) || !text) return null;
  return { kind: kind as IntentKind, text, about: null };
}

function parseDeal(v: unknown): DealProposal | null {
  if (!isRecord(v)) return null;
  const itemId = typeof v.itemId === 'string' && ITEMS[v.itemId] ? v.itemId : null;
  const direction = v.direction === 'buy' || v.direction === 'sell' ? v.direction : null;
  const qty = num(v.qty);
  const price = num(v.price);
  if (!itemId || !direction || qty === null || price === null) return null;
  return { itemId, direction, qty: clamp(Math.round(qty), 1, 99), price: Math.max(0, Math.round(price)) };
}

function parseDenials(v: unknown, ctx: NpcContext): ClaimCheck[] {
  if (!Array.isArray(v)) return [];
  const known = new Set<string>([...ctx.knownFacts.map((f) => f.id), ...ctx.heardRumors.flatMap((r) => (r.factId ? [r.factId] : []))]);
  return v.flatMap((d): ClaimCheck[] => (typeof d === 'string' && known.has(d) ? [{ deniesFactId: d }] : isRecord(d) && typeof d.deniesFactId === 'string' && known.has(d.deniesFactId) ? [{ deniesFactId: d.deniesFactId }] : []));
}

/** Réplique de secours crédible, choisie selon la situation. */
export function fallbackResponse(npc: NpcId, ctx: NpcContext, playerText: string): TalkResponse {
  const situation: FallbackSituation = ctx.denial
    ? 'lie'
    : playerText === ''
      ? ctx.intent?.kind === 'confront' ? 'confront' : 'opener'
      : ctx.offeredItem
        ? 'gift'
        : ctx.deal
          ? 'deal'
          : 'generic';
  const line = pickFallback(npc, situation, playerText.length + ctx.day);
  return {
    reply: line.text,
    emotion: line.emotion,
    events: [],
    relationDelta: 0,
    reason: '',
    intent: null,
    suggestions: NPCS[npc].suggestions,
    deal: null,
    denials: [],
    acceptGift: situation === 'gift' && !ctx.offeredItem?.tags.includes('rotten'),
    fallback: true,
  };
}

/** L'IA propose, le code valide : tout champ invalide est remplacé, toute valeur est bornée. */
export function validateTalkResponse(raw: unknown, npc: NpcId, ctx: NpcContext, playerText: string): TalkResponse {
  if (!isRecord(raw)) return fallbackResponse(npc, ctx, playerText);
  const reply = str(raw.reply, 420);
  if (!reply) return fallbackResponse(npc, ctx, playerText);
  const emotion: Emotion = typeof raw.emotion === 'string' && (EMOTIONS as readonly string[]).includes(raw.emotion) ? (raw.emotion as Emotion) : 'neutre';
  const delta = num(raw.relationDelta) ?? 0;
  const suggestions = Array.isArray(raw.suggestions)
    ? raw.suggestions.flatMap((s) => {
        const t = str(s, 70);
        return t ? [t] : [];
      }).slice(0, 3)
    : [];
  return {
    reply,
    emotion,
    events: parseEvents(raw.events),
    relationDelta: clamp(Math.round(delta), -MAX_TALK_DELTA, MAX_TALK_DELTA),
    reason: str(raw.reason, 90) ?? '',
    intent: parseIntent(raw.intent),
    suggestions: suggestions.length > 0 ? suggestions : NPCS[npc].suggestions,
    deal: parseDeal(raw.deal),
    denials: parseDenials(raw.denials, ctx),
    acceptGift: raw.acceptGift === true,
  };
}
