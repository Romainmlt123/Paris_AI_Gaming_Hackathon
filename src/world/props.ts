import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL } from './palette';
import { GRASS_Y, HILL_Y, groundHeight, isWalkable, shoreDistance, worldUniforms } from './island';
import { plankTexture, plasterTexture, roofTexture, seeded, signTexture, stoneTexture, stripeTexture } from './textures';
import type { Quality } from './scene';
import { buildGrass } from './grass';
import type { SlotId } from '../state/types';

export interface Collider {
  x: number;
  z: number;
  r: number;
}

export const colliders: Collider[] = [];

const lambert = (opts: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial(opts);

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

/** Texture répétée selon la taille réelle de la face, pour garder une densité de pixels constante. */
function tiled(tex: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  return t;
}

// ---------- Bâtiments ----------
interface HouseSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  wall: 'plank' | 'plaster' | 'stone';
  roof: [string, string];
  rot?: number;
}

function gableRoof(w: number, d: number, rise: number, mat: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  const o = 0.25;
  s.moveTo(-w / 2 - o, 0);
  s.lineTo(0, rise);
  s.lineTo(w / 2 + o, 0);
  s.lineTo(w / 2 + o, -0.1);
  s.lineTo(0, rise - 0.1);
  s.lineTo(-w / 2 - o, -0.1);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: d + 0.4, bevelEnabled: false });
  geo.translate(0, 0, -(d + 0.4) / 2);
  return new THREE.Mesh(geo, mat);
}

function windowMesh(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.42, 0.06),
    lambert({ color: '#ffd27a', emissive: new THREE.Color('#ffb347'), emissiveIntensity: 0.9 }),
  );
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.04), lambert({ color: PAL.woodDark }));
  frame.position.z = -0.02;
  m.add(frame);
  return m;
}

function house(spec: HouseSpec): THREE.Group {
  const g = new THREE.Group();
  const wallTex =
    spec.wall === 'plank' ? plankTexture() : spec.wall === 'stone' ? stoneTexture() : plasterTexture();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(spec.w, spec.h, spec.d),
    lambert({ map: tiled(wallTex, spec.w / 1.2, spec.h / 1.2) }),
  );
  body.position.y = spec.h / 2;
  g.add(body);

  const roofMat = lambert({ map: tiled(roofTexture(spec.roof[0], spec.roof[1]), 1.5, 1.5) });
  const roof = gableRoof(spec.w, spec.d, spec.h * 0.55, roofMat);
  roof.position.y = spec.h;
  g.add(roof);

  // Soubassement en pierre.
  const base = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.12, 0.22, spec.d + 0.12), lambert({ map: tiled(stoneTexture(), 2, 0.3) }));
  base.position.y = 0.11;
  g.add(base);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.95, 0.08), lambert({ map: tiled(plankTexture(PAL.woodDark, '#4a2f1d', PAL.wood), 0.6, 1) }));
  door.position.set(0, 0.5, spec.d / 2 + 0.03);
  g.add(door);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), lambert({ color: '#e8c15a' }));
  knob.position.set(0.18, 0.48, spec.d / 2 + 0.09);
  g.add(knob);

  for (const side of [-1, 1]) {
    const win = windowMesh();
    win.position.set(side * spec.w * 0.3, spec.h * 0.58, spec.d / 2 + 0.04);
    g.add(win);
  }

  g.position.set(spec.x, GRASS_Y, spec.z);
  g.rotation.y = spec.rot ?? 0;
  colliders.push({ x: spec.x, z: spec.z, r: Math.max(spec.w, spec.d) * 0.62 });
  return shadowed(g);
}

function sign(key: string, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Group {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.06), [
    lambert({ color: PAL.woodDark }),
    lambert({ color: PAL.woodDark }),
    lambert({ color: PAL.woodDark }),
    lambert({ color: PAL.woodDark }),
    lambert({ map: signTexture(key, draw) }),
    lambert({ color: PAL.woodDark }),
  ]);
  g.add(board);
  return g;
}

function crate(size: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(size, size, size), lambert({ map: tiled(plankTexture(PAL.woodLight, PAL.wood, '#d9a877'), 1, 1) }));
}

