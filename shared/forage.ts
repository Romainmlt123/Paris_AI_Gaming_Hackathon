import { classifyMessage } from './fallback';
import { parseOffer, type HaggleOutcome } from './economy';
import { clamp, tierOf } from './relations';
import { hashString, mulberry32, pick } from './rng';
import type { ForageId, ForageSpot, GameState } from './types';

export interface ForageItem {
  id: ForageId;
  name: string;
  icon: string;
  /** What Gaston would fairly pay, before haggling. */
  value: number;
}

export const FORAGE: Record<ForageId, ForageItem> = {
  coquillage: { id: 'coquillage', name: 'Coquillage', icon: '🐚', value: 30 },
  pomme: { id: 'pomme', name: 'Pomme', icon: '🍎', value: 45 },
  perle: { id: 'perle', name: 'Perle nacrée', icon: '🦪', value: 240 },
};

export const FORAGE_IDS: readonly ForageId[] = ['coquillage', 'pomme', 'perle'];
export const STACK_MAX = 10;

export interface ForageTile {
  x: number;
  z: number;
}

/** Where things may spawn: walkable beach tiles, and walkable tiles next to trees. */
export interface ForageCandidates {
  beach: ForageTile[];
  orchard: ForageTile[];
}

const SHELLS_PER_DAY = 5;
const APPLES_PER_DAY = 3;
const PEARL_CHANCE = 0.35;

function takeRandom<T>(pool: T[], rng: () => number): T | undefined {
  if (pool.length === 0) return undefined;
  const i = Math.floor(rng() * pool.length);
  return pool.splice(i, 1)[0];
}

/** Deterministic morning spawn. Marius's "coin secret" guarantees one pearl once unlocked. */
export function spawnForage(day: number, candidates: ForageCandidates, mariusSpot: boolean): ForageSpot[] {
  const rng = mulberry32(day * 7919 + 17);
  const beach = [...candidates.beach];
  const orchard = [...candidates.orchard];
  const spots: ForageSpot[] = [];
  const add = (item: ForageId, tile: ForageTile | undefined): void => {
    if (tile) spots.push({ id: `d${day}-${spots.length}`, item, x: tile.x, z: tile.z });
  };
  for (let i = 0; i < SHELLS_PER_DAY; i++) add(i === 0 && rng() < PEARL_CHANCE ? 'perle' : 'coquillage', takeRandom(beach, rng));
  for (let i = 0; i < APPLES_PER_DAY; i++) add('pomme', takeRandom(orchard, rng));
  if (mariusSpot) add('perle', takeRandom(beach, rng));
  return spots;
}

/** Respawns the pickups when a new day has started. */
export function refreshForage(state: GameState, candidates: ForageCandidates): GameState {
  if (state.forageDay === state.day) return state;
  const next = structuredClone(state);
  next.forage = spawnForage(state.day, candidates, state.perks.includes('marius-copain'));
  next.forageDay = state.day;
  return next;
}

export type CollectResult = { ok: true; state: GameState; item: ForageId } | { ok: false; reason: 'missing' | 'full' };

export function collect(state: GameState, spotId: string): CollectResult {
  const spot = state.forage.find((s) => s.id === spotId);
  if (!spot) return { ok: false, reason: 'missing' };
  if (state.pocket[spot.item] >= STACK_MAX) return { ok: false, reason: 'full' };
  const next = structuredClone(state);
  next.forage = next.forage.filter((s) => s.id !== spotId);
  next.pocket[spot.item] += 1;
  return { ok: true, state: next, item: spot.item };
}

export function pocketCount(state: GameState): number {
  return FORAGE_IDS.reduce((n, id) => n + state.pocket[id], 0);
}

export function pocketText(state: GameState): string {
  return FORAGE_IDS.filter((id) => state.pocket[id] > 0)
    .map((id) => `${FORAGE[id].icon}×${state.pocket[id]}`)
    .join(' ');
}

// ---------- Selling the harvest to Gaston (haggling in reverse) ----------

