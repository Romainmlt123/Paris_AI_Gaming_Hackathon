import { CHARACTERS } from './characters';
import { applyRelationDelta } from './relations';
import { recordFact } from './rumors';
import type { FishId, GameState, NpcId, RelationChange } from './types';

export type Rarity = 'commun' | 'peu commun' | 'rare' | 'légendaire' | 'déchet';

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
  sardine: fish({ id: 'sardine', name: 'Sardine', rarity: 'commun', weight: 30, value: 12, color: '#7b95b8', belly: '#dfe8f2', size: 0.55 }),
  maquereau: fish({ id: 'maquereau', name: 'Maquereau', rarity: 'commun', weight: 24, value: 18, color: '#3f7f7a', belly: '#e2efe9', size: 0.65 }),
  bar: fish({ id: 'bar', name: 'Bar commun', rarity: 'commun', weight: 18, value: 30, color: '#8c9aa6', belly: '#eef1f3', size: 0.75 }),
  rouget: fish({ id: 'rouget', name: 'Rouget', rarity: 'peu commun', weight: 10, value: 45, color: '#d6574a', belly: '#f7d7c4', size: 0.6 }),
  dorade: fish({ id: 'dorade', name: 'Dorade royale', rarity: 'peu commun', weight: 8, value: 60, color: '#b9a36a', belly: '#f4ecd2', size: 0.72 }),
  poulpe: fish({ id: 'poulpe', name: 'Poulpe', rarity: 'rare', weight: 4, value: 110, color: '#b25a86', belly: '#f0c4d8', size: 0.7 }),
  espadon: fish({ id: 'espadon', name: 'Espadon', rarity: 'rare', weight: 2, value: 180, color: '#4d6f9c', belly: '#d7e3f0', size: 0.95 }),
  poulpe_dore: fish({ id: 'poulpe_dore', name: 'Poulpe doré', rarity: 'légendaire', weight: 0.6, value: 500, color: '#e8b43a', belly: '#fff0b8', size: 0.75 }),
  botte: fish({ id: 'botte', name: 'Vieille botte', rarity: 'déchet', weight: 6, value: 0, color: '#6b4a32', belly: '#8a6a4a', size: 0.6 }),
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

const precious = (f: Fish): boolean => f.rarity === 'rare' || f.rarity === 'légendaire';

/** How each islander reacts to a fish: coins from Gaston, affection from Josette, respect (or envy) from Marius. */
function reaction(npc: NpcId, f: Fish): { delta: number; coins: number; line: string } {
  if (f.id === 'botte') {
    const lines: Record<NpcId, string> = {
      gaston: 'Une botte ?! Tu me prends pour une poubelle, mon ami ? Dégage avec ça !',
      josette: 'Beurk ! Mais qu’est-ce que tu veux que je fasse d’une botte, mon chou ?! Je vais le raconter à tout le monde…',
      marius: '… La mer rend ce qu’on lui jette. Garde-la. Et réfléchis.',
    };
    return { delta: npc === 'marius' ? -2 : -5, coins: 0, line: lines[npc] };
  }
  if (npc === 'gaston') {
    const coins = f.value;
    const line = precious(f)
      ? `${f.name} ?! … Bon, je t’en donne ${coins}. C’est du vol. Pour moi. Enfin, pour toi.`
      : `${f.name}… Ça sent le poisson, forcément. ${coins} pièces, à prendre ou à laisser.`;
    return { delta: precious(f) ? 3 : 1, coins, line };
  }
  if (npc === 'josette') {
    const line = precious(f)
      ? `Oh là là, ${f.name.toLowerCase()} ! Pour moi ?! Attends que je raconte ça à Marius, il va en faire une jaunisse !`
      : `Oh, merci mon chou ! ${f.name}, parfait pour ma fougasse de demain. Tu es un amour.`;
    return { delta: precious(f) ? 10 : 5, coins: 0, line };
  }
  const line = precious(f)
    ? `… ${f.name}. Trente ans que j’en cherche un comme ça. … Tu l’as eu où ? Non. Me dis pas. Ça me fait mal.`
    : `… ${f.name}. Pas mal. Moi, à ton âge, j’en sortais des deux fois plus gros. Mais merci.`;
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
      text: f.id === 'botte' ? `Le joueur a offert une vieille botte à ${CHARACTERS[npc].name}` : `Le joueur a offert un(e) ${f.name.toLowerCase()} à ${CHARACTERS[npc].name}`,
      severity: f.id === 'botte' ? -1 : 1,
      witnesses: [npc],
    }).state;
  }
  const verb = npc === 'gaston' ? 'Poisson vendu' : 'Cadeau apprécié';
  const applied = applyRelationDelta(next, npc, r.delta, r.delta < 0 ? 'Une botte, sérieusement ?' : `${verb} : ${f.name}`);
  return { state: applied.state, change: applied.change, coins: r.coins, line: r.line };
}
