import { getItem, isItemId } from '../data/items';
import { PICKUP_SPAWNS } from '../data/island';
import { NPCS } from '../data/npcs';
import {
  NPC_IDS,
  type AbsenceRequest, type AbsenceResponse, type Fact, type GameState, type Intent, type NpcId,
  type Pickup, type RelationChange, type RumorTransfer, type TalkEventKind,
} from '../state/types';
import { bondKey, getBond, relationChange, setBond } from './relations';
import { distort, MAX_DISTORTION, transferRumor } from './rumors';
import { pick, type Rng } from './rng';
import { MEMORY_MAX } from './talk';
import { ABSENCE_RELATION_MAX } from './validate';

export const WAKE_HOUR = 8;
/** Lien minimum pour que deux habitants se racontent les histoires du joueur (repli hors IA). */
export const GOSSIP_BOND_MIN = 20;
const OFFENSES: readonly TalkEventKind[] = ['insult', 'threat', 'lie'];
const NOT_GOSSIP: readonly TalkEventKind[] = ['question', 'other'];

// ---------- Requête IA ----------
export function buildAbsenceRequest(state: GameState, hours: number): AbsenceRequest {
  return {
    hours,
    day: state.day,
    npcs: NPC_IDS.map((id) => {
      const n = state.npcs[id];
      return { id, relation: n.relation, mood: n.mood, memories: [...n.memories] };
    }),
    bonds: NPC_IDS.flatMap((a, i) => NPC_IDS.slice(i + 1).map((b) => ({ a, b, value: getBond(state, a, b) }))),
    facts: state.facts.map((f) => ({ id: f.id, text: f.text, witnesses: [...f.witnesses] })),
    rumors: state.rumors.map((r) => ({ id: r.id, holder: r.holder, text: r.text, factId: r.factId, distortion: r.distortion })),
    decor: Object.values(state.decor).flatMap((id) => (id !== null && isItemId(id) ? [getItem(id).name] : [])),
  };
}

// ---------- Application ----------
function advanceClock(day: number, hour: number, hours: number): { day: number; hour: number } {
  const raw = hour + Math.max(0, hours);
  const days = Math.floor(raw / 24);
  if (days === 0) return { day, hour: raw };
  return { day: day + days, hour: Math.max(WAKE_HOUR, raw % 24) }; // on se réveille au plus tôt à 8 h
}

export function morningPickups(day: number): Pickup[] {
  return PICKUP_SPAWNS.map((p, i) => ({ id: `p${day}-${i}`, itemId: p.itemId, x: p.x, z: p.z }));
}

function withMemory(state: GameState, npc: NpcId, memory: string): GameState {
  const n = state.npcs[npc];
  return { ...state, npcs: { ...state.npcs, [npc]: { ...n, memories: [...n.memories, memory].slice(-MEMORY_MAX) } } };
}

/** Applique une AbsenceResponse validée : rumeurs, liens, relations, intentions, horloge, ramassables, récap. */
export function applyAbsence(state: GameState, resp: AbsenceResponse, hours: number, now: number): GameState {
  const clock = advanceClock(state.day, state.hour, hours);
  let s: GameState = state;

  for (const c of resp.conversations) {
    s = withMemory(s, c.a, `Discuté avec ${NPCS[c.b].name} : ${c.summary}`);
    s = withMemory(s, c.b, `Discuté avec ${NPCS[c.a].name} : ${c.summary}`);
  }
  for (const t of resp.transfers) s = transferRumor(s, t, clock.day);
  for (const b of resp.bondDeltas) s = setBond(s, b.a, b.b, getBond(s, b.a, b.b) + b.delta);

  const relationChanges: RelationChange[] = [];
  for (const r of resp.relationDeltas) {
    const res = relationChange(s, r.npc, r.delta, r.reason || 'Ce qu’on lui a raconté', now, ABSENCE_RELATION_MAX);
    s = res.state;
    if (res.change) relationChanges.push(res.change);
  }
  for (const { npc, intent } of resp.intents) {
    s = { ...s, npcs: { ...s.npcs, [npc]: { ...s.npcs[npc], intent } } };
  }

  const lines = resp.recap.length > 0 ? [...resp.recap] : ["L'île a vécu sa petite vie, sans histoires. Pour une fois."];
  return {
    ...s,
    day: clock.day,
    hour: clock.hour,
    pickups: clock.day > state.day ? morningPickups(clock.day) : s.pickups,
    pendingRecap: { hours, lines, relationChanges },
  };
}

// ---------- Repli déterministe sans IA ----------
function knownDistortion(state: GameState, npc: NpcId, fact: Fact): number | null {
  if (fact.witnesses.includes(npc)) return 0;
  const versions = state.rumors.filter((r) => r.holder === npc && r.factId === fact.id).map((r) => r.distortion);
  return versions.length > 0 ? Math.min(...versions) : null;
}

