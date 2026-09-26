import * as THREE from 'three';
import { mulberry32 } from '../../shared/rng';
import { isWalkable, kindAt, surfaceHeight, type TileKind, type TileMap } from '../game/map';

const INK = '#2b2233';
type Draw = (ctx: CanvasRenderingContext2D, frame: number) => void;

function px(ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

/** Horizontal strip of `frames` pixel-art frames. */
function strip(w: number, h: number, frames: number, draw: Draw): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w * frames;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  for (let f = 0; f < frames; f++) {
    ctx.save();
    ctx.translate(f * w, 0);
    draw(ctx, f);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / frames, 1);
  return tex;
}

// ---------- Pixel art ----------

const hen: Draw = (ctx, f) => {
  const peck = f === 2;
  const step = f === 1 ? 1 : 0;
  px(ctx, INK, 3, 5, 9, 7);
  px(ctx, '#fbf7ee', 4, 6, 7, 5);
  px(ctx, '#e6ddcc', 4, 9, 7, 2);
  px(ctx, INK, 11, 4, 3, 3);
  px(ctx, '#fbf7ee', 11, 5, 2, 2);
  const hx = peck ? 1 : 1;
  const hy = peck ? 6 : 1;
  px(ctx, INK, hx, hy, 5, 5);
  px(ctx, '#fbf7ee', hx + 1, hy + 1, 3, 3);
  px(ctx, '#e0443a', hx + 1, hy - 1, 3, 1);
  px(ctx, '#e0443a', hx + 2, hy - 2, 1, 1);
  px(ctx, '#f2a93b', hx - 1, hy + 2, 2, 1);
  px(ctx, '#e0443a', hx + 1, hy + 4, 1, 1);
  px(ctx, INK, hx + 1, hy + 2, 1, 1);
  px(ctx, '#d9cdb8', 6, 7, 4, 2);
  px(ctx, '#f2a93b', 6 - step, 12, 1, 3);
  px(ctx, '#f2a93b', 9 + step, 12, 1, 3);
};

const cat: Draw = (ctx, f) => {
  const sit = f === 2;
  const step = f === 1 ? 1 : 0;
  const fur = '#e89a4c';
  const dark = '#b8672e';
  if (sit) {
    px(ctx, INK, 5, 6, 8, 9);
    px(ctx, fur, 6, 7, 6, 7);
    px(ctx, '#fbe7cf', 7, 10, 4, 4);
    px(ctx, INK, 13, 10, 3, 2);
    px(ctx, fur, 13, 11, 2, 1);
  } else {
    px(ctx, INK, 4, 7, 11, 6);
    px(ctx, fur, 5, 8, 9, 4);
    px(ctx, dark, 7, 8, 1, 3);
    px(ctx, dark, 10, 8, 1, 3);
    px(ctx, INK, 14, 5 - step, 2, 4);
    px(ctx, fur, 14, 6 - step, 1, 2);
    px(ctx, INK, 5 + step, 12, 2, 3);
    px(ctx, INK, 11 - step, 12, 2, 3);
  }
  const hx = sit ? 5 : 1;
  const hy = sit ? 1 : 3;
  px(ctx, INK, hx, hy, 7, 6);
  px(ctx, fur, hx + 1, hy + 1, 5, 4);
  px(ctx, INK, hx, hy - 2, 2, 2);
  px(ctx, INK, hx + 5, hy - 2, 2, 2);
  px(ctx, '#f7b7a3', hx + 1, hy - 1, 1, 1);
  px(ctx, '#f7b7a3', hx + 5, hy - 1, 1, 1);
  px(ctx, INK, hx + 2, hy + 2, 1, 1);
  px(ctx, INK, hx + 4, hy + 2, 1, 1);
  px(ctx, '#fbe7cf', hx + 2, hy + 3, 3, 2);
  px(ctx, '#e8435a', hx + 3, hy + 3, 1, 1);
};

const crab: Draw = (ctx, f) => {
  const up = f === 1 ? 1 : 0;
  px(ctx, INK, 3, 6, 10, 6);
  px(ctx, '#e0573f', 4, 7, 8, 4);
  px(ctx, '#f28a6a', 5, 7, 5, 1);
  px(ctx, INK, 5, 4, 1, 3);
  px(ctx, INK, 10, 4, 1, 3);
  px(ctx, '#fff', 5, 3, 1, 1);
  px(ctx, '#fff', 10, 3, 1, 1);
  px(ctx, INK, 0, 4 - up, 4, 4);
  px(ctx, '#e0573f', 1, 5 - up, 2, 2);
  px(ctx, INK, 12, 4 - up, 4, 4);
  px(ctx, '#e0573f', 13, 5 - up, 2, 2);
  for (let i = 0; i < 3; i++) {
    px(ctx, INK, 3 - ((i + f) % 2), 11 + (i % 2), 2, 1);
    px(ctx, INK, 11 + ((i + f) % 2), 11 + (i % 2), 2, 1);
  }
};

