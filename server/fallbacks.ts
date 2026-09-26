// Répliques de secours quand l'IA échoue ou traîne : crédibles, en personnage, sans effet de jeu.
import { CHARACTERS } from './prompts/characters.ts';
import type { FallbackSituation } from './prompts/characters.ts';
import type { Emotion, TalkRequest, TalkResponse } from '../src/state/types.ts';

function pickSituation(req: TalkRequest): FallbackSituation {
  const ctx = req.context;
  if (ctx.intent?.kind === 'confront') return 'confront';
  if (ctx.intent?.kind === 'gossip') return 'gossip';
  if (req.offeredItemId) return 'cadeau';
  if (ctx.playerStung) return 'pique';
  if (ctx.relation <= -20 || ctx.mood === 'colere') return 'fache';
  if (ctx.relation >= 40) return 'ami';
  return 'accueil';
}

const EMOTION_BY_SITUATION: Record<FallbackSituation, Emotion> = {
  accueil: 'neutre',
  ami: 'joie',
  fache: 'mefiance',
  confront: 'colere',
  gossip: 'surprise',
  cadeau: 'joie',
  pique: 'moquerie',
};

const SUGGESTIONS: Record<FallbackSituation, [string, string, string]> = {
  accueil: ['Salut ! Ça va, toi ?', 'T\'as pas mieux à faire ?', 'Quoi de neuf, vieille branche ?'],
  ami: ['Toujours un plaisir !', 'Tu me dois un service…', 'On se fait une bouffe ?'],
  fache: ['Pardon, j\'ai été nul.', 'Tu boudes encore ?', 'On fait la paix ? J\'ai des cookies.'],
  confront: ['Je vais tout t\'expliquer…', 'Je vois pas de quoi tu parles.', 'C\'est pas moi, c\'est la mouette !'],
  gossip: ['Raconte-moi tout !', 'Encore un ragot ? Bof.', 'J\'ai apporté du pop-corn !'],
  cadeau: ['C\'est de bon cœur !', 'Tu me dois une faveur, là.', 'Ne le mange pas d\'un coup !'],
  pique: ['Aïe… ça gratte.', 'Toi, t\'as vu ta tête ?', 'C\'est la nouvelle mode !'],
};

export function fallbackTalk(req: TalkRequest): TalkResponse {
  const situation = pickSituation(req);
  const lines = CHARACTERS[req.npc].fallbacks[situation];
  // Déterministe mais varié : dépend de la longueur de l'historique.
  const reply = lines[req.history.length % lines.length] ?? lines[0];
  return {
    reply,
    emotion: EMOTION_BY_SITUATION[situation],
    events: [],
    relationDelta: 0,
    reason: '',
    intent: null,
    suggestions: [...SUGGESTIONS[situation]],
    deal: null,
    fallback: true,
  };
}
