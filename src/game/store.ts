import type { GameState } from '../state/types.ts';
import { createInitialState } from '../logic/initial.ts';

const KEY = 'ragots-save-v2';

export class Store {
  state: GameState;
  private listeners: ((s: GameState) => void)[] = [];
  private saveTimer = 0;

  constructor() {
    this.state = Store.load() ?? createInitialState();
  }

  static load(): GameState | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as GameState;
      return s.version === 2 ? s : null;
    } catch {
      return null;
    }
  }

  set(next: GameState): void {
    this.state = next;
    for (const l of this.listeners) l(next);
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.save(), 300);
  }

  save(): void {
    this.state.lastSavedAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(this.state));
  }

  reset(): void {
    localStorage.removeItem(KEY);
    this.set(createInitialState());
  }

  subscribe(fn: (s: GameState) => void): void {
    this.listeners.push(fn);
  }
}
