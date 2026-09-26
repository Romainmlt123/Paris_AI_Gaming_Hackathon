import { CHARACTERS } from './characters';
import { tierOf } from './relations';
import { hashString, pick } from './rng';
import type { GameState, NpcId, RecapEntry, Rumor } from './types';
import { NPC_IDS } from './types';

export interface GazetteArticle {
  rubric: string;
  title: string;
  body: string;
}

export interface Gazette {
  issue: string;
  weather: string;
  headline: string;
  subhead: string;
  articles: GazetteArticle[];
}

interface Mood {
  npc: NpcId;
  before: number;
  after: number;
  delta: number;
}

const WEATHER = [
  'Clear skies, gossip rising',
  'Fog of bad faith over the pier',
  'Gale-force chatter, gusts at the bakery',
  'Scattered innuendo this evening',
];

const AD_TAILS = [
  'Urgent. Come without lame excuses.',
  'Reward: none. Explanations required.',
  'No time-wasters. No liars either.',
];

const CALM_HEADLINES = [
  'NOTHING HAPPENED; SEAGULLS DENY EVERYTHING',
  'QUIET NIGHT ON THE ISLAND: NEWSROOM BORED STIFF',
  'NO SCANDAL OVERNIGHT, JOSETTE DEMANDS A REFUND',
];

const TIER_EN: Record<string, string> = {
  'Ennemi juré': 'Sworn enemy',
  Rancunier: 'Holding a grudge',
  Voisin: 'Neighbor',
  Copain: 'Pal',
  Confident: 'Confidant',
};

function moods(before: GameState, after: GameState): Mood[] {
  return NPC_IDS.map((npc) => {
    const b = before.npcs[npc].relation;
    const a = after.npcs[npc].relation;
    return { npc, before: b, after: a, delta: a - b };
  });
}

function newRumors(before: GameState, after: GameState): Rumor[] {
  const known = new Set(before.rumors.map((r) => r.id));
  return after.rumors.filter((r) => !known.has(r.id) && r.source !== 'vu');
}

function name(npc: NpcId): string {
  return CHARACTERS[npc].name;
}

function headlineFor(
  worst: Mood | undefined,
  best: Mood | undefined,
  rumors: Rumor[],
  wanting: NpcId[],
  seed: number,
): [string, string] {
  if (worst && worst.delta <= -5) {
    const n = name(worst.npc).toUpperCase();
    return [
      pick([
        `SCANDAL: ${n} NEVER WANTS TO SEE YOU AGAIN`,
        `${n} FURIOUS: ISLAND HOLDS ITS BREATH`,
        `DIPLOMATIC CRISIS: ${n} RECALLS AMBASSADOR`,
      ], seed),
      `${name(worst.npc)} loses ${-worst.delta} points of esteem overnight; our sources are talking.`,
    ];
  }
  if (rumors.length > 0) {
    const r = rumors[0]!;
    return [
      pick([
        'THE WHOLE ISLAND IS TALKING ABOUT YOU',
        'GOSSIP OF THE CENTURY SWEEPS THE ISLAND',
        `${name(r.holder).toUpperCase()} KNOWS. EVERYONE KNOWS.`,
      ], seed),
      `${rumors.length} rumor${rumors.length > 1 ? 's' : ''} changed hands overnight. Denial expected, never received.`,
    ];
  }
  const caller = wanting[0];
  if (caller) {
    return [
      `${name(caller).toUpperCase()} WANTS A WORD: SOMETHING SMELLS FISHY`,
      'Nobody knows what it\u2019s about. Everybody has an opinion.',
    ];
  }
  if (best && best.delta >= 5) {
    return [
      `${name(best.npc).toUpperCase()} THINKS YOU\u2019RE WONDERFUL; ISLAND SUSPECTS A BRIBE`,
      `+${best.delta} points for you. Our investigation continues.`,
    ];
  }
  return [pick(CALM_HEADLINES, seed), 'Our reporters stayed up all night for nothing. Overtime unpaid.'];
}

