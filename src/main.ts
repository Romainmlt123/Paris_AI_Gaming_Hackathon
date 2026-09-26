import './ui/style.css';
import * as THREE from 'three';
import { World, type Target } from './render/world.ts';
import { Store } from './game/store.ts';
import * as api from './game/api.ts';
import { blip, recordWav, saveSettings, settings, sfx, speak, stopVoice } from './game/audio.ts';
import { NPCS } from './data/npcs.ts';
import { ITEMS, SHOP_ITEMS, item } from './data/items.ts';
import { NPC_HOME, SLOTS, TREES, canStep, groundAt, tileToWorld, walkable, worldToTile } from './data/island.ts';
import { NPC_IDS, type ChatTurn, type Deal, type NpcId, type RelationChange, type SlotId, type TalkResponse } from './state/types.ts';
import { buildContext } from './logic/context.ts';
import { detectDenial } from './logic/facts.ts';
import { applyTalk } from './logic/talk.ts';
import { simulateAbsence } from './logic/absence.ts';
import { applyOffer, applyScam, executeDeal, hasRotten, islandValue, placeDecor, removeDecor, startDeal } from './logic/economy.ts';
import { catchButterfly, catchFish, feedAnimal, shakeTree, takePickup } from './logic/activities.ts';
import { findPath, type Tile } from './logic/path.ts';
import { tierOf } from './logic/relations.ts';
import { INVENTORY_SIZE, countItem } from './logic/inventory.ts';
import { portraitUrl } from './render/sprites.ts';
import { btn, gaugeWidth, h, relColor, sleep } from './ui/dom.ts';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;
const params = new URLSearchParams(location.search);
if (params.has('reset')) localStorage.removeItem('ragots-save-v2');
const store = new Store();
if (params.has('reset')) history.replaceState(null, '', location.pathname);
const world = new World(canvas);
const portraits: Record<NpcId, string> = { gaston: portraitUrl('gaston'), josette: portraitUrl('josette'), marius: portraitUrl('marius') };

const start = store.state.player;
world.player.pos.set(start.x, 0.5, start.z);
world.snapCamera();
world.sync(store.state);

let busy = false; // dialogue, panneau ou mini-jeu ouvert : l'île ne réagit plus aux taps
let npcBusy: Partial<Record<NpcId, boolean>> = {};

// ---------------- HUD ----------------
const hud = h('div', { class: 'hud' });
const clock = h('div', { class: 'pill' });
const coins = h('div', { class: 'pill coins' });
const prestige = h('div', { class: 'pill' });
hud.append(clock, h('div', { class: 'spacer' }), coins, prestige, btn('⚙️', 'iconbtn', () => openSettings()));
const rels = h('div', { class: 'rels' });
const relEls = {} as Record<NpcId, HTMLDivElement>;
for (const id of NPC_IDS) {
  const el = h('div', { class: 'rel' }, h('img', { src: portraits[id], alt: '' }), h('div', {}, h('div', {}, NPCS[id].name), h('div', { class: 'bar' }, h('i')), h('div', { class: 'tier' })));
  relEls[id] = el;
  rels.append(el);
}
const bar = h('div', { class: 'bottombar' });
bar.append(
  btn('Sac', '', () => openInventory(), '🎒'),
  btn('Déco', '', () => openDecorMode(), '🪑'),
  btn('Partir', '', () => openAbsence(), '🌙'),
  btn('Gazette', '', () => openRecap(true), '📰'),
);
ui.append(hud, rels, bar);

function fmtHour(hr: number): string {
  const hh = Math.floor(hr);
  return `${hh}h${String(Math.round((hr - hh) * 60)).padStart(2, '0')}`;
}

function renderHud(): void {
  const s = store.state;
  clock.innerHTML = `Jour ${s.day} <small>${fmtHour(s.hour)}</small>`;
  coins.textContent = `🪙 ${s.player.bells}`;
  prestige.textContent = `✨ ${islandValue(s)}`;
  for (const id of NPC_IDS) {
    const st = s.npcs[id];
    const el = relEls[id];
    const i = el.querySelector('i');
    if (i) {
      i.style.width = gaugeWidth(st.relation);
      i.style.background = relColor(st.relation);
    }
    const tier = el.querySelector('.tier');
    if (tier) tier.textContent = `${tierOf(st.relation).name} · ${st.relation}`;
    el.classList.toggle('bang', st.intent !== null);
  }
}
store.subscribe((s) => {
  world.sync(s);
  renderHud();
  const v = ui.querySelector('.island-value');
  if (v) v.textContent = `✨ Valeur de l’île : ${islandValue(s)}`;
});
renderHud();

function toast(msg: string): void {
  if (!msg) return;
  const t = h('div', { class: 'toast' }, msg);
  ui.append(t);
  setTimeout(() => t.remove(), 2700);
}

