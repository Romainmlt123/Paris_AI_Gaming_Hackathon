import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise, smoothstep } from './noise';
import {
  bumpTexture,
  digitRainTexture,
  fadeTexture,
  glyphTexture,
  rng,
  softDotTexture,
  waterNormalTexture,
  waterStreakTexture,
} from './textures';

export type Tick = (t: number, dt: number) => void;

export const RX = 6.4;
export const RZ = 5.2;
export const WATERFALL_THETA = 1.9;
const DEPTH = 4.6;
const FALL_HEIGHT = 11;

const terrainNoise = makeNoise(11);
const rockNoise = makeNoise(23);

function rimRadius(theta: number): number {
  return 1 + 0.06 * Math.sin(3 * theta + 0.5) + 0.04 * Math.sin(5 * theta + 2) + 0.025 * Math.sin(8 * theta + 1);
}

/** Point on the island outline (x, z) at angle theta, scaled toward the centre by `scale`. */
export function rimPoint(theta: number, scale = 1): THREE.Vector2 {
  const r = rimRadius(theta) * scale;
  return new THREE.Vector2(Math.cos(theta) * RX * r, Math.sin(theta) * RZ * r);
}

/** How far toward the rim a point lies: 0 at the centre, 1 on the outline. */
export function rimFraction(x: number, z: number): number {
  const theta = Math.atan2(z / RZ, x / RX);
  return Math.hypot(x / RX, z / RZ) / rimRadius(theta);
}

// ---------------------------------------------------------------- river path

const RIVER_SAMPLES = (() => {
  const edge = rimPoint(WATERFALL_THETA, 1.03);
  const pts = [
    [2.1, -3.5],
    [0.9, -2.6],
    [1.7, -1.3],
    [0.5, -0.1],
    [-1.0, 0.8],
    [-1.9, 2.2],
    [-1.95, 3.5],
    [edge.x, edge.y],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5).getSpacedPoints(160);
})();
const riverHalfWidth = (u: number): number => (0.55 + u * 0.35) / 2;

function baseHeight(x: number, z: number): number {
  const u = rimFraction(x, z);
  let h = 0.17 * terrainNoise.fbm2(x * 0.22, z * 0.22, 4);
  h += 0.28 * (1 - u * u);
  h -= 0.3 * smoothstep(0.84, 1.02, u);
  return h;
}

/** Water surface height along the river: follows the land but never flows uphill. */
const WATER_Y = (() => {
  const ys: number[] = [];
  for (const s of RIVER_SAMPLES) {
    const y = baseHeight(s.x, s.z) - 0.09;
    ys.push(ys.length ? Math.min(y, ys[ys.length - 1] - 0.001) : y);
  }
  return ys;
})();

function nearestRiver(x: number, z: number): { d: number; i: number } {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < RIVER_SAMPLES.length; i++) {
    const s = RIVER_SAMPLES[i];
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  return { d: Math.sqrt(best), i: bi };
}

/** 0 on dry land, 1 in the middle of the riverbed. */
function riverBed(x: number, z: number): { bed: number; i: number } {
  const { d, i } = nearestRiver(x, z);
  const w = riverHalfWidth(i / (RIVER_SAMPLES.length - 1));
  return { bed: smoothstep(w + 0.5, w * 0.45, d), i };
}

/** Height of the ground (grass or riverbed) at (x, z); props are settled onto it. */
export function groundHeight(x: number, z: number): number {
  const h = baseHeight(x, z);
  const { bed, i } = riverBed(x, z);
  return h + (WATER_Y[i] - 0.2 - h) * bed;
}

// ---------------------------------------------------------------- colours

const C = (hex: string): THREE.Color => new THREE.Color(hex);
const GRASS_DARK = C('#3f7d26');
const GRASS_LIGHT = C('#7fbf3f');
const GRASS_DRY = C('#a8b453');
const SAND = C('#b9a67a');
const WET = C('#5f5840');
const SOIL = C('#4a3322');

