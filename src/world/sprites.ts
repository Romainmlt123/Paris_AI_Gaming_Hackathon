import * as THREE from 'three';

// Personnages en pixel art générés en code : 16×24 px, 2 frames de marche, NearestFilter.
const W = 16;
const H = 24;
const FRAMES = 3; // 0 = repos, 1-2 = marche
// Orientation du plan projecteur d'ombre : face au soleil (voir SUN_OFFSET dans scene.ts).
const SUN_YAW = Math.atan2(-17, 4);

export interface CharacterLook {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'bun' | 'cap' | 'bald' | 'beanie';
  shirt: string;
  pants: string;
  apron?: string;
  beard?: string;
  hat?: string;
  outline: string;
}

export const LOOKS: Record<'player' | 'gaston' | 'josette' | 'marius', CharacterLook> = {
  player: { skin: '#f2c9a0', hair: '#5a3a24', hairStyle: 'short', shirt: '#e8b33a', pants: '#3f5f8f', outline: '#2a1e18' },
  gaston: { skin: '#e8b98f', hair: '#2e2a26', hairStyle: 'cap', hat: '#6b3fa0', shirt: '#b0423a', pants: '#4a3a2c', beard: '#2e2a26', outline: '#24160f' },
  josette: { skin: '#f5d0b0', hair: '#c86a3a', hairStyle: 'bun', shirt: '#f08aa0', pants: '#8a5a8f', apron: '#fff6ea', outline: '#2a1a1a' },
  marius: { skin: '#d9a57a', hair: '#d8d8d0', hairStyle: 'beanie', hat: '#2f6f8f', shirt: '#e9e2c9', pants: '#3a4a5a', beard: '#e0ddd2', outline: '#1e2226' },
};

function drawCharacter(ctx: CanvasRenderingContext2D, look: CharacterLook, frame: number, ox: number, swollen: boolean): void {
  const px = (x: number, y: number, w: number, h: number, c: string): void => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, y, w, h);
  };
  const bob = frame === 0 ? 0 : 1;
  const top = 2 + bob;
  const O = look.outline;
  // Jambes (alternées en marche).
  const lLeg = frame === 1 ? -1 : 0;
  const rLeg = frame === 2 ? -1 : 0;
  px(5, 19 + lLeg, 3, 4 - lLeg, O);
  px(8, 19 + rLeg, 3, 4 - rLeg, O);
  px(6, 19 + lLeg, 1, 3 - lLeg, look.pants);
  px(9, 19 + rLeg, 1, 3 - rLeg, look.pants);
  // Corps.
  px(3, top + 10, 10, 8, O);
  px(4, top + 11, 8, 6, look.shirt);
  if (look.apron) {
    px(5, top + 12, 6, 5, look.apron);
    px(6, top + 11, 4, 1, look.apron);
  }
  // Bras.
  const swing = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  px(2, top + 11 + swing, 2, 5, O);
  px(12, top + 11 - swing, 2, 5, O);
  px(2, top + 15 + swing, 2, 1, look.skin);
  px(12, top + 15 - swing, 2, 1, look.skin);
  // Tête (plus grosse si piqué par une ruche).
  const hw = swollen ? 12 : 10;
  const hx = (W - hw) / 2;
  px(hx, top, hw, 10, O);
  px(hx + 1, top + 1, hw - 2, 8, look.skin);
  if (swollen) {
    px(hx + 1, top + 5, 2, 2, '#e86a6a');
    px(hx + hw - 3, top + 5, 2, 2, '#e86a6a');
  }
  // Yeux + joues.
  px(5, top + 5, 1, 2, O);
  px(10, top + 5, 1, 2, O);
  px(4, top + 7, 1, 1, '#f09a8a');
  px(11, top + 7, 1, 1, '#f09a8a');
  if (look.beard) {
    px(4, top + 7, 8, 2, look.beard);
    px(6, top + 9, 4, 1, look.beard);
  }
  // Cheveux / couvre-chef.
  switch (look.hairStyle) {
    case 'short':
      px(hx + 1, top + 1, hw - 2, 3, look.hair);
      px(hx + 1, top + 4, 1, 2, look.hair);
      px(hx + hw - 2, top + 4, 1, 2, look.hair);
      break;
    case 'bun':
      px(hx + 1, top + 1, hw - 2, 3, look.hair);
      px(6, top - 2, 4, 3, O);
      px(7, top - 1, 2, 2, look.hair);
      px(hx + 1, top + 4, 1, 3, look.hair);
      px(hx + hw - 2, top + 4, 1, 3, look.hair);
      break;
    case 'cap':
      px(hx, top - 1, hw, 4, O);
      px(hx + 1, top, hw - 2, 3, look.hat ?? look.hair);
      px(hx + hw - 1, top + 2, 3, 1, O);
      break;
    case 'beanie':
      px(hx, top - 1, hw, 4, O);
      px(hx + 1, top, hw - 2, 3, look.hat ?? look.hair);
      px(7, top - 2, 2, 1, look.hat ?? look.hair);
      px(hx + 1, top + 3, hw - 2, 1, '#ffffff');
      break;
    case 'bald':
      break;
  }
}

