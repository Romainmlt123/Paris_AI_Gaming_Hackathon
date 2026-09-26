import { CHARACTERS } from './characters';
import { isNaked } from './economy';
import { CONFRONT_SUGGESTIONS, openerLine } from './opener';
import { hashString, pick } from './rng';
import type { Emotion, GameState, NpcId, TalkResult } from './types';
import { NPC_IDS } from './types';
import { percentOf } from './violence';

/** Something about the player (or the NPC's own feelings) that makes an NPC walk up by itself. */
export type Trigger = 'nu' | 'rumeur' | 'colere' | 'ami' | 'fauche' | 'riche' | 'celebre' | 'immobile' | 'nuit';

export const IDLE_TRIGGER_SEC = 45;
const BROKE_COINS = 100;
const RICH_COINS = 2000;
const FAMOUS_VALUE = 200;

export interface Initiative {
  npc: NpcId;
  trigger: Trigger;
  /** Why the NPC comes, for the AI prompt. */
  reason: string;
  fallback: TalkResult;
}

interface Rule {
  trigger: Trigger;
  npc: NpcId;
  priority: number;
  when: (state: GameState, idleSec: number) => boolean;
  reason: (state: GameState) => string;
  emotion: Emotion;
  lines: (state: GameState) => readonly string[];
  suggestions: readonly string[];
}

const isNight = (state: GameState): boolean => state.clock >= 21 * 60 || state.clock < 5 * 60;
const pct = (state: GameState, npc: NpcId): number => percentOf(state.npcs[npc].relation);

const NAKED_SUGGESTIONS = ['I got shipwrecked…', 'Stop staring!', 'Got any spare pants?'];

const RULES: readonly Rule[] = [
  {
    trigger: 'nu', npc: 'josette', priority: 100, emotion: 'surprise',
    when: (s) => isNaked(s),
    reason: () => 'A stranger just washed up on the island, COMPLETELY NAKED. You rush over, shocked and delighted: it\u2019s the gossip of the century. You ask a thousand questions.',
    lines: () => [
      'Sweetie! Wait wait wait… Are you STARK NAKED?! No WAY! Where did you come from like that, hmm?',
      'Oh my days! A castaway! And naked too! I\u2019m just saying, I have to tell Marius. Right now!',
    ],
    suggestions: NAKED_SUGGESTIONS,
  },
  {
    trigger: 'nu', npc: 'gaston', priority: 90, emotion: 'joie',
    when: (s) => isNaked(s),
    reason: () => 'The newcomer is walking around naked. You smell a deal: you want to sell them overpriced clothes (they can buy some by talking to you).',
    lines: () => [
      'Whoa there! Naked on MY island? My friend, I\u2019ve got exactly what you need: a pair of pants, nearly new. Nearly.',
      'Oh dear… Well, between us, I sell clothes. Not cheap, mind. But modesty is priceless. Well, no: it\u2019s my price.',
    ],
    suggestions: ['How much for clothes?', 'Can I pay later?', 'I\u2019m fine like this'],
  },
  {
    trigger: 'nu', npc: 'marius', priority: 60, emotion: 'amuse',
    when: (s, idle) => isNaked(s) && idle >= 10,
    reason: () => 'The castaway is still wandering around naked. You come and talk calmly, with a sea metaphor about nudity, a little mocking.',
    lines: () => ['… Hmmph. The sea wears nothing either. But she carries herself with dignity, lad.', '… Hmmph… Even octopuses are more modest than you. And they\u2019ve got eight arms.'],
    suggestions: NAKED_SUGGESTIONS,
  },
  ...NPC_IDS.map((npc): Rule => ({
    trigger: 'rumeur', npc, priority: 80, emotion: 'mefiance',
    when: (s) => s.npcs[npc].intent !== null,
    reason: (s) => `You come to see the player on your own about this: ${s.npcs[npc].intent ?? ''}`,
    lines: (s) => [openerLine(s, npc)],
    suggestions: CONFRONT_SUGGESTIONS,
  })),
  ...NPC_IDS.map((npc): Rule => ({
    trigger: 'colere', npc, priority: 70, emotion: 'colere',
    when: (s) => pct(s, npc) <= 25,
    reason: () => 'You\u2019re seething with resentment against the player. You come to give them a piece of your mind and threaten them.',
    lines: () => [ANGRY[npc]],
    suggestions: ['Calm down, let\u2019s talk', 'I\u2019m truly sorry…', 'Come on then, let\u2019s settle this!'],
  })),
  ...NPC_IDS.map((npc): Rule => ({
    trigger: 'ami', npc, priority: 40, emotion: 'joie',
    when: (s) => pct(s, npc) >= 75,
    reason: () => 'You adore the player. You come to share a secret, a little gift, or an exclusive piece of gossip.',
    lines: () => [FRIENDLY[npc]],
    suggestions: ['Tell me!', 'You\u2019re a true friend', 'A gift? For me?'],
  })),
  {
    trigger: 'fauche', npc: 'gaston', priority: 50, emotion: 'amuse',
    when: (s) => s.coins < BROKE_COINS,
    reason: (s) => `The player is broke (${s.coins} coins). You come to offer a loan at loan-shark rates or a humiliating little job.`,
    lines: () => ['My friend, I can hear your wallet crying from here. A little loan? Barely 40% interest. Per day. Heh heh.'],
    suggestions: ['40%?! You\u2019re insane', 'What kind of job?', 'I\u2019d rather die'],
  },
  {
    trigger: 'fauche', npc: 'josette', priority: 45, emotion: 'tristesse',
    when: (s) => s.coins < BROKE_COINS && s.npcs.josette.relation >= 0,
    reason: () => 'The player is flat broke. You bring them yesterday\u2019s loaf, with tenderness and lots of questions.',
    lines: () => ['Sweetie… I heard you\u2019re flat broke. Here, yesterday\u2019s loaf. Shh, I won\u2019t tell a soul. Well, hardly anyone.'],
    suggestions: ['Thanks Josette…', 'Who told you that?', 'I don\u2019t need pity'],
  },
  {
    trigger: 'riche', npc: 'gaston', priority: 55, emotion: 'joie',
    when: (s) => s.coins >= RICH_COINS,
    reason: (s) => `The player has ${s.coins} coins. You smell money and come to sell them anything at all.`,
    lines: () => ['Look look look! Who\u2019s shining like a gold bar? My best customer! I\u2019ve got a statue of me for you.'],
    suggestions: ['Show me', 'I\u2019m keeping my money', 'A statue of YOU?'],
  },
  {
    trigger: 'celebre', npc: 'josette', priority: 45, emotion: 'joie',
    when: (s) => s.islandValue >= FAMOUS_VALUE,
    reason: (s) => `The island has become gorgeous thanks to the player (value ${s.islandValue}). Everyone\u2019s talking about it; you come to congratulate them and gossip.`,
    lines: () => ['Sweetie! The whole island is talking about you and your decorations! Well… mostly me. But I talk a lot!'],
    suggestions: ['Thanks, you\u2019re a doll', 'Who\u2019s badmouthing me?', 'It cost me a fortune'],
  },
  {
    trigger: 'immobile', npc: 'marius', priority: 30, emotion: 'neutre',
    when: (_s, idle) => idle >= IDLE_TRIGGER_SEC,
    reason: () => 'The player has been standing still for a while. You come to check they\u2019re okay, in your slow philosophical way.',
    lines: () => ['… You\u2019ve stopped moving, lad. Good. The fish waits too. What are you waiting for?'],
    suggestions: ['I\u2019m thinking', 'I\u2019m a bit bored', 'Leave me alone'],
  },
  {
    trigger: 'immobile', npc: 'josette', priority: 25, emotion: 'surprise',
    when: (s, idle) => idle >= IDLE_TRIGGER_SEC && s.npcs.josette.relation >= -15,
    reason: () => 'The player hasn\u2019t moved in a while. You\u2019re worried (and you want to know why, so you can tell everyone).',
    lines: () => ['Yoo-hoo? Sweetie? You\u2019re frozen stiff! Did you see a ghost or what? Tell me!'],
    suggestions: ['I was daydreaming', 'Are you spying on me?', 'What\u2019s new?'],
  },
  {
    trigger: 'nuit', npc: 'marius', priority: 35, emotion: 'neutre',
    when: (s) => isNight(s) && s.npcs.marius.relation >= -15,
    reason: () => 'It\u2019s night, the island is asleep. You come to share a quiet moment under the stars and some dubious fishing advice.',
    lines: () => ['… At night, the fish dream. So do I. Want to know about what? No? Suit yourself.'],
    suggestions: ['Tell me', 'It\u2019s late, Marius', 'Any fishing tips?'],
  },
];

