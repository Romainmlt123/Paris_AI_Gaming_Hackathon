import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import * as THREE from 'three';
import { CHARACTERS } from '../shared/characters';
import { buy, buyClothes, CATALOG, CLOTHES_PRICE, haggle, placeDeco, SLOTS, startDeal, type Deal } from '../shared/economy';
import { comingToast, markInitiative, pickInitiative, type Initiative } from '../shared/initiative';
import { advanceClock, chatterLine, routineStep } from '../shared/routine';
import { CONFRONT_SUGGESTIONS, openerLine } from '../shared/opener';
import { applySimResult, buildSimRequest } from '../shared/simulate';
import { applyOpener, applyTalkResult, buildTalkContext, npcsWithIntent } from '../shared/state';
import { defaultSuggestions } from '../shared/fallback';
import { clashFor, moodOf, resolveFight, resolveMurder, WEAPONS, type Clash } from '../shared/violence';
import type { DecoId, GameState, NpcId, RelationChange, SlotId } from '../shared/types';
import { NPC_IDS } from '../shared/types';
import { initiativeLine, simulate, talk } from './api';
import { loadState, resetSave, saveState } from './game/save';
import { createWorld, HOMES, type PlayerSkin } from './game/world';
import { portraitDataUrl, SPRITES, drawSheet } from './render/sprites';
import { createQualityGovernor, createStage, type Quality } from './render/stage';
import { createDialogue, type Chip } from './ui/dialogue';
import { el } from './ui/dom';
import { createHud } from './ui/hud';
import { bang, flash, sheet, showDeath, showRecap, toast } from './ui/overlays';
import { speak, unlockAudioOnGesture } from './voice';

const ABSENCE_HOURS = 8;
const params = new URLSearchParams(location.search);
if (params.has('reset')) resetSave();

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const ui = document.querySelector<HTMLElement>('#ui');
if (!canvas || !ui) throw new Error('Missing #scene or #ui');

const qualityParam = params.get('q');
const initialQuality: Quality = qualityParam === 'low' || qualityParam === 'mid' || qualityParam === 'high' ? qualityParam : 'high';
unlockAudioOnGesture();
const stage = createStage(canvas, initialQuality);
const world = createWorld(stage);
let state: GameState = loadState();
let deal: Deal | null = null;
let busy = false;
let seeking: NpcId | null = null;
/** The open dialogue was started by the NPC: walking around doesn't end it, the NPC tags along. */
let pinned = false;
/** Waiting for an NPC's reply: the conversation is locked, but the player can still walk. */
let replying = false;
let skinOutfit: GameState['outfit'] | null = null;

const portraits = Object.fromEntries(NPC_IDS.map((id) => [id, portraitDataUrl(drawSheet(SPRITES[id]))])) as Record<NpcId, string>;
const hud = createHud(portraits, (id) => startTalk(id), () => void absence(), () => openBag());
const dialogue = createDialogue(portraits, (text) => void onPlayerLine(text), () => endTalk());
ui.append(hud.root, dialogue.root);

function commit(next: GameState): void {
  state = next;
  saveState(state);
  hud.render(state);
  world.syncDecor(state);
  if (skinOutfit !== state.outfit) {
    skinOutfit = state.outfit;
    world.setPlayerSkin(state.outfit === 'nu' ? 'castaway' : 'player');
  }
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
  if (npc === 'gaston' && state.outfit === 'nu') chips.unshift({ label: `👕 Habits (${CLOTHES_PRICE} 🪙)`, action: () => void buyOutfit() });
  return chips;
}