const sheetCache = new Map<string, THREE.CanvasTexture>();

export function characterSheet(key: keyof typeof LOOKS, swollen = false): THREE.CanvasTexture {
  const id = `${key}${swollen ? '-s' : ''}`;
  const hit = sheetCache.get(id);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = W * FRAMES;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  for (let f = 0; f < FRAMES; f++) drawCharacter(ctx, LOOKS[key], f, f * W, swollen);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / FRAMES, 1);
  sheetCache.set(id, tex);
  return tex;
}

/** Sprite debout (billboard cylindrique) qui projette une vraie ombre de sa silhouette. */
export class CharacterSprite {
  readonly root = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private readonly caster: THREE.Mesh;
  private readonly mat: THREE.MeshLambertMaterial;
  private readonly depthMat: THREE.MeshDepthMaterial;
  private tex: THREE.CanvasTexture;
  private walkTime = 0;
  private readonly bang: THREE.Sprite;
  private bangT = 0;
  facing: 1 | -1 = 1;

  constructor(readonly key: keyof typeof LOOKS) {
    this.tex = characterSheet(key).clone();
    this.tex.needsUpdate = true;
    this.mat = new THREE.MeshLambertMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    this.depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5 });
    const geo = new THREE.PlaneGeometry(1.1, 1.65);
    geo.translate(0, 0.825, 0);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.root.add(this.mesh);
    // Le billboard regarde la caméra, donc il serait vu de profil par le soleil (ombre = trait).
    // Un second plan invisible, tourné vers le soleil, projette la silhouette complète.
    this.caster = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
    this.caster.castShadow = true;
    this.caster.customDepthMaterial = this.depthMat;
    this.root.add(this.caster);

    // Petite ombre de contact pour ancrer le sprite au sol.
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 12),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    this.root.add(blob);

    this.bang = makeBang();
    this.bang.position.y = 2.15;
    this.bang.visible = false;
    this.root.add(this.bang);
  }

  setSwollen(swollen: boolean): void {
    const next = characterSheet(this.key, swollen).clone();
    next.needsUpdate = true;
    next.offset.copy(this.tex.offset);
    this.tex = next;
    this.mat.map = next;
    this.depthMat.map = next;
    this.mat.needsUpdate = true;
    this.depthMat.needsUpdate = true;
  }

  showBang(on: boolean): void {
    this.bang.visible = on;
  }

  /** moving : le sprite marche ; camYaw : orientation caméra pour le billboard. */
  update(dt: number, moving: boolean, camYaw: number): void {
    this.mesh.rotation.y = camYaw;
    this.mesh.scale.x = this.facing;
    this.caster.rotation.y = SUN_YAW;
    this.caster.scale.x = this.facing;
    if (moving) {
      this.walkTime += dt * 8;
      const f = 1 + (Math.floor(this.walkTime) % 2);
      this.tex.offset.x = f / FRAMES;
    } else {
      this.walkTime = 0;
      this.tex.offset.x = 0;
    }
    if (this.bang.visible) {
      this.bangT += dt;
      this.bang.position.y = 2.15 + Math.abs(Math.sin(this.bangT * 4)) * 0.18;
    }
  }
}

function makeBang(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = 16;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  // Bulle blanche + « ! » rouge, contour sombre.
  ctx.fillStyle = '#2a1e18';
  ctx.fillRect(1, 0, 10, 13);
  ctx.fillRect(0, 1, 12, 11);
  ctx.fillRect(5, 13, 3, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(1, 1, 10, 11);
  ctx.fillRect(6, 12, 1, 2);
  ctx.fillStyle = '#e0412f';
  ctx.fillRect(5, 2, 2, 6);
  ctx.fillRect(5, 9, 2, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(0.6, 0.8, 1);
  s.renderOrder = 10;
  return s;
}
