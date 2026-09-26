import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/initial';
import { recordFact } from './rumors';
import { validateAbsenceResponse, validateDeal, validateTalkResponse } from './validate';

const ctx = { npc: 'gaston' as const };

describe('validateTalkResponse', () => {
  it('déchets → réplique de secours', () => {
    for (const raw of [null, undefined, 42, 'pas du json {', '[]', [], { reply: '' }, { reply: 12 }, { reply: '   ' }]) {
      const r = validateTalkResponse(raw, ctx);
      expect(r.fallback).toBe(true);
      expect(r.reply.length).toBeGreaterThan(0);
      expect(r.relationDelta).toBe(0);
      expect(r.deal).toBeNull();
    }
  });

  it('accepte le JSON en chaîne entourée de ```json', () => {
    const r = validateTalkResponse('```json\n{"reply":"Salut !","emotion":"joie"}\n```', ctx);
    expect(r.reply).toBe('Salut !');
    expect(r.emotion).toBe('joie');
    expect(r.fallback).toBeUndefined();
  });

  it('borne tout le reste', () => {
    const r = validateTalkResponse({
      reply: 'x'.repeat(1000),
      emotion: 'furieux',
      relationDelta: -9999,
      reason: 42,
      events: [{ kind: 'insult', text: 'Insulte' }, { kind: 'hack', text: 'x' }, 'n', { kind: 'lie', text: 'a' }, { kind: 'gift', text: 'b' }, { kind: 'deal', text: 'c' }],
      suggestions: ['Ok', 'x'.repeat(49), 3, 'Non', 'Peut-être', 'Encore'],
      intent: { kind: 'dance', text: 'x' },
      deal: { itemId: 'canne-a-peche', direction: 'buy', qty: 1, price: 5 },
    }, ctx);
    expect(r.reply.length).toBeLessThanOrEqual(280);
    expect(r.emotion).toBe('neutre');
    expect(r.relationDelta).toBe(-15);
    expect(r.reason).toBe('');
    expect(r.events.map((e) => e.kind)).toEqual(['insult', 'lie', 'gift']);
    expect(r.suggestions).toEqual(['Ok', 'Non', 'Peut-être']);
    expect(r.intent).toBeNull();
    expect(r.deal).toBeNull();
    expect(validateTalkResponse({ reply: 'a', relationDelta: 7.6 }, ctx).relationDelta).toBe(8);
    expect(validateTalkResponse({ reply: 'a', relationDelta: 'NaN' }, ctx).relationDelta).toBe(0);
  });
});

describe('validateDeal', () => {
  it('bornes [0.5×, 2×] de la référence', () => {
    // canne : 400 → [200, 800]
    expect(validateDeal({ itemId: 'canne-a-peche', direction: 'buy', qty: 1, price: 200 })).not.toBeNull();
    expect(validateDeal({ itemId: 'canne-a-peche', direction: 'buy', qty: 1, price: 800 })).not.toBeNull();
    expect(validateDeal({ itemId: 'canne-a-peche', direction: 'buy', qty: 1, price: 801 })).toBeNull();
    expect(validateDeal({ itemId: 'canne-a-peche', direction: 'buy', qty: 1, price: 199 })).toBeNull();
    // vente de 3 bars : sellPrice 40 → ref 120 → [60, 240]
    expect(validateDeal({ itemId: 'bar-commun', direction: 'sell', qty: 3, price: 250 })).toBeNull();
    expect(validateDeal({ itemId: 'bar-commun', direction: 'sell', qty: 3, price: 100.4 })?.price).toBe(100);
  });
  it('rejette objet inconnu, qty hors 1..10, direction bizarre, achat non vendu', () => {
    expect(validateDeal({ itemId: 'licorne', direction: 'buy', qty: 1, price: 10 })).toBeNull();
    expect(validateDeal({ itemId: 'pomme', direction: 'buy', qty: 11, price: 220 })).toBeNull();
    expect(validateDeal({ itemId: 'pomme', direction: 'buy', qty: 0, price: 0 })).toBeNull();
    expect(validateDeal({ itemId: 'pomme', direction: 'steal', qty: 1, price: 20 })).toBeNull();
    expect(validateDeal({ itemId: 'carnet-gaston', direction: 'buy', qty: 1, price: 10 })).toBeNull();
  });
});

describe('validateAbsenceResponse', () => {
  const state = recordFact(createInitialState(), {
    day: 1, actor: 'player', target: 'marius', kind: 'insult', text: 'Insulte', witnesses: ['marius'],
  });
  it('non objet → null', () => {
    expect(validateAbsenceResponse('n importe quoi', state)).toBeNull();
    expect(validateAbsenceResponse(7, state)).toBeNull();
  });
  it('filtre et borne', () => {
    const r = validateAbsenceResponse({
      conversations: [{ a: 'marius', b: 'josette', summary: 'Ragots' }, { a: 'marius', b: 'marius', summary: 'Seul' }],
      transfers: [
        { from: 'marius', to: 'josette', sourceId: 'f1', text: 'Il paraît…', distortion: 9 },
        { from: 'marius', to: 'marius', sourceId: 'f1', text: 'x', distortion: 1 },
        { from: 'marius', to: 'gaston', sourceId: 'inventé', text: 'x', distortion: 1 },
        { from: 'bob', to: 'gaston', sourceId: 'f1', text: 'x', distortion: 1 },
      ],
      bondDeltas: [{ a: 'marius', b: 'josette', delta: 99 }, { a: 'gaston', b: 'gaston', delta: 1 }],
      relationDeltas: [{ npc: 'josette', delta: -500, reason: 'Choquée' }, { npc: 'zorg', delta: 1 }],
      intents: [{ npc: 'josette', intent: { kind: 'confront', text: 'Dis donc !', about: 'f1' } }, { npc: 'josette', intent: { kind: 'x', text: 'y' } }],
      recap: ['1', '2', '3', '4', '5', '6', '7', 8],
    }, state);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.conversations).toHaveLength(1);
    expect(r.transfers).toEqual([{ from: 'marius', to: 'josette', sourceId: 'f1', text: 'Il paraît…', distortion: 3 }]);
    expect(r.bondDeltas).toEqual([{ a: 'marius', b: 'josette', delta: 15 }]);
    expect(r.relationDeltas).toEqual([{ npc: 'josette', delta: -20, reason: 'Choquée' }]);
    expect(r.intents).toHaveLength(1);
    expect(r.recap).toHaveLength(6);
  });
});
