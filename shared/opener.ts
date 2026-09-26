import { CHARACTERS } from './characters';
import { factById } from './rumors';
import type { GameState, NpcId } from './types';

const OPENERS: Record<NpcId, (rumor: string | null) => string> = {
  josette: (r) =>
    r
      ? `Sweetie! Come here. Someone told me that… "${r}". Is that TRUE?!`
      : 'Sweetie! Quick, come here, I\u2019ve got piping hot news. Well… you first.',
  marius: (r) =>
    r ? `… The sea brings everything back, you know. Even this: "${r}". Why?` : '… Sit down. The sea has things to tell you. So do I.',
  gaston: (r) =>
    r
      ? `My friend! Word is "${r}". Bad for business, that. Explain yourself.`
      : 'My friend! I\u2019ve got a deal for you. Just for you. Well, for your wallet.',
};

const MURDER_OPENERS: Record<NpcId, (killer: string) => string> = {
  josette: (k) => `Sweetie?! You\u2019re ALIVE?! They told me ${k} did you in! Tell me, TELL ME!`,
  marius: (k) => `… They say ${k} sent you to the bottom. And yet here you are. Sometimes the sea gives back what it takes.`,
  gaston: (k) => `My friend! Dead yesterday, alive today? ${k}, a murderer… Bad for business. Excellent for gossip.`,
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

export const CONFRONT_SUGGESTIONS = ['That\u2019s a lie, I never said that!', 'Sorry, I was awful…', 'So what?'];
