import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/initial';
import { applyRelationDelta, bondKey, clampRelation, getBond, perkText, RELATION_LOG_MAX, tierOf } from './relations';

describe('relations', () => {
  it('clamp -100..100 et arrondit', () => {
    expect(clampRelation(250)).toBe(100);
    expect(clampRelation(-999)).toBe(-100);
    expect(clampRelation(12.6)).toBe(13);
    expect(clampRelation(Number.NaN)).toBe(0);
  });

  it('bondKey est trié', () => {
    expect(bondKey('marius', 'josette')).toBe('josette|marius');
    expect(bondKey('josette', 'marius')).toBe('josette|marius');
    const s = createInitialState();
    expect(getBond(s, 'marius', 'josette')).toBe(70);
    expect(getBond(s, 'marius', 'gaston')).toBe(-10);
  });

  it('paliers aux bornes', () => {
    expect(tierOf(-60).name).toBe('Ennemi juré');
    expect(tierOf(-59).name).toBe('Froid');
    expect(tierOf(-20).name).toBe('Froid');
    expect(tierOf(-19).name).toBe('Voisin');
    expect(tierOf(19).name).toBe('Voisin');
    expect(tierOf(20).name).toBe('Copain');
    expect(tierOf(49).name).toBe('Copain');
    expect(tierOf(50).name).toBe('Ami');
    expect(tierOf(79).name).toBe('Ami');
    expect(tierOf(80).name).toBe('Confident');
    expect(perkText('gaston', 85)).toContain('20 %');
    expect(perkText('josette', 30)).toContain('ragots exclusifs');
    expect(perkText('marius', 10)).toContain('garde son secret');
  });

  it('plafonne |delta| à 15, journalise, ne mute pas', () => {
    const s = createInitialState();
    const next = applyRelationDelta(s, 'marius', -80, 'Insulté', 1234);
    expect(next.npcs.marius.relation).toBe(-5);
    expect(s.npcs.marius.relation).toBe(10);
    expect(next.relationLog).toEqual([{ npc: 'marius', delta: -15, reason: 'Insulté', day: 1, at: 1234 }]);
    expect(s.relationLog).toEqual([]);
  });

  it('delta réel borné par 100 et journal plafonné', () => {
    let s = createInitialState();
    for (let i = 0; i < 60; i++) s = applyRelationDelta(s, 'josette', i % 2 ? 5 : -5, `x${i}`, i);
    expect(s.relationLog).toHaveLength(RELATION_LOG_MAX);
    expect(s.relationLog[RELATION_LOG_MAX - 1]?.reason).toBe('x59');
    s = { ...s, npcs: { ...s.npcs, gaston: { ...s.npcs.gaston, relation: 95 } } };
    const n = applyRelationDelta(s, 'gaston', 15, 'Flatté', 0);
    expect(n.npcs.gaston.relation).toBe(100);
    expect(n.relationLog.at(-1)?.delta).toBe(5);
    expect(applyRelationDelta(n, 'gaston', 10, 'Encore', 0)).toBe(n); // rien ne change → même état
  });
});
