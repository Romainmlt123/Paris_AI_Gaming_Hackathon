import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/initial';
import type { GameState } from '../state/types';
import { seededRng } from './rng';
import { distort, knowledgeOf, recordFact, transferRumor } from './rumors';
import { setBond } from './relations';

function withInsult(): GameState {
  return recordFact(createInitialState(), {
    day: 1, actor: 'player', target: 'marius', kind: 'insult', text: 'Le joueur a traité Marius de vieux radoteur.', witnesses: ['marius'],
  });
}

describe('rumeurs', () => {
  it('recordFact crée le fait et une rumeur fidèle chez chaque témoin', () => {
    const s = withInsult();
    expect(s.facts).toHaveLength(1);
    expect(s.rumors).toEqual([expect.objectContaining({ factId: 'f1', holder: 'marius', distortion: 0 })]);
    const k = knowledgeOf(s, 'marius');
    expect(k.knownFacts[0]).toContain('vieux radoteur');
    expect(k.heardRumors).toEqual([]);
  });

  it('transferRumor : le receveur retient, garde la moins déformée', () => {
    let s = withInsult();
    s = transferRumor(s, { from: 'marius', to: 'josette', sourceId: 'f1', text: 'version 2', distortion: 2 }, 2);
    s = transferRumor(s, { from: 'marius', to: 'josette', sourceId: 'f1', text: 'version 1', distortion: 1 }, 2);
    s = transferRumor(s, { from: 'marius', to: 'josette', sourceId: 'f1', text: 'version 3', distortion: 3 }, 2);
    const j = s.rumors.filter((r) => r.holder === 'josette');
    expect(j).toHaveLength(1);
    expect(j[0]?.text).toBe('version 1');
    expect(knowledgeOf(s, 'josette').heardRumors[0]).toContain('raconté par Marius');
  });

  it('bond < -30 : le receveur ne retient pas ; source inconnue ou soi-même : ignoré', () => {
    let s = setBond(withInsult(), 'marius', 'gaston', -50);
    expect(transferRumor(s, { from: 'marius', to: 'gaston', sourceId: 'f1', text: 'x', distortion: 1 }, 2)).toBe(s);
    expect(transferRumor(s, { from: 'marius', to: 'josette', sourceId: 'nope', text: 'x', distortion: 1 }, 2)).toBe(s);
    expect(transferRumor(s, { from: 'marius', to: 'marius', sourceId: 'f1', text: 'x', distortion: 1 }, 2)).toBe(s);
    s = transferRumor(s, { from: 'marius', to: 'josette', sourceId: 'f1', text: 'x', distortion: 1 }, 2);
    // relais via l'id de rumeur : garde le factId d'origine
    const jr = s.rumors.find((r) => r.holder === 'josette');
    expect(jr?.factId).toBe('f1');
  });

  it('distort est déterministe et ne touche pas au niveau 0', () => {
    const t = 'Le joueur a traité Marius de vieux radoteur.';
    expect(distort(t, 0, seededRng(1))).toBe(t);
    expect(distort(t, 1, seededRng(1))).toBe(distort(t, 1, seededRng(1)));
    expect(distort(t, 1, () => 0)).toBe("Il paraît que le joueur a traité Marius de vieux radoteur.");
    expect(distort(t, 2, () => 0)).toContain('et en plus');
  });
});
