import type { GameState, NpcId } from '../../shared/types';
import type { BuildingId } from '../game/map';
import { drawSheet, FRAME_H, FRAME_W, SPRITES } from '../render/sprites';
import { button, el } from '../ui/dom';
import { COLS, DOOR_X, layoutFor, ROWS, T, WALL_ROWS, type Action, type Layout, type Piece } from './layouts';
import { shadow } from './paint';

const SPEED = 4.2;

interface Pos {
  x: number;
  z: number;
}

export interface Interior {
  root: HTMLElement;
  isOpen(): boolean;
  current(): BuildingId | null;
  enter(id: BuildingId, state: GameState): void;
  exit(): void;
  /** Rebuild the room (stock sold out, new furniture, island level up). */
  refresh(state: GameState): void;
  setPlayerSheet(sheet: HTMLCanvasElement): void;
  move(dx: number, dz: number, dt: number): void;
  /** Use whatever the player stands next to (E / Space). */
  interact(): void;
  update(dt: number, time: number): void;
}

export interface InteriorHooks {
  onAction(action: Action): void;
  onExit(id: BuildingId): void;
}

type Target = { piece: Piece; action: Action };

const key = (x: number, z: number): number => z * COLS + x;
const isDoor = (t: Pos): boolean => t.z === ROWS - 1 && DOOR_X.includes(t.x);

