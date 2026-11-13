import * as THREE from 'three';
import type { Item, WeaponClass } from '@warbit/shared';
import { gunModel, type GunModel } from './guns';

const DARK = 0x1e2022;
const SCALE = 0.72;
type OpticModel = THREE.Group & { hip?: THREE.Group; aimed?: THREE.Group; eyeDistance?: number; rearZ?: number; apertureRadius?: number };

const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const GUN_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
function part(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}
/** tubo OCO ao longo de Z (sem tampas: dá para ver através) */
function hollow(r: number, len: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const material = mat(color); material.side = THREE.DoubleSide;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24, 1, true), material);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}
function ringMesh(r: number, color: number, x: number, y: number, z: number, thick = 0.005): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, thick, 8, 48), mat(color));
  m.position.set(x, y, z);
  return m;
}

/** Mira óptica: moldura/tubo OCOS (a visão passa pelo meio) com ponto/retículo no centro exato da linha de mira. */
function buildOptic(it: Item, centerY: number, z: number): OpticModel {
  const g: OpticModel = new THREE.Group();
  const s = it.sight!;
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
    // Lentes fecham o modelo externo; ao alinhar o olho, entra uma única visão óptica.
    const compact = s.zoom > .6;
    const len = compact ? .115 : s.zoom < 0.2 ? 0.3 : s.zoom < 0.3 ? 0.24 : 0.17;
    const r = s.zoom < 0.3 ? 0.028 : 0.024;
    g.add(hollow(r, len, 0x15171a, 0, centerY, z));
    g.add(hollow(r + 0.007, 0.04, 0x0e0f10, 0, centerY, z - len / 2 + 0.015), hollow(r + 0.005, 0.035, 0x0e0f10, 0, centerY, z + len / 2 - 0.012));
    g.add(ringMesh(r + 0.007, 0x0b0b0c, 0, centerY, z - len / 2 - 0.004, 0.006), ringMesh(r + 0.005, 0x0b0b0c, 0, centerY, z + len / 2 + 0.004, 0.006));
    for (const [radius, depth] of [[r + .001, z - len / 2 - .003], [r - .001, z + len / 2 + .003]]) {
      const lens = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshBasicMaterial({ color: 0x294b56, side: THREE.DoubleSide, fog: false }));
      lens.position.set(0, centerY, depth); g.add(lens);
    }
    g.add(part(0.022, 0.022, 0.07, DARK, 0, centerY - r - 0.012, z)); // base de montagem
    if (s.zoom >= 0.3) {
      const hip = new THREE.Group(), aimed = new THREE.Group();
      hip.add(...g.children.slice()); g.add(hip, aimed);
      g.hip = hip; g.aimed = aimed; g.eyeDistance = compact ? .15 : .18; g.rearZ = z + len / 2 + .004;
      aimed.visible = false;
      const radius = compact ? .033 : .035, depth = compact ? .06 : .10, rear = g.rearZ;
      g.apertureRadius = radius - .002;
      // O interior abre para a frente conforme a perspectiva: só a borda ocular fica aparente.
      const frontRadius = radius * (g.eyeDistance + depth * SCALE) / g.eyeDistance + .005;
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(radius + .004, frontRadius, depth, 32, 1, true), new THREE.MeshLambertMaterial({ color: 0x17191a, side: THREE.DoubleSide }));
      wall.rotation.x = Math.PI / 2; wall.position.set(0, centerY, rear - depth / 2);
      aimed.add(wall, ringMesh(radius + .002, 0x101112, 0, centerY, rear, .004));
      const glass = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshBasicMaterial({ color: 0x9ebfc8, transparent: true, opacity: .045, depthWrite: false, side: THREE.DoubleSide }));
      glass.position.set(0, centerY, rear - .008); aimed.add(glass);
      const reticleMat = new THREE.MeshBasicMaterial({ color: compact ? 0xd7dd42 : 0xf05238, fog: false });
      const reticle = new THREE.Mesh(new THREE.TorusGeometry(compact ? .0018 : .0032, .00035, 5, 32, compact ? Math.PI * 2 : Math.PI * 1.5), reticleMat);
      reticle.position.set(0, centerY, rear - .006); reticle.rotation.z = compact ? 0 : -Math.PI / 4;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(.0005, 12), reticleMat);
      dot.name = 'opticAimPoint';
      dot.position.copy(reticle.position); aimed.add(reticle, dot);
      if (!compact) {
        const stem = new THREE.Mesh(new THREE.BoxGeometry(.00035, .004, .00035), reticleMat);
        stem.position.set(0, centerY - .006, rear - .006); aimed.add(stem);
      }
      aimed.add(part(.055, .014, .045, DARK, 0, centerY - radius - .01, rear - .025));
      aimed.add(part(.014, .023, .025, DARK, (compact ? 1 : -1) * (radius + .009), centerY, rear - .02));
    }
  }
  return g;
}