/** Colour of the grass at (x, z); blades use it too so they blend into the ground. */
export function grassColor(x: number, z: number, out = new THREE.Color()): THREE.Color {
  const g = terrainNoise.fbm2(x * 0.55 + 5, z * 0.55, 3) * 0.5 + 0.5;
  out.copy(GRASS_DARK).lerp(GRASS_LIGHT, THREE.MathUtils.clamp(g, 0, 1));
  const dry = smoothstep(0.25, 0.8, terrainNoise.n2(x * 0.16 + 20, z * 0.16));
  return out.lerp(GRASS_DRY, dry * 0.55);
}

function groundColor(x: number, z: number, out: THREE.Color): THREE.Color {
  grassColor(x, z, out);
  const { bed } = riverBed(x, z);
  if (bed > 0.25) out.lerp(SAND, smoothstep(0.25, 0.55, bed));
  if (bed > 0.6) out.lerp(WET, smoothstep(0.6, 0.95, bed));
  return out;
}

// ---------------------------------------------------------------- terrain

function terrain(): THREE.Mesh {
  const segs = 200;
  const rings = 52;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const col = new THREE.Color();
  const push = (x: number, y: number, z: number, c: THREE.Color): void => {
    positions.push(x, y, z);
    colors.push(c.r, c.g, c.b);
    uvs.push(x / 3, z / 3);
  };
  push(0, groundHeight(0, 0), 0, groundColor(0, 0, col));
  for (let k = 1; k <= rings; k++) {
    const u = 1 - Math.pow(1 - k / rings, 1.5);
    for (let i = 0; i < segs; i++) {
      const p = rimPoint((i / segs) * Math.PI * 2, u);
      push(p.x, groundHeight(p.x, p.y), p.y, groundColor(p.x, p.y, col));
    }
  }
  // Turf lip curling over the cliff edge.
  const lip: [number, number, THREE.Color][] = [
    [1.012, -0.09, GRASS_DARK],
    [1.016, -0.2, SOIL],
    [0.995, -0.36, SOIL],
  ];
  for (const [scale, dy, c] of lip) {
    for (let i = 0; i < segs; i++) {
      const theta = (i / segs) * Math.PI * 2;
      const edge = rimPoint(theta, 1);
      const p = rimPoint(theta, scale);
      const jitter = terrainNoise.n2(Math.cos(theta) * 4, Math.sin(theta) * 4) * 0.05;
      push(p.x, groundHeight(edge.x, edge.y) + dy + jitter, p.y, c === GRASS_DARK ? col.copy(c).multiplyScalar(0.85) : c);
    }
  }
  const index: number[] = [];
  const ring = (k: number, i: number): number => 1 + (k - 1) * segs + (i % segs);
  for (let i = 0; i < segs; i++) index.push(0, ring(1, i + 1), ring(1, i));
  const total = rings + lip.length;
  for (let k = 1; k < total; k++) {
    for (let i = 0; i < segs; i++) {
      const a = ring(k, i);
      const b = ring(k, i + 1);
      const c = ring(k + 1, i);
      const d = ring(k + 1, i + 1);
      index.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const bump = bumpTexture(5, 16, 5);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, bumpMap: bump, bumpScale: 1.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

// ---------------------------------------------------------------- cliff / underside

const STRATA = ['#8b5d3b', '#a26f47', '#6f4a33', '#b3845a', '#936342'].map(C);
const STONE_A = C('#7c756d');
const STONE_B = C('#9a9288');

function profile(t: number): number {
  if (t < 0.14) return 0.995 - 0.12 * t;
  const tt = (t - 0.14) / 0.86;
  return (0.995 - 0.12 * 0.14) * Math.pow(Math.max(0, 1 - tt * tt), 0.55);
}

interface Cliff {
  mesh: THREE.Mesh;
  /** Vertex grid (ring, column) for placing boulders and roots on the surface. */
  grid: THREE.Vector3[][];
}

function cliff(): Cliff {
  const segs = 200;
  const rings = 72;
  const bottomY = -DEPTH - 0.3;
  const tip = new THREE.Vector2(0.45, 0.3);
  const grid: THREE.Vector3[][] = [];
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const col = new THREE.Color();
  for (let k = 0; k < rings; k++) {
    const t = k / rings;
    const row: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const theta = (i / segs) * Math.PI * 2;
      const edge = rimPoint(theta, 1);
      const topY = groundHeight(edge.x, edge.y) - 0.3;
      let y = topY + (bottomY - topY) * t;
      const p = rimPoint(theta, profile(t));
      p.addScaledVector(tip, t * t);
      const n = rockNoise.fbm3(p.x * 0.35, y * 0.35, p.y * 0.35, 5);
      const strata = 0.05 * Math.sin(y * 5.5 + rockNoise.n3(p.x * 0.2, y * 0.2, p.y * 0.2) * 3);
      const w = smoothstep(0, 0.05, t);
      const f = 1 + w * (0.07 * n - 0.05 + strata * 0.4);
      y += w * 0.14 * rockNoise.n3(p.x * 0.6, y * 0.6, p.y * 0.6);
      const v = new THREE.Vector3(p.x * f, y, p.y * f);
      row.push(v);
      positions.push(v.x, v.y, v.z);
      uvs.push((i / segs) * 12, y / 1.5);
      const below = topY - y;
      const band = Math.floor((y + n * 0.35) * 1.5);
      col.copy(STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length]);
      col.multiplyScalar(0.9 + 0.2 * rockNoise.n3(p.x * 1.5, y * 1.5, p.y * 1.5));
      col.lerp(SOIL, smoothstep(0.45, 0.05, below));
      const stone = smoothstep(1.4, 3.2, below + n * 0.6);
      col.lerp(n > 0 ? STONE_B : STONE_A, stone * 0.85);
      col.multiplyScalar(1 - 0.3 * t);
      colors.push(col.r, col.g, col.b);
    }
    grid.push(row);
  }
  const poleY = bottomY - 0.3;
  const pole = positions.length / 3;
  positions.push(tip.x, poleY, tip.y);
  colors.push(STONE_A.r * 0.6, STONE_A.g * 0.6, STONE_A.b * 0.6);
  uvs.push(0.5, poleY / 1.5);

  const cols = segs + 1;
  const index: number[] = [];
  for (let k = 0; k < rings - 1; k++) {
    for (let i = 0; i < segs; i++) {
      const a = k * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const last = (rings - 1) * cols;
  for (let i = 0; i < segs; i++) index.push(last + i, last + i + 1, pole);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  // The seam column is duplicated for UVs; give both copies the same normal.
  const normal = geo.getAttribute('normal');
  const nv = new THREE.Vector3();
  for (let k = 0; k < rings; k++) {
    const a = k * cols;
    const b = a + segs;
    nv.set(normal.getX(a) + normal.getX(b), normal.getY(a) + normal.getY(b), normal.getZ(a) + normal.getZ(b)).normalize();
    normal.setXYZ(a, nv.x, nv.y, nv.z);
    normal.setXYZ(b, nv.x, nv.y, nv.z);
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, bumpMap: bumpTexture(9, 8, 6), bumpScale: 3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'cliff';
  return { mesh, grid };
}

// ---------------------------------------------------------------- rocks

/** Smooth, noise-deformed boulder. */
export function rockGeometry(seed: number, size: number, squash = 0.75, detail = 2): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(size, detail);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = rockNoise.fbm3(v.x / size * 1.1 + seed * 7.3, v.y / size * 1.1, v.z / size * 1.1 - seed, 3);
    v.multiplyScalar(1 + 0.28 * n);
    v.y *= squash;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const ROCK_COLORS = ['#8a857d', '#76716b', '#9d978d', '#6c6760'];
const GEM_COLORS = ['#3fb7b0', '#e0a84a', '#6d86b5', '#8a6cc9', '#d8dde6'];

function polyGeometry(kind: number, size: number): THREE.BufferGeometry {
  switch (kind % 4) {
    case 0:
      return new THREE.IcosahedronGeometry(size, 0);
    case 1:
      return new THREE.DodecahedronGeometry(size, 0);
    case 2:
      return new THREE.OctahedronGeometry(size, 0);
    default:
      return new THREE.BoxGeometry(size * 1.3, size * 1.3, size * 1.3);
  }
}

function nearFall(theta: number, width: number): boolean {
  return Math.abs(Math.atan2(Math.sin(theta - WATERFALL_THETA), Math.cos(theta - WATERFALL_THETA))) < width;
}

function cliffDressing(c: Cliff): THREE.Group {
  const rand = rng(5);
  const group = new THREE.Group();
  group.name = 'cliff-dressing';
  const rockBump = bumpTexture(13, 4, 5);
  const rockMats = ROCK_COLORS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, bumpMap: rockBump, bumpScale: 2 }));
  const rings = c.grid.length;
  const cols = c.grid[0].length - 1;
  const at = (k: number, i: number): THREE.Vector3 => c.grid[Math.min(rings - 1, Math.max(0, k))][((i % cols) + cols) % cols];

  // Boulders half-buried in the cliff face.
  for (let n = 0; n < 34; n++) {
    const i = Math.floor(rand() * cols);
    const theta = (i / cols) * Math.PI * 2;
    if (nearFall(theta, 0.28)) continue;
    const k = Math.floor(4 + rand() * rings * 0.7);
    const size = (0.3 + rand() * 0.55) * (1 - (k / rings) * 0.5);
    const rock = new THREE.Mesh(rockGeometry(n, size, 0.7 + rand() * 0.3), rockMats[n % rockMats.length]);
    rock.position.copy(at(k, i));
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    group.add(rock);
  }

  // Faceted "math" crystals, a nod to the polyhedra of the concept art.
  const gemMats = GEM_COLORS.map(
    (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2, flatShading: true }),
  );
  for (let n = 0; n < 14; n++) {
    const i = Math.floor(rand() * cols);
    if (nearFall((i / cols) * Math.PI * 2, 0.3)) continue;
    const k = Math.floor(3 + rand() * rings * 0.45);
    const gem = new THREE.Mesh(polyGeometry(n, 0.28 + rand() * 0.32), gemMats[n % gemMats.length]);
    gem.position.copy(at(k, i));
    gem.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    group.add(gem);
  }

  // Roots dangling from under the turf.
  const roots: THREE.BufferGeometry[] = [];
  for (let n = 0; n < 70; n++) {
    const i = Math.floor(rand() * cols);
    if (nearFall((i / cols) * Math.PI * 2, 0.25)) continue;
    const start = at(1, i);
    const out = new THREE.Vector3(start.x, 0, start.z).normalize();
    const len = 0.4 + rand() * 1.3;
    const curve = new THREE.CatmullRomCurve3([
      start.clone().addScaledVector(out, -0.05),
      start.clone().addScaledVector(out, 0.08).add(new THREE.Vector3(0, -len * 0.4, 0)),
      start.clone().addScaledVector(out, 0.03 + rand() * 0.1).add(new THREE.Vector3((rand() - 0.5) * 0.2, -len, (rand() - 0.5) * 0.2)),
    ]);
    roots.push(new THREE.TubeGeometry(curve, 8, 0.015 + rand() * 0.025, 5, false));
  }
  const rootMesh = new THREE.Mesh(mergeGeometries(roots), new THREE.MeshStandardMaterial({ color: '#3b2a1c', roughness: 1 }));
  rootMesh.name = 'roots';
  group.add(rootMesh);

  // Stalactites under the rounded bottom.
  const bottom = c.grid[rings - 8];
  for (let n = 0; n < 7; n++) {
    const p = bottom[Math.floor(rand() * cols)];
    const h = 0.6 + rand() * 1.1;
    const geo = new THREE.ConeGeometry(0.22 + rand() * 0.2, h, 7, 3);
    geo.rotateX(Math.PI);
    geo.translate(0, -h / 2 + 0.15, 0);
    const s = new THREE.Mesh(geo, rockMats[n % rockMats.length]);
    s.position.copy(p);
    s.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4);
    group.add(s);
  }
  return group;
}