function bubbleAt(pos: THREE.Vector3, text: string, ms = 3000): void {
  const b = h('div', { class: 'bubble' }, text);
  ui.append(b);
  const place = (): void => {
    const p = world.project(pos.clone().add(new THREE.Vector3(0, 1.9, 0)));
    const rect = ui.getBoundingClientRect();
    b.style.left = `${p.x - rect.left}px`;
    b.style.top = `${p.y}px`;
  };
  place();
  const iv = setInterval(place, 50);
  setTimeout(() => {
    clearInterval(iv);
    b.remove();
  }, ms);
}

function showChanges(changes: RelationChange[]): void {
  for (const c of changes) {
    const el = relEls[c.npc];
    el.classList.remove('shake');
    void el.offsetWidth;
    if (c.delta < 0) el.classList.add('shake');
  }
}

// ---------------- Déplacements ----------------
function playerTile(): Tile {
  return world.tileOf(world.player);
}

function neighborsOf(t: Tile): Tile[] {
  const out: Tile[] = [];
  for (const [a, b] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    const n = { i: t.i + a, j: t.j + b };
    if (walkable(n.i, n.j)) out.push(n);
  }
  return out;
}

function goTo(goal: Tile, then: () => void, adjacent = false): void {
  const from = playerTile();
  const targets = adjacent ? neighborsOf(goal) : [goal];
  if (adjacent && Math.max(Math.abs(from.i - goal.i), Math.abs(from.j - goal.j)) <= 1) {
    then();
    return;
  }
  let best: Tile[] | null = null;
  for (const t of targets) {
    const p = findPath(from, t);
    const last = p.at(-1) ?? from;
    if (last.i !== t.i || last.j !== t.j) continue;
    if (!best || p.length < best.length) best = p;
  }
  const path = best ?? findPath(from, goal);
  world.walk(world.player, path, () => {
    const p = world.player.pos;
    store.state.player.x = p.x;
    store.state.player.z = p.z;
    store.save();
    then();
  });
}

function npcTile(id: NpcId): Tile {
  return world.tileOf(world.npcs[id]);
}

// Balades des habitants
setInterval(() => {
  if (busy) return;
  for (const id of NPC_IDS) {
    if (npcBusy[id] || world.npcs[id].path.length > 0 || Math.random() < 0.5) continue;
    const home = NPC_HOME[id];
    const t = { i: home.i + Math.round((Math.random() - 0.5) * 4), j: home.j + Math.round((Math.random() - 0.5) * 2) };
    if (!walkable(t.i, t.j)) continue;
    world.walk(world.npcs[id], findPath(npcTile(id), t), () => undefined);
  }
}, 3500);

// ---------------- Taps sur l'île ----------------
world.onTap = (t: Target) => {
  if (busy) return;
  sfx.tap();
  switch (t.kind) {
    case 'ground':
      goTo({ i: t.i, j: t.j }, () => undefined);
      break;
    case 'npc':
      world.npcs[t.id].path = [];
      npcBusy[t.id] = true;
      goTo(npcTile(t.id), () => openDialog(t.id), true);
      break;
    case 'tree': {
      const def = TREES.find((x) => x.id === t.id);
      if (def) goTo(def, () => doShake(t.id), true);
      break;
    }
    case 'pickup': {
      const p = store.state.pickups.find((x) => x.id === t.id);
      if (p) goTo(worldToTile(p.x, p.z), () => {
        const r = takePickup(store.state, t.id);
        if (r.itemId) {
          sfx.pop();
          world.sparkle(world.player.pos);
        }
        store.set(r.state);
        toast(r.message);
        if (r.itemId === 'carnet') setTimeout(() => toast('📒 Des comptes truqués… Gaston serait ravi de le récupérer. Ou pas.'), 2800);
      });
      break;
    }
    case 'animal': {
      const a = store.state.animals.find((x) => x.id === t.id);
      if (!a) break;
      goTo({ i: 5, j: 23 }, () => {
        const r = feedAnimal(store.state, t.id);
        store.set(r.state);
        if (r.itemId) {
          sfx.good();
          world.sparkle(world.player.pos, '#ffe7ff');
        }
        toast(r.message);
      });
      break;
    }
    case 'slot':
      openSlot(t.id);
      break;
    case 'butterfly': {
      const pos = world.butterflyPos(t.id);
      if (!pos) break;
      if (countItem(store.state.player.inventory, 'filet') < 1) {
        toast('Il te faut un filet à insectes (chez Gaston).');
        break;
      }
      goTo(worldToTile(pos.x, pos.z), () => {
        const r = catchButterfly(store.state);
        if (r.itemId) {
          world.catchButterfly(t.id);
          sfx.good();
        }
        store.set(r.state);
        toast(r.message);
      }, true);
      break;
    }
    case 'water':
      startFishing(t.i, t.j);
      break;
  }
};

