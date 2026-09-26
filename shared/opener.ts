import { factById } from './rumors';
import type { GameState, NpcId, Rumor } from './types';

const OPENERS: Record<NpcId, (rumor: string | null) => string> = {
  josette: (r) =>
    r
      ? `Mon chou ! Viens là. On m\u2019a raconté que… « ${r} ». C\u2019est vrai, ça ?!`
      : 'Mon chou ! Viens vite, j\u2019ai des nouvelles toutes chaudes. Enfin… toi d\u2019abord.',
  marius: (r) =>
    r ? `… La mer rapporte tout, tu sais. Même ça : « ${r} ». Pourquoi ?` : '… Assieds-toi. La mer a des choses à te dire. Moi aussi.',
  gaston: (r) =>
    r
      ? `Mon ami ! Il paraît que « ${r} ». Mauvais pour les affaires, ça. Explique-toi.`
      : 'Mon ami ! J\u2019ai une affaire pour toi. Rien que pour toi. Enfin, pour ton porte-monnaie.',
};

/** First line an NPC says when they come to the player on their own (after the absence recap). */
export function openerLine(state: GameState, npc: NpcId): string {
  return OPENERS[npc](latestBadRumor(state, npc, true)?.text ?? null);
}

/** Latest negative rumor this NPC holds; the one they confront the player with. */
export function latestBadRumor(state: GameState, npc: NpcId, hearsayOnly: boolean): Rumor | undefined {
  return [...state.rumors]
    .reverse()
    .find((r) => r.holder === npc && (!hearsayOnly || r.source !== 'vu') && (factById(state, r.factId)?.severity ?? 0) < 0);
}

export const CONFRONT_SUGGESTIONS = ['C\u2019est faux, j\u2019ai jamais dit ça !', 'C\u2019est exagéré, ça !', 'Pardon, j\u2019ai été nul…'];
