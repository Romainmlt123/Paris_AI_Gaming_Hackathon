import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import * as THREE from 'three';
import { CHARACTERS } from '../shared/characters';
import { buy, CATALOG, haggle, placeDeco, SLOTS, startDeal, type Deal } from '../shared/economy';
import { CONFRONT_SUGGESTIONS, openerLine } from '../shared/opener';
import { applySimResult, buildSimRequest } from '../shared/simulate';
import { applyTalkResult, buildTalkContext, npcsWithIntent } from '../shared/state';
import { defaultSuggestions } from '../shared/fallback';
import { clashFor, moodOf, resolveFight, resolveMurder, WEAPONS, type Clash } from '../shared/violence';
import type { DecoId, GameState, NpcId, RelationChange, SlotId } from '../shared/types';
import { NPC_IDS } from '../shared/types';
import { simulate, talk } from './api';
import { loadState, resetSave, saveState } from './game/save';
import { createWorld, HOMES } from './game/world';
import { portraitDataUrl, SPRITES, drawSheet } from './render/sprites';
import { createQualityGovernor, createStage, type Quality } from './render/stage';
import { createDialogue, type Chip } from './ui/dialogue';
import { createHud } from './ui/hud';
import { bang, flash, sheet, showDeath, showRecap, toast } from './ui/overlays';

const ABSENCE_HOURS = 8;
const params = new URLSearchParams(location.search);
if (params.has('reset')) resetSave();

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const ui = document.querySelector<HTMLElement>('#ui');
if (!canvas || !ui) throw new Error('Missing #scene or #ui');

const qualityParam = params.get('q');
const initialQuality: Quality = qualityParam === 'low' || qualityParam === 'mid' || qualityParam === 'high' ? qualityParam : 'high';
const stage = createStage(canvas, initialQuality);
const world = createWorld(stage);
let state: GameState = loadState();
let deal: Deal | null = null;
let busy = false;

const portraits = Object.fromEntries(NPC_IDS.map((id) => [id, portraitDataUrl(drawSheet(SPRITES[id]))])) as Record<NpcId, string>;
const hud = createHud(portraits, (id) => startTalk(id), () => void absence(), () => openBag());
const dialogue = createDialogue(portraits, (text) => void onPlayerLine(text), () => endTalk());
ui.append(hud.root, dialogue.root);

function commit(next: GameState): void {
  state = next;
  saveState(state);
  hud.render(state);
  world.syncDecor(state);
  world.setMoods({ gaston: moodOf(state.npcs.gaston.relation), josette: moodOf(state.npcs.josette.relation), marius: moodOf(state.npcs.marius.relation) });
}

function showChange(change: RelationChange | null): void {
  if (!change || change.delta === 0) return;
  const sign = change.delta > 0 ? '+' : '';
  toast(ui!, `${CHARACTERS[change.npc].name} ${sign}${change.delta} · ${change.reason}`, change.delta > 0 ? 'good' : 'bad');
  hud.pulse(change.npc, change.delta);
  if (dialogue.current() === change.npc) dialogue.setRelation(state.npcs[change.npc].relation);
}

// ---------- Conversation ----------

function chipsFor(npc: NpcId, suggestions: string[]): Chip[] {
  const chips: Chip[] = suggestions.slice(0, 3).map((s) => ({ label: s, action: () => void onPlayerLine(s) }));
  if (npc === 'gaston') chips.unshift({ label: '💰 Marchander', action: () => openShop() });
  return chips;
}

function startTalk(npc: NpcId, initiated = false): void {
  if (busy || dialogue.current() === npc) return;
  dialogue.close();
  deal = null;
  const open = (): void => {
    world.facePlayerToward(npc);
    dialogue.open(npc, state.npcs[npc].relation);
    const confront = state.npcs[npc].intent !== null;
    const line = confront ? openerLine(state, npc) : greeting(npc);
    void dialogue.say(line, confront ? 'mefiance' : state.npcs[npc].emotion);
    dialogue.setChips(chipsFor(npc, confront ? CONFRONT_SUGGESTIONS : defaultSuggestions(npc)));
  };
  if (initiated) world.npcSeekPlayer(npc, open);
  else world.approachNpc(npc, open);
}

