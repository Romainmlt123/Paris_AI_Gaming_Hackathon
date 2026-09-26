import type { Actor, Fact, FactKind, GameState, NpcContext, NpcId } from '../state/types.ts';
import { NPCS } from '../data/npcs.ts';

export const SEVERITY: Record<FactKind, number> = {
  insult: -3,
  threat: -3,
  blackmail: -3,
  lie: -2,
  scam: -2,
  neglect: -2,
  stung: 0,
  compliment: 1,
  flattery: 1,
  gift: 2,
  apology: 1,
  promise: 0,
  deal: 0,
  confession: 0,
  question: 0,
  other: 0,
  decor: 1,
  catch: 1,
  sale: 0,
  feed: 1,
};

export function nextId(draft: GameState, prefix: string): string {
  draft.counter += 1;
  return `${prefix}${draft.counter}`;
}

export function actorName(state: GameState, a: Actor | null): string {
  if (a === null) return 'personne';
  if (a === 'player') return state.player.name;
  return NPCS[a].name;
}

export function addFact(
  draft: GameState,
  f: { actor: Actor; target: Actor | null; kind: FactKind; text: string; witnesses: NpcId[]; severity?: number },
): Fact {
  const fact: Fact = {
    id: nextId(draft, 'f'),
    day: draft.day,
    actor: f.actor,
    target: f.target,
    kind: f.kind,
    text: f.text,
    witnesses: [...new Set(f.witnesses)],
    severity: f.severity ?? SEVERITY[f.kind],
  };
  draft.facts.push(fact);
  if (draft.facts.length > 80) draft.facts.splice(0, draft.facts.length - 80);
  return fact;
}

/** Ce qu'un habitant sait d'un fait : il en a été témoin, ou on le lui a raconté. */
export function knowsFact(state: GameState, npc: NpcId, factId: string): boolean {
  const fact = state.facts.find((f) => f.id === factId);
  if (fact?.witnesses.includes(npc)) return true;
  return state.rumors.some((r) => r.holder === npc && r.factId === factId);
}

const DENIAL_MARKERS = [
  'pas moi', 'jamais', "c'est faux", 'cest faux', "n'importe quoi", 'nimporte quoi', "j'ai rien", 'jai rien', "je n'ai rien",
  "j'ai pas", 'jai pas', "je n'ai pas", 'mensonge', 'il ment', 'elle ment', 'invent', 'pas vrai', 'rien dit', 'rien fait',
  "n'ai jamais", 'ment ', 'menteur', 'menteuse', 'calomnie', 'faux !', 'même pas vrai', 'meme pas vrai', 'je nie', 'pas du tout',
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[’`]/g, "'").normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Le code détecte un démenti : le joueur nie alors que l'habitant connaît un fait négatif réel le concernant.
 * On privilégie le fait visé par l'intention en cours (la confrontation).
 */
export function detectDenial(ctx: NpcContext, playerText: string, facts: Fact[]): { factId: string; text: string } | null {
  const t = normalize(playerText);
  if (!DENIAL_MARKERS.some((m) => t.includes(normalize(m)))) return null;
  const known = new Set<string>([...ctx.knownFacts.map((f) => f.id), ...ctx.heardRumors.flatMap((r) => (r.factId ? [r.factId] : []))]);
  const negative = facts.filter((f) => known.has(f.id) && f.actor === 'player' && f.severity < 0 && f.kind !== 'lie');
  if (negative.length === 0) return null;
  const about = ctx.intent?.about;
  const chosen = negative.find((f) => f.id === about) ?? negative[negative.length - 1];
  if (!chosen) return null;
  return { factId: chosen.id, text: chosen.text };
}
