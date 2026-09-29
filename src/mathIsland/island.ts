import * as THREE from 'three';
import { digitRainTexture, fadeTexture, glyphTexture, rng, waterTexture } from './textures';

export type Tick = (t: number, dt: number) => void;

export const RX = 6.4;
export const RZ = 5.2;
const SLAB = 0.62;
const DEPTH = 7.4;
export const WATERFALL_THETA = 1.9;

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

function grassSlab(): THREE.Mesh {
  const shape = new THREE.Shape();
  const n = 96;
  for (let i = 0; i < n; i++) {
    const p = rimPoint((i / n) * Math.PI * 2);
    if (i === 0) shape.moveTo(p.x, -p.y);
    else shape.lineTo(p.x, -p.y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: SLAB - 0.24,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.14,
    bevelSegments: 3,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -(SLAB - 0.12), 0);
  const top = new THREE.MeshStandardMaterial({ color: '#79c94c', roughness: 0.9 });
  const side = new THREE.MeshStandardMaterial({ color: '#5aa83a', roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, [top, side]);
  mesh.name = 'grass';
  return mesh;
}

/** Scale of the rocky underside at depth fraction t (1 at the top, 0 at the tip). */
function undersideScale(t: number): number {
  return Math.pow(1 - t, 1.2) * (1 - 0.08 * Math.sin(t * Math.PI));
}

function undersidePoint(theta: number, t: number, out = 0): THREE.Vector3 {
  const p = rimPoint(theta, undersideScale(t) + out);
  return new THREE.Vector3(p.x, -SLAB + 0.05 - t * DEPTH, p.y);
}

function underside(): THREE.Mesh {
  const rand = rng(3);
  const rings = 12;
  const segs = 56;
  const tip = new THREE.Vector3(0.5, -SLAB - DEPTH - 0.4, 0.3);
  const grid: THREE.Vector3[][] = [];
  for (let k = 0; k < rings; k++) {
    const t = k / rings;
    const row: THREE.Vector3[] = [];
    for (let i = 0; i < segs; i++) {
      const theta = (i / segs) * Math.PI * 2;
      const jitter = k === 0 ? 0 : (rand() - 0.5) * 0.35 * (1 - t * 0.5);
      const p = undersidePoint(theta, t, k === 0 ? -0.02 : jitter * 0.12);
      p.y += k === 0 ? 0 : (rand() - 0.5) * 0.3;
      p.x += tip.x * t * t;
      p.z += tip.z * t * t;
      row.push(p);
    }
    grid.push(row);
  }
  const positions: number[] = [];
  const colors: number[] = [];
  const palette = ['#8b5a3c', '#7a4e33', '#a06a45', '#6b4430', '#94603f'].map((c) => new THREE.Color(c));
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, depth: number): void => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const col = palette[Math.floor(rand() * palette.length)].clone().multiplyScalar(1 - depth * 0.35);
    for (let v = 0; v < 3; v++) colors.push(col.r, col.g, col.b);
  };
  for (let k = 0; k < rings; k++) {
    const depth = k / rings;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      const a = grid[k][i];
      const b = grid[k][j];
      if (k === rings - 1) {
        pushTri(a, tip, b, depth);
        continue;
      }
      const c = grid[k + 1][i];
      const d = grid[k + 1][j];
      pushTri(a, c, b, depth);
      pushTri(b, c, d, depth);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'underside';
  return mesh;
}

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

const ROCK_COLORS = ['#8e99a6', '#6f7f95', '#9aa7b4', '#5f6b7c', '#b59a72', '#7d8a99'];

function crystals(): THREE.Group {
  const rand = rng(5);
  const group = new THREE.Group();
  group.name = 'crystals';
  const mats = ROCK_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.75 }));
  const place = (theta: number, t: number, size: number): void => {
    const mesh = new THREE.Mesh(polyGeometry(Math.floor(rand() * 4), size), mats[Math.floor(rand() * mats.length)]);
    const p = undersidePoint(theta, t, size * 0.05);
    mesh.position.copy(p);
    mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    group.add(mesh);
  };
  for (let i = 0; i < 34; i++) {
    const theta = rand() * Math.PI * 2;
    const nearFall = Math.abs(Math.atan2(Math.sin(theta - WATERFALL_THETA), Math.cos(theta - WATERFALL_THETA))) < 0.3;
    if (nearFall) continue;
    const t = 0.04 + rand() * 0.6;
    place(theta, t, (0.35 + rand() * 0.6) * (1 - t * 0.6));
  }
  for (let i = 0; i < 12; i++) {
    const theta = (i / 12) * Math.PI * 2 + rand() * 0.3;
    const nearFall = Math.abs(Math.atan2(Math.sin(theta - WATERFALL_THETA), Math.cos(theta - WATERFALL_THETA))) < 0.35;
    if (!nearFall) place(theta, 0.03, 0.55 + rand() * 0.35);
  }
  return group;
}

