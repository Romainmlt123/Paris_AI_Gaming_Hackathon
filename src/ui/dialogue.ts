import { CHARACTERS } from '../../shared/characters';
import { tierOf } from '../../shared/relations';
import type { Emotion, NpcId } from '../../shared/types';
import { button, el, typewrite } from './dom';
import { gaugeFill } from './hud';
import { percentOf } from '../../shared/violence';
import { micSupported, speak, startRecording, stopSpeaking, transcribe, type Recording } from '../voice';

export interface Chip {
  label: string;
  action: () => void;
}

export interface Dialogue {
  root: HTMLElement;
  isOpen(): boolean;
  current(): NpcId | null;
  open(npc: NpcId, relation: number): void;
  focusInput(): void;
  close(): void;
  say(text: string, emotion: Emotion): Promise<void>;
  playerSaid(text: string): void;
  thinking(on: boolean): void;
  setChips(chips: Chip[]): void;
  setRelation(relation: number): void;
}

const MAX_LINE = 200;
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
  const input = el('input', 'dlg-input', '', { type: 'text', maxlength: String(MAX_LINE), placeholder: 'Écris ta réplique…', enterkeyhint: 'send', autocomplete: 'off' });
  const send = el('button', 'dlg-send', '➤', { type: 'submit', 'aria-label': 'Envoyer' });
  const mic = el('button', 'dlg-mic', '🎤', { type: 'button', 'aria-label': 'Parler au micro' });
  mic.hidden = !micSupported();
  form.append(input, mic, send);
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

  let recording: Recording | null = null;
  let micSession = 0;
  const setMic = (mode: 'idle' | 'rec' | 'wait'): void => {
    mic.dataset['mode'] = mode;
    mic.textContent = mode === 'rec' ? '■' : mode === 'wait' ? '…' : '🎤';
    mic.disabled = mode === 'wait';
    input.placeholder = mode === 'rec' ? 'Je t\u2019écoute… (touche ■ pour finir)' : mode === 'wait' ? 'Transcription…' : 'Écris ta réplique…';
  };
  const cancelRecording = (): void => {
    micSession++;
    recording?.cancel();
    recording = null;
    setMic('idle');
  };
  const finishRecording = async (): Promise<void> => {
    const rec = recording;
    if (!rec) return;
    const session = micSession;
    recording = null;
    setMic('wait');
    const heard = await transcribe(await rec.stop());
    if (session !== micSession || npc === null) return;
    setMic('idle');
    const text = heard?.trim().slice(0, MAX_LINE) ?? null;
    if (!text) {
      input.placeholder = text === null ? 'Micro indisponible, écris ta réplique…' : 'Rien entendu… réessaie ?';
      return;
    }
    if (busy) {
      input.value = text;
      return;
    }
    skipTyping();
    onSend(text);
  };
  const beginRecording = (): void => {
    const session = ++micSession;
    setMic('rec');
    startRecording(() => {
      if (session === micSession) void finishRecording();
    })
      .then((rec) => {
        if (session !== micSession || npc === null) return rec.cancel();
        recording = rec;
      })
      .catch((err: unknown) => {
        console.warn('[voice] microphone unavailable', err);
        if (session !== micSession) return;
        setMic('idle');
        input.placeholder = 'Micro refusé, écris ta réplique…';
      });
  };
  mic.addEventListener('click', (e) => {
    e.stopPropagation();
    if (recording) return void finishRecording();
    const mode = mic.dataset['mode'];
    if (mode === 'wait') return;
    if (mode === 'rec') return cancelRecording();
    beginRecording();
  });

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
      cancelRecording();
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
    focusInput() {
      input.focus();
    },
    close() {
      skipTyping();
      stopSpeaking();
      cancelRecording();
      npc = null;
      root.hidden = true;
      input.blur();
    },
    async say(line, emotion) {
      mood.textContent = EMOJI[emotion];
      skipTyping();
      if (npc) void speak(npc, line, emotion);
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
