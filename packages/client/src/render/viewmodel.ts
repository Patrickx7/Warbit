import * as THREE from 'three';
import type { WeaponClass } from '@warbit/shared';

const METAL = 0x34383c, DARK = 0x1e2022, WOOD = 0x70502f;

function part(w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, flatShading: true }));
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return m;
}
function tube(r: number, len: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), new THREE.MeshLambertMaterial({ color, flatShading: true }));
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

function buildGun(cls: WeaponClass): THREE.Group {
  const g = new THREE.Group();
  switch (cls) {
    case 'pistol':
      g.add(part(0.034, 0.05, 0.2, METAL, 0, 0.03, -0.08), part(0.032, 0.11, 0.045, DARK, 0, -0.035, 0.0, 0.15), part(0.01, 0.014, 0.012, DARK, 0, 0.062, -0.17));
      break;
    case 'smg':
      g.add(part(0.05, 0.1, 0.34, METAL, 0, 0.01, -0.12), tube(0.014, 0.16, DARK, 0, 0.02, -0.36), part(0.034, 0.18, 0.05, DARK, 0, -0.11, -0.14), part(0.04, 0.07, 0.17, DARK, 0, 0, 0.13), part(0.034, 0.1, 0.045, DARK, 0, -0.08, 0.01, 0.2), part(0.012, 0.03, 0.03, DARK, 0, 0.075, -0.2));
      break;
    case 'shotgun':
      g.add(part(0.05, 0.08, 0.36, METAL, 0, 0.01, -0.1), tube(0.018, 0.42, DARK, 0, 0.03, -0.48), tube(0.016, 0.3, DARK, 0, -0.01, -0.42), part(0.055, 0.05, 0.16, WOOD, 0, -0.01, -0.4), part(0.045, 0.1, 0.24, WOOD, 0, -0.02, 0.2, -0.12));
      break;
    case 'sniper':
      g.add(part(0.05, 0.08, 0.5, WOOD, 0, 0, -0.14), tube(0.013, 0.56, DARK, 0, 0.02, -0.66), part(0.045, 0.11, 0.26, WOOD, 0, -0.02, 0.24, -0.1), tube(0.026, 0.26, DARK, 0, 0.09, -0.12), part(0.03, 0.08, 0.05, DARK, 0, -0.07, -0.1), part(0.012, 0.03, 0.02, DARK, 0, 0.06, -0.02));
      break;
    default:
      g.add(part(0.05, 0.09, 0.46, METAL, 0, 0.01, -0.14), tube(0.013, 0.28, DARK, 0, 0.02, -0.5), part(0.045, 0.1, 0.22, DARK, 0, -0.01, 0.2), part(0.035, 0.16, 0.065, DARK, 0, -0.1, -0.15, 0.25), part(0.034, 0.1, 0.045, DARK, 0, -0.08, 0.02, 0.2), part(0.02, 0.04, 0.1, DARK, 0, 0.075, -0.12), part(0.055, 0.06, 0.2, 0x4a4f54, 0, 0.0, -0.36));
  }
  return g;
}

/** Braços e arma em primeira pessoa, presos à câmera. */
export class ViewModel {
  readonly group = new THREE.Group();
  private gun: THREE.Group | null = null;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private cls: WeaponClass | '' = '';
  private kick = 0;
  private bob = 0;
  private ads = 0;
  private swayX = 0; private swayY = 0;
  private dip = 0;
  muzzle = new THREE.Vector3();

  constructor(camera: THREE.Camera, sleeve: number) {
    const mk = () => {
      const g = new THREE.CylinderGeometry(0.045, 0.055, 0.42, 7);
      g.translate(0, -0.21, 0);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: sleeve, flatShading: true }));
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.08), new THREE.MeshLambertMaterial({ color: 0x242424, flatShading: true }));
      hand.position.y = 0.02;
      m.add(hand);
      return m;
    };
    this.armR = mk(); this.armL = mk();
    this.armR.scale.setScalar(0.72); this.armL.scale.setScalar(0.72);
    this.group.add(this.armR, this.armL);
    camera.add(this.group);
  }

  setSleeve(color: number) {
    (this.armL.material as THREE.MeshLambertMaterial).color.setHex(color);
    (this.armR.material as THREE.MeshLambertMaterial).color.setHex(color);
  }

  setWeapon(cls: WeaponClass) {
    if (cls === this.cls) return;
    this.cls = cls;
    if (this.gun) this.group.remove(this.gun);
    this.gun = buildGun(cls);
    this.gun.scale.setScalar(0.72);
    this.group.add(this.gun);
    this.dip = 1;
  }

  fire(recoil: number) { this.kick = Math.min(1.6, this.kick + 0.35 + recoil * 0.12); }

  update(dt: number, speed: number, onGround: boolean, ads: boolean, reloading: boolean, dyaw: number, dpitch: number, visible: boolean) {
    this.group.visible = visible;
    if (!visible || !this.gun) return;
    this.kick = Math.max(0, this.kick - dt * 9 * (this.kick + 0.2));
    this.ads += ((ads && !reloading ? 1 : 0) - this.ads) * Math.min(1, dt * 14);
    this.dip += ((reloading ? 1 : 0) - this.dip) * Math.min(1, dt * (reloading ? 10 : 6));
    if (onGround) this.bob += speed * dt * 1.5;
    const amp = Math.min(1, speed / 6) * (1 - this.ads * 0.85);
    this.swayX += (-dyaw * 0.9 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (dpitch * 0.9 - this.swayY) * Math.min(1, dt * 10);
    const a = this.ads;
    const pistol = this.cls === 'pistol';
    const bx = 0.16 * (1 - a), by = -0.17 + (pistol ? 0.02 : 0) + a * (this.cls === 'sniper' ? 0.075 : 0.085), bz = -0.56 + a * 0.16;
    const g = this.gun;
    g.position.set(
      bx + Math.sin(this.bob) * 0.012 * amp + this.swayX,
      by + Math.abs(Math.cos(this.bob)) * 0.012 * amp - this.dip * 0.22 + this.swayY,
      bz + this.kick * 0.045,
    );
    g.rotation.set(this.kick * 0.09 - this.dip * 0.7, 0.03 * (1 - a) + this.swayX * 1.5, 0);
    // mãos
    this.armR.position.set(g.position.x + 0.01, g.position.y - 0.09, g.position.z + 0.03);
    this.armR.rotation.set(-1.15, 0, -0.35);
    const fore = pistol ? 0.02 : this.cls === 'sniper' ? -0.34 : -0.3;
    this.armL.position.set(g.position.x - 0.02, g.position.y - 0.05, g.position.z + fore);
    this.armL.rotation.set(-1.05, 0, 0.75);
    this.armL.visible = this.ads < 0.9 || this.cls !== 'sniper';
    this.gun.visible = !(this.cls === 'sniper' && this.ads > 0.85);
    this.armR.visible = this.gun.visible;
    if (!this.gun.visible) this.armL.visible = false;
    const len = pistol ? 0.2 : this.cls === 'sniper' ? 0.95 : this.cls === 'smg' ? 0.45 : 0.65;
    this.muzzle.set(g.position.x, g.position.y + 0.02, g.position.z - len);
  }

  get adsAmount() { return this.ads; }
}
