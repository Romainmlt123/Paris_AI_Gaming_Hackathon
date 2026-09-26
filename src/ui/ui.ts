import { h, wait } from './dom';
import { drawPortrait } from './portrait';
import { NPCS } from '../data/npcs';
import { getItem } from '../data/items';
import { tierOf, perkText } from '../logic/relations';
import { NPC_IDS } from '../state/types';
import type { DealProposal, Emotion, GameState, InvSlot, NpcId, Recap, RelationChange } from '../state/types';

export interface DialogueHandlers {
  send(text: string): void;
  offer(): void;
  close(): void;
  acceptDeal(): void;
  refuseDeal(): void;
  catalog(): void;
}

// ---------- Toasts ----------
export function toast(root: HTMLElement, text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
  const t = h('div.toast', { class: `toast ${kind}` }, text);
  root.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 2600);
}

// ---------- HUD ----------
export class Hud {
  readonly el: HTMLElement;
  private readonly bellsEl: HTMLElement;
  private readonly valueEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly chips = {} as Record<NpcId, { root: HTMLElement; fill: HTMLElement; canvas: HTMLCanvasElement }>;
  private shownBells = -1;
  private bellsAnim = 0;

  constructor(
    root: HTMLElement,
    actions: { bag(): void; decor(): void; sleep(): void; chip(id: NpcId): void },
  ) {
    this.bellsEl = h('span.num');
    this.valueEl = h('span.num');
    this.timeEl = h('div.pill.time');
    const chipRow = h('div.chips');
    for (const id of NPC_IDS) {
      const canvas = h('canvas.face');
      const fill = h('div.fill');
      const chip = h('button.chip', { onclick: () => actions.chip(id), 'aria-label': NPCS[id].name }, canvas, h('div.gauge', {}, fill));
      chip.style.setProperty('--npc', NPCS[id].color);
      drawPortrait(canvas, id, 'neutre');
      this.chips[id] = { root: chip, fill, canvas };
      chipRow.append(chip);
    }
    const top = h(
      'div.hud-top',
      {},
      h('div.hud-left', {}, this.timeEl, h('div.pill.value', { title: "Valeur de l'île" }, h('span.star', {}, '★'), this.valueEl), chipRow),
      h('div.pill.bells', {}, h('span.bell', {}, '🔔'), this.bellsEl),
    );
    const bottom = h(
      'div.hud-bottom',
      {},
      h('button.round', { onclick: actions.bag, 'aria-label': 'Sacoche' }, h('span', {}, '🎒'), h('small', {}, 'Sac')),
      h('button.round', { onclick: actions.decor, 'aria-label': 'Décorer' }, h('span', {}, '🔨'), h('small', {}, 'Déco')),
      h('button.round', { onclick: actions.sleep, 'aria-label': 'Dormir' }, h('span', {}, '🌙'), h('small', {}, 'Dormir')),
    );
    this.el = h('div.hud', {}, top, bottom);
    root.append(this.el);
  }

  render(s: GameState, value: number): void {
    this.timeEl.textContent = `Jour ${s.day} · ${Math.floor(s.hour)}h`;
    this.valueEl.textContent = value.toLocaleString('fr-FR');
    this.animateBells(s.player.bells);
    for (const id of NPC_IDS) {
      const n = s.npcs[id];
      const c = this.chips[id];
      c.fill.style.width = `${(n.relation + 100) / 2}%`;
      c.fill.classList.toggle('neg', n.relation < -19);
      c.root.classList.toggle('bang', n.intent !== null);
      drawPortrait(c.canvas, id, n.mood);
    }
  }

  private animateBells(target: number): void {
    if (this.shownBells < 0) {
      this.shownBells = target;
      this.bellsEl.textContent = target.toLocaleString('fr-FR');
      return;
    }
    if (target === this.shownBells) return;
    cancelAnimationFrame(this.bellsAnim);
    const from = this.shownBells;
    const t0 = performance.now();
    this.bellsEl.parentElement?.classList.add(target > from ? 'up' : 'down');
    const tick = (): void => {
      const k = Math.min(1, (performance.now() - t0) / 700);
      const v = Math.round(from + (target - from) * (1 - (1 - k) ** 3));
      this.bellsEl.textContent = v.toLocaleString('fr-FR');
      if (k < 1) this.bellsAnim = requestAnimationFrame(tick);
      else {
        this.shownBells = target;
        this.bellsEl.parentElement?.classList.remove('up', 'down');
      }
    };
    tick();
  }

