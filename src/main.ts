import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/unifrakturmaguntia/400.css';
import * as THREE from 'three';
import { CHARACTERS } from '../shared/characters';
import { buy, buyClothes, CATALOG, CLOTHES_PRICE, haggle, isNaked, islandValue, placeDeco, SLOTS, startDeal, type Deal } from '../shared/economy';
import { comingToast, markInitiative, pickInitiative, type Initiative } from '../shared/initiative';
import { advanceClock, chatterLine, routineStep } from '../shared/routine';
import { CONFRONT_SUGGESTIONS, openerLine } from '../shared/opener';
import { addCatch, BAG_FISH_MAX, FISH, giveFish, rollFish } from '../shared/fishing';
import { buyItem, islandLevel, ISLAND_LEVELS, lookOf, nextLevel, SHOP_ITEMS, SHOP_OWNER, stockOf, toggleWear, type ShopId } from '../shared/shop';
import { buildGazette } from '../shared/gazette';
import { applySimResult, buildSimRequest } from '../shared/simulate';
import { applyOpener, applyTalkResult, buildTalkContext, createInitialState, npcsWithIntent } from '../shared/state';
import { arrivalFactText, cleanIsland, cleanName, DEFAULT_LOOK, ISLAND_IDEAS } from '../shared/player';
import { recordFact } from '../shared/rumors';
import { defaultSuggestions } from '../shared/fallback';
import { clashFor, moodOf, resolveFight, resolveMurder, resolveSlap, WEAPONS, type Clash } from '../shared/violence';
import type { DecoId, FishId, GameState, NpcId, RelationChange, SlotId } from '../shared/types';
import { NPC_IDS } from '../shared/types';
import { initiativeLine, simulate, talk } from './api';
import { loadState, resetSave, saveState, TIPS_KEY } from './game/save';
import { BUILDINGS, type BuildingId } from './game/map';
import { createWorld, doorTile, HOMES, type FishSpot, type PlayerSkin } from './game/world';
import { createInterior } from './interior/interior';
import type { Action } from './interior/layouts';
import { drawIcon } from './interior/paint';
import { fishIconUrl } from './render/fishArt';
import { lookSpec, portraitDataUrl, SPRITES, drawSheet, type SpriteSpec } from './render/sprites';
import { createQualityGovernor, createStage, type Quality } from './render/stage';
import { createDialogue, type Chip } from './ui/dialogue';
import { el } from './ui/dom';
import { createHud } from './ui/hud';
import { runOnboarding, type Profile } from './ui/onboarding';
import { createTips } from './ui/tips';
import { playIntro } from './game/intro';
import { bang, flash, sheet, showCatch, showDeath, showGazette, toast } from './ui/overlays';
import { speak, unlockAudioOnGesture } from './voice';
import { currentMusic, music, sfx, unlockMusicOnGesture } from './sound';

const ABSENCE_HOURS = 8;
const params = new URLSearchParams(location.search);
if (params.has('reset')) resetSave();

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const ui = document.querySelector<HTMLElement>('#ui');
if (!canvas || !ui) throw new Error('Missing #scene or #ui');

const qualityParam = params.get('q');
const initialQuality: Quality = qualityParam === 'low' || qualityParam === 'mid' || qualityParam === 'high' ? qualityParam : 'high';
unlockAudioOnGesture();
unlockMusicOnGesture();
document.addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('button')) sfx('tap');
}, true);

/** Background track for wherever the player currently is. */
function ambient(): void {
  music(interior.isOpen() ? 'interior' : 'island');
}
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

const portraits = Object.fromEntries(NPC_IDS.map((id) => [id, portraitDataUrl(drawSheet(SPRITES[id]))])) as Record<NpcId, string>;
const hud = createHud(portraits, (id) => startTalk(id), () => void absence(), () => openBag());
const dialogue = createDialogue(portraits, (text) => void onPlayerLine(text), () => endTalk());
const interior = createInterior({ onAction: (a) => onInteriorAction(a), onExit: (id) => leaveBuilding(id) });
ui.append(interior.root, hud.root, dialogue.root);
let lookKey = '';
const tips = createTips(ui);

