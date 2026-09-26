import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/initial';
import { applyAbsence, buildAbsenceRequest, simulateAbsenceFallback } from './absence';
import { buildNpcContext } from './context';
import { seededRng } from './rng';
import { applyTalkResponse } from './talk';
import { validateAbsenceResponse, validateTalkResponse } from './validate';

/** Scénario de démo (CLAUDE.md §12) : on insulte Marius, on revient 8 h plus tard. */
function insultMarius() {
  const resp = validateTalkResponse({
    reply: 'Vieux radoteur ?! Tu peux causer, toi…', emotion: 'colere', relationDelta: -30, reason: 'Traité de vieux radoteur',
    events: [{ kind: 'insult', text: 'Le joueur a traité Marius de vieux radoteur.' }],
  }, { npc: 'marius' });
  return applyTalkResponse(createInitialState(), 'marius', resp, 1000);
}

describe('absence (repli sans IA)', () => {
  it('Marius raconte tout à Josette, qui vient demander des comptes', () => {
    const s0 = insultMarius();
    expect(s0.npcs.marius.relation).toBe(-5);
    expect(s0.npcs.marius.mood).toBe('colere');

    const resp = simulateAbsenceFallback(s0, 8, seededRng(42));
    expect(resp.fallback).toBe(true);
    expect(resp.transfers).toEqual([expect.objectContaining({ from: 'marius', to: 'josette', sourceId: 'f1', distortion: 1 })]);
    expect(resp.intents[0]).toMatchObject({ npc: 'josette', intent: { kind: 'confront', about: 'f1' } });
    expect(resp.recap.length).toBeGreaterThan(0);
    expect(resp.recap.length).toBeLessThanOrEqual(6);
    // la réponse de repli passe elle-même la validation
    expect(validateAbsenceResponse(resp, s0)?.transfers).toHaveLength(1);

    const s1 = applyAbsence(s0, resp, 8, 2000);
    expect(s1.day).toBe(2);
    expect(s1.hour).toBe(8);
    expect(s1.npcs.josette.intent?.kind).toBe('confront');
    expect(s1.npcs.josette.relation).toBeLessThan(10);
    expect(s1.pendingRecap?.relationChanges[0]?.npc).toBe('josette');
    expect(s1.pickups.every((p) => p.id.startsWith('p2-'))).toBe(true);
    const josette = buildNpcContext(s1, 'josette');
    expect(josette.heardRumors.join(' ')).toContain('vieux radoteur');
    expect(josette.shopPrices).toBeUndefined();
    expect(buildNpcContext(s1, 'gaston').shopPrices?.length).toBeGreaterThan(0);
    // Gaston (lien -10 avec Marius) n'est pas au courant
    expect(buildNpcContext(s1, 'gaston').heardRumors).toEqual([]);
  });

  it('pas de redite : à la seconde absence, rien de neuf à raconter', () => {
    const s0 = insultMarius();
    const s1 = applyAbsence(s0, simulateAbsenceFallback(s0, 8, seededRng(1)), 8, 0);
    const again = simulateAbsenceFallback(s1, 8, seededRng(1));
    expect(again.transfers).toEqual([]);
    expect(again.recap.length).toBeGreaterThan(0);
  });

  it('déterministe et sans fait → récap d’ambiance', () => {
    const s = createInitialState();
    expect(simulateAbsenceFallback(s, 3, seededRng(7))).toEqual(simulateAbsenceFallback(s, 3, seededRng(7)));
    const n = applyAbsence(s, simulateAbsenceFallback(s, 3, seededRng(7)), 3, 0);
    expect(n.day).toBe(1);
    expect(n.hour).toBe(20);
    expect(n.pickups).toBe(s.pickups);
  });

  it('buildAbsenceRequest expose les 3 liens', () => {
    const req = buildAbsenceRequest(insultMarius(), 8);
    expect(req.bonds).toHaveLength(3);
    expect(req.facts[0]?.witnesses).toEqual(['marius']);
  });
});
