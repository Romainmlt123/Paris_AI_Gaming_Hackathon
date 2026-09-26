type Attrs = Record<string, string>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
  attrs: Attrs = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text, { type: 'button' });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** Retro typewriter; resolves when done. Tapping the element (or calling `skip`) jumps to the end. */
export function typewrite(node: HTMLElement, text: string, cps = 45, onChar?: (ch: string) => void): { done: Promise<void>; skip: () => void } {
  let skip = (): void => undefined;
  const done = new Promise<void>((resolve) => {
    let i = 0;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      node.textContent = text;
      node.removeEventListener('pointerdown', finish);
      resolve();
    };
    skip = finish;
    node.addEventListener('pointerdown', finish);
    const tick = (): void => {
      if (done) return;
      i += 1;
      node.textContent = text.slice(0, i);
      onChar?.(text[i - 1] ?? '');
      if (i >= text.length) finish();
      else setTimeout(tick, /[.,!?…]/.test(text[i - 1] ?? '') ? 1000 / cps * 5 : 1000 / cps);
    };
    node.textContent = '';
    tick();
  });
  return { done, skip };
}
