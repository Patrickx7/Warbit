import * as THREE from 'three';
import type { Item, WeaponClass } from '@warbit/shared';

const METAL = 0x34383c, DARK = 0x1e2022, WOOD = 0x70502f;
const SCALE = 0.72;

const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
function part(w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return m;
}
function tube(r: number, len: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat(color));
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

interface GunModel {
  group: THREE.Group;
  /** altura (no espaço da arma) da linha de mira: a mira de ferro passa por aqui */
  sightY: number;
  /** z (espaço da arma) da massa de mira traseira */
  rearZ: number;
  /** meshes da mira de ferro, escondidos quando há mira óptica */
  irons: THREE.Object3D[];
  muzzleZ: number;
}

/** Arma + mira de ferro. A mira de ferro (alça + massa) fica exatamente em `sightY`, para o alinhamento ao mirar ser real. */
function buildGun(cls: WeaponClass): GunModel {
  const g = new THREE.Group();
  const irons: THREE.Object3D[] = [];
  let sightY = 0.085, rearZ = 0.02, frontZ = -0.5, muzzleZ = -0.7;
  const addIron = (rz: number, fz: number, y: number) => {
    // alça: dois pilares com vão; massa: pino fino
    for (const sx of [-0.011, 0.011]) irons.push(part(0.008, 0.02, 0.014, DARK, sx, y - 0.01, rz));
    irons.push(part(0.006, 0.026, 0.01, DARK, 0, y - 0.013, fz));
    for (const o of irons.slice(-3)) g.add(o);
  };
  switch (cls) {
    case 'pistol':
      g.add(part(0.034, 0.05, 0.2, METAL, 0, 0.03, -0.08), part(0.032, 0.11, 0.045, DARK, 0, -0.035, 0.0, 0.15));
      sightY = 0.062; rearZ = 0.0; frontZ = -0.17; muzzleZ = -0.2;
      break;
    case 'smg':
      g.add(part(0.05, 0.1, 0.34, METAL, 0, 0.01, -0.12), tube(0.014, 0.16, DARK, 0, 0.02, -0.36), part(0.034, 0.18, 0.05, DARK, 0, -0.11, -0.14), part(0.04, 0.07, 0.17, DARK, 0, 0, 0.13), part(0.034, 0.1, 0.045, DARK, 0, -0.08, 0.01, 0.2));
      sightY = 0.075; rearZ = 0.0; frontZ = -0.3; muzzleZ = -0.45;
      break;
    case 'shotgun':
      g.add(part(0.05, 0.08, 0.36, METAL, 0, 0.01, -0.1), tube(0.018, 0.42, DARK, 0, 0.03, -0.48), tube(0.016, 0.3, DARK, 0, -0.01, -0.42), part(0.055, 0.05, 0.16, WOOD, 0, -0.01, -0.4), part(0.045, 0.1, 0.24, WOOD, 0, -0.02, 0.2, -0.12));
      sightY = 0.085; rearZ = -0.05; frontZ = -0.68; muzzleZ = -0.7;
      break;
    case 'sniper':
      g.add(part(0.05, 0.08, 0.5, WOOD, 0, 0, -0.14), tube(0.013, 0.56, DARK, 0, 0.02, -0.66), part(0.045, 0.11, 0.26, WOOD, 0, -0.02, 0.24, -0.1), part(0.03, 0.08, 0.05, DARK, 0, -0.07, -0.1));
      // luneta embutida (sem mira óptica comprada)
      g.add(tube(0.026, 0.28, 0x16181a, 0, 0.1, -0.12), part(0.012, 0.03, 0.02, DARK, 0, 0.06, -0.12));
      sightY = 0.1; rearZ = -0.12; frontZ = -0.12; muzzleZ = -0.95;
      break;
    default:
      g.add(part(0.05, 0.09, 0.46, METAL, 0, 0.01, -0.14), tube(0.013, 0.28, DARK, 0, 0.02, -0.5), part(0.045, 0.1, 0.22, DARK, 0, -0.01, 0.2), part(0.035, 0.16, 0.065, DARK, 0, -0.1, -0.15, 0.25), part(0.034, 0.1, 0.045, DARK, 0, -0.08, 0.02, 0.2), part(0.055, 0.06, 0.2, 0x4a4f54, 0, 0.0, -0.36));
      sightY = 0.085; rearZ = 0.02; frontZ = -0.52; muzzleZ = -0.65;
  }
  if (cls !== 'sniper') addIron(rearZ, frontZ, sightY);
  return { group: g, sightY, rearZ, irons, muzzleZ };
}

