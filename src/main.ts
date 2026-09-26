import './ui/ui.css';
import { World } from './world/world';
import type { Quality } from './world/scene';

function pickQuality(): Quality {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'medium' || q === 'high') return q;
  return window.devicePixelRatio > 2.5 ? 'medium' : 'high';
}

const canvas = document.getElementById('scene');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#scene introuvable');

const world = new World(canvas, pickQuality(), {
  tapNpc: (id) => console.info('tap npc', id),
  tapPickup: (p) => console.info('pickup', p),
  tapSlot: (s) => console.info('slot', s),
  tapWater: () => console.info('water'),
  arrivedNpc: (id) => console.info('arrived', id),
});
world.setPickups([
  { id: 'p1', itemId: 'pomme', x: -1.5, z: 2.5 },
  { id: 'p2', itemId: 'coquillage', x: -3, z: 8.4 },
  { id: 'p3', itemId: 'figue', x: 5.5, z: 1 },
]);
world.setDecor({ placette: 'fontaine-sculptee', falaise: null, ponton: 'lampadaire-retro', mairie: null, plage: null, verger: null });
world.setBang('josette', true);
world.start();

if (import.meta.env.DEV) {
  const fps = document.createElement('div');
  fps.className = 'fps';
  document.body.appendChild(fps);
  setInterval(() => (fps.textContent = `${world.fps} fps · ${world.stage.quality}`), 500);
}
(window as unknown as { __world: World }).__world = world;