function commit(next: GameState): void {
  state = next;
  saveState(state);
  hud.render(state);
  world.syncDecor(state);
  interior.refresh(state);
  syncLook();
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
  if (npc === 'gaston' && isNaked(state)) chips.unshift({ label: `👕 Habits (${CLOTHES_PRICE} 🪙)`, action: () => void buyOutfit() });
  if (state.fish.length > 0) chips.unshift({ label: npc === 'gaston' ? '🐟 Vendre un poisson' : '🐟 Offrir un poisson', action: () => openFishGift(npc) });
  return chips;
}

function startTalk(npc: NpcId, initiated = false): void {
  if (busy || dialogue.current() === npc) return;
  if (fishing) stopFishing();
  seeking = null;
  world.stopSeeking();
  endTalk();
  const open = (): void => {
    world.facePlayerToward(npc);
    tips.done('talk');
    dialogue.open(npc, state.npcs[npc].relation);
    pin(npc);
    const confront = state.npcs[npc].intent !== null;
    if (confront) music('tension');
    else if (currentMusic() === 'tension') ambient();
    const line = confront ? openerLine(state, npc) : greeting(npc);
    void dialogue.say(line, confront ? 'mefiance' : state.npcs[npc].emotion);
    dialogue.setChips(chipsFor(npc, confront ? CONFRONT_SUGGESTIONS : defaultSuggestions(npc)));
  };
  if (interior.isOpen()) {
    const here = interior.current();
    if (here && here in SHOP_OWNER && SHOP_OWNER[here as ShopId] === npc) return open();
    return toast(ui!, `${CHARACTERS[npc].name} n’est pas ici.`, 'info');
  }
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
  if (dialogue.isOpen()) {
    tips.show('rumor', '👂 Tout ce que tu dis sera répété… et déformé. Touche « Revenir dans 8 h » pour voir les ragots circuler.');
  }
  dialogue.close();
  if (currentMusic() === 'tension') ambient();
  pinned = false;
  world.setEscort(null);
  world.setFrozen(null);
  deal = null;
}

async function onPlayerLine(text: string): Promise<void> {
  const npc = dialogue.current();
  if (!npc || busy) return;
  dialogue.playerSaid(text, state.playerName);
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
  if (clash === 'slap') {
    const line = dialogue.say(result.reply, 'colere');
    await new Promise((r) => setTimeout(r, 500));
    await slap(npc);
    await line;
    busy = false;
    dialogue.setChips(chipsFor(npc, result.suggestions));
    return;
  }
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
  return interior.isOpen() || ui!.querySelector('.sheet-back, .modal-back, .recap, .death') !== null;
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
  if (busy || dialogue.isOpen() || interior.isOpen() || now - lastChatterAt < CHATTER_GAP_SEC) return;
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

const SLAPS = ['PAF !', 'CLAC !', 'BAFFE !', 'TAC !', 'PIF !'];
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

/** Warning shot under 35 %: a quick slap, the conversation goes on. */
async function slap(npc: NpcId): Promise<void> {
  const hit = (): void => {
    sfx('slap');
    bang(ui!, SLAPS[state.nextId % SLAPS.length] ?? 'PAF !');
  };
  if (interior.isOpen()) {
    hit();
    interior.root.classList.remove('slapped');
    void interior.root.offsetWidth;
    interior.root.classList.add('slapped');
    await new Promise((r) => setTimeout(r, 450));
  } else await world.slap(npc, hit);
  commit(resolveSlap(state, npc));
  toast(ui!, `🖐️ ${CHARACTERS[npc].name} t’a collé une baffe !`, 'bad');
}

async function runClash(npc: NpcId, clash: Clash): Promise<void> {
  if (clash === 'slap') {
    busy = true;
    await slap(npc);
    busy = false;
    return;
  }
  busy = true;
  endTalk();
  const inside = interior.current();
  if (inside) {
    interior.exit();
    leaveBuilding(inside);
  }
  world.setFrozen(npc);
  if (clash === 'fight') await fight(npc);
  else await murder(npc);
  busy = false;
}

async function fight(npc: NpcId): Promise<void> {
  toast(ui!, `💥 BAGARRE avec ${CHARACTERS[npc].name} !`, 'bad');
  music('fight');
  let i = 0;
  const words = setInterval(() => {
    sfx('punch');
    bang(ui!, BANGS[i++ % BANGS.length] ?? 'POW !');
  }, 380);
  await world.fight(npc);
  clearInterval(words);
  ambient();
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
    sfx('bonk');
    bang(ui!, 'BONK !!');
    music('death');
  });
  await showDeath(ui!, CHARACTERS[npc].name, WEAPONS[npc], LAST_WORDS[npc]);
  const coinsBefore = state.coins;
  const applied = resolveMurder(state, npc);
  commit(applied.state);
  world.revive();
  world.teleportPlayer({ x: 12, z: 20 });
  world.setFrozen(null);
  ambient();
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
  sfx('coin');
  toast(ui!, `${CATALOG[next.item].name} acheté ${outcome.price} 🪙 → dans ton sac`, 'good');
  dialogue.setChips(chipsFor('gaston', defaultSuggestions('gaston')));
  await dialogue.say(outcome.line, 'joie');
}

