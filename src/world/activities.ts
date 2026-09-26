import * as THREE from 'three';
import { GRASS_Y } from './island';
import { colliders, treeMeshes, trees } from './props';
import { plankTexture } from './textures';

// ---------- Secouer un arbre ----------
const shakeTimers = new Map<number, number>();
const baseMatrices = new Map<number, THREE.Matrix4>();

export function shakeTree(index: number): void {
  const mesh = treeMeshes.canopies;
  if (!mesh) return;
  if (!baseMatrices.has(index)) {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(index, m);
    baseMatrices.set(index, m);
  }
  shakeTimers.set(index, 0.7);
}

export function updateTreeShakes(dt: number): void {
  const mesh = treeMeshes.canopies;
  if (!mesh || shakeTimers.size === 0) return;
  const rot = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  for (const [i, t] of shakeTimers) {
    const base = baseMatrices.get(i);
    if (!base) continue;
    const left = t - dt;
    if (left <= 0) {
      mesh.setMatrixAt(i, base);
      shakeTimers.delete(i);
      continue;
    }
    shakeTimers.set(i, left);
    // Rotation autour du pied de l'arbre, amortie.
    const tree = trees[i];
    if (!tree) continue;
    const a = Math.sin(left * 38) * 0.12 * left;
    rot.makeRotationZ(a);
    tmp.makeTranslation(tree.x, tree.y, tree.z).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(-tree.x, -tree.y, -tree.z));
    mesh.setMatrixAt(i, tmp.multiply(base));
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export function treeIndexFromHit(hit: THREE.Intersection | undefined): number | null {
  if (!hit || hit.object !== treeMeshes.canopies || hit.instanceId === undefined) return null;
  return hit.instanceId;
}

// ---------- Particules simples (abeilles, cœurs, éclaboussures) ----------
interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  orbit?: { cx: number; cz: number; r: number; a: number; y: number };
}

function pixelSpriteTexture(draw: (ctx: CanvasRenderingContext2D) => void, w: number, h: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let beeTex: THREE.CanvasTexture | null = null;
let heartTex: THREE.CanvasTexture | null = null;
let dropTex: THREE.CanvasTexture | null = null;

function textures(): { bee: THREE.CanvasTexture; heart: THREE.CanvasTexture; drop: THREE.CanvasTexture } {
  beeTex ??= pixelSpriteTexture((c) => {
    c.fillStyle = '#2a1e18';
    c.fillRect(1, 2, 6, 4);
    c.fillStyle = '#f2c14e';
    c.fillRect(2, 2, 1, 4);
    c.fillRect(4, 2, 1, 4);
    c.fillStyle = '#e8f4ff';
    c.fillRect(2, 0, 2, 2);
    c.fillRect(4, 0, 2, 2);
  }, 8, 6);
  heartTex ??= pixelSpriteTexture((c) => {
    c.fillStyle = '#ff5a7a';
    c.fillRect(1, 1, 2, 2);
    c.fillRect(4, 1, 2, 2);
    c.fillRect(0, 2, 7, 2);
    c.fillRect(1, 4, 5, 1);
    c.fillRect(2, 5, 3, 1);
    c.fillRect(3, 6, 1, 1);
  }, 7, 7);
  dropTex ??= pixelSpriteTexture((c) => {
    c.fillStyle = '#e8fbff';
    c.fillRect(1, 0, 2, 4);
    c.fillRect(0, 1, 4, 2);
  }, 4, 4);
  return { bee: beeTex, heart: heartTex, drop: dropTex };
}

export class Particles {
  readonly group = new THREE.Group();
  private list: Particle[] = [];

  private spawn(tex: THREE.Texture, size: number, pos: THREE.Vector3, vel: THREE.Vector3, life: number): Particle {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(size, size * (tex.image as HTMLCanvasElement).height / (tex.image as HTMLCanvasElement).width, 1);
    sprite.position.copy(pos);
    this.group.add(sprite);
    const p: Particle = { sprite, vel, life };
    this.list.push(p);
    return p;
  }

  bees(x: number, z: number): void {
    const t = textures().bee;
    for (let i = 0; i < 9; i++) {
      const p = this.spawn(t, 0.22, new THREE.Vector3(x, 1.2, z), new THREE.Vector3(), 2.4 + Math.random() * 0.6);
      p.orbit = { cx: x, cz: z, r: 0.35 + Math.random() * 0.4, a: Math.random() * 6.28, y: 0.9 + Math.random() * 0.9 };
    }
  }

  hearts(x: number, y: number, z: number): void {
    const t = textures().heart;
    for (let i = 0; i < 5; i++) {
      this.spawn(t, 0.26, new THREE.Vector3(x + (Math.random() - 0.5) * 0.5, y, z), new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.5, 0), 1.2);
    }
  }

  splash(x: number, z: number): void {
    const t = textures().drop;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.spawn(t, 0.1, new THREE.Vector3(x, 0.05, z), new THREE.Vector3(Math.cos(a) * 0.9, 2 + Math.random(), Math.sin(a) * 0.9), 0.7);
    }
  }

  update(dt: number): void {
    this.list = this.list.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.sprite);
        p.sprite.material.dispose();
        return false;
      }
      if (p.orbit) {
        p.orbit.a += dt * 7;
        p.sprite.position.set(p.orbit.cx + Math.cos(p.orbit.a) * p.orbit.r, p.orbit.y + Math.sin(p.orbit.a * 2.3) * 0.15, p.orbit.cz + Math.sin(p.orbit.a) * p.orbit.r);
      } else {
        p.vel.y -= dt * (p.sprite.scale.x < 0.15 ? 9 : 0);
        p.sprite.position.addScaledVector(p.vel, dt);
      }
      p.sprite.material.opacity = Math.min(1, p.life * 2.5);
      return true;
    });
  }

  /** Recentre l'essaim d'abeilles sur le joueur (elles le poursuivent). */
  follow(x: number, z: number, dt: number): void {
    for (const p of this.list) {
      if (!p.orbit) continue;
      p.orbit.cx += (x - p.orbit.cx) * Math.min(1, dt * 4);
      p.orbit.cz += (z - p.orbit.cz) * Math.min(1, dt * 4);
    }
  }
}

