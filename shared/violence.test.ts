import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { clashFor, moodOf, percentOf, resolveFight, resolveMurder, MURDER_RESET, FIGHT_RELIEF } from './violence';

describe('violence', () => {
  it('maps relation to gauge percent', () => {
    expect(percentOf(-100)).toBe(0);
    expect(percentOf(-80)).toBe(10);
    expect(percentOf(100)).toBe(100);
  });

  it('fights when crossing 10 % downward, murders at 0 %', () => {
    expect(clashFor(-70, -80)).toBe('fight');
    expect(clashFor(-82, -90)).toBeNull();
    expect(clashFor(-90, -100)).toBe('murder');
    expect(clashFor(-60, -100)).toBe('murder');
    expect(clashFor(-100, -90)).toBeNull();
  });

  it('shows danger moods', () => {
    expect(moodOf(-70)).toBe('skull');
    expect(moodOf(-55)).toBe('storm');
    expect(moodOf(0)).toBeNull();
    expect(moodOf(60)).toBe('heart');
  });

  it('a fight vents rage and becomes a rumor', () => {
    const s = createInitialState();
    s.npcs.marius.relation = -82;
    const { state, change } = resolveFight(s, 'marius');
    expect(state.npcs.marius.relation).toBe(-82 + FIGHT_RELIEF);
    expect(change?.delta).toBe(FIGHT_RELIEF);
    expect(state.rumors.some((r) => r.holder === 'marius')).toBe(true);
  });

  it('a murder skips to the next morning, halves coins and tells everyone', () => {
    const s = createInitialState();
    s.npcs.josette.relation = -100;
    const { state } = resolveMurder(s, 'josette');
    expect(state.day).toBe(2);
    expect(state.coins).toBe(600);
    expect(state.npcs.josette.relation).toBe(MURDER_RESET);
    expect(state.npcs.gaston.intent).not.toBeNull();
    expect(state.npcs.marius.intent).not.toBeNull();
    expect(state.rumors.filter((r) => r.factId === state.facts.at(-1)?.id)).toHaveLength(3);
  });
});