  setVisible(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
  }

  bumpChip(id: NpcId, delta: number): void {
    const c = this.chips[id].root;
    c.classList.remove('hit-good', 'hit-bad');
    void c.offsetWidth;
    c.classList.add(delta >= 0 ? 'hit-good' : 'hit-bad');
  }
}

// ---------- Dialogue ----------
export class Dialogue {
  readonly el: HTMLElement;
  private readonly portrait: HTMLCanvasElement;
  private readonly nameEl: HTMLElement;
  private readonly tierEl: HTMLElement;
  private readonly gaugeFill: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly deltaEl: HTMLElement;
  private readonly dealEl: HTMLElement;
  private readonly chipsEl: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly sendBtn: HTMLButtonElement;
  private readonly catalogBtn: HTMLButtonElement;
  private typing = 0;
  private fullText = '';
  npc: NpcId | null = null;

  constructor(root: HTMLElement, private readonly handlers: DialogueHandlers) {
    this.portrait = h('canvas.portrait');
    this.nameEl = h('div.name');
    this.tierEl = h('div.tier');
    this.gaugeFill = h('div.fill');
    this.textEl = h('div.text', { onclick: () => this.skip() });
    this.deltaEl = h('div.delta');
    this.dealEl = h('div.deal');
    this.chipsEl = h('div.suggestions');
    this.input = h('input.say', { type: 'text', maxlength: 200, placeholder: 'Écris ta réplique…', enterkeyhint: 'send', autocomplete: 'off' });
    this.sendBtn = h('button.send', { 'aria-label': 'Envoyer' }, '➤');
    this.catalogBtn = h('button.tool', { onclick: () => handlers.catalog(), 'aria-label': 'Catalogue' }, '📜');
    const form = h(
      'form.say-row',
      {
        onsubmit: (e: Event) => {
          e.preventDefault();
          this.submit();
        },
      },
      h('button.tool', { type: 'button', onclick: () => handlers.offer(), 'aria-label': 'Offrir ou montrer un objet' }, '🎁'),
      this.catalogBtn,
      this.input,
      this.sendBtn,
    );
    this.el = h(
      'div.dialogue.hidden',
      {},
      this.dealEl,
      h(
        'div.box',
        {},
        h('button.close', { onclick: () => handlers.close(), 'aria-label': 'Terminer la conversation' }, '✕'),
        h('div.head', {}, this.portrait, h('div.who', {}, this.nameEl, this.tierEl, h('div.gauge.big', {}, this.gaugeFill))),
        this.textEl,
        this.deltaEl,
      ),
      this.chipsEl,
      form,
    );
    root.append(this.el);
  }

  open(npc: NpcId, s: GameState): void {
    this.npc = npc;
    this.el.classList.remove('hidden');
    this.el.style.setProperty('--npc', NPCS[npc].color);
    this.nameEl.textContent = `${NPCS[npc].name} · ${NPCS[npc].job}`;
    this.catalogBtn.style.display = npc === 'gaston' ? '' : 'none';
    this.deltaEl.className = 'delta';
    this.deltaEl.textContent = '';
    this.showDeal(null);
    this.update(s);
  }

  close(): void {
    this.npc = null;
    this.el.classList.add('hidden');
    this.input.blur();
    cancelAnimationFrame(this.typing);
  }

  update(s: GameState): void {
    if (!this.npc) return;
    const n = s.npcs[this.npc];
    const tier = tierOf(n.relation);
    this.tierEl.textContent = `${tier.name} · ${perkText(this.npc, n.relation)}`;
    this.gaugeFill.style.width = `${(n.relation + 100) / 2}%`;
    this.gaugeFill.classList.toggle('neg', n.relation < -19);
    drawPortrait(this.portrait, this.npc, n.mood);
  }

  setEmotion(emotion: Emotion): void {
    if (this.npc) drawPortrait(this.portrait, this.npc, emotion);
  }

