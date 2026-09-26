import { describe, expect, it } from 'vitest';
import { buildGazette } from './gazette';
import { applyRelationDelta } from './relations';
import { recordFact } from './rumors';
import { applySimResult, simulateFallback } from './simulate';
import { createInitialState } from './state';

describe('gazette', () => {
  it('headlines the worst relation drop', () => {
    const before = createInitialState();
    const after = applyRelationDelta(before, 'marius', -30, 'insulte').state;
    const g = buildGazette(before, after, []);
    expect(g.headline).toMatch(/MARIUS/);
    expect(g.articles.some((a) => a.rubric === 'Popularity Index' && a.body.includes('-30'))).toBe(true);
  });

  it('reports spread rumors and who wants to talk', () => {
    let s = createInitialState();
    s = recordFact(s, { actor: 'player', text: 'Le joueur a insulté Marius', severity: -2, witnesses: ['marius'] }).state;
    const { state, recap } = applySimResult(s, simulateFallback(s, 8), 8);
    const g = buildGazette(s, state, recap);
    expect(g.articles.map((a) => a.rubric)).toEqual(expect.arrayContaining(['Gossip', 'Classifieds']));
  });

  it('quotes what each islander thinks of the player', () => {
    const s = createInitialState();
    const result = { ...simulateFallback(s, 8), thoughts: [{ npc: 'gaston' as const, text: 'Il me doit trois clochettes.' }] };
    const { state, recap } = applySimResult(s, result, 8);
    const voices = buildGazette(s, state, recap).articles.find((a) => a.rubric === 'Word on the Street');
    expect(voices?.body).toContain('Il me doit trois clochettes.');
    expect(voices?.body).toMatch(/Josette/);
  });

  it('prints a calm headline when nothing happened', () => {
    const s = createInitialState();
    const g = buildGazette(s, s, []);
    expect(g.headline.length).toBeGreaterThan(10);
    expect(g.articles.some((a) => a.rubric === 'Gossip')).toBe(false);
  });
});
