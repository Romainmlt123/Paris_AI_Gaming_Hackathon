import type { GameState, NpcId, RelationChange } from './types';

export const RELATION_MIN = -100;
export const RELATION_MAX = 100;

export interface Tier {
  min: number;
  label: string;
  perk: string;
}

/** Ordered from lowest to highest. */
export const TIERS: readonly Tier[] = [
  { min: -100, label: 'Ennemi juré', perk: 'Te claque la porte au nez' },
  { min: -50, label: 'Rancunier', perk: 'Prix gonflés, répond sèchement' },
  { min: -15, label: 'Voisin', perk: 'Politesse de base' },
  { min: 15, label: 'Copain', perk: 'Petites remises, confidences' },
  { min: 50, label: 'Confident', perk: 'Secrets, objets rares, gros rabais' },
];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function tierOf(relation: number): Tier {
  let current = TIERS[0];
  for (const tier of TIERS) if (relation >= tier.min) current = tier;
  if (current === undefined) throw new Error('TIERS is empty');
  return current;
}

export function bondKey(a: NpcId, b: NpcId): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function bondOf(state: GameState, a: NpcId, b: NpcId): number {
  return state.bonds[bondKey(a, b)] ?? 0;
}

/** Applies a relation change and records it. Returns the new state and the effective change. */
export function applyRelationDelta(
  state: GameState,
  npc: NpcId,
  delta: number,
  reason: string,
): { state: GameState; change: RelationChange | null } {
  const next = structuredClone(state);
  const before = next.npcs[npc].relation;
  const after = clamp(Math.round(before + delta), RELATION_MIN, RELATION_MAX);
  if (after === before) return { state: next, change: null };
  next.npcs[npc].relation = after;
  const change: RelationChange = { npc, delta: after - before, reason, day: next.day };
  next.changes = [...next.changes, change].slice(-40);
  return { state: next, change };
}
