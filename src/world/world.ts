import * as THREE from 'three';
import { Stage, type Quality } from './scene';
import { buildIsland, groundHeight, isWalkable, worldUniforms } from './island';
import { SLOT_POSITIONS, buildProps, colliders, onPier } from './props';
import { CharacterSprite } from './sprites';
import { buildDecor } from './decor';
import { FishingRig, PEN, Particles, Pen, shakeTree, treeIndexFromHit, updateTreeShakes } from './activities';
import { treeMeshes, trees } from './props';
import type { NpcId, Pickup, SlotId } from '../state/types';

export interface WorldEvents {
  tapNpc(id: NpcId): void;
  tapPickup(p: Pickup): void;
  tapSlot(slot: SlotId): void;
  tapWater(x: number, z: number): void;
  arrivedNpc(id: NpcId): void;
  tapTree(index: number): void;
  tapPen(): void;
}

const NPC_HOME: Record<NpcId, { x: number; z: number; wander: number }> = {
  gaston: { x: -4.6, z: 2.3, wander: 1.2 },
  josette: { x: 3.4, z: -0.9, wander: 1.6 },
  marius: { x: 1.6, z: 11.8, wander: 0.4 },
};

const PLAYER_SPEED = 3.4;
const NPC_SPEED = 1.6;

class Actor {
  readonly sprite: CharacterSprite;
  readonly pos = new THREE.Vector3();
  target: THREE.Vector2 | null = null;
  speed: number;
  constructor(key: 'player' | NpcId, x: number, z: number, speed: number) {
    this.sprite = new CharacterSprite(key);
    this.pos.set(x, onPier(x, z) ? 0.42 : groundHeight(x, z), z);
    this.speed = speed;
  }
  get moving(): boolean {
    return this.target !== null;
  }
  /** Avance vers la cible en glissant le long des obstacles. Renvoie true à l'arrivée. */
  step(dt: number): boolean {
    if (!this.target) return false;
    const dx = this.target.x - this.pos.x;
    const dz = this.target.y - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.08) {
      this.target = null;
      return true;
    }
    const s = Math.min(dist, this.speed * dt);
    let nx = this.pos.x + (dx / dist) * s;
    let nz = this.pos.z + (dz / dist) * s;
    for (const c of colliders) {
      const cx = nx - c.x;
      const cz = nz - c.z;
      const d = Math.hypot(cx, cz);
      const min = c.r + 0.25;
      if (d < min && d > 1e-4) {
        nx = c.x + (cx / d) * min;
        nz = c.z + (cz / d) * min;
      }
    }
    if (!walkable(nx, nz)) {
      this.target = null;
      return true;
    }
    if (Math.abs(dx) > 0.02) this.sprite.facing = dx > 0 ? 1 : -1;
    this.pos.x = nx;
    this.pos.z = nz;
    this.pos.y = onPier(nx, nz) ? 0.42 : groundHeight(nx, nz);
    return false;
  }
}

export function walkable(x: number, z: number): boolean {
  return onPier(x, z) || isWalkable(x, z);
}

/** Rapproche un point du rivage vers l'intérieur jusqu'à trouver un sol praticable. */
function clampToLand(x: number, z: number): THREE.Vector2 {
  if (walkable(x, z)) return new THREE.Vector2(x, z);
  for (let k = 0.95; k > 0.2; k -= 0.05) if (walkable(x * k, z * k)) return new THREE.Vector2(x * k, z * k);
  return new THREE.Vector2(0, 1);
}

