import * as THREE from 'three';
import type { SpriteSpec } from '../render/sprites';
import { button, el } from '../ui/dom';
import { bang, flash } from '../ui/overlays';
import { kindAt, PONTOON_X, type Tile } from './map';
import type { World } from './world';

export interface IntroOptions {
  name: string;
  island: string;
  spec: SpriteSpec;
  /** Faster pacing for the scripted jury demo. */
  short: boolean;
}

interface Card {
  kicker: string;
  big: string;
  sub: string;
  ms: number;
}

const DRIFT = 18;

function pontoonEnd(world: World): Tile {
  let z = 0;
  for (let i = 0; i < world.map.h; i++) if (kindAt(world.map, PONTOON_X, i) === 'pontoon') z = i;
  return { x: PONTOON_X, z };
}

/** Arrival cutscene: the naked player drifts on a raft while the rules are pitched, then runs aground at the pontoon. */
export async function playIntro(world: World, host: HTMLElement, o: IntroOptions): Promise<void> {
  let skipped = false;
  let wake: () => void = () => undefined;
  const skipSignal = new Promise<void>((r) => (wake = r));
  const root = el('div', 'intro');
  const card = el('div', 'intro-card');
  const skip = button('intro-skip', 'Passer ›', () => {
    skipped = true;
    wake();
  });
  root.append(el('div', 'intro-bar intro-top'), el('div', 'intro-bar intro-bottom'), card, skip);
  host.append(root);

  const pace = o.short ? 0.6 : 1;
  const wait = (ms: number): Promise<void> => (skipped ? Promise.resolve() : Promise.race([new Promise<void>((r) => setTimeout(r, ms * pace)), skipSignal]));
  const show = async (c: Card): Promise<void> => {
    if (skipped) return;
    card.replaceChildren(el('div', 'intro-kicker', c.kicker), el('div', 'intro-big', c.big), el('div', 'intro-sub', c.sub));
    card.classList.remove('in');
    void card.offsetWidth;
    card.classList.add('in');
    await wait(c.ms);
  };

  const dock = pontoonEnd(world);
  const beach = new THREE.Vector3(dock.x + 0.9, -0.1, dock.z + 0.6);
  const sea = new THREE.Vector3(dock.x + 2.5, -0.1, dock.z + DRIFT);
  const cards: Card[] = [
    { kicker: 'Quelque part au large…', big: 'TOUT NU. SUR UN RADEAU.', sub: 'Pas de fringues. Pas de sous. Pas de plan.', ms: 3600 },
    { kicker: 'Droit devant', big: o.island.toUpperCase(), sub: 'Trois habitants. Des ragots à la pelle.', ms: 3400 },
    { kicker: 'Objectif', big: 'FAIS DE TON ÎLE LA PLUS BELLE', sub: 'Gagne des clochettes, décore, grimpe en prestige.', ms: 3800 },
    { kicker: 'Comment ?', big: 'PARLE AUX HABITANTS', sub: 'Ils se souviennent de tout. Et ils le répètent… en pire.', ms: 3800 },
    { kicker: 'Attention', big: 'CHAQUE MOT COMPTE', sub: 'Fais-toi tes meilleurs amis… ou tes pires ennemis.', ms: 4200 },
  ];
  const total = cards.reduce((t, c) => t + c.ms, 0) * pace;

  world.setScripted(true);
  world.setPlayerSpec(o.spec);
  world.setPlayerDown(false);
  world.face('player', 'up');
  world.setRaft(sea.clone(), true);

  const pos = new THREE.Vector3();
  const start = performance.now();
  let raf = 0;
  const drift = (): void => {
    const k = Math.min(1, (performance.now() - start) / total);
    const e = 1 - (1 - k) ** 2;
    pos.lerpVectors(sea, beach, e);
    pos.x += Math.sin(k * Math.PI * 3) * 0.6 * (1 - k);
    world.setRaft(pos, true);
    if (k < 1 && !skipped) raf = requestAnimationFrame(drift);
  };
  raf = requestAnimationFrame(drift);

  for (const c of cards) await show(c);
  cancelAnimationFrame(raf);
  world.setRaft(beach, true);

  if (!skipped) {
    flash(host);
    bang(host, 'BONK !');
    await wait(500);
  }
  world.setRaft(beach, false);
  world.teleportPlayer(dock);
  world.face('player', 'up');
  await show({ kicker: `Bienvenue sur ${o.island}`, big: o.name.toUpperCase(), sub: '(toujours tout nu)', ms: 2600 });

  world.setScripted(false);
  root.classList.add('leaving');
  setTimeout(() => root.remove(), 450);
}