/** Mira óptica: moldura oca (dá para ver através) com ponto/retículo no centro exato da linha de mira. */
function buildOptic(it: Item, centerY: number): THREE.Group {
  const g = new THREE.Group();
  const s = it.sight!;
  const z = -0.08;
  if (s.kind === 'reddot' || s.kind === 'holo') {
    const w = s.kind === 'holo' ? 0.05 : 0.04, h = s.kind === 'holo' ? 0.042 : 0.034, t = 0.0035;
    g.add(part(w + t * 2, t, 0.035, DARK, 0, centerY + h / 2, z), part(w + t * 2, t, 0.035, DARK, 0, centerY - h / 2, z));
    g.add(part(t, h, 0.035, DARK, -w / 2, centerY, z), part(t, h, 0.035, DARK, w / 2, centerY, z));
    g.add(part(w + 0.014, 0.014, 0.09, DARK, 0, centerY - h / 2 - 0.012, z)); // base
    const glow = new THREE.MeshBasicMaterial({ color: 0xff2a2a, fog: false });
    if (s.kind === 'reddot') {
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.004), glow);
      dot.position.set(0, centerY, z - 0.02);
      g.add(dot);
    } else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0012, 4, 16), glow);
      ring.position.set(0, centerY, z - 0.02);
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.0035, 0.0035), glow);
      dot.position.set(0, centerY, z - 0.02);
      g.add(ring, dot);
    }
  } else {
    // luneta: tubo com aro; enquanto mira a visão passa para o desenho da luneta (overlay)
    const len = s.zoom < 0.2 ? 0.3 : s.zoom < 0.3 ? 0.24 : 0.17;
    g.add(tube(0.027, len, 0x15171a, 0, centerY, z));
    g.add(tube(0.034, 0.03, 0x0e0f10, 0, centerY, z - len / 2 + 0.01), tube(0.031, 0.025, 0x0e0f10, 0, centerY, z + len / 2 - 0.01));
    g.add(part(0.022, 0.02, 0.07, DARK, 0, centerY - 0.036, z));
  }
  return g;
}

/** Braços e arma em primeira pessoa, presos à câmera. */
export class ViewModel {
  readonly group = new THREE.Group();
  private gun: GunModel | null = null;
  private optic: THREE.Group | null = null;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private cls: WeaponClass | '' = '';
  private sightId = '';
  private kick = 0;
  private bob = 0;
  private ads = 0;
  private swayX = 0; private swayY = 0;
  private dip = 0;
  private sightY = 0.085;
  muzzle = new THREE.Vector3();

