// Énumérations du contrat réutilisées dans les schémas JSON.
import { EMOTIONS, NPC_IDS, TALK_EVENT_KINDS } from '../../src/state/types.ts';
import type { IntentKind } from '../../src/state/types.ts';

export { EMOTIONS, NPC_IDS };
export const TALK_EVENTS_FOR_SCHEMA = TALK_EVENT_KINDS;
export const INTENT_KINDS_FOR_SCHEMA: readonly IntentKind[] = ['confront', 'gossip', 'thank', 'ask', 'offer', 'mock'];
