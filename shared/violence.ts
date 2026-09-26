import { CHARACTERS } from './characters';
import { applyRelationDelta, RELATION_MAX, RELATION_MIN } from './relations';
import { recordFact } from './rumors';
import { cleanName, playerLabel } from './player';
import { NPC_IDS } from './types';
import type { GameState, NpcId, RelationChange } from './types';

/** Gauge percentages (0 % = RELATION_MIN, 100 % = RELATION_MAX). */
export const SLAP_PCT = 35;
export const FIGHT_PCT = 20;
export const DANGER_PCT = 28;
export const FIGHT_RELIEF = 15;
export const MURDER_RESET = -40;
const WAKE_CLOCK = 8 * 60;

export type Clash = 'slap' | 'fight' | 'murder';
export type Mood = 'heart' | 'storm' | 'skull' | null;

export const WEAPONS: Record<NpcId, string> = {
  gaston: 'his cash register',
  josette: 'her rolling pin',
  marius: 'a frozen swordfish',
};

export function percentOf(relation: number): number {
  return Math.round(((relation - RELATION_MIN) / (RELATION_MAX - RELATION_MIN)) * 100);
}

/** What a relation drop triggers: a murder at 0 %, a fight when the gauge crosses 20 % downward, a slap on any drop at or under 35 %. */
export function clashFor(before: number, after: number): Clash | null {
  if (after >= before) return null;
  if (percentOf(after) <= 0) return 'murder';
  if (percentOf(after) <= FIGHT_PCT && percentOf(before) > FIGHT_PCT) return 'fight';
  if (percentOf(after) <= SLAP_PCT) return 'slap';
  return null;
}

export function moodOf(relation: number): Mood {
  const pct = percentOf(relation);
  if (pct <= DANGER_PCT) return 'skull';
  if (pct <= SLAP_PCT) return 'storm';
  if (pct >= 75) return 'heart';
  return null;
}

/** A slap is a warning shot: it doesn't calm anyone down, but everyone hears about it. */
export function resolveSlap(state: GameState, npc: NpcId): GameState {
  return recordFact(state, {
    actor: npc,
    text: `${CHARACTERS[npc].name} slapped the player`,
    severity: -1,
    witnesses: [npc],
  }).state;
}

/** After the brawl both sides have vented: the gauge climbs a little and the island hears about it. */
export function resolveFight(state: GameState, npc: NpcId): { state: GameState; change: RelationChange | null } {
  const name = CHARACTERS[npc].name;
  const witnessed = recordFact(state, {
    actor: 'player',
    text: `${playerLabel(state.playerName)} and ${name} brawled like alley cats in front of everyone`,
    severity: -2,
    witnesses: [npc],
  }).state;
  witnessed.npcs[npc].emotion = 'amuse';
  witnessed.npcs[npc].intent = null;
  return applyRelationDelta(witnessed, npc, FIGHT_RELIEF, 'You both blew off steam');
}

/** The NPC kills the player. Next morning the player wakes up, robbed, and the whole island knows. */
export function resolveMurder(state: GameState, killer: NpcId): { state: GameState; change: RelationChange | null } {
  const name = CHARACTERS[killer].name;
  const others = NPC_IDS.filter((id) => id !== killer);
  let next = recordFact(state, {
    actor: killer,
    text: `${name} murdered ${state.playerName ? cleanName(state.playerName) : 'the player'} with ${WEAPONS[killer]}`,
    severity: -3,
    witnesses: [...NPC_IDS],
  }).state;
  next.day += 1;
  next.clock = WAKE_CLOCK;
  next.coins = Math.floor(next.coins / 2);
  next.npcs[killer].emotion = 'mefiance';
  next.npcs[killer].intent = null;
  for (const id of others) next.npcs[id].intent = `Talk about the murder committed by ${name}`;
  const reset = applyRelationDelta(next, killer, MURDER_RESET - next.npcs[killer].relation, `${name} got you… and it calmed ${CHARACTERS[killer].pronoun === 'she' ? 'her' : 'him'} right down`);
  next = reset.state;
  return { state: next, change: reset.change };
}
