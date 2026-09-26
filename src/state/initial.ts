import type { GameState, NpcId, NpcState } from './types';

const npc = (id: NpcId, memories: string[]): NpcState => ({
  id, relation: 10, mood: 'neutre', memories, intent: null, lastTalkDay: 0,
});

/** État de départ : jour 1, 17 h (lumière de fin de journée). `now` = horodatage de création. */
export function createInitialState(now = 0): GameState {
  return {
    version: 1,
    day: 1,
    hour: 17,
    lastSavedAt: now,
    player: {
      name: 'Voyageur',
      bells: 500,
      inventory: [
        { itemId: 'pomme', qty: 2 },
        { itemId: 'coquillage', qty: 1 },
        { itemId: 'banc-bois-flotte', qty: 1 },
      ],
      x: 0,
      z: 0,
      stungUntilDay: null,
    },
    npcs: {
      gaston: npc('gaston', ["Un nouveau venu vient de débarquer sur l'île. Un client potentiel."]),
      josette: npc('josette', ["Un nouveau visage sur l'île ! Il faut absolument tout savoir sur lui."]),
      marius: npc('marius', ["Quelqu'un de nouveau est arrivé par le bateau de ce matin."]),
    },
    // Seules les 3 clés triées existent (voir relations.bondKey) ; le type Record<BondKey> liste aussi les paires non triées.
    bonds: { 'josette|marius': 70, 'gaston|josette': 20, 'gaston|marius': -10 } as GameState['bonds'],
    facts: [],
    rumors: [],
    decor: { placette: null, falaise: null, ponton: null, mairie: null, plage: null, verger: null },
    pickups: [
      { id: 'p1-0', itemId: 'pomme', x: -6, z: -3 },
      { id: 'p1-1', itemId: 'figue', x: 5, z: 2 },
      { id: 'p1-2', itemId: 'coquillage', x: 6.5, z: 4 },
      { id: 'p1-3', itemId: 'coquillage', x: -5, z: 5.5 },
      { id: 'p1-4', itemId: 'pomme', x: -2, z: -5 },
    ],
    relationLog: [],
    pendingRecap: null,
  };
}
