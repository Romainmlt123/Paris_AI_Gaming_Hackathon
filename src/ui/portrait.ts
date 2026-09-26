import { characterSheet, LOOKS } from '../world/sprites';
import type { Emotion } from '../state/types';

const S = 20; // buste 20×20 px (vue de face, frame de repos), agrandi en CSS avec image-rendering: pixelated
const OX = 2; // décalage horizontal du recadrage dans la planche

/** Portrait pixel art du buste, avec une expression dessinée par-dessus selon l'émotion. */
export function drawPortrait(canvas: HTMLCanvasElement, key: keyof typeof LOOKS, emotion: Emotion, swollen = false): void {
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, S, S);
  const sheet = characterSheet(key, swollen).image as HTMLCanvasElement;
  ctx.drawImage(sheet, OX, 0, S, S, 0, 0, S, S);
  const L = LOOKS[key];
  const eye = '#2a1b22';
  // Coordonnées exprimées dans la planche (voir pixelChars : yeux en x 8-9 / 14-15, y 9-11 ; bouche y 13).
  const px = (x: number, y: number, c: string, w = 1, h = 1): void => {
    ctx.fillStyle = c;
    ctx.fillRect(x - OX, y, w, h);
  };
  const closeEyes = (): void => {
    px(8, 9, L.skin, 2, 3);
    px(14, 9, L.skin, 2, 3);
  };
  switch (emotion) {
    case 'joie':
      closeEyes();
      px(8, 10, eye, 2);
      px(14, 10, eye, 2);
      px(7, 11, eye);
      px(10, 11, eye);
      px(13, 11, eye);
      px(16, 11, eye);
      px(10, 13, eye);
      px(13, 13, eye);
      px(11, 14, eye, 2);
      break;
    case 'colere':
      px(7, 7, eye, 2);
      px(9, 8, eye);
      px(15, 7, eye, 2);
      px(14, 8, eye);
      px(11, 13, eye, 2);
      px(10, 14, eye);
      px(13, 14, eye);
      px(6, 11, '#e0412f', 2);
      px(16, 11, '#e0412f', 2);
      break;
    case 'tristesse':
      px(8, 8, eye);
      px(9, 7, eye);
      px(15, 8, eye);
      px(14, 7, eye);
      px(9, 12, '#7ec8f0', 1, 2);
      px(11, 14, eye, 2);
      break;
    case 'surprise':
      px(8, 8, eye, 2);
      px(14, 8, eye, 2);
      px(11, 13, eye, 2, 2);
      break;
    case 'mefiance':
      px(8, 9, L.skin, 2);
      px(14, 9, L.skin, 2);
      px(7, 8, eye, 3);
      px(14, 8, eye, 3);
      px(12, 13, eye, 2);
      break;
    case 'gene':
      px(6, 11, '#f07a7a', 3);
      px(15, 11, '#f07a7a', 3);
      px(10, 13, eye);
      px(11, 14, eye);
      px(12, 13, eye);
      px(13, 14, eye);
      break;
    case 'moquerie':
      px(14, 9, L.skin, 2, 3);
      px(14, 10, eye, 2);
      px(11, 13, eye, 3);
      px(13, 12, eye);
      px(12, 14, '#e0412f');
      break;
    case 'neutre':
      break;
  }
}
