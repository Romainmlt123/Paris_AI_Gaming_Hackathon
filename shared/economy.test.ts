import { describe, expect, it } from 'vitest';
import { buy, haggle, parseOffer, placeDeco, startDeal } from './economy';
import { createInitialState } from './state';

describe('haggling', () => {
  it('parses offers', () => {
    expect(parseOffer('je t\u2019en donne 600 pièces')).toBe(600);
    expect(parseOffer('1 000 ?')).toBe(1000);
    expect(parseOffer('non merci')).toBeNull();
  });
  it('counters a fair offer, gets offended by a lowball, accepts the ask', () => {
    const deal = startDeal(createInitialState(), 'fontaine');
    const fair = haggle(deal, String(Math.round(deal.floor * 0.95)));
    expect(fair.outcome.kind).toBe('counter');
    expect(fair.deal.ask).toBeLessThan(deal.ask);
    expect(haggle(deal, '10').outcome.kind).toBe('offended');
    expect(haggle(deal, String(deal.ask)).outcome.kind).toBe('accept');
  });
  it('flattery lowers the price once', () => {
    const deal = startDeal(createInitialState(), 'fontaine');
    const once = haggle(deal, 'T\u2019as l\u2019œil pour les affaires !');
    expect(once.deal.ask).toBeLessThan(deal.ask);
    const twice = haggle(once.deal, 'T\u2019as l\u2019œil pour les affaires !');
    expect(twice.deal.ask).toBe(once.deal.ask);
  });
});

describe('decoration', () => {
  it('buying costs coins, placing adds prestige and reactions', () => {
    const bought = buy(createInitialState(), 'fontaine', 800);
    expect(bought?.coins).toBe(400);
    const placed = placeDeco(bought!, 'placette', 'fontaine');
    expect(placed?.state.islandValue).toBe(220);
    expect(placed?.state.inventory).toEqual([]);
    expect(placed?.changes.some((c) => c.npc === 'gaston' && c.delta > 0)).toBe(true);
    expect(buy(createInitialState(), 'statue', 5000)).toBeNull();
  });
});
