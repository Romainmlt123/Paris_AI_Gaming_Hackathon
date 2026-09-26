import { CHARACTERS } from './characters';
import { applyRelationDelta, RELATION_MAX, RELATION_MIN } from './relations';
import { recordFact } from './rumors';
import { cleanName, playerLabel } from './player';
import { NPC_IDS } from './types';
import type { GameState, NpcId, RelationChange } from './types';

/** Gauge percentages (0 % = RELATION_MIN, 100 % = RELATION_MAX). */
export const FIGHT_PCT = 10;
export const DANGER_PCT = 18;
export const FIGHT_RELIEF = 15;
export const MURDER_RESET = -40;
const WAKE_CLOCK = 8 * 60;

export type Clash = 'fight' | 'murder';
export type Mood = 'heart' | 'storm' | 'skull' | null;

export const WEAPONS: Record<NpcId, string> = {
  gaston: 'sa caisse enregistreuse',
  josette: 'son rouleau à pâtisserie',
  marius: 'un espadon congelé',
};

export function percentOf(relation: number): number {
  return Math.round(((relation - RELATION_MIN) / (RELATION_MAX - RELATION_MIN)) * 100);
}

/** What a relation drop triggers: a murder at 0 %, a fight when the gauge crosses 10 % downward. */
export function clashFor(before: number, after: number): Clash | null {
  if (after >= before) return null;
  if (percentOf(after) <= 0) return 'murder';
  if (percentOf(after) <= FIGHT_PCT && percentOf(before) > FIGHT_PCT) return 'fight';
  return null;
}

export function moodOf(relation: number): Mood {
  const pct = percentOf(relation);
  if (pct <= DANGER_PCT) return 'skull';
  if (pct <= 25) return 'storm';
  if (pct >= 75) return 'heart';
  return null;
}

/** After the brawl both sides have vented: the gauge climbs a little and the island hears about it. */
export function resolveFight(state: GameState, npc: NpcId): { state: GameState; change: RelationChange | null } {
  const name = CHARACTERS[npc].name;
  const witnessed = recordFact(state, {
    actor: 'player',
    text: `${playerLabel(state.playerName)} et ${name} se sont battus comme des chiffonniers devant tout le monde`,
    severity: -2,
    witnesses: [npc],
  }).state;
  witnessed.npcs[npc].emotion = 'amuse';
  witnessed.npcs[npc].intent = null;
  return applyRelationDelta(witnessed, npc, FIGHT_RELIEF, 'Vous avez évacué votre rage');
}

/** The NPC kills the player. Next morning the player wakes up, robbed, and the whole island knows. */
export function resolveMurder(state: GameState, killer: NpcId): { state: GameState; change: RelationChange | null } {
  const name = CHARACTERS[killer].name;
  const others = NPC_IDS.filter((id) => id !== killer);
  let next = recordFact(state, {
    actor: killer,
    text: `${name} a assassiné ${state.playerName ? cleanName(state.playerName) : 'le joueur'} avec ${WEAPONS[killer]}`,
    severity: -3,
    witnesses: [...NPC_IDS],
  }).state;
  next.day += 1;
  next.clock = WAKE_CLOCK;
  next.coins = Math.floor(next.coins / 2);
  next.npcs[killer].emotion = 'mefiance';
  next.npcs[killer].intent = null;
  for (const id of others) next.npcs[id].intent = `Parler du meurtre commis par ${name}`;
  const reset = applyRelationDelta(next, killer, MURDER_RESET - next.npcs[killer].relation, `${name} a eu ta peau… et ça l\u2019a calmé${CHARACTERS[killer].pronoun === 'elle' ? 'e' : ''}`);
  next = reset.state;
  return { state: next, change: reset.change };
}
