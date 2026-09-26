import { cleanIsland, cleanName, ISLAND_IDEAS, ISLAND_MAX, LOOK_OPTIONS, NAME_IDEAS, NAME_MAX, randomLook } from '../../shared/player';
import type { HairStyle, PlayerLook } from '../../shared/types';
import { drawSheet, FRAME_H, FRAME_W, lookSpec, SPRITES, tone, type SpriteSpec } from '../render/sprites';
import { button, el } from './dom';
import { tropicalBackdrop } from './tropical';

export interface Profile {
  name: string;
  island: string;
  look: PlayerLook;
}

export type OnboardingResult = { kind: 'continue' } | { kind: 'new'; profile: Profile };

export interface OnboardingOptions {
  /** A save with a profile exists: offer « Continuer ». */
  canContinue: boolean;
  continueLabel: string;
  preset: Partial<Profile>;
}

const HAIR_LABEL: Record<HairStyle, string> = { short: 'Short', bun: 'Bun', cap: 'Cap', beanie: 'Beanie' };
const PREVIEW_SCALE = 7;
const SQUAD: readonly [SpriteSpec, string][] = [
  [SPRITES.gaston, 'Gaston'],
  [SPRITES.josette, 'Josette'],
  [SPRITES.marius, 'Marius'],
];

function spriteCanvas(spec: SpriteSpec, facing: 0 | 1, scale: number): HTMLCanvasElement {
  const c = el('canvas', 'onb-sprite', '', { width: String(FRAME_W * scale), height: String(FRAME_H * scale) });
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(drawSheet(spec), 0, facing * FRAME_H, FRAME_W, FRAME_H, 0, 0, c.width, c.height);
  }
  return c;
}

/** Pixel mosaic over the crotch of the front-facing naked preview. */
function censor(ctx: CanvasRenderingContext2D, skin: string, tick: number): void {
  const s = PREVIEW_SCALE;
  const shades = [tone(skin, -0.28), tone(skin, -0.12), tone(skin, 0.08), tone(skin, -0.2)];
  for (let by = 0; by < 3; by++) {
    for (let bx = 0; bx < 4; bx++) {
      ctx.fillStyle = shades[(bx * 7 + by * 3 + tick) % shades.length] ?? skin;
      ctx.fillRect((12 + bx * 2) * s, (32 + by * 2) * s, 2 * s, 2 * s);
    }
  }
}

function swatchRow<T extends string>(label: string, options: readonly T[], current: () => T, pick: (v: T) => void, text?: (v: T) => string): { row: HTMLElement; sync(): void } {
  const row = el('div', 'onb-row');
  row.append(el('span', 'onb-row-label', label));
  const list = el('div', 'onb-swatches');
  const buttons = options.map((opt) => {
    const b = button(text ? 'onb-pill' : 'onb-swatch', text ? text(opt) : '', () => {
      pick(opt);
      sync();
    });
    if (!text) b.style.background = opt;
    b.setAttribute('aria-label', text ? text(opt) : `${label} ${opt}`);
    list.append(b);
    return { b, opt };
  });
  const sync = (): void => {
    for (const { b, opt } of buttons) b.classList.toggle('on', opt === current());
  };
  row.append(list);
  sync();
  return { row, sync };
}

function textField(id: string, placeholder: string, max: number, value: string): HTMLInputElement {
  const input = el('input', 'onb-input', '', { id, maxlength: String(max), autocomplete: 'off', enterkeyhint: 'next', placeholder });
  input.value = value;
  return input;
}

function ideaChips(ideas: readonly string[], onPick: (idea: string) => void): HTMLElement {
  const box = el('div', 'onb-ideas');
  for (const idea of ideas) {
    const chip = el('button', 'chip-btn', idea, { type: 'button' });
    chip.addEventListener('click', () => onPick(idea));
    box.append(chip);
  }
  return box;
}