function startTalk(npc: NpcId, initiated = false): void {
  if (busy || dialogue.current() === npc) return;
  seeking = null;
  world.stopSeeking();
  endTalk();
  const open = (): void => {
    world.facePlayerToward(npc);
    dialogue.open(npc, state.npcs[npc].relation);
    pin(npc);
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

function pin(npc: NpcId): void {
  pinned = true;
  world.setEscort(npc);
}

function endTalk(): void {
  dialogue.close();
  pinned = false;
  world.setEscort(null);
  world.setFrozen(null);
  deal = null;
}

async function onPlayerLine(text: string): Promise<void> {
  const npc = dialogue.current();
  if (!npc || busy) return;
  dialogue.playerSaid(text);
  if (deal && npc === 'gaston') return haggleLine(text);
  busy = true;
  replying = true;
  dialogue.thinking(true);
  const result = await talk(npc, text, buildTalkContext(state, npc));
  const before = state.npcs[npc].relation;
  const applied = applyTalkResult(state, npc, text, result);
  commit(applied.state);
  hud.setAiStatus(result.source === 'ai' ? '' : 'IA hors ligne · répliques de secours');
  dialogue.thinking(false);
  replying = false;
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

async function buyOutfit(): Promise<void> {
  const dressed = buyClothes(state, CLOTHES_PRICE);
  if (!dressed) {
    await dialogue.say('Sans pièces, pas de pantalon, mon ami. C\u2019est la loi du marché. Et de la pudeur.', 'mefiance');
    return;
  }
  commit(dressed);
  toast(ui!, `👕 Habillé pour ${CLOTHES_PRICE} 🪙`, 'good');
  dialogue.setChips(chipsFor('gaston', defaultSuggestions('gaston')));
  await dialogue.say('Vé ! Te voilà présentable. Presque élégant. Le reste de l\u2019île va être déçu, hé hé.', 'joie');
}

// ---------- Life: clock, routines, initiatives, chatter ----------

const GAME_MINUTES_PER_SEC = 1;
const INITIATIVE_GAP_SEC = 30;
const NPC_INITIATIVE_GAP_SEC = 90;
const FIRST_INITIATIVE_SEC = 3;
const CHATTER_GAP_SEC = 16;
const CHATTER_RANGE = 7;
const REACH_DISTANCE = 2.2;

let lastInputAt = 0;
let lastLifeTick = 0;
let lastInitiativeAt = FIRST_INITIATIVE_SEC - INITIATIVE_GAP_SEC;
let lastChatterAt = 0;
const npcInitiativeAt: Partial<Record<NpcId, number>> = {};

function overlayOpen(): boolean {
  return ui!.querySelector('.sheet-back, .modal-back, .recap, .death') !== null;
}

function tickLife(now: number): void {
  if (now - lastLifeTick < 1) return;
  const minutes = Math.floor((now - lastLifeTick) * GAME_MINUTES_PER_SEC);
  lastLifeTick = now;
  if (!busy) {
    state = advanceClock(state, minutes);
    hud.render(state);
    if (state.clock % 10 === 0) saveState(state);
  }
  for (const id of NPC_IDS) world.setAnchor(id, routineStep(state, id).spot);
  tickInitiative(now);
  tickChatter(now);
}

function tickInitiative(now: number): void {
  if (busy || seeking || dialogue.isOpen() || overlayOpen() || world.playerHasErrand()) return;
  if (now - lastInitiativeAt < INITIATIVE_GAP_SEC) return;
  const blocked = new Set(NPC_IDS.filter((id) => world.isBusy(id) || now - (npcInitiativeAt[id] ?? -Infinity) < NPC_INITIATIVE_GAP_SEC));
  const initiative = pickInitiative(state, now - lastInputAt, blocked);
  if (!initiative) return;
  lastInitiativeAt = now;
  npcInitiativeAt[initiative.npc] = now;
  runInitiative(initiative);
}

function runInitiative({ npc, trigger, reason, fallback }: Initiative): void {
  seeking = npc;
  const line = initiativeLine(npc, buildTalkContext(state, npc), reason, fallback);
  toast(ui!, comingToast(npc), 'info');
  world.npcSeekPlayer(npc, () => void arrive());
  async function arrive(): Promise<void> {
    if (seeking !== npc) return;
    seeking = null;
    if (busy || dialogue.isOpen() || world.distance(npc) > REACH_DISTANCE) return;
    commit(markInitiative(state, npc, trigger));
    deal = null;
    world.facePlayerToward(npc);
    dialogue.open(npc, state.npcs[npc].relation);
    pin(npc);
    dialogue.thinking(true);
    const result = await line;
    if (dialogue.current() !== npc) return;
    dialogue.thinking(false);
    commit(applyOpener(state, npc, result));
    hud.setAiStatus(result.source === 'ai' ? '' : 'IA hors ligne · répliques de secours');
    dialogue.setChips(chipsFor(npc, result.suggestions));
    await dialogue.say(result.reply, result.emotion);
  }
}

function tickChatter(now: number): void {
  if (busy || dialogue.isOpen() || now - lastChatterAt < CHATTER_GAP_SEC) return;
  for (const a of NPC_IDS) {
    for (const b of NPC_IDS) {
      if (a >= b || seeking === a || seeking === b || world.isBusy(a) || world.isBusy(b)) continue;
      if (world.distance(a, b) > 2.5 || world.distance(a) > CHATTER_RANGE) continue;
      const [speaker, listener] = Math.floor(now / CHATTER_GAP_SEC) % 2 === 0 ? [a, b] : [b, a];
      const line = chatterLine(speaker, listener, Math.floor(now));
      if (!line) continue;
      lastChatterAt = now;
      toast(ui!, `${CHARACTERS[speaker].name} → ${CHARACTERS[listener].name} : « ${line} »`, 'info');
      void speak(speaker, line, 'amuse');
      return;
    }
  }
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
window.addEventListener('pointerdown', () => (lastInputAt = timer.getElapsed()), { capture: true });
window.addEventListener('keydown', () => (lastInputAt = timer.getElapsed()), { capture: true });
canvas.addEventListener('pointerdown', (e) => down.set(e.clientX, e.clientY));
canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12 || (busy && !replying)) return;
  const ndc = new THREE.Vector2((e.clientX / canvas.clientWidth) * 2 - 1, -(e.clientY / canvas.clientHeight) * 2 + 1);
  const target = world.pick(ndc);
  if (!target) return;
  if (target.kind === 'npc') startTalk(target.npc);
  else if (target.kind === 'slot') {
    if (replying) return;
    endTalk();
    const s = SLOTS.find((x) => x.id === target.slot);
    if (s) world.walkTo({ x: Math.round(s.x), z: Math.round(s.z) + 1 }, () => openSlot(target.slot));
  } else {
    if (!pinned) endTalk();
    world.walkTo(target.tile);
  }
});

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
const held = new Set<string>();

function typing(e: KeyboardEvent): boolean {
  return e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
}

function closeTopOverlay(): boolean {
  const top = ui!.querySelector<HTMLElement>('.sheet-back');
  if (!top) return false;
  top.remove();
  return true;
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (typing(e) && e.target instanceof HTMLElement) e.target.blur();
    if (!closeTopOverlay() && dialogue.isOpen() && !busy) endTalk();
    return;
  }
  if (typing(e)) return;
  if (e.code in MOVE_KEYS) {
    held.add(e.code);
    e.preventDefault();
    if (dialogue.isOpen() && !busy && !pinned) endTalk();
    return;
  }
  if (busy || e.repeat) return;
  if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (dialogue.isOpen()) return dialogue.focusInput();
    const near = world.nearestNpc(6);
    if (near) startTalk(near);
  } else if (e.code === 'KeyI' || e.code === 'KeyB') openBag();
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());

