import * as THREE from 'three';
import { SLOTS } from '../../shared/economy';
import type { DecoId, GameState, NpcId, SlotId } from '../../shared/types';
import { NPC_IDS } from '../../shared/types';
import type { Mood } from '../../shared/violence';
import { createActorView, type ActorView } from '../render/actor';
import { brawlCloud, ghostSprite, weaponSprite } from '../render/brawl';
import { createBuildings } from '../render/buildings';
import { createDeco, slotMarker } from '../render/decor';
import { createBushes, createFlowers, createRocks, createTrees, type Swaying } from '../render/props';
import { createGrass } from '../render/grass';
import { SPRITES } from '../render/sprites';
import type { Stage } from '../render/stage';
import { createTerrain, type Terrain } from '../render/terrain';
import { createWater, type Water } from '../render/water';
import { findPath, generateMap, kindAt, nearestWalkable, surfaceHeight, type Tile, type TileMap } from './map';

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

export type TapTarget = { kind: 'npc'; npc: NpcId } | { kind: 'slot'; slot: SlotId } | { kind: 'ground'; tile: Tile };

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
  setMoods(moods: Record<NpcId, Mood>): void;
  /** Cartoon dust-cloud brawl between the player and an NPC. */
  fight(id: NpcId): Promise<void>;
  /** The NPC lunges with its weapon; `onHit` fires on impact, then the player's ghost floats away. */
  murder(id: NpcId, onHit: () => void): Promise<void>;
  revive(): void;
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
  stage.scene.add(terrain.group, water.mesh, trees.group, grass.mesh, createBushes(map), createRocks(map), createFlowers(map), createBuildings(map));

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
  let cineT = 0;

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
    update(dt, time, intents) {
      if (cine) {
        cineT += dt;
        if (cine(cineT)) cine = null;
      }
      stepActor(player, map, dt, time);
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
      if (stage.quality !== grassQuality) {
        grassQuality = stage.quality;
        grass.setQuality(grassQuality);
      }
    },
    teleportPlayer(tile) {
      player.path = [];
      player.pos.set(tile.x, tileY(map, tile.x, tile.z), tile.z);
    },
    setMoods(next) {
      moods = next;
    },
    fight(id) {
      const n = npc(id);
      frozen = id;
      player.path = [];
      n.path = [];
      const cloud = brawlCloud(SPRITES.player.skin, SPRITES[id].skin);
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
    revive() {
      player.view.setDown(false);
      ghost.visible = false;
      ghost.material.opacity = 1;
    },
  };
}