function floatingRocks(ticks: Tick[]): THREE.Group {
  const rand = rng(9);
  const group = new THREE.Group();
  group.name = 'floating-rocks';
  const bump = bumpTexture(17, 4, 5);
  for (let i = 0; i < 11; i++) {
    const theta = rand() * Math.PI * 2;
    if (nearFall(theta, 0.35)) continue;
    const r = 7.6 + rand() * 2.8;
    const size = 0.2 + rand() * 0.4;
    const rock = new THREE.Group();
    rock.add(new THREE.Mesh(rockGeometry(40 + i, size, 0.8), new THREE.MeshStandardMaterial({ color: ROCK_COLORS[i % 4], roughness: 0.9, bumpMap: bump, bumpScale: 2 })));
    if (i % 3 === 0) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.85, size * 0.7, size * 0.25, 12), new THREE.MeshStandardMaterial({ color: '#5f9e36', roughness: 0.9 }));
      cap.position.y = size * 0.55;
      rock.add(cap);
    }
    const baseY = -0.8 - rand() * 4.5;
    rock.position.set(Math.cos(theta) * r, baseY, Math.sin(theta) * r * 0.85);
    const phase = rand() * 10;
    ticks.push((t) => {
      rock.position.y = baseY + Math.sin(t * 0.7 + phase) * 0.25;
      rock.rotation.y = t * 0.15 + phase;
    });
    group.add(rock);
  }
  return group;
}