function tellLine(from: NpcId, to: NpcId, rng: Rng): string {
  const a = NPCS[from].name;
  const b = NPCS[to].name;
  if (from === 'marius') {
    return to === 'josette'
      ? pick([`${a} a vidé son sac chez ${b} entre deux croissants…`, `${a} est passé chez ${b} « juste pour le pain ». Il est resté deux heures.`], rng)
      : `${a} a marmonné deux-trois choses à ${b} en réparant ses filets.`;
  }
  if (from === 'josette') {
    return pick([`${a} a tout répété à ${b}, avec un peu de crème en plus.`, `${a} a fait sa tournée : ${b} est désormais au courant de tout.`], rng);
  }
  return `${a} a glissé l'histoire à ${b}, en espérant en tirer un bon prix.`;
}

const AMBIENT: readonly [string, ...string[]] = [
  'Marius a pêché trois sardines et une philosophie entière.',
  'Josette a fait sa fournée… et sa tournée des potins.',
  'Gaston a recompté sa caisse. Deux fois. Il manque toujours une clochette.',
  'Un goéland a volé un croissant. Josette mène l’enquête.',
];

function offenseTargetName(fact: Fact): string | null {
  return fact.target && fact.target !== 'player' ? NPCS[fact.target].name : null;
}

/**
 * Simulation crédible SANS IA : chaque fait sur le joueur connu d'un habitant est raconté (légèrement déformé)
 * à ceux avec qui il a un lien > 20. Josette qui apprend une offense du joueur → intention « confront ».
 */
export function simulateAbsenceFallback(state: GameState, hours: number, rng: Rng): AbsenceResponse {
  const facts = state.facts
    .filter((f) => (f.actor === 'player' || f.target === 'player') && !NOT_GOSSIP.includes(f.kind))
    .slice(-5);
  const transfers: RumorTransfer[] = [];
  const told = new Set<string>(); // `${factId}>${npc}` déjà reçu dans cette simulation

  for (const fact of facts) {
    for (const from of NPC_IDS) {
      const d = knownDistortion(state, from, fact);
      if (d === null) continue;
      for (const to of NPC_IDS) {
        if (to === from || getBond(state, from, to) <= GOSSIP_BOND_MIN) continue;
        if (knownDistortion(state, to, fact) !== null || told.has(`${fact.id}>${to}`)) continue;
        const distortion = Math.min(MAX_DISTORTION, d + 1);
        transfers.push({ from, to, sourceId: fact.id, text: distort(fact.text, distortion, rng), distortion });
        told.add(`${fact.id}>${to}`);
      }
    }
  }

  const pairs = new Map<string, { a: NpcId; b: NpcId }>();
  for (const t of transfers) pairs.set(bondKey(t.from, t.to), { a: t.from, b: t.to });
  const conversations = [...pairs.values()].map(({ a, b }) => ({
    a, b, summary: `${NPCS[a].name} et ${NPCS[b].name} ont longuement parlé de toi.`,
  }));
  const bondDeltas = [...pairs.values()].map(({ a, b }) => ({ a, b, delta: 2 }));

  const relationDeltas: AbsenceResponse['relationDeltas'] = [];
  const intents: { npc: NpcId; intent: Intent }[] = [];
  const recap: string[] = [];
  for (const t of transfers) {
    recap.push(tellLine(t.from, t.to, rng), `« ${t.text} »`);
    const fact = facts.find((f) => f.id === t.sourceId);
    if (!fact || fact.actor !== 'player' || !OFFENSES.includes(fact.kind) || fact.target === t.to) continue;
    if (relationDeltas.some((r) => r.npc === t.to)) continue;
    const victim = offenseTargetName(fact);
    relationDeltas.push({
      npc: t.to, delta: -6,
      reason: fact.target === t.from
        ? `${NPCS[t.from].name} lui a raconté comment tu l'as traité`
        : victim ? `A appris par ${NPCS[t.from].name} que tu t'en es pris à ${victim}` : 'A entendu parler de ton comportement',
    });
    if (t.to === 'josette') {
      intents.push({
        npc: 'josette',
        intent: { kind: 'confront', text: `Dis donc, toi ! ${NPCS[t.from].name} m'a raconté un truc pas joli-joli sur toi… Tu m'expliques ?`, about: fact.id },
      });
      recap.push('Josette t’attend de pied ferme. Elle a des questions.');
    }
  }
  if (recap.length === 0) {
    recap.push(pick(AMBIENT, rng));
    const second = pick(AMBIENT, rng);
    if (second !== recap[0]) recap.push(second);
  }
  // Garde la ligne de confrontation même si le récap déborde.
  const confront = recap.find((l) => l.startsWith('Josette t’attend'));
  let lines = recap.filter((l) => l !== confront).slice(0, confront ? 5 : 6);
  if (confront) lines = [...lines, confront];

  return { conversations, transfers, bondDeltas, relationDeltas, intents, recap: lines, fallback: true };
}
