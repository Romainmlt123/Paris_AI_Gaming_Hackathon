import { bondOf } from './relations';
import { hashString, pick } from './rng';
import type { GameState, NpcId } from './types';
import { NPC_IDS } from './types';

export interface Spot {
  x: number;
  z: number;
}

type Activity = { at: Spot; label: string } | { visit: true };

interface Slot {
  from: number;
  to: number;
  activity: Activity;
}

const DAY_MINUTES = 24 * 60;
const VISIT_BOND = 40;

const ECHOPPE: Spot = { x: 17, z: 17 };
const PLACETTE: Spot = { x: 13, z: 19 };
const BOULANGERIE: Spot = { x: 7, z: 18 };
const PONTON: Spot = { x: 17, z: 24 };
const CABANE: Spot = { x: 14, z: 24 };
const MAIRIE: Spot = { x: 13, z: 9 };

const HOME: Record<NpcId, Spot> = { gaston: { x: 17, z: 18 }, josette: { x: 5, z: 18 }, marius: { x: 14, z: 24 } };

/** Hourly routine; any hour not covered is spent at home. */
const SCHEDULE: Record<NpcId, readonly Slot[]> = {
  gaston: [
    { from: 7, to: 12, activity: { at: ECHOPPE, label: 'minds his stall' } },
    { from: 12, to: 14, activity: { at: PLACETTE, label: 'hustles passers-by' } },
    { from: 14, to: 18, activity: { at: ECHOPPE, label: 'counts his till' } },
    { from: 18, to: 20, activity: { at: MAIRIE, label: 'lobbies at the town hall' } },
    { from: 20, to: 22, activity: { visit: true } },
  ],
  josette: [
    { from: 6, to: 11, activity: { at: BOULANGERIE, label: 'pulls loaves from the oven' } },
    { from: 11, to: 13, activity: { at: PLACETTE, label: 'collects gossip' } },
    { from: 13, to: 17, activity: { visit: true } },
    { from: 17, to: 21, activity: { at: BOULANGERIE, label: 'writes in her notebook' } },
  ],
  marius: [
    { from: 5, to: 10, activity: { at: PONTON, label: 'fishes at the end of the pier' } },
    { from: 10, to: 14, activity: { at: CABANE, label: 'mends his nets' } },
    { from: 14, to: 17, activity: { visit: true } },
    { from: 17, to: 23, activity: { at: PONTON, label: 'watches the sunset' } },
  ],
};

export interface RoutineStep {
  spot: Spot;
  label: string;
  visiting: NpcId | null;
}

function slotAt(npc: NpcId, clock: number): Slot | undefined {
  const hour = Math.floor(clock / 60) % 24;
  return SCHEDULE[npc].find((s) => hour >= s.from && hour < s.to);
}

function ownStep(npc: NpcId, clock: number): RoutineStep {
  const act = slotAt(npc, clock)?.activity;
  if (act && 'at' in act) return { spot: act.at, label: act.label, visiting: null };
  return { spot: HOME[npc], label: 'is at home', visiting: null };
}

/** Closest friend to visit, if the bond is strong enough. */
function friendOf(state: GameState, npc: NpcId): NpcId | null {
  const others = NPC_IDS.filter((o) => o !== npc);
  const best = others.sort((a, b) => bondOf(state, npc, b) - bondOf(state, npc, a))[0];
  return best && bondOf(state, npc, best) >= VISIT_BOND ? best : null;
}

/** Where the NPC should be right now and what it is doing. Visits go next to the friend's own spot. */
export function routineStep(state: GameState, npc: NpcId): RoutineStep {
  const act = slotAt(npc, state.clock)?.activity;
  if (!act || 'at' in act) return ownStep(npc, state.clock);
  const friend = friendOf(state, npc);
  if (!friend) return { spot: PLACETTE, label: 'strolls around the square', visiting: null };
  const there = ownStep(friend, state.clock).spot;
  return { spot: { x: there.x - 1, z: there.z }, label: 'pays a visit', visiting: friend };
}

export function advanceClock(state: GameState, minutes: number): GameState {
  const total = state.clock + minutes;
  return { ...state, clock: total % DAY_MINUTES, day: state.day + Math.floor(total / DAY_MINUTES) };
}

const CHATTER: Record<NpcId, Record<NpcId, readonly string[]>> = {
  gaston: {
    gaston: [],
    josette: ['Josette, darling, your 2-coin loaf, I resell it for 5. Partners?', 'Between us, any idea how much the new one has in their pockets?'],
    marius: ['Marius, your fish, I\u2019ll take it at half price. It already smells, see.', 'Still caught nothing? I\u2019ll sell you a rod, friends-and-family price.'],
  },
  josette: {
    gaston: ['Gaston! I heard your scales are rigged. Is it true, hmm?', 'You swindled someone again, I can see it in your eyes!'],
    josette: [],
    marius: ['My Marius! Are you eating enough? Here, a croissant. Now tell me everything!', 'Wait wait… the new one talked to you? What did they say? EVERYTHING!'],
  },
  marius: {
    gaston: ['… Gaston. Your smile is like a shark\u2019s. All teeth, nothing behind it.', '… My fish are worth more than your coins, mind you.'],
    josette: ['… Josette. The golden octopus, I nearly had it this morning. Nearly.', '… You talk too fast, love. The waves take their time.'],
    marius: [],
  },
};

export function chatterLine(speaker: NpcId, listener: NpcId, seed: number): string | null {
  const lines = CHATTER[speaker][listener];
  return lines.length ? pick(lines, hashString(`${speaker}${listener}${seed}`)) : null;
}
