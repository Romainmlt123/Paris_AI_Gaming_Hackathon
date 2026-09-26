import { CHARACTERS } from './characters';
import { applyRelationDelta } from './relations';
import { recordFact } from './rumors';
import type { FishId, GameState, NpcId, RelationChange } from './types';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'junk';

export interface Fish {
  id: FishId;
  name: string;
  rarity: Rarity;
  /** Relative odds of biting. */
  weight: number;
  /** What Gaston pays for it. */
  value: number;
  color: string;
  belly: string;
  /** Body length in the 0..1 icon box. */
  size: number;
}

const fish = (f: Fish): Fish => f;

export const FISH: Record<FishId, Fish> = {
  sardine: fish({ id: 'sardine', name: 'Sardine', rarity: 'common', weight: 30, value: 12, color: '#7b95b8', belly: '#dfe8f2', size: 0.55 }),
  maquereau: fish({ id: 'maquereau', name: 'Mackerel', rarity: 'common', weight: 24, value: 18, color: '#3f7f7a', belly: '#e2efe9', size: 0.65 }),
  bar: fish({ id: 'bar', name: 'Sea bass', rarity: 'common', weight: 18, value: 30, color: '#8c9aa6', belly: '#eef1f3', size: 0.75 }),
  rouget: fish({ id: 'rouget', name: 'Red mullet', rarity: 'uncommon', weight: 10, value: 45, color: '#d6574a', belly: '#f7d7c4', size: 0.6 }),
  dorade: fish({ id: 'dorade', name: 'Gilt-head bream', rarity: 'uncommon', weight: 8, value: 60, color: '#b9a36a', belly: '#f4ecd2', size: 0.72 }),
  poulpe: fish({ id: 'poulpe', name: 'Octopus', rarity: 'rare', weight: 4, value: 110, color: '#b25a86', belly: '#f0c4d8', size: 0.7 }),
  espadon: fish({ id: 'espadon', name: 'Swordfish', rarity: 'rare', weight: 2, value: 180, color: '#4d6f9c', belly: '#d7e3f0', size: 0.95 }),
  poulpe_dore: fish({ id: 'poulpe_dore', name: 'Golden octopus', rarity: 'legendary', weight: 0.6, value: 500, color: '#e8b43a', belly: '#fff0b8', size: 0.75 }),
  botte: fish({ id: 'botte', name: 'Old boot', rarity: 'junk', weight: 6, value: 0, color: '#6b4a32', belly: '#8a6a4a', size: 0.6 }),
};

export const FISH_IDS = Object.keys(FISH) as FishId[];
export const BAG_FISH_MAX = 12;

/** Weighted draw; `roll` in [0, 1). */
export function rollFish(roll: number): FishId {
  const total = FISH_IDS.reduce((s, id) => s + FISH[id].weight, 0);
  let acc = 0;
  for (const id of FISH_IDS) {
    acc += FISH[id].weight / total;
    if (roll < acc) return id;
  }
  return 'sardine';
}

export type CatchResult = { ok: true; state: GameState } | { ok: false; reason: 'full' };

export function addCatch(state: GameState, id: FishId): CatchResult {
  if (state.fish.length >= BAG_FISH_MAX) return { ok: false, reason: 'full' };
  return { ok: true, state: { ...state, fish: [...state.fish, id] } };
}

export interface GiftOutcome {
  state: GameState;
  change: RelationChange | null;
  coins: number;
  line: string;
}

const precious = (f: Fish): boolean => f.rarity === 'rare' || f.rarity === 'legendary';

/** How each islander reacts to a fish: coins from Gaston, affection from Josette, respect (or envy) from Marius. */
function reaction(npc: NpcId, f: Fish): { delta: number; coins: number; line: string } {
  if (f.id === 'botte') {
    const lines: Record<NpcId, string> = {
      gaston: 'A boot?! Do I look like a dumpster, my friend? Get that out of here!',
      josette: 'Ew! What on earth am I supposed to do with a boot, sweetie?! I\u2019m telling everyone about this…',
      marius: '… The sea gives back what you throw at it. Keep it. And think about that.',
    };
    return { delta: npc === 'marius' ? -2 : -5, coins: 0, line: lines[npc] };
  }
  if (npc === 'gaston') {
    const coins = f.value;
    const line = precious(f)
      ? `${f.name}?! … Fine, I\u2019ll give you ${coins}. It\u2019s robbery. For me. Well, for you.`
      : `${f.name}… Smells fishy, naturally. ${coins} coins, take it or leave it.`;
    return { delta: precious(f) ? 3 : 1, coins, line };
  }
  if (npc === 'josette') {
    const line = precious(f)
      ? `Oh my days, a ${f.name.toLowerCase()}! For me?! Wait till I tell Marius, he\u2019ll turn green with envy!`
      : `Oh, thank you sweetie! ${f.name}, perfect for tomorrow\u2019s pie. You\u2019re a darling.`;
    return { delta: precious(f) ? 10 : 5, coins: 0, line };
  }
  const line = precious(f)
    ? `… ${f.name}. Thirty years I\u2019ve been after one like that. … Where\u2019d you get it? No. Don\u2019t tell me. It hurts.`
    : `… ${f.name}. Not bad. At your age, I pulled out ones twice that size. But thanks, lad.`;
  return { delta: precious(f) ? 12 : 3, coins: 0, line };
}

/** Hand a fish from the bag to an islander. Precious gifts become island news. */
export function giveFish(state: GameState, npc: NpcId, id: FishId): GiftOutcome | null {
  const at = state.fish.indexOf(id);
  if (at < 0) return null;
  const f = FISH[id];
  const r = reaction(npc, f);
  let next: GameState = { ...state, fish: state.fish.filter((_, i) => i !== at), coins: state.coins + r.coins };
  if (precious(f) || f.id === 'botte') {
    next = recordFact(next, {
      actor: 'player',
      text: f.id === 'botte' ? `The player gave an old boot to ${CHARACTERS[npc].name}` : `The player gave a ${f.name.toLowerCase()} to ${CHARACTERS[npc].name}`,
      severity: f.id === 'botte' ? -1 : 1,
      witnesses: [npc],
    }).state;
  }
  const verb = npc === 'gaston' ? 'Fish sold' : 'Gift appreciated';
  const applied = applyRelationDelta(next, npc, r.delta, r.delta < 0 ? 'A boot, seriously?' : `${verb}: ${f.name}`);
  return { state: applied.state, change: applied.change, coins: r.coins, line: r.line };
}