// ---------- Houses & shops ----------

const OWNER_SAYS: Record<NpcId, string[]> = {
  gaston: ['Excellent choix ! Enfin, tous mes choix sont excellents.', 'Vendu ! Et sans garantie, comme d’habitude.', 'Tu repasses quand tu veux, ton porte-monnaie aussi.'],
  josette: ['Oh, ça t’ira à ravir mon chou ! Je le dirai à tout le monde.', 'Tricoté avec amour. Et un peu de ragots.', 'Tout le village va en parler, crois-moi !'],
  marius: ['… Prends-en soin. La mer, elle, ne rend rien.', '… Bon choix. Mon père aurait approuvé.', '… Hm. Ça te va.'],
};

function playerSpec(): SpriteSpec {
  const look = lookOf(state);
  const base = lookSpec(state.look ?? DEFAULT_LOOK, !look.shirt);
  const spec: SpriteSpec = look.shirt ? { ...base, shirt: look.shirt } : base;
  if (look.scarf) spec.scarf = look.scarf;
  else delete spec.scarf;
  if (look.hat) {
    spec.hairStyle = look.hat.style;
    spec.hat = look.hat.color;
  }
  return spec;
}

function syncLook(force = false): void {
  const next = JSON.stringify([state.outfit, state.look]);
  if (next === lookKey && !force) return;
  lookKey = next;
  const spec = playerSpec();
  world.setPlayerSpec(spec);
  interior.setPlayerSheet(drawSheet(spec));
}

function enterBuilding(id: BuildingId): void {
  if (busy || interior.isOpen()) return;
  if (fishing) stopFishing();
  endTalk();
  held.clear();
  interior.enter(id, state);
  sfx('door');
  music('interior');
}

function leaveBuilding(id: BuildingId): void {
  endTalk();
  sfx('door');
  music('island');
  held.clear();
  const b = BUILDINGS.find((x) => x.id === id);
  if (b) world.teleportPlayer(doorTile(b));
}