function greeting(npc: NpcId): string {
  const r = state.npcs[npc].relation;
  const lines: Record<NpcId, [string, string]> = {
    gaston: ['Mon ami ! Tu tombes bien, j\u2019ai des affaires en or. Enfin, en plaqué or.', 'Tiens, toi. Les prix ont augmenté. Pour toi seulement.'],
    josette: ['Coucou mon chou ! Alors, quoi de neuf ? Raconte, raconte !', 'Ah… c\u2019est toi. Bonjour quand même.'],
    marius: ['… Ah. Te voilà. La mer est calme ce soir. Comme moi.', '… Tu viens encore te moquer ? La mer, elle, ne se moque pas.'],
  };
  return lines[npc][r < -15 ? 1 : 0];
}

function endTalk(): void {
  dialogue.close();
  world.setFrozen(null);
  deal = null;
}

async function onPlayerLine(text: string): Promise<void> {
  const npc = dialogue.current();
  if (!npc || busy) return;
  dialogue.playerSaid(text);
  if (deal && npc === 'gaston') return haggleLine(text);
  busy = true;
  dialogue.thinking(true);
  const result = await talk(npc, text, buildTalkContext(state, npc));
  const before = state.npcs[npc].relation;
  const applied = applyTalkResult(state, npc, text, result);
  commit(applied.state);
  hud.setAiStatus(result.source === 'ai' ? '' : 'IA hors ligne · répliques de secours');
  dialogue.thinking(false);
  showChange(applied.change);
  const clash = clashFor(before, state.npcs[npc].relation);
  if (!clash) {
    busy = false;
    dialogue.setChips(chipsFor(npc, result.suggestions));
    await dialogue.say(result.reply, result.emotion);
    return;
  }
  dialogue.setChips([]);
  await dialogue.say(result.reply, 'colere');
  await new Promise((r) => setTimeout(r, 900));
  await runClash(npc, clash);
}

// ---------- Fights & murders ----------

const BANGS = ['POW !', 'BAM !', 'KRAK !', 'SBAF !', 'AÏE !', 'BONK !', 'TCHAC !', 'OUILLE !'];
const AFTER_FIGHT: Record<NpcId, string> = {
  gaston: 'Pfff… T’as une sacrée droite, mon ami. Bon. On est quittes. Pour cette fois.',
  josette: 'Ouf… mon chignon ! Bon… ça défoule, faut l’avouer. On repart de zéro, mon chou ?',
  marius: '… La tempête est passée. Après la houle, toujours le calme.',
};
const LAST_WORDS: Record<NpcId, string> = {
  gaston: 'Rien de personnel, mon ami. C’est le commerce.',
  josette: 'Oups. Bon… je dirai que c’était un accident, mon chou.',
  marius: '… La mer reprend toujours ce qu’on lui doit.',
};

async function runClash(npc: NpcId, clash: Clash): Promise<void> {
  busy = true;
  endTalk();
  world.setFrozen(npc);
  if (clash === 'fight') await fight(npc);
  else await murder(npc);
  busy = false;
}

async function fight(npc: NpcId): Promise<void> {
  toast(ui!, `💥 BAGARRE avec ${CHARACTERS[npc].name} !`, 'bad');
  let i = 0;
  const words = setInterval(() => bang(ui!, BANGS[i++ % BANGS.length] ?? 'POW !'), 380);
  await world.fight(npc);
  clearInterval(words);
  const applied = resolveFight(state, npc);
  commit(applied.state);
  showChange(applied.change);
  world.facePlayerToward(npc);
  dialogue.open(npc, state.npcs[npc].relation);
  dialogue.setChips(chipsFor(npc, defaultSuggestions(npc)));
  await dialogue.say(AFTER_FIGHT[npc], 'amuse');
}

