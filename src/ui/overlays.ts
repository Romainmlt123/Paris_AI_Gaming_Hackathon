import { CHARACTERS } from '../../shared/characters';
import type { Gazette } from '../../shared/gazette';
import { button, el } from './dom';
import { sfx } from '../sound';

export function showGazette(host: HTMLElement, gazette: Gazette): Promise<void> {
  return new Promise((resolve) => {
    const back = el('div', 'modal-back gazette-back');
    const paper = el('article', 'gazette');
    const ears = el('div', 'gz-ears');
    ears.append(el('div', 'gz-ear', '« Tous les ragots qu\u2019on ose imprimer »'), el('div', 'gz-ear', gazette.weather));
    const columns = el('div', 'gz-columns');
    for (const a of gazette.articles) {
      const col = el('section', 'gz-article');
      col.append(el('div', 'gz-rubric', a.rubric), el('h3', 'gz-title', a.title), el('p', 'gz-body', a.body));
      columns.append(col);
    }
    paper.append(
      ears,
      el('h1', 'gz-masthead', 'La Gazette des Ragots'),
      el('div', 'gz-issue', gazette.issue),
      el('h2', 'gz-headline', gazette.headline),
      el('p', 'gz-subhead', gazette.subhead),
      columns,
      button('primary gz-close', 'Retourner sur l\u2019île', () => {
        back.remove();
        resolve();
      }),
    );
    back.append(paper);
    host.append(back);
  });
}

export function toast(host: HTMLElement, text: string, tone: 'good' | 'bad' | 'info' = 'info'): void {
  sfx(tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : 'pop');
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

/** Big reveal card for a fresh catch; closes on tap or after a moment. */
export function showCatch(host: HTMLElement, icon: string, name: string, rarity: string, detail: string): Promise<void> {
  return new Promise((resolve) => {
    const back = el('div', 'catch-back');
    const card = el('div', `catch rarity-${rarity.replace(/\s|é/g, (c) => (c === 'é' ? 'e' : '-'))}`);
    card.append(el('div', 'catch-rays'), el('img', 'catch-icon', '', { src: icon, alt: '' }), el('div', 'catch-title', `Tu as pêché : ${name} !`), el('div', 'catch-rarity', rarity), el('div', 'catch-detail', detail));
    back.append(card);
    host.append(back);
    const close = (): void => {
      back.remove();
      resolve();
    };
    back.addEventListener('pointerdown', close);
    setTimeout(close, 2600);
  });
}
