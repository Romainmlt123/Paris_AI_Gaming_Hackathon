import { CHARACTERS } from './characters.js';
import { cleanName, playerLabel } from './player.js';
import { hashString, pick } from './rng.js';
import type { Emotion, NpcId, TalkContext, TalkResult } from './types.js';

export type Intent = 'insult' | 'denial' | 'compliment' | 'apology' | 'greeting' | 'neutral';

const PATTERNS: Record<Exclude<Intent, 'neutral'>, RegExp> = {
  insult:
    /\b(idiot|imbecile|moron|dumb|stupid|jerk|loser|ugly|stinks?|smelly|stinky|pathetic|useless|clown|cheapskate|cheap|crook|thief|old fart|lazy|fatso|shut up|get lost|piss off|scum|fool|dork|creep|incompetent|slowpoke|slow)\b/,
  denial:
    /(that'?s not true|not true|never said|i didn'?t (say|do)|nonsense|a lie|lies|lying|wasn'?t me|not me|no way|he'?s lying|she'?s lying|made (it|that) up|i never)/,
  apology: /\b(sorry|apologi[sz]e|apologies|forgive me|my bad|regret)\b/,
  compliment:
    /\b(thanks|thank you|great|awesome|amazing|beautiful|lovely|bravo|love|delicious|kind|nice|incredible|best|perfect|cool|talent(ed)?|clever|smart|genius|gifted|classy|brilliant|divine|eye for)\b/,
  greeting: /\b(hi|hello|hey|howdy|good morning|good evening|yo|hiya|greetings)\b/,
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’`]/g, "'");
}

export function classifyMessage(message: string): Intent {
  const text = normalize(message);
  for (const intent of ['insult', 'denial', 'apology', 'compliment', 'greeting'] as const) {
    if (PATTERNS[intent].test(text)) return intent;
  }
  return 'neutral';
}

type LineSet = Record<Intent | 'caught', readonly string[]>;

const LINES: Record<NpcId, LineSet> = {
  gaston: {
    insult: [
      'Excuse me?! Say that again… No, don\u2019t. Your prices just doubled, my friend.',
      'Whoa there. You know what an insult costs at Gaston\u2019s? A lot. A whole lot.',
    ],
    denial: ['Heh heh. Bluffing is my job, my friend. You\u2019re an amateur.'],
    caught: ['You can\u2019t fool me. I\u2019ve got ears everywhere. Especially over at the bakery.'],
    apology: ['An apology? That\u2019s free. I prefer things that cost money. But fine… accepted.'],
    compliment: [
      'Heh heh… flatterer. Doesn\u2019t work on me. Okay, a little. Two percent off, not a coin more.',
      'Finally someone who recognizes talent! Between you and me, you\u2019ve got a good eye.',
    ],
    greeting: [
      'Ah, a customer! Or a browser… I hope for your sake you\u2019re a customer.',
      'Welcome, welcome! Everything\u2019s for sale, even the smile. Especially the smile.',
    ],
    neutral: [
      'Everything has a price, my friend. Even advice. Especially advice.',
      'Mm-hmm. So, are you buying something or just sightseeing?',
      'Listen, between us… I\u2019ve got a golden deal for you. Well, gold-plated.',
    ],
  },
  josette: {
    insult: [
      'Oh! Well… I didn\u2019t expect that from you, sweetie. Everyone will be thrilled to hear about it, mark my words.',
      'Excuse me?! Wait wait wait… you said WHAT to me?',
    ],
    denial: ['Hmm. You\u2019d tell me if you\u2019d done something silly, right? Right?'],
    caught: [
      'Oh no no no, not with me! Marius told me EVERYTHING. And now you lie to my face? Bravo, really, bravo.',
      'Sweetie… I know everything. EVERYTHING. So save your "it wasn\u2019t me" for Gaston.',
    ],
    apology: ['Well… an apology is a start. But you\u2019ll go and see Marius, won\u2019t you? Promise?'],
    compliment: [
      'Oh stop, you\u2019ll make me blush! Here, keep this to yourself, but… Gaston rigs his scales.',
      'Oh aren\u2019t you a sweetheart! I\u2019ll tell everyone. Nice things, I mean! For once.',
    ],
    greeting: [
      'Oh hello sweetie! So, what\u2019s new? Tell me, tell me!',
      'There you are! Come come, I\u2019ve got warm croissants and even hotter news.',
    ],
    neutral: [
      'Mm-hmm. So, have you heard the latest? No? Me neither, that\u2019s why I\u2019m asking!',
      'Oh really? Interesting… very interesting. Noted. In my head, of course. Not in a notebook.',
    ],
  },
  marius: {
    insult: [
      '… Ah. Right. I\u2019ll go tell the fish about that. And Josette.',
      '… You know, lad, the sea forgets nothing. Neither do I.',
    ],
    denial: ['… Hmm. The fish that denies the hook still ends up in the bucket.'],
    caught: ['… I know what I heard. The waves don\u2019t lie.'],
    apology: ['… Mmh. The tide always comes back in. Fine. We\u2019ll see.'],
    compliment: [
      '… Mmh. Kind of you. Fish like being spoken to gently, too.',
      '… Thanks. Feels like a ray of sun on the water.',
    ],
    greeting: ['… Hello. The sea is calm. Like me. Usually.', '… Oh. You. Sit down if you like. Don\u2019t talk too loud.'],
    neutral: [
      '… You know, patience is like a fishing line: pull it too tight, it snaps.',
      '… Hmm. Bait with breadcrumbs at low tide. Trust me. Or don\u2019t.',
    ],
  },
};

const SUGGESTIONS: Record<NpcId, readonly string[]> = {
  gaston: ['Got a deal for me?', 'You\u2019ve got a nose for business!', 'Your prices are daylight robbery!'],
  josette: ['What\u2019s new on the island?', 'Your croissants are divine!', 'Can you keep a secret?'],
  marius: ['Any fishing tips?', 'Lovely day, huh?', 'Bit slow, aren\u2019t you?'],
};

export function defaultSuggestions(npc: NpcId): string[] {
  return [...SUGGESTIONS[npc]];
}

interface Outcome {
  line: keyof LineSet;
  emotion: Emotion;
  delta: number;
  reason: string;
  severity: number | null;
}

function outcomeFor(intent: Intent, knowsMisdeed: boolean, name: string): Outcome {
  switch (intent) {
    case 'insult':
      return { line: 'insult', emotion: 'colere', delta: -12, reason: `You insulted ${name}`, severity: -2 };
    case 'denial':
      return knowsMisdeed
        ? { line: 'caught', emotion: 'mefiance', delta: -15, reason: 'You lied when everyone knows the truth', severity: -1 }
        : { line: 'denial', emotion: 'mefiance', delta: -1, reason: 'Evasive answer', severity: null };
    case 'apology':
      return { line: 'apology', emotion: 'neutre', delta: knowsMisdeed ? 4 : 1, reason: 'You apologized', severity: null };
    case 'compliment':
      return { line: 'compliment', emotion: 'joie', delta: 4, reason: 'A compliment that landed well', severity: null };
    case 'greeting':
      return { line: 'greeting', emotion: 'joie', delta: 1, reason: 'A polite hello', severity: null };
    case 'neutral':
      return { line: 'neutral', emotion: 'neutre', delta: 0, reason: '', severity: null };
  }
}

/** Believable scripted reply used whenever the AI is unavailable, slow, or returns garbage. */
export function fallbackTalk(npc: NpcId, message: string, context: TalkContext): TalkResult {
  const sheet = CHARACTERS[npc];
  const knowsMisdeed = context.knownRumors.some((r) => r.aboutPlayer && r.severity < 0);
  const outcome = outcomeFor(classifyMessage(message), knowsMisdeed, sheet.name);
  const quote = message.trim().slice(0, 60);
  const events =
    outcome.severity === null
      ? []
      : [
          {
            text:
              outcome.line === 'caught'
                ? `${playerLabel(context.playerName)} shamelessly lied to ${sheet.name}`
                : `${playerLabel(context.playerName)} insulted ${sheet.name}: "${quote}"`,
            severity: outcome.severity,
          },
        ];
  const line = pick(LINES[npc][outcome.line], hashString(message));
  const name = cleanName(context.playerName);
  return {
    reply: name && (outcome.line === 'greeting' || outcome.line === 'compliment') ? `${name}! ${line}` : line,
    emotion: outcome.emotion,
    relationDelta: outcome.delta,
    reason: outcome.reason,
    events,
    intent: null,
    suggestions: defaultSuggestions(npc),
    source: 'fallback',
  };
}
