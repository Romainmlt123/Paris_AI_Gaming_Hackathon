import { CHARACTERS } from './characters';
import { applyRelationDelta, bondKey, tierOf } from './relations';
import { applyVerdict } from './contest';
import { factById, recordFact } from './rumors';
import { NPC_IDS } from './types';
import type { ContestVerdict, GameState, KnownRumor, NpcId, NpcState, Praise, RelationChange, TalkContext, TalkResult } from './types';

const MEMORY_LIMIT = 8;
const HISTORY_LIMIT = 10;

function freshNpc(relation: number): NpcState {
  return { relation, emotion: 'neutre', memories: [], intent: null, history: [] };
}

function freshPraise(): Praise {
  return { day: 0, count: 0 };
}

export function createInitialState(): GameState {
  return {
    version: 1,
    nextId: 1,
    day: 1,
    clock: 17 * 60 + 40,
    coins: 1200,
    islandValue: 0,
    inventory: [],
    pocket: { coquillage: 0, pomme: 0, perle: 0 },
    forage: [],
    forageDay: 0,
    perks: [],
    praise: { gaston: freshPraise(), josette: freshPraise(), marius: freshPraise() },
    decor: { placette: null, falaise: null, ponton: null, mairie: null, boulangerie: null },
    npcs: { gaston: freshNpc(0), josette: freshNpc(10), marius: freshNpc(5) },
    bonds: {
      [bondKey('josette', 'marius')]: 85,
      [bondKey('gaston', 'josette')]: 45,
      [bondKey('gaston', 'marius')]: 15,
    },
    facts: [],
    rumors: [],
    changes: [],
  };
}

export function knownRumorsOf(state: GameState, npc: NpcId): KnownRumor[] {
  return state.rumors
    .filter((r) => r.holder === npc)
    .map((r) => {
      const fact = factById(state, r.factId);
      return {
        text: r.text,
        source: r.source,
        aboutPlayer: fact?.actor === 'player',
        severity: fact?.severity ?? 0,
        distortion: r.distortion,
      };
    });
}

export function buildTalkContext(state: GameState, npc: NpcId, verdict: ContestVerdict | null = null): TalkContext {
  const npcState = state.npcs[npc];
  return {
    relation: npcState.relation,
    tier: tierOf(npcState.relation).label,
    emotion: npcState.emotion,
    memories: npcState.memories,
    knownRumors: knownRumorsOf(state, npc),
    history: npcState.history,
    intent: npcState.intent,
    day: state.day,
    islandValue: state.islandValue,
    verdict,
  };
}

/** Share of a positive gain kept for the 1st, 2nd, 3rd… gain from the same NPC on the same day. */
export const PRAISE_FACTORS: readonly number[] = [1, 1, 0.5, 0.25];

/** Diminishing returns: the same NPC can't be sweet-talked indefinitely in one day. */
export function dampenGain(state: GameState, npc: NpcId, delta: number): { state: GameState; delta: number; saturated: boolean } {
  if (delta <= 0) return { state, delta, saturated: false };
  const next = structuredClone(state);
  const praise = next.praise[npc].day === next.day ? next.praise[npc] : { day: next.day, count: 0 };
  const factor = PRAISE_FACTORS[praise.count] ?? 0;
  next.praise[npc] = { day: next.day, count: praise.count + 1 };
  const kept = Math.round(delta * factor);
  return { state: next, delta: kept, saturated: kept < delta };
}

function summarize(message: string, result: TalkResult): string {
  const firstEvent = result.events[0];
  if (firstEvent) return firstEvent.text;
  return `Le joueur a dit « ${message.trim().slice(0, 70)} »`;
}

/** Applies a validated talk result. The AI proposed it; this function decides what becomes true. */
export function applyTalkResult(
  state: GameState,
  npc: NpcId,
  message: string,
  result: TalkResult,
  verdict: ContestVerdict | null = null,
): { state: GameState; change: RelationChange | null; saturated: boolean } {
  let next = structuredClone(state);
  const events = verdict?.upheld ? result.events.filter((e) => e.severity >= 0) : result.events;
  for (const event of events) {
    next = recordFact(next, { actor: 'player', text: event.text, severity: event.severity, witnesses: [npc] }).state;
  }
  const npcState = next.npcs[npc];
  npcState.emotion = result.emotion;
  npcState.intent = result.intent;
  npcState.history = [
    ...npcState.history,
    { who: 'player' as const, text: message },
    { who: npc, text: result.reply },
  ].slice(-HISTORY_LIMIT);
  npcState.memories = [...npcState.memories, `Jour ${next.day} : ${summarize(message, result)}`].slice(-MEMORY_LIMIT);
  if (verdict) {
    const ruled = applyVerdict(next, npc, verdict);
    return { ...applyRelationDelta(ruled.state, npc, ruled.delta, ruled.reason), saturated: false };
  }
  const damped = dampenGain(next, npc, result.relationDelta);
  const reason = result.reason || `${CHARACTERS[npc].name} a apprécié l\u2019échange`;
  const tired = damped.saturated ? ' (ça commence à faire beaucoup)' : '';
  return { ...applyRelationDelta(damped.state, npc, damped.delta, reason + tired), saturated: damped.saturated };
}

export function npcsWithIntent(state: GameState): NpcId[] {
  return NPC_IDS.filter((id) => state.npcs[id].intent !== null);
}
