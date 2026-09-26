import { CHARACTERS } from './characters';
import { classifyMessage } from './fallback';
import { latestBadRumor } from './opener';
import { bondKey, clamp } from './relations';
import { factById } from './rumors';
import { hearsayDelta } from './simulate';
import type { ContestVerdict, GameState, NpcId } from './types';

/** From this many retellings on, a rumor is exaggerated enough to be contested successfully. */
export const CONTEST_DISTORTION = 2;
const REJECTED_DELTA = -8;
const UPHELD_BONUS = 4;
const BOND_PENALTY = 10;

/** Decides, in code, whether the player's "c'est exagéré !" holds against the rumor this NPC confronts them with (see `openerLine`). */
export function judgeContest(state: GameState, npc: NpcId, message: string): ContestVerdict | null {
  if (classifyMessage(message) !== 'contest') return null;
  const rumor = latestBadRumor(state, npc, true) ?? latestBadRumor(state, npc, false);
  const fact = rumor ? factById(state, rumor.factId) : undefined;
  if (!rumor || fact?.actor !== 'player') return null;
  return {
    upheld: rumor.distortion >= CONTEST_DISTORTION,
    factId: fact.id,
    rumor: rumor.text,
    truth: fact.text,
    source: rumor.source,
  };
}

/**
 * Upheld: the NPC's version is corrected, the exaggeration's relation hit is refunded (plus a bonus)
 * and the NPC trusts whoever told them a bit less. Rejected: minimizing the truth costs relation.
 */
export function applyVerdict(state: GameState, npc: NpcId, verdict: ContestVerdict): { state: GameState; delta: number; reason: string } {
  const next = structuredClone(state);
  const rumor = next.rumors.find((r) => r.holder === npc && r.factId === verdict.factId);
  const fact = factById(next, verdict.factId);
  if (!verdict.upheld || !rumor || !fact) {
    return { state: next, delta: REJECTED_DELTA, reason: 'Tu minimises, mais c\u2019est exactement ce qui s\u2019est passé' };
  }
  const refund = Math.abs(hearsayDelta(fact.severity, rumor.distortion) - hearsayDelta(fact.severity, 0));
  rumor.text = fact.text;
  rumor.distortion = 0;
  let reason = 'Tu as rétabli la vérité';
  if (verdict.source !== 'vu') {
    const key = bondKey(npc, verdict.source);
    next.bonds[key] = clamp((next.bonds[key] ?? 0) - BOND_PENALTY, 0, 100);
    reason = `Tu as prouvé que ${CHARACTERS[verdict.source].name} avait exagéré`;
  }
  return { state: next, delta: refund + UPHELD_BONUS, reason };
}
