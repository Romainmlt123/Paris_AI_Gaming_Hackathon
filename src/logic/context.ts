import { getItem, isItemId, ITEMS } from '../data/items';
import { NPC_IDS, type GameState, type NpcContext, type NpcId } from '../state/types';
import { getBond, perkText, tierOf } from './relations';
import { islandValue, shopPrice } from './economy';
import { knowledgeOf } from './rumors';

export function isPlayerStung(state: GameState): boolean {
  return state.player.stungUntilDay !== null && state.day <= state.player.stungUntilDay;
}

/** Ce que l'habitant sait et voit, construit par le code pour le prompt. */
export function buildNpcContext(state: GameState, npc: NpcId): NpcContext {
  const self = state.npcs[npc];
  const { knownFacts, heardRumors } = knowledgeOf(state, npc);
  const context: NpcContext = {
    day: state.day,
    hour: state.hour,
    relation: self.relation,
    tier: `${tierOf(self.relation).name} (${perkText(npc, self.relation)})`,
    mood: self.mood,
    memories: [...self.memories],
    knownFacts,
    heardRumors,
    bonds: NPC_IDS.filter((o) => o !== npc).map((o) => ({ npc: o, value: getBond(state, npc, o) })),
    inventory: state.player.inventory.filter((s) => isItemId(s.itemId)).map((s) => ({ itemId: s.itemId, name: getItem(s.itemId).name, qty: s.qty })),
    decor: Object.values(state.decor).flatMap((id) => (id !== null && isItemId(id) ? [getItem(id).name] : [])),
    islandValue: islandValue(state),
    playerStung: isPlayerStung(state),
    intent: self.intent,
  };
  if (npc === 'gaston') {
    context.shopPrices = ITEMS.filter((i) => i.price > 0 || i.sellPrice > 0).map((i) => ({
      itemId: i.id, name: i.name, ...shopPrice(i.id, self.relation),
    }));
  }
  return context;
}