function doShake(id: string): void {
  const tp = world.treePos(id);
  if (!tp) return;
  world.shakeTree(id);
  const ptile = playerTile();
  const def = TREES.find((x) => x.id === id);
  const drop = def ? neighborsOf(def).sort((a, b) => Math.hypot(a.i - ptile.i, a.j - ptile.j) - Math.hypot(b.i - ptile.i, b.j - ptile.j))[0] : undefined;
  const dw = drop ? tileToWorld(drop.i, drop.j) : { x: tp.x, z: tp.z + 1 };
  const r = shakeTree(store.state, id, Math.random(), { x: dw.x + (Math.random() - 0.5) * 0.4, z: dw.z + (Math.random() - 0.5) * 0.4 });
  store.set(r.state);
  if (r.stung) {
    sfx.sting();
    world.stingSwarm();
    bubbleAt(world.npcs.josette.pos, 'Hihi ! 🐝', 2500);
  }
  toast(r.message);
}

// ---------------- Pêche ----------------
function startFishing(i: number, j: number): void {
  if (countItem(store.state.player.inventory, 'canne') < 1) {
    toast('Il te faut une canne à pêche.');
    return;
  }
  const target = { i, j };
  let best: Tile | null = null;
  for (let r = 1; r <= 3 && !best; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        const t = { i: i + di, j: j + dj };
        if (walkable(t.i, t.j) && (!best || Math.hypot(di, dj) < Math.hypot(best.i - i, best.j - j))) best = t;
      }
  if (!best) {
    toast('Trop loin du rivage.');
    return;
  }
  goTo(best, () => {
    busy = true;
    const wpos = tileToWorld(target.i, target.j);
    world.face(world.player, wpos.x);
    const v = new THREE.Vector3(wpos.x, 0, wpos.z);
    world.castBobber(v);
    sfx.splash();
    const layer = h('div', { class: 'fish' });
    const msg = h('div', { class: 'msg' }, 'Attends que ça morde…');
    layer.append(msg);
    ui.append(layer);
    let phase: 'wait' | 'bite' | 'done' = 'wait';
    const finish = (text: string): void => {
      phase = 'done';
      world.reelIn();
      layer.remove();
      busy = false;
      toast(text);
    };
    const waitMs = 1400 + Math.random() * 2600;
    const t1 = setTimeout(() => {
      if (phase !== 'wait') return;
      phase = 'bite';
      world.bite();
      sfx.bite();
      navigator.vibrate?.(60);
      msg.className = 'msg now';
      msg.textContent = 'TAPE !';
      setTimeout(() => {
        if (phase === 'bite') finish('Raté… il s’est échappé.');
      }, 900);
    }, waitMs);
    layer.addEventListener('pointerdown', () => {
      if (phase === 'wait') {
        clearTimeout(t1);
        finish('Trop tôt ! Le poisson a filé.');
      } else if (phase === 'bite') {
        const r = catchFish(store.state, Math.random());
        world.splash(v);
        store.set(r.state);
        if (r.itemId) sfx.good();
        finish(r.message);
        if (r.spoke) {
          const d = world.npcs.marius.pos.distanceTo(world.player.pos);
          if (d < 9) bubbleAt(world.npcs.marius.pos, r.spoke.text, 3600);
        }
      }
    });
  });
}

// ---------------- Dialogue ----------------
interface DialogState {
  npc: NpcId;
  history: ChatTurn[];
  deal: Deal | null;
  sending: boolean;
  el: HTMLDivElement;
  log: HTMLDivElement;
  chips: HTMLDivElement;
  input: HTMLInputElement;
  gauge: HTMLDivElement;
  gaugeLabel: HTMLDivElement;
  dealBox: HTMLDivElement;
}
let dlg: DialogState | null = null;

function closeDialog(): void {
  if (!dlg) return;
  stopVoice();
  npcBusy[dlg.npc] = false;
  dlg.el.remove();
  dlg = null;
  busy = false;
  bar.style.display = '';
}

function updateGauge(d: DialogState): void {
  const st = store.state.npcs[d.npc];
  const i = d.gauge.querySelector('i');
  if (i) {
    i.style.width = gaugeWidth(st.relation);
    i.style.background = relColor(st.relation);
  }
  d.gaugeLabel.innerHTML = `<span>${tierOf(st.relation).name}</span><span>${st.relation}</span>`;
}

function addLine(d: DialogState, who: 'npc' | 'player' | 'sys', text: string): HTMLDivElement {
  const el = h('div', { class: `line ${who}` }, text);
  d.log.append(el);
  d.log.scrollTop = d.log.scrollHeight;
  return el;
}

async function typeLine(d: DialogState, text: string): Promise<void> {
  const el = addLine(d, 'npc', '');
  const voiced = speak(d.npc, text);
  let n = 0;
  for (const ch of text) {
    el.textContent += ch;
    if (n++ % 2 === 0 && ch !== ' ') {
      void voiced.then((ok) => ok || blip(d.npc));
    }
    d.log.scrollTop = d.log.scrollHeight;
    await sleep(ch === '.' || ch === '!' || ch === '?' ? 90 : 18);
  }
}

function setChips(d: DialogState, list: string[]): void {
  d.chips.replaceChildren(...list.map((s) => btn(s, 'chip', () => void send(s))));
  if (d.npc === 'gaston') {
    d.chips.prepend(btn('🪙 Vendre', 'chip', () => openShop('sell')), btn('🛒 Acheter', 'chip', () => openShop('buy')));
  }
}

