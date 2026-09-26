import { CHARACTERS } from '../../shared/characters';
import type { RecapEntry } from '../../shared/types';
import { button, el } from './dom';

const ICON: Record<RecapEntry['kind'], string> = { talk: '💬', rumor: '👂', relation: '💔', intent: '❗' };

export function showRecap(host: HTMLElement, entries: RecapEntry[], hours: number): Promise<void> {
  return new Promise((resolve) => {
    const back = el('div', 'modal-back');
    const card = el('div', 'modal recap');
    card.append(el('h2', '', 'Pendant ton absence…'), el('div', 'recap-sub', `${hours} heures plus tard`));
    const list = el('ul', 'recap-list');
    entries.forEach((e, i) => {
      const li = el('li', `recap-${e.kind}`);
      li.style.animationDelay = `${0.25 + i * 0.35}s`;
      const icon = e.kind === 'relation' && /\+\d/.test(e.text) ? '💚' : ICON[e.kind];
      li.append(el('span', 'recap-icon', icon), el('span', '', e.text));
      list.append(li);
    });
    card.append(list, button('primary', 'Retourner sur l\u2019île', () => {
      back.remove();
      resolve();
    }));
    back.append(card);
    host.append(back);
  });
}

export function toast(host: HTMLElement, text: string, tone: 'good' | 'bad' | 'info' = 'info'): void {
  const t = el('div', `toast ${tone}`, text);
  host.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3800);
}

export interface SheetItem {
  label: string;
  detail: string;
  disabled?: boolean;
  icon?: string;
  action: () => void;
}

/** Bottom sheet with a list of choices (shop, bag, decoration wheel). */
export function sheet(host: HTMLElement, title: string, items: SheetItem[], empty: string): () => void {
  const back = el('div', 'sheet-back');
  const panel = el('div', 'sheet');
  const close = (): void => back.remove();
  panel.append(el('div', 'sheet-grip'), el('h3', '', title));
  if (items.length === 0) panel.append(el('p', 'sheet-empty', empty));
  for (const item of items) {
    const b = button('sheet-item', '', () => {
      close();
      item.action();
    });
    b.disabled = item.disabled ?? false;
    if (item.icon) b.append(el('img', 'sheet-icon', '', { src: item.icon, alt: '' }));
    b.append(el('span', 'sheet-label', item.label), el('span', 'sheet-detail', item.detail));
    panel.append(b);
  }
  panel.append(button('ghost', 'Fermer', close));
  back.addEventListener('pointerdown', (e) => {
    if (e.target === back) close();
  });
  back.append(panel);
  host.append(back);
  return close;
}

export function npcName(id: keyof typeof CHARACTERS): string {
  return CHARACTERS[id].name;
}

/** Cartoon sound-effect word popping around the middle of the screen. */
export function bang(host: HTMLElement, word: string): void {
  const b = el('div', 'bang', word);
  b.style.left = `${18 + Math.random() * 54}%`;
  b.style.top = `${34 + Math.random() * 22}%`;
  b.style.setProperty('--rot', `${Math.round(Math.random() * 40 - 20)}deg`);
  host.append(b);
  setTimeout(() => b.remove(), 700);
}

export function flash(host: HTMLElement): void {
  const f = el('div', 'flash');
  host.append(f);
  setTimeout(() => f.remove(), 500);
}

export function showDeath(host: HTMLElement, killer: string, weapon: string, lastWords: string): Promise<void> {
  return new Promise((resolve) => {
    const back = el('div', 'modal-back death-back');
    const card = el('div', 'modal death');
    card.append(
      el('div', 'death-skull', '💀'),
      el('h2', '', 'Tu es mort.'),
      el('p', 'death-how', `${killer} t\u2019a assassiné avec ${weapon}.`),
      el('p', 'death-quote', `« ${lastWords} »`),
      el('p', 'recap-sub', 'Toute l\u2019île sera au courant avant midi.'),
      button('primary', 'Se réveiller le lendemain…', () => {
        back.remove();
        resolve();
      }),
    );
    back.append(card);
    host.append(back);
  });
}