export function createInterior(hooks: InteriorHooks): Interior {
  const root = el('div', 'interior');
  root.hidden = true;
  const canvas = el('canvas', 'interior-room');
  canvas.width = COLS * T;
  canvas.height = ROWS * T;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  const title = el('div', 'interior-title');
  const name = el('div', 'interior-name');
  const sub = el('div', 'interior-sub');
  title.append(name, sub);
  const prompt = button('interior-prompt', '', () => {
    if (near) hooks.onAction(near.action);
  });
  prompt.hidden = true;
  const exitBtn = button('interior-exit', '🚪 Sortir', () => leave());
  const bar = el('div', 'interior-bar');
  bar.append(title, exitBtn);
  root.append(canvas, prompt, bar);

  const owners = new Map<NpcId, HTMLCanvasElement>();
  let playerSheet = drawSheet(SPRITES.player);
  let open: BuildingId | null = null;
  let layout: Layout | null = null;
  let blocked = new Set<number>();
  const player = { x: 5, z: 9, facing: 'up' as 'up' | 'down', flip: false, moving: false };
  let path: Pos[] = [];
  let arrive: (() => void) | null = null;
  let near: Target | null = null;

  function build(state: GameState): void {
    if (!open) return;
    layout = layoutFor(open, state);
    name.textContent = layout.title;
    sub.textContent = layout.subtitle;
    blocked = new Set();
    for (let x = 0; x < COLS; x++) for (let z = 0; z < WALL_ROWS; z++) blocked.add(key(x, z));
    for (let x = 0; x < COLS; x++) if (!DOOR_X.includes(x)) blocked.add(key(x, ROWS - 1));
    for (const p of layout.pieces) {
      if (!p.solid) continue;
      for (let x = p.x; x < p.x + p.w; x++) for (let z = p.z; z < p.z + p.d; z++) blocked.add(key(x, z));
    }
    if (layout.owner) {
      blocked.add(key(layout.owner.x, layout.owner.z));
      if (!owners.has(layout.owner.npc)) owners.set(layout.owner.npc, drawSheet(SPRITES[layout.owner.npc]));
    }
  }

  const free = (x: number, z: number): boolean => x >= 0 && z >= 0 && x < COLS && z < ROWS && !blocked.has(key(x, z));

  function bfs(from: Pos, goals: Pos[]): Pos[] | null {
    const goalSet = new Set(goals.filter((g) => free(g.x, g.z)).map((g) => key(g.x, g.z)));
    if (goalSet.size === 0) return null;
    const start = key(from.x, from.z);
    const prev = new Map<number, number>([[start, -1]]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift() ?? 0;
      if (goalSet.has(cur)) {
        const out: Pos[] = [];
        for (let k = cur; k !== start; k = prev.get(k) ?? start) out.unshift({ x: k % COLS, z: Math.floor(k / COLS) });
        return out;
      }
      const cx = cur % COLS;
      const cz = Math.floor(cur / COLS);
      for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const nx = cx + dx;
        const nz = cz + dz;
        const nk = key(nx, nz);
        if (free(nx, nz) && !prev.has(nk)) {
          prev.set(nk, cur);
          queue.push(nk);
        }
      }
    }
    return null;
  }

  const tileOf = (): Pos => ({ x: Math.round(player.x), z: Math.round(player.z) });

  /** Tiles from which a footprint can be used, front side first. */
  function around(x: number, z: number, w: number, d: number): Pos[] {
    const out: Pos[] = [];
    for (let i = x; i < x + w; i++) out.push({ x: i, z: z + d });
    for (let j = z; j < z + d; j++) out.push({ x: x - 1, z: j }, { x: x + w, z: j });
    for (let i = x; i < x + w; i++) out.push({ x: i, z: z - 1 });
    return out;
  }

  function goTo(goals: Pos[], then: (() => void) | null): void {
    const p = bfs(tileOf(), goals);
    if (!p) return;
    path = p;
    arrive = then;
    if (p.length === 0 && then) {
      arrive = null;
      then();
    }
  }

  function targets(): Target[] {
    if (!layout) return [];
    const out: Target[] = [];
    if (layout.owner) out.push({ piece: { ...layout.owner, w: 1, d: 1, solid: true, label: 'Talk', draw: () => undefined }, action: { kind: 'talk', npc: layout.owner.npc } });
    for (const p of layout.pieces) if (p.action && p.w > 0) out.push({ piece: p, action: p.action });
    return out;
  }

  function adjacent(t: Target): boolean {
    const me = tileOf();
    const { x, z, w, d } = t.piece;
    const dx = Math.max(x - me.x, 0, me.x - (x + w - 1));
    const dz = Math.max(z - me.z, 0, me.z - (z + d - 1));
    return dx + dz <= 1 || (t.action.kind === 'talk' && dx <= 1 && dz <= 2);
  }

  function leave(): void {
    const id = open;
    if (!id) return;
    api.exit();
    hooks.onExit(id);
  }

  function checkDoor(): void {
    if (open && isDoor(tileOf())) leave();
  }

  canvas.addEventListener('pointerup', (e) => {
    if (!layout) return;
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * canvas.width;
    const py = ((e.clientY - r.top) / r.height) * canvas.height;
    const tx = Math.floor(px / T);
    const tz = Math.floor(py / T);
    const hit = (t: Target): boolean => {
      const { x, z, w, d } = t.piece;
      const tall = t.action.kind === 'talk' || (t.piece.solid && z <= WALL_ROWS) ? 1 : 0;
      return tx >= x && tx < x + w && tz >= z - tall && tz < z + d;
    };
    const t = targets().find(hit);
    if (t) {
      const { x, z, w, d } = t.piece;
      const extra = t.action.kind === 'talk' ? [{ x, z: z + 2 }, { x: x - 1, z: z + 2 }, { x: x + 1, z: z + 2 }] : [];
      goTo([...around(x, z, w, d), ...extra], () => hooks.onAction(t.action));
      return;
    }
    if (isDoor({ x: tx, z: tz })) return goTo([{ x: tx, z: tz }], null);
    const goals: Pos[] = [];
    for (let r2 = 0; r2 <= 2 && goals.length === 0; r2++) {
      for (let i = -r2; i <= r2; i++) for (let j = -r2; j <= r2; j++) if (free(tx + i, tz + j)) goals.push({ x: tx + i, z: tz + j });
    }
    goTo(goals, null);
  });

  function drawActor(sheet: HTMLCanvasElement, x: number, z: number, facing: 'up' | 'down', flip: boolean, frameNo: number): void {
    if (!ctx) return;
    const cx = x * T + T / 2;
    const foot = z * T + T - 2;
    shadow(ctx, cx - 11, foot - 5, 22, 8);
    ctx.save();
    ctx.translate(cx, 0);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(sheet, frameNo * FRAME_W, facing === 'down' ? 0 : FRAME_H, FRAME_W, FRAME_H, -FRAME_W / 2, foot - FRAME_H, FRAME_W, FRAME_H);
    ctx.restore();
  }

  function draw(time: number): void {
    if (!ctx || !layout) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    layout.room(ctx);
    const piece = (p: Piece): void => p.draw(ctx, p.x * T, p.z * T, p.w * T, p.d * T);
    layout.pieces.filter((p) => p.layer === 'floor').forEach(piece);
    if (near) {
      const { x, z, w, d } = near.piece;
      ctx.strokeStyle = `rgba(255,210,94,${0.6 + Math.sin(time * 6) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(x * T + 1, z * T + 1, w * T - 2, d * T - 2);
    }
    const sorted: { z: number; draw: () => void }[] = layout.pieces.filter((p) => !p.layer).map((p) => ({ z: p.z + p.d - 1, draw: () => piece(p) }));
    const owner = layout.owner;
    const ownerSheet = owner ? owners.get(owner.npc) : undefined;
    if (owner && ownerSheet) sorted.push({ z: owner.z + 0.1, draw: () => drawActor(ownerSheet, owner.x, owner.z + Math.sin(time * 2) * 0.03, 'down', false, 0) });
    const frameNo = player.moving ? 1 + (Math.floor(time * 8) % 2) : 0;
    sorted.push({ z: player.z + 0.2, draw: () => drawActor(playerSheet, player.x, player.z, player.facing, player.flip, frameNo) });
    sorted.sort((a, b) => a.z - b.z).forEach((s) => s.draw());
    layout.pieces.filter((p) => p.layer === 'ceiling').forEach(piece);
  }

  const api: Interior = {
    root,
    isOpen: () => open !== null,
    current: () => open,
    enter(id, state) {
      open = id;
      build(state);
      player.x = DOOR_X[0] ?? 5;
      player.z = ROWS - 2;
      player.facing = 'up';
      path = [];
      arrive = null;
      near = null;
      root.hidden = false;
      root.classList.remove('enter');
      void root.offsetWidth;
      root.classList.add('enter');
      document.body.classList.add('indoors');
    },
    exit() {
      open = null;
      layout = null;
      path = [];
      arrive = null;
      root.hidden = true;
      prompt.hidden = true;
      document.body.classList.remove('indoors');
    },
    refresh(state) {
      if (open) build(state);
    },
    setPlayerSheet(sheet) {
      playerSheet = sheet;
    },
    move(dx, dz, dt) {
      if (!open) return;
      if (dx === 0 && dz === 0) {
        if (path.length === 0) player.moving = false;
        return;
      }
      path = [];
      arrive = null;
      player.moving = true;
      const len = Math.hypot(dx, dz);
      const step = (SPEED * dt) / len;
      const tryAxis = (nx: number, nz: number): void => {
        const from = tileOf();
        const to = { x: Math.round(nx), z: Math.round(nz) };
        if ((to.x === from.x && to.z === from.z) || free(to.x, to.z)) {
          player.x = nx;
          player.z = nz;
        }
      };
      tryAxis(player.x + dx * step, player.z);
      tryAxis(player.x, player.z + dz * step);
      if (Math.abs(dz) > 0.01) player.facing = dz < 0 ? 'up' : 'down';
      if (Math.abs(dx) > 0.01) player.flip = dx < 0;
      checkDoor();
    },
    interact() {
      if (near) hooks.onAction(near.action);
    },
    update(dt, time) {
      if (!open) return;
      const next = path[0];
      if (next) {
        player.moving = true;
        const dx = next.x - player.x;
        const dz = next.z - player.z;
        const dist = Math.hypot(dx, dz);
        const step = SPEED * dt;
        if (Math.abs(dz) > 0.01) player.facing = dz < 0 ? 'up' : 'down';
        if (Math.abs(dx) > 0.01) player.flip = dx < 0;
        if (dist <= step) {
          player.x = next.x;
          player.z = next.z;
          path.shift();
          if (path.length === 0) {
            player.moving = false;
            checkDoor();
            const cb = arrive;
            arrive = null;
            if (cb) {
              if (layout?.owner) player.facing = 'up';
              cb();
            }
          }
        } else {
          player.x += (dx / dist) * step;
          player.z += (dz / dist) * step;
        }
      }
      if (!open) return;
      near = targets().find(adjacent) ?? null;
      prompt.hidden = !near;
      if (near) prompt.textContent = `✋ ${near.piece.label ?? 'Use'}`;
      draw(time);
    },
  };
  return api;
}