/** Title screen → character creator → island name, on an opaque full-screen lobby. */
export function runOnboarding(host: HTMLElement, opts: OnboardingOptions): Promise<OnboardingResult> {
  return new Promise((resolve) => {
    const back = el('div', 'onb-back');
    const backdrop = tropicalBackdrop();
    host.append(back);
    let look: PlayerLook = opts.preset.look ?? randomLook();
    let name = opts.preset.name ?? '';
    let island = opts.preset.island ?? '';

    const finish = (result: OnboardingResult): void => {
      back.classList.add('leaving');
      setTimeout(() => back.remove(), 400);
      resolve(result);
    };
    const show = (card: HTMLElement, focus?: HTMLElement): void => {
      back.replaceChildren(backdrop, card);
      focus?.focus();
    };

    function title(): void {
      const card = el('div', 'onb-title');
      const squad = el('div', 'onb-squad');
      for (const [spec, label] of SQUAD) {
        const who = el('div', 'onb-squad-one');
        who.append(spriteCanvas(spec, 0, 6), el('span', 'onb-squad-name', label));
        squad.append(who);
      }
      const play = button('onb-play', 'JOUER', () => creator());
      const actions = el('div', 'onb-title-actions');
      actions.append(play);
      if (opts.canContinue) actions.append(button('onb-ghost', opts.continueLabel, () => finish({ kind: 'continue' })));
      card.append(
        el('div', 'onb-season', '~ ALOHA ~'),
        el('h1', 'onb-logo', 'RAGOTS'),
        el('p', 'onb-tag', 'Every word counts. Every rumor spreads.'),
        squad,
        actions,
        el('p', 'onb-foot', 'Paris AI Gaming Hackathon'),
      );
      show(card);
      play.focus();
    }

    function creator(): void {
      const card = el('form', 'onb-creator');
      const stage = el('div', 'onb-podium');
      const preview = el('canvas', 'onb-preview', '', { width: String(FRAME_W * PREVIEW_SCALE), height: String(FRAME_H * PREVIEW_SCALE) });
      let facing: 0 | 1 = 0;
      let tick = 0;
      const draw = (): void => {
        const ctx = preview.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, preview.width, preview.height);
        ctx.drawImage(drawSheet(lookSpec(look, true)), 0, facing * FRAME_H, FRAME_W, FRAME_H, 0, 0, preview.width, preview.height);
        if (facing === 0) censor(ctx, look.skin, tick);
      };
      const timer = setInterval(() => {
        if (!preview.isConnected) {
          clearInterval(timer);
          return;
        }
        tick += 1;
        draw();
      }, 320);
      const turn = button('onb-turn', '', () => {
        facing = facing === 0 ? 1 : 0;
        draw();
      });
      turn.setAttribute('aria-label', 'Rotate character');
      turn.append(preview, el('span', 'onb-turn-hint', '↻ Tourner'));
      stage.append(el('div', 'onb-step', 'STEP 1 / 2'), turn);

      const nameInput = textField('onb-name', 'Your name', NAME_MAX, name);
      let refresh: () => void = () => undefined;
      const set = (patch: Partial<PlayerLook>): void => {
        look = { ...look, ...patch };
        refresh();
      };
      const rows = [
        swatchRow('Skin', LOOK_OPTIONS.skin, () => look.skin, (v) => set({ skin: v })),
        swatchRow('Hairstyle', LOOK_OPTIONS.hairStyle, () => look.hairStyle, (v) => set({ hairStyle: v }), (v) => HAIR_LABEL[v]),
        swatchRow('Hair', LOOK_OPTIONS.hair, () => look.hair, (v) => set({ hair: v })),
      ];
      const next = el('button', 'onb-go', 'Next ›', { type: 'submit' });
      const sync = (): void => {
        name = nameInput.value;
        next.disabled = cleanName(name) === '';
        draw();
        for (const r of rows) r.sync();
      };
      refresh = sync;
      nameInput.addEventListener('input', sync);
      const dice = button('onb-dice', '🎲 Random', () => {
        look = randomLook();
        if (!cleanName(nameInput.value)) nameInput.value = NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)] ?? '';
        sync();
      });
      card.addEventListener('submit', (e) => {
        e.preventDefault();
        if (cleanName(nameInput.value)) islandStep();
      });
      const panel = el('div', 'onb-panel');
      const fields = el('div', 'onb-fields');
      fields.append(
        el('label', 'onb-label', 'Your name', { for: 'onb-name' }),
        nameInput,
        ideaChips(NAME_IDEAS, (idea) => {
          nameInput.value = idea;
          sync();
        }),
      );
      const actions = el('div', 'onb-actions');
      actions.append(dice, next);
      panel.append(el('h2', 'onb-h', 'WHO’S WASHING UP?'), fields, ...rows.map((r) => r.row), el('p', 'onb-hint', 'You arrive stark naked. And you’ll stay that way.'), actions);
      card.append(stage, panel);
      show(card, name ? undefined : nameInput);
      sync();
    }

    function islandStep(): void {
      const card = el('form', 'onb-panel onb-island');
      card.append(el('div', 'onb-step', 'STEP 2 / 2'), el('h2', 'onb-h', 'YOUR ISLAND IS CALLED…'));
      const input = textField('onb-island', 'Island name', ISLAND_MAX, island);
      const go = el('button', 'onb-go', 'CAST OFF ›', { type: 'submit' });
      const sync = (): void => {
        island = input.value;
        go.disabled = cleanIsland(island) === '';
      };
      input.addEventListener('input', sync);
      card.addEventListener('submit', (e) => {
        e.preventDefault();
        const profile: Profile = { name: cleanName(name), island: cleanIsland(input.value), look };
        if (profile.name && profile.island) finish({ kind: 'new', profile });
      });
      const actions = el('div', 'onb-actions');
      actions.append(button('onb-ghost', '‹ Retour', () => creator()), go);
      card.append(
        input,
        ideaChips(ISLAND_IDEAS, (idea) => {
          input.value = idea;
          sync();
        }),
        el('p', 'onb-hint', 'Everyone will talk about it. For better or worse.'),
        actions,
      );
      show(card, input);
      sync();
    }

    title();
  });
}
