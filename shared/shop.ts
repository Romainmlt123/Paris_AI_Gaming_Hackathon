import { tierOf } from './relations.js';
import type { GameState, NpcId, OutfitSlot, ShopItemId } from './types.js';

export type ShopId = 'echoppe' | 'boulangerie' | 'cabane';
export type ItemKind = 'meuble' | 'tenue';
export type Icon =
  | 'stool' | 'table' | 'rug' | 'lamp' | 'sofa' | 'armchair' | 'bookcase' | 'plant' | 'piano' | 'chandelier' | 'throne'
  | 'buoy' | 'aquarium' | 'ship' | 'shirt' | 'hat' | 'scarf';

export type HatStyle = 'cap' | 'beanie';

export interface Look {
  shirt?: string;
  scarf?: string;
  hat?: { style: HatStyle; color: string };
}

export interface ShopItem {
  id: ShopItemId;
  name: string;
  kind: ItemKind;
  shop: ShopId;
  price: number;
  /** Island value once owned (furniture only, it sits in the player's home). */
  prestige: number;
  /** Island level required to see it in stock. */
  level: number;
  icon: Icon;
  color: string;
  slot?: OutfitSlot;
  look?: Look;
}

const item = (i: ShopItem): ShopItem => i;

export const SHOP_ITEMS: Record<ShopItemId, ShopItem> = {
  tabouret: item({ id: 'tabouret', name: 'Cork stool', kind: 'meuble', shop: 'echoppe', price: 60, prestige: 10, level: 1, icon: 'stool', color: '#c79a5b' }),
  tapis: item({ id: 'tapis', name: 'Braided rug', kind: 'meuble', shop: 'echoppe', price: 90, prestige: 15, level: 1, icon: 'rug', color: '#d9694f' }),
  table: item({ id: 'table', name: 'Pallet coffee table', kind: 'meuble', shop: 'echoppe', price: 140, prestige: 20, level: 1, icon: 'table', color: '#a8744a' }),
  lampe: item({ id: 'lampe', name: 'Seashell lamp', kind: 'meuble', shop: 'echoppe', price: 120, prestige: 20, level: 1, icon: 'lamp', color: '#f5d9a8' }),
  plante: item({ id: 'plante', name: 'Monstera in a pink pot', kind: 'meuble', shop: 'echoppe', price: 150, prestige: 25, level: 2, icon: 'plant', color: '#e98aa6' }),
  fauteuil: item({ id: 'fauteuil', name: 'Rocking chair', kind: 'meuble', shop: 'echoppe', price: 260, prestige: 40, level: 2, icon: 'armchair', color: '#5fa37a' }),
  bibliotheque: item({ id: 'bibliotheque', name: 'Sailor\u2019s bookcase', kind: 'meuble', shop: 'echoppe', price: 320, prestige: 45, level: 2, icon: 'bookcase', color: '#8a5a3c' }),
  canape: item({ id: 'canape', name: 'Velvet sofa', kind: 'meuble', shop: 'echoppe', price: 380, prestige: 60, level: 2, icon: 'sofa', color: '#4f7fc9' }),
  lustre: item({ id: 'lustre', name: 'Crystal chandelier', kind: 'meuble', shop: 'echoppe', price: 700, prestige: 110, level: 3, icon: 'chandelier', color: '#bfe8f2' }),
  piano: item({ id: 'piano', name: 'Lacquered upright piano', kind: 'meuble', shop: 'echoppe', price: 900, prestige: 140, level: 3, icon: 'piano', color: '#2f2a3a' }),
  trone: item({ id: 'trone', name: 'Golden throne (very subtle)', kind: 'meuble', shop: 'echoppe', price: 1200, prestige: 180, level: 3, icon: 'throne', color: '#f2c14e' }),

  echarpe: item({ id: 'echarpe', name: 'Pink knitted scarf', kind: 'tenue', shop: 'boulangerie', price: 80, prestige: 0, level: 1, icon: 'scarf', color: '#e98aa6', slot: 'scarf', look: { scarf: '#e98aa6' } }),
  beret: item({ id: 'beret', name: 'Baker\u2019s beret', kind: 'tenue', shop: 'boulangerie', price: 120, prestige: 0, level: 1, icon: 'hat', color: '#c8453c', slot: 'hat', look: { hat: { style: 'cap', color: '#c8453c' } } }),
  pompon: item({ id: 'pompon', name: 'Bobble hat', kind: 'tenue', shop: 'boulangerie', price: 150, prestige: 0, level: 2, icon: 'hat', color: '#f2a93b', slot: 'hat', look: { hat: { style: 'beanie', color: '#f2a93b' } } }),
  pull: item({ id: 'pull', name: 'Mustard knit sweater', kind: 'tenue', shop: 'boulangerie', price: 200, prestige: 0, level: 2, icon: 'shirt', color: '#d9a52e', slot: 'top', look: { shirt: '#d9a52e' } }),
  gala: item({ id: 'gala', name: 'Purple gala jacket', kind: 'tenue', shop: 'boulangerie', price: 600, prestige: 0, level: 3, icon: 'shirt', color: '#7b4fa0', slot: 'top', look: { shirt: '#7b4fa0' } }),

  mariniere: item({ id: 'mariniere', name: 'Striped sailor shirt', kind: 'tenue', shop: 'cabane', price: 110, prestige: 0, level: 1, icon: 'shirt', color: '#eef0f4', slot: 'top', look: { shirt: '#e9edf3' } }),
  bonnet: item({ id: 'bonnet', name: 'Fisherman\u2019s beanie', kind: 'tenue', shop: 'cabane', price: 100, prestige: 0, level: 1, icon: 'hat', color: '#2f5f8f', slot: 'hat', look: { hat: { style: 'beanie', color: '#2f5f8f' } } }),
  bouee: item({ id: 'bouee', name: 'Decorative buoy', kind: 'meuble', shop: 'cabane', price: 70, prestige: 12, level: 1, icon: 'buoy', color: '#e0564a' }),
  cire: item({ id: 'cire', name: 'Yellow raincoat', kind: 'tenue', shop: 'cabane', price: 240, prestige: 0, level: 2, icon: 'shirt', color: '#f2c230', slot: 'top', look: { shirt: '#f2c230' } }),
  aquarium: item({ id: 'aquarium', name: 'Clownfish aquarium', kind: 'meuble', shop: 'cabane', price: 420, prestige: 70, level: 2, icon: 'aquarium', color: '#6cc3e0' }),
  capitaine: item({ id: 'capitaine', name: 'Captain\u2019s cap', kind: 'tenue', shop: 'cabane', price: 450, prestige: 0, level: 3, icon: 'hat', color: '#1f2f4f', slot: 'hat', look: { hat: { style: 'cap', color: '#1f2f4f' } } }),
  voilier: item({ id: 'voilier', name: 'Model sailboat', kind: 'meuble', shop: 'cabane', price: 650, prestige: 100, level: 3, icon: 'ship', color: '#f4efe4' }),
};