// ---------------------------------------------------------------- water

function ribbon(width: (u: number) => number, lift: number, lengthRepeat: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  let dist = 0;
  const n = RIVER_SAMPLES.length;
  for (let i = 0; i < n; i++) {
    const prev = RIVER_SAMPLES[Math.max(0, i - 1)];
    const next = RIVER_SAMPLES[Math.min(n - 1, i + 1)];
    const tangent = next.clone().sub(prev).setY(0).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
    if (i > 0) dist += RIVER_SAMPLES[i].distanceTo(RIVER_SAMPLES[i - 1]);
    const w = width(i / (n - 1));
    const l = RIVER_SAMPLES[i].clone().addScaledVector(side, w);
    const r = RIVER_SAMPLES[i].clone().addScaledVector(side, -w);
    const y = WATER_Y[i] + lift;
    positions.push(l.x, y, l.z, r.x, y, r.z);
    uvs.push(0, dist / lengthRepeat, 1, dist / lengthRepeat);
    if (i > 0) {
      const a = (i - 1) * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

function river(ticks: Tick[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'river';
  const normalMap = waterNormalTexture();
  normalMap.repeat.set(1, 1);
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#2f86a8',
    roughness: 0.06,
    metalness: 0,
    normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    transparent: true,
    opacity: 0.8,
    envMapIntensity: 1.4,
  });
  const water = new THREE.Mesh(ribbon((u) => riverHalfWidth(u) + 0.22, 0, 1.6), mat);
  water.name = 'water';
  const pond = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), mat);
  pond.rotation.x = -Math.PI / 2;
  pond.position.copy(RIVER_SAMPLES[0]).setY(WATER_Y[0] + 0.002);
  group.add(water, pond);
  ticks.push((_t, dt) => {
    normalMap.offset.y -= dt * 0.18;
  });
  return group;
}

