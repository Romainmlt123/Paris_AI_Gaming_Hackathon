import * as THREE from 'three';
import { SLOTS } from '../../shared/economy';
import type { DecoId, GameState, NpcId, SlotId } from '../../shared/types';
import { NPC_IDS } from '../../shared/types';
import type { Mood } from '../../shared/violence';
import { createActorView, type ActorView } from '../render/actor';
import { brawlCloud, ghostSprite, handSprite, weaponSprite } from '../render/brawl';
import { chimneyTops, createBuildings } from '../render/buildings';
import { createLife } from '../render/life';
import { createDeco, slotMarker } from '../render/decor';
import { createBushes, createFlowers, createRocks, createTrees, type Swaying } from '../render/props';
import { createGrass } from '../render/grass';
import { SPRITES, type SpriteSpec } from '../render/sprites';
import type { Stage } from '../render/stage';
import { createTerrain, type Terrain } from '../render/terrain';
import { createWater, type Water } from '../render/water';
import { canStep, findPath, generateMap, isWalkable, kindAt, nearestWalkable, surfaceHeight, type Building, type BuildingId, type Tile, type TileMap } from './map';

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
  manual: boolean;
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
  | { kind: 'building'; building: BuildingId }
  | { kind: 'water'; tile: Tile }
  | { kind: 'ground'; tile: Tile };

/** Walkable tile right in front of a building's door. */
export function doorTile(b: Building): Tile {
  return { x: b.x + Math.round((b.w - 1) / 2), z: b.z + b.d };
}

export interface FishSpot {
  /** Shore tile the player stands on. */
  stand: Tile;
  /** Water tile where the bobber lands. */
  spot: Tile;
}

export interface World {
  map: TileMap;
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
  update(dt: number, time: number, intents: Set<NpcId>): void;
  teleportPlayer(tile: Tile): void;
  /** Direct (keyboard) movement; (0, 0) stops. Ignored during cutscenes. */
  move(dx: number, dz: number, dt: number): void;
  /** Closest NPC within `range` tiles of the player. */
  nearestNpc(range: number): NpcId | null;
  setMoods(moods: Record<NpcId, Mood>): void;
  /** The NPC slaps the player: quick lunge, swinging palm, knockback; `onHit` fires on impact. */
  slap(id: NpcId, onHit: () => void): Promise<void>;
  /** Cartoon dust-cloud brawl between the player and an NPC. */
  fight(id: NpcId): Promise<void>;
  /** The NPC lunges with its weapon; `onHit` fires on impact, then the player's ghost floats away. */
  murder(id: NpcId, onHit: () => void): Promise<void>;
  revive(): void;
  setPlayerSpec(spec: SpriteSpec): void;
  /** Building whose door the player stands in front of. */
  doorHere(): BuildingId | null;
  setPlayerSkin(skin: PlayerSkin): void;
  /** Closest shore tile (and the water next to it) within `radius` of `near`. */
  fishSpot(near: Tile, radius: number): FishSpot | null;
  /** Show the line and bobber (`bite` makes it plunge); null reels everything in. */
  setFishing(spot: Tile | null, bite?: boolean): void;
  /** Cutscene mode: NPCs stop wandering and only move when scripted. */
  setScripted(on: boolean): void;
  placeNpc(id: NpcId, tile: Tile): void;
  /** Scripted walk; resolves on arrival (or immediately if unreachable). */
  walk(who: 'player' | NpcId, tile: Tile, speed?: number): Promise<void>;
  face(who: 'player' | NpcId, facing: 'down' | 'up', flip?: boolean): void;
  setPlayerDown(down: boolean): void;
  /** Shows a raft at `pos` (null hides it); while `riding`, the player stands on it. */
  setRaft(pos: THREE.Vector3 | null, riding: boolean): void;
}

export type PlayerSkin = 'player' | 'castaway';

function tileY(map: TileMap, x: number, z: number): number {
  return surfaceHeight(kindAt(map, Math.round(x), Math.round(z)));
}

function makeActor(view: ActorView, tile: Tile, map: TileMap, speed: number): Actor {
  return { view, pos: new THREE.Vector3(tile.x, tileY(map, tile.x, tile.z), tile.z), path: [], facing: 'down', flip: false, speed, onArrive: null, manual: false };
}

