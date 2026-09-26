import { CHARACTERS } from '../../shared/characters';
import { tierOf } from '../../shared/relations';
import type { Emotion, NpcId } from '../../shared/types';
import { button, el, typewrite } from './dom';
import { gaugeFill } from './hud';
import { percentOf } from '../../shared/violence';

export interface Chip {
  label: string;
  action: () => void;
}

export interface Dialogue {
  root: HTMLElement;
  isOpen(): boolean;
  current(): NpcId | null;
  open(npc: NpcId, relation: number): void;
  close(): void;
  say(text: string, emotion: Emotion): Promise<void>;
  playerSaid(text: string): void;
  thinking(on: boolean): void;
  setChips(chips: Chip[]): void;
  setRelation(relation: number): void;
}

const EMOJI: Record<Emotion, string> = {
  joie: '😊',
  neutre: '😐',
  colere: '😠',
  tristesse: '😢',
  surprise: '😲',
  mefiance: '🤨',
  amuse: '😏',
};

export function createDialogue(portraits: Record<NpcId, string>, onSend: (text: string) => void, onClose: () => void): Dialogue {
  const root = el('div', 'dialogue');
  root.hidden = true;
  const head = el('div', 'dlg-head');
  const portrait = el('img', 'portrait big');
  const who = el('div', 'dlg-who');
  const name = el('div', 'dlg-name');
  const mood = el('span', 'dlg-mood');
  name.append(mood);
  const bar = el('div', 'bar');
  const fill = el('div', 'bar-fill');
  bar.append(fill);
  const tier = el('div', 'gauge-tier');
  who.append(name, bar, tier);
  const close = button('dlg-close', '✕', onClose);
  head.append(portrait, who, close);
  const box = el('div', 'dlg-box');
  const you = el('div', 'dlg-you');
  const text = el('div', 'dlg-text');
  box.append(you, text);
  const chips = el('div', 'chips');
  const form = el('form', 'dlg-form');
  const input = el('input', 'dlg-input', '', { type: 'text', maxlength: '200', placeholder: 'Écris ta réplique…', enterkeyhint: 'send', autocomplete: 'off' });
  const send = el('button', 'dlg-send', '➤', { type: 'submit', 'aria-label': 'Envoyer' });
  form.append(input, send);
  root.append(head, box, chips, form);
  let npc: NpcId | null = null;
  let busy = false;
  let skipTyping = (): void => undefined;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value || busy) return;
    skipTyping();
    input.value = '';
    onSend(value);
  });
  root.addEventListener('pointerdown', (e) => e.stopPropagation());

  const setRelation = (relation: number): void => {
    fill.style.width = gaugeFill(relation);
    fill.dataset['tone'] = relation < -15 ? 'bad' : relation < 15 ? 'mid' : 'good';
    tier.textContent = `${tierOf(relation).label} · ${percentOf(relation)}%`;
  };

  return {
    root,
    isOpen: () => npc !== null,
    current: () => npc,
    open(id, relation) {
      npc = id;
      root.hidden = false;
      root.dataset['npc'] = id;
      portrait.src = portraits[id];
      name.firstChild?.remove();
      name.prepend(document.createTextNode(`${CHARACTERS[id].name} `));
      mood.textContent = '';
      you.textContent = '';
      text.textContent = '';
      setRelation(relation);
    },
    close() {
      skipTyping();
      npc = null;
      root.hidden = true;
      input.blur();
    },
    async say(line, emotion) {
      mood.textContent = EMOJI[emotion];
      skipTyping();
      const typing = typewrite(text, line);
      skipTyping = typing.skip;
      await typing.done;
    },
    playerSaid(line) {
      you.textContent = `Toi : ${line}`;
    },
    thinking(on) {
      busy = on;
      root.classList.toggle('thinking', on);
      if (on) text.textContent = '…';
    },
    setChips(list) {
      chips.replaceChildren(...list.map((c) => button('chip-btn', c.label, c.action)));
    },
    setRelation,
  };
}
