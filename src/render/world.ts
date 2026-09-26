import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BUILDINGS, GROUND, GROUND_HEIGHT, H, NPC_HOME, ROCKS, SLOTS, TREES, W, groundAt, tileToWorld, walkable, worldToTile, type Ground } from '../data/island.ts';
import type { GameState, NpcId, SlotId } from '../state/types.ts';
import { NPC_IDS } from '../state/types.ts';
import { makeRng } from '../logic/rng.ts';
import { building, decor, glowMaterials, pickup, rock, tree, type TreeMesh } from './props.ts';
import { sheet, type SpriteId } from './sprites.ts';

export type Quality = 'high' | 'medium' | 'low';
export type Target =
  | { kind: 'ground'; i: number; j: number }
  | { kind: 'water'; i: number; j: number }
  | { kind: 'npc'; id: NpcId }
  | { kind: 'tree'; id: string }
  | { kind: 'pickup'; id: string }
  | { kind: 'animal'; id: string }
  | { kind: 'slot'; id: SlotId }
  | { kind: 'butterfly'; id: number };

const PIX = 0.072;
const CAM_ANGLE = THREE.MathUtils.degToRad(48);
const CAM_DIST = 30;

export function heightAt(x: number, z: number): number {
  const t = worldToTile(x, z);
  const g = groundAt(t.i, t.j);
  return g === 'water' ? GROUND_HEIGHT.sand : GROUND_HEIGHT[g];
}

class Actor {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly tex: THREE.CanvasTexture;
  readonly mat: THREE.MeshBasicMaterial;
  frames: number;
  path: THREE.Vector3[] = [];
  onArrive: (() => void) | null = null;
  speed = 3.2;
  t = Math.random() * 10;
  facing = 1;
  marker: THREE.Mesh | null = null;