  /** Texte qui s'écrit lettre à lettre, façon boîte de dialogue rétro. */
  say(text: string): Promise<void> {
    cancelAnimationFrame(this.typing);
    this.fullText = text;
    this.textEl.classList.remove('thinking');
    this.textEl.textContent = '';
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = (): void => {
        const n = Math.min(text.length, Math.floor((performance.now() - t0) / 22));
        this.textEl.textContent = text.slice(0, n);
        if (n < text.length && this.fullText === text) this.typing = requestAnimationFrame(step);
        else resolve();
      };
      step();
    });
  }

  thinking(): void {
    cancelAnimationFrame(this.typing);
    this.textEl.textContent = '';
    this.textEl.classList.add('thinking');
    this.setSuggestions([]);
    this.setBusy(true);
  }

  setBusy(busy: boolean): void {
    this.sendBtn.disabled = busy;
    this.el.classList.toggle('busy', busy);
  }

  private skip(): void {
    cancelAnimationFrame(this.typing);
    this.textEl.textContent = this.fullText;
  }

  setSuggestions(list: string[]): void {
    this.chipsEl.replaceChildren(
      ...list.map((s) =>
        h('button.chip-say', {
          onclick: () => {
            this.input.value = s;
            this.submit();
          },
        }, s),
      ),
    );
  }

  showDelta(change: RelationChange | null): void {
    if (!change || change.delta === 0) {
      this.deltaEl.className = 'delta';
      return;
    }
    const sign = change.delta > 0 ? '+' : '−';
    this.deltaEl.textContent = `${change.delta > 0 ? '💗' : '💔'} ${sign}${Math.abs(change.delta)} · ${change.reason}`;
    this.deltaEl.className = `delta show ${change.delta > 0 ? 'good' : 'bad'}`;
    this.el.querySelector('.box')?.classList.remove('shake');
    if (change.delta <= -8) {
      void (this.el.querySelector('.box') as HTMLElement | null)?.offsetWidth;
      this.el.querySelector('.box')?.classList.add('shake');
    }
  }

  showDeal(deal: DealProposal | null): void {
    if (!deal) {
      this.dealEl.replaceChildren();
      this.dealEl.classList.remove('show');
      return;
    }
    const item = getItem(deal.itemId);
    const verb = deal.direction === 'buy' ? 'te vend' : 'te rachète';
    this.dealEl.replaceChildren(
      h('div.deal-text', {}, `${item.icon} Gaston ${verb} `, h('b', {}, `${item.name}${deal.qty > 1 ? ` ×${deal.qty}` : ''}`), ` pour `, h('b', {}, `${deal.price.toLocaleString('fr-FR')} 🔔`)),
      h('div.deal-actions', {}, h('button.ok', { onclick: () => this.handlers.acceptDeal() }, 'Tope là !'), h('button.no', { onclick: () => this.handlers.refuseDeal() }, 'Non merci')),
    );
    this.dealEl.classList.add('show');
  }

  prefill(text: string): void {
    this.input.value = text;
    this.input.focus();
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (!text || this.sendBtn.disabled) return;
    this.input.value = '';
    this.handlers.send(text);
  }
}

// ---------- Sacoche (bottom sheet) ----------
export class Bag {
  readonly el: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly title: HTMLElement;
  private onPick: ((slot: InvSlot) => void) | null = null;

