import { RELATION_TIERS, type RelationTier } from '../data/npcs';
import type { BondKey, GameState, NpcId, RelationChange } from '../state/types';

export const RELATION_MIN = -100;
export const RELATION_MAX = 100;
export const MAX_DELTA_PER_TALK = 15;
export const RELATION_LOG_MAX = 50;

export function clampRelation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(RELATION_MIN, Math.min(RELATION_MAX, Math.round(value)));
}

export function bondKey(a: NpcId, b: NpcId): BondKey {
  return (a < b ? `${a}|${b}` : `${b}|${a}`) as BondKey;
}

/** Lien entre deux habitants (0 si la paire est inconnue ou identique). */
export function getBond(state: GameState, a: NpcId, b: NpcId): number {
  if (a === b) return 0;
  return state.bonds[bondKey(a, b)] ?? 0;
}

export function setBond(state: GameState, a: NpcId, b: NpcId, value: number): GameState {
  if (a === b) return state;
  return { ...state, bonds: { ...state.bonds, [bondKey(a, b)]: clampRelation(value) } };
}

export function tierOf(relation: number): RelationTier {
  const r = clampRelation(relation);
  let found = RELATION_TIERS[0];
  for (const t of RELATION_TIERS) if (r >= t.min) found = t;
  if (!found) throw new Error('RELATION_TIERS est vide');
  return found;
}

/** Ce que le palier débloque concrètement chez cet habitant, en une phrase lisible (UI + prompt). */
export function perkText(npc: NpcId, relation: number): string {
  const t = tierOf(relation);
  if (npc === 'gaston') {
    if (t.gastonDiscount > 0) return `Remise de ${t.gastonDiscount} % chez Gaston`;
    if (t.gastonDiscount < 0) return `Gaston majore ses prix de ${-t.gastonDiscount} %`;
    return 'Prix normaux chez Gaston';
  }
  if (npc === 'josette') return t.josetteGossip ? 'Josette te confie ses ragots exclusifs' : 'Josette garde ses meilleurs ragots pour elle';
  return t.mariusSecret ? 'Marius est prêt à te confier son secret' : 'Marius garde son secret';
}

/**
 * Applique une variation bornée (|delta| ≤ cap) et renvoie aussi l'entrée journalisée
 * (null si rien n'a changé).
 */
export function relationChange(
  state: GameState, npc: NpcId, delta: number, reason: string, now: number, cap = MAX_DELTA_PER_TALK,
): { state: GameState; change: RelationChange | null } {
  const bounded = Number.isFinite(delta) ? Math.max(-cap, Math.min(cap, Math.round(delta))) : 0;
  const before = state.npcs[npc].relation;
  const after = clampRelation(before + bounded);
  const applied = after - before;
  if (applied === 0) return { state, change: null };
  const change: RelationChange = { npc, delta: applied, reason, day: state.day, at: now };
  const relationLog = [...state.relationLog, change].slice(-RELATION_LOG_MAX);
  return {
    state: { ...state, npcs: { ...state.npcs, [npc]: { ...state.npcs[npc], relation: after } }, relationLog },
    change,
  };
}

export function applyRelationDelta(
  state: GameState, npc: NpcId, delta: number, reason: string, now: number, cap = MAX_DELTA_PER_TALK,
): GameState {
  return relationChange(state, npc, delta, reason, now, cap).state;
}
