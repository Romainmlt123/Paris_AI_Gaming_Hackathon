import { describe, expect, it } from 'vitest';
import { addCatch, BAG_FISH_MAX, FISH, giveFish, rollFish } from './fishing';
import { createInitialState } from './state';

describe('fishing', () => {
  it('draws common fish most of the time and legendary ones rarely', () => {
    expect(rollFish(0)).toBe('sardine');
    expect(FISH[rollFish(0.999)].rarity).toBe('junk');
    const counts = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const id = rollFish(i / 1000);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.get('sardine') ?? 0).toBeGreaterThan(counts.get('poulpe_dore') ?? 0);
    expect(counts.get('poulpe_dore') ?? 0).toBeGreaterThan(0);
  });

  it('stores catches in the bag up to the limit', () => {
    let s = createInitialState();
    for (let i = 0; i < BAG_FISH_MAX; i++) {
      const r = addCatch(s, 'bar');
      if (!r.ok) throw new Error('bag full too early');
      s = r.state;
    }
    expect(s.fish).toHaveLength(BAG_FISH_MAX);
    expect(addCatch(s, 'bar').ok).toBe(false);
  });

  it('Gaston buys fish for coins', () => {
    const s = { ...createInitialState(), fish: ['dorade' as const] };
    const out = giveFish(s, 'gaston', 'dorade');
    expect(out?.coins).toBe(FISH.dorade.value);
    expect(out?.state.coins).toBe(s.coins + FISH.dorade.value);
    expect(out?.state.fish).toHaveLength(0);
  });

  it('a rare gift wins Marius over and becomes a rumor; a boot annoys', () => {
    const s = { ...createInitialState(), fish: ['espadon' as const, 'botte' as const] };
    const out = giveFish(s, 'marius', 'espadon');
    expect(out?.state.npcs.marius.relation).toBeGreaterThan(s.npcs.marius.relation);
    expect(out?.state.facts.at(-1)?.text).toContain('swordfish');
    const boot = giveFish(s, 'josette', 'botte');
    expect(boot?.state.npcs.josette.relation).toBeLessThan(s.npcs.josette.relation);
    expect(giveFish(s, 'gaston', 'poulpe')).toBeNull();
  });
});
