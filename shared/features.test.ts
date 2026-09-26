import { describe, expect, it } from 'vitest';
import { applyVerdict, judgeContest } from './contest';
import { buy, haggle, placeDeco, startDeal } from './economy';
import { collect, haggleSale, harvestValue, refreshForage, sellHarvest, spawnForage, startSale } from './forage';
import { unlockPerks } from './perks';
import { bondKey } from './relations';
import { recordFact } from './rumors';
import { applyTalkResult, createInitialState, dampenGain } from './state';
import type { GameState, TalkResult } from './types';

const CANDIDATES = {
  beach: Array.from({ length: 12 }, (_, i) => ({ x: i, z: 25 })),
  orchard: Array.from({ length: 6 }, (_, i) => ({ x: i, z: 5 })),
};

function praise(delta: number): TalkResult {
  return { reply: 'Merci !', emotion: 'joie', relationDelta: delta, reason: 'Tu as été gentil', events: [], intent: null, suggestions: [], source: 'fallback' };
}

function insulted(distortion: number): GameState {
  const { state } = recordFact(createInitialState(), { actor: 'player', text: 'Le joueur a traité Marius de vieux pêcheur', severity: -2, witnesses: ['marius'] });
  const next = structuredClone(state);
  const r = next.rumors[0]!;
  next.rumors.push({ ...r, id: 'rj', holder: 'josette', source: 'marius', distortion, text: 'Il paraît que le joueur a traité Marius de vieux pêcheur, et il a craché par terre !' });
  return next;
}

describe('forage', () => {
  it('spawns deterministically once per day and collects in one tap', () => {
    expect(spawnForage(3, CANDIDATES, false)).toEqual(spawnForage(3, CANDIDATES, false));
    const s = refreshForage(createInitialState(), CANDIDATES);
    expect(s.forage.length).toBe(8);
    expect(refreshForage(s, CANDIDATES)).toBe(s);
    const spot = s.forage[0]!;
    const got = collect(s, spot.id);
    expect(got.ok && got.state.pocket[spot.item]).toBe(1);
    expect(got.ok && got.state.forage.length).toBe(7);
  });
  it('Marius’s secret spot adds a pearl', () => {
    const plain = spawnForage(1, CANDIDATES, false).filter((f) => f.item === 'perle').length;
    expect(spawnForage(1, CANDIDATES, true).filter((f) => f.item === 'perle').length).toBe(plain + 1);
  });
  it('Gaston buys the harvest, haggling upward to a hidden ceiling', () => {
    const s = createInitialState();
    s.pocket = { coquillage: 5, pomme: 2, perle: 0 };
    const sale = startSale(s)!;
    expect(sale.offer).toBeLessThan(harvestValue(s));
    const up = haggleSale(sale, String(sale.ceiling));
    expect(up.outcome.kind).toBe('counter');
    expect(up.sale.offer).toBeGreaterThan(sale.offer);
    expect(haggleSale(sale, String(sale.ceiling * 3)).outcome.kind).toBe('offended');
    expect(haggleSale(sale, String(sale.offer)).outcome.kind).toBe('accept');
    const sold = sellHarvest(s, 200);
    expect(sold.coins).toBe(1400);
    expect(sold.pocket.coquillage).toBe(0);
    expect(startSale(sold)).toBeNull();
  });
});

describe('decoration gossip', () => {
  it('placing a deco records a flattering fact witnesses can spread', () => {
    const placed = placeDeco(buy(createInitialState(), 'statue', 1000)!, 'placette', 'statue')!;
    const fact = placed.state.facts.at(-1)!;
    expect(fact.actor).toBe('player');
    expect(fact.severity).toBeGreaterThan(0);
    expect(fact.text).toContain('Statue dorée de Gaston');
    expect(placed.state.rumors.filter((r) => r.factId === fact.id).length).toBeGreaterThan(0);
  });
});

describe('contesting rumors', () => {
  it('an exaggerated rumor can be contested: truth restored, points back, teller distrusted', () => {
    const s = insulted(2);
    const v = judgeContest(s, 'josette', 'C’est exagéré, ça !')!;
    expect(v.upheld).toBe(true);
    const bond = s.bonds[bondKey('josette', 'marius')] ?? 0;
    const r = applyVerdict(s, 'josette', v);
    expect(r.delta).toBeGreaterThan(0);
    expect(r.state.rumors.find((x) => x.holder === 'josette')?.distortion).toBe(0);
    expect(r.state.bonds[bondKey('josette', 'marius')]).toBe(Math.max(0, bond - 10));
  });
  it('contesting the plain truth backfires', () => {
    const s = insulted(0);
    const v = judgeContest(s, 'marius', 'C’est exagéré !')!;
    expect(v.upheld).toBe(false);
    const applied = applyTalkResult(s, 'marius', 'C’est exagéré !', praise(5), v);
    expect(applied.change?.delta).toBeLessThan(0);
  });
  it('judges the rumor the NPC confronts the player with, not the most distorted one', () => {
    const old = insulted(3);
    const { state } = recordFact(old, { actor: 'player', text: 'Le joueur a menti à Gaston', severity: -1, witnesses: ['gaston'] });
    const s = structuredClone(state);
    const fresh = s.rumors.at(-1)!;
    s.rumors.push({ ...fresh, id: 'rj2', holder: 'josette', source: 'gaston', distortion: 1 });
    const v = judgeContest(s, 'josette', 'C’est exagéré !')!;
    expect(v.factId).toBe(fresh.factId);
    expect(v.upheld).toBe(false);
  });
  it('only kicks in for contest-like messages about the player', () => {
    expect(judgeContest(insulted(3), 'josette', 'Bonjour !')).toBeNull();
    expect(judgeContest(createInitialState(), 'josette', 'C’est exagéré !')).toBeNull();
  });
});

describe('diminishing praise', () => {
  it('the same NPC stops rewarding compliments within a day, negatives untouched', () => {
    let s = createInitialState();
    const gains: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = applyTalkResult(s, 'gaston', 'merci', praise(4));
      gains.push(r.change?.delta ?? 0);
      s = r.state;
    }
    expect(gains).toEqual([4, 4, 2, 1, 0]);
    expect(dampenGain(s, 'gaston', -10).delta).toBe(-10);
    s.day += 1;
    expect(applyTalkResult(s, 'gaston', 'merci', praise(4)).change?.delta).toBe(4);
  });
});

describe('tier perks', () => {
  it('unlock once, with concrete effects', () => {
    const s = createInitialState();
    s.npcs.gaston.relation = 60;
    const first = unlockPerks(s, 'gaston');
    expect(first.perks.map((p) => p.id)).toEqual(['gaston-copain', 'gaston-confident']);
    expect(first.state.inventory).toContain('parterre');
    expect(unlockPerks(first.state, 'gaston').perks).toEqual([]);
    s.pocket.coquillage = 4;
    expect(harvestValue({ ...first.state, pocket: s.pocket })).toBeGreaterThan(harvestValue(s));
  });
  it('Josette’s gossip about the scales lets you squeeze Gaston once', () => {
    const deal = startDeal(createInitialState(), 'fontaine');
    expect(haggle(deal, 'Et tes balances truquées ?').deal.ask).toBe(deal.ask);
    const squeezed = haggle(deal, 'Et tes balances truquées ?', true);
    expect(squeezed.deal.ask).toBeLessThan(deal.ask);
    expect(haggle(squeezed.deal, 'Et tes balances truquées ?', true).deal.ask).toBe(squeezed.deal.ask);
  });
});