const iconCache = new Map<string, string>();
function iconUrl(id: keyof typeof SHOP_ITEMS): string {
  const hit = iconCache.get(id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 40;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  drawIcon(ctx, SHOP_ITEMS[id].icon, SHOP_ITEMS[id].color, 4, 4, 32, 32);
  const url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}

function onInteriorAction(a: Action): void {
  if (busy || ui!.querySelector('.sheet-back')) return;
  switch (a.kind) {
    case 'talk':
      return startTalk(a.npc);
    case 'shelf':
      return openStock(a.shop, a.levels, a.title);
    case 'locked': {
      const l = ISLAND_LEVELS.find((x) => x.level === a.level);
      return toast(ui!, `🔒 Arrive quand l’île sera « ${l?.name ?? ''} » (★${l?.min ?? 0}) · ★${state.islandValue} actuellement`, 'info');
    }
    case 'wardrobe':
      return openWardrobe();
    case 'bed':
      interior.exit();
      return void absence();
    case 'board':
      return openBoard();
    case 'deco':
      startTalk('gaston');
      setTimeout(() => openShop(), 300);
      return;
    case 'say':
      return toast(ui!, a.text, 'info');
  }
}

function openStock(shop: ShopId, levels: number[], title: string): void {
  const owner = SHOP_OWNER[shop];
  const entries = stockOf(state, shop).filter((e) => levels.includes(e.item.level));
  sheet(
    ui!,
    `${title} · ${CHARACTERS[owner].name}`,
    entries.map((e) => ({
      label: e.item.name,
      icon: iconUrl(e.item.id),
      detail: e.owned ? (e.item.slot ? 'À toi · armoire' : 'Déjà chez toi') : e.locked ? `🔒 île niv. ${e.item.level}` : `${e.price} 🪙 · ${e.item.slot ? 'se porte' : `★${e.item.prestige}`}`,
      disabled: e.owned || e.locked || state.coins < e.price,
      action: () => buyShopItem(e.item.id),
    })),
    'Rayon vide.',
  );
}

function buyShopItem(id: keyof typeof SHOP_ITEMS): void {
  const levelBefore = islandLevel(state.islandValue).level;
  const res = buyItem(state, id, islandValue);
  if (!res.ok) return toast(ui!, res.reason === 'coins' ? 'Pas assez de pièces…' : 'Indisponible.', 'bad');
  commit(res.state);
  const it = SHOP_ITEMS[id];
  const owner = SHOP_OWNER[it.shop];
  sfx('coin');
  toast(ui!, `${it.name} −${res.price} 🪙 ${it.slot ? '· tu le portes !' : `→ chez toi · ★${state.islandValue}`}`, 'good');
  const lines = OWNER_SAYS[owner];
  setTimeout(() => toast(ui!, `${CHARACTERS[owner].name} : « ${lines[state.nextId % lines.length] ?? ''} »`, 'info'), 1300);
  const lvl = islandLevel(state.islandValue);
  if (lvl.level > levelBefore) setTimeout(() => sfx('sparkle'), 2700);
  if (lvl.level > levelBefore) setTimeout(() => toast(ui!, `🎉 L’île devient « ${lvl.name} » ! Les boutiques s’agrandissent.`, 'good'), 2700);
}

function openWardrobe(): void {
  const clothes = state.owned.filter((id) => SHOP_ITEMS[id].slot);
  sheet(
    ui!,
    'Garde-robe',
    clothes.map((id) => ({
      label: SHOP_ITEMS[id].name,
      icon: iconUrl(id),
      detail: Object.values(state.outfit).includes(id) ? '✔ porté · retirer' : 'porter',
      action: () => commit(toggleWear(state, id)),
    })),
    'Aucun vêtement. Josette et Marius en vendent.',
  );
}

function openBoard(): void {
  const lvl = islandLevel(state.islandValue);
  const next = nextLevel(state.islandValue);
  sheet(
    ui!,
    `Île « ${lvl.name} » · ★${state.islandValue}`,
    ISLAND_LEVELS.map((l) => ({
      label: `${l.level <= lvl.level ? '✔' : '🔒'} Niv. ${l.level} · ${l.name}`,
      detail: `★${l.min}`,
      disabled: l.level > lvl.level,
      action: () => undefined,
    })),
    '',
  );
  if (next) toast(ui!, `Encore ★${next.min - state.islandValue} pour « ${next.name} » : décore l’île et meuble ta maison !`, 'info');
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
      ...state.owned.filter((id) => SHOP_ITEMS[id].slot).map((id) => ({
        label: SHOP_ITEMS[id].name,
        icon: iconUrl(id),
        detail: Object.values(state.outfit).includes(id) ? '✔ porté' : 'porter',
        action: () => commit(toggleWear(state, id)),
      })),
      ...[...fishCounts()].map(([id, n]) => ({
        label: `${FISH[id].name}${n > 1 ? ` ×${n}` : ''}`,
        icon: fishIconUrl(id),
        detail: `${FISH[id].rarity} · à vendre ou offrir`,
        action: () => undefined,
      })),
    ],
    'Vide. Gaston vend de quoi embellir l\u2019île… à son prix.',
  );
}

function fishCounts(): Map<FishId, number> {
  const counts = new Map<FishId, number>();
  for (const f of state.fish) counts.set(f, (counts.get(f) ?? 0) + 1);
  return counts;
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
  sfx('place');
  commit(result.state);
  toast(ui!, `★ Valeur de l\u2019île : ${state.islandValue}`, 'good');
  result.reactions.forEach((r, i) => setTimeout(() => toast(ui!, `${CHARACTERS[r.npc].name} : « ${r.line} »`, r.delta < 0 ? 'bad' : 'info'), 900 + i * 1400));
  result.changes.forEach((c, i) => setTimeout(() => showChange(c), 1200 + i * 1400));
}

// ---------- Fishing ----------

