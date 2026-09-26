import { CHARACTERS } from './characters';
import { applyRelationDelta, bondKey, bondOf, clamp, tierOf } from './relations';
import { distortRumor, factById, rumorOf, transferRumor } from './rumors';
import { hashString, pick } from './rng';
import { NPC_IDS } from './types';
import type { GameState, NpcId, RecapEntry, SimRequest, SimResult, SimTransfer } from './types';

/** Minimum affinity for a rumor to travel between two NPCs (the gossip hub ignores it). */
export const SPREAD_BOND = 40;
const GOSSIP_HUB: NpcId = 'josette';

export function buildSimRequest(state: GameState, hours: number): SimRequest {
  return {
    hours,
    day: state.day,
    facts: state.facts.map((f) => ({ id: f.id, text: f.text, severity: f.severity, aboutPlayer: f.actor === 'player' })),
    rumors: state.rumors.map((r) => ({ holder: r.holder, factId: r.factId, text: r.text })),
    bonds: state.bonds,
    relations: { gaston: state.npcs.gaston.relation, josette: state.npcs.josette.relation, marius: state.npcs.marius.relation },
    playerName: state.playerName,
    islandName: state.islandName,
  };
}

function canSpread(state: GameState, from: NpcId, to: NpcId): boolean {
  return from === GOSSIP_HUB || to === GOSSIP_HUB || bondOf(state, from, to) >= SPREAD_BOND;
}

const SMALL_TALK = [
  'talked about the weather (mostly the nice bits)',
  'fought over the last slice of pie',
  'put the world to rights at the end of the pier',
  'counted seagulls. They disagree on the total',
];

/**
 * Code-only simulation, used when the AI is unavailable. Rumors hop along strong bonds,
 * one hop per 4 hours, highest-severity facts first.
 */
export function simulateFallback(state: GameState, hours: number): SimResult {
  const rounds = clamp(Math.floor(hours / 4), 1, 3);
  const result: SimResult = { conversations: [], transfers: [], intents: [], bondChanges: [], source: 'fallback' };
  const facts = [...state.facts].sort((a, b) => Math.abs(b.severity) - Math.abs(a.severity));
  let working = state;
  for (let round = 0; round < rounds; round++) {
    const snapshot = working;
    for (const fact of facts) {
      for (const from of NPC_IDS) {
        const known = rumorOf(snapshot, from, fact.id);
        if (!known) continue;
        for (const to of NPC_IDS) {
          if (to === from || rumorOf(working, to, fact.id) || !canSpread(working, from, to)) continue;
          const text = distortRumor(known.text, known.distortion + 1);
          const moved = transferRumor(working, from, to, fact.id, text);
          if (!moved.rumor) continue;
          working = moved.state;
          result.transfers.push({ from, to, factId: fact.id, text });
          result.conversations.push({
            a: from,
            b: to,
            summary: `${CHARACTERS[from].name} told ${CHARACTERS[to].name}: "${known.text}"`,
          });
        }
      }
    }
  }
  if (result.conversations.length === 0) {
    const seed = hashString(`${state.day}-${state.nextId}`);
    result.conversations.push({ a: 'josette', b: 'marius', summary: `Josette and Marius ${pick(SMALL_TALK, seed)}.` });
  }
  return result;
}

/** Relation hit an NPC takes when hearing a rumor about the player. Decided by code, never by the AI. */
export function hearsayDelta(severity: number, distortion: number): number {
  return Math.round(severity * 4 * (1 + 0.25 * distortion));
}

const THOUGHTS: Record<string, string[]> = {
  'Sworn enemy': ['If I see that creature coming, I cross the street. And the island.', 'I\u2019m preparing a speech. It\u2019s long. It\u2019s mean.'],
  'Holding a grudge': ['I forget nothing. I even took notes.', 'I\u2019m owed an apology. With interest.'],
  Neighbor: ['Neither hot nor cold. Lukewarm, like Josette\u2019s coffee.', 'I don\u2019t know the newcomer well enough to badmouth them. Yet.'],
  Pal: ['Nice, the newcomer. But I won\u2019t say it too loud.', 'I\u2019d save the newcomer a slice of pie. A small one.'],
  Confidant: ['My favorite on the island. Don\u2019t repeat that, especially not to Josette.', 'I\u2019d tell them my secrets. Well, almost all of them.'],
};

