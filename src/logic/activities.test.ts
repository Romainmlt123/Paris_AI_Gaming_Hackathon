import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/initial';
import { applyCatch, applyShake, feedPen, neglectFact, rollFish, rollShake } from './activities';
import { countItem } from './economy';

describe('activités', () => {
  it('une ruche pique le joueur et Josette veut se moquer', () => {
    const s0 = createInitialState();
    const out = rollShake(s0, 3, 'pomme', () => 0.05);
    expect(out.kind).toBe('bees');
    const s1 = applyShake(s0, 3, out, { x: 0, z: 0 });
    expect(s1.player.stungUntilDay).toBe(s0.day);
    expect(s1.npcs.josette.intent?.kind).toBe('mock');
    expect(rollShake(s1, 3, 'pomme', () => 0.5).kind).toBe('already');
    // Déjà piqué aujourd'hui : pas de seconde ruche.
    expect(rollShake(s1, 4, 'pomme', () => 0.05).kind).toBe('fruit');
  });

  it('un arbre secoué fait tomber des fruits ramassables', () => {
    const s0 = createInitialState();
    const s1 = applyShake(s0, 1, rollShake(s0, 1, 'figue', () => 0.7), { x: 2, z: 2 });
    expect(s1.pickups.length - s0.pickups.length).toBe(2);
    expect(s1.pickups.at(-1)?.itemId).toBe('figue');
  });

  it('pêche : le poulpe doré fait parler toute l’île', () => {
    expect(rollFish(() => 0.99).itemId).toBe('poulpe-dore');
    const r = applyCatch(createInitialState(), 'poulpe-dore');
    expect(r.ok && r.state.facts.at(-1)?.witnesses.length).toBe(3);
  });

  it('nourrir le mouton : un fruit contre une laine dorée, une fois par jour', () => {
    const s0 = createInitialState();
    const r = feedPen(s0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(countItem(r.state, 'laine-doree')).toBe(1);
    expect(countItem(r.state, 'pomme')).toBe(countItem(s0, 'pomme') - 1);
    expect(feedPen(r.state).ok).toBe(false);
    expect(neglectFact({ ...r.state, day: 2 }).facts.length).toBe(r.state.facts.length + 1);
  });
});