function floatDelta(d: DialogState, c: RelationChange): void {
  const n = d.gauge.querySelectorAll('.delta').length;
  const el = h('div', { class: `delta ${c.delta < 0 ? 'neg' : 'pos'}`, style: `top:${-26 - n * 22}px` }, `${c.delta > 0 ? '+' : ''}${c.delta} · ${c.reason}`);
  d.gauge.append(el);
  setTimeout(() => el.remove(), 2500);
}

function renderDeal(d: DialogState): void {
  const deal = d.deal;
  if (!deal) {
    d.dealBox.replaceChildren();
    d.dealBox.style.display = 'none';
    return;
  }
  d.dealBox.style.display = '';
  const what = deal.items.map((s) => `${item(s.itemId).icon}${s.qty > 1 ? `×${s.qty}` : ''}`).join(' ');
  d.dealBox.replaceChildren(
    h('div', { style: 'flex:1' }, h('div', { class: 'muted' }, deal.direction === 'sell' ? `Gaston t'en offre` : 'Gaston en demande'), h('div', {}, what, ' ', h('span', { class: 'price' }, `${deal.price} 🪙`))),
    btn('Topé !', 'btn good', () => acceptDeal()),
    btn('✕', 'btn alt', () => {
      d.deal = null;
      renderDeal(d);
      addLine(d, 'sys', 'Marché annulé');
    }),
  );
}

function acceptDeal(): void {
  const d = dlg;
  if (!d?.deal) return;
  const deal = d.deal;
  if (deal.direction === 'sell' && hasRotten(deal.items)) {
    const r = applyScam(store.state, Date.now());
    store.set(r.state);
    d.deal = null;
    renderDeal(d);
    if (r.change) {
      floatDelta(d, r.change);
      showChanges([r.change]);
    }
    sfx.bad();
    updateGauge(d);
    void typeLine(d, "Du POURRI ?! Tu me prends pour un pigeon ? On n'arnaque pas un arnaqueur, mon petit !");
    return;
  }
  const res = executeDeal(store.state, deal);
  if (!res.ok) {
    addLine(d, 'sys', res.error);
    return;
  }
  store.set(res.state);
  sfx.coin();
  d.deal = null;
  renderDeal(d);
  addLine(d, 'sys', deal.direction === 'sell' ? `+${deal.price} 🪙` : `-${deal.price} 🪙 · ${deal.items.map((s) => item(s.itemId).name).join(', ')} dans ton sac`);
  void typeLine(d, deal.direction === 'sell' ? 'Plaisir de faire affaire ! Hé hé.' : 'Excellent choix ! Enfin, pour moi surtout.');
}

function openDialog(npc: NpcId): void {
  if (dlg) closeDialog();
  busy = true;
  bar.style.display = 'none';
  world.face(world.npcs[npc], world.player.pos.x);
  world.face(world.player, world.npcs[npc].pos.x);
  const sheet = NPCS[npc];
  const gauge = h('div', { class: 'gauge' }, h('i'), h('b'));
  const gaugeLabel = h('div', { class: 'gauge-label' });
  const log = h('div', { class: 'log' });
  const chips = h('div', { class: 'chips' });
  const input = h('input', { type: 'text', placeholder: `Réponds à ${sheet.name}…`, maxlength: '200', enterkeyhint: 'send' });
  const dealBox = h('div', { class: 'deal', style: 'display:none' });
  const mic = btn('🎤', '', () => void micInput());
  const el = h('div', { class: 'sheet' },
    btn('✕', 'close', () => closeDialog()),
    h('div', { class: 'dlg-head' }, h('img', { src: portraits[npc], alt: sheet.name }), h('div', { style: 'flex:1' }, h('div', { class: 'name title' }, sheet.name), h('div', { class: 'role' }, sheet.role), gaugeLabel, gauge)),
    log,
    dealBox,
    chips,
    h('div', { class: 'inputrow' }, input, mic, btn('🎁', '', () => openGiftPicker()), btn('➤', 'send', () => void send(input.value))),
  );
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void send(input.value);
  });
  ui.append(el);
  dlg = { npc, history: [], deal: null, sending: false, el, log, chips, input, gauge, gaugeLabel, dealBox };
  const d = dlg;
  updateGauge(d);
  const st = store.state.npcs[npc];
  if (st.intent) {
    void send('', null);
  } else {
    const line = sheet.openers[Math.floor(Math.random() * sheet.openers.length)] ?? 'Bonjour.';
    d.history.push({ who: 'npc', text: line });
    void typeLine(d, line);
    setChips(d, sheet.suggestions);
  }
}

