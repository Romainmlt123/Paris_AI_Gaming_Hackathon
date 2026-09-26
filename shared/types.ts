export type NpcId = 'gaston' | 'josette' | 'marius';
export const NPC_IDS: readonly NpcId[] = ['gaston', 'josette', 'marius'];

export type Speaker = NpcId | 'player';

export type Emotion = 'joie' | 'neutre' | 'colere' | 'tristesse' | 'surprise' | 'mefiance' | 'amuse';
export const EMOTIONS: readonly Emotion[] = ['joie', 'neutre', 'colere', 'tristesse', 'surprise', 'mefiance', 'amuse'];

/** Something that really happened. Rumors point to facts; facts never change. */
export interface Fact {
  id: string;
  day: number;
  actor: Speaker;
  text: string;
  /** -3 (terrible) .. +3 (wonderful), from the point of view of the island. */
  severity: number;
  witnesses: NpcId[];
}

/** What one NPC believes about a fact — possibly distorted. */
export interface Rumor {
  id: string;
  factId: string;
  holder: NpcId;
  text: string;
  /** 'vu' when the holder witnessed the fact. */
  source: NpcId | 'vu';
  distortion: number;
  day: number;
}

export interface ChatLine {
  who: Speaker;
  text: string;
}

export interface NpcState {
  relation: number;
  emotion: Emotion;
  memories: string[];
  intent: string | null;
  history: ChatLine[];
}

export interface RelationChange {
  npc: NpcId;
  delta: number;
  reason: string;
  day: number;
}

export type DecoId = 'parterre' | 'banc' | 'lampadaire' | 'fontaine' | 'statue';
export type SlotId = 'placette' | 'falaise' | 'ponton' | 'mairie' | 'boulangerie';

export type Outfit = 'nu' | 'habille';

export type HairStyle = 'short' | 'bun' | 'cap' | 'beanie';

export interface PlayerLook {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
}

export interface GameState {
  version: 1;
  nextId: number;
  day: number;
  /** Minutes since midnight. */
  clock: number;
  /** First name typed on the welcome screen; '' until chosen. */
  playerName: string;
  /** Island name chosen during onboarding; '' until chosen. */
  islandName: string;
  /** Appearance picked in the character creator; null = default sprite. */
  look: PlayerLook | null;
  coins: number;
  islandValue: number;
  inventory: DecoId[];
  decor: Record<SlotId, DecoId | null>;
  npcs: Record<NpcId, NpcState>;
  /** Affinity between NPCs, keyed by `bondKey`. 0..100. */
  bonds: Record<string, number>;
  facts: Fact[];
  rumors: Rumor[];
  changes: RelationChange[];
  /** 'nu' for the castaway who just washed ashore. */
  outfit: Outfit;
  /** Last day each `npc:trigger` initiative fired (NPCs don't repeat themselves the same day). */
  initiatives: Record<string, number>;
}

export interface TalkEvent {
  text: string;
  severity: number;
}

/** What the AI (or the fallback) proposes after a player line. The code decides what to apply. */
export interface TalkResult {
  reply: string;
  emotion: Emotion;
  relationDelta: number;
  reason: string;
  events: TalkEvent[];
  intent: string | null;
  suggestions: string[];
  source: 'ai' | 'fallback';
}

export interface KnownRumor {
  text: string;
  source: NpcId | 'vu';
  aboutPlayer: boolean;
  severity: number;
}

export interface TalkContext {
  relation: number;
  tier: string;
  emotion: Emotion;
  memories: string[];
  knownRumors: KnownRumor[];
  history: ChatLine[];
  intent: string | null;
  day: number;
  islandValue: number;
  playerName: string;
  islandName: string;
}

export interface TalkRequest {
  npc: NpcId;
  message: string;
  context: TalkContext;
  /** Set when the NPC comes to the player on its own: why it came. `message` is then empty. */
  initiative?: string;
}

export interface SimConversation {
  a: NpcId;
  b: NpcId;
  summary: string;
}

export interface SimTransfer {
  from: NpcId;
  to: NpcId;
  factId: string;
  text: string;
}

export interface SimIntent {
  npc: NpcId;
  text: string;
}

export interface SimBondChange {
  a: NpcId;
  b: NpcId;
  delta: number;
}

/** Proposal for what happened while the player was away. Validated before being applied. */
export interface SimResult {
  conversations: SimConversation[];
  transfers: SimTransfer[];
  intents: SimIntent[];
  bondChanges: SimBondChange[];
  source: 'ai' | 'fallback';
}

export interface SimFactView {
  id: string;
  text: string;
  severity: number;
  aboutPlayer: boolean;
}

export interface SimRumorView {
  holder: NpcId;
  factId: string;
  text: string;
}

export interface SimRequest {
  hours: number;
  day: number;
  facts: SimFactView[];
  rumors: SimRumorView[];
  bonds: Record<string, number>;
  relations: Record<NpcId, number>;
  playerName: string;
  islandName: string;
}

export type RecapKind = 'talk' | 'rumor' | 'relation' | 'intent';

export interface RecapEntry {
  kind: RecapKind;
  text: string;
  npc: NpcId | null;
}
