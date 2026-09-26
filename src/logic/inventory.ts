import { item } from '../data/items.ts';
import type { InvSlot } from '../state/types.ts';

export const INVENTORY_SIZE = 16;

export function countItem(inv: InvSlot[], itemId: string): number {
  return inv.filter((s) => s.itemId === itemId).reduce((n, s) => n + s.qty, 0);
}

export function freeRoomFor(inv: InvSlot[], itemId: string): number {
  const def = item(itemId);
  const partial = inv.filter((s) => s.itemId === itemId).reduce((n, s) => n + (def.stack - s.qty), 0);
  return partial + (INVENTORY_SIZE - inv.length) * def.stack;
}

/** Ajoute des objets en remplissant les piles. Retourne la quantité réellement ajoutée. */
export function addItem(inv: InvSlot[], itemId: string, qty: number): number {
  const def = item(itemId);
  let left = qty;
  for (const s of inv) {
    if (left <= 0) break;
    if (s.itemId !== itemId) continue;
    const room = def.stack - s.qty;
    const put = Math.min(room, left);
    s.qty += put;
    left -= put;
  }
  while (left > 0 && inv.length < INVENTORY_SIZE) {
    const put = Math.min(def.stack, left);
    inv.push({ itemId, qty: put });
    left -= put;
  }
  return qty - left;
}

/** Retire des objets ; retourne false (sans rien modifier) s'il n'y en a pas assez. */
export function removeItem(inv: InvSlot[], itemId: string, qty: number): boolean {
  if (countItem(inv, itemId) < qty) return false;
  let left = qty;
  for (let i = inv.length - 1; i >= 0 && left > 0; i--) {
    const s = inv[i];
    if (!s || s.itemId !== itemId) continue;
    const take = Math.min(s.qty, left);
    s.qty -= take;
    left -= take;
    if (s.qty === 0) inv.splice(i, 1);
  }
  return true;
}
