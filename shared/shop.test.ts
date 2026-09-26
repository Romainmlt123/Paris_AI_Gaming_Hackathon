import { describe, expect, it } from 'vitest';
import { islandValue } from './economy';
import { buyItem, islandLevel, lookOf, nextLevel, priceOf, stockOf, toggleWear } from './shop';
import { createInitialState } from './state';

describe('island levels', () => {
  it('grows with island value', () => {
    expect(islandLevel(0).level).toBe(1);
    expect(islandLevel(150).level).toBe(2);
    expect(islandLevel(9999).level).toBe(3);
    expect(nextLevel(200)?.level).toBe(3);
    expect(nextLevel(9999)).toBeNull();
  });

  it('locks higher-tier stock until the island grows', () => {
    const s = createInitialState();
    const sofa = stockOf(s, 'echoppe').find((e) => e.item.id === 'canape');
    expect(sofa?.locked).toBe(true);
    expect(stockOf({ ...s, islandValue: 200 }, 'echoppe').find((e) => e.item.id === 'canape')?.locked).toBe(false);
    expect(buyItem(s, 'canape', islandValue)).toEqual({ ok: false, reason: 'locked' });
  });
});

describe('shop purchases', () => {
  it('furniture costs coins, adds prestige and cannot be bought twice', () => {
    const s = createInitialState();
    const res = buyItem(s, 'table', islandValue);
    if (!res.ok) throw new Error('purchase failed');
    expect(res.state.coins).toBe(s.coins - res.price);
    expect(res.state.owned).toContain('table');
    expect(res.state.islandValue).toBe(20);
    expect(buyItem(res.state, 'table', islandValue)).toEqual({ ok: false, reason: 'owned' });
  });

  it('refuses when broke', () => {
    expect(buyItem({ ...createInitialState(), coins: 10 }, 'table', islandValue)).toEqual({ ok: false, reason: 'coins' });
  });

  it('clothes are worn at once and can be taken off', () => {
    const res = buyItem(createInitialState(), 'bonnet', islandValue);
    if (!res.ok) throw new Error('purchase failed');
    expect(res.state.outfit.hat).toBe('bonnet');
    expect(lookOf(res.state).hat?.style).toBe('beanie');
    const off = toggleWear(res.state, 'bonnet');
    expect(off.outfit.hat).toBeNull();
    expect(lookOf(off).hat).toBeUndefined();
  });

  it('owners charge friends less and enemies more', () => {
    const s = createInitialState();
    const friend = structuredClone(s);
    friend.npcs.gaston.relation = 80;
    const enemy = structuredClone(s);
    enemy.npcs.gaston.relation = -90;
    expect(priceOf(friend, 'table')).toBeLessThan(priceOf(s, 'table'));
    expect(priceOf(enemy, 'table')).toBeGreaterThan(priceOf(s, 'table'));
  });
});