  constructor(id: SpriteId, private readonly depth: boolean) {
    const s = sheet(id);
    this.frames = s.frames;
    this.tex = new THREE.CanvasTexture(s.canvas);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.repeat.set(1 / s.frames, 1);
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(s.w * PIX, s.h * PIX);
    geo.translate(0, (s.h * PIX) / 2 - PIX, 0);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.rotation.x = -0.32;
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5 });
    this.group.add(this.mesh);
    const blob = new THREE.Mesh(new THREE.CircleGeometry(s.w * PIX * 0.32, 16), new THREE.MeshBasicMaterial({ color: '#1d2a22', transparent: true, opacity: 0.28, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.015;
    this.group.add(blob);
  }

  setSprite(id: SpriteId): void {
    const s = sheet(id);
    this.tex.image = s.canvas;
    this.tex.needsUpdate = true;
  }

  get pos(): THREE.Vector3 {
    return this.group.position;
  }

  update(dt: number): void {
    this.t += dt;
    let moving = false;
    const next = this.path[0];
    if (next) {
      const d = new THREE.Vector3(next.x - this.pos.x, 0, next.z - this.pos.z);
      const len = d.length();
      const step = this.speed * dt;
      if (len <= step) {
        this.pos.x = next.x;
        this.pos.z = next.z;
        this.path.shift();
        if (this.path.length === 0) {
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        d.multiplyScalar(step / len);
        this.pos.x += d.x;
        this.pos.z += d.z;
        if (Math.abs(d.x) > 0.001) this.facing = d.x < 0 ? -1 : 1;
      }
      moving = true;
    }
    const hy = heightAt(this.pos.x, this.pos.z);
    this.pos.y += (hy - this.pos.y) * Math.min(1, dt * 14);
    this.mesh.scale.x = this.facing;
    const frame = this.frames >= 4 ? (moving ? 2 + (Math.floor(this.t * 8) % 2) : Math.floor(this.t * 1.6) % 2) : Math.floor(this.t * (moving ? 8 : 2)) % this.frames;
    this.tex.offset.x = frame / this.frames;
    if (this.marker) {
      this.marker.position.y = 1.95 + Math.sin(this.t * 5) * 0.08;
    }
    void this.depth;
  }
}

interface Palette {
  h: number;
  sun: string;
  sunI: number;
  elev: number;
  sky: string;
  ground: string;
  hemiI: number;
  bg: string;
  tint: string;
  glow: number;
  water: string;
}
const PALETTES: Palette[] = [
  { h: 0, sun: '#7f9cff', sunI: 0.5, elev: 50, sky: '#3a4f8a', ground: '#1c2a3a', hemiI: 0.55, bg: '#1b2640', tint: '#8fa2d6', glow: 2.2, water: '#1f4f78' },
  { h: 5.5, sun: '#8fa5ff', sunI: 0.6, elev: 20, sky: '#4a5c96', ground: '#223040', hemiI: 0.6, bg: '#2a3458', tint: '#9aa8d8', glow: 2, water: '#24567e' },
  { h: 7, sun: '#ffb39a', sunI: 1.6, elev: 18, sky: '#ffc9c2', ground: '#6b7a5a', hemiI: 0.8, bg: '#f5c6c0', tint: '#ffe3dc', glow: 0.4, water: '#4aa0c0' },
  { h: 10, sun: '#fff1d6', sunI: 2.6, elev: 55, sky: '#dff1ff', ground: '#7d9a62', hemiI: 1.0, bg: '#bfe3f2', tint: '#ffffff', glow: 0, water: '#3fb2c6' },
  { h: 15, sun: '#ffd79a', sunI: 2.6, elev: 40, sky: '#ffe6c0', ground: '#8a9a60', hemiI: 1.15, bg: '#f6dcb2', tint: '#fff6e6', glow: 0, water: '#3aa8bd' },
  { h: 17.5, sun: '#ffb466', sunI: 2.8, elev: 26, sky: '#ffd8a0', ground: '#9a8a5a', hemiI: 1.15, bg: '#f7c58f', tint: '#ffe6c4', glow: 0.5, water: '#3b9fb4' },
  { h: 19.5, sun: '#ff7f5c', sunI: 1.7, elev: 10, sky: '#f59f8f', ground: '#5a5048', hemiI: 0.7, bg: '#e98b7a', tint: '#ffcdb8', glow: 1.4, water: '#3b7ea0' },
  { h: 21, sun: '#8a96ff', sunI: 0.6, elev: 40, sky: '#3c4d8c', ground: '#1f2b3c', hemiI: 0.55, bg: '#212c4c', tint: '#93a4dc', glow: 2.2, water: '#20507a' },
  { h: 24, sun: '#7f9cff', sunI: 0.5, elev: 50, sky: '#3a4f8a', ground: '#1c2a3a', hemiI: 0.55, bg: '#1b2640', tint: '#8fa2d6', glow: 2.2, water: '#1f4f78' },
];

function palette(hour: number): { p: Palette; next: Palette; k: number } {
  const h = ((hour % 24) + 24) % 24;
  for (let n = 0; n < PALETTES.length - 1; n++) {
    const a = PALETTES[n];
    const b = PALETTES[n + 1];
    if (a && b && h >= a.h && h <= b.h) return { p: a, next: b, k: (h - a.h) / Math.max(0.001, b.h - a.h) };
  }
  const f = PALETTES[0] as Palette;
  return { p: f, next: f, k: 0 };
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 1, 160);
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private readonly sun = new THREE.DirectionalLight('#ffc98a', 2.4);
  private readonly hemi = new THREE.HemisphereLight('#ffe9c9', '#6b8a5a', 0.9);
  private readonly clock = new THREE.Clock();
  private readonly camTarget = new THREE.Vector3();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly terrain: THREE.InstancedMesh[] = [];
  private readonly water: THREE.Mesh;
  private readonly waterTex: THREE.CanvasTexture;
  private readonly foam: THREE.InstancedMesh;
  private readonly grass: THREE.InstancedMesh[] = [];
  readonly player: Actor;
  readonly npcs: Record<NpcId, Actor>;
  private readonly animals = new Map<string, Actor>();
  private readonly trees = new Map<string, TreeMesh & { shake: number }>();
  private readonly pickupObjs = new Map<string, THREE.Group>();
  private readonly decorObjs = new Map<SlotId, { id: string; obj: THREE.Group; light: THREE.PointLight | null }>();
  private readonly slotMarkers = new Map<SlotId, THREE.Mesh>();
  private readonly butterflies: { actor: Actor; base: THREE.Vector3; phase: number; alive: boolean; id: number }[] = [];
  private readonly effects: { obj: THREE.Object3D; t: number; life: number; update: (o: THREE.Object3D, k: number) => void }[] = [];
  private bobber: THREE.Group | null = null;
  private bees: THREE.Points | null = null;
  quality: Quality = 'high';
  hour = 9;
  decorMode = false;
  private fpsAcc = { t: 0, n: 0, checked: false };
  onTap: (t: Target) => void = () => undefined;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.fog = new THREE.Fog('#f7c58f', 38, 70);
    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -17;
    sc.right = 17;
    sc.top = 19;
    sc.bottom = -19;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    this.buildTerrain();
    const w = this.buildWater();
    this.water = w.mesh;
    this.waterTex = w.tex;
    this.foam = this.buildFoam();
    this.buildGrass();
    this.buildStatic();

    this.player = new Actor('player', true);
    this.scene.add(this.player.group);
    this.npcs = Object.fromEntries(
      NPC_IDS.map((id) => {
        const a = new Actor(id, true);
        a.speed = 1.8;
        const home = NPC_HOME[id];
        const p = tileToWorld(home.i, home.j);
        a.pos.set(p.x, heightAt(p.x, p.z), p.z);
        a.mesh.userData.target = { kind: 'npc', id } satisfies Target;
        this.pickables.push(a.mesh);
        const marker = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.72), new THREE.MeshBasicMaterial({ map: this.markerTex(), alphaTest: 0.5, side: THREE.DoubleSide }));
        marker.rotation.x = -0.5;
        marker.visible = false;
        a.marker = marker;
        a.group.add(marker);
        this.scene.add(a.group);
        return [id, a];
      }),
    ) as Record<NpcId, Actor>;
    this.buildButterflies();

    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    canvas.addEventListener('pointerup', (e) => this.pointerUp(e));
    window.addEventListener('resize', () => this.resize());
    this.setQuality(this.pickQuality());
    this.resize();
  }

  private markerTex(): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(sheet('bang').canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private pickQuality(): Quality {
    const saved = localStorage.getItem('ragots-quality');
    if (saved === 'high' || saved === 'medium' || saved === 'low') return saved;
    return 'high';
  }

  setQuality(q: Quality): void {
    this.quality = q;
    localStorage.setItem('ragots-quality', q);
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.Material) o.material.needsUpdate = true;
    });
    for (const g of this.grass) g.visible = q !== 'low';
    if (q === 'high') {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } else {
      this.composer?.dispose();
      this.composer = null;
      this.bloom = null;
    }
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.fov = w / h > 1 ? 30 : 40;
    this.camera.updateProjectionMatrix();
  }

  private buildTerrain(): void {
    const byType = new Map<Ground, number[]>();
    GROUND.forEach((g, k) => {
      if (g === 'water' || g === 'dock') return;
      const list = byType.get(g) ?? [];
      list.push(k);
      byType.set(g, list);
    });
    const colors: Record<string, { top: string; side: string }> = {
      sand: { top: '#efdcab', side: '#d9bf86' },
      grass: { top: '#8fc76b', side: '#8a6a4a' },
      plateau: { top: '#98cc72', side: '#a89274' },
      stairs: { top: '#c9bca6', side: '#a89274' },
    };
    const rng = makeRng(42);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    for (const [g, list] of byType) {
      const c = colors[g];
      if (!c) continue;
      const top = GROUND_HEIGHT[g];
      const depth = top + 0.8;
      const geo = new THREE.BoxGeometry(1, depth, 1);
      const side = new THREE.MeshStandardMaterial({ color: c.side, roughness: 0.95 });
      const topM = new THREE.MeshStandardMaterial({ color: c.top, roughness: 0.95 });
      const im = new THREE.InstancedMesh(geo, [side, side, topM, side, side, side], list.length);
      im.receiveShadow = true;
      im.castShadow = true;
      list.forEach((k, n) => {
        const i = k % W;
        const j = Math.floor(k / W);
        const p = tileToWorld(i, j);
        let y = top - depth / 2;
        if (g === 'stairs') y -= 0;
        m4.makeTranslation(p.x, y, p.z);
        im.setMatrixAt(n, m4);
        const v = 0.94 + rng() * 0.1;
        col.setRGB(v, v, v * (0.97 + rng() * 0.05));
        im.setColorAt(n, col);
      });
      im.userData.tiles = list;
      this.terrain.push(im);
      this.scene.add(im);
    }
    // marches de l'escalier
    for (const [i, j] of [[10, 11], [11, 11]] as const) {
      const p = tileToWorld(i, j);
      for (let s = 0; s < 3; s++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(1, 0.18, 0.33), new THREE.MeshStandardMaterial({ color: '#d8ccb6', roughness: 0.9 }));
        step.position.set(p.x, GROUND_HEIGHT.stairs + 0.09 + s * 0.14 - 0.3, p.z + 0.33 - s * 0.33);
        step.castShadow = true;
        step.receiveShadow = true;
        this.scene.add(step);
      }
    }
    // ponton
    const wood = new THREE.MeshStandardMaterial({ color: '#b08457', roughness: 0.9 });
    for (let i = 0; i < W; i++) {
      if (groundAt(i, 19) !== 'dock') continue;
      const p = tileToWorld(i, 19);
      for (let s = 0; s < 3; s++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 1.1), wood);
        plank.position.set(p.x - 0.33 + s * 0.33, GROUND_HEIGHT.dock - 0.04, p.z);
        plank.castShadow = true;
        plank.receiveShadow = true;
        this.scene.add(plank);
      }
      for (const dz of [-0.5, 0.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), wood);
        post.position.set(p.x + 0.4, 0, p.z + dz);
        this.scene.add(post);
      }
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(p.x, GROUND_HEIGHT.dock, p.z);
      hit.userData.target = { kind: 'ground', i, j: 19 } satisfies Target;
      this.scene.add(hit);
      this.terrainHits.push(hit);
    }
  }
  private readonly terrainHits: THREE.Object3D[] = [];

  private buildWater(): { mesh: THREE.Mesh; tex: THREE.CanvasTexture } {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const rng = makeRng(3);
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 128, 128);
      for (let k = 0; k < 60; k++) {
        ctx.strokeStyle = `rgba(160,220,235,${0.3 + rng() * 0.4})`;
        ctx.lineWidth = 1 + rng() * 2;
        ctx.beginPath();
        const x = rng() * 128;
        const y = rng() * 128;
        ctx.ellipse(x, y, 6 + rng() * 10, 2 + rng() * 3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 14);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: '#3aa8bd', map: tex, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.9 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.06;
    m.receiveShadow = true;
    m.userData.water = true;
    this.scene.add(m);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ color: '#1f6f84' }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.6;
    this.scene.add(floor);
    return { mesh: m, tex };
  }

  private buildFoam(): THREE.InstancedMesh {
    const tiles: [number, number][] = [];
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        if (groundAt(i, j) !== 'water') continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const g = groundAt(i + (a ?? 0), j + (b ?? 0)); return g !== 'water' && g !== 'dock'; })) tiles.push([i, j]);
      }
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }), tiles.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    tiles.forEach(([i, j], n) => {
      const p = tileToWorld(i, j);
      m4.compose(new THREE.Vector3(p.x, 0.08, p.z), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(n, m4);
    });
    this.scene.add(im);
    return im;
  }

  private buildGrass(): void {
    const rng = makeRng(11);
    const blades: THREE.Matrix4[] = [];
    const flowers: { m: THREE.Matrix4; c: string }[] = [];
    const fc = ['#ff8fb1', '#ffffff', '#ffd166', '#c77dff'];
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const g = groundAt(i, j);
        if ((g !== 'grass' && g !== 'plateau') || !walkable(i, j)) continue;
        const p = tileToWorld(i, j);
        const y = GROUND_HEIGHT[g];
        const n = 3;
        for (let k = 0; k < n; k++) {
          const m = new THREE.Matrix4().compose(
            new THREE.Vector3(p.x + (rng() - 0.5) * 0.9, y + 0.08, p.z + (rng() - 0.5) * 0.9),
            new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4)),
            new THREE.Vector3(1, 0.7 + rng() * 0.8, 1),
          );
          blades.push(m);
        }
        if (rng() < 0.18) flowers.push({ m: new THREE.Matrix4().makeTranslation(p.x + (rng() - 0.5) * 0.8, y + 0.07, p.z + (rng() - 0.5) * 0.8), c: fc[Math.floor(rng() * fc.length)] ?? '#fff' });
      }
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#6fae4f', roughness: 1 });
    const im = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.22, 3), bladeMat, blades.length);
    blades.forEach((m, n) => im.setMatrixAt(n, m));
    im.receiveShadow = true;
    this.scene.add(im);
    this.grass.push(im);
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshStandardMaterial({ roughness: 0.7 }), flowers.length);
    flowers.forEach((f, n) => {
      fl.setMatrixAt(n, f.m);
      fl.setColorAt(n, new THREE.Color(f.c));
    });
    this.scene.add(fl);
    this.grass.push(fl);
  }

  private buildStatic(): void {
    for (const b of BUILDINGS) {
      const g = building(b.kind, b.w, b.d);
      const p = tileToWorld(b.i, b.j);
      const top = GROUND_HEIGHT[groundAt(b.i, b.j)];
      g.position.set(p.x + (b.w - 1) / 2, top, p.z + (b.d - 1) / 2);
      if (b.kind === 'enclos') this.buildAnimals(g.position);
      this.scene.add(g);
    }
    TREES.forEach((t, n) => {
      const tm = tree(t.fruit, n);
      const p = tileToWorld(t.i, t.j);
      tm.group.position.set(p.x, GROUND_HEIGHT[groundAt(t.i, t.j)], p.z);
      tm.group.scale.setScalar(1.1 + (n % 3) * 0.08);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.2, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 1.1;
      hit.userData.target = { kind: 'tree', id: t.id } satisfies Target;
      tm.group.add(hit);
      this.pickables.push(hit);
      this.trees.set(t.id, { ...tm, shake: 0 });
      this.scene.add(tm.group);
    });
    for (const r of ROCKS) {
      const m = rock(r.s);
      const p = tileToWorld(r.i, r.j);
      m.position.x = p.x;
      m.position.z = p.z;
      m.position.y += GROUND_HEIGHT[groundAt(r.i, r.j)];
      this.scene.add(m);
    }
    for (const s of SLOTS) {
      const p = tileToWorld(s.i, s.j);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24), new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 0.55, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, GROUND_HEIGHT[groundAt(s.i, s.j)] + 0.02, p.z);
      ring.userData.target = { kind: 'slot', id: s.id } satisfies Target;
      this.scene.add(ring);
      this.slotMarkers.set(s.id, ring);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(p.x, ring.position.y + 0.7, p.z);
      hit.userData.target = { kind: 'slot', id: s.id } satisfies Target;
      hit.userData.slotHit = true;
      this.scene.add(hit);
      this.pickables.push(hit);
    }
  }

  private buildAnimals(center: THREE.Vector3): void {
    const defs: [string, SpriteId, number][] = [['a1', 'dodo', -0.7], ['a2', 'mouton', 0.8]];
    for (const [id, sprite, dx] of defs) {
      const a = new Actor(sprite, true);
      a.speed = 0.6;
      a.pos.set(center.x + dx, center.y, center.z + 0.2);
      a.mesh.userData.target = { kind: 'animal', id } satisfies Target;
      a.mesh.userData.home = new THREE.Vector3(center.x + dx, center.y, center.z + 0.2);
      this.pickables.push(a.mesh);
      this.animals.set(id, a);
      this.scene.add(a.group);
    }
  }

  private buildButterflies(): void {
    const spots = [[8, 17], [13, 21], [16, 9], [6, 9]] as const;
    spots.forEach(([i, j], n) => {
      const a = new Actor('butterfly', false);
      const p = tileToWorld(i, j);
      a.mesh.userData.target = { kind: 'butterfly', id: n } satisfies Target;
      const base = new THREE.Vector3(p.x, GROUND_HEIGHT.grass + 0.9, p.z);
      a.pos.copy(base);
      a.group.children[1]?.removeFromParent();
      a.mesh.scale.setScalar(1.3);
      this.pickables.push(a.mesh);
      this.butterflies.push({ actor: a, base, phase: n * 1.7, alive: true, id: n });
      this.scene.add(a.group);
    });
  }

  catchButterfly(id: number): void {
    const b = this.butterflies.find((x) => x.id === id);
    if (!b) return;
    b.alive = false;
    b.actor.group.visible = false;
    window.setTimeout(() => {
      b.alive = true;
      b.actor.group.visible = true;
    }, 45000);
  }

  butterflyPos(id: number): THREE.Vector3 | null {
    return this.butterflies.find((x) => x.id === id)?.actor.pos.clone() ?? null;
  }

  // ---------- Synchronisation avec l'état ----------
  sync(state: GameState): void {
    this.hour = state.hour;
    for (const t of state.trees) {
      const tm = this.trees.get(t.id);
      if (!tm) continue;
      tm.fruits.forEach((f, n) => (f.visible = n < t.fruits));
      tm.hive.visible = t.hive;
    }
    const seen = new Set<string>();
    for (const p of state.pickups) {
      seen.add(p.id);
      if (this.pickupObjs.has(p.id)) continue;
      const g = pickup(p.itemId);
      g.position.set(p.x, heightAt(p.x, p.z), p.z);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.target = { kind: 'pickup', id: p.id } satisfies Target;
      g.add(hit);
      this.pickables.push(hit);
      this.pickupObjs.set(p.id, g);
      this.scene.add(g);
    }
    for (const [id, g] of this.pickupObjs) {
      if (seen.has(id)) continue;
      g.removeFromParent();
      const idx = this.pickables.findIndex((o) => o.parent === g);
      if (idx >= 0) this.pickables.splice(idx, 1);
      this.pickupObjs.delete(id);
    }
    for (const s of SLOTS) {
      const want = state.decor[s.id];
      const cur = this.decorObjs.get(s.id);
      if (cur?.id === want) continue;
      if (cur) {
        cur.obj.removeFromParent();
        this.decorObjs.delete(s.id);
      }
      if (want) {
        const obj = decor(want);
        const p = tileToWorld(s.i, s.j);
        obj.position.set(p.x, GROUND_HEIGHT[groundAt(s.i, s.j)], p.z);
        let light: THREE.PointLight | null = null;
        if (typeof obj.userData.light === 'number') {
          light = new THREE.PointLight('#ffc46b', 0, 5, 1.6);
          light.position.y = obj.userData.light;
          obj.add(light);
        }
        this.decorObjs.set(s.id, { id: want, obj, light });
        this.scene.add(obj);
        this.puff(obj.position);
      }
    }
    for (const [id, m] of this.slotMarkers) m.visible = this.decorMode || !state.decor[id];
    for (const id of NPC_IDS) {
      const a = this.npcs[id];
      if (a.marker) a.marker.visible = state.npcs[id].intent !== null;
    }
    this.player.setSprite(state.player.stungUntilDay !== null ? 'player_stung' : 'player');
    for (const a of state.animals) {
      const act = this.animals.get(a.id);
      if (act) act.speed = a.lastFedDay >= state.day ? 0.9 : 0.35;
    }
  }

  setDecorMode(on: boolean): void {
    this.decorMode = on;
    for (const [, m] of this.slotMarkers) {
      m.visible = true;
      (m.material as THREE.MeshBasicMaterial).opacity = on ? 0.95 : 0.55;
      (m.material as THREE.MeshBasicMaterial).color.set(on ? '#ffd166' : '#fff6d8');
    }
  }

  // ---------- Déplacements ----------
  walk(actor: Actor, tiles: { i: number; j: number }[], onArrive: () => void): void {
    actor.path = tiles.map((t) => {
      const p = tileToWorld(t.i, t.j);
      return new THREE.Vector3(p.x, 0, p.z);
    });
    actor.onArrive = onArrive;
    if (tiles.length === 0) {
      actor.onArrive = null;
      onArrive();
    }
  }

  tileOf(actor: Actor): { i: number; j: number } {
    return worldToTile(actor.pos.x, actor.pos.z);
  }

  face(actor: Actor, x: number): void {
    actor.facing = x < actor.pos.x ? -1 : 1;
  }

  // ---------- Effets ----------
  shakeTree(id: string): void {
    const t = this.trees.get(id);
    if (t) t.shake = 1;
  }

  treePos(id: string): THREE.Vector3 | null {
    return this.trees.get(id)?.group.position.clone() ?? null;
  }

  private addEffect(obj: THREE.Object3D, life: number, update: (o: THREE.Object3D, k: number) => void): void {
    this.scene.add(obj);
    this.effects.push({ obj, t: 0, life, update });
  }

  splash(pos: THREE.Vector3): void {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.18, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.1, pos.z);
    this.addEffect(ring, 0.9, (o, k) => {
      o.scale.setScalar(1 + k * 5);
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k;
    });
  }

  puff(pos: THREE.Vector3): void {
    for (let n = 0; n < 8; n++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: '#fff8e8', transparent: true }));
      const a = (n / 8) * Math.PI * 2;
      s.position.set(pos.x, pos.y + 0.3, pos.z);
      this.addEffect(s, 0.7, (o, k) => {
        o.position.set(pos.x + Math.cos(a) * k * 0.9, pos.y + 0.3 + k * 0.6, pos.z + Math.sin(a) * k * 0.9);
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k;
      });
    }
  }

  sparkle(pos: THREE.Vector3, color = '#fff3a8'): void {
    for (let n = 0; n < 6; n++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color, transparent: true }));
      const a = (n / 6) * Math.PI * 2;
      this.addEffect(s, 0.8, (o, k) => {
        o.position.set(pos.x + Math.cos(a) * 0.5 * k, pos.y + 0.4 + k * 0.8, pos.z + Math.sin(a) * 0.5 * k);
        o.rotation.y = k * 6;
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k;
      });
    }
  }

  stingSwarm(): void {
    if (this.bees) this.bees.removeFromParent();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 14), 3));
    this.bees = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#2b2440', size: 0.12 }));
    const bees = this.bees;
    this.addEffect(bees, 2.6, (o, k) => {
      const pos = (o as THREE.Points).geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let n = 0; n < 14; n++) {
        const a = k * 20 + n;
        pos.setXYZ(n, this.player.pos.x + Math.cos(a * 1.3) * 0.5, this.player.pos.y + 1 + Math.sin(a * 2.1) * 0.4, this.player.pos.z + Math.sin(a) * 0.5);
      }
      pos.needsUpdate = true;
    });
  }

  castBobber(pos: THREE.Vector3): void {
    this.reelIn();
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: '#e8413c' }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    top.position.y = 0.02;
    g.add(top, bot);
    g.position.set(pos.x, 0.1, pos.z);
    g.userData.bite = false;
    this.bobber = g;
    this.scene.add(g);
    this.splash(pos);
  }

  bite(): void {
    if (!this.bobber) return;
    this.bobber.userData.bite = true;
    this.splash(this.bobber.position);
  }

  reelIn(): void {
    this.bobber?.removeFromParent();
    this.bobber = null;
  }

  project(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * this.canvas.clientWidth, y: ((1 - p.y) / 2) * this.canvas.clientHeight };
  }

  // ---------- Entrées ----------
  private down: { x: number; y: number; t: number } | null = null;
  private pointerDown(e: PointerEvent): void {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }
  private pointerUp(e: PointerEvent): void {
    const d = this.down;
    this.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14) return;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const t = this.pick(ndc);
    if (t) this.onTap(t);
  }

  pick(ndc: THREE.Vector2): Target | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const visiblePick = this.pickables.filter((o) => {
      let n: THREE.Object3D | null = o;
      while (n) {
        if (!n.visible) return false;
        n = n.parent;
      }
      return !(o.userData.slotHit === true && !this.decorMode);
    });
    const hits = ray.intersectObjects(visiblePick, false);
    const first = hits[0];
    if (first) return first.object.userData.target as Target;
    const th = ray.intersectObjects([...this.terrain, ...this.terrainHits], false)[0];
    if (th) {
      if (th.object instanceof THREE.InstancedMesh && th.instanceId !== undefined) {
        const tiles = th.object.userData.tiles as number[];
        const k = tiles[th.instanceId] ?? 0;
        return { kind: 'ground', i: k % W, j: Math.floor(k / W) };
      }
      return th.object.userData.target as Target;
    }
    const wh = ray.intersectObject(this.water, false)[0];
    if (wh) {
      const t = worldToTile(wh.point.x, wh.point.z);
      return { kind: 'water', i: t.i, j: t.j };
    }
    return null;
  }

  // ---------- Boucle ----------
  private applyLighting(): void {
    const { p, next, k } = palette(this.hour);
    const lerpC = (a: string, b: string): THREE.Color => new THREE.Color(a).lerp(new THREE.Color(b), k);
    const lerp = (a: number, b: number): number => a + (b - a) * k;
    const bg = lerpC(p.bg, next.bg);
    this.scene.background = bg;
    (this.scene.fog as THREE.Fog).color.copy(bg);
    this.sun.color.copy(lerpC(p.sun, next.sun));
    this.sun.intensity = lerp(p.sunI, next.sunI);
    const elev = THREE.MathUtils.degToRad(lerp(p.elev, next.elev));
    const az = THREE.MathUtils.degToRad(this.hour < 12 ? 120 : 235);
    const c = this.camTarget;
    this.sun.position.set(c.x + Math.cos(az) * Math.cos(elev) * 30, Math.sin(elev) * 30 + 4, c.z + Math.sin(az) * Math.cos(elev) * 12 + 8);
    this.sun.target.position.copy(c);
    this.hemi.color.copy(lerpC(p.sky, next.sky));
    this.hemi.groundColor.copy(lerpC(p.ground, next.ground));
    this.hemi.intensity = lerp(p.hemiI, next.hemiI);
    const tint = lerpC(p.tint, next.tint);
    for (const a of [this.player, ...Object.values(this.npcs), ...this.animals.values()]) a.mat.color.copy(tint);
    (this.water.material as THREE.MeshStandardMaterial).color.copy(lerpC(p.water, next.water));
    const glow = lerp(p.glow, next.glow);
    for (const m of glowMaterials()) m.emissiveIntensity = 0.4 + glow;
    for (const d of this.decorObjs.values()) if (d.light) d.light.intensity = glow * (this.quality === 'low' ? 0 : 3);
    if (this.bloom) this.bloom.strength = 0.25 + glow * 0.18;
  }

  private tick = 0;
  update(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    this.tick++;
    this.player.update(dt);
    for (const a of Object.values(this.npcs)) a.update(dt);
    for (const a of this.animals.values()) {
      const home = a.mesh.userData.home as THREE.Vector3;
      if (a.path.length === 0 && Math.random() < dt * 0.4) {
        a.path = [new THREE.Vector3(home.x + (Math.random() - 0.5) * 2.2, 0, home.z + (Math.random() - 0.5) * 1.4)];
      }
      a.update(dt);
    }
    for (const b of this.butterflies) {
      if (!b.alive) continue;
      b.actor.pos.set(b.base.x + Math.sin(time * 0.6 + b.phase) * 1.4, b.base.y + Math.sin(time * 2.3 + b.phase) * 0.25, b.base.z + Math.cos(time * 0.45 + b.phase) * 1.1);
      b.actor.t += dt;
      b.actor.tex.offset.x = (Math.floor(time * 10 + b.phase) % 2) / 2;
    }
    for (const t of this.trees.values()) {
      if (t.shake > 0) {
        t.shake = Math.max(0, t.shake - dt * 1.6);
        t.canopy.rotation.z = Math.sin(time * 40) * 0.12 * t.shake;
      }
    }
    for (const [, g] of this.pickupObjs) {
      g.rotation.y += dt * 0.8;
    }
    if (this.bobber) {
      const bite = this.bobber.userData.bite === true;
      this.bobber.position.y = bite ? 0.02 + Math.sin(time * 30) * 0.05 : 0.1 + Math.sin(time * 3) * 0.03;
    }
    for (let n = this.effects.length - 1; n >= 0; n--) {
      const e = this.effects[n];
      if (!e) continue;
      e.t += dt;
      const k = Math.min(1, e.t / e.life);
      e.update(e.obj, k);
      if (k >= 1) {
        e.obj.removeFromParent();
        this.effects.splice(n, 1);
      }
    }
    this.waterTex.offset.set(time * 0.006, time * 0.004);
    (this.foam.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(time * 1.4) * 0.1;

    const p = this.player.pos;
    this.camTarget.lerp(new THREE.Vector3(THREE.MathUtils.clamp(p.x, -6, 6), p.y, THREE.MathUtils.clamp(p.z, -10, 11)), Math.min(1, dt * 3));
    this.camera.position.set(this.camTarget.x, this.camTarget.y + Math.sin(CAM_ANGLE) * CAM_DIST, this.camTarget.z + Math.cos(CAM_ANGLE) * CAM_DIST);
    this.camera.lookAt(this.camTarget);
    this.applyLighting();

    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);

    if (!this.fpsAcc.checked) {
      this.fpsAcc.t += dt;
      this.fpsAcc.n++;
      if (this.fpsAcc.t > 4) {
        this.fpsAcc.checked = true;
        const fps = this.fpsAcc.n / this.fpsAcc.t;
        if (!localStorage.getItem('ragots-quality-set') && fps < 40 && this.quality !== 'low') this.setQuality(this.quality === 'high' ? 'medium' : 'low');
      }
    }
  }

  snapCamera(): void {
    const p = this.player.pos;
    this.camTarget.set(THREE.MathUtils.clamp(p.x, -6, 6), p.y, THREE.MathUtils.clamp(p.z, -10, 11));
  }
}