async function send(text: string, offeredItemId: string | null = null): Promise<void> {
  const d = dlg;
  if (!d || d.sending) return;
  const t = text.trim();
  if (!t && d.history.length > 0 && !offeredItemId) return;
  d.sending = true;
  d.input.value = '';
  if (t) {
    addLine(d, 'player', t);
    d.history.push({ who: 'player', text: t });
  }
  const typing = addLine(d, 'npc', '');
  typing.classList.add('typing');
  const state = store.state;
  const ctx = buildContext(state, d.npc, { offeredItemId, deal: d.deal });
  if (t) ctx.denial = detectDenial(ctx, t, state.facts);
  const resp: TalkResponse = await api.talk(d.npc, t, ctx, d.history.slice(0, -1), offeredItemId, state.player.name);
  typing.remove();
  if (dlg !== d) return;
  const out = applyTalk(store.state, d.npc, t, resp, ctx, Date.now());
  store.set(out.state);
  if (d.npc === 'gaston' && resp.deal) {
    if (d.deal && d.deal.direction === resp.deal.direction) d.deal = applyOffer(d.deal, resp.deal.price);
    else if (ITEMS[resp.deal.itemId] && (resp.deal.direction === 'buy' ? item(resp.deal.itemId).price > 0 : countItem(store.state.player.inventory, resp.deal.itemId) >= resp.deal.qty)) {
      d.deal = applyOffer(startDeal(store.state, resp.deal.direction, [{ itemId: resp.deal.itemId, qty: resp.deal.qty }]), resp.deal.price);
    }
    renderDeal(d);
  } else if (d.deal && t) {
    d.deal = { ...d.deal, rounds: d.deal.rounds + 1 };
  }
  if (out.lieCaught) {
    sfx.bad();
    navigator.vibrate?.([80, 40, 120]);
    const flash = h('div', { class: 'flash' });
    ui.append(flash);
    setTimeout(() => flash.remove(), 700);
    const stamp = h('div', { class: 'stamp title' }, 'MENSONGE', h('br'), 'DÉMASQUÉ');
    ui.append(stamp);
    setTimeout(() => stamp.remove(), 2300);
  } else if (out.giftTaken) sfx.good();
  for (const c of out.changes) floatDelta(d, c);
  showChanges(out.changes);
  updateGauge(d);
  d.history.push({ who: 'npc', text: resp.reply });
  setChips(d, resp.suggestions);
  if (resp.fallback) console.info('[talk] réplique de secours');
  await typeLine(d, resp.reply);
  d.sending = false;
}

let recording: (() => void) | null = null;
async function micInput(): Promise<void> {
  const d = dlg;
  if (!d) return;
  const micBtn = d.el.querySelector('.inputrow button:nth-of-type(1)');
  if (recording) {
    recording();
    return;
  }
  let stop: () => void = () => undefined;
  const stopped = new Promise<void>((r) => (stop = r));
  recording = stop;
  micBtn?.classList.add('rec');
  d.input.placeholder = 'Je t’écoute… (retape 🎤 pour finir)';
  const wav = await recordWav(8000, stopped);
  recording = null;
  micBtn?.classList.remove('rec');
  d.input.placeholder = 'Transcription…';
  const text = wav ? await api.stt(wav) : '';
  d.input.placeholder = `Réponds à ${NPCS[d.npc].name}…`;
  if (!text) {
    toast(wav ? 'Je n’ai rien compris, écris plutôt !' : 'Micro indisponible, écris plutôt !');
    return;
  }
  d.input.value = text;
  void send(text);
}

// ---------------- Panneaux ----------------
function panel(title: string, ...content: (Node | string)[]): HTMLDivElement {
  const el = h('div', { class: 'sheet', style: 'z-index:3' }, btn('✕', 'close', () => el.remove()), h('h2', { class: 'title' }, title), ...content);
  ui.append(el);
  return el;
}

function inventoryGrid(onPick: (itemId: string, cell: HTMLElement) => void, filter: (id: string) => boolean = () => true): HTMLDivElement {
  const grid = h('div', { class: 'grid' });
  const inv = store.state.player.inventory;
  for (let k = 0; k < INVENTORY_SIZE; k++) {
    const s = inv[k];
    if (!s) {
      grid.append(h('div', { class: 'cell empty' }));
      continue;
    }
    const def = item(s.itemId);
    const cell = h('div', { class: `cell${filter(s.itemId) ? '' : ' empty'}` }, def.icon, s.qty > 1 ? h('span', { class: 'q' }, String(s.qty)) : null);
    if (filter(s.itemId)) cell.addEventListener('click', () => onPick(s.itemId, cell));
    grid.append(cell);
  }
  return grid;
}

function openInventory(): void {
  if (busy) return;
  const detail = h('div', { class: 'detail muted' }, `${store.state.player.inventory.length}/${INVENTORY_SIZE} cases · touche un objet`);
  const el = panel('🎒 Ta sacoche');
  el.append(
    inventoryGrid((id, cell) => {
      el.querySelectorAll('.cell').forEach((c) => c.classList.remove('sel'));
      cell.classList.add('sel');
      const def = item(id);
      const kind = { tool: 'Outil', resource: 'Ressource', decor: 'Décoration', story: 'Objet narratif' }[def.kind];
      detail.replaceChildren(h('div', { style: 'font-weight:900;color:var(--ink)' }, `${def.icon} ${def.name}`), h('div', {}, `${kind}${def.sellPrice ? ` · Gaston en donne ~${def.sellPrice} 🪙` : ''}${def.prestige ? ` · ✨ ${def.prestige}` : ''}`));
      if (def.kind === 'decor')
        detail.append(btn('Poser sur l’île', 'btn', () => {
          el.remove();
          openDecorMode();
        }));
    }),
    detail,
  );
}