/** Braços e arma em primeira pessoa, presos à câmera. Cada arma da loja tem o seu próprio modelo. */
export class ViewModel {
  readonly group = new THREE.Group();
  private gun: THREE.Group | null = null;
  private bodyMaterial: THREE.MeshLambertMaterial | null = null;
  private model: GunModel | null = null;
  private ironsM: THREE.Mesh | null = null;
  private scopeM: THREE.Mesh | null = null;
  private optic: OpticModel | null = null;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private cls: WeaponClass | '' = '';
  private weaponId = '';
  private sightId = '';
  private suppressed = false;
  private silencer: THREE.Mesh | null = null;
  private kick = 0;
  private bob = 0;
  private ads = 0;
  private swayX = 0; private swayY = 0;
  private dip = 0;
  private sightY = 0.085;
  private rearZ = 0.02;
  private aperture = { value: new THREE.Vector4() };
  private apertureCenter = new THREE.Vector3();
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

  /** troca de arma/mira; `sight` é o item de mira comprado (ou undefined = mira de ferro / luneta da própria arma) */
  setWeapon(item: Item, sight?: Item, suppressed = false) {
    const cls = item.weapon!.cls;
    const sid = cls === 'pistol' ? '' : sight?.id ?? '';
    if (item.id === this.weaponId && sid === this.sightId && suppressed===this.suppressed) return;
    if (item.id !== this.weaponId) {
      this.weaponId = item.id;
      this.cls = cls;
      if (this.gun) this.group.remove(this.gun);
      const gm = gunModel(item.id);
      this.model = gm;
      const g = new THREE.Group();
      this.bodyMaterial?.dispose();
      const bodyMaterial = this.bodyMaterial = GUN_MAT.clone();
      // A lente mostra o cenário distante; partes da própria arma não entram no campo óptico.
      bodyMaterial.onBeforeCompile = shader => {
        shader.uniforms.opticAperture = this.aperture;
        shader.vertexShader = 'varying vec3 opticViewPosition;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nopticViewPosition = mvPosition.xyz;');
        shader.fragmentShader = 'uniform vec4 opticAperture;\nvarying vec3 opticViewPosition;\n' + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (opticAperture.w > 0.0 && opticViewPosition.z < -0.001) {
            vec2 lensPoint = opticViewPosition.xy * (opticAperture.z / opticViewPosition.z);
            if (distance(lensPoint, opticAperture.xy) < opticAperture.w) discard;
          }`);
      };
      g.add(new THREE.Mesh(gm.body, bodyMaterial));
      this.ironsM = gm.irons ? new THREE.Mesh(gm.irons, GUN_MAT) : null;
      this.scopeM = gm.scopeGeo ? new THREE.Mesh(gm.scopeGeo, GUN_MAT) : null;
      if (this.ironsM) g.add(this.ironsM);
      if (this.scopeM) g.add(this.scopeM);
      g.scale.setScalar(SCALE);
      this.group.add(g);
      this.gun = g;
      this.dip = 1;
    }
    this.sightId = sid;this.suppressed=suppressed;
    if(this.silencer){this.silencer.parent?.remove(this.silencer);this.silencer.geometry.dispose();(this.silencer.material as THREE.Material).dispose();this.silencer=null;}
    if(suppressed){this.silencer=hollow(.023,.2,0x222526,0,0,this.model!.muzzleZ-.08);this.gun!.add(this.silencer);}

    const gm = this.model!;
    if (this.optic) { this.gun!.remove(this.optic); this.optic = null; }
    const optical = !!sight?.sight && cls !== 'pistol';
    this.scoped = optical ? sight!.sight!.kind === 'scope' && sight!.sight!.zoom < .3 : gm.scope;
    if (this.ironsM) this.ironsM.visible = !optical;
    if (this.scopeM) this.scopeM.visible = !optical;
    this.sightY = gm.sightY;
    this.rearZ = gm.rearZ;
    if (optical) {
      const cy = gm.topY + (sight!.sight!.kind === 'scope' && sight!.sight!.zoom >= .3 ? .065 : .048), z = gm.rearZ - 0.06;
      this.optic = buildOptic(sight!, cy, z);
      this.gun!.add(this.optic);
      this.sightY = cy;
      this.rearZ = this.optic.rearZ ?? z;
    }
  }

  fire(recoil: number) { this.kick = Math.min(1.4, this.kick + 0.3 + recoil * 0.06); }

  update(dt: number, speed: number, onGround: boolean, ads: boolean, reloading: boolean, sprinting: boolean, dyaw: number, dpitch: number, visible: boolean) {
    this.group.visible = visible;
    if (!visible || !this.gun || !this.model) return;
    const g = this.gun;
    this.kick = Math.max(0, this.kick - dt * 8 * (this.kick + 0.25));
    this.ads += ((ads && !reloading && !sprinting ? 1 : 0) - this.ads) * Math.min(1, dt * 12);
    this.dip += ((reloading ? 1 : 0) - this.dip) * Math.min(1, dt * (reloading ? 10 : 6));
    if (onGround) this.bob += speed * dt * 1.5;
    const a = this.ads;
    if (this.optic?.hip && this.optic.aimed) {
      this.optic.hip.visible = a < .7;
      this.optic.aimed.visible = a >= .7;
    }
    const amp = Math.min(1, speed / 6) * (1 - a * 0.9);
    this.swayX += (-dyaw * 0.9 * (1 - a * 0.6) - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (dpitch * 0.9 * (1 - a * 0.6) - this.swayY) * Math.min(1, dt * 10);
    const spr = sprinting ? 1 : 0;

    // posição de quadril
    const hipX = 0.16, hipY = -0.17 + (this.cls === 'pistol' ? 0.02 : 0), hipZ = -0.56;
    // posição de mira: a linha de mira (alça→massa/ponto) passa EXATAMENTE pelo centro da tela (0,0)
    const adsX = 0, adsY = -this.sightY * SCALE, adsZ = -(this.optic?.eyeDistance ?? .27) - this.rearZ * SCALE;
    g.position.set(
      hipX + (adsX - hipX) * a + Math.sin(this.bob) * 0.012 * amp + this.swayX,
      hipY + (adsY - hipY) * a + Math.abs(Math.cos(this.bob)) * 0.012 * amp - this.dip * 0.22 + this.swayY - spr * 0.1,
      hipZ + (adsZ - hipZ) * a + this.kick * 0.04,
    );
    g.rotation.set(this.kick * 0.07 - this.dip * 0.7 + spr * 0.35, (0.03 * (1 - a) + this.swayX * 1.5) + spr * 0.5, 0);
    this.aperture.value.set(0, 0, 0, 0);
    if (a > .95 && this.optic?.apertureRadius) {
      g.updateMatrix();
      this.apertureCenter.set(0, this.sightY, this.rearZ).applyMatrix4(g.matrix);
      const c = this.apertureCenter;
      this.aperture.value.set(c.x, c.y, c.z, this.optic.apertureRadius * SCALE);
    }
    // mãos
    this.armR.position.set(g.position.x + 0.01, g.position.y - 0.09, g.position.z + 0.03);
    this.armR.rotation.set(-1.15, 0, -0.35);
    const fore = this.cls === 'pistol' ? 0.02 : this.cls === 'sniper' ? -0.34 : -0.3;
    this.armL.position.set(g.position.x - 0.02, g.position.y - 0.05, g.position.z + fore);
    this.armL.rotation.set(-1.05, 0, 0.75);
    // luneta de muito aumento: a visão vira overlay, esconde arma e braços
    const hideAll = a > 0.85 && this.scoped;
    g.visible = !hideAll; this.armR.visible = !hideAll; this.armL.visible = !hideAll;
    this.muzzle.set(g.position.x, g.position.y + 0.02, g.position.z + this.model.muzzleZ * SCALE);
  }

  /** Lunetas usam uma única abertura; miras abertas continuam visíveis no modelo. */
  scoped = false;

  get adsAmount() { return this.ads; }
}
