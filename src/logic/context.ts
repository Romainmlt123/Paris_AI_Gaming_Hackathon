import { item } from '../data/items.ts';
import { NPCS } from '../data/npcs.ts';
import type { Deal, GameState, NpcContext, NpcId } from '../state/types.ts';
import { NPC_IDS } from '../state/types.ts';
import { SHOP_ITEMS } from '../data/items.ts';
import { islandValue } from './economy.ts';
import { getBond, priceFactor, tierOf } from './relations.ts';

/** Ce que l'habitant sait, construit par le code : c'est tout ce que l'IA verra. */
export function buildContext(state: GameState, npc: NpcId, opts: { offeredItemId?: string | null; deal?: Deal | null } = {}): NpcContext {
  const st = state.npcs[npc];
  const knownFacts = state.facts.filter((f) => f.witnesses.includes(npc)).slice(-10).map((f) => ({ id: f.id, text: f.text }));
  const heardRumors = state.rumors
    .filter((r) => r.holder === npc)
    .slice(-8)
    .map((r) => ({ id: r.id, factId: r.factId, text: r.text, from: r.heardFrom === 'player' ? state.player.name : NPCS[r.heardFrom].name }));
  const pf = priceFactor(st.relation);
  const offered = opts.offeredItemId ? item(opts.offeredItemId) : null;
  return {
    day: state.day,
    hour: state.hour,
    relation: st.relation,
    tier: tierOf(st.relation).name,
    mood: st.mood,
    memories: st.memories.slice(-6),
    knownFacts,
    heardRumors,
    bonds: NPC_IDS.filter((n) => n !== npc).map((n) => ({ npc: n, value: getBond(state, npc, n) })),
    inventory: state.player.inventory.map((s) => ({ itemId: s.itemId, name: item(s.itemId).name, qty: s.qty })),
    shopPrices:
      npc === 'gaston'
        ? SHOP_ITEMS.map((id) => {
            const d = item(id);
            return { itemId: id, name: d.name, price: Math.round(d.price * pf), sellPrice: Math.round(d.sellPrice / pf) };
          })
        : undefined,
    deal: opts.deal ?? null,
    decor: Object.values(state.decor).flatMap((id) => (id ? [item(id).name] : [])),
    islandValue: islandValue(state),
    playerStung: state.player.stungUntilDay !== null,
    intent: st.intent,
    liesCaught: st.caughtLies,
    denial: null,
    offeredItem: offered ? { itemId: offered.id, name: offered.name, tags: offered.tags } : null,
  };
}