const ANGRY: Record<NpcId, string> = {
  gaston: 'You! Yes, you. You owe me respect, and money. Keep this up and I\u2019ll sell you to the next boat, you clown.',
  josette: 'You… I\u2019ve got my eye on you. The whole island knows what you did. So does my rolling pin.',
  marius: '… See that sea? It\u2019s calm. I\u2019m not. Watch yourself, lad.',
};

const FRIENDLY: Record<NpcId, string> = {
  gaston: 'My friend! Between us… I put a little something aside for you. Friend price. Well, Gaston price, but for a friend.',
  josette: 'Sweetie! Come come come, I\u2019ve got some hot gossip. Just for you. You won\u2019t repeat it, will you?',
  marius: '… Here. I saved you the prettiest shell on the pier. Shh. Not even Josette knows.',
};

const key = (npc: NpcId, trigger: Trigger): string => `${npc}:${trigger}`;

/** Highest-priority NPC initiative that can fire now, skipping NPCs in `blocked` and triggers already used today. */
export function pickInitiative(state: GameState, idleSec: number, blocked: ReadonlySet<NpcId>): Initiative | null {
  const rule = RULES.filter((r) => !blocked.has(r.npc) && state.initiatives[key(r.npc, r.trigger)] !== state.day && r.when(state, idleSec))
    .sort((a, b) => b.priority - a.priority)[0];
  if (!rule) return null;
  const seed = hashString(`${state.day}:${state.clock}:${rule.npc}:${rule.trigger}`);
  return {
    npc: rule.npc,
    trigger: rule.trigger,
    reason: rule.reason(state),
    fallback: {
      reply: pick(rule.lines(state), seed),
      emotion: rule.emotion,
      relationDelta: 0,
      reason: '',
      events: [],
      intent: null,
      suggestions: [...rule.suggestions],
      source: 'fallback',
    },
  };
}

export function markInitiative(state: GameState, npc: NpcId, trigger: Trigger): GameState {
  return { ...state, initiatives: { ...state.initiatives, [key(npc, trigger)]: state.day } };
}

export function comingToast(npc: NpcId): string {
  return `${CHARACTERS[npc].name} is coming over…`;
}
