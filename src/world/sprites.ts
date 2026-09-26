import * as THREE from 'three';
import { CH, CW, FRAMES_PER_VIEW, LOOKS, VIEWS, drawSheet, type CharKey, type View } from './pixelChars';

export { LOOKS };
const FRAMES = VIEWS.length * FRAMES_PER_VIEW;
// Orientation du plan projecteur d'ombre : face au soleil (voir SUN_OFFSET dans scene.ts).
const SUN_YAW = Math.atan2(-17, 4);
// Taille à l'écran : 24×32 px → 1.35 × 1.8 unités.
const SPRITE_W = 1.35;
const SPRITE_H = (SPRITE_W * CH) / CW;

const sheetCache = new Map<string, THREE.CanvasTexture>();

export function characterSheet(key: CharKey, swollen = false): THREE.CanvasTexture {
  const id = `${key}${swollen ? '-s' : ''}`;
  const hit = sheetCache.get(id);
  if (hit) return hit;
  const tex = new THREE.CanvasTexture(drawSheet(key, swollen));
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
  view: View = 'down';

  constructor(readonly key: CharKey) {
    this.tex = characterSheet(key).clone();
    this.tex.needsUpdate = true;
    this.mat = new THREE.MeshLambertMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    this.depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5 });
    const geo = new THREE.PlaneGeometry(SPRITE_W, SPRITE_H);
    geo.translate(0, SPRITE_H / 2, 0);
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
    this.bang.position.y = SPRITE_H + 0.5;
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
    // Seul le profil se retourne ; face et dos sont symétriques.
    const flip = this.view === 'side' ? this.facing : 1;
    this.mesh.scale.x = flip;
    this.caster.rotation.y = SUN_YAW;
    this.caster.scale.x = flip;
    let f = 0;
    if (moving) {
      this.walkTime += dt * 7;
      // Cycle 0-1-0-2 : pas gauche, repos, pas droit.
      f = [1, 0, 2, 0][Math.floor(this.walkTime) % 4] ?? 0;
    } else this.walkTime = 0;
    this.tex.offset.x = (VIEWS.indexOf(this.view) * FRAMES_PER_VIEW + f) / FRAMES;
    if (this.bang.visible) {
      this.bangT += dt;
      this.bang.position.y = SPRITE_H + 0.5 + Math.abs(Math.sin(this.bangT * 4)) * 0.18;
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
