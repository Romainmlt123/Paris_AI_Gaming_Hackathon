import { TIPS_KEY } from '../game/save';
import { el } from './dom';

export type TipId = 'talk' | 'rumor' | 'absence';

function seen(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(TIPS_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** At most one contextual hint bubble on screen; each is shown until used, then never again. */
export function createTips(host: HTMLElement): { show(id: TipId, text: string): void; done(id: TipId): void } {
  const bubble = el('div', 'tip');
  bubble.hidden = true;
  host.append(bubble);
  let current: TipId | null = null;
  return {
    show(id, text) {
      if (seen().has(id)) return;
      current = id;
      bubble.textContent = text;
      bubble.hidden = false;
    },
    done(id) {
      const s = seen();
      if (s.has(id)) return;
      s.add(id);
      localStorage.setItem(TIPS_KEY, JSON.stringify([...s]));
      if (current === id) {
        bubble.hidden = true;
        current = null;
      }
    },
  };
}