  constructor(camera: THREE.Camera, sleeve: number) {
    const mk = () => {
      const g = new THREE.CylinderGeometry(0.045, 0.055, 0.42, 7);
      g.translate(0, -0.21, 0);
      const m = new THREE.Mesh(g, mat(sleeve));
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.08), mat(0x242424));
      hand.position.y = 0.02;
      m.add(hand);
      m.scale.setScalar(SCALE);
      return m;
    };
    this.armR = mk(); this.armL = mk();
    this.group.add(this.armR, this.armL);
    camera.add(this.group);
  }

  setSleeve(color: number) {
    (this.armL.material as THREE.MeshLambertMaterial).color.setHex(color);
    (this.armR.material as THREE.MeshLambertMaterial).color.setHex(color);
  }

  /** troca de arma/mira; `sight` é o item de mira comprado (ou undefined = mira de ferro) */
  setWeapon(cls: WeaponClass, sight?: Item) {
    const sid = cls === 'pistol' ? '' : sight?.id ?? '';
    if (cls === this.cls && sid === this.sightId) return;
    if (cls !== this.cls) {
      this.cls = cls;
      if (this.gun) this.group.remove(this.gun.group);
      this.gun = buildGun(cls);
      this.gun.group.scale.setScalar(SCALE);
      this.group.add(this.gun.group);
      this.dip = 1;
    }
    this.sightId = sid;
    const gm = this.gun!;
    if (this.optic) { gm.group.remove(this.optic); this.optic = null; }
    this.sightY = gm.sightY;
    const optical = !!sight?.sight && cls !== 'pistol';
    for (const o of gm.irons) o.visible = !optical;
    if (optical) {
      const cy = cls === 'sniper' ? gm.sightY : gm.sightY + 0.045;
      this.optic = buildOptic(sight!, cy);
      gm.group.add(this.optic);
      this.sightY = cy;
    }
  }

  fire(recoil: number) { this.kick = Math.min(1.4, this.kick + 0.3 + recoil * 0.06); }

  update(dt: number, speed: number, onGround: boolean, ads: boolean, reloading: boolean, sprinting: boolean, dyaw: number, dpitch: number, visible: boolean) {
    this.group.visible = visible;
    if (!visible || !this.gun) return;
    const gm = this.gun;
    const g = gm.group;
    this.kick = Math.max(0, this.kick - dt * 8 * (this.kick + 0.25));
    this.ads += ((ads && !reloading && !sprinting ? 1 : 0) - this.ads) * Math.min(1, dt * 12);
    this.dip += ((reloading ? 1 : 0) - this.dip) * Math.min(1, dt * (reloading ? 10 : 6));
    if (onGround) this.bob += speed * dt * 1.5;
    const a = this.ads;
    const amp = Math.min(1, speed / 6) * (1 - a * 0.9);
    this.swayX += (-dyaw * 0.9 * (1 - a * 0.6) - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (dpitch * 0.9 * (1 - a * 0.6) - this.swayY) * Math.min(1, dt * 10);
    const spr = sprinting ? 1 : 0;

    // posição de quadril
    const hipX = 0.16, hipY = -0.17 + (this.cls === 'pistol' ? 0.02 : 0), hipZ = -0.56;
    // posição de mira: a linha de mira (alça→massa/ponto) passa EXATAMENTE pelo centro da tela (0,0)
    const adsX = 0, adsY = -this.sightY * SCALE, adsZ = -0.27 - gm.rearZ * SCALE;
    g.position.set(
      hipX + (adsX - hipX) * a + Math.sin(this.bob) * 0.012 * amp + this.swayX,
      hipY + (adsY - hipY) * a + Math.abs(Math.cos(this.bob)) * 0.012 * amp - this.dip * 0.22 + this.swayY - spr * 0.1,
      hipZ + (adsZ - hipZ) * a + this.kick * 0.04,
    );
    g.rotation.set(this.kick * 0.07 - this.dip * 0.7 + spr * 0.35, (0.03 * (1 - a) + this.swayX * 1.5) + spr * 0.5, 0);
    // mãos
    this.armR.position.set(g.position.x + 0.01, g.position.y - 0.09, g.position.z + 0.03);
    this.armR.rotation.set(-1.15, 0, -0.35);
    const fore = this.cls === 'pistol' ? 0.02 : this.cls === 'sniper' ? -0.34 : -0.3;
    this.armL.position.set(g.position.x - 0.02, g.position.y - 0.05, g.position.z + fore);
    this.armL.rotation.set(-1.05, 0, 0.75);
    // luneta de muito aumento: a visão vira overlay, esconde arma e braços
    const hideAll = a > 0.85 && this.scoped;
    g.visible = !hideAll; this.armR.visible = !hideAll; this.armL.visible = !hideAll;
    this.muzzle.set(g.position.x, g.position.y + 0.02, g.position.z + gm.muzzleZ * SCALE);
  }

  /** true quando o aumento é grande o bastante para usar o overlay de luneta */
  scoped = false;

  get adsAmount() { return this.ads; }
}