const butterfly = (wing: string, spot: string): Draw => (ctx, f) => {
  const open = f === 0;
  const w = open ? 4 : 2;
  px(ctx, INK, 3, 2, 2, 5);
  px(ctx, INK, 4 - w - 1, 1, w + 1, 4);
  px(ctx, INK, 5, 1, w + 1, 4);
  px(ctx, wing, 4 - w, 2, w, 2);
  px(ctx, wing, 5, 2, w, 2);
  px(ctx, spot, 4 - w, 2, 1, 1);
  px(ctx, spot, 4 + w, 2, 1, 1);
  px(ctx, wing, 4 - w + 1, 5, w - 1 || 1, 1);
  px(ctx, wing, 5, 5, w - 1 || 1, 1);
};

const gull: Draw = (ctx, f) => {
  const up = f === 0;
  px(ctx, INK, 6, 4, 6, 4);
  px(ctx, '#fbfbf8', 7, 5, 4, 2);
  px(ctx, '#f2a93b', 12, 5, 2, 1);
  if (up) {
    px(ctx, INK, 1, 1, 6, 2);
    px(ctx, INK, 11, 1, 6, 2);
    px(ctx, '#e8edf2', 2, 1, 4, 1);
    px(ctx, '#e8edf2', 12, 1, 4, 1);
    px(ctx, '#6b7280', 1, 1, 1, 1);
    px(ctx, '#6b7280', 16, 1, 1, 1);
  } else {
    px(ctx, INK, 1, 6, 6, 2);
    px(ctx, INK, 11, 6, 6, 2);
    px(ctx, '#e8edf2', 2, 6, 4, 1);
    px(ctx, '#e8edf2', 12, 6, 4, 1);
  }
};

// ---------- Actors ----------

interface Walker {
  mesh: THREE.Mesh;
  tex: THREE.CanvasTexture;
  pos: THREE.Vector3;
  target: THREE.Vector3 | null;
  wait: number;
  speed: number;
  home: THREE.Vector2;
  kinds: TileKind[];
  frames: number;
  idleFrame: number;
  sideways: boolean;
}

function billboard(tex: THREE.CanvasTexture, w: number, h: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  return mesh;
}

function setFrame(tex: THREE.CanvasTexture, frame: number, frames: number): void {
  tex.offset.x = frame / frames;
}

function groundY(map: TileMap, x: number, z: number): number {
  return surfaceHeight(kindAt(map, Math.round(x), Math.round(z)));
}

function clearLine(map: TileMap, from: THREE.Vector3, to: THREE.Vector3, kinds: TileKind[]): boolean {
  for (let i = 1; i <= 6; i++) {
    const x = Math.round(THREE.MathUtils.lerp(from.x, to.x, i / 6));
    const z = Math.round(THREE.MathUtils.lerp(from.z, to.z, i / 6));
    if (!isWalkable(map, x, z) || !kinds.includes(kindAt(map, x, z))) return false;
  }
  return true;
}

function tilesOf(map: TileMap, kinds: TileKind[]): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) if (isWalkable(map, x, z) && kinds.includes(kindAt(map, x, z))) out.push(new THREE.Vector2(x, z));
  return out;
}

export interface Life {
  group: THREE.Group;
  update(dt: number, time: number): void;
}

