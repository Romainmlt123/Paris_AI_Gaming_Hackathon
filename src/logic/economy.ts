import { getItem, isItemId } from '../data/items';
import type { DealProposal, GameState, InvSlot, SlotId } from '../state/types';
import { tierOf } from './relations';

export const INVENTORY_SIZE = 16;

export type EconomyError = 'unknown-item' | 'invalid-qty' | 'inventory-full' | 'not-enough-items' | 'not-enough-bells' | 'not-decor';
export type EconomyResult = { ok: true; state: GameState } | { ok: false; reason: EconomyError };

const fail = (reason: EconomyError): EconomyResult => ({ ok: false, reason });
const withInventory = (state: GameState, inventory: InvSlot[]): GameState => ({ ...state, player: { ...state.player, inventory } });

export function countItem(state: GameState, itemId: string): number {
  return state.player.inventory.reduce((n, s) => (s.itemId === itemId ? n + s.qty : n), 0);
}

/** Ajoute qty objets : complète les piles existantes puis ouvre des cases. Tout ou rien. */
export function addItem(state: GameState, itemId: string, qty = 1): EconomyResult {
  if (!isItemId(itemId)) return fail('unknown-item');
  if (!Number.isInteger(qty) || qty < 1) return fail('invalid-qty');
  const { stack } = getItem(itemId);
  let left = qty;
  const inventory = state.player.inventory.map((s) => {
    if (s.itemId !== itemId || left === 0) return s;
    const add = Math.min(stack - s.qty, left);
    if (add <= 0) return s;
    left -= add;
    return { ...s, qty: s.qty + add };
  });
  while (left > 0) {
    if (inventory.length >= INVENTORY_SIZE) return fail('inventory-full');
    const add = Math.min(stack, left);
    inventory.push({ itemId, qty: add });
    left -= add;
  }
  return { ok: true, state: withInventory(state, inventory) };
}

/** Retire qty objets (en partant des dernières piles). Tout ou rien. */
export function removeItem(state: GameState, itemId: string, qty = 1): EconomyResult {
  if (!isItemId(itemId)) return fail('unknown-item');
  if (!Number.isInteger(qty) || qty < 1) return fail('invalid-qty');
  if (countItem(state, itemId) < qty) return fail('not-enough-items');
  let left = qty;
  const inventory: InvSlot[] = [];
  for (const s of [...state.player.inventory].reverse()) {
    if (s.itemId === itemId && left > 0) {
      const take = Math.min(s.qty, left);
      left -= take;
      if (s.qty > take) inventory.push({ ...s, qty: s.qty - take });
    } else inventory.push(s);
  }
  return { ok: true, state: withInventory(state, inventory.reverse()) };
}

/** Prix unitaires chez Gaston selon la relation : remise (ou majoration) du palier à l'achat, moitié en bonus à la revente. */
export function shopPrice(itemId: string, relation: number): { price: number; sellPrice: number } {
  const item = getItem(itemId);
  const d = tierOf(relation).gastonDiscount;
  const price = item.price > 0 ? Math.max(1, Math.round(item.price * (1 - d / 100))) : 0;
  const sellPrice = item.sellPrice > 0 ? Math.max(1, Math.round(item.sellPrice * (1 + d / 200))) : 0;
  return { price, sellPrice };
}

/** Applique un marché déjà validé (validate.ts) et accepté par le joueur. */
export function applyDeal(state: GameState, deal: DealProposal): EconomyResult {
  if (!Number.isInteger(deal.price) || deal.price < 0) return fail('invalid-qty');
  if (deal.direction === 'buy') {
    if (state.player.bells < deal.price) return fail('not-enough-bells');
    const added = addItem(state, deal.itemId, deal.qty);
    if (!added.ok) return added;
    return { ok: true, state: { ...added.state, player: { ...added.state.player, bells: added.state.player.bells - deal.price } } };
  }
  const removed = removeItem(state, deal.itemId, deal.qty);
  if (!removed.ok) return removed;
  return { ok: true, state: { ...removed.state, player: { ...removed.state.player, bells: removed.state.player.bells + deal.price } } };
}

export const DECOR_SLOT_BONUS = 5;

/** Valeur de l'île = prestige des décors posés + 5 par emplacement occupé. */
export function islandValue(state: GameState): number {
  let value = 0;
  for (const id of Object.values(state.decor)) {
    if (id === null || !isItemId(id)) continue;
    value += getItem(id).prestige + DECOR_SLOT_BONUS;
  }
  return value;
}

/** Pose un décor de l'inventaire sur un emplacement ; l'ancien décor revient dans l'inventaire. */
export function placeDecor(state: GameState, slot: SlotId, itemId: string): EconomyResult {
  if (!isItemId(itemId)) return fail('unknown-item');
  if (getItem(itemId).kind !== 'decor') return fail('not-decor');
  const removed = removeItem(state, itemId, 1);
  if (!removed.ok) return removed;
  let next = removed.state;
  const previous = state.decor[slot];
  if (previous !== null) {
    const back = addItem(next, previous, 1);
    if (!back.ok) return back;
    next = back.state;
  }
  return { ok: true, state: { ...next, decor: { ...next.decor, [slot]: itemId } } };
}