function openGiftPicker(): void {
  const d = dlg;
  if (!d) return;
  const el = panel(`🎁 Montrer / offrir à ${NPCS[d.npc].name}`);
  el.append(inventoryGrid((id) => {
    el.remove();
    const def = item(id);
    const text = def.kind === 'story' ? `Regarde ce que j'ai trouvé : ${def.name}.` : `Tiens, c'est pour toi : ${def.name} !`;
    void send(text, id);
  }, (id) => item(id).kind !== 'tool'));
}

function openShop(mode: 'buy' | 'sell'): void {
  const d = dlg;
  if (!d) return;
  const el = panel(mode === 'buy' ? '🛒 L’échoppe de Gaston' : '🪙 Vendre à Gaston');
  const pf = buildContext(store.state, 'gaston').shopPrices ?? [];
  if (mode === 'buy') {
    const list = h('div', { class: 'list' });
    for (const id of SHOP_ITEMS) {
      const def = item(id);
      const p = pf.find((x) => x.itemId === id)?.price ?? def.price;
      const req = def.requires ? ` · exige ${def.requires.qty} ${item(def.requires.itemId).icon}` : '';
      list.append(h('div', { class: 'item-row' }, h('span', { class: 'ic' }, def.icon), h('div', { class: 'grow' }, def.name, h('small', {}, `${def.prestige ? `✨ ${def.prestige}` : 'Outil'}${req}`)), btn(`${p} 🪙`, 'btn', () => {
        el.remove();
        d.deal = startDeal(store.state, 'buy', [{ itemId: id, qty: 1 }]);
        renderDeal(d);
        addLine(d, 'sys', 'Négocie en écrivant, ou tope là !');
      })));
    }
    el.append(h('div', { class: 'muted', style: 'margin-bottom:6px' }, 'Prix selon ton amitié avec Gaston. Tout se négocie !'), list);
  } else {
    const picked = new Map<string, number>();
    const go = btn('Demander un prix', 'btn', () => {
      if (picked.size === 0) return;
      el.remove();
      d.deal = startDeal(store.state, 'sell', [...picked].map(([itemId, qty]) => ({ itemId, qty })));
      renderDeal(d);
      addLine(d, 'sys', 'Négocie en écrivant, ou tope là !');
    });
    el.append(
      h('div', { class: 'muted', style: 'margin-bottom:6px' }, 'Touche les piles à vendre (vente en lot possible).'),
      inventoryGrid((id, cell) => {
        if (picked.has(id)) {
          picked.delete(id);
          cell.classList.remove('sel');
        } else {
          picked.set(id, countItem(store.state.player.inventory, id));
          cell.classList.add('sel');
        }
      }, (id) => item(id).kind !== 'story' && item(id).sellPrice > 0),
      h('div', { class: 'row', style: 'margin-top:10px;justify-content:flex-end' }, go),
    );
  }
}

function openDecorMode(): void {
  if (busy) return;
  world.setDecorMode(true);
  busy = true;
  bar.style.display = 'none';
  const value = h('b', { class: 'island-value' }, `✨ Valeur de l’île : ${islandValue(store.state)}`);
  const el = h('div', { class: 'sheet', style: 'z-index:3' },
    h('h2', { class: 'title' }, '🪑 Décorer l’île'),
    h('div', { class: 'muted' }, 'Touche un emplacement doré pour y poser un objet.'),
    h('div', { class: 'row', style: 'margin-top:10px;justify-content:space-between' }, value, btn('Terminé', 'btn', () => exit())),
  );
  const exit = (): void => {
    el.remove();
    world.setDecorMode(false);
    world.sync(store.state);
    busy = false;
    bar.style.display = '';
  };
  ui.append(el);
  decorExit = exit;
  busy = false;
  decorMode = true;
}
let decorExit: (() => void) | null = null;
let decorMode = false;

function openSlot(id: SlotId): void {
  const slot = SLOTS.find((s) => s.id === id);
  if (!slot) return;
  const current = store.state.decor[id];
  const el = panel(`📍 ${slot.name}`);
  el.style.zIndex = '4';
  const list = h('div', { class: 'list' });
  if (current) list.append(h('div', { class: 'item-row' }, h('span', { class: 'ic' }, item(current).icon), h('div', { class: 'grow' }, item(current).name, h('small', {}, 'Posé ici')), btn('Retirer', 'btn alt', () => {
    store.set(removeDecor(store.state, id));
    el.remove();
  })));
  const decos = store.state.player.inventory.filter((s) => item(s.itemId).kind === 'decor');
  for (const s of decos) {
    const def = item(s.itemId);
    const ok = !def.slots || def.slots.includes(id);
    list.append(h('div', { class: 'item-row' }, h('span', { class: 'ic' }, def.icon), h('div', { class: 'grow' }, def.name, h('small', {}, ok ? `✨ ${def.prestige}` : 'Pas à cet endroit')), ok ? btn('Poser', 'btn', () => {
      const r = placeDecor(store.state, id, s.itemId, Date.now());
      if (!r.ok) {
        toast(r.error);
        return;
      }
      store.set(r.state);
      sfx.good();
      el.remove();
      showChanges(r.changes);
      for (const c of r.changes) setTimeout(() => bubbleAt(world.npcs[c.npc].pos, `${c.delta > 0 ? '😍' : '😒'} ${c.delta > 0 ? '+' : ''}${c.delta}`, 2600), 300);
      toast(`${def.name} installé ! ✨ ${islandValue(store.state)}`);
    }) : ''));
  }
  if (decos.length === 0 && !current) list.append(h('div', { class: 'muted' }, 'Aucune décoration dans ton sac. Gaston en vend (et il négocie).'));
  el.append(list);
  if (!decorMode) void decorExit;
}

