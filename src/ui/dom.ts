/** Mini-helpers DOM, sans framework. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function btn(label: string, cls: string, onClick: () => void, icon?: string): HTMLButtonElement {
  const b = h('button', { class: cls }, icon ? h('span', {}, icon) : null, label);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function relColor(v: number): string {
  if (v <= -50) return '#b8322b';
  if (v <= -15) return '#e0564b';
  if (v < 15) return '#e6b93b';
  if (v < 40) return '#8cc56a';
  return '#4caf6d';
}

export function gaugeWidth(v: number): string {
  return `${Math.round((v + 100) / 2)}%`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
