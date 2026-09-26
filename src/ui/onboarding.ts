import { cleanIsland, cleanName, ISLAND_IDEAS, ISLAND_MAX, LOOK_OPTIONS, NAME_IDEAS, NAME_MAX, randomLook } from '../../shared/player';
import type { HairStyle, PlayerLook } from '../../shared/types';
import { drawSheet, FRAME_H, FRAME_W, lookSpec } from '../render/sprites';
import { button, el } from './dom';

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

const HAIR_LABEL: Record<HairStyle, string> = { short: 'Court', bun: 'Chignon', cap: 'Casquette', beanie: 'Bonnet' };
const PREVIEW_SCALE = 5;

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

/** Title screen → character creator → island name. DOM overlay above the live 3D scene. */
export function runOnboarding(host: HTMLElement, opts: OnboardingOptions): Promise<OnboardingResult> {
  return new Promise((resolve) => {
    const back = el('div', 'onb-back');
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
      back.replaceChildren(card);
      focus?.focus();
    };

    function title(): void {
      const card = el('div', 'onb-card onb-title');
      card.append(
        el('h1', 'onb-logo', 'RAGOTS'),
        el('p', 'onb-tag', 'Une île mignonne. Des voisins qui parlent. Beaucoup trop.'),
        button('onb-go', 'Nouvelle partie', () => creator()),
      );
      if (opts.canContinue) card.append(button('onb-ghost', opts.continueLabel, () => finish({ kind: 'continue' })));
      card.append(el('p', 'onb-foot', 'Chaque mot compte. Chaque ragot circule.'));
      show(card);
    }

    function creator(): void {
      const card = el('form', 'onb-card onb-creator');
      card.append(el('h2', 'onb-h', 'Qui débarque sur l\u2019île ?'));
      const preview = el('canvas', 'onb-preview', '', { width: String(FRAME_W * PREVIEW_SCALE), height: String(FRAME_H * PREVIEW_SCALE) });
      let facing: 0 | 1 = 0;
      const draw = (): void => {
        const ctx = preview.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, preview.width, preview.height);
        ctx.drawImage(drawSheet(lookSpec(look)), 0, facing * FRAME_H, FRAME_W, FRAME_H, 0, 0, preview.width, preview.height);
      };
      const turn = button('onb-turn', '', () => {
        facing = facing === 0 ? 1 : 0;
        draw();
      });
      turn.setAttribute('aria-label', 'Tourner le personnage');
      turn.append(preview, el('span', 'onb-turn-hint', '↻ tourner'));

      const nameInput = textField('onb-name', 'Ton prénom', NAME_MAX, name);
      let refresh: () => void = () => undefined;
      const set = (patch: Partial<PlayerLook>): void => {
        look = { ...look, ...patch };
        refresh();
      };
      const rows = [
        swatchRow('Peau', LOOK_OPTIONS.skin, () => look.skin, (v) => set({ skin: v })),
        swatchRow('Coiffure', LOOK_OPTIONS.hairStyle, () => look.hairStyle, (v) => set({ hairStyle: v }), (v) => HAIR_LABEL[v]),
        swatchRow('Cheveux', LOOK_OPTIONS.hair, () => look.hair, (v) => set({ hair: v })),
        swatchRow('Haut', LOOK_OPTIONS.shirt, () => look.shirt, (v) => set({ shirt: v })),
      ];
      const next = el('button', 'onb-go', 'Suivant ›', { type: 'submit' });
      const sync = (): void => {
        name = nameInput.value;
        next.disabled = cleanName(name) === '';
        draw();
        for (const r of rows) r.sync();
      };
      refresh = sync;
      nameInput.addEventListener('input', sync);
      const dice = button('onb-dice', '🎲 Au hasard', () => {
        look = randomLook();
        if (!cleanName(nameInput.value)) nameInput.value = NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)] ?? '';
        sync();
      });
      card.addEventListener('submit', (e) => {
        e.preventDefault();
        if (cleanName(nameInput.value)) islandStep();
      });
      const top = el('div', 'onb-top');
      const fields = el('div', 'onb-fields');
      fields.append(
        el('label', 'onb-label', 'Ton prénom', { for: 'onb-name' }),
        nameInput,
        ideaChips(NAME_IDEAS, (idea) => {
          nameInput.value = idea;
          sync();
        }),
      );
      top.append(turn, fields);
      card.append(top, ...rows.map((r) => r.row), el('div', 'onb-actions'));
      card.lastElementChild?.append(dice, next);
      card.append(el('p', 'onb-hint', 'Les habitants s\u2019en souviendront. Et le répéteront.'));
      show(card, name ? undefined : nameInput);
      sync();
    }

    function islandStep(): void {
      const card = el('form', 'onb-card onb-island');
      card.append(el('h2', 'onb-h', 'Comment s\u2019appelle ton île ?'));
      const input = textField('onb-island', 'Nom de l\u2019île', ISLAND_MAX, island);
      const go = el('button', 'onb-go', 'Débarquer sur l\u2019île ›', { type: 'submit' });
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
        el('p', 'onb-hint', 'Tout le monde en parlera. En bien ou en mal.'),
        actions,
      );
      show(card, input);
      sync();
    }

    title();
  });
}