function openAbsence(): void {
  if (busy) return;
  const el = panel('🌙 Partir un moment');
  el.append(
    h('div', { class: 'muted', style: 'margin-bottom:10px' }, 'L’île continue de vivre sans toi… et elle parle de toi.'),
    h('div', { class: 'row' }, ...[3, 8, 24].map((hrs) => btn(`${hrs} h`, 'btn', () => {
      el.remove();
      void doAbsence(hrs);
    }))),
  );
}

async function doAbsence(hours: number): Promise<void> {
  busy = true;
  closeDialog();
  busy = true;
  const night = h('div', { class: 'night title' }, `Zzz… ${hours} heures plus tard`);
  ui.append(night);
  const { state, report } = simulateAbsence(store.state, hours, Date.now());
  const gz = api.gazette(report, state.player.name, islandValue(state));
  await sleep(1100);
  store.set(state);
  for (const id of NPC_IDS) {
    const home = NPC_HOME[id];
    const p = tileToWorld(home.i, home.j);
    world.npcs[id].path = [];
    world.npcs[id].pos.set(p.x, world.npcs[id].pos.y, p.z);
  }
  await sleep(1500);
  night.remove();
  showChanges(report.relationChanges);
  const g = await Promise.race([gz, sleep(2500).then(() => null)]);
  const cur = store.state;
  if (cur.pendingRecap) cur.pendingRecap.gazette = g;
  store.set(cur);
  openRecap(false, gz);
}

function openRecap(fromButton: boolean, pendingGazette?: Promise<import('./state/types.ts').Gazette>): void {
  if (fromButton && busy) return;
  const rc = store.state.pendingRecap;
  if (!rc) {
    toast('Pas encore de nouvelles. Pars un moment 🌙');
    return;
  }
  busy = true;
  const tabs = h('div', { class: 'tabs' });
  const body = h('div');
  const ov = h('div', { class: 'overlay', style: 'z-index:6' });
  const card = h('div', { class: 'card' });
  const close = (): void => {
    ov.remove();
    busy = false;
    if (!fromButton) setTimeout(approachWithIntent, 400);
  };
  const recapView = (): HTMLElement => {
    const ch = h('div', { class: 'changes' }, ...rc.relationChanges.map((c) => h('div', { class: 'change' }, h('span', { class: `d ${c.delta < 0 ? 'neg' : 'pos'}` }, `${c.delta > 0 ? '+' : ''}${c.delta}`), h('img', { src: portraits[c.npc], style: 'width:20px;image-rendering:pixelated' }), h('span', {}, `${NPCS[c.npc].name} — ${c.reason}`))));
    return h('div', { class: 'recap' }, h('h2', { class: 'title' }, `Pendant ton absence… (${rc.hours} h)`), h('ul', {}, ...rc.lines.map((l) => h('li', {}, l))), rc.relationChanges.length ? ch : '');
  };
  const gazView = (): HTMLElement => {
    const g = store.state.pendingRecap?.gazette;
    if (!g) return h('div', { class: 'muted' }, 'La Gazette est sous presse…');
    return h('div', { class: 'gazette' },
      h('div', { class: 'mast' }, h('div', { class: 't' }, 'LA GAZETTE DE L’ÎLE'), h('div', { class: 's' }, h('span', {}, `Jour ${store.state.day}`), h('span', {}, 'Radio-coquillage depuis toujours'), h('span', {}, '1 🐚'))),
      h('h3', {}, g.headline),
      h('div', { class: 'cols' }, ...g.articles.flatMap((a) => [h('h4', {}, a.title), h('p', {}, a.body)])),
    );
  };
  let tab: 'gazette' | 'recap' = store.state.pendingRecap?.gazette ? 'gazette' : 'recap';
  const render = (): void => {
    tabs.replaceChildren(
      btn('📰 Gazette', tab === 'gazette' ? 'on' : '', () => { tab = 'gazette'; render(); }),
      btn('📋 Le détail', tab === 'recap' ? 'on' : '', () => { tab = 'recap'; render(); }),
    );
    body.replaceChildren(tab === 'gazette' ? gazView() : recapView());
  };
  render();
  void pendingGazette?.then((g) => {
    const s = store.state;
    if (s.pendingRecap && !s.pendingRecap.gazette) {
      s.pendingRecap.gazette = g;
      store.set(s);
      render();
    }
  });
  card.append(btn('✕', 'close', close), tabs, body, h('div', { class: 'row', style: 'justify-content:center;margin-top:14px' }, btn('Retour sur l’île', 'btn', close)));
  ov.append(card);
  ui.append(ov);
}