export class World {
  readonly stage: Stage;
  readonly player: Actor;
  readonly npcs: Record<NpcId, Actor>;
  private readonly timer = new THREE.Timer();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.35);
  private readonly pickupGroup = new THREE.Group();
  private readonly slotGroup = new THREE.Group();
  private readonly decorGroup = new THREE.Group();
  private readonly marker: THREE.Mesh;
  private pickups: Pickup[] = [];
  private wanderTimers: Record<NpcId, number> = { gaston: 2, josette: 1, marius: 4 };
  private pendingNpc: NpcId | null = null;
  private pendingPickup: Pickup | null = null;
  private pendingSlot: SlotId | null = null;
  private pendingTree: number | null = null;
  private pendingPen = false;
  readonly particles = new Particles();
  readonly fishing = new FishingRig();
  readonly pen: Pen;
  /** Quand défini, tous les taps lui sont envoyés (mini-jeu de pêche). */
  captureTap: (() => void) | null = null;
  private approaching: NpcId | null = null;
  private frozen = false;
  private flag: THREE.Object3D | null = null;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private lowFpsStreak = 0;
  onFrame: ((dt: number) => void) | null = null;
  /** Qualité forcée par l'URL (?q=) : pas de dégradation automatique. */
  qualityLocked = new URLSearchParams(location.search).has('q');

  constructor(canvas: HTMLCanvasElement, quality: Quality, private readonly events: WorldEvents) {
    this.stage = new Stage(canvas, quality);
    const scene = this.stage.scene;
    buildIsland(scene);
    this.flag = buildProps(scene, quality).flag;
    scene.add(this.pickupGroup, this.slotGroup, this.decorGroup);
    this.pen = new Pen();
    scene.add(this.pen.group, this.particles.group, this.fishing.group);

    this.player = new Actor('player', 0.5, 3.5, PLAYER_SPEED);
    this.npcs = {
      gaston: new Actor('gaston', NPC_HOME.gaston.x, NPC_HOME.gaston.z, NPC_SPEED),
      josette: new Actor('josette', NPC_HOME.josette.x, NPC_HOME.josette.z, NPC_SPEED),
      marius: new Actor('marius', NPC_HOME.marius.x, NPC_HOME.marius.z, NPC_SPEED * 0.6),
    };
    for (const a of [this.player, ...Object.values(this.npcs)]) scene.add(a.sprite.root);

    // Repère de destination (petit losange au sol).
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.24, 4),
      new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    scene.add(this.marker);

    this.buildSlotMarkers();
    this.stage.follow(this.player.pos, 0, true);
    window.addEventListener('resize', () => this.stage.resize());
    this.bindInput(canvas);
  }

  // ---------- API pour le jeu ----------
  setFrozen(f: boolean): void {
    this.frozen = f;
    if (f) {
      this.player.target = null;
      this.marker.visible = false;
    }
  }

  setBang(id: NpcId, on: boolean): void {
    this.npcs[id].sprite.showBang(on);
  }

  setPlayerSwollen(on: boolean): void {
    this.player.sprite.setSwollen(on);
  }

  /** Un habitant avec une intention vient de lui-même vers le joueur. */
  approachPlayer(id: NpcId): void {
    this.approaching = id;
  }

  shakeTree(i: number): void {
    shakeTree(i);
  }

  playerPos(): { x: number; z: number } {
    return { x: this.player.pos.x, z: this.player.pos.z };
  }

  distanceToNpc(id: NpcId): number {
    const n = this.npcs[id].pos;
    return Math.hypot(n.x - this.player.pos.x, n.z - this.player.pos.z);
  }

  /** Tourne les deux interlocuteurs l'un vers l'autre. */
  faceEachOther(id: NpcId): void {
    const n = this.npcs[id];
    const dx = n.pos.x - this.player.pos.x;
    this.player.sprite.facing = dx >= 0 ? 1 : -1;
    n.sprite.facing = dx >= 0 ? -1 : 1;
    n.target = null;
  }

  setPickups(list: Pickup[]): void {
    this.pickups = list;
    this.pickupGroup.clear();
    for (const p of list) {
      const mesh = pickupMesh(p.itemId);
      mesh.position.set(p.x, groundHeight(p.x, p.z) + 0.12, p.z);
      mesh.userData.pickupId = p.id;
      this.pickupGroup.add(mesh);
    }
  }

  setDecor(decor: Record<SlotId, string | null>): void {
    this.decorGroup.clear();
    for (const [slot, itemId] of Object.entries(decor) as [SlotId, string | null][]) {
      if (!itemId) continue;
      const pos = SLOT_POSITIONS[slot];
      const obj = buildDecor(itemId);
      obj.position.set(pos.x, pos.y, pos.z);
      obj.userData.slot = slot;
      this.decorGroup.add(obj);
    }
  }

  showSlots(on: boolean): void {
    this.slotGroup.visible = on;
  }

  /** Projection écran d'un habitant (pour ancrer des bulles DOM). */
  screenPos(id: NpcId | 'player'): { x: number; y: number } {
    const a = id === 'player' ? this.player : this.npcs[id];
    const v = a.pos.clone().add(new THREE.Vector3(0, 2.0, 0)).project(this.stage.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  walkTo(x: number, z: number): void {
    const t = clampToLand(x, z);
    this.player.target = t;
    this.marker.position.set(t.x, groundHeight(t.x, t.y) + 0.03, t.y);
    this.marker.visible = true;
  }

  start(): void {
    this.timer.connect(document);
    this.stage.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- Boucle ----------
  private frame(): void {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    worldUniforms.uTime.value += dt;
    this.trackFps(dt);

    if (!this.frozen && this.player.step(dt)) {
      this.marker.visible = false;
      this.resolveArrival();
    }
    this.updateNpcs(dt);

    const camYaw = 0;
    this.player.sprite.update(dt, this.player.moving, camYaw);
    this.player.sprite.root.position.copy(this.player.pos);
    for (const a of Object.values(this.npcs)) {
      a.sprite.update(dt, a.moving, camYaw);
      a.sprite.root.position.copy(a.pos);
    }
    this.animateProps(dt);
    updateTreeShakes(dt);
    this.pen.update(dt);
    this.particles.follow(this.player.pos.x, this.player.pos.z, dt);
    this.particles.update(dt);
    const tip = this.player.pos.clone().add(new THREE.Vector3(0.45 * this.player.sprite.facing, 1.6, 0));
    this.fishing.update(dt, tip);
    this.stage.follow(this.player.pos, dt);
    this.onFrame?.(dt);
    this.stage.render();
  }

  private updateNpcs(dt: number): void {
    for (const id of Object.keys(this.npcs) as NpcId[]) {
      const a = this.npcs[id];
      if (this.frozen) {
        a.step(dt);
        continue;
      }
      if (this.approaching === id) {
        const d = this.distanceToNpc(id);
        if (d < 1.3) {
          a.target = null;
          this.approaching = null;
          this.events.arrivedNpc(id);
        } else {
          a.target = new THREE.Vector2(this.player.pos.x + (a.pos.x > this.player.pos.x ? 1 : -1), this.player.pos.z);
          a.speed = NPC_SPEED * 1.6;
        }
        a.step(dt);
        continue;
      }
      a.speed = id === 'marius' ? NPC_SPEED * 0.6 : NPC_SPEED;
      if (a.step(dt)) this.wanderTimers[id] = 2 + Math.random() * 4;
      if (!a.moving) {
        this.wanderTimers[id] -= dt;
        if (this.wanderTimers[id] <= 0) {
          const h = NPC_HOME[id];
          const ang = Math.random() * Math.PI * 2;
          const r = Math.random() * h.wander;
          a.target = new THREE.Vector2(h.x + Math.cos(ang) * r, h.z + Math.sin(ang) * r);
          this.wanderTimers[id] = 3 + Math.random() * 4;
        }
      }
    }
  }

  private animateProps(dt: number): void {
    const t = worldUniforms.uTime.value;
    this.pickupGroup.children.forEach((c, i) => {
      c.rotation.y += dt * 1.2;
      c.position.y = groundHeight(c.position.x, c.position.z) + 0.14 + Math.sin(t * 3 + i) * 0.04;
    });
    this.slotGroup.children.forEach((c) => {
      c.rotation.z += dt;
      const s = 1 + Math.sin(t * 4) * 0.08;
      c.scale.set(s, s, s);
    });
    if (this.flag) this.flag.rotation.y = Math.sin(t * 2.2) * 0.25;
  }

  private trackFps(dt: number): void {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc < 1) return;
    this.fps = Math.round(this.fpsFrames / this.fpsAcc);
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    // Dégradation automatique si le téléphone peine (3 s consécutives sous 45 fps).
    this.lowFpsStreak = this.fps < 45 ? this.lowFpsStreak + 1 : 0;
    if (this.lowFpsStreak >= 3 && worldUniforms.uTime.value > 5 && !this.qualityLocked) {
      this.lowFpsStreak = 0;
      if (this.stage.quality === 'high') this.stage.setQuality('medium');
      else if (this.stage.quality === 'medium') this.stage.setQuality('low');
    }
  }

  private resolveArrival(): void {
    if (this.pendingNpc) {
      const id = this.pendingNpc;
      this.pendingNpc = null;
      if (this.distanceToNpc(id) < 2.2) this.events.tapNpc(id);
    } else if (this.pendingPickup) {
      const p = this.pendingPickup;
      this.pendingPickup = null;
      if (Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z) < 1.2) this.events.tapPickup(p);
    } else if (this.pendingTree !== null) {
      const i = this.pendingTree;
      this.pendingTree = null;
      const t = trees[i];
      if (t && Math.hypot(t.x - this.player.pos.x, t.z - this.player.pos.z) < 1.8) this.events.tapTree(i);
    } else if (this.pendingPen) {
      this.pendingPen = false;
      if (Math.hypot(PEN.x - this.player.pos.x, PEN.z - this.player.pos.z) < PEN.r + 1.4) this.events.tapPen();
    } else if (this.pendingSlot) {
      const s = this.pendingSlot;
      this.pendingSlot = null;
      this.events.tapSlot(s);
    }
  }

  // ---------- Entrées ----------
  private bindInput(canvas: HTMLCanvasElement): void {
    let downX = 0;
    let downY = 0;
    let downT = 0;
    canvas.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
      downT = performance.now();
    });
    canvas.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 14 || performance.now() - downT > 600) return;
      if (this.captureTap) {
        this.captureTap();
        return;
      }
      if (this.frozen) return;
      this.handleTap(e.clientX, e.clientY);
    });
  }

  handleTap(sx: number, sy: number): void {
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.stage.camera);

    // 1. Habitants (zone de tap généreuse autour du sprite).
    let best: { id: NpcId; d: number } | null = null;
    for (const id of Object.keys(this.npcs) as NpcId[]) {
      const p = this.npcs[id].pos.clone().add(new THREE.Vector3(0, 0.8, 0));
      const d = this.raycaster.ray.distanceToPoint(p);
      if (d < 0.9 && (!best || d < best.d)) best = { id, d };
    }
    if (best) {
      this.pendingPickup = null;
      this.pendingSlot = null;
      if (this.distanceToNpc(best.id) < 1.8) {
        this.events.tapNpc(best.id);
      } else {
        this.pendingNpc = best.id;
        const n = this.npcs[best.id].pos;
        const side = this.player.pos.x < n.x ? -1 : 1;
        this.walkTo(n.x + side * 1.0, n.z + 0.3);
      }
      return;
    }
    this.pendingNpc = null;
    this.pendingTree = null;
    this.pendingPen = false;

    // 1b. Mouton de l'enclos.
    const sheep = this.pen.sheep.position.clone().add(new THREE.Vector3(0, 0.35, 0));
    if (this.raycaster.ray.distanceToPoint(sheep) < 0.8) {
      this.pendingPen = true;
      this.pendingPickup = null;
      this.pendingSlot = null;
      if (Math.hypot(PEN.x - this.player.pos.x, PEN.z - this.player.pos.z) < PEN.r + 1.4) {
        this.pendingPen = false;
        this.events.tapPen();
      } else this.walkTo(PEN.x - 0.4, PEN.z + PEN.r + 0.6);
      return;
    }

    // 2. Emplacements de décoration (quand visibles).
    if (this.slotGroup.visible) {
      const hit = this.raycaster.intersectObjects(this.slotGroup.children, true)[0];
      const slot = hit ? (findUserData(hit.object, 'slot') as SlotId | undefined) : undefined;
      if (slot) {
        this.pendingSlot = slot;
        const p = SLOT_POSITIONS[slot];
        this.walkTo(p.x, p.z + 1.0);
        return;
      }
    }

    // 3. Objets à ramasser.
    for (const p of this.pickups) {
      const d = this.raycaster.ray.distanceToPoint(new THREE.Vector3(p.x, groundHeight(p.x, p.z) + 0.15, p.z));
      if (d < 0.6) {
        this.pendingPickup = p;
        this.pendingSlot = null;
        this.walkTo(p.x, p.z);
        return;
      }
    }

    // 3b. Arbres (tap sur la canopée).
    if (treeMeshes.canopies) {
      const idx = treeIndexFromHit(this.raycaster.intersectObject(treeMeshes.canopies, false)[0]);
      const t = idx !== null ? trees[idx] : undefined;
      if (idx !== null && t) {
        this.pendingPickup = null;
        this.pendingSlot = null;
        if (Math.hypot(t.x - this.player.pos.x, t.z - this.player.pos.z) < 1.6) this.events.tapTree(idx);
        else {
          this.pendingTree = idx;
          this.walkTo(t.x + (this.player.pos.x < t.x ? -0.8 : 0.8), t.z + 0.7);
        }
        return;
      }
    }

    // 4. Sol / eau.
    const pt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, pt)) return;
    this.pendingPickup = null;
    this.pendingSlot = null;
    if (!walkable(pt.x, pt.z)) {
      this.events.tapWater(pt.x, pt.z);
      return;
    }
    this.walkTo(pt.x, pt.z);
  }

  private buildSlotMarkers(): void {
    for (const [slot, p] of Object.entries(SLOT_POSITIONS) as [SlotId, (typeof SLOT_POSITIONS)[SlotId]][]) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.6, 24),
        new THREE.MeshBasicMaterial({ color: '#ffe38a', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, p.y + 0.05, p.z);
      ring.userData.slot = slot;
      // Disque invisible pour un tap plus facile.
      const hit = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), new THREE.MeshBasicMaterial({ visible: false }));
      ring.add(hit);
      this.slotGroup.add(ring);
    }
    this.slotGroup.visible = false;
  }
}

function findUserData(o: THREE.Object3D, key: string): unknown {
  let cur: THREE.Object3D | null = o;
  while (cur) {
    if (cur.userData[key] !== undefined) return cur.userData[key];
    cur = cur.parent;
  }
  return undefined;
}

function pickupMesh(itemId: string): THREE.Mesh {
  const color = itemId === 'pomme-doree' ? '#ffd23f' : itemId === 'pomme' ? '#e0412f' : itemId === 'figue' ? '#7b3f8c' : itemId === 'coquillage' ? '#f7c9c0' : '#f2d36b';
  const geo = itemId === 'coquillage' ? new THREE.ConeGeometry(0.16, 0.14, 6) : new THREE.IcosahedronGeometry(0.15, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.25), flatShading: true }));
  mesh.castShadow = true;
  return mesh;
}
