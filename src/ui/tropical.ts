import { el } from './dom';

const W = 200;
const H = 120;
const HORIZON = 74;
const SKY = ['#6a3f8f', '#8e4a98', '#c2548e', '#ec6f84', '#ff9477', '#ffb77a', '#ffd79a'];
const SEA = ['#58c7cf', '#3fb0c0', '#2f93ad', '#2b7f9e', '#236b8c'];
const PALM = '#3b2346';

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

function sky(px: Px): void {
  const band = HORIZON / SKY.length;
  SKY.forEach((c, i) => {
    const y = Math.floor(i * band);
    px(0, y, W, Math.ceil(band) + 1, c);
    const next = SKY[i + 1];
    if (next) for (let x = (i % 2) * 2; x < W; x += 4) px(x, Math.floor((i + 1) * band) - 1, 2, 1, next);
  });
}

function sun(px: Px, t: number): void {
  const cx = 100;
  const cy = HORIZON - 4;
  const r = 24;
  for (let y = -r; y <= 0; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    const gap = y > -12 && (y + Math.floor(t * 2)) % 4 === 0;
    if (!gap) px(cx - half, cy + y, half * 2, 1, y < -14 ? '#fff2a8' : '#ffe07a');
  }
}

function cloud(px: Px, x: number, y: number): void {
  px(x, y, 18, 3, '#ffd2b0');
  px(x + 4, y - 2, 9, 2, '#ffe3c8');
  px(x + 2, y + 3, 20, 1, '#f7a98f');
}

function sea(px: Px, t: number): void {
  const band = (H - HORIZON) / SEA.length;
  SEA.forEach((c, i) => px(0, HORIZON + Math.floor(i * band), W, Math.ceil(band) + 1, c));
  for (let y = HORIZON + 1; y < HORIZON + 20; y += 3) {
    const half = Math.max(2, 22 - (y - HORIZON) * 0.6);
    const shift = Math.round(Math.sin(t * 2 + y) * 2);
    px(100 - half + shift, y, half * 2, 1, '#ffd88a');
  }
  for (let i = 0; i < 26; i++) {
    const x = (i * 37 + Math.floor(t * 6) * (i % 3 === 0 ? 1 : -1)) % (W + 10);
    const y = HORIZON + 6 + ((i * 13) % (H - HORIZON - 22));
    px((x + W) % W, y, 3 + (i % 3), 1, '#a8e6ea');
  }
}

function islet(px: Px, x: number, w: number): void {
  px(x, HORIZON - 3, w, 3, '#5b3a6e');
  px(x + 3, HORIZON - 5, w - 6, 2, '#5b3a6e');
}

function palm(px: Px, baseX: number, baseY: number, height: number, lean: number, sway: number): void {
  let x = baseX;
  for (let i = 0; i < height; i++) {
    x = baseX + Math.round((lean * i * i) / (height * height) * height * 0.35);
    px(x, baseY - i, 3, 1, PALM);
  }
  const top = baseY - height;
  const fronds: [number, number][] = [[-1, 0], [1, 0], [-0.8, 0.5], [0.8, 0.5], [-0.3, -0.8], [0.4, -0.7]];
  for (const [dx, dy] of fronds) {
    for (let k = 0; k < 14; k++) {
      const fx = Math.round(x + 1 + dx * k * 1.1 + sway * (k / 14));
      const fy = Math.round(top + dy * k * 0.9 + (k * k) / 26);
      px(fx, fy, 2, 2, PALM);
    }
  }
  px(x - 1, top + 1, 2, 2, '#5e3a2e');
  px(x + 2, top + 2, 2, 2, '#5e3a2e');
}

function beach(px: Px, t: number): void {
  const y0 = H - 12;
  const foam = Math.round(Math.sin(t * 1.6) * 2);
  px(0, y0 - 2 + foam, W, 2, '#e9fbff');
  px(0, y0 + foam, W, H - y0, '#f3d49a');
  for (let x = 0; x < W; x += 7) px(x + ((x * 3) % 5), y0 + 4 + ((x * 7) % 5), 1, 1, '#d9b476');
  for (let x = 3; x < W; x += 19) px(x, y0 + 7 + (x % 3), 2, 1, '#ffffff');
}

/** Animated pixel-art tropical sunset used behind the title screen. */
export function tropicalBackdrop(): HTMLCanvasElement {
  const canvas = el('canvas', 'onb-backdrop', '', { width: String(W), height: String(H) });
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const px: Px = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const start = performance.now();
  const draw = (): void => {
    const t = (performance.now() - start) / 1000;
    sky(px);
    cloud(px, ((t * 2 + 20) % (W + 40)) - 30, 16);
    cloud(px, ((t * 1.2 + 130) % (W + 40)) - 30, 30);
    sun(px, t);
    islet(px, 22, 30);
    islet(px, 150, 24);
    sea(px, t);
    palm(px, 34, HORIZON - 5, 14, 1, Math.sin(t * 1.4) * 1.5);
    palm(px, 160, HORIZON - 5, 11, -1, Math.sin(t * 1.4 + 1) * 1.5);
    beach(px, t);
    const s = Math.sin(t * 1.2) * 2.5;
    palm(px, 8, H - 8, 58, 1.4, s);
    palm(px, 186, H - 8, 50, -1.4, -s);
  };
  const timer = setInterval(() => {
    if (!canvas.isConnected && performance.now() - start > 1000) {
      clearInterval(timer);
      return;
    }
    draw();
  }, 125);
  draw();
  return canvas;
}
