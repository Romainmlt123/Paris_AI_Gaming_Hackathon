import * as THREE from 'three';
import { SLOTS } from '../../shared/economy';
import type { ForageCandidates } from '../../shared/forage';
import type { DecoId, ForageId, GameState, NpcId, SlotId } from '../../shared/types';
import { NPC_IDS } from '../../shared/types';
import { createActorView, type ActorView } from '../render/actor';
import { createBuildings } from '../render/buildings';
import { createDeco, slotMarker } from '../render/decor';
import { createFireflies } from '../render/night';
import { createFlowers, createRocks, createTrees, type Swaying } from '../render/props';
import { SPRITES } from '../render/sprites';
import type { Stage } from '../render/stage';
import { createTerrain, type Terrain } from '../render/terrain';
import { createWater, type Water } from '../render/water';
import { findPath, generateMap, isWalkable, kindAt, nearestWalkable, surfaceHeight, type Tile, type TileMap } from './map';

const SPEED = 3.2;
const NPC_SPEED = 1.4;

interface Actor {
  view: ActorView;
  pos: THREE.Vector3;
  path: Tile[];
  facing: 'down' | 'up';
  flip: boolean;
  speed: number;
  onArrive: (() => void) | null;
}

interface Npc extends Actor {
  id: NpcId;
  home: Tile;
  idle: number;
}

export const HOMES: Record<NpcId, Tile> = {
  gaston: { x: 17, z: 18 },
  josette: { x: 5, z: 18 },
  marius: { x: 14, z: 24 },
};

export type TapTarget =
  | { kind: 'npc'; npc: NpcId }
  | { kind: 'slot'; slot: SlotId }
  | { kind: 'forage'; spot: string; tile: Tile }
  | { kind: 'ground'; tile: Tile };

export interface World {
  map: TileMap;
  /** Tiles where pickups may spawn. */
  forageCandidates: ForageCandidates;
  playerPos: THREE.Vector3;
  npcView(id: NpcId): ActorView;
  /** Resolve a screen tap into a target (NPC, deco slot, or ground). */
  pick(ndc: THREE.Vector2): TapTarget | null;
  walkTo(tile: Tile, onArrive?: () => void): boolean;
  approachNpc(id: NpcId, onArrive: () => void): void;
  /** NPC walks up to the player by itself (initiative). */
  npcSeekPlayer(id: NpcId, onArrive: () => void): void;
  setFrozen(id: NpcId | null): void;
  facePlayerToward(id: NpcId): void;
  syncDecor(state: GameState): void;
  syncForage(state: GameState): void;
  /** Night ambience: water, lit windows and lamps, fireflies (0 = day, 1 = night). */
  setNight(night: number): void;
  update(dt: number, time: number, intents: Set<NpcId>): void;
  teleportPlayer(tile: Tile): void;
}

function tileY(map: TileMap, x: number, z: number): number {
  return surfaceHeight(kindAt(map, Math.round(x), Math.round(z)));
}

function makeActor(view: ActorView, tile: Tile, map: TileMap, speed: number): Actor {
  return { view, pos: new THREE.Vector3(tile.x, tileY(map, tile.x, tile.z), tile.z), path: [], facing: 'down', flip: false, speed, onArrive: null };
}

function stepActor(actor: Actor, map: TileMap, dt: number, time: number): void {
  const next = actor.path[0];
  if (next) {
    const target = new THREE.Vector3(next.x, 0, next.z);
    const dx = target.x - actor.pos.x;
    const dz = target.z - actor.pos.z;
    const dist = Math.hypot(dx, dz);
    const step = actor.speed * dt;
    if (dist <= step) {
      actor.pos.x = target.x;
      actor.pos.z = target.z;
      actor.path.shift();
    } else {
      actor.pos.x += (dx / dist) * step;
      actor.pos.z += (dz / dist) * step;
    }
    if (Math.abs(dz) > 0.01) actor.facing = dz < 0 ? 'up' : 'down';
    if (Math.abs(dx) > 0.01) actor.flip = dx < 0;
    if (actor.path.length === 0 && actor.onArrive) {
      const cb = actor.onArrive;
      actor.onArrive = null;
      cb();
    }
  }
  const targetY = tileY(map, actor.pos.x, actor.pos.z);
  actor.pos.y += (targetY - actor.pos.y) * Math.min(1, dt * 12);
  actor.view.root.position.copy(actor.pos);
  actor.view.setPose(actor.path.length > 0, actor.facing, actor.flip, time);
}

