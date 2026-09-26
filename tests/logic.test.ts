import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/logic/initial.ts';
import { simulateAbsence } from '../src/logic/absence.ts';
import { applyTalk, LIE_PENALTY } from '../src/logic/talk.ts';
import { buildContext } from '../src/logic/context.ts';
import { detectDenial } from '../src/logic/facts.ts';
import { validateTalkResponse } from '../src/logic/validate.ts';
import { addItem, removeItem, countItem, INVENTORY_SIZE } from '../src/logic/inventory.ts';
import { applyOffer, executeDeal, placeDecor, startDeal } from '../src/logic/economy.ts';
import { tierOf, MAX_TALK_DELTA } from '../src/logic/relations.ts';
import { findPath } from '../src/logic/path.ts';
import { feedAnimal, shakeTree } from '../src/logic/activities.ts';
import { NPC_HOME, PLAYER_START } from '../src/data/island.ts';
import type { GameState, TalkResponse } from '../src/state/types.ts';

const resp = (p: Partial<TalkResponse>): TalkResponse => ({
  reply: '...', emotion: 'neutre', events: [], relationDelta: 0, reason: '', intent: null, suggestions: [], deal: null, denials: [], acceptGift: false, ...p,
});

function insultMarius(s: GameState): GameState {
  const ctx = buildContext(s, 'marius');
  return applyTalk(s, 'marius', 'T’es un vieux radoteur', resp({ relationDelta: -10, emotion: 'colere', events: [{ kind: 'insult', text: 'Le nouveau a traité Marius de vieux radoteur.', target: 'marius' }] }), ctx, 0).state;
}

describe('scénario de démo', () => {
  it('Marius raconte à Josette, qui vient demander des comptes, puis démasque le mensonge', () => {
    let s = insultMarius(createInitialState());
    expect(s.npcs.marius.relation).toBe(5);
    const before = s.npcs.josette.relation;
    const { state, report } = simulateAbsence(s, 8, 0);
    s = state;
    expect(report.transfers.some((t) => t.from === 'marius' && t.to === 'josette')).toBe(true);
    expect(s.npcs.josette.relation).toBeLessThan(before - 10);
    expect(s.npcs.josette.intent?.kind).toBe('confront');
    expect(s.day).toBe(2);
    expect(s.pendingRecap?.lines.length).toBeGreaterThan(0);

    const ctx = buildContext(s, 'josette');
    ctx.denial = detectDenial(ctx, "C'est faux, j'ai rien dit à Marius !", s.facts);
    expect(ctx.denial).not.toBeNull();
    const rel = s.npcs.josette.relation;
    const out = applyTalk(s, 'josette', "C'est faux, j'ai rien dit à Marius !", resp({ relationDelta: 5 }), ctx, 0);
    expect(out.lieCaught).toBe(true);
    expect(out.state.npcs.josette.relation).toBe(rel + LIE_PENALTY);
    expect(out.state.npcs.josette.caughtLies).toBe(1);
  });

  it('la simulation est déterministe', () => {
    const s = insultMarius(createInitialState());
    expect(simulateAbsence(s, 8, 0).report).toEqual(simulateAbsence(s, 8, 0).report);
  });

  it('un animal oublié devient un ragot', () => {
    let s = createInitialState();
    s = simulateAbsence(s, 24, 0).state;
    s = simulateAbsence(s, 24, 0).state;
    expect(s.facts.some((f) => f.kind === 'neglect')).toBe(true);
  });
});

describe('validation IA', () => {
  const s = createInitialState();
  const ctx = buildContext(s, 'gaston');
  it('borne la variation et rejette les champs invalides', () => {
    const r = validateTalkResponse({ reply: 'Salut', emotion: 'furieux', relationDelta: 999, events: [{ kind: 'meurtre', text: 'x' }] }, 'gaston', ctx, 'hey');
    expect(r.relationDelta).toBe(MAX_TALK_DELTA);
    expect(r.emotion).toBe('neutre');
    expect(r.events).toEqual([]);
  });
  it('donne une réplique de secours si la réponse est vide', () => {
    const r = validateTalkResponse(null, 'gaston', ctx, 'hey');
    expect(r.fallback).toBe(true);
    expect(r.reply.length).toBeGreaterThan(0);
  });
  it('ignore les démentis de faits inconnus', () => {
    const r = validateTalkResponse({ reply: 'ok', denials: ['f999'] }, 'gaston', ctx, 'x');
    expect(r.denials).toEqual([]);
  });
});

describe('inventaire et économie', () => {
  it('empile et respecte la taille', () => {
    const inv: { itemId: string; qty: number }[] = [];
    expect(addItem(inv, 'pomme', 25)).toBe(25);
    expect(inv.length).toBe(3);
    expect(removeItem(inv, 'pomme', 30)).toBe(false);
    expect(removeItem(inv, 'pomme', 12)).toBe(true);
    expect(countItem(inv, 'pomme')).toBe(13);
    expect(addItem(inv, 'statue', 99)).toBe(INVENTORY_SIZE - 2);
  });
  it('la négociation reste dans les bornes', () => {
    const s = createInitialState();
    let d = startDeal(s, 'sell', [{ itemId: 'pomme', qty: 2 }]);
    d = applyOffer(d, 100000);
    expect(d.price).toBeLessThanOrEqual(d.ceil);
    const out = executeDeal(s, d);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.state.player.bells).toBe(1200 + d.price);
  });
  it('les goûts de déco modifient les relations', () => {
    const s = createInitialState();
    addItem(s.player.inventory, 'statue', 1);
    const out = placeDecor(s, 'placette', 'statue', 0);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.state.npcs.gaston.relation).toBeGreaterThan(s.npcs.gaston.relation);
      expect(out.state.npcs.josette.relation).toBeLessThan(s.npcs.josette.relation);
    }
  });
  it('paliers', () => {
    expect(tierOf(-100).name).toBe('Ennemi juré');
    expect(tierOf(75).name).toBe('Confident');
  });
});

describe('activités et déplacement', () => {
  it('ruche : piqûre et Josette se moque', () => {
    const s = createInitialState();
    const out = shakeTree(s, 't3', 0.5, { x: 0, z: 0 });
    expect(out.stung).toBe(true);
    expect(out.state.npcs.josette.intent?.kind).toBe('mock');
  });
  it('nourrir puis récolter', () => {
    let s = createInitialState();
    s = { ...s, day: 2 };
    const a = feedAnimal(s, 'a1');
    const b = feedAnimal(a.state, 'a1');
    expect(countItem(b.state.player.inventory, 'plume')).toBe(1);
  });
  it('chemin vers chaque habitant et vers le plateau', () => {
    for (const h of Object.values(NPC_HOME)) {
      const p = findPath(PLAYER_START, h);
      expect(p.at(-1)).toEqual(h);
    }
    expect(findPath(PLAYER_START, { i: 10, j: 9 }).at(-1)).toEqual({ i: 10, j: 10 });
  });
});
