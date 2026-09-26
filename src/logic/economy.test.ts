import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/initial';
import type { GameState } from '../state/types';
import { addItem, applyDeal, countItem, INVENTORY_SIZE, islandValue, placeDecor, removeItem, shopPrice } from './economy';

function ok(r: ReturnType<typeof addItem>): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe('économie', () => {
  it('empile jusqu’à la taille de pile puis ouvre une case', () => {
    const s = ok(addItem(createInitialState(), 'pomme', 12)); // 2 + 12 = 14 → 10 + 4
    expect(countItem(s, 'pomme')).toBe(14);
    expect(s.player.inventory.filter((x) => x.itemId === 'pomme').map((x) => x.qty)).toEqual([10, 4]);
  });

  it('inventaire plein → erreur, état inchangé', () => {
    let s = createInitialState();
    while (s.player.inventory.length < INVENTORY_SIZE) s = ok(addItem(s, 'phare', 1));
    const r = addItem(s, 'canne-a-peche');
    expect(r).toEqual({ ok: false, reason: 'inventory-full' });
    expect(ok(addItem(s, 'pomme', 8)).player.inventory.length).toBe(INVENTORY_SIZE); // la pile de pommes a de la place
    expect(addItem(s, 'pomme', 9)).toEqual({ ok: false, reason: 'inventory-full' });
    expect(addItem(s, 'licorne')).toEqual({ ok: false, reason: 'unknown-item' });
  });

  it('removeItem : absent → erreur, sinon retire et supprime la case vide', () => {
    const s = createInitialState();
    expect(removeItem(s, 'poulpe-dore')).toEqual({ ok: false, reason: 'not-enough-items' });
    const n = ok(removeItem(s, 'pomme', 2));
    expect(countItem(n, 'pomme')).toBe(0);
    expect(n.player.inventory).toHaveLength(2);
  });

  it('applyDeal : bourse insuffisante, achat, vente', () => {
    const s = createInitialState(); // 500 clochettes
    expect(applyDeal(s, { itemId: 'phare', direction: 'buy', qty: 1, price: 4000 })).toEqual({ ok: false, reason: 'not-enough-bells' });
    const bought = ok(applyDeal(s, { itemId: 'canne-a-peche', direction: 'buy', qty: 1, price: 380 }));
    expect(bought.player.bells).toBe(120);
    expect(countItem(bought, 'canne-a-peche')).toBe(1);
    expect(applyDeal(s, { itemId: 'bar-commun', direction: 'sell', qty: 1, price: 40 })).toEqual({ ok: false, reason: 'not-enough-items' });
    const sold = ok(applyDeal(s, { itemId: 'pomme', direction: 'sell', qty: 2, price: 22 }));
    expect(sold.player.bells).toBe(522);
    expect(s.player.bells).toBe(500);
  });

  it('shopPrice applique la remise du palier', () => {
    expect(shopPrice('canne-a-peche', 10).price).toBe(400);
    expect(shopPrice('canne-a-peche', 85).price).toBe(320);
    expect(shopPrice('canne-a-peche', -70).price).toBe(520);
  });

  it('placeDecor + islandValue ; l’ancien décor revient', () => {
    let s = ok(placeDecor(createInitialState(), 'placette', 'banc-bois-flotte'));
    expect(countItem(s, 'banc-bois-flotte')).toBe(0);
    expect(islandValue(s)).toBe(25);
    s = ok(addItem(s, 'phare'));
    s = ok(placeDecor(s, 'placette', 'phare'));
    expect(countItem(s, 'banc-bois-flotte')).toBe(1);
    expect(s.decor.placette).toBe('phare');
    expect(islandValue(s)).toBe(155);
    expect(placeDecor(s, 'plage', 'pomme')).toEqual({ ok: false, reason: 'not-decor' });
    expect(placeDecor(s, 'plage', 'fontaine-sculptee')).toEqual({ ok: false, reason: 'not-enough-items' });
  });
});