// ---------- Pêche : bouchon, ligne, ombre de poisson ----------
export class FishingRig {
  readonly group = new THREE.Group();
  private readonly bobber: THREE.Group;
  private readonly shadow: THREE.Mesh;
  private readonly line: THREE.Line;
  private readonly ring: THREE.Mesh;
  private t = 0;
  private dipping = false;
  private target = new THREE.Vector3();
  active = false;

  constructor() {
    const red = new THREE.MeshLambertMaterial({ color: '#e0412f' });
    const white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), red);
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
    this.bobber = new THREE.Group();
    this.bobber.add(top, bottom);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), new THREE.MeshBasicMaterial({ color: '#0b2a3a', transparent: true, opacity: 0.45, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(1, 0.45, 1);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.2, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#f4f0e0' }));
    this.group.add(this.bobber, this.shadow, this.ring, this.line);
    this.group.visible = false;
  }

  cast(x: number, z: number): void {
    this.target.set(x, 0.04, z);
    this.bobber.position.copy(this.target);
    this.ring.position.set(x, 0.03, z);
    this.shadow.position.set(x + 1.6, 0.02, z + 0.6);
    this.t = 0;
    this.dipping = false;
    this.active = true;
    this.group.visible = true;
  }

  dip(on: boolean): void {
    this.dipping = on;
  }

  stop(): void {
    this.active = false;
    this.group.visible = false;
  }

  update(dt: number, rodTip: THREE.Vector3): void {
    if (!this.active) return;
    this.t += dt;
    // L'ombre du poisson tourne autour du bouchon en se rapprochant.
    const r = Math.max(0.25, 1.6 - this.t * 0.35);
    const a = this.t * 1.1;
    this.shadow.position.set(this.target.x + Math.cos(a) * r, 0.02, this.target.z + Math.sin(a) * r * 0.7);
    this.shadow.rotation.z = a + Math.PI / 2;
    const bob = this.dipping ? -0.14 + Math.sin(this.t * 30) * 0.03 : Math.sin(this.t * 3) * 0.02;
    this.bobber.position.y = this.target.y + bob;
    const ringMat = this.ring.material as THREE.MeshBasicMaterial;
    const k = (this.t * 1.2) % 1;
    this.ring.scale.setScalar(1 + k * (this.dipping ? 5 : 2.5));
    ringMat.opacity = (1 - k) * (this.dipping ? 0.9 : 0.35);
    const pos = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, rodTip.x, rodTip.y, rodTip.z);
    pos.setXYZ(1, this.bobber.position.x, this.bobber.position.y + 0.08, this.bobber.position.z);
    pos.needsUpdate = true;
  }
}

