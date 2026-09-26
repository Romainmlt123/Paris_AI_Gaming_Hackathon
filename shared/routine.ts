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
    { from: 7, to: 12, activity: { at: ECHOPPE, label: 'tient son échoppe' } },
    { from: 12, to: 14, activity: { at: PLACETTE, label: 'démarche les passants' } },
    { from: 14, to: 18, activity: { at: ECHOPPE, label: 'compte sa caisse' } },
    { from: 18, to: 20, activity: { at: MAIRIE, label: 'fait du lobbying à la mairie' } },
    { from: 20, to: 22, activity: { visit: true } },
  ],
  josette: [
    { from: 6, to: 11, activity: { at: BOULANGERIE, label: 'sort les fournées' } },
    { from: 11, to: 13, activity: { at: PLACETTE, label: 'récolte les ragots' } },
    { from: 13, to: 17, activity: { visit: true } },
    { from: 17, to: 21, activity: { at: BOULANGERIE, label: 'écrit dans son carnet' } },
  ],
  marius: [
    { from: 5, to: 10, activity: { at: PONTON, label: 'pêche au bout du ponton' } },
    { from: 10, to: 14, activity: { at: CABANE, label: 'répare ses filets' } },
    { from: 14, to: 17, activity: { visit: true } },
    { from: 17, to: 23, activity: { at: PONTON, label: 'regarde le coucher de soleil' } },
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
  return { spot: HOME[npc], label: 'est chez ' + (npc === 'josette' ? 'elle' : 'lui'), visiting: null };
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
  if (!friend) return { spot: PLACETTE, label: 'flâne sur la placette', visiting: null };
  const there = ownStep(friend, state.clock).spot;
  return { spot: { x: there.x - 1, z: there.z }, label: 'rend visite', visiting: friend };
}

export function advanceClock(state: GameState, minutes: number): GameState {
  const total = state.clock + minutes;
  return { ...state, clock: total % DAY_MINUTES, day: state.day + Math.floor(total / DAY_MINUTES) };
}

const CHATTER: Record<NpcId, Record<NpcId, readonly string[]>> = {
  gaston: {
    gaston: [],
    josette: ['Josette, ma belle, ta baguette à 2 pièces, je te la revends 5. Association ?', 'Entre nous, tu sais combien il a dans les poches, le nouveau ?'],
    marius: ['Marius, ton poisson, je te le prends à moitié prix. Il sent déjà, vé.', 'Oh fada, t\u2019as encore rien pêché ? Je te vends une canne, prix d\u2019ami.'],
  },
  josette: {
    gaston: ['Gaston ! On m\u2019a dit que tes balances étaient truquées. Ch\u2019est vrai, hein ?', 'Toi, t\u2019as encore arnaqué quelqu\u2019un, je le vois dans tes yeux !'],
    josette: [],
    marius: ['Mon Marius ! Tu manges assez, hein ? Tiens, un croissant. Et raconte-moi tout !', 'Attends attends… le nouveau t\u2019a parlé ? Il t\u2019a dit quoi ? TOUT !'],
  },
  marius: {
    gaston: ['… Gaston. Ton sourire, c\u2019est comme un requin. Plein de dents, rien derrière.', '… Mes poissons valent plus que tes pièces, té.'],
    josette: ['… Josette. Le poulpe doré, je l\u2019ai presque eu ce matin. Presque.', '… Tu parles trop vite, ma belle. Les vagues, elles, prennent leur temps.'],
    marius: [],
  },
};

export function chatterLine(speaker: NpcId, listener: NpcId, seed: number): string | null {
  const lines = CHATTER[speaker][listener];
  return lines.length ? pick(lines, hashString(`${speaker}${listener}${seed}`)) : null;
}