function keyboardMove(dt: number): void {
  let dx = 0;
  let dz = 0;
  for (const code of held) {
    const v = MOVE_KEYS[code];
    if (v) {
      dx += v[0];
      dz += v[1];
    }
  }
  const locked = busy && !replying;
  world.move(locked ? 0 : dx, locked ? 0 : dz, dt);
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const ndc = new THREE.Vector2((e.clientX / canvas.clientWidth) * 2 - 1, -(e.clientY / canvas.clientHeight) * 2 + 1);
  const target = world.pick(ndc);
  canvas.style.cursor = target && target.kind !== 'ground' ? 'pointer' : 'default';
});

if (matchMedia('(pointer: fine)').matches) {
  ui.append(el('div', 'keys-help', 'ZQSD / flèches : marcher · E : parler · Entrée : écrire · I : sac · Échap : fermer · clic : aller / parler'));
}

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
  keyboardMove(dt);
  tickLife(time);
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
      pos: () => { x: number; z: number };
      homes: typeof HOMES;
      skin: (skin: PlayerSkin) => void;
    };
  }
}
/** Hooks for the scripted demo recording (see CLAUDE.md §13). */
window.ragots = { state: () => state, talk: (npc) => startTalk(npc), say: (text) => onPlayerLine(text), absence, clash: runClash, pos: () => ({ x: world.playerPos.x, z: world.playerPos.z }), homes: HOMES, skin: (skin) => world.setPlayerSkin(skin) };
if (params.get('skin') === 'castaway') world.setPlayerSkin('castaway');
