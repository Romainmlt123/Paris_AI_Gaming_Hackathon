import type { BondKey, GameState, NpcId, RelationChange } from '../state/types.ts';

export const RELATION_MIN = -100;
export const RELATION_MAX = 100;
export const MAX_TALK_DELTA = 12;

export interface Tier {
  min: number;
  name: string;
  perk: string;
}
/** Paliers nommés, du pire au meilleur. */
export const TIERS: Tier[] = [
  { min: -100, name: 'Ennemi juré', perk: 'Refuse de te parler plus de deux phrases' },
  { min: -50, name: 'Rancunier', perk: 'Prix gonflés de 30 %' },
  { min: -15, name: 'Méfiant', perk: 'Ne te confie rien' },
  { min: 15, name: 'Voisin', perk: 'Prix normaux' },
  { min: 40, name: 'Ami', perk: 'Remise de 15 %, confidences' },
  { min: 70, name: 'Confident', perk: 'Secrets et objets rares' },
];

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function tierOf(relation: number): Tier {
  let current = TIERS[0];
  for (const t of TIERS) if (relation >= t.min) current = t;
  if (!current) throw new Error('Paliers vides');
  return current;
}

export function bondKey(a: NpcId, b: NpcId): BondKey {
  return (a < b ? `${a}|${b}` : `${b}|${a}`) as BondKey;
}

export function getBond(state: GameState, a: NpcId, b: NpcId): number {
  return state.bonds[bondKey(a, b)] ?? 0;
}

/** Modifie la relation d'un habitant envers le joueur (mutation d'un brouillon). */
export function applyRelation(draft: GameState, npc: NpcId, delta: number, reason: string, now: number): RelationChange | null {
  const rounded = Math.round(delta);
  if (rounded === 0) return null;
  const st = draft.npcs[npc];
  const before = st.relation;
  st.relation = clamp(before + rounded, RELATION_MIN, RELATION_MAX);
  const applied = st.relation - before;
  if (applied === 0) return null;
  const change: RelationChange = { npc, delta: applied, reason, day: draft.day, at: now };
  draft.relationLog.push(change);
  if (draft.relationLog.length > 60) draft.relationLog.splice(0, draft.relationLog.length - 60);
  return change;
}

export function priceFactor(relation: number): number {
  if (relation < -50) return 1.3;
  if (relation < -15) return 1.12;
  if (relation >= 70) return 0.8;
  if (relation >= 40) return 0.85;
  return 1;
}
