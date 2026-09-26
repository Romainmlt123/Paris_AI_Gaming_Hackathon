import { CHARACTERS } from './characters';
import { applyRelationDelta, bondKey, tierOf } from './relations';
import { factById, recordFact } from './rumors';
import { NPC_IDS } from './types';
import type { GameState, KnownRumor, NpcId, NpcState, RelationChange, TalkContext, TalkResult } from './types';

const MEMORY_LIMIT = 8;
const HISTORY_LIMIT = 10;

function freshNpc(relation: number): NpcState {
  return { relation, emotion: 'neutre', memories: [], intent: null, history: [] };
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
    outfit: 'nu',
    initiatives: {},
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
      };
    });
}

export function buildTalkContext(state: GameState, npc: NpcId): TalkContext {
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
  };
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
): { state: GameState; change: RelationChange | null } {
  let next = structuredClone(state);
  for (const event of result.events) {
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
  const reason = result.reason || `${CHARACTERS[npc].name} a apprécié l\u2019échange`;
  return applyRelationDelta(next, npc, result.relationDelta, reason);
}

export function npcsWithIntent(state: GameState): NpcId[] {
  return NPC_IDS.filter((id) => state.npcs[id].intent !== null);
}

/** Records the line an NPC opened with when it came to the player on its own. */
export function applyOpener(state: GameState, npc: NpcId, result: TalkResult): GameState {
  const next = structuredClone(state);
  const npcState = next.npcs[npc];
  npcState.emotion = result.emotion;
  npcState.history = [...npcState.history, { who: npc, text: result.reply }].slice(-HISTORY_LIMIT);
  return next;
}