export const SHOP_OWNER: Record<ShopId, NpcId> = { echoppe: 'gaston', boulangerie: 'josette', cabane: 'marius' };

export interface IslandLevel {
  level: number;
  name: string;
  min: number;
}

export const ISLAND_LEVELS: readonly IslandLevel[] = [
  { level: 1, name: 'Hamlet', min: 0 },
  { level: 2, name: 'Village', min: 150 },
  { level: 3, name: 'Marina', min: 450 },
];

export function islandLevel(value: number): IslandLevel {
  let current = ISLAND_LEVELS[0];
  for (const l of ISLAND_LEVELS) if (value >= l.min) current = l;
  if (!current) throw new Error('ISLAND_LEVELS is empty');
  return current;
}

export function nextLevel(value: number): IslandLevel | null {
  return ISLAND_LEVELS.find((l) => l.min > value) ?? null;
}

const OWNER_MARKUP: Record<string, number> = {
  'Sworn enemy': 1.5,
  'Holding a grudge': 1.25,
  Neighbor: 1,
  Pal: 0.9,
  Confidant: 0.8,
};

/** Shop price, shaped by how much the owner likes the player. */
export function priceOf(state: GameState, id: ShopItemId): number {
  const it = SHOP_ITEMS[id];
  const tier = tierOf(state.npcs[SHOP_OWNER[it.shop]].relation).label;
  return Math.round((it.price * (OWNER_MARKUP[tier] ?? 1)) / 5) * 5;
}

export function homePrestige(state: GameState): number {
  return state.owned.reduce((sum, id) => sum + SHOP_ITEMS[id].prestige, 0);
}

export interface StockEntry {
  item: ShopItem;
  price: number;
  owned: boolean;
  locked: boolean;
}

export function stockOf(state: GameState, shop: ShopId): StockEntry[] {
  const level = islandLevel(state.islandValue).level;
  return Object.values(SHOP_ITEMS)
    .filter((it) => it.shop === shop)
    .sort((a, b) => a.level - b.level || a.price - b.price)
    .map((it) => ({ item: it, price: priceOf(state, it.id), owned: state.owned.includes(it.id), locked: it.level > level }));
}

export type BuyResult = { ok: true; state: GameState; price: number } | { ok: false; reason: 'locked' | 'coins' | 'owned' };

/** Buying a shop item: furniture goes home (and counts for the island value), clothes are worn at once. */
export function buyItem(state: GameState, id: ShopItemId, islandValueOf: (s: GameState) => number): BuyResult {
  const it = SHOP_ITEMS[id];
  if (state.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (it.level > islandLevel(state.islandValue).level) return { ok: false, reason: 'locked' };
  const price = priceOf(state, id);
  if (state.coins < price) return { ok: false, reason: 'coins' };
  const next = structuredClone(state);
  next.coins -= price;
  next.owned = [...next.owned, id];
  if (it.slot) next.outfit[it.slot] = id;
  next.islandValue = islandValueOf(next);
  return { ok: true, state: next, price };
}

/** Wear an owned piece of clothing, or take it off if already worn. */
export function toggleWear(state: GameState, id: ShopItemId): GameState {
  const slot = SHOP_ITEMS[id].slot;
  if (!slot || !state.owned.includes(id)) return state;
  const next = structuredClone(state);
  next.outfit[slot] = next.outfit[slot] === id ? null : id;
  return next;
}

export function lookOf(state: GameState): Look {
  const look: Look = {};
  for (const id of Object.values(state.outfit)) {
    if (id) Object.assign(look, SHOP_ITEMS[id].look);
  }
  return look;
}