/** Point on the falling sheet: tau 0 at the lip, 1 at the bottom; lateral -1..1 across. */
function fallPoint(tau: number, lateral: number, out = new THREE.Vector3()): THREE.Vector3 {
  const n = RIVER_SAMPLES.length;
  const lip = RIVER_SAMPLES[n - 1];
  const outward = lip.clone().sub(RIVER_SAMPLES[n - 6]).setY(0).normalize();
  const side = new THREE.Vector3(-outward.z, 0, outward.x);
  const halfW = 0.5 + tau * 0.35;
  return out
    .copy(lip)
    .addScaledVector(outward, 0.1 + 1.3 * tau)
    .addScaledVector(side, lateral * halfW)
    .setY(WATER_Y[n - 1] - FALL_HEIGHT * tau * tau);
}

function sheetGeometry(offset: number): THREE.BufferGeometry {
  const rows = 40;
  const cols = 8;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const p = new THREE.Vector3();
  for (let r = 0; r <= rows; r++) {
    const tau = Math.pow(r / rows, 0.8);
    for (let c = 0; c <= cols; c++) {
      fallPoint(tau, (c / cols) * 2 - 1, p);
      const bow = Math.sin((c / cols) * Math.PI) * 0.12 + offset;
      const n = RIVER_SAMPLES.length;
      const outward = RIVER_SAMPLES[n - 1].clone().sub(RIVER_SAMPLES[n - 6]).setY(0).normalize();
      p.addScaledVector(outward, bow);
      positions.push(p.x, p.y, p.z);
      uvs.push(c / cols, 1 - tau);
      if (r > 0 && c > 0) {
        const a = (r - 1) * (cols + 1) + c - 1;
        const b = a + 1;
        const d = a + cols + 1;
        const e = d + 1;
        index.push(a, d, b, b, d, e);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Sheet of water spilling off the rim, threaded with glowing digits. */
function waterfall(ticks: Tick[]): { model: THREE.Group; fx: THREE.Group } {
  const model = new THREE.Group();
  model.name = 'waterfall';
  const fade = fadeTexture();
  const streaks = waterStreakTexture();
  streaks.repeat.set(1.2, 3);
  const sheet = new THREE.Mesh(
    sheetGeometry(0),
    new THREE.MeshStandardMaterial({
      map: streaks,
      alphaMap: fade,
      color: '#e8f6ff',
      emissive: '#5fb4f0',
      emissiveIntensity: 0.25,
      roughness: 0.2,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  sheet.name = 'water-sheet';
  const digits = digitRainTexture();
  digits.repeat.set(1.4, 2.5);
  const rain = new THREE.Mesh(
    sheetGeometry(0.05),
    new THREE.MeshBasicMaterial({
      map: digits,
      alphaMap: fade,
      color: new THREE.Color(1.6, 2.2, 2.8),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  rain.name = 'digit-rain';
  model.add(sheet, rain);
  ticks.push((_t, dt) => {
    streaks.offset.y += dt * 1.1;
    digits.offset.y += dt * 0.35;
  });

  const fx = new THREE.Group();
  fx.name = 'waterfall-fx';
  const rand = rng(21);
  const digitMats = Array.from({ length: 10 }, (_, i) =>
    new THREE.SpriteMaterial({
      map: glyphTexture(String(i)),
      color: new THREE.Color(1.8, 2.3, 2.8),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const drops: { sprite: THREE.Sprite; tau: number; lateral: number; speed: number }[] = [];
  for (let i = 0; i < 40; i++) {
    const sprite = new THREE.Sprite(digitMats[i % 10].clone());
    const s = 0.2 + rand() * 0.16;
    sprite.scale.set(s, s, s);
    drops.push({ sprite, tau: rand(), lateral: rand() * 2 - 1, speed: 0.12 + rand() * 0.12 });
    fx.add(sprite);
  }
  const dot = softDotTexture();
  const spray: { sprite: THREE.Sprite; base: THREE.Vector3; phase: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false }));
    const tau = 0.05 + rand() * 0.2;
    const base = fallPoint(tau, rand() * 2 - 1).add(new THREE.Vector3(0, 0, 0));
    const s = 0.5 + rand() * 0.7;
    sprite.scale.set(s, s, s);
    sprite.position.copy(base);
    spray.push({ sprite, base, phase: rand() * 10 });
    fx.add(sprite);
  }
  const p = new THREE.Vector3();
  ticks.push((t, dt) => {
    for (const d of drops) {
      d.tau += d.speed * dt * (0.4 + d.tau);
      if (d.tau > 1) d.tau = 0;
      fallPoint(d.tau, d.lateral * 0.9, p);
      d.sprite.position.copy(p);
      d.sprite.material.opacity = Math.min(1, (1 - d.tau) * 1.6);
    }
    for (const s of spray) {
      s.sprite.position.copy(s.base).add(p.set(Math.sin(t + s.phase) * 0.1, Math.sin(t * 1.7 + s.phase) * 0.08, 0));
      s.sprite.material.opacity = 0.2 + 0.12 * Math.sin(t * 2 + s.phase);
    }
  });
  return { model, fx };
}

// ---------------------------------------------------------------- grass & flowers

function bladeClump(rand: () => number): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 5; b++) {
    const w = 0.03 + rand() * 0.015;
    const h = 0.22 + rand() * 0.16;
    const lean = 0.04 + rand() * 0.08;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.6, h * 0.55, lean * 0.4, w * 0.6, h * 0.55, lean * 0.4, 0, h, lean], 3),
    );
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute([0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 1.15, 1.15, 1.15], 3));
    geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    geo.rotateY(rand() * Math.PI * 2);
    geo.translate((rand() - 0.5) * 0.12, 0, (rand() - 0.5) * 0.12);
    blades.push(geo);
  }
  return mergeGeometries(blades);
}

export interface Footprint {
  x: number;
  z: number;
  r: number;
}

/** Ground-contact footprints of the props, so grass does not poke through them. */
export function footprints(root: THREE.Object3D): Footprint[] {
  root.updateMatrixWorld(true);
  const out: Footprint[] = [];
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    box.setFromObject(obj);
    box.getCenter(center);
    if (box.min.y > groundHeight(center.x, center.z) + 0.3) return;
    box.getSize(size);
    out.push({ x: center.x, z: center.z, r: Math.min(1.2, Math.max(size.x, size.z) * 0.45 + 0.05) });
  });
  return out;
}

export interface ScatterOptions {
  grassClumps: number;
  flowers: number;
}

/** Wind-swept grass, wild flowers and pebbles, avoiding the river and prop footprints. */
export function scatter(avoid: Footprint[], opts: ScatterOptions, ticks: Tick[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const rand = rng(17);
  const blocked = (x: number, z: number): boolean => avoid.some((f) => (f.x - x) ** 2 + (f.z - z) ** 2 < f.r * f.r);
  const time = { value: 0 };
  const windMat = (mat: THREE.MeshStandardMaterial, amount: number): THREE.MeshStandardMaterial => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float gust = sin(uTime * 1.7 + root.x * 0.7 + root.z * 0.45) + 0.5 * sin(uTime * 3.1 + root.x * 1.9 - root.z);
        float bend = position.y * position.y * ${amount.toFixed(2)};
        transformed.x += gust * bend;
        transformed.z += gust * bend * 0.6;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;',
        'float faceDirection = 1.0;',
      );
    };
    return mat;
  };

  const grassMat = windMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), 0.9);
  const grass = new THREE.InstancedMesh(bladeClump(rand), grassMat, opts.grassClumps);
  grass.name = 'grass';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  let placed = 0;
  let guard = 0;
  while (placed < opts.grassClumps && guard++ < opts.grassClumps * 8) {
    const x = (rand() * 2 - 1) * RX * 1.1;
    const z = (rand() * 2 - 1) * RZ * 1.1;
    if (rimFraction(x, z) > 0.985) continue;
    if (riverBed(x, z).bed > 0.3 || blocked(x, z)) continue;
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    const s = 0.7 + rand() * 0.8;
    m.compose(new THREE.Vector3(x, groundHeight(x, z) - 0.02, z), q, new THREE.Vector3(s, s * (0.8 + rand() * 0.5), s));
    grass.setMatrixAt(placed, m);
    grass.setColorAt(placed, grassColor(x, z, col).multiplyScalar(1.05 + rand() * 0.2));
    placed++;
  }
  grass.count = placed;
  grass.receiveShadow = true;
  group.add(grass);

  const petals = ['#ffffff', '#ffd84a', '#ff8fb6', '#b99bff', '#ff6b4a'].map(C);
  const flowerGeo = new THREE.IcosahedronGeometry(0.05, 0);
  flowerGeo.translate(0, 0.2, 0);
  const stem = new THREE.CylinderGeometry(0.008, 0.008, 0.2, 3);
  stem.translate(0, 0.1, 0);
  const flowerMesh = new THREE.InstancedMesh(
    mergeGeometries([flowerGeo, stem.toNonIndexed()].map((g) => {
      g.deleteAttribute('uv');
      return g;
    })),
    windMat(new THREE.MeshStandardMaterial({ roughness: 0.6 }), 0.9),
    opts.flowers,
  );
  flowerMesh.name = 'flowers';
  placed = 0;
  guard = 0;
  while (placed < opts.flowers && guard++ < opts.flowers * 20) {
    const x = (rand() * 2 - 1) * RX;
    const z = (rand() * 2 - 1) * RZ;
    if (rimFraction(x, z) > 0.95 || terrainNoise.n2(x * 0.35 + 50, z * 0.35) < 0.15) continue;
    if (riverBed(x, z).bed > 0.2 || blocked(x, z)) continue;
    const s = 0.8 + rand() * 0.5;
    m.compose(new THREE.Vector3(x, groundHeight(x, z), z), q.setFromAxisAngle(up, rand() * 6), new THREE.Vector3(s, s, s));
    flowerMesh.setMatrixAt(placed, m);
    flowerMesh.setColorAt(placed, petals[Math.floor(rand() * petals.length)]);
    placed++;
  }
  flowerMesh.count = placed;
  group.add(flowerMesh);

  const pebbles = new THREE.InstancedMesh(rockGeometry(99, 0.07, 0.6, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 160);
  pebbles.name = 'pebbles';
  placed = 0;
  guard = 0;
  while (placed < 160 && guard++ < 6000) {
    const x = (rand() * 2 - 1) * RX;
    const z = (rand() * 2 - 1) * RZ;
    const { bed } = riverBed(x, z);
    if (bed < 0.3 || bed > 0.85 || rimFraction(x, z) > 0.97) continue;
    const s = 0.6 + rand() * 1.4;
    m.compose(new THREE.Vector3(x, groundHeight(x, z), z), q.setFromAxisAngle(up, rand() * 6), new THREE.Vector3(s, s, s));
    pebbles.setMatrixAt(placed, m);
    pebbles.setColorAt(placed, col.set(ROCK_COLORS[placed % 4]).multiplyScalar(1.2));
    placed++;
  }
  pebbles.count = placed;
  pebbles.castShadow = true;
  pebbles.receiveShadow = true;
  group.add(pebbles);

  ticks.push((t) => {
    time.value = t;
  });
  return group;
}

// ---------------------------------------------------------------- assembly

export interface Island {
  model: THREE.Group;
  fx: THREE.Group;
}

export function buildIsland(ticks: Tick[]): Island {
  const model = new THREE.Group();
  model.name = 'ile-des-maths';
  const c = cliff();
  const fall = waterfall(ticks);
  model.add(terrain(), c.mesh, cliffDressing(c), floatingRocks(ticks), river(ticks), fall.model);
  return { model, fx: fall.fx };
}

/** Drops each prop onto the relief under its footprint, sinking it slightly so it never floats. */
export function settleOnTerrain(props: THREE.Group): void {
  const box = new THREE.Box3();
  const c = new THREE.Vector3();
  for (const child of props.children) {
    box.setFromObject(child);
    box.getCenter(c);
    const hw = Math.min(0.6, (box.max.x - box.min.x) / 2);
    const hd = Math.min(0.6, (box.max.z - box.min.z) / 2);
    const samples = [
      groundHeight(c.x, c.z),
      groundHeight(c.x - hw, c.z),
      groundHeight(c.x + hw, c.z),
      groundHeight(c.x, c.z - hd),
      groundHeight(c.x, c.z + hd),
    ];
    child.position.y += Math.min(...samples) - 0.03;
  }
}
