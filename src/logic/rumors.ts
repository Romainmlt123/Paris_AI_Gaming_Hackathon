import { NPCS } from '../data/npcs';
import type { Actor, Fact, GameState, NpcId, Rumor, RumorTransfer } from '../state/types';
import { getBond } from './relations';
import { pick, type Rng } from './rng';

export const MAX_DISTORTION = 3;
/** En dessous de ce lien, le receveur ne croit pas / ne retient pas ce qu'on lui raconte. */
export const BOND_REJECT_BELOW = -30;

export function actorName(actor: Actor): string {
  return actor === 'player' ? 'le joueur' : NPCS[actor].name;
}

function rumorId(holder: NpcId, sourceKey: string): string {
  return `r:${sourceKey}@${holder}`;
}

/** Remplace (ou ajoute) la rumeur d'un habitant pour une même source, en gardant la moins déformée. */
function upsertRumor(rumors: readonly Rumor[], next: Rumor): Rumor[] {
  const sameSource = (r: Rumor) =>
    r.holder === next.holder && (next.factId !== null ? r.factId === next.factId : r.id === next.id);
  const existing = rumors.find(sameSource);
  if (!existing) return [...rumors, next];
  if (existing.distortion <= next.distortion) return [...rumors];
  return rumors.map((r) => (r === existing ? next : r));
}

/** Enregistre un fait réel et une rumeur fidèle (distortion 0) chez chaque témoin. */
export function recordFact(state: GameState, fact: Omit<Fact, 'id'> & { id?: string }): GameState {
  const full: Fact = { ...fact, id: fact.id ?? `f${state.facts.length + 1}`, witnesses: [...new Set(fact.witnesses)] };
  let rumors: Rumor[] = [...state.rumors];
  for (const w of full.witnesses) {
    rumors = upsertRumor(rumors, {
      id: rumorId(w, full.id), factId: full.id, holder: w, heardFrom: full.actor, text: full.text, distortion: 0, day: full.day,
    });
  }
  return { ...state, facts: [...state.facts, full], rumors };
}

/** Probabilité qu'un habitant retienne une rumeur selon son lien avec l'émetteur. */
export function acceptChance(bond: number): number {
  if (bond < BOND_REJECT_BELOW) return 0;
  return Math.min(1, 0.5 + (bond - BOND_REJECT_BELOW) / 260);
}

/**
 * Transmet une rumeur de `from` à `to`. Déterministe : par défaut rng = () => 0 (accepte dès que bond ≥ -30).
 * Sans effet si la source est inconnue, si from === to, ou si le receveur ne la retient pas.
 */
export function transferRumor(state: GameState, transfer: RumorTransfer, day: number, rng: Rng = () => 0): GameState {
  const { from, to } = transfer;
  if (from === to) return state;
  if (rng() >= acceptChance(getBond(state, from, to))) return state;

  const fact = state.facts.find((f) => f.id === transfer.sourceId);
  const source = fact ? null : state.rumors.find((r) => r.id === transfer.sourceId);
  if (!fact && !source) return state;
  const factId = fact ? fact.id : (source?.factId ?? null);
  const sourceKey = factId ?? transfer.sourceId;

  const distortion = Math.max(0, Math.min(MAX_DISTORTION, Math.round(transfer.distortion)));
  const rumor: Rumor = {
    id: rumorId(to, sourceKey), factId, holder: to, heardFrom: from, text: transfer.text, distortion, day,
  };
  return { ...state, rumors: upsertRumor(state.rumors, rumor) };
}

/** Ce que sait un habitant : faits vus de ses yeux, et ce qu'on lui a raconté (peut être faux). */
export function knowledgeOf(state: GameState, npc: NpcId): { knownFacts: string[]; heardRumors: string[] } {
  const witnessed = state.facts.filter((f) => f.witnesses.includes(npc));
  const witnessedIds = new Set(witnessed.map((f) => f.id));
  const heard = state.rumors.filter((r) => r.holder === npc && !(r.factId !== null && witnessedIds.has(r.factId)));
  return {
    knownFacts: witnessed.map((f) => `Jour ${f.day} : ${f.text}`),
    heardRumors: heard.map((r) => `${r.text} (raconté par ${actorName(r.heardFrom)}, jour ${r.day})`),
  };
}

const PREFIXES = ["Il paraît que", "On m'a dit que", 'Figure-toi que', 'Tu sais pas la meilleure ? Paraît que'] as const;
const ADDITIONS = [
  "et en plus, ça avait l'air de bien l'amuser",
  "et en plus, devant tout le monde",
  "et en plus, c'est pas la première fois",
] as const;
const WILD = ["Toute l'île ne parle que de ça !", "Moi, j'en ai encore des frissons.", 'Et ça, crois-moi, ça va chercher loin.'] as const;

/** Minuscule initiale seulement pour les mots courants (jamais pour un prénom). */
function lowerFirst(text: string): string {
  return /^(Le|La|Les|L'|Un|Une|Des|Ce|Cette|Il|Elle|On|Tu|Toi)\b/u.test(text)
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
}

/** Déformation « commère » pour le repli hors IA. level 0 = texte intact, 3 = très exagéré. */
export function distort(text: string, level: number, rng: Rng): string {
  const clean = text.trim().replace(/[.!…\s]+$/u, '');
  if (level <= 0 || clean === '') return text;
  let out = `${pick(PREFIXES, rng)} ${lowerFirst(clean)}`;
  if (level >= 2) out += `… ${pick(ADDITIONS, rng)}`;
  out += level >= 3 ? ` ! ${pick(WILD, rng)}` : '.';
  return out;
}