async function murder(npc: NpcId): Promise<void> {
  await world.murder(npc, () => {
    flash(ui!);
    bang(ui!, 'BONK !!');
  });
  await showDeath(ui!, CHARACTERS[npc].name, WEAPONS[npc], LAST_WORDS[npc]);
  const coinsBefore = state.coins;
  const applied = resolveMurder(state, npc);
  commit(applied.state);
  world.revive();
  world.teleportPlayer({ x: 12, z: 20 });
  world.setFrozen(null);
  toast(ui!, `Réveil au matin… délesté de ${coinsBefore - state.coins} 🪙`, 'bad');
  setTimeout(() => showChange(applied.change), 1400);
  const next = npcsWithIntent(state)[0];
  if (next) setTimeout(() => startTalk(next, true), 2600);
}

// ---------- Haggling with Gaston ----------

function openShop(): void {
  sheet(
    ui!,
    'L\u2019échoppe de Gaston',
    Object.values(CATALOG).map((d) => ({
      label: d.name,
      detail: `~${d.price} 🪙 · ★${d.prestige}`,
      action: () => beginDeal(d.id),
    })),
    '',
  );
}

function beginDeal(item: DecoId): void {
  deal = startDeal(state, item);
  void dialogue.say(`${CATALOG[item].name} ? Excellent goût. Pour toi… ${deal.ask} pièces. Une affaire !`, 'joie');
  dealChips();
}

function dealChips(): void {
  if (!deal) return;
  const d = deal;
  const offer = Math.round((d.floor * 0.95) / 10) * 10;
  dialogue.setChips([
    { label: `Je t\u2019en donne ${offer}`, action: () => void onPlayerLine(`Je t\u2019en donne ${offer}`) },
    { label: 'T\u2019as l\u2019œil pour les affaires !', action: () => void onPlayerLine('T\u2019as l\u2019œil pour les affaires !') },
    { label: `✔ Payer ${d.ask}`, action: () => void onPlayerLine(`${d.ask}`) },
    { label: '✕ Laisser tomber', action: () => cancelDeal() },
  ]);
}

function cancelDeal(): void {
  deal = null;
  void dialogue.say('Tu reviendras. Ils reviennent tous.', 'amuse');
  dialogue.setChips(chipsFor('gaston', defaultSuggestions('gaston')));
}

async function haggleLine(text: string): Promise<void> {
  if (!deal) return;
  const { deal: next, outcome } = haggle(deal, text);
  if (outcome.kind !== 'accept') {
    deal = next;
    dealChips();
    await dialogue.say(outcome.line, outcome.kind === 'offended' ? 'colere' : 'amuse');
    return;
  }
  const bought = buy(state, next.item, outcome.price);
  if (!bought) {
    await dialogue.say(`${outcome.price} ? T\u2019as même pas ça en poche, mon ami. Reviens plus riche.`, 'mefiance');
    return;
  }
  commit(bought);
  deal = null;
  toast(ui!, `${CATALOG[next.item].name} acheté ${outcome.price} 🪙 → dans ton sac`, 'good');
  dialogue.setChips(chipsFor('gaston', defaultSuggestions('gaston')));
  await dialogue.say(outcome.line, 'joie');
}

// ---------- Decoration ----------

function openBag(): void {
  const counts = new Map<DecoId, number>();
  for (const d of state.inventory) counts.set(d, (counts.get(d) ?? 0) + 1);
  sheet(
    ui!,
    'Ton sac',
    [...counts].map(([id, n]) => ({ label: `${CATALOG[id].name}${n > 1 ? ` ×${n}` : ''}`, detail: 'Touche un cercle sur l\u2019île pour le poser', action: () => undefined })),
    'Vide. Gaston vend de quoi embellir l\u2019île… à son prix.',
  );
}