function buildShop(): THREE.Group {
  const g = house({ x: -5, z: 0.2, w: 2.6, d: 2.0, h: 1.6, wall: 'plank', roof: [PAL.roofRed, PAL.roofRedDark] });
  // Auvent rayé + comptoir.
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.06, 1.0), lambert({ map: tiled(stripeTexture('#e0533d', '#f6ead0'), 2, 1) }));
  awning.position.set(0, 1.3, 1.4);
  awning.rotation.x = 0.35;
  g.add(awning);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.5), lambert({ map: tiled(plankTexture(), 2, 0.5) }));
  counter.position.set(-0.1, 0.28, 1.45);
  g.add(counter);
  for (let i = 0; i < 4; i++) {
    const fruit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), lambert({ color: ['#e0533d', '#f2b43c', '#8cc152', '#a0522d'][i] }));
    fruit.position.set(-0.8 + i * 0.5, 0.64, 1.45);
    g.add(fruit);
  }
  const c1 = crate(0.5);
  c1.position.set(1.65, 0.25, 1.1);
  const c2 = crate(0.38);
  c2.position.set(1.6, 0.69, 1.05);
  c2.rotation.y = 0.4;
  g.add(c1, c2);
  const s = sign('coin', (ctx) => {
    ctx.fillStyle = '#e8b33a';
    ctx.fillRect(5, 4, 6, 8);
    ctx.fillRect(4, 5, 8, 6);
    ctx.fillStyle = '#b07f1f';
    ctx.fillRect(7, 6, 2, 4);
  });
  s.position.set(0, 2.05, 1.08);
  g.add(s);
  colliders.push({ x: -5, z: 1.6, r: 1.0 });
  return shadowed(g);
}

function buildBakery(): THREE.Group {
  const g = house({ x: 4.2, z: -2.6, w: 2.8, d: 2.2, h: 1.7, wall: 'plaster', roof: [PAL.roofBlue, PAL.roofBlueDark] });
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), lambert({ map: tiled(stoneTexture(), 0.5, 1) }));
  chimney.position.set(0.8, 2.3, -0.3);
  g.add(chimney);
  const s = sign('bread', (ctx) => {
    ctx.fillStyle = '#d99a4e';
    ctx.fillRect(3, 6, 10, 4);
    ctx.fillRect(4, 5, 8, 6);
    ctx.fillStyle = '#f5d9a0';
    ctx.fillRect(5, 6, 1, 3);
    ctx.fillRect(8, 6, 1, 3);
    ctx.fillRect(11, 6, 1, 3);
  });
  s.position.set(0, 2.1, 1.13);
  g.add(s);
  // Petite terrasse : table ronde + tabouret.
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 10), lambert({ color: PAL.plaster }));
  table.position.set(-1.9, 0.55, 1.2);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 6), lambert({ color: PAL.woodDark }));
  leg.position.set(-1.9, 0.27, 1.2);
  g.add(table, leg);
  return g;
}

function buildCabin(): THREE.Group {
  const g = house({ x: 6.3, z: 4.6, w: 2.0, d: 1.8, h: 1.35, wall: 'plank', roof: [PAL.roofGreen, PAL.roofGreenDark], rot: -0.5 });
  // Filets de pêche et tonneau.
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.55, 10), lambert({ map: tiled(plankTexture(), 1, 0.5) }));
  barrel.position.set(-1.25, 0.28, 0.9);
  g.add(barrel);
  return shadowed(g);
}

function buildTownHall(): THREE.Group {
  const g = house({ x: -6.8, z: -4.2, w: 2.2, d: 1.8, h: 1.9, wall: 'stone', roof: [PAL.roofRed, PAL.roofRedDark], rot: 0.35 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), lambert({ color: '#dddddd' }));
  pole.position.set(0, 3.3, 0);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.02), lambert({ color: '#e8b33a', emissive: new THREE.Color('#553300') }));
  flag.position.set(0.26, 3.85, 0);
  flag.name = 'flag';
  g.add(pole, flag);
  return shadowed(g);
}

function buildPier(): THREE.Group {
  const g = new THREE.Group();
  const plankMat = lambert({ map: tiled(plankTexture(), 1, 0.25) });
  const postMat = lambert({ color: PAL.woodDark });
  const x0 = 1.6;
  for (let i = 0; i < 13; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.38), plankMat);
    p.position.set(x0, 0.38, 8.4 + i * 0.42);
    p.rotation.y = (i % 3 - 1) * 0.02;
    g.add(p);
  }
  for (let i = 0; i < 4; i++) {
    for (const side of [-0.7, 0.7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.3, 0.14), postMat);
      post.position.set(x0 + side, -0.2, 8.6 + i * 1.6);
      g.add(post);
    }
  }
  return shadowed(g);
}

/** Zone du ponton : marchable au-dessus de l'eau. */
export function onPier(x: number, z: number): boolean {
  return x > 0.9 && x < 2.3 && z > 8.0 && z < 13.6;
}

