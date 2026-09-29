import * as THREE from 'three';

/** Deterministic PRNG so the island (and its GLB export) is identical on every load. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  draw(g);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function skyTexture(): THREE.CanvasTexture {
  return canvasTexture(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#d7e8f5');
    grad.addColorStop(0.55, '#eef4f9');
    grad.addColorStop(1, '#f7f4ee');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
}

/** Wooden ruler face: graduations every mm-ish, numbers every "cm". */
export function rulerTexture(length: number): THREE.CanvasTexture {
  const w = 1024;
  const h = 64;
  const tex = canvasTexture(w, h, (g) => {
    g.fillStyle = '#f0c27a';
    g.fillRect(0, 0, w, h);
    const rand = rng(7);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(160, 100, 40, ${0.08 + rand() * 0.12})`;
      g.lineWidth = 1 + rand() * 2;
      g.beginPath();
      const y = rand() * h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + rand() * 8 - 4, w * 0.7, y + rand() * 8 - 4, w, y);
      g.stroke();
    }
    const cm = w / (length * 2);
    g.fillStyle = '#5a3a1a';
    g.font = 'bold 20px sans-serif';
    g.textAlign = 'center';
    for (let i = 0, n = 0; i * (cm / 10) <= w; i++) {
      const x = i * (cm / 10);
      const tick = i % 10 === 0 ? 26 : i % 5 === 0 ? 18 : 10;
      g.fillRect(x, 0, 2, tick);
      if (i % 10 === 0 && i > 0) {
        n++;
        g.fillText(String(n), x, 50);
      }
    }
    g.strokeStyle = '#9c6a34';
    g.lineWidth = 4;
    g.strokeRect(0, 0, w, h);
  });
  return tex;
}

export function diceFace(pips: number): THREE.CanvasTexture {
  const spots: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
    6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
  };
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#fbfaf6';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = pips === 1 ? '#d8363a' : '#1e2230';
    for (const [x, y] of spots[pips] ?? []) {
      g.beginPath();
      g.arc(x * 128, y * 128, 11, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Columns of glowing digits for the waterfall, tileable vertically. */
export function digitRainTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(256, 1024, (g) => {
    const rand = rng(31);
    g.clearRect(0, 0, 256, 1024);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const cols = 6;
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * (256 / cols);
      for (let y = 20; y < 1024; y += 34 + rand() * 20) {
        const size = 22 + rand() * 14;
        g.font = `bold ${size}px monospace`;
        g.shadowColor = '#7fdcff';
        g.shadowBlur = 10;
        g.fillStyle = rand() > 0.3 ? '#ffffff' : '#9fe8ff';
        g.fillText(String(Math.floor(rand() * 10)), x + (rand() - 0.5) * 12, y);
      }
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Vertical fade (opaque at the top, transparent at the bottom) used as alphaMap. */
export function fadeTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#b0b0b0');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function waterTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(128, 256, (g) => {
    const rand = rng(11);
    g.fillStyle = '#3f9ee8';
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = rand() > 0.35 ? 'rgba(140, 210, 255, 0.55)' : 'rgba(255, 255, 255, 0.7)';
      const x = rand() * 128;
      const y = rand() * 256;
      g.beginPath();
      g.ellipse(x, y, 2 + rand() * 6, 8 + rand() * 18, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(x, y - 256, 2 + rand() * 6, 8 + rand() * 18, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function glyphTexture(text: string, color = '#ffffff', size = 64): THREE.CanvasTexture {
  return canvasTexture(size, size, (g) => {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${size * 0.8}px monospace`;
    g.shadowColor = '#7fdcff';
    g.shadowBlur = size * 0.2;
    g.fillStyle = color;
    g.fillText(text, size / 2, size / 2 + 2);
  });
}

/** Vertical "MATHS" sticker for the pink M. */
export function mathsLabelTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 256, (g) => {
    g.translate(32, 128);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 44px sans-serif';
    g.lineWidth = 6;
    g.strokeStyle = '#b8406d';
    g.strokeText('MATHS', 0, 2);
    g.fillStyle = '#ffe3ee';
    g.fillText('MATHS', 0, 2);
  });
}

/** Calculator-robot screen: a little face above a readout of pi. */
export function robotScreenTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 96, (g) => {
    g.fillStyle = '#20382a';
    g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#9dfcb4';
    g.font = 'bold 16px monospace';
    g.textAlign = 'right';
    g.fillText('3.14159', 120, 20);
    g.beginPath();
    g.arc(42, 50, 9, 0, Math.PI * 2);
    g.arc(86, 50, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#9dfcb4';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(64, 62, 18, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  });
}

export function labelTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = fg;
    g.font = 'bold 64px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 68);
  });
}

export function shadowTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(60, 55, 70, 0.55)');
    grad.addColorStop(0.6, 'rgba(60, 55, 70, 0.25)');
    grad.addColorStop(1, 'rgba(60, 55, 70, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  });
}
