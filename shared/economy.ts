import { classifyMessage } from './fallback';
import { applyRelationDelta, clamp, tierOf } from './relations';
import { pick, hashString } from './rng';
import type { DecoId, GameState, NpcId, RelationChange, SlotId } from './types';

export interface Deco {
  id: DecoId;
  name: string;
  price: number;
  /** Prestige points added to the island value once placed. */
  prestige: number;
  garish: boolean;
}

export const CATALOG: Record<DecoId, Deco> = {
  parterre: { id: 'parterre', name: 'Parterre d\u2019œillets', price: 120, prestige: 30, garish: false },
  banc: { id: 'banc', name: 'Banc en bois flotté', price: 220, prestige: 45, garish: false },
  lampadaire: { id: 'lampadaire', name: 'Lampadaire rétro', price: 380, prestige: 80, garish: false },
  fontaine: { id: 'fontaine', name: 'Fontaine sculptée', price: 900, prestige: 220, garish: false },
  statue: { id: 'statue', name: 'Statue dorée de Gaston', price: 1100, prestige: 260, garish: true },
};

export const SLOTS: readonly { id: SlotId; name: string; x: number; z: number }[] = [
  { id: 'placette', name: 'Placette', x: 13.5, z: 19.5 },
  { id: 'falaise', name: 'Bord de falaise', x: 8, z: 10 },
  { id: 'ponton', name: 'Entrée du ponton', x: 16, z: 24 },
  { id: 'mairie', name: 'Jardin de la mairie', x: 14.5, z: 9 },
  { id: 'boulangerie', name: 'Devant la boulangerie', x: 8, z: 18.5 },
];

export function islandValue(state: GameState): number {
  let total = 0;
  for (const deco of Object.values(state.decor)) if (deco) total += CATALOG[deco].prestige;
  return total;
}

// ---------- Haggling with Gaston ----------

export interface Deal {
  item: DecoId;
  ask: number;
  floor: number;
  round: number;
  flattered: boolean;
}

export type HaggleOutcome =
  | { kind: 'accept'; price: number; line: string }
  | { kind: 'counter'; ask: number; line: string }
  | { kind: 'offended'; ask: number; line: string }
  | { kind: 'final'; ask: number; line: string };

const TIER_MARKUP: Record<string, number> = {
  'Ennemi juré': 1.6,
  Rancunier: 1.3,
  Voisin: 1,
  Copain: 0.92,
  Confident: 0.82,
};

const MAX_ROUNDS = 4;

export function startDeal(state: GameState, item: DecoId): Deal {
  const markup = TIER_MARKUP[tierOf(state.npcs.gaston.relation).label] ?? 1;
  const ask = Math.round(CATALOG[item].price * markup * 1.15);
  return { item, ask, floor: Math.round(ask * 0.72), round: 0, flattered: false };
}

/** First integer in the message, if any ("je t'en donne 600" → 600). */
export function parseOffer(message: string): number | null {
  const match = message.replace(/\s(?=\d{3}\b)/g, '').match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const LINES = {
  accept: ['Tope là, mon ami ! Tu fais une affaire… enfin, surtout moi.', 'Vendu ! Ne le dis à personne, j\u2019ai une réputation.'],
  counter: ['Allons, allons… {ask} pièces, et c\u2019est parce que je t\u2019aime bien.', 'Tu veux ma ruine ? {ask}, pas une de moins… enfin presque.'],
  offended: ['Pardon ?! Tu me prends pour un bienfaiteur ? Maintenant c\u2019est {ask}.', 'Ha ! Même Marius n\u2019oserait pas. {ask}, et estime-toi heureux.'],
  final: ['Dernier prix, mon ami : {ask}. Après, je ferme boutique.'],
  flattery: ['Ah… tu sais parler aux artistes du commerce. Bon, {ask}, pour toi.'],
};

function line(kind: keyof typeof LINES, ask: number, seed: string): string {
  return pick(LINES[kind], hashString(seed)).replace('{ask}', String(ask));
}

/** Pure haggling rules. Flattery lowers the floor once; lowballing offends and raises the ask. */
export function haggle(deal: Deal, message: string): { deal: Deal; outcome: HaggleOutcome } {
  const next: Deal = { ...deal, round: deal.round + 1 };
  const offer = parseOffer(message);
  if (offer === null) {
    if (classifyMessage(message) === 'compliment' && !deal.flattered) {
      next.flattered = true;
      next.floor = Math.round(deal.floor * 0.9);
      next.ask = Math.round(deal.ask * 0.93);
      return { deal: next, outcome: { kind: 'counter', ask: next.ask, line: line('flattery', next.ask, message) } };
    }
    return { deal: next, outcome: { kind: 'counter', ask: deal.ask, line: line('counter', deal.ask, message) } };
  }
  if (offer >= deal.ask || (offer >= deal.floor && next.round >= MAX_ROUNDS)) {
    return { deal: next, outcome: { kind: 'accept', price: Math.min(offer, deal.ask), line: line('accept', offer, message) } };
  }
  if (offer < deal.floor * 0.6) {
    next.ask = Math.round(deal.ask * 1.05);
    return { deal: next, outcome: { kind: 'offended', ask: next.ask, line: line('offended', next.ask, message) } };
  }
  const step = offer >= deal.floor ? 0.5 : 0.25;
  next.ask = Math.max(deal.floor, Math.round(deal.ask - (deal.ask - Math.max(offer, deal.floor)) * step));
  if (next.round >= MAX_ROUNDS) return { deal: next, outcome: { kind: 'final', ask: next.ask, line: line('final', next.ask, message) } };
  return { deal: next, outcome: { kind: 'counter', ask: next.ask, line: line('counter', next.ask, message) } };
}

export function buy(state: GameState, item: DecoId, price: number): GameState | null {
  if (state.coins < price) return null;
  const next = structuredClone(state);
  next.coins -= price;
  next.inventory = [...next.inventory, item];
  return next;
}

// ---------- Placing decorations ----------

export interface DecoReaction {
  npc: NpcId;
  line: string;
  delta: number;
}

export function decoReactions(deco: Deco): DecoReaction[] {
  const gaston: DecoReaction =
    deco.price >= 800
      ? { npc: 'gaston', line: 'Ça, c\u2019est de la classe ! On voit que ça coûte.', delta: 5 }
      : { npc: 'gaston', line: 'Mouais. Ça fait un peu… économique.', delta: 0 };
  const josette: DecoReaction = deco.garish
    ? { npc: 'josette', line: 'Entre nous, mon chou… ça gâche un peu la vue.', delta: -3 }
    : { npc: 'josette', line: 'Oh que c\u2019est mignon ! Je vais le dire à tout le monde !', delta: 3 };
  return [gaston, josette];
}

export function placeDeco(
  state: GameState,
  slot: SlotId,
  item: DecoId,
): { state: GameState; reactions: DecoReaction[]; changes: RelationChange[] } | null {
  const index = state.inventory.indexOf(item);
  if (index < 0) return null;
  let next = structuredClone(state);
  const previous = next.decor[slot];
  next.inventory.splice(index, 1);
  if (previous) next.inventory.push(previous);
  next.decor[slot] = item;
  next.islandValue = islandValue(next);
  const deco = CATALOG[item];
  const reactions = decoReactions(deco);
  const changes: RelationChange[] = [];
  for (const r of reactions) {
    if (r.delta === 0) continue;
    const applied = applyRelationDelta(next, r.npc, clamp(r.delta, -5, 5), `${deco.name} sur l\u2019île`);
    next = applied.state;
    if (applied.change) changes.push(applied.change);
  }
  return { state: next, reactions, changes };
}
