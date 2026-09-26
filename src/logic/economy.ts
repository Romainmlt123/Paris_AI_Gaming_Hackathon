import { item } from '../data/items.ts';
import { NPCS } from '../data/npcs.ts';
import { SLOTS } from '../data/island.ts';
import type { Deal, GameState, InvSlot, NpcId, RelationChange, SlotId } from '../state/types.ts';
import { NPC_IDS } from '../state/types.ts';
import { addFact } from './facts.ts';
import { addItem, countItem, freeRoomFor, removeItem } from './inventory.ts';
import { applyRelation, clamp, priceFactor } from './relations.ts';

export function islandValue(state: GameState): number {
  let v = 0;
  for (const id of Object.values(state.decor)) if (id) v += item(id).prestige;
  const friends = NPC_IDS.filter((n) => state.npcs[n].relation >= 40).length;
  return v + friends * 20;
}

export function startDeal(state: GameState, direction: 'buy' | 'sell', items: InvSlot[]): Deal {
  const pf = priceFactor(state.npcs.gaston.relation);
  const reference = items.reduce((n, s) => n + (direction === 'sell' ? item(s.itemId).sellPrice : item(s.itemId).price) * s.qty, 0);
  if (direction === 'sell') {
    const price = Math.round((reference * 0.7) / pf);
    return { direction, items, reference, price, floor: price, ceil: Math.round((reference * 1.25) / pf), rounds: 0 };
  }
  const price = Math.round(reference * 1.15 * pf);
  return { direction, items, reference, price, floor: Math.round(reference * 0.8 * pf), ceil: price, rounds: 0 };
}

/** Gaston propose un prix ; le code borne l'écart et interdit de revenir en arrière. */
export function applyOffer(deal: Deal, proposed: number): Deal {
  const step = Math.max(5, Math.round(deal.reference * 0.2));
  const next =
    deal.direction === 'sell'
      ? clamp(Math.round(proposed), deal.price, Math.min(deal.ceil, deal.price + step))
      : clamp(Math.round(proposed), Math.max(deal.floor, deal.price - step), deal.price);
  return { ...deal, price: deal.rounds >= 5 ? deal.price : next, rounds: deal.rounds + 1 };
}

export type DealResult = { ok: true; state: GameState } | { ok: false; error: string };

export function executeDeal(state: GameState, deal: Deal): DealResult {
  const draft = structuredClone(state);
  const inv = draft.player.inventory;
  if (deal.direction === 'sell') {
    for (const s of deal.items) if (countItem(inv, s.itemId) < s.qty) return { ok: false, error: `Il te manque : ${item(s.itemId).name}` };
    for (const s of deal.items) removeItem(inv, s.itemId, s.qty);
    draft.player.bells += deal.price;
    const names = deal.items.map((s) => `${s.qty} ${item(s.itemId).name}`).join(', ');
    addFact(draft, { actor: 'player', target: 'gaston', kind: 'sale', text: `${draft.player.name} a vendu ${names} à Gaston pour ${deal.price} pièces.`, witnesses: ['gaston'] });
    return { ok: true, state: draft };
  }
  if (draft.player.bells < deal.price) return { ok: false, error: 'Pas assez de pièces' };
  for (const s of deal.items) {
    const req = item(s.itemId).requires;
    if (req && countItem(inv, req.itemId) < req.qty * s.qty) return { ok: false, error: `Il faut ${req.qty} × ${item(req.itemId).name}` };
    if (freeRoomFor(inv, s.itemId) < s.qty) return { ok: false, error: 'Ta sacoche est pleine' };
  }
  for (const s of deal.items) {
    const req = item(s.itemId).requires;
    if (req) removeItem(inv, req.itemId, req.qty * s.qty);
    addItem(inv, s.itemId, s.qty);
  }
  draft.player.bells -= deal.price;
  const names = deal.items.map((s) => item(s.itemId).name).join(', ');
  addFact(draft, { actor: 'player', target: 'gaston', kind: 'deal', text: `${draft.player.name} a acheté ${names} à Gaston pour ${deal.price} pièces.`, witnesses: ['gaston'] });
  return { ok: true, state: draft };
}

