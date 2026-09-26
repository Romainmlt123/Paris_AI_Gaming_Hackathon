type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

type TagOf<S extends string> = S extends `${infer T}.${string}` ? T : S;
type ElOf<S extends string> = TagOf<S> extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[TagOf<S>] : HTMLElement;

/** Mini helper DOM : h('div.card', { onclick }, 'texte', enfant). */
export function h<S extends string>(
  sel: S,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): ElOf<S> {
  const [tag = 'div', ...classes] = sel.split('.');
  const el = document.createElement(tag);
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el as ElOf<S>;
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