function floatingRocks(ticks: Tick[]): THREE.Group {
  const rand = rng(9);
  const group = new THREE.Group();
  group.name = 'floating-rocks';
  for (let i = 0; i < 12; i++) {
    const theta = rand() * Math.PI * 2;
    const r = 7 + rand() * 2.5;
    const size = 0.15 + rand() * 0.3;
    const color = ROCK_COLORS[Math.floor(rand() * ROCK_COLORS.length)];
    const mesh = new THREE.Mesh(polyGeometry(i, size), new THREE.MeshStandardMaterial({ color, flatShading: true }));
    const baseY = -0.5 - rand() * 5;
    mesh.position.set(Math.cos(theta) * r, baseY, Math.sin(theta) * r * 0.85);
    const phase = rand() * 10;
    ticks.push((t) => {
      mesh.position.y = baseY + Math.sin(t * 0.9 + phase) * 0.25;
      mesh.rotation.x = t * 0.3 + phase;
      mesh.rotation.y = t * 0.2 + phase;
    });
    group.add(mesh);
  }
  return group;
}

export interface River {
  mesh: THREE.Group;
  /** Sampled centre line, used to keep decorations off the water. */
  samples: THREE.Vector3[];
  /** Where the river spills over the rim, and the outward direction there. */
  lip: THREE.Vector3;
  outward: THREE.Vector3;
}

function ribbon(samples: THREE.Vector3[], width: (u: number) => number, y: number, lengthRepeat: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  let dist = 0;
  for (let i = 0; i < samples.length; i++) {
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    const tangent = next.clone().sub(prev).setY(0).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
    if (i > 0) dist += samples[i].distanceTo(samples[i - 1]);
    const w = width(i / (samples.length - 1)) / 2;
    const l = samples[i].clone().addScaledVector(side, w);
    const r = samples[i].clone().addScaledVector(side, -w);
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

function river(ticks: Tick[]): River {
  const edge = rimPoint(WATERFALL_THETA, 1.02);
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
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  const samples = curve.getSpacedPoints(160);
  const group = new THREE.Group();
  group.name = 'river';

  const width = (u: number): number => 0.55 + u * 0.35;
  const bank = new THREE.Mesh(
    ribbon(samples, (u) => width(u) + 0.35, 0.012, 1),
    new THREE.MeshStandardMaterial({ color: '#b9e0a0', roughness: 1 }),
  );
  const tex = waterTexture();
  const waterMat = new THREE.MeshStandardMaterial({
    map: tex,
    color: '#ffffff',
    emissive: '#2f86d6',
    emissiveIntensity: 0.35,
    roughness: 0.15,
    metalness: 0.05,
  });
  const water = new THREE.Mesh(ribbon(samples, width, 0.03, 2.5), waterMat);
  const spring = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), waterMat);
  spring.rotation.x = -Math.PI / 2;
  spring.position.copy(samples[0]).setY(0.031);
  const springBank = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), bank.material);
  springBank.rotation.x = -Math.PI / 2;
  springBank.position.copy(samples[0]).setY(0.013);
  group.add(bank, water, spring, springBank);
  ticks.push((_t, dt) => {
    tex.offset.y -= dt * 0.35;
  });

  const lip = samples[samples.length - 1].clone();
  const outward = lip.clone().sub(samples[samples.length - 6]).setY(0).normalize();
  return { mesh: group, samples, lip, outward };
}

