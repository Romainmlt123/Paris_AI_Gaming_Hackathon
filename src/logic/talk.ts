import type { GameState, NpcId, TalkResponse } from '../state/types';
import { applyRelationDelta } from './relations';
import { recordFact } from './rumors';

export const MEMORY_MAX = 8;

/**
 * Applique une TalkResponse DÉJÀ validée : faits (témoin = l'habitant), variation de relation,
 * humeur, souvenirs, intention (remplacée : parler consomme le « ! »). Le deal n'est pas appliqué ici
 * (il faut l'accord du joueur : economy.applyDeal).
 */
export function applyTalkResponse(state: GameState, npc: NpcId, resp: TalkResponse, now: number): GameState {
  let next = state;
  for (const ev of resp.events) {
    next = recordFact(next, { day: next.day, actor: 'player', target: npc, kind: ev.kind, text: ev.text, witnesses: [npc] });
  }
  if (resp.relationDelta !== 0) {
    next = applyRelationDelta(next, npc, resp.relationDelta, resp.reason || 'Conversation', now);
  }
  const self = next.npcs[npc];
  const memories = [...self.memories, ...resp.events.map((e) => e.text)].slice(-MEMORY_MAX);
  return {
    ...next,
    npcs: { ...next.npcs, [npc]: { ...self, mood: resp.emotion, memories, intent: resp.intent, lastTalkDay: next.day } },
  };
}
