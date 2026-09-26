import { CHARACTERS } from './characters';
import { factById } from './rumors';
import type { GameState, NpcId } from './types';

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

const MURDER_OPENERS: Record<NpcId, (killer: string) => string> = {
  josette: (k) => `Mon chou ?! T\u2019es vivant ?! On m\u2019a dit que ${k} t\u2019avait refroidi ! Raconte, RACONTE !`,
  marius: (k) => `… On raconte que ${k} t\u2019a envoyé par le fond. Et pourtant te voilà. La mer rend parfois ce qu\u2019elle prend.`,
  gaston: (k) => `Mon ami ! Mort hier, vivant aujourd\u2019hui ? ${k}, un assassin… Mauvais pour les affaires. Excellent pour les ragots.`,
};

/** First line an NPC says when they come to the player on their own (after the absence recap). */
export function openerLine(state: GameState, npc: NpcId): string {
  const murder = [...state.facts].reverse().find((f) => f.actor !== 'player' && f.actor !== npc && f.severity <= -3 && f.day >= state.day - 1);
  if (murder && murder.actor !== 'player') return MURDER_OPENERS[npc](CHARACTERS[murder.actor].name);
  const rumor = [...state.rumors]
    .reverse()
    .find((r) => r.holder === npc && r.source !== 'vu' && (factById(state, r.factId)?.severity ?? 0) < 0);
  return OPENERS[npc](rumor?.text ?? null);
}

export const CONFRONT_SUGGESTIONS = ['C\u2019est faux, j\u2019ai jamais dit ça !', 'Pardon, j\u2019ai été nul…', 'Et alors ?'];
