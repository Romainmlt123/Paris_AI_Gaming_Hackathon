import type { Game } from '../game';
import { store } from '../state/store';
import { addItem } from '../logic/economy';
import type { NpcId, SlotId } from '../state/types';

/**
 * API pilotable du scénario de démo (Playwright, vidéo) : window.__ragots.
 * Chaque étape passe par les mêmes chemins de code que le joueur.
 */
export interface DemoApi {
  reset(): void;
  talk(npc: NpcId): void;
  say(text: string): Promise<void>;
  close(): void;
  sleep(hours?: number): Promise<void>;
  give(itemId: string, qty?: number): void;
  bells(n: number): void;
  place(slot: SlotId, itemId: string): void;
  tap(x: number, y: number): void;
  state(): unknown;
  forceShake(r: number): void;
  forceFish(itemId: string): void;
  shake(tree: number): void;
  fishAt(x: number, z: number): void;
}

export function installDemo(game: Game): void {
  const api: DemoApi = {
    reset: () => {
      store.reset();
      location.reload();
    },
    talk: (npc) => game.openTalk(npc),
    say: (text) => game.say(text, null),
    close: () => game.closeTalk(),
    sleep: (hours = 8) => game.sleep(hours),
    give: (itemId, qty = 1) => {
      const r = addItem(store.get(), itemId, qty);
      if (r.ok) store.set(r.state);
      else console.warn(`[demo] give ${itemId} impossible : ${r.reason}`);
    },
    bells: (n) => store.set((s) => ({ ...s, player: { ...s.player, bells: n } })),
    place: (slot, itemId) => game.place(slot, itemId),
    tap: (x, y) => game.world.handleTap(x, y),
    state: () => store.get(),
    forceShake: (r) => (game.force.shake = r),
    forceFish: (itemId) => (game.force.fish = itemId),
    shake: (tree) => game.shakeTree(tree),
    fishAt: (x, z) => game.fishAt(x, z),
  };
  (window as unknown as { __ragots: DemoApi }).__ragots = api;
}
