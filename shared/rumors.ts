import type { Fact, GameState, NpcId, Rumor, Speaker } from './types';

export interface NewFact {
  actor: Speaker;
  text: string;
  severity: number;
  witnesses: NpcId[];
}

/** Records a true fact and gives every witness a first-hand rumor about it. */
export function recordFact(state: GameState, input: NewFact): { state: GameState; fact: Fact } {
  const next = structuredClone(state);
  const fact: Fact = { id: `f${next.nextId++}`, day: next.day, ...input };
  next.facts = [...next.facts, fact];
  for (const witness of input.witnesses) {
    next.rumors.push({
      id: `r${next.nextId++}`,
      factId: fact.id,
      holder: witness,
      text: input.text,
      source: 'vu',
      distortion: 0,
      day: next.day,
    });
  }
  return { state: next, fact };
}

export function rumorOf(state: GameState, holder: NpcId, factId: string): Rumor | undefined {
  return state.rumors.find((r) => r.holder === holder && r.factId === factId);
}

export function factById(state: GameState, factId: string): Fact | undefined {
  return state.facts.find((f) => f.id === factId);
}

/**
 * Passes a rumor from one NPC to another. Only legal if `from` knows the fact and `to` does not.
 * Each hop adds one level of distortion.
 */
export function transferRumor(
  state: GameState,
  from: NpcId,
  to: NpcId,
  factId: string,
  text: string,
): { state: GameState; rumor: Rumor | null } {
  if (from === to) return { state, rumor: null };
  const known = rumorOf(state, from, factId);
  if (!known || rumorOf(state, to, factId)) return { state, rumor: null };
  const next = structuredClone(state);
  const rumor: Rumor = {
    id: `r${next.nextId++}`,
    factId,
    holder: to,
    text: text.trim() || known.text,
    source: from,
    distortion: known.distortion + 1,
    day: next.day,
  };
  next.rumors = [...next.rumors, rumor];
  return { state: next, rumor };
}

const EXAGGERATIONS = [
  'et en plus devant tout le monde',
  'et apparemment ce n\u2019était pas la première fois',
  'et il paraît qu\u2019il y avait des cris',
  'et Josette dit qu\u2019il faudrait en parler au conseil',
];

const FLATTERING = [
  'et ça a coûté une fortune',
  'en or massif, paraît-il',
  'et toute l\u2019île vient l\u2019admirer',
  'et il paraît qu\u2019il en commande une deuxième',
];

/** Deterministic, code-side distortion used when the AI is unavailable. Good news gets inflated too. */
export function distortRumor(text: string, distortion: number, severity = -1): string {
  const base = text.replace(/[.!]+$/, '');
  if (distortion <= 0) return `${base}.`;
  const pool = severity >= 0 ? FLATTERING : EXAGGERATIONS;
  const extra = pool[(distortion - 1) % pool.length];
  return `Il paraît que ${base.charAt(0).toLowerCase()}${base.slice(1)}, ${extra} !`;
}
