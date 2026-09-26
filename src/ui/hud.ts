import { CHARACTERS } from '../../shared/characters';
import { pocketCount } from '../../shared/forage';
import { RELATION_MAX, RELATION_MIN, tierOf } from '../../shared/relations';
import type { GameState, NpcId } from '../../shared/types';
import { NPC_IDS } from '../../shared/types';
import { button, el } from './dom';

export interface Hud {
  root: HTMLElement;
  render(state: GameState): void;
  pulse(npc: NpcId, delta: number): void;
  setAiStatus(text: string): void;
  setFps(fps: number): void;
  /** Shows a passing time while the day/night cycle plays. */
  showTime(day: number, minutes: number): void;
  setSleeping(on: boolean): void;
}

function clockText(day: number, clock: number): string {
  const h = Math.floor(clock / 60);
  const m = clock % 60;
  const icon = h >= 21 || h < 6 ? '🌙' : h >= 18 ? '🌇' : h < 8 ? '🌅' : '☀️';
  return `${icon} Jour ${day} · ${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
}

export function gaugeFill(relation: number): string {
  return `${((relation - RELATION_MIN) / (RELATION_MAX - RELATION_MIN)) * 100}%`;
}

export function createHud(portraits: Record<NpcId, string>, onNpc: (id: NpcId) => void, onSleep: () => void, onBag: () => void): Hud {
  const root = el('div', 'hud');
  const top = el('div', 'hud-top');
  const clock = el('div', 'chip clock');
  const prestige = el('div', 'chip prestige');
  const coins = el('div', 'chip coins');
  top.append(clock, prestige, coins);
  const gauges = el('div', 'gauges');
  const cards = new Map<NpcId, { card: HTMLElement; fill: HTMLElement; tier: HTMLElement; value: HTMLElement }>();
  for (const id of NPC_IDS) {
    const card = button('gauge', '', () => onNpc(id));
    const img = el('img', 'portrait', '', { src: portraits[id], alt: CHARACTERS[id].name });
    const info = el('div', 'gauge-info');
    const name = el('div', 'gauge-name', CHARACTERS[id].name);
    const value = el('span', 'gauge-value');
    name.append(value);
    const bar = el('div', 'bar');
    const fill = el('div', 'bar-fill');
    bar.append(fill);
    const tier = el('div', 'gauge-tier');
    info.append(name, bar, tier);
    card.append(img, info);
    gauges.append(card);
    cards.set(id, { card, fill, tier, value });
  }
  const bottom = el('div', 'hud-bottom');
  const bag = button('action bag', '🎒 Sac', onBag);
  const sleep = button('action sleep', '🌙 Revenir dans 8 h', onSleep);
  bottom.append(bag, sleep);
  const status = el('div', 'ai-status');
  const fps = el('div', 'fps');
  root.append(top, gauges, bottom, status, fps);
  if (!import.meta.env.DEV) fps.hidden = true;

  return {
    root,
    render(state) {
      clock.textContent = clockText(state.day, state.clock);
      prestige.textContent = `★ ${state.islandValue}`;
      prestige.title = 'Valeur de l\u2019île';
      coins.textContent = `${state.coins} 🪙`;
      const items = state.inventory.length + pocketCount(state);
      bag.textContent = `🎒 Sac${items ? ` (${items})` : ''}`;
      for (const id of NPC_IDS) {
        const c = cards.get(id);
        if (!c) continue;
        const r = state.npcs[id].relation;
        c.fill.style.width = gaugeFill(r);
        c.fill.dataset['tone'] = r < -15 ? 'bad' : r < 15 ? 'mid' : 'good';
        c.tier.textContent = tierOf(r).label;
        c.value.textContent = ` ${r > 0 ? '+' : ''}${r}`;
        c.card.classList.toggle('wants', state.npcs[id].intent !== null);
      }
    },
    pulse(npc, delta) {
      const c = cards.get(npc);
      if (!c) return;
      c.card.classList.remove('hit', 'gain');
      void c.card.offsetWidth;
      c.card.classList.add(delta < 0 ? 'hit' : 'gain');
    },
    setAiStatus(text) {
      status.textContent = text;
    },
    showTime(day, minutes) {
      clock.textContent = clockText(day, Math.floor(minutes) % (24 * 60));
    },
    setSleeping(on) {
      sleep.disabled = on;
      sleep.textContent = on ? '⏳ Le temps passe…' : '🌙 Revenir dans 8 h';
    },
    setFps(value) {
      fps.textContent = `${Math.round(value)} fps`;
    },
  };
}
