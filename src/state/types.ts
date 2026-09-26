// Contrat partagé client/serveur. Source de vérité : GameState, modifié uniquement par le code.

export const NPC_IDS = ['gaston', 'josette', 'marius'] as const;
export type NpcId = (typeof NPC_IDS)[number];
export type Actor = NpcId | 'player';

export const EMOTIONS = ['neutre', 'joie', 'colere', 'tristesse', 'surprise', 'mefiance', 'gene', 'moquerie'] as const;
export type Emotion = (typeof EMOTIONS)[number];

export type BondKey = `${NpcId}|${NpcId}`; // clé triée alphabétiquement, voir logic/relations.bondKey

// ---------- Objets ----------
export type ItemKind = 'tool' | 'resource' | 'decor' | 'story';
export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  icon: string; // emoji ou glyphe court pour l'UI
  stack: number; // taille max d'une pile (1 = non empilable)
  price: number; // prix de référence chez Gaston (achat joueur)
  sellPrice: number; // prix de rachat de référence par Gaston
  prestige: number; // points de valeur de l'île si posé (decor)
}
export interface InvSlot {
  itemId: string;
  qty: number;
}

// ---------- Faits et rumeurs ----------
/** Ce qui s'est réellement passé. Jamais modifié par l'IA. */
export interface Fact {
  id: string;
  day: number;
  actor: Actor;
  target: Actor | null;
  kind: TalkEventKind;
  text: string; // description neutre, ex : « Le joueur a traité Marius de vieux radoteur. »
  witnesses: NpcId[];
}
/** Ce qu'un habitant croit, éventuellement déformé. */
export interface Rumor {
  id: string;
  factId: string | null; // null = rumeur inventée
  holder: NpcId;
  heardFrom: Actor;
  text: string;
  distortion: number; // 0 = fidèle, 3 = complètement déformée
  day: number;
}

// ---------- Habitants ----------
export type IntentKind = 'confront' | 'gossip' | 'thank' | 'ask' | 'offer' | 'mock';
export interface Intent {
  kind: IntentKind;
  text: string; // phrase d'accroche quand l'habitant vient parler au joueur
  about: string | null; // factId ou rumorId concerné
}
export interface NpcState {
  id: NpcId;
  relation: number; // -100..100 envers le joueur
  mood: Emotion;
  memories: string[]; // souvenirs courts, plafonnés
  intent: Intent | null; // non null => « ! » au-dessus de la tête
  lastTalkDay: number;
}

export interface RelationChange {
  npc: NpcId;
  delta: number;
  reason: string;
  day: number;
  at: number; // timestamp ms
}

// ---------- Île ----------
export type SlotId = 'placette' | 'falaise' | 'ponton' | 'mairie' | 'plage' | 'verger';
export interface Pickup {
  id: string;
  itemId: string;
  x: number;
  z: number;
}

export interface GameState {
  version: 1;
  day: number;
  hour: number; // 0..24, heure affichée de l'île
  lastSavedAt: number;
  player: {
    name: string;
    bells: number;
    inventory: InvSlot[];
    x: number;
    z: number;
    stungUntilDay: number | null; // visage gonflé après une ruche
  };
  npcs: Record<NpcId, NpcState>;
  bonds: Record<BondKey, number>; // -100..100 entre habitants
  facts: Fact[];
  rumors: Rumor[];
  decor: Record<SlotId, string | null>;
  pickups: Pickup[];
  relationLog: RelationChange[];
  pendingRecap: Recap | null;
  /** Activités du jour (optionnel : absent des anciennes sauvegardes). */
  activity?: { day: number; shakenTrees: number[]; penFedDay: number };
}

// ---------- Conversation (IA) ----------
export const TALK_EVENT_KINDS = [
  'insult', 'compliment', 'flattery', 'lie', 'gift', 'promise', 'threat', 'apology', 'deal', 'confession', 'question', 'other',
] as const;
export type TalkEventKind = (typeof TALK_EVENT_KINDS)[number];

export interface TalkEvent {
  kind: TalkEventKind;
  text: string; // description neutre de ce qui vient de se passer
}

export interface DealProposal {
  itemId: string;
  direction: 'buy' | 'sell'; // du point de vue du joueur
  qty: number;
  price: number; // prix total proposé par l'habitant
}

export interface ChatTurn {
  who: 'player' | 'npc';
  text: string;
}

/** Ce que le client envoie au serveur. */
export interface TalkRequest {
  npc: NpcId;
  playerText: string;
  offeredItemId: string | null;
  history: ChatTurn[]; // derniers échanges de la conversation en cours
  context: NpcContext;
}

/** Contexte construit par le code (logic/context.ts) : ce que l'habitant sait. */
export interface NpcContext {
  day: number;
  hour: number;
  relation: number;
  tier: string;
  mood: Emotion;
  memories: string[];
  knownFacts: string[]; // faits dont l'habitant a été témoin
  heardRumors: string[]; // ce qu'on lui a raconté (peut être faux)
  bonds: { npc: NpcId; value: number }[];
  inventory: { itemId: string; name: string; qty: number }[];
  shopPrices?: { itemId: string; name: string; price: number; sellPrice: number }[];
  decor: string[]; // noms des objets posés sur l'île
  islandValue: number;
  playerStung: boolean;
  intent: Intent | null;
}

/** Réponse brute de l'IA : jamais appliquée telle quelle, toujours validée (logic/validate.ts). */
export interface TalkResponse {
  reply: string;
  emotion: Emotion;
  events: TalkEvent[];
  relationDelta: number;
  reason: string;
  intent: Intent | null;
  suggestions: string[];
  deal: DealProposal | null;
  fallback?: boolean; // true si réplique de secours
}

// ---------- Simulation d'absence (IA) ----------
export interface AbsenceRequest {
  hours: number;
  day: number;
  npcs: { id: NpcId; relation: number; mood: Emotion; memories: string[] }[];
  bonds: { a: NpcId; b: NpcId; value: number }[];
  facts: { id: string; text: string; witnesses: NpcId[] }[];
  rumors: { id: string; holder: NpcId; text: string; factId: string | null; distortion: number }[];
  decor: string[];
}

export interface RumorTransfer {
  from: NpcId;
  to: NpcId;
  sourceId: string; // factId ou rumorId transmis
  text: string; // version racontée (peut être déformée)
  distortion: number;
}

export interface AbsenceResponse {
  conversations: { a: NpcId; b: NpcId; summary: string }[];
  transfers: RumorTransfer[];
  bondDeltas: { a: NpcId; b: NpcId; delta: number }[];
  relationDeltas: { npc: NpcId; delta: number; reason: string }[];
  intents: { npc: NpcId; intent: Intent }[];
  recap: string[]; // lignes du récap « Pendant ton absence… »
  fallback?: boolean;
}

export interface Recap {
  hours: number;
  lines: string[];
  relationChanges: RelationChange[];
}