// ---------- Végétation (instanciée) ----------
function windify(mat: THREE.MeshLambertMaterial, amp: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float sway = sin(uTime * 1.6 + ip.x * 0.7 + ip.z * 0.5) * ${amp.toFixed(3)} * max(0.0, position.y);
          transformed.x += sway;
          transformed.z += sway * 0.4;
        }`,
      );
  };
}

function canopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blobs: [number, number, number, number][] = [
    [0, 1.55, 0, 0.78],
    [0.42, 1.3, 0.12, 0.55],
    [-0.38, 1.35, -0.1, 0.58],
    [0.05, 1.95, -0.05, 0.5],
  ];
  for (const [x, y, z, r] of blobs) {
    const s = new THREE.IcosahedronGeometry(r, 1);
    s.translate(x, y, z);
    parts.push(s);
  }
  const geo = mergeGeometries(parts);
  if (!geo) throw new Error('Fusion de la canopée impossible');
  // Dégradé de couleur vertical : bas sombre, haut lumineux.
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const dark = new THREE.Color(PAL.leafDark);
  const light = new THREE.Color(PAL.leafLight);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - 0.8) / 1.6, 0, 1);
    c.copy(dark).lerp(light, t);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export interface TreeInfo {
  x: number;
  z: number;
  y: number;
  scale: number;
  fruit: 'pomme' | 'figue';
}
/** Canopées instanciées (raycast pour secouer un arbre, animation de secousse). */
export const treeMeshes: { canopies: THREE.InstancedMesh | null; fruits: THREE.InstancedMesh | null } = { canopies: null, fruits: null };
export const trees: TreeInfo[] = [];

function scatterTrees(scene: THREE.Scene): void {
  const spots: [number, number, 'pomme' | 'figue'][] = [
    [-8.2, 1.5, 'pomme'], [-7.5, 4.5, 'figue'], [-3.2, -3.4, 'pomme'], [7.6, -0.5, 'figue'], [8.0, -4.2, 'pomme'],
    [1.2, -3.6, 'figue'], [-2.4, 4.4, 'pomme'], [-5.6, 6.2, 'pomme'], [3.5, -7.6, 'figue'], [-4.8, -8.3, 'pomme'],
    [6.4, -6.8, 'pomme'], [-9.4, -1.8, 'figue'], [0.4, -9.5, 'pomme'],
  ];
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.16, 1.2, 6);
  trunkGeo.translate(0, 0.6, 0);
  const trunkMat = lambert({ color: PAL.trunk });
  const canopyMat = lambert({ vertexColors: true, color: '#ffffff' });
  windify(canopyMat, 0.05);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const canopies = new THREE.InstancedMesh(canopyGeometry(), canopyMat, spots.length);
  const fruitGeo = new THREE.SphereGeometry(0.09, 6, 4);
  const fruits = new THREE.InstancedMesh(fruitGeo, lambert({ color: '#ffffff' }), spots.length * 3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const rnd = seeded(42);
  let fi = 0;
  spots.forEach(([x, z, fruit], i) => {
    const onHill = Math.hypot(x + 1.5, z + 6.2) < 3.4;
    const y = onHill ? HILL_Y : groundHeight(x, z);
    const s = 0.85 + rnd() * 0.35;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m);
    canopies.setMatrixAt(i, m);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + rnd();
      m.compose(new THREE.Vector3(x + Math.cos(a) * 0.62 * s, y + 1.25 * s, z + Math.sin(a) * 0.62 * s), q, new THREE.Vector3(1, 1, 1));
      fruits.setMatrixAt(fi, m);
      fruits.setColorAt(fi, new THREE.Color(fruit === 'pomme' ? '#e0412f' : '#7b3f8c'));
      fi++;
    }
    trees.push({ x, z, y, scale: s, fruit });
    if (!onHill) colliders.push({ x, z, r: 0.45 });
  });
  treeMeshes.canopies = canopies;
  treeMeshes.fruits = fruits;
  for (const im of [trunks, canopies, fruits]) {
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
  }
}

function scatterTufts(scene: THREE.Scene, quality: Quality): void {
  const count = quality === 'high' ? 520 : quality === 'medium' ? 320 : 150;
  const blade = new THREE.ConeGeometry(0.06, 0.32, 3);
  blade.translate(0, 0.16, 0);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const b = blade.clone();
    b.rotateZ((i - 1) * 0.35);
    b.translate((i - 1) * 0.06, 0, 0);
    parts.push(b);
  }
  const geo = mergeGeometries(parts);
  if (!geo) throw new Error('Fusion des touffes impossible');
  const mat = lambert({ color: '#ffffff' });
  windify(mat, 0.25);
  const im = new THREE.InstancedMesh(geo, mat, count);
  const flowers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), lambert({ color: '#ffffff' }), Math.floor(count / 7));
  const rnd = seeded(7);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tuftColors = [PAL.grassDark, PAL.grass, PAL.grassLight, PAL.leaf].map((c) => new THREE.Color(c));
  const flowerColors = ['#ffffff', '#ffd23f', '#ff7aa2', '#b58cff'].map((c) => new THREE.Color(c));
  let placed = 0;
  let fl = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 20) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 10;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!isWalkable(x, z) || groundHeight(x, z) < GRASS_Y - 0.01) continue;
    if (colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.2)) continue;
    const s = 0.7 + rnd() * 0.7;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
    m.compose(new THREE.Vector3(x, GRASS_Y, z), q, new THREE.Vector3(s, s, s));
    im.setMatrixAt(placed, m);
    im.setColorAt(placed, tuftColors[Math.floor(rnd() * tuftColors.length)]!);
    if (fl < flowers.count && rnd() < 0.22) {
      m.compose(new THREE.Vector3(x + 0.1, GRASS_Y + 0.3 + 0.12 * s, z), q, new THREE.Vector3(1.1, 0.8, 1.1));
      flowers.setMatrixAt(fl, m);
      flowers.setColorAt(fl, flowerColors[Math.floor(rnd() * flowerColors.length)]!);
      fl++;
    }
    placed++;
  }
  // Les touffes ne servent plus qu'à placer les fleurs : l'herbe dense est dans grass.ts.
  im.dispose();
  flowers.count = fl;
  flowers.castShadow = true;
  scene.add(flowers);
}

function scatterRocks(scene: THREE.Scene): void {
  const geo = new THREE.DodecahedronGeometry(0.4, 0);
  const mat = lambert({ color: PAL.stone, flatShading: true });
  const spots: [number, number, number][] = [
    [-9.5, 5.5, 1.1], [9.8, 2.8, 0.9], [-3.8, 10.4, 0.7], [10.2, -5.5, 1.3], [-10.8, -4.5, 1.0], [5.2, 9.4, 0.6], [-1.2, -11.2, 1.2],
  ];
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  const rnd = seeded(9);
  spots.forEach(([x, z, s], i) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(), rnd() * 3, rnd()));
    m.compose(new THREE.Vector3(x, groundHeight(x, z) + 0.1 * s - (shoreDistance(x, z) > 0 ? 0.2 : 0), z), q, new THREE.Vector3(s, s * 0.7, s));
    im.setMatrixAt(i, m);
    colliders.push({ x, z, r: 0.45 * s });
  });
  im.castShadow = true;
  im.receiveShadow = true;
  scene.add(im);
}

/** Dalles du chemin (l'herbe les évite). */
export const pathStones: [number, number][] = [];

// ---------- Emplacements de décoration ----------
export const SLOT_POSITIONS: Record<SlotId, { x: number; z: number; y: number; label: string }> = {
  placette: { x: 0, z: 1.2, y: GRASS_Y, label: 'Placette' },
  falaise: { x: -1.5, z: -6.2, y: HILL_Y, label: 'Bord de falaise' },
  ponton: { x: 3.1, z: 7.4, y: GRASS_Y, label: 'Entrée du ponton' },
  mairie: { x: -5.2, z: -2.6, y: GRASS_Y, label: 'Jardin de la mairie' },
  plage: { x: -4.5, z: 8.6, y: 0.2, label: 'Plage' },
  verger: { x: 6.8, z: -2.2, y: GRASS_Y, label: 'Verger' },
};

export function buildProps(scene: THREE.Scene, quality: Quality): { flag: THREE.Object3D | null } {
  colliders.length = 0;
  trees.length = 0;
  scene.add(buildShop(), buildBakery(), buildCabin(), buildPier());
  const hall = buildTownHall();
  scene.add(hall);
  scatterTrees(scene);
  scatterRocks(scene);
  scatterTufts(scene, quality);
  // Chemin de dalles entre la placette et les maisons.
  pathStones.length = 0;
  const pathMat = lambert({ color: PAL.sandDark });
  const pathGeo = new THREE.CylinderGeometry(0.28, 0.3, 0.05, 7);
  const stones = pathStones;
  const line = (ax: number, az: number, bx: number, bz: number, n: number): void => {
    for (let i = 0; i <= n; i++) stones.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]);
  };
  line(0, 1.2, -4.6, 2.2, 6);
  line(0, 1.2, 3.8, -1.2, 6);
  line(0, 1.2, 1.6, 7.6, 8);
  const path = new THREE.InstancedMesh(pathGeo, pathMat, stones.length);
  const m = new THREE.Matrix4();
  const rnd = seeded(3);
  stones.forEach(([x, z], i) => {
    m.makeRotationY(rnd() * 3);
    m.setPosition(x + (rnd() - 0.5) * 0.2, GRASS_Y + 0.01, z + (rnd() - 0.5) * 0.2);
    path.setMatrixAt(i, m);
  });
  path.receiveShadow = true;
  scene.add(path);
  buildGrass(scene, quality);
  return { flag: hall.getObjectByName('flag') ?? null };
}