type Fishing = { phase: 'walk' } | { phase: 'wait' | 'bite'; spot: FishSpot; t: number };
const BITE_WINDOW = 0.9;
let fishing: Fishing | null = null;

const MARIUS_ON_CATCH: Record<string, string> = {
  rare: '… Pas mal. La chance du débutant. Moi, j’en ai sorti un deux fois plus gros. En 1987.',
  légendaire: '… Un poulpe doré ?! … Non. Non non non. C’est MON coin, ça. Depuis trente ans.',
  déchet: '… Une botte. Au moins, t’as pêché quelque chose.',
};

function fishHere(): FishSpot | null {
  return world.fishSpot({ x: Math.round(world.playerPos.x), z: Math.round(world.playerPos.z) }, 1);
}

function goFish(spot: FishSpot): void {
  if (busy || interior.isOpen()) return;
  endTalk();
  if (state.fish.length >= BAG_FISH_MAX) return toast(ui!, `Ton sac est plein de poissons (${BAG_FISH_MAX}). Va les vendre à Gaston !`, 'info');
  fishing = { phase: 'walk' };
  world.walkTo(spot.stand, () => {
    if (fishing?.phase !== 'walk') return;
    fishing = { phase: 'wait', spot, t: 1.6 + Math.random() * 3 };
    world.setFishing(spot.spot);
    sfx('splash');
    toast(ui!, '🎣 Touche l’écran quand le bouchon plonge !', 'info');
  });
}

function stopFishing(): void {
  fishing = null;
  world.setFishing(null);
  fishBtn.classList.remove('bite');
}

function strike(): void {
  if (!fishing || fishing.phase === 'walk') return;
  if (fishing.phase === 'wait') {
    stopFishing();
    return toast(ui!, 'Trop tôt ! Le poisson a filé…', 'bad');
  }
  stopFishing();
  const id = rollFish(Math.random());
  const added = addCatch(state, id);
  if (!added.ok) return toast(ui!, 'Sac plein !', 'bad');
  commit(added.state);
  sfx('splash');
  sfx('catch');
  bang(ui!, 'PLOUF !');
  void showCatch(ui!, fishIconUrl(id, 96), FISH[id].name, FISH[id].rarity, `Dans ton sac · ${state.fish.length}/${BAG_FISH_MAX}`);
  const comment = MARIUS_ON_CATCH[FISH[id].rarity === 'légendaire' ? 'légendaire' : FISH[id].rarity === 'rare' ? 'rare' : FISH[id].rarity === 'déchet' ? 'déchet' : ''];
  if (comment) setTimeout(() => toast(ui!, `Marius : « ${comment} »`, 'info'), 2400);
}

function updateFishing(dt: number): void {
  const spot = !busy && !interior.isOpen() && !dialogue.isOpen() && (!fishing || fishing.phase === 'walk') ? fishHere() : null;
  fishBtn.hidden = !(spot || (fishing && fishing.phase !== 'walk'));
  fishBtn.textContent = fishing && fishing.phase !== 'walk' ? (fishing.phase === 'bite' ? '❗ Ferrer !' : '🎣 …') : '🎣 Pêcher';
  if (!fishing || fishing.phase === 'walk') return;
  fishing.t -= dt;
  if (fishing.phase === 'wait' && fishing.t <= 0) {
    fishing = { ...fishing, phase: 'bite', t: BITE_WINDOW };
    world.setFishing(fishing.spot.spot, true);
    fishBtn.classList.add('bite');
    sfx('bite');
    bang(ui!, '!');
  } else if (fishing.phase === 'bite' && fishing.t <= 0) {
    stopFishing();
    toast(ui!, 'Raté… il s’est décroché.', 'bad');
  }
}

const fishBtn = el('button', 'action fish-btn', '🎣 Pêcher', { type: 'button' });
fishBtn.hidden = true;
fishBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (fishing && fishing.phase !== 'walk') return strike();
  const spot = fishHere();
  if (spot) goFish(spot);
});

function openFishGift(npc: NpcId): void {
  const counts = fishCounts();
  sheet(
    ui!,
    npc === 'gaston' ? 'Vendre à Gaston' : `Offrir à ${CHARACTERS[npc].name}`,
    [...counts].map(([id, n]) => ({
      label: `${FISH[id].name}${n > 1 ? ` ×${n}` : ''}`,
      icon: fishIconUrl(id),
      detail: npc === 'gaston' ? `${FISH[id].value} 🪙` : FISH[id].rarity,
      action: () => void offerFish(npc, id),
    })),
    'Aucun poisson. Va pêcher au bord de l’eau !',
  );
}

