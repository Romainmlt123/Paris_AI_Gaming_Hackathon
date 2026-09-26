import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import * as THREE from 'three';
import { CHARACTERS } from '../shared/characters';
import { BLACKMAIL_CHIP, buy, CATALOG, haggle, placeDeco, SLOTS, startDeal, type Deal } from '../shared/economy';
import { judgeContest } from '../shared/contest';
import { collect, FORAGE, FORAGE_IDS, haggleSale, pocketCount, pocketText, refreshForage, sellHarvest, startSale, type Sale } from '../shared/forage';
import { perkToast, unlockPerks, type Perk } from '../shared/perks';
import { CONFRONT_SUGGESTIONS, openerLine } from '../shared/opener';
import { applySimResult, buildSimRequest } from '../shared/simulate';
import { applyTalkResult, buildTalkContext, npcsWithIntent } from '../shared/state';
import { defaultSuggestions } from '../shared/fallback';
import type { DecoId, GameState, NpcId, RelationChange, SlotId } from '../shared/types';
import { NPC_IDS } from '../shared/types';
import { simulate, talk } from './api';
import { loadState, resetSave, saveState } from './game/save';
import { createWorld, HOMES } from './game/world';
import { portraitDataUrl, SPRITES, drawSheet } from './render/sprites';
import { createQualityGovernor, createStage, type Quality } from './render/stage';
import { createDialogue, type Chip } from './ui/dialogue';
import { createHud } from './ui/hud';
import { sheet, showRecap, toast } from './ui/overlays';

const ABSENCE_HOURS = 8;
const CYCLE_MS = 4200;
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
let sale: Sale | null = null;
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
  world.syncForage(state);
  world.setNight(stage.night);
}

/** Grants tier rewards reached by these NPCs; returns what the NPC should say about it. */
function grantPerks(npcs: readonly NpcId[]): Perk[] {
  let next = state;
  const granted: Perk[] = [];
  for (const npc of npcs) {
    const r = unlockPerks(next, npc);
    next = r.state;
    granted.push(...r.perks);
  }
  if (granted.length === 0) return [];
  commit(next);
  granted.forEach((p, i) => setTimeout(() => toast(ui!, perkToast(p), 'good'), 1600 + i * 1600));
  return granted;
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
  if (npc === 'gaston') {
    if (pocketCount(state) > 0) chips.unshift({ label: `🧺 Vendre ${pocketText(state)}`, action: () => beginSale() });
    chips.unshift({ label: '💰 Marchander', action: () => openShop() });
  }
  return chips;
}

function startTalk(npc: NpcId, initiated = false): void {
  if (busy || dialogue.current() === npc) return;
  dialogue.close();
  deal = null;
  sale = null;
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
  sale = null;
}