const PICKUP_COLOR: Record<ForageId, number> = { coquillage: 0xffb3c1, pomme: 0xe0412f, perle: 0xf4f1ff };

function pickupMesh(item: ForageId): THREE.Group {
  const g = new THREE.Group();
  const shape =
    item === 'coquillage'
      ? new THREE.ConeGeometry(0.16, 0.14, 7)
      : new THREE.SphereGeometry(item === 'perle' ? 0.12 : 0.15, 10, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: PICKUP_COLOR[item],
    roughness: item === 'perle' ? 0.15 : 0.55,
    emissive: item === 'perle' ? 0x6f6aa8 : 0x000000,
  });
  const body = new THREE.Mesh(shape, mat);
  body.castShadow = true;
  body.name = 'body';
  g.add(body);
  const glint = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  glint.rotation.x = -Math.PI / 2;
  glint.position.y = 0.02;
  glint.name = 'glint';
  g.add(glint);
  return g;
}

function candidatesOf(map: TileMap): ForageCandidates {
  const clear = (x: number, z: number): boolean => isWalkable(map, x, z) && !SLOTS.some((s) => Math.hypot(s.x - x, s.z - z) < 1.6) && !Object.values(HOMES).some((h) => h.x === x && h.z === z);
  const beach: Tile[] = [];
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) if (kindAt(map, x, z) === 'sand' && clear(x, z)) beach.push({ x, z });
  const orchard: Tile[] = [];
  const seen = new Set<string>();
  for (const t of map.trees) {
    const c = [{ x: t.x, z: t.z + 1 }, { x: t.x + 1, z: t.z }, { x: t.x - 1, z: t.z }].find((n) => clear(n.x, n.z) && kindAt(map, n.x, n.z) !== 'path');
    if (c && !seen.has(`${c.x},${c.z}`)) {
      seen.add(`${c.x},${c.z}`);
      orchard.push(c);
    }
  }
  return { beach, orchard };
}

function roundTile(v: THREE.Vector3): Tile {
  return { x: Math.round(v.x), z: Math.round(v.z) };
}

