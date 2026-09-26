import { describe, expect, it } from 'vitest';
import { fallbackTalk } from './fallback';
import { arrivalFactText, cleanIsland, cleanLook, cleanName, DEFAULT_LOOK, NAME_MAX, playerLabel, randomLook } from './player';
import { buildSimRequest } from './simulate';
import { applyTalkResult, buildTalkContext, createInitialState } from './state';
import { resolveFight, resolveMurder } from './violence';

describe('player name', () => {
  it('cleans what the jury types', () => {
    expect(cleanName('  Jean   Kévin \n')).toBe('Jean Kévin');
    expect(cleanName('Jean\nKévin')).toBe('Jean Kévin');
    expect(cleanName('Jean\tKévin')).toBe('Jean Kévin');
    expect(cleanName('<b>Bob</b>')).toBe('bBob/b');
    expect(cleanName('x'.repeat(40))).toHaveLength(NAME_MAX);
    expect(cleanName(42)).toBe('');
    expect(playerLabel('')).toBe('Le joueur');
  });

  it('is sent to the AI context and used in facts and fallback replies', () => {
    const s = createInitialState('Brigitte');
    const ctx = buildTalkContext(s, 'josette');
    expect(ctx.playerName).toBe('Brigitte');
    const hello = fallbackTalk('josette', 'Bonjour !', ctx);
    expect(hello.reply.startsWith('Brigitte !')).toBe(true);
    const insult = fallbackTalk('marius', 'T\u2019es qu\u2019un idiot', buildTalkContext(s, 'marius'));
    expect(insult.events[0]?.text).toContain('Brigitte a insulté');
    const after = applyTalkResult(s, 'marius', 'T\u2019es qu\u2019un idiot', insult).state;
    expect(after.facts.at(-1)?.text).toContain('Brigitte');
  });

  it('names the player in fight and murder rumors', () => {
    const s = createInitialState('Momo');
    expect(resolveFight(s, 'gaston').state.facts.at(-1)?.text).toContain('Momo et Gaston');
    expect(resolveMurder(s, 'josette').state.facts.at(-1)?.text).toContain('assassiné Momo');
  });
});

describe('onboarding profile', () => {
  it('keeps only offered look values', () => {
    expect(cleanLook({ skin: '#8d5a3b', hair: 'red', hairStyle: 'cap', shirt: '#e0564a', extra: 1 })).toEqual({ skin: '#8d5a3b', hair: DEFAULT_LOOK.hair, hairStyle: 'cap', shirt: '#e0564a' });
    expect(cleanLook(null)).toBeNull();
    const look = randomLook(() => 0.99);
    expect(cleanLook(look)).toEqual(look);
  });

  it('gives the island name to the AI and plants the arrival rumor', () => {
    const s = createInitialState('Momo', 'Potinville', DEFAULT_LOOK);
    expect(buildTalkContext(s, 'gaston').islandName).toBe('Potinville');
    expect(buildSimRequest(s, 8).islandName).toBe('Potinville');
    expect(cleanIsland('  Île   <x>  ')).toBe('Île x');
    expect(arrivalFactText('Momo', 'Potinville')).toBe('Momo a débarqué tout nu sur un radeau à Potinville');
    expect(arrivalFactText('', '')).toBe('Le joueur a débarqué tout nu sur un radeau');
  });
});
