import { BEACH_TILES, PLAYER_START, TREES, tileToWorld } from '../data/island.ts';
import type { GameState, NpcId, NpcState } from '../state/types.ts';
import { SLOT_IDS } from '../state/types.ts';
import { makeRng, pick } from './rng.ts';

function npc(id: NpcId, relation: number): NpcState {
  return { id, relation, mood: 'neutre', memories: [], intent: null, lastTalkDay: 0, caughtLies: 0 };
}

export function createInitialState(seed = 7, playerName = 'Le nouveau'): GameState {
  const rng = makeRng(seed);
  const start = tileToWorld(PLAYER_START.i, PLAYER_START.j);
  const state: GameState = {
    version: 2,
    seed,
    day: 1,
    hour: 9,
    lastSavedAt: 0,
    player: { name: playerName, bells: 1200, inventory: [{ itemId: 'canne', qty: 1 }, { itemId: 'pomme', qty: 2 }], x: start.x, z: start.z, stungUntilDay: null },
    npcs: { gaston: npc('gaston', 10), josette: npc('josette', 25), marius: npc('marius', 15) },
    bonds: { 'josette|marius': 85, 'gaston|josette': 20, 'gaston|marius': -10 },
    facts: [],
    rumors: [],
    decor: Object.fromEntries(SLOT_IDS.map((s) => [s, null])) as GameState['decor'],
    pickups: [],
    trees: TREES.map((t) => ({ id: t.id, fruit: t.fruit, fruits: 3, hive: t.id === 't3' || t.id === 't6', shakenDay: 0 })),
    animals: [
      { id: 'a1', kind: 'dodo', name: 'Pompon', lastFedDay: 1, readyToCollect: false },
      { id: 'a2', kind: 'mouton', name: 'Nuage', lastFedDay: 1, readyToCollect: false },
    ],
    relationLog: [],
    pendingRecap: null,
    counter: 0,
  };
  for (let k = 0; k < 5; k++) {
    const t = pick(rng, BEACH_TILES);
    const w = tileToWorld(t.i, t.j);
    state.counter += 1;
    state.pickups.push({ id: `p${state.counter}`, itemId: k === 4 ? 'conque' : 'coquillage', x: w.x, z: w.z });
  }
  return state;
}
