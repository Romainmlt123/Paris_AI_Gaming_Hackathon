import { cleanName, NAME_MAX } from '../../shared/player';
import { el } from './dom';

const IDEAS = ['Jean-Kévin', 'Brigitte', 'Momo', 'Paquita', 'Didier'];

/** Title card asking for the player's first name. Resolves once a valid name is submitted. */
export function askPlayerName(host: HTMLElement, preset = ''): Promise<string> {
  return new Promise((resolve) => {
    const back = el('div', 'modal-back welcome-back');
    const form = el('form', 'modal welcome');
    const title = el('h1', 'welcome-title', 'RAGOTS');
    const tagline = el('p', 'welcome-tag', 'Une île mignonne. Des voisins qui parlent. Beaucoup trop.');
    const label = el('label', 'welcome-label', 'Comment tu t\u2019appelles ?', { for: 'welcome-name' });
    const input = el('input', 'welcome-input', '', {
      id: 'welcome-name',
      maxlength: String(NAME_MAX),
      autocomplete: 'off',
      enterkeyhint: 'go',
      placeholder: 'Ton prénom',
    });
    input.value = preset;
    const ideas = el('div', 'welcome-ideas');
    for (const idea of IDEAS) {
      const chip = el('button', 'chip-btn', idea, { type: 'button' });
      chip.addEventListener('click', () => {
        input.value = idea;
        sync();
        input.focus();
      });
      ideas.append(chip);
    }
    const hint = el('p', 'welcome-hint', 'Les habitants s\u2019en souviendront. Et le répéteront.');
    const go = el('button', 'welcome-go', 'Débarquer sur l\u2019île', { type: 'submit' });
    const sync = (): void => {
      go.disabled = cleanName(input.value) === '';
    };
    input.addEventListener('input', sync);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = cleanName(input.value);
      if (!name) return;
      input.blur();
      back.classList.add('leaving');
      setTimeout(() => back.remove(), 350);
      resolve(name);
    });
    form.append(title, tagline, label, input, ideas, hint, go);
    back.append(form);
    host.append(back);
    sync();
    input.focus();
  });
}
