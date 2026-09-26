import { item } from '../data/items.ts';
import { NPCS } from '../data/npcs.ts';
import type { GameState, NpcContext, NpcId, RelationChange, TalkResponse } from '../state/types.ts';
import { addFact } from './facts.ts';
import { removeItem } from './inventory.ts';
import { applyRelation } from './relations.ts';

export const LIE_PENALTY = -18;

export interface TalkOutcome {
  state: GameState;
  changes: RelationChange[];
  lieCaught: boolean;
  giftTaken: boolean;
}

/** Applique une réponse IA déjà validée. Le code décide des faits, des pénalités et des objets. */
export function applyTalk(state: GameState, npc: NpcId, playerText: string, resp: TalkResponse, ctx: NpcContext, now: number): TalkOutcome {
  const draft = structuredClone(state);
  const st = draft.npcs[npc];
  const name = NPCS[npc].name;
  const changes: RelationChange[] = [];
  const push = (c: RelationChange | null): void => {
    if (c) changes.push(c);
  };

  const denial = ctx.denial;

  if (denial) {
    addFact(draft, { actor: 'player', target: npc, kind: 'lie', text: `${draft.player.name} a menti à ${name} en niant : ${denial.text}`, witnesses: [npc] });
    st.caughtLies += 1;
    push(applyRelation(draft, npc, LIE_PENALTY, 'T’a pris la main dans le sac en train de mentir', now));
    push(applyRelation(draft, npc, Math.min(0, resp.relationDelta), resp.reason || 'Vexé·e', now));
  } else {
    push(applyRelation(draft, npc, resp.relationDelta, resp.reason || (resp.relationDelta > 0 ? 'A apprécié l’échange' : 'N’a pas aimé ça'), now));
  }

  for (const e of resp.events) {
    if (e.kind === 'lie' && denial) continue;
    const target = e.target ?? npc;
    addFact(draft, { actor: 'player', target, kind: e.kind, text: e.text, witnesses: [npc] });
  }

  let giftTaken = false;
  if (ctx.offeredItem && resp.acceptGift && item(ctx.offeredItem.itemId).kind !== 'story' && removeItem(draft.player.inventory, ctx.offeredItem.itemId, 1)) {
    giftTaken = true;
    const def = item(ctx.offeredItem.itemId);
    const sheet = NPCS[npc];
    const liked = def.tags.some((t) => sheet.likes.includes(t));
    const hated = def.tags.some((t) => sheet.dislikes.includes(t));
    const bonus = hated ? -8 : liked ? 7 : 3;
    addFact(draft, { actor: 'player', target: npc, kind: 'gift', text: `${draft.player.name} a offert ${def.name} à ${name}.`, witnesses: [npc], severity: hated ? -1 : 2 });
    push(applyRelation(draft, npc, bonus, hated ? `Cadeau douteux : ${def.name}` : `Cadeau : ${def.name}`, now));
  }

  if (playerText) {
    st.memories.push(`Jour ${draft.day} : le joueur m'a dit « ${playerText.slice(0, 80)} »`);
    if (st.memories.length > 8) st.memories.splice(0, st.memories.length - 8);
  }
  st.mood = denial && resp.emotion === 'neutre' ? 'colere' : resp.emotion;
  if (ctx.intent && st.intent && playerText) st.intent = null;
  if (resp.intent) st.intent = st.intent ?? resp.intent;
  st.lastTalkDay = draft.day;
  return { state: draft, changes, lieCaught: denial !== null, giftTaken };
}