function rumorArticle(rumors: Rumor[]): GazetteArticle | null {
  if (rumors.length === 0) return null;
  const lines = rumors.slice(0, 3).map((r) => {
    const from = r.source === 'vu' ? 'A witness' : name(r.source);
    return `${from} whispered to ${name(r.holder)}: \u201c${r.text}\u201d`;
  });
  return { rubric: 'Gossip', title: 'Loose lips at the counter', body: `${lines.join('. ')}. Nothing verified, everything repeated.` };
}

function societyArticle(recap: RecapEntry[]): GazetteArticle {
  const talks = recap.filter((e) => e.kind === 'talk').slice(0, 3).map((e) => e.text.replace(/\.$/, ''));
  const body = talks.length ? `${talks.join('. ')}.` : 'Nobody spoke to anybody. A record.';
  return { rubric: 'Society Pages', title: 'Who met whom last night', body };
}

function popularityArticle(list: Mood[], recap: RecapEntry[]): GazetteArticle {
  const lines = list.map((m) => {
    const trend = m.delta > 0 ? `up (+${m.delta})` : m.delta < 0 ? `down (${m.delta})` : 'flat';
    return `${name(m.npc)}: ${TIER_EN[tierOf(m.after).label] ?? tierOf(m.after).label}, ${trend}`;
  });
  const reasons = recap.filter((e) => e.kind === 'relation').map((e) => e.text);
  const detail = reasons.length ? ` The details: ${reasons.join('; ')}.` : '';
  return { rubric: 'Popularity Index', title: 'Your stock, live from the market', body: `${lines.join(' · ')}.${detail}` };
}

function voicesArticle(recap: RecapEntry[]): GazetteArticle | null {
  const quotes = recap
    .filter((e): e is RecapEntry & { npc: NpcId } => e.kind === 'thought' && e.npc !== null)
    .map((e) => `${name(e.npc)}, speaking anonymously: \u201c${e.text.replace(/^[«"\u201c\s]+|[»"\u201d\s]+$/g, '')}\u201d`);
  if (quotes.length === 0) return null;
  return { rubric: 'Word on the Street', title: 'What they really think of you', body: `${quotes.join(' ')} Quotes gathered from behind a hedge.` };
}

function adsArticle(after: GameState, wanting: NpcId[]): GazetteArticle | null {
  if (wanting.length === 0) return null;
  const ads = wanting.map((npc, i) => {
    const intent = after.npcs[npc].intent;
    const what = intent ? ` Reason: \u201c${intent.replace(/\.$/, '')}\u201d.` : '';
    return `${name(npc).toUpperCase()} seeks the player.${what} ${pick(AD_TAILS, after.day + i)}`;
  });
  return { rubric: 'Classifieds', title: 'Wanted: you', body: ads.join(' ') };
}

function economyArticle(after: GameState): GazetteArticle {
  return {
    rubric: 'Markets',
    title: 'Bells and prestige',
    body: `Your purse closes at ${after.coins} bells. Island value: ${after.islandValue} prestige points. Gaston calls himself \u201ccautiously optimistic\u201d, meaning interested.`,
  };
}

/** Morning paper summarising an absence. Pure: built from the states around the simulation. */
export function buildGazette(before: GameState, after: GameState, recap: RecapEntry[]): Gazette {
  const seed = hashString(`gazette-${after.day}-${after.nextId}`);
  const list = moods(before, after);
  const sorted = [...list].sort((a, b) => a.delta - b.delta);
  const rumors = newRumors(before, after);
  const wanting = NPC_IDS.filter(
    (npc) => after.npcs[npc].intent !== before.npcs[npc].intent && recap.some((e) => e.kind === 'intent' && e.npc === npc),
  );
  const [headline, subhead] = headlineFor(sorted[0], sorted[sorted.length - 1], rumors, wanting, seed);
  const articles = [rumorArticle(rumors), voicesArticle(recap), societyArticle(recap), popularityArticle(list, recap), adsArticle(after, wanting), economyArticle(after)];
  return {
    issue: `Day ${after.day} · No. ${after.day * 7 + 3} · 2 bells`,
    weather: pick(WEATHER, seed >>> 3),
    headline,
    subhead,
    articles: articles.filter((a): a is GazetteArticle => a !== null),
  };
}