  constructor(root: HTMLElement) {
    this.grid = h('div.grid');
    this.title = h('div.sheet-title');
    this.el = h('div.sheet.hidden', {}, h('div.grab'), h('div.sheet-head', {}, this.title, h('button.close', { onclick: () => this.close() }, '✕')), this.grid);
    let startY = 0;
    this.el.addEventListener('touchstart', (e) => (startY = e.touches[0]?.clientY ?? 0), { passive: true });
    this.el.addEventListener('touchend', (e) => {
      if ((e.changedTouches[0]?.clientY ?? 0) - startY > 60) this.close();
    });
    root.append(this.el);
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(s: GameState, title: string, filter: (slot: InvSlot) => boolean, onPick: ((slot: InvSlot) => void) | null): void {
    this.title.textContent = title;
    this.onPick = onPick;
    const cells: HTMLElement[] = [];
    for (let i = 0; i < 16; i++) {
      const slot = s.player.inventory[i];
      if (!slot) {
        cells.push(h('div.cell.empty'));
        continue;
      }
      const item = getItem(slot.itemId);
      const usable = filter(slot);
      cells.push(
        h(
          'button.cell',
          { class: `cell${usable ? '' : ' dim'}`, onclick: () => usable && this.onPick?.(slot), title: item.name },
          h('span.icon', {}, item.icon),
          slot.qty > 1 ? h('span.qty', {}, String(slot.qty)) : null,
          h('span.label', {}, item.name),
        ),
      );
    }
    this.grid.replaceChildren(...cells);
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.el.classList.add('hidden');
    this.onPick = null;
  }
}

// ---------- Choix d'un objet (déco, catalogue) ----------
export function picker(
  root: HTMLElement,
  title: string,
  options: { icon: string; label: string; sub?: string; onPick(): void }[],
): () => void {
  const close = (): void => el.remove();
  const el = h(
    'div.picker',
    { onclick: (e: Event) => e.target === el && close() },
    h(
      'div.picker-box',
      {},
      h('div.sheet-head', {}, h('div.sheet-title', {}, title), h('button.close', { onclick: close }, '✕')),
      h(
        'div.picker-list',
        {},
        ...options.map((o) =>
          h('button.pick', { onclick: () => { close(); o.onPick(); } }, h('span.icon', {}, o.icon), h('span.pl', {}, h('b', {}, o.label), o.sub ? h('small', {}, o.sub) : null)),
        ),
        options.length === 0 ? h('div.empty-note', {}, 'Rien à proposer pour l’instant.') : null,
      ),
    ),
  );
  root.append(el);
  return close;
}

// ---------- Nuit + récap « Pendant ton absence… » ----------
export async function nightFade(root: HTMLElement, hours: number): Promise<HTMLElement> {
  const el = h('div.night', {}, h('div.zzz', {}, 'Zzz…'), h('div.later', {}, `${hours} heures plus tard…`));
  root.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  await wait(900);
  return el;
}

export function showRecap(root: HTMLElement, night: HTMLElement | null, recap: Recap, onDone: () => void): void {
  const list = h('div.recap-lines');
  const changes = h('div.recap-changes');
  const btn = h('button.wake', { onclick: () => { el.classList.remove('show'); setTimeout(() => el.remove(), 500); onDone(); } }, 'Retourner sur l’île ☀️');
  btn.style.opacity = '0';
  const el = h('div.recap', {}, h('div.recap-box', {}, h('div.recap-title', {}, 'Pendant ton absence…'), list, changes, btn));
  root.append(el);
  night?.remove();
  requestAnimationFrame(() => el.classList.add('show'));
  void (async () => {
    // L'IA recopie parfois le titre en tête de récap.
    const lines = recap.lines.map((l) => l.replace(/^pendant ton absence\s*(…|\.\.\.|,)?\s*/i, '')).filter((l) => l.length > 0);
    for (const line of lines) {
      await wait(650);
      list.append(h('p.line', {}, line.charAt(0).toUpperCase() + line.slice(1)));
    }
    for (const c of recap.relationChanges) {
      await wait(450);
      const n = NPCS[c.npc];
      changes.append(
        h('div.rc', { class: `rc ${c.delta >= 0 ? 'good' : 'bad'}` }, h('b', {}, n.name), h('span', {}, `${c.delta > 0 ? '+' : '−'}${Math.abs(c.delta)}`), h('small', {}, c.reason)),
      );
    }
    await wait(400);
    btn.style.opacity = '1';
  })();
}

// ---------- Info d'un habitant (tap sur sa puce) ----------
export function npcInfo(root: HTMLElement, s: GameState, id: NpcId): void {
  const n = s.npcs[id];
  const last = [...s.relationLog].reverse().find((c) => c.npc === id);
  const tier = tierOf(n.relation);
  picker(root, `${NPCS[id].name} · ${tier.name} (${n.relation > 0 ? '+' : ''}${n.relation})`, [
    { icon: '🎁', label: perkText(id, n.relation), sub: 'Ce que ce palier débloque', onPick: () => undefined },
    ...(last ? [{ icon: last.delta >= 0 ? '💗' : '💔', label: `${last.delta > 0 ? '+' : ''}${last.delta} · ${last.reason}`, sub: 'Dernière variation', onPick: () => undefined }] : []),
    ...(n.intent ? [{ icon: '❗', label: n.intent.text, sub: 'Veut te parler', onPick: () => undefined }] : []),
  ]);
}