function raftMesh(): THREE.Group {
  const g = new THREE.Group();
  const wood = ['#8a5a36', '#a06a40', '#7a4c2c', '#96623a'];
  wood.forEach((c, i) => {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.3, 8), new THREE.MeshLambertMaterial({ color: c }));
    log.rotation.x = Math.PI / 2;
    log.position.set(-0.36 + i * 0.24, 0.05, 0);
    log.castShadow = true;
    g.add(log);
  });
  const rope = new THREE.MeshLambertMaterial({ color: '#d9c38c' });
  for (const z of [-0.42, 0.42]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.05, 0.08), rope);
    bar.position.set(0, 0.16, z);
    g.add(bar);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), new THREE.MeshLambertMaterial({ color: '#6b4428' }));
  mast.position.set(0.38, 0.6, -0.38);
  g.add(mast);
  const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.3), new THREE.MeshLambertMaterial({ color: '#5fb04a', side: THREE.DoubleSide }));
  leaf.position.set(0.6, 1.0, -0.38);
  g.add(leaf);
  return g;
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
  actor.view.setPose(actor.path.length > 0 || actor.manual, actor.facing, actor.flip, time);
}

const WATER_Y = -0.1;

/** Line, red-and-white bobber, ripple and a fish shadow that circles in before the bite. */
function fishingRig(): { group: THREE.Group; set(spot: Tile | null, bite: boolean): void; update(time: number, hand: THREE.Vector3): void } {
  const group = new THREE.Group();
  group.visible = false;
  const bobber = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#e0443a' }));
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#fbf8f0' }));
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 4), new THREE.MeshLambertMaterial({ color: '#2b2233' }));
  stick.position.y = 0.1;
  bobber.add(top, bottom, stick);
  bobber.scale.setScalar(1.8);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), new THREE.MeshBasicMaterial({ color: '#12324a', transparent: true, opacity: 0.45, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 0.45, 1);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#f4efe4' }));
  const poleGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const pole = new THREE.Line(poleGeo, new THREE.LineBasicMaterial({ color: '#7a4a2a' }));
  group.add(bobber, ring, shadow, line, pole);
  const at = new THREE.Vector3();
  let bite = false;
  let since = 0;
  return {
    group,
    set(spot, nextBite) {
      group.visible = spot !== null;
      if (spot) at.set(spot.x, WATER_Y, spot.z);
      if (nextBite !== bite || !spot) since = 0;
      bite = nextBite;
    },
    update(time, hand) {
      if (!group.visible) return;
      since += 1 / 60;
      const dip = bite ? -0.07 - Math.abs(Math.sin(time * 18)) * 0.05 : Math.sin(time * 2.4) * 0.015;
      bobber.position.set(at.x, at.y + dip, at.z);
      const pulse = bite ? (time * 3) % 1 : (time * 0.7) % 1;
      ring.position.set(at.x, WATER_Y + 0.01, at.z);
      ring.scale.setScalar(1 + pulse * (bite ? 2.5 : 1.2));
      ring.material.opacity = (1 - pulse) * (bite ? 0.9 : 0.4);
      const r = bite ? 0.12 : 0.5 + Math.max(0, 0.6 - since * 0.1);
      shadow.position.set(at.x + Math.cos(time * 0.9) * r, WATER_Y - 0.02, at.z + Math.sin(time * 0.9) * r * 0.6);
      shadow.rotation.z = -time * 0.9;
      const tip = new THREE.Vector3(hand.x + (at.x > hand.x ? 0.45 : -0.45), hand.y + 1.35, hand.z);
      const mid = tip.clone().lerp(bobber.position, 0.5);
      mid.y -= 0.25;
      lineGeo.setFromPoints([tip, mid, bobber.position.clone().setY(bobber.position.y + 0.1)]);
      poleGeo.setFromPoints([new THREE.Vector3(hand.x + (at.x > hand.x ? 0.12 : -0.12), hand.y + 0.75, hand.z + 0.05), tip]);
    },
  };
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
  const grass = createGrass(map);
  let grassQuality = stage.quality;
  grass.setQuality(grassQuality);
  stage.scene.add(terrain.group, water.mesh, trees.group, grass.mesh, createBushes(map), createRocks(map), createFlowers(map));
  const buildings = createBuildings(map);
  stage.scene.add(buildings);
  const life = createLife(map, chimneyTops(map));
  stage.scene.add(life.group);
  const rod = fishingRig();
  stage.scene.add(rod.group);

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
  let frozen: NpcId | null = null;
  const raycaster = new THREE.Raycaster();
  let moods: Record<NpcId, Mood> = { gaston: null, josette: null, marius: null };
  const ghost = ghostSprite();
  stage.scene.add(ghost);
  let cine: ((t: number) => boolean) | null = null;
  let scripted = false;
  let playerSpec: SpriteSpec = SPRITES.player;
  let cineT = 0;
  const raft = raftMesh();
  raft.visible = false;
  stage.scene.add(raft);
  let riding = false;

  function play(step: (t: number) => boolean): Promise<void> {
    return new Promise((resolve) => {
      cineT = 0;
      cine = (t) => {
        const done = step(t);
        if (done) resolve();
        return done;
      };
    });
  }

  function disposeSprite(s: THREE.Sprite): void {
    s.removeFromParent();
    s.material.map?.dispose();
    s.material.dispose();
  }

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
    if (n.path.length > 0 || frozen === n.id || scripted) return;
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
    playerPos: player.pos,
    npcView: (id) => npc(id).view,
    setPlayerSkin(skin) {
      player.view.setSkin(SPRITES[skin]);
    },
    setPlayerSpec(spec) {
      playerSpec = spec;
      player.view.setSkin(spec);
    },
    setScripted(on) {
      scripted = on;
      for (const n of npcs.values()) {
        n.speed = NPC_SPEED;
        if (on) n.path = [];
      }
      player.speed = SPEED;
    },
    placeNpc(id, tile) {
      const n = npc(id);
      n.path = [];
      n.pos.set(tile.x, tileY(map, tile.x, tile.z), tile.z);
    },
    walk(who, tile, speed) {
      const actor = who === 'player' ? player : npc(who);
      if (speed) actor.speed = speed;
      return new Promise((resolve) => {
        if (!route(actor, tile, resolve)) resolve();
      });
    },
    face(who, facing, flip = false) {
      const actor = who === 'player' ? player : npc(who);
      actor.facing = facing;
      actor.flip = flip;
    },
    setPlayerDown(down) {
      player.view.setDown(down);
    },
    setRaft(pos, ride) {
      raft.visible = pos !== null;
      if (pos) raft.position.copy(pos);
      riding = ride && pos !== null;
      if (riding) player.path = [];
    },
    pick(ndc) {
      raycaster.setFromCamera(ndc, stage.camera);
      const sprites = [...npcs.values()].map((n) => n.view.sprite);
      const hitNpc = raycaster.intersectObjects(sprites, false)[0];
      if (hitNpc) {
        const id = NPC_IDS.find((i) => i === hitNpc.object.name);
        if (id) return { kind: 'npc', npc: id };
      }
      const hitSlot = raycaster.intersectObjects(slotHit, false)[0];
      const slot = hitSlot?.object.userData['slot'];
      if (typeof slot === 'string') {
        const s = SLOTS.find((x) => x.id === slot);
        if (s) return { kind: 'slot', slot: s.id };
      }
      const hitBuilding = raycaster.intersectObject(buildings, true)[0];
      for (let o: THREE.Object3D | null = hitBuilding?.object ?? null; o; o = o.parent) {
        const b = map.buildings.find((x) => x.id === o?.userData['building']);
        if (b) return { kind: 'building', building: b.id };
      }
      const hitGround = raycaster.intersectObjects(terrain.pickables, false)[0];
      if (hitGround && hitGround.instanceId !== undefined) {
        const tile = terrain.tileOf(hitGround.object, hitGround.instanceId);
        if (tile) return { kind: 'ground', tile };
      }
      const hitWater = raycaster.intersectObject(water.mesh, false)[0];
      if (hitWater) return { kind: 'water', tile: { x: Math.round(hitWater.point.x), z: Math.round(hitWater.point.z) } };
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
    update(dt, time, intents) {
      if (cine) {
        cineT += dt;
        if (cine(cineT)) cine = null;
      }
      if (raft.visible) {
        raft.rotation.z = Math.sin(time * 1.7) * 0.05;
        raft.rotation.x = Math.cos(time * 1.3) * 0.04;
        raft.position.y = -0.1 + Math.sin(time * 2.1) * 0.04;
      }
      if (riding) {
        player.pos.set(raft.position.x, raft.position.y + 0.14, raft.position.z);
        player.view.root.position.copy(player.pos);
        player.view.setPose(false, player.facing, player.flip, time);
      } else stepActor(player, map, dt, time);
      for (const n of npcs.values()) {
        wander(n, dt);
        stepActor(n, map, dt, time);
        n.view.setBubble(intents.has(n.id), time);
        n.view.setMood(moods[n.id], time);
      }
      for (const s of sway) {
        s.object.rotation.z = Math.sin(time * 1.3 + s.phase) * 0.035;
        s.object.rotation.x = Math.cos(time * 1.1 + s.phase) * 0.025;
      }
      for (const g of slotGroups.values()) {
        const marker = g.getObjectByName('marker');
        if (marker) marker.scale.setScalar(1 + Math.sin(time * 3) * 0.08);
      }
      water.update(time);
      grass.update(time);
      life.update(dt, time);
      rod.update(time, player.pos);
      if (stage.quality !== grassQuality) {
        grassQuality = stage.quality;
        grass.setQuality(grassQuality);
      }
    },
    doorHere() {
      const t = roundTile(player.pos);
      return map.buildings.find((b) => {
        const d = doorTile(b);
        return d.x === t.x && d.z === t.z;
      })?.id ?? null;
    },
    teleportPlayer(tile) {
      player.path = [];
      player.pos.set(tile.x, tileY(map, tile.x, tile.z), tile.z);
    },
    move(dx, dz, dt) {
      player.manual = (dx !== 0 || dz !== 0) && !cine;
      if (!player.manual) return;
      player.path = [];
      player.onArrive = null;
      const len = Math.hypot(dx, dz);
      const step = (SPEED * dt) / len;
      const from = roundTile(player.pos);
      const tryAxis = (nx: number, nz: number): void => {
        const to = { x: Math.round(nx), z: Math.round(nz) };
        const same = to.x === from.x && to.z === from.z;
        if (same || canStep(map, from, to)) {
          player.pos.x = nx;
          player.pos.z = nz;
        }
      };
      tryAxis(player.pos.x + dx * step, player.pos.z);
      tryAxis(player.pos.x, player.pos.z + dz * step);
      if (Math.abs(dz) > 0.01) player.facing = dz < 0 ? 'up' : 'down';
      if (Math.abs(dx) > 0.01) player.flip = dx < 0;
    },
    nearestNpc(range) {
      let best: NpcId | null = null;
      let bestD = range;
      for (const n of npcs.values()) {
        const d = Math.hypot(n.pos.x - player.pos.x, n.pos.z - player.pos.z);
        if (d <= bestD) {
          bestD = d;
          best = n.id;
        }
      }
      return best;
    },
    setMoods(next) {
      moods = next;
    },
    slap(id, onHit) {
      const n = npc(id);
      const wasFrozen = frozen;
      frozen = id;
      player.path = [];
      n.path = [];
      const hand = handSprite(SPRITES[id].skin);
      hand.visible = true;
      stage.scene.add(hand);
      const start = n.pos.clone();
      const home = player.pos.clone();
      const away = new THREE.Vector3().subVectors(player.pos, n.pos).setY(0).normalize();
      const knock = home.clone().addScaledVector(away, 0.35);
      const lunge = n.pos.clone().lerp(player.pos, 0.3);
      const side = away.x >= 0 ? 1 : -1;
      let hit = false;
      return play((t) => {
        if (t < 0.25) n.pos.lerpVectors(start, lunge, t / 0.25);
        else if (t > 0.6) n.pos.lerpVectors(lunge, start, Math.min(1, (t - 0.6) / 0.3));
        const k = THREE.MathUtils.clamp((t - 0.15) / 0.2, 0, 1);
        hand.position.set(
          THREE.MathUtils.lerp(n.pos.x - side * 0.4, player.pos.x, k),
          player.pos.y + 1.1 + Math.sin(k * Math.PI) * 0.35,
          THREE.MathUtils.lerp(n.pos.z, player.pos.z, k) + 0.05,
        );
        hand.material.rotation = side * (1.4 - k * 2.2);
        if (!hit && t >= 0.35) {
          hit = true;
          stage.shake(0.45);
          player.flip = side > 0;
          onHit();
        }
        if (hit) {
          const b = Math.min(1, (t - 0.35) / 0.12);
          const back = Math.max(0, (t - 0.55) / 0.35);
          player.pos.lerpVectors(home, knock, back > 0 ? Math.max(0, 1 - back) : b);
          hand.material.opacity = Math.max(0, 1 - (t - 0.45) * 3);
        }
        if (t < 0.95) return false;
        player.pos.copy(home);
        disposeSprite(hand);
        frozen = wasFrozen;
        return true;
      });
    },
    fight(id) {
      const n = npc(id);
      frozen = id;
      player.path = [];
      n.path = [];
      const cloud = brawlCloud(playerSpec.skin, SPRITES[id].skin);
      const mid = player.pos.clone().lerp(n.pos, 0.5);
      cloud.sprite.visible = true;
      stage.scene.add(cloud.sprite);
      player.view.root.visible = false;
      n.view.root.visible = false;
      let last = -1;
      return play((t) => {
        const tick = Math.floor(t * 12);
        if (tick !== last) {
          last = tick;
          cloud.tick();
          if (tick % 3 === 0) stage.shake(0.3);
        }
        cloud.sprite.position.set(mid.x + Math.sin(t * 7) * 0.35, mid.y + 0.9 + Math.abs(Math.sin(t * 13)) * 0.18, mid.z + Math.cos(t * 5) * 0.15);
        if (t < 3.4) return false;
        disposeSprite(cloud.sprite);
        player.view.root.visible = true;
        n.view.root.visible = true;
        return true;
      });
    },
    murder(id, onHit) {
      const n = npc(id);
      frozen = id;
      player.path = [];
      n.path = [];
      const weapon = weaponSprite(id);
      weapon.visible = true;
      stage.scene.add(weapon);
      const start = n.pos.clone();
      const lunge = player.pos.clone().lerp(n.pos, 0.45);
      let hit = false;
      return play((t) => {
        if (t < 0.6) n.pos.lerpVectors(start, lunge, t / 0.6);
        const k = THREE.MathUtils.clamp((t - 0.6) / 0.2, 0, 1);
        weapon.position.set(
          THREE.MathUtils.lerp(n.pos.x, player.pos.x, k),
          n.pos.y + 2.1 - k * 1.1,
          THREE.MathUtils.lerp(n.pos.z, player.pos.z, k),
        );
        weapon.material.rotation = 0.9 - k * 2.4 + (t < 0.6 ? Math.sin(t * 24) * 0.25 : 0);
        if (!hit && t >= 0.8) {
          hit = true;
          stage.shake(1);
          player.view.setDown(true);
          onHit();
        }
        weapon.visible = t < 1.6;
        if (t >= 1.3) {
          const g = (t - 1.3) / 2;
          ghost.visible = true;
          ghost.position.set(player.pos.x + Math.sin(t * 3) * 0.15, player.pos.y + 0.5 + g * 1.8, player.pos.z);
          ghost.material.opacity = 1 - Math.max(0, g - 0.5) * 2;
        }
        if (t < 3.6) return false;
        disposeSprite(weapon);
        ghost.visible = false;
        return true;
      });
    },
    fishSpot(near, radius) {
      let best: FishSpot | null = null;
      let bestD = Infinity;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const x = near.x + dx;
          const z = near.z + dz;
          const k = kindAt(map, x, z);
          if (!isWalkable(map, x, z) || k === 'plateau' || k === 'stairs') continue;
          const wet = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([ax = 0, az = 0]) => ({ x: x + ax, z: z + az })).find((t) => kindAt(map, t.x, t.z) === 'water');
          if (!wet) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            const far = { x: wet.x * 2 - x, z: wet.z * 2 - z };
            best = { stand: { x, z }, spot: kindAt(map, far.x, far.z) === 'water' ? { x: (wet.x + far.x) / 2, z: (wet.z + far.z) / 2 } : wet };
          }
        }
      }
      return best;
    },
    setFishing(spot, bite = false) {
      rod.set(spot, bite);
      if (spot) {
        player.path = [];
        const dx = spot.x - player.pos.x;
        const dz = spot.z - player.pos.z;
        if (Math.abs(dx) > 0.1) player.flip = dx < 0;
        player.facing = dz < -0.3 ? 'up' : 'down';
      }
    },
    revive() {
      player.view.setDown(false);
      ghost.visible = false;
      ghost.material.opacity = 1;
    },
  };
}