export interface Sale {
  /** What Gaston currently offers. */
  offer: number;
  /** The most he will ever pay. Hidden from the player. */
  ceiling: number;
  round: number;
  flattered: boolean;
}

const TIER_BUYBACK: Record<string, number> = {
  'Ennemi juré': 0.6,
  Rancunier: 0.8,
  Voisin: 1,
  Copain: 1.05,
  Confident: 1.12,
};

const SALE_ROUNDS = 4;
export const COPAIN_SALE_BONUS = 1.2;

export function harvestValue(state: GameState): number {
  const base = FORAGE_IDS.reduce((sum, id) => sum + state.pocket[id] * FORAGE[id].value, 0);
  const tier = TIER_BUYBACK[tierOf(state.npcs.gaston.relation).label] ?? 1;
  const perk = state.perks.includes('gaston-copain') ? COPAIN_SALE_BONUS : 1;
  return Math.round(base * tier * perk);
}

export function startSale(state: GameState): Sale | null {
  const value = harvestValue(state);
  if (value <= 0) return null;
  return { offer: Math.round(value * 0.6), ceiling: value, round: 0, flattered: false };
}

const SALE_LINES = {
  accept: ['Tope là ! Tu me ruines, mais tope là.', 'Marché conclu. Ne dis à personne que j\u2019ai payé ce prix-là.'],
  counter: ['{offer}, mon ami. C\u2019est du coquillage, pas de l\u2019or.', 'Allez, {offer}. Et je te fais une fleur, là.'],
  offended: ['Tu me prends pour une banque ?! Pour la peine, c\u2019est {offer}.', 'Ha ! Même la mer ne vend pas aussi cher. {offer}, et estime-toi heureux.'],
  final: ['Dernière offre : {offer}. Après, je vais pêcher moi-même. Enfin… non.'],
  flattery: ['Ah, tu sais parler aux grands commerçants… Bon, {offer}, pour toi.'],
};

function saleLine(kind: keyof typeof SALE_LINES, offer: number, seed: string): string {
  return pick(SALE_LINES[kind], hashString(seed)).replace('{offer}', String(offer));
}

/** Pure reverse haggling: the player names a price, Gaston moves up toward his hidden ceiling. */
export function haggleSale(sale: Sale, message: string): { sale: Sale; outcome: HaggleOutcome } {
  const next: Sale = { ...sale, round: sale.round + 1 };
  const ask = parseOffer(message);
  if (ask === null) {
    if (classifyMessage(message) === 'compliment' && !sale.flattered) {
      next.flattered = true;
      next.ceiling = Math.round(sale.ceiling * 1.1);
      next.offer = Math.round(sale.offer * 1.08);
      return { sale: next, outcome: { kind: 'counter', ask: next.offer, line: saleLine('flattery', next.offer, message) } };
    }
    return { sale: next, outcome: { kind: 'counter', ask: sale.offer, line: saleLine('counter', sale.offer, message) } };
  }
  if (ask <= sale.offer || (ask <= sale.ceiling && next.round >= SALE_ROUNDS)) {
    return { sale: next, outcome: { kind: 'accept', price: ask, line: saleLine('accept', ask, message) } };
  }
  if (ask > sale.ceiling * 1.6) {
    next.offer = Math.round(sale.offer * 0.95);
    return { sale: next, outcome: { kind: 'offended', ask: next.offer, line: saleLine('offended', next.offer, message) } };
  }
  const step = ask <= sale.ceiling ? 0.5 : 0.25;
  const target = Math.min(ask, sale.ceiling);
  next.offer = clamp(Math.round(sale.offer + (target - sale.offer) * step), sale.offer, sale.ceiling);
  if (next.round >= SALE_ROUNDS) return { sale: next, outcome: { kind: 'final', ask: next.offer, line: saleLine('final', next.offer, message) } };
  return { sale: next, outcome: { kind: 'counter', ask: next.offer, line: saleLine('counter', next.offer, message) } };
}

export function sellHarvest(state: GameState, price: number): GameState {
  const next = structuredClone(state);
  next.coins += price;
  for (const id of FORAGE_IDS) next.pocket[id] = 0;
  return next;
}