/** Un habitant avec une intention vient trouver le joueur. */
function approachWithIntent(): void {
  const order: NpcId[] = [...NPC_IDS].sort((a, b) => {
    const rank = (n: NpcId): number => ({ confront: 0, mock: 1, react: 2, gossip: 3, thank: 4, ask: 5, offer: 6 })[store.state.npcs[n].intent?.kind ?? 'offer'] ?? 9;
    return rank(a) - rank(b) || NPCS[b].gossip - NPCS[a].gossip;
  });
  const npc = order.find((n) => store.state.npcs[n].intent);
  if (!npc || busy) return;
  const intent = store.state.npcs[npc].intent;
  npcBusy[npc] = true;
  const pt = playerTile();
  const near = neighborsOf(pt).filter((t) => canStep(t.i, t.j, t.i, t.j) || true).sort((a, b) => Math.hypot(a.i - npcTile(npc).i, a.j - npcTile(npc).j) - Math.hypot(b.i - npcTile(npc).i, b.j - npcTile(npc).j))[0] ?? pt;
  const actor = world.npcs[npc];
  actor.speed = 3;
  bubbleAt(actor.pos, intent?.kind === 'confront' ? '😠 !' : '!', 1800);
  world.walk(actor, findPath(npcTile(npc), near), () => {
    actor.speed = 1.8;
    if (!busy) openDialog(npc);
    else npcBusy[npc] = false;
  });
}

function openSettings(): void {
  if (busy) return;
  const el = panel('⚙️ Réglages');
  const q = h('select');
  for (const [v, l] of [['high', 'Haute (ombres + bloom)'], ['medium', 'Moyenne'], ['low', 'Basse']] as const) {
    const o = h('option', { value: v }, l);
    if (world.quality === v) o.selected = true;
    q.append(o);
  }
  q.addEventListener('change', () => {
    localStorage.setItem('ragots-quality-set', '1');
    world.setQuality(q.value as 'high' | 'medium' | 'low');
  });
  const toggle = (label: string, key: 'sound' | 'voice'): HTMLElement => {
    const b = btn(`${label} : ${settings[key] ? 'oui' : 'non'}`, 'btn alt', () => {
      settings[key] = !settings[key];
      saveSettings();
      b.innerHTML = `${label} : ${settings[key] ? 'oui' : 'non'}`;
    });
    return b;
  };
  el.append(
    h('div', { class: 'list' },
      h('div', { class: 'item-row' }, h('span', { class: 'grow' }, 'Qualité graphique'), q),
      h('div', { class: 'row' }, toggle('🔊 Son', 'sound'), toggle('🗣️ Voix IA', 'voice')),
      h('div', { class: 'row' }, btn('↺ Nouvelle partie', 'btn alt', () => {
        if (confirm('Effacer la partie ?')) {
          store.reset();
          location.reload();
        }
      })),
      h('div', { class: 'muted' }, `Joueur : ${store.state.player.name} · Jour ${store.state.day} · ${store.state.facts.length} faits, ${store.state.rumors.length} rumeurs`),
    ),
  );
}

function intro(): void {
  if (store.state.lastSavedAt > 0) return;
  busy = true;
  const input = h('input', { type: 'text', placeholder: 'Ton prénom', maxlength: '16' });
  const ov = h('div', { class: 'overlay intro', style: 'z-index:6' });
  const go = (): void => {
    const s = store.state;
    s.player.name = input.value.trim().slice(0, 16) || 'Le nouveau';
    store.set(s);
    store.save();
    ov.remove();
    busy = false;
    setTimeout(() => bubbleAt(world.npcs.josette.pos, `Oh ! Un nouveau voisin ! Bonjour ${s.player.name} !`, 3500), 600);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
  });
  ov.append(h('div', { class: 'card', style: 'text-align:center' },
    h('div', { class: 'title', style: 'font-size:40px;font-weight:900;color:var(--accent)' }, 'RAGOTS'),
    h('div', { class: 'muted' }, 'Une petite île. Trois habitants. Beaucoup trop de langues bien pendues.'),
    input,
    btn('Débarquer sur l’île', 'btn', go),
  ));
  ui.append(ov);
}

// ---------------- Boucle ----------------
function loop(): void {
  world.update();
  requestAnimationFrame(loop);
}
loop();
intro();
if (store.state.pendingRecap === null) void 0;
// Hooks de debug / démo (scripts Playwright)
(window as unknown as { ragots: unknown }).ragots = { store, world, openDialog, closeDialog, doAbsence, send: (t: string) => send(t), groundAt };
void Object.keys(ITEMS);