function openSlot(slot: SlotId): void {
  const name = SLOTS.find((s) => s.id === slot)?.name ?? slot;
  const unique = [...new Set(state.inventory)];
  sheet(
    ui!,
    `Décorer : ${name}`,
    unique.map((id) => ({ label: CATALOG[id].name, detail: `+★${CATALOG[id].prestige}`, action: () => place(slot, id) })),
    'Rien à poser. Va voir Gaston pour acheter une décoration.',
  );
}

function place(slot: SlotId, item: DecoId): void {
  const result = placeDeco(state, slot, item);
  if (!result) return;
  commit(result.state);
  toast(ui!, `★ Valeur de l\u2019île : ${state.islandValue}`, 'good');
  result.reactions.forEach((r, i) => setTimeout(() => toast(ui!, `${CHARACTERS[r.npc].name} : « ${r.line} »`, r.delta < 0 ? 'bad' : 'info'), 900 + i * 1400));
  result.changes.forEach((c, i) => setTimeout(() => showChange(c), 1200 + i * 1400));
}

// ---------- Absence ----------

async function absence(): Promise<void> {
  if (busy) return;
  busy = true;
  endTalk();
  document.body.classList.add('night');
  hud.setAiStatus('Le temps passe sur l\u2019île…');
  const before = state;
  const result = await simulate(before, buildSimRequest(before, ABSENCE_HOURS));
  const { state: next, recap } = applySimResult(before, result, ABSENCE_HOURS);
  commit(next);
  world.teleportPlayer({ x: 12, z: 20 });
  hud.setAiStatus('');
  document.body.classList.remove('night');
  await showRecap(ui!, recap, ABSENCE_HOURS);
  busy = false;
  const first = recap.find((e) => e.kind === 'intent')?.npc;
  if (first) setTimeout(() => startTalk(first, true), 600);
}

// ---------- Input & loop ----------

const down = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => down.set(e.clientX, e.clientY));
canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12 || busy) return;
  const ndc = new THREE.Vector2((e.clientX / canvas.clientWidth) * 2 - 1, -(e.clientY / canvas.clientHeight) * 2 + 1);
  const target = world.pick(ndc);
  if (!target) return;
  if (target.kind === 'npc') startTalk(target.npc);
  else if (target.kind === 'slot') {
    endTalk();
    const s = SLOTS.find((x) => x.id === target.slot);
    if (s) world.walkTo({ x: Math.round(s.x), z: Math.round(s.z) + 1 }, () => openSlot(target.slot));
  } else {
    endTalk();
    world.walkTo(target.tile);
  }
});

window.addEventListener('resize', () => stage.resize());
window.visualViewport?.addEventListener('resize', () => {
  const vv = window.visualViewport;
  if (vv) document.documentElement.style.setProperty('--kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
});

const governor = createQualityGovernor(stage, (q) => console.info(`[perf] quality → ${q}`));
const timer = new THREE.Timer();
timer.connect(document);
function frame(): void {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  const time = timer.getElapsed();
  world.update(dt, time, new Set(npcsWithIntent(state)));
  stage.follow(world.playerPos, dt);
  stage.render();
  hud.setFps(governor(dt));
  requestAnimationFrame(frame);
}

commit(state);
stage.resize();
requestAnimationFrame(frame);

declare global {
  interface Window {
    ragots: {
      state: () => GameState;
      talk: (npc: NpcId) => void;
      say: (text: string) => Promise<void>;
      absence: () => Promise<void>;
      clash: (npc: NpcId, kind: Clash) => Promise<void>;
      homes: typeof HOMES;
    };
  }
}
/** Hooks for the scripted demo recording (see CLAUDE.md §13). */
window.ragots = { state: () => state, talk: (npc) => startTalk(npc), say: (text) => onPlayerLine(text), absence, clash: runClash, homes: HOMES };