// ---------- Enclos et mouton-nuage ----------
export const PEN = { x: 8.3, z: 2.4, r: 1.35 };

function sheepTexture(): THREE.CanvasTexture {
  return pixelSpriteTexture((c) => {
    const px = (x: number, y: number, w: number, h: number, col: string): void => {
      c.fillStyle = col;
      c.fillRect(x, y, w, h);
    };
    // Toison en nuage, tête sombre, pattes.
    px(1, 2, 12, 7, '#2a1e18');
    px(0, 3, 14, 5, '#2a1e18');
    px(2, 3, 10, 5, '#ffffff');
    px(1, 4, 12, 3, '#ffffff');
    px(3, 2, 3, 1, '#ffffff');
    px(8, 2, 3, 1, '#ffffff');
    px(4, 4, 2, 1, '#e6ecf5');
    px(9, 5, 2, 1, '#e6ecf5');
    px(11, 4, 5, 4, '#2a1e18');
    px(12, 5, 3, 2, '#5a4a5a');
    px(13, 5, 1, 1, '#ffffff');
    px(3, 9, 2, 3, '#2a1e18');
    px(9, 9, 2, 3, '#2a1e18');
  }, 16, 12);
}

export class Pen {
  readonly group = new THREE.Group();
  readonly sheep: THREE.Mesh;
  private target = new THREE.Vector2(PEN.x, PEN.z);
  private wait = 1;
  private hop = 0;

  constructor() {
    const wood = new THREE.MeshLambertMaterial({ map: plankTexture() });
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), wood);
      post.position.set(PEN.x + Math.cos(a) * PEN.r, GRASS_Y + 0.25, PEN.z + Math.sin(a) * PEN.r);
      post.castShadow = true;
      this.group.add(post);
      const b = ((i + 1) / n) * Math.PI * 2;
      if (i === 3) continue; // ouverture côté caméra
      const len = 2 * PEN.r * Math.sin(Math.PI / n);
      for (const hgt of [0.2, 0.4]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.05), wood);
        rail.position.set(PEN.x + Math.cos((a + b) / 2) * PEN.r * Math.cos(Math.PI / n), GRASS_Y + hgt, PEN.z + Math.sin((a + b) / 2) * PEN.r * Math.cos(Math.PI / n));
        rail.rotation.y = -(a + b) / 2 + Math.PI / 2;
        rail.castShadow = true;
        this.group.add(rail);
      }
    }
    const trough = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.28), wood);
    trough.position.set(PEN.x - 0.6, GRASS_Y + 0.09, PEN.z - 0.6);
    this.group.add(trough);
    const tex = sheepTexture();
    const geo = new THREE.PlaneGeometry(0.9, 0.68);
    geo.translate(0, 0.34, 0);
    this.sheep = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    const caster = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
    caster.castShadow = true;
    caster.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
    caster.rotation.y = Math.atan2(-17, 4);
    this.sheep.add(caster);
    this.sheep.position.set(PEN.x, GRASS_Y, PEN.z);
    this.group.add(this.sheep);
    colliders.push({ x: PEN.x, z: PEN.z, r: PEN.r });
  }

  happy(): void {
    this.hop = 1.2;
  }

  update(dt: number): void {
    const s = this.sheep;
    const dx = this.target.x - s.position.x;
    const dz = this.target.y - s.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const step = Math.min(d, dt * 0.5);
      s.position.x += (dx / d) * step;
      s.position.z += (dz / d) * step;
      s.scale.x = dx > 0 ? -1 : 1;
    } else if ((this.wait -= dt) <= 0) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (PEN.r - 0.5);
      this.target.set(PEN.x + Math.cos(a) * r, PEN.z + Math.sin(a) * r);
      this.wait = 2 + Math.random() * 3;
    }
    this.hop = Math.max(0, this.hop - dt);
    s.position.y = GRASS_Y + Math.abs(Math.sin(this.hop * 10)) * 0.25 * (this.hop > 0 ? 1 : 0) + (d > 0.05 ? Math.abs(Math.sin(performance.now() / 120)) * 0.04 : 0);
  }
}