/** Small island life: hens, a cat, crabs, butterflies, seagulls and chimney smoke. */
export function createLife(map: TileMap, chimneys: THREE.Vector3[]): Life {
  const group = new THREE.Group();
  const rng = mulberry32(21);
  const walkers: Walker[] = [];

  const addWalker = (draw: Draw, frames: number, size: number, home: THREE.Vector2, kinds: TileKind[], speed: number, idleFrame: number, sideways = false): void => {
    const tex = strip(16, 16, frames, draw);
    const mesh = billboard(tex, size, size);
    const pos = new THREE.Vector3(home.x, groundY(map, home.x, home.y), home.y);
    mesh.position.copy(pos);
    group.add(mesh);
    walkers.push({ mesh, tex, pos, target: null, wait: rng() * 2, speed, home, kinds, frames, idleFrame, sideways });
  };

  const land: TileKind[] = ['grass', 'path'];
  for (const [x, z] of [[8, 22], [9, 21], [4, 19]] as const) addWalker(hen, 3, 0.5, new THREE.Vector2(x, z), land, 0.9, 2);
  addWalker(cat, 3, 0.55, new THREE.Vector2(13, 18), land, 1.1, 2);
  const sand = tilesOf(map, ['sand']);
  for (let i = 0; i < 4 && sand.length; i++) {
    const t = sand[Math.floor(rng() * sand.length)];
    if (t) addWalker(crab, 2, 0.38, t, ['sand'], 0.7, 0, true);
  }

  const flyers: { mesh: THREE.Mesh; tex: THREE.CanvasTexture; center: THREE.Vector3; phase: number; radius: number; speed: number }[] = [];
  const colors: [string, string][] = [['#ffd25e', '#e0443a'], ['#f6f1ff', '#9aa6ff'], ['#ff9fc4', '#fff'], ['#8fd3ff', '#2f5f8f']];
  const flowers = map.flowers.length ? map.flowers : [{ x: 12, z: 17 }];
  for (let i = 0; i < 7; i++) {
    const [wing, spot] = colors[i % colors.length] ?? ['#ffd25e', '#e0443a'];
    const f = flowers[Math.floor(rng() * flowers.length)] ?? { x: 12, z: 17 };
    const tex = strip(10, 8, 2, butterfly(wing, spot));
    const mesh = billboard(tex, 0.28, 0.22);
    group.add(mesh);
    flyers.push({ mesh, tex, center: new THREE.Vector3(f.x, groundY(map, f.x, f.z) + 0.55, f.z), phase: rng() * 10, radius: 0.6 + rng() * 0.9, speed: 0.5 + rng() * 0.5 });
  }

  const gulls: { mesh: THREE.Mesh; tex: THREE.CanvasTexture; phase: number; r: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const tex = strip(18, 9, 2, gull);
    const mesh = billboard(tex, 0.75, 0.38);
    group.add(mesh);
    gulls.push({ mesh, tex, phase: i * 2.1, r: 7 + i * 2.5 });
  }

  const smokeTex = strip(8, 8, 1, (ctx) => {
    px(ctx, 'rgba(255,255,255,0.9)', 2, 1, 4, 6);
    px(ctx, 'rgba(255,255,255,0.9)', 1, 2, 6, 4);
    px(ctx, 'rgba(210,214,224,0.9)', 4, 5, 3, 2);
  });
  const puffs: { s: THREE.Sprite; base: THREE.Vector3; phase: number }[] = [];
  for (const c of chimneys) {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false }));
      group.add(s);
      puffs.push({ s, base: c, phase: i / 4 });
    }
  }

  function stepWalker(w: Walker, dt: number, time: number): void {
    if (!w.target) {
      w.wait -= dt;
      const idle = Math.floor(time * 2 + w.home.x) % 3 === 0;
      setFrame(w.tex, w.sideways ? 0 : idle ? w.idleFrame : 0, w.frames);
      if (w.wait > 0) return;
      const tx = w.home.x + (rng() - 0.5) * 6;
      const tz = w.home.y + (rng() - 0.5) * 4;
      const target = new THREE.Vector3(tx, 0, tz);
      w.wait = 1 + rng() * 3;
      if (clearLine(map, w.pos, target, w.kinds)) w.target = target;
      return;
    }
    const dx = w.target.x - w.pos.x;
    const dz = w.target.z - w.pos.z;
    const d = Math.hypot(dx, dz);
    const step = w.speed * dt;
    if (d <= step) {
      w.pos.x = w.target.x;
      w.pos.z = w.target.z;
      w.target = null;
    } else {
      w.pos.x += (dx / d) * step;
      w.pos.z += (dz / d) * step;
    }
    if (!w.sideways && Math.abs(dx) > 0.01) w.mesh.scale.x = dx > 0 ? -1 : 1;
    setFrame(w.tex, Math.floor(time * 8) % 2, w.frames);
  }

  return {
    group,
    update(dt, time) {
      for (const w of walkers) {
        stepWalker(w, dt, time);
        w.pos.y += (groundY(map, w.pos.x, w.pos.z) - w.pos.y) * Math.min(1, dt * 10);
        w.mesh.position.copy(w.pos);
        if (w.target && !w.sideways) w.mesh.position.y += Math.abs(Math.sin(time * 14)) * 0.03;
      }
      for (const f of flyers) {
        const t = time * f.speed + f.phase;
        f.mesh.position.set(f.center.x + Math.sin(t) * f.radius, f.center.y + Math.sin(t * 3.1) * 0.18, f.center.z + Math.cos(t * 0.8) * f.radius * 0.6);
        f.mesh.scale.x = Math.cos(t) > 0 ? 1 : -1;
        setFrame(f.tex, Math.floor(time * 10 + f.phase) % 2, 2);
      }
      for (const g of gulls) {
        const t = time * 0.18 + g.phase;
        g.mesh.position.set(12 + Math.cos(t) * g.r, 4.2 + Math.sin(t * 2) * 0.3, 15 + Math.sin(t) * g.r * 0.8);
        g.mesh.scale.x = Math.sin(t) > 0 ? 1 : -1;
        setFrame(g.tex, Math.floor(time * 3 + g.phase) % 2, 2);
      }
      for (const p of puffs) {
        const k = (time * 0.35 + p.phase) % 1;
        p.s.position.set(p.base.x + Math.sin(k * 5 + p.phase * 9) * 0.15 + k * 0.3, p.base.y + 0.1 + k * 1.4, p.base.z);
        p.s.scale.setScalar(0.18 + k * 0.4);
        p.s.material.opacity = (1 - k) * 0.7;
      }
    },
  };
}
