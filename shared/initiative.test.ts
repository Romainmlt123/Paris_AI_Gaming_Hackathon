import { describe, expect, it } from 'vitest';
import { buyClothes, CLOTHES_PRICE } from './economy';
import { IDLE_TRIGGER_SEC, markInitiative, pickInitiative } from './initiative';
import { advanceClock, routineStep } from './routine';
import { createInitialState } from './state';
import type { NpcId } from './types';

const none = new Set<NpcId>();

describe('initiatives', () => {
  it('Josette rushes to the naked castaway first, then Gaston, then Marius', () => {
    let s = createInitialState();
    const first = pickInitiative(s, 0, none);
    expect(first?.npc).toBe('josette');
    expect(first?.trigger).toBe('nu');
    s = markInitiative(s, 'josette', 'nu');
    expect(pickInitiative(s, 0, none)?.npc).toBe('gaston');
    s = markInitiative(s, 'gaston', 'nu');
    expect(pickInitiative(s, 0, none)).toBeNull();
    expect(pickInitiative(s, 10, none)?.npc).toBe('marius');
  });

  it('skips blocked NPCs and does not repeat a trigger the same day', () => {
    let s = createInitialState();
    expect(pickInitiative(s, 0, new Set<NpcId>(['josette']))?.npc).toBe('gaston');
    s = markInitiative(s, 'josette', 'nu');
    expect(pickInitiative(s, 0, new Set<NpcId>(['gaston']))?.npc).not.toBe('josette');
    s = { ...s, day: s.day + 1 };
    expect(pickInitiative(s, 0, none)?.npc).toBe('josette');
  });

  it('reacts to other states once dressed', () => {
    let s = { ...createInitialState(), outfit: 'habille' as const };
    expect(pickInitiative(s, 0, none)).toBeNull();
    expect(pickInitiative(s, IDLE_TRIGGER_SEC, none)?.npc).toBe('marius');
    s = { ...s, coins: 20 };
    expect(pickInitiative(s, 0, none)?.trigger).toBe('fauche');
    s = { ...s, npcs: { ...s.npcs, josette: { ...s.npcs.josette, intent: 'Te parler de la statue' } } };
    expect(pickInitiative(s, 0, none)).toMatchObject({ npc: 'josette', trigger: 'rumeur' });
  });

  it('Gaston sells clothes only to a naked player who can pay', () => {
    const s = createInitialState();
    const dressed = buyClothes(s, CLOTHES_PRICE);
    expect(dressed?.outfit).toBe('habille');
    expect(dressed?.coins).toBe(s.coins - CLOTHES_PRICE);
    expect(dressed && buyClothes(dressed, CLOTHES_PRICE)).toBeNull();
    expect(buyClothes({ ...s, coins: 10 }, CLOTHES_PRICE)).toBeNull();
  });
});

describe('routines', () => {
  it('follows the clock and visits friends', () => {
    const s = createInitialState();
    expect(routineStep({ ...s, clock: 8 * 60 }, 'josette').label).toBe('sort les fournées');
    expect(routineStep({ ...s, clock: 6 * 60 }, 'marius').label).toBe('pêche au bout du ponton');
    const visit = routineStep({ ...s, clock: 14 * 60 }, 'josette');
    expect(visit.visiting).toBe('marius');
    expect(routineStep({ ...s, clock: 3 * 60 }, 'gaston').visiting).toBeNull();
  });

  it('rolls the clock over to the next day', () => {
    const s = advanceClock({ ...createInitialState(), clock: 23 * 60 + 50 }, 20);
    expect(s.clock).toBe(10);
    expect(s.day).toBe(2);
  });
});
