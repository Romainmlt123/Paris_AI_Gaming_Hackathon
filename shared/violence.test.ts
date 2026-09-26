import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { clashFor, moodOf, percentOf, resolveFight, resolveMurder, resolveSlap, MURDER_RESET, FIGHT_RELIEF } from './violence';

describe('violence', () => {
  it('maps relation to gauge percent', () => {
    expect(percentOf(-100)).toBe(0);
    expect(percentOf(-80)).toBe(10);
    expect(percentOf(100)).toBe(100);
  });

  it('slaps under 35 %, fights when crossing 20 % downward, murders at 0 %', () => {
    expect(clashFor(-20, -28)).toBeNull();
    expect(clashFor(-20, -30)).toBe('slap');
    expect(clashFor(-40, -45)).toBe('slap');
    expect(clashFor(-45, -40)).toBeNull();
    expect(clashFor(-50, -60)).toBe('fight');
    expect(clashFor(-62, -70)).toBe('slap');
    expect(clashFor(-90, -100)).toBe('murder');
    expect(clashFor(-60, -100)).toBe('murder');
    expect(clashFor(-100, -90)).toBeNull();
  });

  it('shows danger moods', () => {
    expect(moodOf(-50)).toBe('skull');
    expect(moodOf(-35)).toBe('storm');
    expect(moodOf(0)).toBeNull();
    expect(moodOf(60)).toBe('heart');
  });

  it('a slap becomes a rumor without changing the gauge', () => {
    const s = createInitialState();
    s.npcs.gaston.relation = -40;
    const next = resolveSlap(s, 'gaston');
    expect(next.npcs.gaston.relation).toBe(-40);
    expect(next.facts.at(-1)?.actor).toBe('gaston');
  });

  it('a fight vents rage and becomes a rumor', () => {
    const s = createInitialState();
    s.npcs.marius.relation = -62;
    const { state, change } = resolveFight(s, 'marius');
    expect(state.npcs.marius.relation).toBe(-62 + FIGHT_RELIEF);
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
