import './ui/ui.css';
import { Game } from './game';
import { installDemo } from './demo/script';
import type { Quality } from './world/scene';

function pickQuality(): Quality {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'medium' || q === 'high') return q;
  return window.devicePixelRatio > 2.5 ? 'medium' : 'high';
}

const canvas = document.getElementById('scene');
const ui = document.getElementById('ui');
if (!(canvas instanceof HTMLCanvasElement) || !ui) throw new Error('#scene ou #ui introuvable');

const game = new Game(canvas, ui, pickQuality());
game.start();
installDemo(game);

if (import.meta.env.DEV || new URLSearchParams(location.search).has('fps')) {
  const fps = document.createElement('div');
  fps.className = 'fps';
  document.body.appendChild(fps);
  setInterval(() => (fps.textContent = `${game.world.fps} fps · ${game.world.stage.quality}`), 500);
}