export function createWorld(stage: Stage): World {
  const map = generateMap();
  const terrain: Terrain = createTerrain(map);
  const water: Water = createWater(map);
  const trees = createTrees(map);
  const sway: Swaying[] = trees.sway;
  const fireflies = createFireflies(map);
  let night = 0;
  stage.scene.add(fireflies.points);
  stage.scene.add(terrain.group, water.mesh, trees.group, createRocks(map), createFlowers(map), createBuildings(map));

  const player = makeActor(createActorView(SPRITES.player, 'player'), { x: 12, z: 20 }, map, SPEED);
  stage.scene.add(player.view.root);
  const npcs = new Map<NpcId, Npc>();
  for (const id of NPC_IDS) {
    const npc: Npc = { ...makeActor(createActorView(SPRITES[id], id), HOMES[id], map, NPC_SPEED), id, home: HOMES[id], idle: 1 + Math.random() * 2 };
    npcs.set(id, npc);
    stage.scene.add(npc.view.root);
  }

  const slotGroups = new Map<SlotId, THREE.Group>();
  const slotHit: THREE.Object3D[] = [];
  for (const slot of SLOTS) {
    const g = new THREE.Group();
    g.position.set(slot.x, tileY(map, slot.x, slot.z), slot.z);
    const marker = slotMarker();
    marker.name = 'marker';
    g.add(marker);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.6;
    hit.userData['slot'] = slot.id;
    g.add(hit);
    slotHit.push(hit);
    slotGroups.set(slot.id, g);
    stage.scene.add(g);
  }
  const placed = new Map<SlotId, DecoId | null>();
  const pickups = new Map<string, THREE.Group>();
  const forageCandidates = candidatesOf(map);
  let frozen: NpcId | null = null;
  const raycaster = new THREE.Raycaster();

  const npc = (id: NpcId): Npc => {
    const n = npcs.get(id);
    if (!n) throw new Error(`Unknown NPC ${id}`);
    return n;
  };

  function route(actor: Actor, to: Tile, onArrive: (() => void) | null): boolean {
    const path = findPath(map, roundTile(actor.pos), to);
    if (!path) return false;
    actor.path = path;
    actor.onArrive = onArrive;
    if (path.length === 0 && onArrive) {
      actor.onArrive = null;
      onArrive();
    }
    return true;
  }

  function besideTile(pos: THREE.Vector3, from: THREE.Vector3): Tile | null {
    const t = roundTile(pos);
    const dir = new THREE.Vector3().subVectors(from, pos).setY(0);
    const candidates: Tile[] = [{ x: t.x, z: t.z + 1 }, { x: t.x + 1, z: t.z }, { x: t.x - 1, z: t.z }, { x: t.x, z: t.z - 1 }];
    candidates.sort((a, b) => {
      const da = new THREE.Vector3(a.x - t.x, 0, a.z - t.z).dot(dir);
      const db = new THREE.Vector3(b.x - t.x, 0, b.z - t.z).dot(dir);
      return db - da;
    });
    for (const c of candidates) if (findPath(map, roundTile(from), c)) return c;
    return nearestWalkable(map, t.x, t.z, 2);
  }

  function wander(n: Npc, dt: number): void {
    if (n.path.length > 0 || frozen === n.id) return;
    n.idle -= dt;
    if (n.idle > 0) return;
    n.idle = 2 + Math.random() * 4;
    const tx = n.home.x + Math.round((Math.random() - 0.5) * 5);
    const tz = n.home.z + Math.round((Math.random() - 0.5) * 3);
    const tile = nearestWalkable(map, tx, tz, 1);
    if (tile) route(n, tile, null);
  }

  return {
    map,
    forageCandidates,
    playerPos: player.pos,
    npcView: (id) => npc(id).view,
    pick(ndc) {
      raycaster.setFromCamera(ndc, stage.camera);
      const sprites = [...npcs.values()].map((n) => n.view.sprite);
      const hitNpc = raycaster.intersectObjects(sprites, false)[0];
      if (hitNpc) {
        const id = NPC_IDS.find((i) => i === hitNpc.object.name);
        if (id) return { kind: 'npc', npc: id };
      }
      const hitPickup = raycaster.intersectObjects([...pickups.values()].map((g) => g.getObjectByName('hit')).filter((o): o is THREE.Object3D => o !== undefined), false)[0];
      const spot = hitPickup?.object.userData['spot'];
      const spotGroup = typeof spot === 'string' ? pickups.get(spot) : undefined;
      if (typeof spot === 'string' && spotGroup) return { kind: 'forage', spot, tile: { x: Math.round(spotGroup.position.x), z: Math.round(spotGroup.position.z) } };
      const hitSlot = raycaster.intersectObjects(slotHit, false)[0];
      const slot = hitSlot?.object.userData['slot'];
      if (typeof slot === 'string') {
        const s = SLOTS.find((x) => x.id === slot);
        if (s) return { kind: 'slot', slot: s.id };
      }
      const hitGround = raycaster.intersectObjects(terrain.pickables, false)[0];
      if (hitGround && hitGround.instanceId !== undefined) {
        const tile = terrain.tileOf(hitGround.object, hitGround.instanceId);
        if (tile) return { kind: 'ground', tile };
      }
      return null;
    },
    walkTo(tile, onArrive) {
      const target = nearestWalkable(map, tile.x, tile.z, 1);
      return target ? route(player, target, onArrive ?? null) : false;
    },
    approachNpc(id, onArrive) {
      const n = npc(id);
      n.path = [];
      frozen = id;
      const spot = besideTile(n.pos, player.pos);
      if (!spot || !route(player, spot, onArrive)) onArrive();
    },
    npcSeekPlayer(id, onArrive) {
      const n = npc(id);
      frozen = null;
      const spot = besideTile(player.pos, n.pos);
      player.path = [];
      if (!spot || !route(n, spot, onArrive)) onArrive();
    },
    setFrozen(id) {
      frozen = id;
    },
    facePlayerToward(id) {
      const n = npc(id);
      const dx = n.pos.x - player.pos.x;
      const dz = n.pos.z - player.pos.z;
      player.flip = dx < -0.1;
      player.facing = dz < -0.3 ? 'up' : 'down';
      n.flip = dx > 0.1;
      n.facing = dz > 0.3 ? 'up' : 'down';
    },
    syncDecor(state) {
      for (const slot of SLOTS) {
        const deco = state.decor[slot.id];
        if (placed.get(slot.id) === deco) continue;
        placed.set(slot.id, deco);
        const g = slotGroups.get(slot.id);
        if (!g) continue;
        g.getObjectByName('deco')?.removeFromParent();
        const marker = g.getObjectByName('marker');
        if (marker) marker.visible = deco === null;
        if (deco) {
          const obj = createDeco(deco);
          obj.name = 'deco';
          g.add(obj);
        }
      }
    },
    syncForage(state) {
      const live = new Set(state.forage.map((f) => f.id));
      for (const [id, g] of pickups) {
        if (live.has(id)) continue;
        g.removeFromParent();
        pickups.delete(id);
      }
      for (const f of state.forage) {
        if (pickups.has(f.id)) continue;
        const g = pickupMesh(f.item);
        g.position.set(f.x, tileY(map, f.x, f.z), f.z);
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 8), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.y = 0.45;
        hit.name = 'hit';
        hit.userData['spot'] = f.id;
        g.add(hit);
        g.userData['phase'] = (f.x * 7 + f.z * 3) % 6;
        pickups.set(f.id, g);
        stage.scene.add(g);
      }
    },
    setNight(n) {
      night = n;
      water.setNight(n);
      stage.scene.traverse((o) => {
        if (o.name === 'nightGlow' && (o instanceof THREE.Sprite || o instanceof THREE.Mesh)) {
          const m = o.material;
          if (m instanceof THREE.SpriteMaterial || m instanceof THREE.MeshBasicMaterial) m.opacity = n * Number(o.userData['glow'] ?? 1);
          o.visible = n > 0.02;
        } else if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && typeof o.material.userData['glow'] === 'number') {
          o.material.emissiveIntensity = o.material.userData['glow'] * (1 + n * 1.6);
        } else if (o instanceof THREE.PointLight && typeof o.userData['lamp'] === 'number') {
          o.intensity = o.userData['lamp'] * (0.6 + n * 2.4);
          o.distance = 4 + n * 3;
        }
      });
    },
    update(dt, time, intents) {
      fireflies.update(time, night);
      stepActor(player, map, dt, time);
      for (const n of npcs.values()) {
        wander(n, dt);
        stepActor(n, map, dt, time);
        n.view.setBubble(intents.has(n.id), time);
      }
      for (const s of sway) {
        s.object.rotation.z = Math.sin(time * 1.3 + s.phase) * 0.035;
        s.object.rotation.x = Math.cos(time * 1.1 + s.phase) * 0.025;
      }
      for (const g of slotGroups.values()) {
        const marker = g.getObjectByName('marker');
        if (marker) marker.scale.setScalar(1 + Math.sin(time * 3) * 0.08);
      }
      for (const g of pickups.values()) {
        const phase = Number(g.userData['phase'] ?? 0);
        const body = g.getObjectByName('body');
        if (body) {
          body.position.y = 0.16 + Math.sin(time * 2.4 + phase) * 0.05;
          body.rotation.y = time * 1.2 + phase;
        }
        const glint = g.getObjectByName('glint');
        if (glint) glint.scale.setScalar(1 + ((time * 0.8 + phase) % 1) * 0.6);
      }
      water.update(time);
    },
    teleportPlayer(tile) {
      player.path = [];
      player.pos.set(tile.x, tileY(map, tile.x, tile.z), tile.z);
    },
  };
}