async function offerFish(npc: NpcId, id: FishId): Promise<void> {
  if (busy) return;
  const before = state.npcs[npc].relation;
  const out = giveFish(state, npc, id);
  if (!out) return;
  dialogue.playerSaid(npc === 'gaston' ? `Tu m’achètes ce ${FISH[id].name.toLowerCase()} ?` : `Tiens, c’est pour toi : ${FISH[id].name.toLowerCase()}.`, state.playerName);
  commit(out.state);
  if (out.coins > 0) toast(ui!, `+${out.coins} 🪙 · ${FISH[id].name}`, 'good');
  showChange(out.change);
  const clash = clashFor(before, state.npcs[npc].relation);
  busy = true;
  dialogue.setChips([]);
  const line = dialogue.say(out.line, out.change && out.change.delta < 0 ? 'colere' : 'joie');
  if (clash === 'slap') await slap(npc);
  await line;
  busy = false;
  if (clash && clash !== 'slap') return runClash(npc, clash);
  dialogue.setChips(chipsFor(npc, defaultSuggestions(npc)));
}

// ---------- Absence ----------

async function absence(): Promise<void> {
  if (busy) return;
  tips.done('rumor');
  busy = true;
  endTalk();
  document.body.classList.add('night');
  sfx('whoosh');
  music('night');
  hud.setAiStatus('Le temps passe sur l\u2019île…');
  const before = state;
  const result = await simulate(before, buildSimRequest(before, ABSENCE_HOURS));
  const { state: next, recap } = applySimResult(before, result, ABSENCE_HOURS);
  commit(next);
  world.teleportPlayer({ x: 12, z: 20 });
  hud.setAiStatus('');
  document.body.classList.remove('night');
  sfx('paper');
  music('gazette');
  await showGazette(ui!, buildGazette(before, next, recap));
  ambient();
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
  if (fishing && fishing.phase !== 'walk') return strike();
  fishing = null;
  const ndc = new THREE.Vector2((e.clientX / canvas.clientWidth) * 2 - 1, -(e.clientY / canvas.clientHeight) * 2 + 1);
  const target = world.pick(ndc);
  if (!target) return;
  if (target.kind === 'npc') startTalk(target.npc);
  else if (target.kind === 'building') {
    endTalk();
    const b = BUILDINGS.find((x) => x.id === target.building);
    if (b) world.walkTo(doorTile(b), () => enterBuilding(b.id));
  } else if (target.kind === 'water') {
    const spot = world.fishSpot(target.tile, 3);
    if (spot) goFish(spot);
  } else if (target.kind === 'slot') {
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
    if (interior.isOpen()) return interior.interact();
    if (fishing && fishing.phase !== 'walk') return strike();
    const door = world.doorHere();
    if (door && !world.nearestNpc(1.5)) return enterBuilding(door);
    const near = world.nearestNpc(6);
    if (near) return startTalk(near);
    const spot = fishHere();
    if (spot) goFish(spot);
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
  if (busy && !replying) dx = dz = 0;
  if (interior.isOpen()) return interior.move(dx, dz, dt);
  if ((dx || dz) && fishing) stopFishing();
  world.move(dx, dz, dt);
  const door = dz < 0 && dx === 0 ? world.doorHere() : null;
  if (door) enterBuilding(door);
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const ndc = new THREE.Vector2((e.clientX / canvas.clientWidth) * 2 - 1, -(e.clientY / canvas.clientHeight) * 2 + 1);
  const target = world.pick(ndc);
  canvas.style.cursor = target && target.kind !== 'ground' ? 'pointer' : 'default';
});

if (matchMedia('(pointer: fine)').matches) {
  ui.append(el('div', 'keys-help', 'ZQSD / flèches : marcher · E : parler / pêcher · Entrée : écrire · I : sac · Échap : fermer · clic : aller / parler'));
}

