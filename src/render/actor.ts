import * as THREE from 'three';
import type { Mood } from '../../shared/violence';
import { moodSprite } from './brawl';
import { drawSheet, FRAME_H, FRAME_W, setFrame, sheetTexture, type Facing, type SpriteSpec } from './sprites';

const HEIGHT = 1.5;

export interface ActorView {
  root: THREE.Group;
  sprite: THREE.Mesh;
  sheet: HTMLCanvasElement;
  bubble: THREE.Sprite;
  setPose(walking: boolean, facing: Facing, flip: boolean, time: number): void;
  setBubble(visible: boolean, time: number): void;
  setMood(mood: Mood, time: number): void;
  /** Knocked out: sprite lies flat on the ground. */
  setDown(down: boolean): void;
  setSkin(spec: SpriteSpec): void;
}

function bubbleSprite(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 20;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#2b2233';
  ctx.fillRect(2, 0, 12, 16);
  ctx.fillRect(6, 16, 4, 3);
  ctx.fillStyle = '#ffd25e';
  ctx.fillRect(3, 1, 10, 14);
  ctx.fillStyle = '#2b2233';
  ctx.fillRect(7, 3, 2, 7);
  ctx.fillRect(7, 11, 2, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(0.4, 0.5, 1);
  s.position.y = HEIGHT + 0.45;
  s.renderOrder = 10;
  s.visible = false;
  return s;
}

const MOSAIC = ['#e9b896', '#d99a7a', '#c9856a', '#f0c7a6', '#b8735e', '#e0a98c', '#f4a3a3', '#a8604f'];
const MOSAIC_COLS = 7;
const MOSAIC_ROWS = 4;

/** Oversized, flickering pixel censor block worn by the naked castaway. */
function censorMosaic(): { mesh: THREE.Mesh; update(time: number): void } {
  const cell = 3;
  const c = document.createElement('canvas');
  c.width = MOSAIC_COLS * cell + 2;
  c.height = MOSAIC_ROWS * cell + 2;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (): void => {
    ctx.fillStyle = '#2b2233';
    ctx.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < MOSAIC_ROWS; y++) for (let x = 0; x < MOSAIC_COLS; x++) {
      ctx.fillStyle = MOSAIC[Math.floor(Math.random() * MOSAIC.length)] ?? '#f2c3a6';
      ctx.fillRect(1 + x * cell, 1 + y * cell, cell, cell);
    }
    tex.needsUpdate = true;
  };
  draw();
  const w = 0.78;
  const h = (w * c.height) / c.width;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  mesh.position.set(0, 0.34, 0.04);
  mesh.renderOrder = 5;
  mesh.visible = false;
  let tick = -1;
  return {
    mesh,
    update(time) {
      const t = Math.floor(time * 9);
      if (t !== tick) {
        tick = t;
        draw();
      }
      const pulse = 1 + Math.sin(time * 14) * 0.07;
      mesh.scale.set(pulse, 2 - pulse, 1);
      mesh.rotation.z = Math.sin(time * 5) * 0.06;
    },
  };
}

/** Pixel-art billboard (Y-axis only) that casts a silhouette-accurate shadow. */
export function createActorView(spec: SpriteSpec, name: string): ActorView {
  const sheet = drawSheet(spec);
  const tex = sheetTexture(sheet);
  const width = (HEIGHT * FRAME_W) / FRAME_H;
  const geo = new THREE.PlaneGeometry(width, HEIGHT);
  geo.translate(0, HEIGHT / 2, 0);
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  const sprite = new THREE.Mesh(geo, mat);
  sprite.castShadow = true;
  sprite.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  sprite.name = name;
  const root = new THREE.Group();
  root.add(sprite);
  const bubble = bubbleSprite();
  root.add(bubble);
  setFrame(tex, 0, 'down');
  const censor = censorMosaic();
  root.add(censor.mesh);
  let naked = spec.naked === true;
  let down = false;
  const moods = {
    heart: moodSprite('heart'),
    storm: moodSprite('storm'),
    skull: moodSprite('skull'),
  };
  for (const m of Object.values(moods)) {
    m.position.set(0.42, HEIGHT + 0.1, 0);
    root.add(m);
  }
  return {
    root,
    sprite,
    sheet,
    bubble,
    setPose(walking, facing, flip, time) {
      const frame = walking ? 1 + (Math.floor(time * 8) % 2) : 0;
      setFrame(tex, frame, facing);
      sprite.scale.x = flip ? -1 : 1;
      censor.mesh.visible = naked && facing === 'down' && !down;
      if (censor.mesh.visible) {
        censor.update(time);
        censor.mesh.position.y = 0.34 - (walking ? 0.03 : 0);
      }
    },
    setBubble(visible, time) {
      bubble.visible = visible;
      bubble.position.y = HEIGHT + 0.45 + Math.sin(time * 5) * 0.06;
    },
    setMood(mood, time) {
      for (const [key, m] of Object.entries(moods)) {
        m.visible = key === mood;
        if (m.visible) m.position.y = HEIGHT + 0.1 + Math.abs(Math.sin(time * (mood === 'skull' ? 6 : 3))) * 0.08;
      }
    },
    setSkin(next) {
      const ctx = sheet.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, sheet.width, sheet.height);
      ctx.drawImage(drawSheet(next), 0, 0);
      tex.needsUpdate = true;
      naked = next.naked === true;
    },
    setDown(isDown) {
      down = isDown;
      sprite.rotation.x = down ? -Math.PI / 2 : 0;
      sprite.position.y = down ? 0.05 : 0;
    },
  };
}