/** Glowing column of falling digits spilling off the rim. */
function waterfall(r: River, ticks: Tick[]): { model: THREE.Group; fx: THREE.Group } {
  const model = new THREE.Group();
  model.name = 'waterfall';
  const height = 8.5;
  const radius = 0.5;
  const center = r.lip.clone().addScaledVector(r.outward, radius * 0.7);
  const fade = fadeTexture();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.8, height, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#2f8fe0',
      alphaMap: fade,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  body.position.set(center.x, 0.05 - height / 2, center.z);

  const digits = digitRainTexture();
  digits.repeat.set(1.5, 2);
  const rain = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.02, radius * 0.82, height, 24, 1, true),
    new THREE.MeshBasicMaterial({
      map: digits,
      color: new THREE.Color(2.2, 2.6, 3),
      alphaMap: fade,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  rain.position.copy(body.position);

  const lipMesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.9, 0.12, 8, 20, Math.PI),
    new THREE.MeshStandardMaterial({ color: '#7cc8ff', emissive: '#3a9ef0', emissiveIntensity: 0.6, roughness: 0.2 }),
  );
  lipMesh.position.set(center.x, 0.02, center.z);
  lipMesh.lookAt(center.clone().add(r.outward).setY(0.02));
  lipMesh.rotateY(Math.PI / 2);
  model.add(body, rain, lipMesh);
  ticks.push((_t, dt) => {
    digits.offset.y += dt * 0.28;
  });

  const fx = new THREE.Group();
  fx.name = 'digit-sprites';
  const rand = rng(21);
  const mats = Array.from({ length: 10 }, (_, i) =>
    new THREE.SpriteMaterial({
      map: glyphTexture(String(i)),
      color: new THREE.Color(2, 2.4, 2.8),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const drops: { sprite: THREE.Sprite; speed: number }[] = [];
  for (let i = 0; i < 36; i++) {
    const sprite = new THREE.Sprite(mats[i % 10].clone());
    const s = 0.22 + rand() * 0.18;
    sprite.scale.set(s, s, s);
    const a = rand() * Math.PI * 2;
    sprite.position.set(center.x + Math.cos(a) * radius * 1.1, -rand() * height, center.z + Math.sin(a) * radius * 1.1);
    drops.push({ sprite, speed: 1.4 + rand() * 1.6 });
    fx.add(sprite);
  }
  ticks.push((_t, dt) => {
    for (const d of drops) {
      d.sprite.position.y -= d.speed * dt;
      if (d.sprite.position.y < -height) d.sprite.position.y = 0;
      d.sprite.material.opacity = Math.max(0, 1 + d.sprite.position.y / height);
    }
  });
  return { model, fx };
}

function grassTufts(avoid: THREE.Vector3[]): THREE.InstancedMesh {
  const rand = rng(17);
  const geo = new THREE.ConeGeometry(0.06, 0.28, 4);
  geo.translate(0, 0.14, 0);
  const count = 420;
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), count);
  mesh.name = 'grass-tufts';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const shades = ['#5fae3c', '#8ad35a', '#6cc04a', '#a5dc6b'].map((c) => new THREE.Color(c));
  let placed = 0;
  while (placed < count) {
    const x = (rand() * 2 - 1) * RX;
    const z = (rand() * 2 - 1) * RZ;
    if (rimFraction(x, z) > 0.95) continue;
    if (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < 0.75)) continue;
    q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4));
    const s = 0.6 + rand() * 0.8;
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(placed, m);
    mesh.setColorAt(placed, shades[Math.floor(rand() * shades.length)]);
    placed++;
  }
  return mesh;
}

export interface Island {
  model: THREE.Group;
  fx: THREE.Group;
  river: River;
}

export function buildIsland(ticks: Tick[]): Island {
  const model = new THREE.Group();
  model.name = 'ile-des-maths';
  const r = river(ticks);
  const fall = waterfall(r, ticks);
  model.add(grassSlab(), underside(), crystals(), floatingRocks(ticks), r.mesh, fall.model, grassTufts(r.samples));
  return { model, fx: fall.fx, river: r };
}