/** Goût d'un habitant pour un objet de décor posé sur l'île. */
export function decorTaste(npc: NpcId, itemId: string): { delta: number; reason: string } {
  const def = item(itemId);
  const sheet = NPCS[npc];
  let delta = 0;
  if (def.tags.some((t) => sheet.likes.includes(t))) delta += 6;
  if (def.tags.some((t) => sheet.dislikes.includes(t))) delta -= 7;
  if (npc === 'gaston' && def.price >= 1500) delta += 4;
  if (npc === 'josette' && itemId === 'stand_patisserie') delta += 8;
  if (npc === 'gaston' && itemId === 'echoppe_plus') delta += 8;
  if (npc === 'marius' && itemId === 'phare') delta += 10;
  const reason = delta > 0 ? `Adore ${def.name.toLowerCase()}` : delta < 0 ? `Trouve que ${def.name.toLowerCase()} gâche la vue` : '';
  return { delta, reason };
}

const REACT_TEXT: Record<NpcId, { good: string; bad: string }> = {
  gaston: { good: "Ça, c'est de la déco qui rapporte ! Ça respire l'argent !", bad: 'Hmm. Ça ne vaut pas grand-chose, ton machin.' },
  josette: { good: "Oh mon chou, c'est ravissant ! Tout le monde va en parler !", bad: "Entre nous... ton truc, là. Ça gâche un peu la vue, non ?" },
  marius: { good: '... Joli. La mer approuve.', bad: '... Hm. Les mouettes n\u2019aiment pas ça.' },
};

export function hasRotten(items: InvSlot[]): boolean {
  return items.some((s) => item(s.itemId).tags.includes('rotten'));
}

/** Tenter de refourguer du pourri à Gaston : il déteste les arnaques qu'il ne fait pas lui-même. */
export function applyScam(state: GameState, now: number): { state: GameState; change: RelationChange | null } {
  const draft = structuredClone(state);
  addFact(draft, { actor: 'player', target: 'gaston', kind: 'scam', text: `${draft.player.name} a tenté de refourguer du poisson pourri à Gaston.`, witnesses: ['gaston'] });
  const change = applyRelation(draft, 'gaston', -12, 'A tenté de l’arnaquer avec du pourri', now);
  draft.npcs.gaston.mood = 'colere';
  return { state: draft, change };
}

export type PlaceResult = { ok: true; state: GameState; changes: RelationChange[] } | { ok: false; error: string };

export function removeDecor(state: GameState, slotId: SlotId): GameState {
  const draft = structuredClone(state);
  const id = draft.decor[slotId];
  if (id && addItem(draft.player.inventory, id, 1) === 1) draft.decor[slotId] = null;
  return draft;
}

export function placeDecor(state: GameState, slotId: SlotId, itemId: string, now: number): PlaceResult {
  const def = item(itemId);
  if (def.kind !== 'decor') return { ok: false, error: "Ce n'est pas un objet de décor" };
  if (def.slots && !def.slots.includes(slotId)) return { ok: false, error: 'Pas à cet emplacement' };
  const draft = structuredClone(state);
  if (!removeItem(draft.player.inventory, itemId, 1)) return { ok: false, error: "Tu n'as pas cet objet" };
  const previous = draft.decor[slotId];
  if (previous) addItem(draft.player.inventory, previous, 1);
  draft.decor[slotId] = itemId;
  const slotName = SLOTS.find((s) => s.id === slotId)?.name ?? slotId;
  const fact = addFact(draft, { actor: 'player', target: null, kind: 'decor', text: `${draft.player.name} a installé ${def.name} (${slotName}).`, witnesses: [...NPC_IDS] });
  const changes: RelationChange[] = [];
  for (const npc of NPC_IDS) {
    const taste = decorTaste(npc, itemId);
    const c = applyRelation(draft, npc, taste.delta, taste.reason, now);
    if (c) changes.push(c);
    if (Math.abs(taste.delta) >= 6) {
      draft.npcs[npc].intent = { kind: 'react', text: taste.delta > 0 ? REACT_TEXT[npc].good : REACT_TEXT[npc].bad, about: fact.id };
    }
  }
  return { ok: true, state: draft, changes };
}
