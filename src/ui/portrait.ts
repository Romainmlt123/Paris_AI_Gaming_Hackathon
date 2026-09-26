import { characterSheet, LOOKS } from '../world/sprites';
import type { Emotion } from '../state/types';

const S = 16; // zone du buste (16×16 px) agrandie en CSS avec image-rendering: pixelated

/** Portrait pixel art du buste, avec une expression dessinée par-dessus selon l'émotion. */
export function drawPortrait(canvas: HTMLCanvasElement, key: keyof typeof LOOKS, emotion: Emotion, swollen = false): void {
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, S, S);
  const sheet = characterSheet(key, swollen).image as HTMLCanvasElement;
  ctx.drawImage(sheet, 0, 0, 16, 16, 0, 0, S, S);
  const o = LOOKS[key].outline;
  const px = (x: number, y: number, c: string, w = 1, hh = 1): void => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, hh);
  };
  // Tête : y 2..11 ; yeux en (5,7) et (10,7).
  switch (emotion) {
    case 'joie':
      px(6, 10, o, 4);
      px(5, 9, o);
      px(10, 9, o);
      break;
    case 'colere':
      px(4, 6, o, 2);
      px(10, 6, o, 2);
      px(6, 10, o, 4);
      px(4, 9, '#e0412f');
      px(11, 9, '#e0412f');
      break;
    case 'tristesse':
      px(6, 10, o, 4);
      px(10, 9, '#7ec8f0', 1, 2);
      break;
    case 'surprise':
      px(7, 9, o, 2, 2);
      break;
    case 'mefiance':
      px(5, 7, LOOKS[key].skin);
      px(10, 7, LOOKS[key].skin);
      px(4, 6, o, 3);
      px(9, 6, o, 3);
      px(7, 10, o, 3);
      break;
    case 'gene':
      px(4, 9, '#f07a7a', 2);
      px(10, 9, '#f07a7a', 2);
      px(7, 10, o, 2);
      break;
    case 'moquerie':
      px(6, 10, o, 4);
      px(10, 9, o);
      px(8, 11, '#e0412f', 2);
      break;
    case 'neutre':
      px(7, 10, o, 2);
      break;
  }
}