window.addEventListener('resize', () => stage.resize());
window.visualViewport?.addEventListener('resize', () => {
  const vv = window.visualViewport;
  if (vv) document.documentElement.style.setProperty('--kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
});

const governor = createQualityGovernor(stage, (q) => console.info(`[perf] quality → ${q}`));
const timer = new THREE.Timer();
timer.connect(document);
const STEP = 0.55;
const lastStep = new THREE.Vector3(Number.NaN, 0, 0);
function footsteps(): void {
  const p = world.playerPos;
  if (Number.isNaN(lastStep.x) || interior.isOpen()) {
    lastStep.copy(p);
    return;
  }
  const d = Math.hypot(p.x - lastStep.x, p.z - lastStep.z);
  if (d > 3) lastStep.copy(p);
  else if (d >= STEP) {
    lastStep.copy(p);
    sfx('step');
  }
}

function frame(): void {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  const time = timer.getElapsed();
  keyboardMove(dt);
  tickLife(time);
  updateFishing(dt);
  footsteps();
  world.update(dt, time, new Set(npcsWithIntent(state)));
  if (interior.isOpen()) interior.update(dt, time);
  else {
    stage.follow(world.playerPos, dt);
    stage.render();
  }
  hud.setFps(governor(dt));
  requestAnimationFrame(frame);
}

ui.append(fishBtn);
commit(state);
stage.resize();
requestAnimationFrame(frame);

function applyLook(): void {
  syncLook(true);
}

function talkTip(): void {
  tips.show('talk', matchMedia('(pointer: fine)').matches ? '💬 Approche un habitant et appuie sur E pour lui parler' : '💬 Touche un habitant pour lui parler');
}

async function newGame(profile: Profile, short: boolean): Promise<void> {
  localStorage.removeItem(TIPS_KEY);
  const fresh = createInitialState(profile.name, profile.island, profile.look);
  commit(recordFact(fresh, { actor: 'player', text: arrivalFactText(profile.name, profile.island), severity: -1, witnesses: ['josette', 'gaston', 'marius'] }).state);
  music('raft');
  await playIntro(world, ui!, {
    name: profile.name,
    island: profile.island,
    spec: lookSpec(profile.look, true),
    short,
  });
  toast(ui!, `Bienvenue sur ${profile.island}, ${profile.name} !`, 'good');
}

async function boot(): Promise<void> {
  applyLook();
  const demo = params.has('demo');
  const preset: Partial<Profile> = {};
  const presetName = cleanName(params.get('name'));
  const presetIsland = cleanIsland(params.get('island')) || (demo ? ISLAND_IDEAS[1] : '');
  if (presetName) preset.name = presetName;
  if (presetIsland) preset.island = presetIsland;
  if (demo) preset.look = DEFAULT_LOOK;
  if (params.has('skip-intro')) {
    if (!state.playerName) commit({ ...state, playerName: presetName || 'Jury', islandName: presetIsland || ISLAND_IDEAS[1] || '', look: state.look ?? DEFAULT_LOOK });
    applyLook();
    music('island');
    talkTip();
    return;
  }
  busy = true;
  hud.root.hidden = true;
  const hasProfile = state.playerName !== '';
  music('title');
  const result = await runOnboarding(ui!, {
    canContinue: hasProfile,
    continueLabel: hasProfile ? `Continuer (${state.playerName}${state.islandName ? ` · ${state.islandName}` : ''})` : 'Continuer',
    preset,
  });
  if (result.kind === 'new') await newGame(result.profile, demo);
  music('island');
  hud.root.hidden = false;
  busy = false;
  talkTip();
}
void boot();

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
      enter: (id: BuildingId) => void;
      skin: (skin: PlayerSkin) => void;
      fish: () => FishSpot | null;
      strike: () => void;
    };
  }
}
/** Hooks for the scripted demo recording (see CLAUDE.md §13). */
window.ragots = { state: () => state, talk: (npc) => startTalk(npc), say: (text) => onPlayerLine(text), absence, clash: runClash, pos: () => ({ x: world.playerPos.x, z: world.playerPos.z }), homes: HOMES, enter: (id) => enterBuilding(id), skin: (skin) => (skin === 'castaway' ? world.setPlayerSkin(skin) : applyLook()), fish: () => { const spot = world.fishSpot({ x: Math.round(world.playerPos.x), z: Math.round(world.playerPos.z) }, 8); if (spot) goFish(spot); return spot; }, strike };
if (params.get('skin') === 'castaway') world.setPlayerSkin('castaway');