/** Fallback inner thought about the player, picked from the NPC's current tier. */
export function fallbackThought(state: GameState, npc: NpcId): string {
  const options = THOUGHTS[tierOf(state.npcs[npc].relation).label] ?? THOUGHTS.Neighbor!;
  return pick(options, hashString(`${npc}-${state.day}-${state.nextId}`));
}

function confrontIntent(to: NpcId, from: NpcId, text: string): string {
  return `${CHARACTERS[to].name} heard ${CHARACTERS[from].name} say: "${text}". Wants an explanation.`;
}

function applyTransfer(
  state: GameState,
  transfer: SimTransfer,
  recap: RecapEntry[],
  intents: Map<NpcId, string>,
): GameState {
  const moved = transferRumor(state, transfer.from, transfer.to, transfer.factId, transfer.text);
  const fact = factById(state, transfer.factId);
  if (!moved.rumor || !fact) return state;
  let next = moved.state;
  const fromName = CHARACTERS[transfer.from].name;
  const toName = CHARACTERS[transfer.to].name;
  recap.push({ kind: 'rumor', npc: transfer.to, text: `${fromName} → ${toName}: "${moved.rumor.text}"` });
  if (fact.actor !== 'player' || fact.severity === 0) return next;
  const applied = applyRelationDelta(
    next,
    transfer.to,
    hearsayDelta(fact.severity, moved.rumor.distortion),
    `Heard ${fromName} talking about you`,
  );
  next = applied.state;
  if (applied.change) {
    const sign = applied.change.delta > 0 ? '+' : '';
    recap.push({ kind: 'relation', npc: transfer.to, text: `${toName} ${sign}${applied.change.delta}: ${applied.change.reason}` });
  }
  if (fact.severity <= -2 && !intents.has(transfer.to)) {
    intents.set(transfer.to, confrontIntent(transfer.to, transfer.from, moved.rumor.text));
  }
  return next;
}

/**
 * Applies a (possibly AI-proposed) simulation. Illegal transfers — unknown facts, NPCs who do not
 * know the rumor, weak bonds — are silently dropped; relation changes are always computed here.
 */
export function applySimResult(
  state: GameState,
  result: SimResult,
  hours: number,
): { state: GameState; recap: RecapEntry[] } {
  let next = structuredClone(state);
  const recap: RecapEntry[] = [];
  const intents = new Map<NpcId, string>();
  for (const talk of result.conversations) recap.push({ kind: 'talk', npc: talk.a, text: talk.summary });
  for (const transfer of result.transfers) {
    if (!canSpread(next, transfer.from, transfer.to)) continue;
    next = applyTransfer(next, transfer, recap, intents);
  }
  for (const change of result.bondChanges) {
    const key = bondKey(change.a, change.b);
    next.bonds[key] = clamp((next.bonds[key] ?? 0) + change.delta, 0, 100);
  }
  for (const intent of result.intents) if (!intents.has(intent.npc)) intents.set(intent.npc, intent.text);
  for (const [npc, text] of intents) {
    next.npcs[npc].intent = text;
    recap.push({ kind: 'intent', npc, text: `${CHARACTERS[npc].name} wants to talk to you.` });
  }
  for (const npc of NPC_IDS) {
    const text = result.thoughts?.find((t) => t.npc === npc)?.text ?? fallbackThought(next, npc);
    recap.push({ kind: 'thought', npc, text });
  }
  const total = next.clock + Math.round(hours * 60);
  next.day += Math.floor(total / (24 * 60));
  next.clock = total % (24 * 60);
  return { state: next, recap };
}

/**
 * AI flavor on top of guaranteed code rules: the AI's proposal is kept, and any rumor hop the
 * code-only simulation would make (and the AI forgot) is added, so gossip always travels.
 */
export function mergeSim(ai: SimResult, rules: SimResult): SimResult {
  const covered = new Set(ai.transfers.map((t) => `${t.to}:${t.factId}`));
  const missing = rules.transfers.filter((t) => !covered.has(`${t.to}:${t.factId}`));
  const missingTalks = rules.conversations.filter((c) => missing.some((t) => t.from === c.a && t.to === c.b));
  return {
    ...ai,
    transfers: [...ai.transfers, ...missing],
    conversations: [...ai.conversations, ...missingTalks].slice(0, 6),
  };
}
