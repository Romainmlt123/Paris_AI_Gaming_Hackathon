// Contrat partagé client/serveur. Source de vérité : GameState, modifié uniquement par le code.

export const NPC_IDS = ['gaston', 'josette', 'marius'] as const;
export type NpcId = (typeof NPC_IDS)[number];
export type Actor = NpcId | 'player';

export const EMOTIONS = ['neutre', 'joie', 'colere', 'tristesse', 'surprise', 'mefiance', 'gene', 'moquerie'] as const;
export type Emotion = (typeof EMOTIONS)[number];

export type BondKey = `${NpcId}|${NpcId}`; // clé triée alphabétiquement, voir logic/relations.bondKey

// ---------- Objets ----------
export type ItemKind = 'tool' | 'resource' | 'decor' | 'story';
export type ItemTag = 'fish' | 'fruit' | 'shell' | 'bug' | 'pen' | 'nature' | 'luxe' | 'building' | 'pastry' | 'kitsch' | 'rotten' | 'legendary';
export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  icon: string; // emoji ou glyphe court pour l'UI
  stack: number; // taille max d'une pile (1 = non empilable)
  price: number; // prix de référence chez Gaston (achat joueur), 0 = pas en vente
  sellPrice: number; // prix de rachat de référence par Gaston
  prestige: number; // points de valeur de l'île si posé (decor)
  tags: ItemTag[];
  requires?: { itemId: string; qty: number }; // ressource exigée à l'achat (déco de luxe)
  slots?: SlotId[]; // emplacements autorisés (décor) ; absent = slots libres
}
export interface InvSlot {
  itemId: string;
  qty: number;
}

// ---------- Faits et rumeurs ----------
export const WORLD_EVENT_KINDS = ['stung', 'neglect', 'decor', 'catch', 'sale', 'feed', 'scam'] as const;
export type WorldEventKind = (typeof WORLD_EVENT_KINDS)[number];
export type FactKind = TalkEventKind | WorldEventKind;

/** Ce qui s'est réellement passé. Jamais modifié par l'IA. */
export interface Fact {
  id: string;
  day: number;
  actor: Actor;
  target: Actor | null;
  kind: FactKind;
  text: string; // description neutre, ex : « Le joueur a traité Marius de vieux radoteur. »
  witnesses: NpcId[];
  severity: number; // -3 (très grave) .. +3 (très positif)
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
export type IntentKind = 'confront' | 'gossip' | 'thank' | 'ask' | 'offer' | 'mock' | 'react';
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
  caughtLies: number;
}

export interface RelationChange {
  npc: NpcId;
  delta: number;
  reason: string;
  day: number;
  at: number; // timestamp ms
}

// ---------- Île ----------
export const SLOT_IDS = ['placette', 'falaise', 'ponton', 'mairie', 'plage', 'verger', 'echoppe', 'boulangerie'] as const;
export type SlotId = (typeof SLOT_IDS)[number];
export interface Pickup {
  id: string;
  itemId: string;
  x: number;
  z: number;
}
export interface TreeState {
  id: string;
  fruit: 'pomme' | 'figue';
  fruits: number; // fruits restants aujourd'hui
  hive: boolean; // ruche cachée (tombée une fois par jour max)
  shakenDay: number;
}
export interface Animal {
  id: string;
  kind: 'dodo' | 'mouton';
  name: string;
  lastFedDay: number;
  readyToCollect: boolean;
}

export interface GameState {
  version: 2;
  seed: number;
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
  bonds: Partial<Record<BondKey, number>>; // -100..100 entre habitants (clés triées)
  facts: Fact[];
  rumors: Rumor[];
  decor: Record<SlotId, string | null>;
  pickups: Pickup[];
  trees: TreeState[];
  animals: Animal[];
  relationLog: RelationChange[];
  pendingRecap: Recap | null;
  counter: number; // générateur d'identifiants
}

// ---------- Conversation (IA) ----------
export const TALK_EVENT_KINDS = [
  'insult', 'compliment', 'flattery', 'lie', 'gift', 'promise', 'threat', 'apology', 'deal', 'confession', 'question', 'blackmail', 'other',
] as const;
export type TalkEventKind = (typeof TALK_EVENT_KINDS)[number];

export interface TalkEvent {
  kind: TalkEventKind;
  text: string; // description neutre de ce qui vient de se passer
  target?: Actor | null; // qui est visé (ex. insulte envers Marius racontée à Josette)
}

export interface DealProposal {
  itemId: string;
  direction: 'buy' | 'sell'; // du point de vue du joueur
  qty: number;
  price: number; // prix total proposé par l'habitant
}

/** Négociation en cours, tenue par le code. */
export interface Deal {
  direction: 'buy' | 'sell';
  items: InvSlot[];
  reference: number; // prix de référence total
  price: number; // offre actuelle de Gaston
  floor: number; // bornes dures fixées par le code
  ceil: number;
  rounds: number;
}

export interface ChatTurn {
  who: 'player' | 'npc';
  text: string;
}

/** Ce que le client envoie au serveur. */
export interface TalkRequest {
  npc: NpcId;
  playerText: string; // '' = l'habitant ouvre la conversation (intention)
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
  knownFacts: { id: string; text: string }[]; // faits dont l'habitant a été témoin
  heardRumors: { id: string; factId: string | null; text: string; from: string }[]; // peut être faux
  bonds: { npc: NpcId; value: number }[];
  inventory: { itemId: string; name: string; qty: number }[];
  shopPrices?: { itemId: string; name: string; price: number; sellPrice: number }[];
  deal: Deal | null;
  decor: string[]; // noms des objets posés sur l'île
  islandValue: number;
  playerStung: boolean;
  intent: Intent | null;
  liesCaught: number;
  denial: { factId: string; text: string } | null; // mensonge détecté par le code AVANT l'appel IA
  offeredItem: { itemId: string; name: string; tags: ItemTag[] } | null;
}

export interface ClaimCheck {
  deniesFactId: string; // le joueur nie ce fait connu de l'habitant
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
  denials: ClaimCheck[];
  acceptGift: boolean;
  fallback?: boolean; // true si réplique de secours
}

// ---------- Simulation d'absence (calculée par le code, racontée par l'IA) ----------
export interface RumorTransfer {
  from: NpcId;
  to: NpcId;
  sourceId: string; // factId transmis
  text: string; // version racontée (peut être déformée)
  distortion: number;
}

export interface AbsenceReport {
  hours: number;
  day: number;
  transfers: RumorTransfer[];
  relationChanges: RelationChange[];
  intents: { npc: NpcId; intent: Intent }[];
  world: string[]; // faits du monde (fruits, animaux, objets trouvés)
  lines: string[]; // récap factuel généré par le code
}

export interface GazetteRequest {
  report: AbsenceReport;
  playerName: string;
  islandValue: number;
}
export interface Gazette {
  headline: string;
  articles: { title: string; body: string }[];
  fallback?: boolean;
}

export interface Recap {
  hours: number;
  lines: string[];
  relationChanges: RelationChange[];
  gazette: Gazette | null;
}
