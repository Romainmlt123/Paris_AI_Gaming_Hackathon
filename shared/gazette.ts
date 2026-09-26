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
  'Ciel clair, ragots en hausse',
  'Brume de mauvaise foi sur le ponton',
  'Vent de commérages, rafales à la boulangerie',
  'Averses de sous-entendus en soirée',
];

const AD_TAILS = [
  'Urgent. Se présenter sans excuses bidon.',
  'Récompense : aucune. Explications exigées.',
  'Sérieux s\u2019abstenir. Menteurs aussi.',
];

const CALM_HEADLINES = [
  'IL NE S\u2019EST RIEN PASSÉ ; LES MOUETTES DÉMENTENT',
  'NUIT CALME SUR L\u2019ÎLE : LA RÉDACTION S\u2019ENNUIE FERME',
  'AUCUN SCANDALE CETTE NUIT, JOSETTE EXIGE UN REMBOURSEMENT',
];

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
        `SCANDALE : ${n} NE VEUT PLUS TE VOIR EN PEINTURE`,
        `${n} FURIEUX${CHARACTERS[worst.npc].pronoun === 'elle' ? 'E' : ''} : L\u2019ÎLE RETIENT SON SOUFFLE`,
        `CRISE DIPLOMATIQUE : ${n} RAPPELLE SON AMBASSADEUR`,
      ], seed),
      `${name(worst.npc)} perd ${-worst.delta} points d\u2019estime en une nuit ; la rédaction a des sources.`,
    ];
  }
  if (rumors.length > 0) {
    const r = rumors[0]!;
    return [
      pick([
        'L\u2019ÎLE NE PARLE PLUS QUE DE TOI',
        'LE RAGOT DU SIÈCLE FAIT LE TOUR DE L\u2019ÎLE',
        `${name(r.holder).toUpperCase()} EST AU COURANT. TOUT LE MONDE EST AU COURANT.`,
      ], seed),
      `${rumors.length} ragot${rumors.length > 1 ? 's ont' : ' a'} changé de bouche cette nuit. Démenti attendu, jamais reçu.`,
    ];
  }
  const caller = wanting[0];
  if (caller) {
    return [
      `${name(caller).toUpperCase()} VEUT TE PARLER : ÇA SENT LE ROUSSI`,
      'Personne ne sait de quoi il retourne. Tout le monde a un avis.',
    ];
  }
  if (best && best.delta >= 5) {
    return [
      `${name(best.npc).toUpperCase()} TE TROUVE FORMIDABLE ; L\u2019ÎLE SOUPÇONNE UN POT-DE-VIN`,
      `+${best.delta} points pour toi. Notre enquête continue.`,
    ];
  }
  return [pick(CALM_HEADLINES, seed), 'Nos reporters ont veillé toute la nuit pour rien. Heures sup non payées.'];
}

function rumorArticle(rumors: Rumor[]): GazetteArticle | null {
  if (rumors.length === 0) return null;
  const lines = rumors.slice(0, 3).map((r) => {
    const from = r.source === 'vu' ? 'un témoin' : name(r.source);
    return `${from} a glissé à ${name(r.holder)} : « ${r.text} »`;
  });
  return { rubric: 'Ragots', title: 'Ça jase au comptoir', body: `${lines.join('. ')}. Rien n\u2019est vérifié, tout est répété.` };
}

function societyArticle(recap: RecapEntry[]): GazetteArticle {
  const talks = recap.filter((e) => e.kind === 'talk').slice(0, 3).map((e) => e.text.replace(/\.$/, ''));
  const body = talks.length ? `${talks.join('. ')}.` : 'Personne n\u2019a parlé à personne. Un record.';
  return { rubric: 'Carnet mondain', title: 'Ils se sont vus cette nuit', body };
}

function popularityArticle(list: Mood[], recap: RecapEntry[]): GazetteArticle {
  const lines = list.map((m) => {
    const trend = m.delta > 0 ? `en hausse (+${m.delta})` : m.delta < 0 ? `en chute (${m.delta})` : 'stable';
    return `${name(m.npc)} : ${tierOf(m.after).label}, ${trend}`;
  });
  const reasons = recap.filter((e) => e.kind === 'relation').map((e) => e.text);
  const detail = reasons.length ? ` Dans le détail : ${reasons.join(' ; ')}.` : '';
  return { rubric: 'Cote de popularité', title: 'Ta cote à la criée', body: `${lines.join(' · ')}.${detail}` };
}

function voicesArticle(recap: RecapEntry[]): GazetteArticle | null {
  const quotes = recap
    .filter((e): e is RecapEntry & { npc: NpcId } => e.kind === 'thought' && e.npc !== null)
    .map((e) => `${name(e.npc)}, sous couvert d\u2019anonymat : « ${e.text.replace(/^[«"\s]+|[»"\s]+$/g, '')} »`);
  if (quotes.length === 0) return null;
  return { rubric: 'Micro-trottoir', title: 'Ce qu\u2019ils pensent de toi', body: `${quotes.join(' ')} Propos recueillis derrière une haie.` };
}

function adsArticle(after: GameState, wanting: NpcId[]): GazetteArticle | null {
  if (wanting.length === 0) return null;
  const ads = wanting.map((npc, i) => {
    const intent = after.npcs[npc].intent;
    const what = intent ? ` Motif : « ${intent.replace(/\.$/, '')} ».` : '';
    return `${name(npc).toUpperCase()} cherche le joueur.${what} ${pick(AD_TAILS, after.day + i)}`;
  });
  return { rubric: 'Petites annonces', title: 'On te demande', body: ads.join(' ') };
}

function economyArticle(after: GameState): GazetteArticle {
  return {
    rubric: 'Bourse',
    title: 'Clochettes et prestige',
    body: `Ta bourse clôture à ${after.coins} clochettes. Valeur de l\u2019île : ${after.islandValue} points d\u2019apparat. Gaston se dit « prudemment optimiste », c\u2019est-à-dire intéressé.`,
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
    issue: `Jour ${after.day} · N° ${after.day * 7 + 3} · 2 clochettes`,
    weather: pick(WEATHER, seed >>> 3),
    headline,
    subhead,
    articles: articles.filter((a): a is GazetteArticle => a !== null),
  };
}