async function onPlayerLine(text: string): Promise<void> {
  const npc = dialogue.current();
  if (!npc || busy) return;
  dialogue.playerSaid(text);
  if (deal && npc === 'gaston') return haggleLine(text);
  if (sale && npc === 'gaston') return saleLine(text);
  busy = true;
  dialogue.thinking(true);
  const verdict = judgeContest(state, npc, text);
  const result = await talk(npc, text, buildTalkContext(state, npc, verdict));
  const applied = applyTalkResult(state, npc, text, result, verdict);
  commit(applied.state);
  const perks = grantPerks([npc]);
  hud.setAiStatus(result.source === 'ai' ? '' : 'IA hors ligne · répliques de secours');
  dialogue.thinking(false);
  busy = false;
  showChange(applied.change);
  dialogue.setChips(chipsFor(npc, result.suggestions));
  await dialogue.say(result.reply, result.emotion);
  for (const perk of perks) if (dialogue.current() === npc) await dialogue.say(perk.line, 'joie');
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
  const blackmail: Chip[] = state.perks.includes('josette-copain') && !d.blackmailed ? [{ label: `🤫 ${BLACKMAIL_CHIP}`, action: () => void onPlayerLine(BLACKMAIL_CHIP) }] : [];
  dialogue.setChips([
    ...blackmail,
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
  const { deal: next, outcome } = haggle(deal, text, state.perks.includes('josette-copain'));
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

// ---------- Selling the harvest to Gaston ----------

function beginSale(): void {
  sale = startSale(state);
  if (!sale) return;
  void dialogue.say(`Voyons ça… ${pocketText(state)}. Bof. Je t\u2019en donne ${sale.offer}, et c\u2019est généreux.`, 'mefiance');
  saleChips();
}

function saleChips(): void {
  if (!sale) return;
  const s = sale;
  const ask = Math.round((s.offer * 1.45) / 10) * 10;
  dialogue.setChips([
    { label: `J\u2019en veux ${ask}`, action: () => void onPlayerLine(`J\u2019en veux ${ask}`) },
    { label: 'Tu es le roi du commerce !', action: () => void onPlayerLine('Tu es le roi du commerce !') },
    { label: `✔ Vendre ${s.offer}`, action: () => void onPlayerLine(`${s.offer}`) },
    { label: '✕ Garder', action: () => cancelSale() },
  ]);
}

function cancelSale(): void {
  sale = null;
  void dialogue.say('Garde tes cailloux. Tu reviendras.', 'amuse');
  dialogue.setChips(chipsFor('gaston', defaultSuggestions('gaston')));
}

async function saleLine(text: string): Promise<void> {
  if (!sale) return;
  const { sale: next, outcome } = haggleSale(sale, text);
  if (outcome.kind !== 'accept') {
    sale = next;
    saleChips();
    await dialogue.say(outcome.line, outcome.kind === 'offended' ? 'colere' : 'amuse');
    return;
  }
  commit(sellHarvest(state, outcome.price));
  sale = null;
  toast(ui!, `Récolte vendue +${outcome.price} 🪙`, 'good');
  dialogue.setChips(chipsFor('gaston', defaultSuggestions('gaston')));
  await dialogue.say(outcome.line, 'joie');
}

function pickUp(spot: string): void {
  const r = collect(state, spot);
  if (!r.ok) {
    if (r.reason === 'full') toast(ui!, 'Tes poches débordent ! Va revendre ta récolte à Gaston.', 'bad');
    return;
  }
  commit(r.state);
  const item = FORAGE[r.item];
  toast(ui!, `${item.icon} +1 ${item.name} · Gaston t\u2019en donnera ~${item.value} 🪙`, 'good');
}

// ---------- Decoration ----------

function openBag(): void {
  const counts = new Map<DecoId, number>();
  for (const d of state.inventory) counts.set(d, (counts.get(d) ?? 0) + 1);
  sheet(
    ui!,
    'Ton sac',
    [
      ...[...counts].map(([id, n]) => ({ label: `${CATALOG[id].name}${n > 1 ? ` ×${n}` : ''}`, detail: 'Touche un cercle sur l\u2019île pour le poser', action: () => undefined })),
      ...FORAGE_IDS.filter((id) => state.pocket[id] > 0).map((id) => ({ label: `${FORAGE[id].icon} ${FORAGE[id].name} ×${state.pocket[id]}`, detail: 'À revendre à Gaston', action: () => undefined })),
    ],
    'Vide. Ramasse coquillages et pommes, Gaston te les rachète… à son prix.',
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
  grantPerks(result.changes.map((c) => c.npc));
  setTimeout(() => toast(ui!, '👂 Ça va jaser sur l\u2019île…', 'info'), 1200 + result.reactions.length * 1400);
}

// ---------- Absence ----------

function applyClock(minutes: number): void {
  stage.setClock(minutes);
  world.setNight(stage.night);
  document.body.style.setProperty('--night', stage.night.toFixed(2));
  document.body.classList.toggle('is-night', stage.night > 0.5);
}

/** Plays the clock forward on the island's lights: sunset, night, dawn… whatever the 8 hours cross. */
function playCycle(day: number, from: number, hours: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / CYCLE_MS);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const minutes = from + eased * hours * 60;
      applyClock(minutes);
      hud.showTime(day + Math.floor(minutes / (24 * 60)), minutes);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

async function absence(): Promise<void> {
  if (busy) return;
  busy = true;
  endTalk();
  hud.setSleeping(true);
  hud.setAiStatus('Le temps passe sur l\u2019île…');
  const before = state;
  const [result] = await Promise.all([simulate(before, buildSimRequest(before, ABSENCE_HOURS)), playCycle(before.day, before.clock, ABSENCE_HOURS)]);
  const { state: after, recap } = applySimResult(before, result, ABSENCE_HOURS);
  const next = refreshForage(after, world.forageCandidates);
  commit(next);
  applyClock(next.clock);
  world.teleportPlayer({ x: 12, z: 20 });
  hud.setAiStatus('');
  hud.setSleeping(false);
  if (next.forageDay !== before.forageDay) recap.push({ kind: 'talk', npc: null, text: 'La mer a déposé de nouveaux coquillages sur la plage.' });
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
  else if (target.kind === 'forage') {
    endTalk();
    const spot = target.spot;
    world.walkTo(target.tile, () => pickUp(spot));
  }
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

state = refreshForage(state, world.forageCandidates);
commit(state);
applyClock(state.clock);
stage.resize();
requestAnimationFrame(frame);

declare global {
  interface Window {
    ragots: { state: () => GameState; talk: (npc: NpcId) => void; say: (text: string) => Promise<void>; absence: () => Promise<void>; homes: typeof HOMES };
  }
}
/** Hooks for the scripted demo recording (see CLAUDE.md §13). */
window.ragots = { state: () => state, talk: (npc) => startTalk(npc), say: (text) => onPlayerLine(text), absence, homes: HOMES };
