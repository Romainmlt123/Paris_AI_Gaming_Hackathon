import { CHARACTERS } from '../../shared/characters';
import type { Emotion, NpcId } from '../../shared/types';
import type { SpriteSpec } from '../render/sprites';
import { button, el } from '../ui/dom';
import { bang, flash } from '../ui/overlays';
import { speak, stopSpeaking } from '../voice';
import type { Tile } from './map';
import type { World } from './world';

const SHORE: Tile = { x: 10, z: 26 };
const START: Record<NpcId, Tile> = { josette: { x: 6, z: 23 }, gaston: { x: 15, z: 24 }, marius: { x: 16, z: 25 } };
const CROWD: Record<NpcId, Tile> = { josette: { x: 11, z: 25 }, gaston: { x: 12, z: 26 }, marius: { x: 9, z: 26 } };
const RUN = 4.2;

export interface IntroOptions {
  name: string;
  island: string;
  castaway: SpriteSpec;
  dressed: SpriteSpec;
  /** Faster pacing for the scripted jury demo. */
  short: boolean;
  voices: boolean;
}

/** Arrival cutscene: the castaway washes up naked, the villagers rush in, Gaston sells clothes. Tap « Passer » to skip. */
export async function playIntro(world: World, host: HTMLElement, o: IntroOptions): Promise<void> {
  let skipped = false;
  let wake: () => void = () => undefined;
  const skipSignal = new Promise<void>((r) => (wake = r));
  const root = el('div', 'intro');
  const top = el('div', 'intro-bar intro-top');
  const bottom = el('div', 'intro-bar intro-bottom');
  const line = el('div', 'intro-line');
  const skip = button('intro-skip', 'Passer ›', () => {
    skipped = true;
    stopSpeaking();
    wake();
  });
  bottom.append(line);
  root.append(top, bottom, skip);
  host.append(root);

  const pace = o.short ? 0.6 : 1;
  const wait = (ms: number): Promise<void> => (skipped ? Promise.resolve() : Promise.race([new Promise<void>((r) => setTimeout(r, ms * pace)), skipSignal]));
  const move = (p: Promise<void>): Promise<void> => (skipped ? Promise.resolve() : Promise.race([p, skipSignal]));
  const say = async (who: NpcId | null, text: string, ms: number, emotion: Emotion = 'neutre'): Promise<void> => {
    if (skipped) return;
    line.replaceChildren();
    if (who) line.append(el('b', `intro-who ${who}`, `${CHARACTERS[who].name} : `));
    line.append(document.createTextNode(text));
    line.classList.remove('pop');
    void line.offsetWidth;
    line.classList.add('pop');
    if (who && o.voices) void speak(who, text, emotion);
    await wait(ms);
  };

  world.setScripted(true);
  world.setPlayerSpec(o.castaway);
  world.teleportPlayer(SHORE);
  world.setPlayerDown(true);
  for (const [id, tile] of Object.entries(START) as [NpcId, Tile][]) world.placeNpc(id, tile);

  await say(null, `Quelque part au large… une île nommée ${o.island}.`, 2200);
  if (!skipped) bang(host, 'SPLOUCH !');
  await say(null, 'Une vague dépose quelque chose sur la plage. Quelqu\u2019un. Tout nu.', 2200);
  world.setPlayerDown(false);
  world.face('player', 'up');
  await say(null, `(${o.name} se relève et se gratte les fesses.)`, 1800);
  world.face('player', 'down');
  await say('josette', 'AAAAH ! IL Y A QUELQU\u2019UN TOUT NU SUR LA PLAGE !!', 1400, 'surprise');
  await move(Promise.all([world.walk('josette', CROWD.josette, RUN), world.walk('gaston', CROWD.gaston, RUN), world.walk('marius', CROWD.marius, RUN * 0.7)]).then(() => undefined));
  world.face('josette', 'down', true);
  world.face('marius', 'down', false);
  world.face('gaston', 'down', true);
  await say('josette', `Oh mon chou… Comment tu t\u2019appelles ? ${o.name} ? Attends que je raconte ça à tout le monde !`, 3200, 'joie');
  await say('marius', '… La mer nous rend parfois des choses étranges.', 2400);
  await say('gaston', 'Un client sans poches ! J\u2019ai des fringues, mon ami. À prix d\u2019ami. Presque.', 2800, 'amuse');
  if (!skipped) {
    flash(host);
    bang(host, 'POUF !');
  }
  world.setPlayerSpec(o.dressed);
  await say('gaston', 'Et voilà ! Je te mets ça sur ton ardoise.', 2200, 'joie');

  world.setPlayerDown(false);
  world.setPlayerSpec(o.dressed);
  world.setScripted(false);
  stopSpeaking();
  root.classList.add('leaving');
  setTimeout(() => root.remove(), 400);
}
