import { describe, expect, it } from 'vitest';
import { classifyMessage, fallbackTalk } from './fallback';
import { applyRelationDelta, tierOf } from './relations';
import { recordFact, rumorOf, transferRumor } from './rumors';
import { applySimResult, simulateFallback } from './simulate';
import { applyTalkResult, buildTalkContext, createInitialState } from './state';
import { parseSimResult, parseTalkResult } from './validate';

describe('relations', () => {
  it('clamps and records changes', () => {
    const s = createInitialState();
    const { state, change } = applyRelationDelta(s, 'marius', -500, 'test');
    expect(state.npcs.marius.relation).toBe(-100);
    expect(change?.delta).toBe(-105);
    expect(s.npcs.marius.relation).toBe(5);
  });
  it('names tiers', () => {
    expect(tierOf(-80).label).toBe('Sworn enemy');
    expect(tierOf(0).label).toBe('Neighbor');
    expect(tierOf(60).label).toBe('Confidant');
  });
});

describe('rumors', () => {
  it('only transfers rumors the speaker knows', () => {
    let s = createInitialState();
    s = recordFact(s, { actor: 'player', text: 'The player insulted Marius', severity: -2, witnesses: ['marius'] }).state;
    const factId = s.facts[0]!.id;
    expect(transferRumor(s, 'gaston', 'josette', factId, 'x').rumor).toBeNull();
    const moved = transferRumor(s, 'marius', 'josette', factId, 'Word is…');
    expect(moved.rumor?.distortion).toBe(1);
    expect(rumorOf(moved.state, 'josette', factId)?.source).toBe('marius');
    expect(rumorOf(moved.state, 'marius', factId)?.text).toBe('The player insulted Marius');
  });
});

describe('validation', () => {
  it('rejects garbage and bounds values', () => {
    expect(parseTalkResult('nope')).toBeNull();
    expect(parseTalkResult({ reply: '' })).toBeNull();
    const r = parseTalkResult({ reply: 'Salut', emotion: 'furieux', relationDelta: -999, events: [{ text: 'x', severity: 9 }, 3] });
    expect(r?.emotion).toBe('neutre');
    expect(r?.relationDelta).toBe(-20);
    expect(r?.events).toEqual([{ text: 'x', severity: 3 }]);
  });
  it('drops malformed simulation entries', () => {
    const r = parseSimResult({ conversations: [{ a: 'josette', b: 'josette', summary: 'x' }, { a: 'josette', b: 'marius', summary: 'ok' }], transfers: [{ from: 'bob', to: 'marius', factId: 'f1', text: 'x' }] });
    expect(r?.conversations).toHaveLength(1);
    expect(r?.transfers).toHaveLength(0);
  });
});

describe('fallback talk', () => {
  it('classifies intents', () => {
    expect(classifyMessage('You\u2019re an old idiot, Marius')).toBe('insult');
    expect(classifyMessage("That's not true, I didn't say anything!")).toBe('denial');
    expect(classifyMessage('Your croissants are delicious')).toBe('compliment');
  });
  it('catches a lie when the npc knows the rumor', () => {
    let s = createInitialState();
    s = recordFact(s, { actor: 'player', text: 'The player insulted Marius', severity: -2, witnesses: ['josette'] }).state;
    const r = fallbackTalk('josette', "That's a lie, I never said that", buildTalkContext(s, 'josette'));
    expect(r.relationDelta).toBe(-15);
    expect(r.emotion).toBe('mefiance');
  });
});

describe('demo scenario', () => {
  it('insult Marius → 8h later Josette knows, is angry and wants to talk', () => {
    let s = createInitialState();
    const talk = fallbackTalk('marius', 'T\u2019es qu\u2019un vieux croulant idiot', buildTalkContext(s, 'marius'));
    s = applyTalkResult(s, 'marius', 'T\u2019es qu\u2019un vieux croulant idiot', talk).state;
    expect(s.npcs.marius.relation).toBeLessThan(0);
    const josetteBefore = s.npcs.josette.relation;
    const sim = simulateFallback(s, 8);
    const { state, recap } = applySimResult(s, sim, 8);
    const factId = state.facts[0]!.id;
    expect(rumorOf(state, 'josette', factId)?.source).toBe('marius');
    expect(state.npcs.josette.relation).toBeLessThan(josetteBefore);
    expect(state.npcs.josette.intent).not.toBeNull();
    expect(recap.some((e) => e.kind === 'rumor')).toBe(true);
    expect(state.clock).toBe((17 * 60 + 40 + 8 * 60) % (24 * 60));
    expect(state.day).toBe(2);
  });
  it('ignores AI transfers from NPCs who do not know the fact', () => {
    let s = createInitialState();
    s = recordFact(s, { actor: 'player', text: 'x', severity: -2, witnesses: ['marius'] }).state;
    const { state } = applySimResult(
      s,
      { conversations: [], transfers: [{ from: 'gaston', to: 'josette', factId: 'f1', text: 'faux' }], intents: [], bondChanges: [], source: 'ai' },
      8,
    );
    expect(rumorOf(state, 'josette', 'f1')).toBeUndefined();
    expect(state.npcs.josette.relation).toBe(10);
  });
});
