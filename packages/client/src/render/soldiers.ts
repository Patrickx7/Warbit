import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAX_PLAYERS, TEAM_COLORS } from '@warbit/shared';

// ---------- construção de geometria (tudo em código, sem arquivos de modelo) ----------
const _c = new THREE.Color();

function paint(g: THREE.BufferGeometry, color: number, m?: THREE.Matrix4): THREE.BufferGeometry {
  let geo = g.index ? g.toNonIndexed() : g;
  if (m) geo.applyMatrix4(m);
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.setHex(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const TR = (x: number, y: number, z: number, rx: number, ry = 0, rz = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z);
const box = (w: number, h: number, d: number, color: number, m?: THREE.Matrix4) => paint(new THREE.BoxGeometry(w, h, d), color, m);
/** membro: pivô no topo, desce no eixo -Y */
const limb = (rTop: number, rBot: number, len: number, color: number) => paint(new THREE.CylinderGeometry(rTop, rBot, len, 6), color, T(0, -len / 2, 0));
const merge = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts, false)!; g.computeVertexNormals(); return g; };

const CLOTH = 0xffffff, DARK = 0x2b2b2b, SKIN = 0xe2b08c, HAIR = 0x4a3524, GEAR = 0xffffff, METAL = 0x33373b, WOOD = 0x6e4f33;

function torsoGeo() {
  const g = new THREE.BoxGeometry(0.4, 0.56, 0.23).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) { p.setX(i, p.getX(i) * 0.8); p.setZ(i, p.getZ(i) * 0.9); }
  return merge([
    paint(g, CLOTH, T(0, 0.28, 0)),
    paint(new THREE.IcosahedronGeometry(0.085, 0), CLOTH, T(0.215, 0.5, 0)),
    paint(new THREE.IcosahedronGeometry(0.085, 0), CLOTH, T(-0.215, 0.5, 0)),
    paint(new THREE.CylinderGeometry(0.055, 0.065, 0.08, 6), 0xdddddd, T(0, 0.59, 0)),
  ]);
}
function hipsGeo() {
  return merge([box(0.32, 0.17, 0.2, CLOTH), box(0.335, 0.045, 0.215, 0x555555, T(0, 0.075, 0))]);
}
function headGeo() {
  const g = new THREE.IcosahedronGeometry(0.115, 1);
  const geo = paint(g, SKIN);
  const p = geo.attributes.position, c = geo.attributes.color;
  _c.setHex(HAIR);
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    if (y > 0.05 || (z > 0.03 && y > -0.03)) for (let k = 0; k < 3; k++) c.setXYZ(i + k, _c.r, _c.g, _c.b);
  }
  return merge([geo, box(0.03, 0.035, 0.03, 0xd49f7c, T(0, -0.01, -0.118))]);
}
function helmetGeo() {
  return merge([
    paint(new THREE.SphereGeometry(0.142, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.56), GEAR, T(0, 0.012, 0.005)),
    paint(new THREE.CylinderGeometry(0.152, 0.158, 0.022, 8), 0xcccccc, T(0, 0.0, 0.005)),
    box(0.07, 0.03, 0.02, 0x999999, T(0, 0.075, -0.132)),
  ]);
}
function vestGeo() {
  return merge([
    box(0.43, 0.4, 0.275, GEAR, T(0, 0.31, 0)),
    box(0.09, 0.1, 0.05, 0xc8c8c8, T(-0.12, 0.2, -0.155)),
    box(0.09, 0.1, 0.05, 0xc8c8c8, T(0, 0.2, -0.155)),
    box(0.09, 0.1, 0.05, 0xc8c8c8, T(0.12, 0.2, -0.155)),
    box(0.1, 0.05, 0.25, 0xd8d8d8, T(0.14, 0.53, 0)),
    box(0.1, 0.05, 0.25, 0xd8d8d8, T(-0.14, 0.53, 0)),
  ]);
}
function packGeo() {
  return merge([
    box(0.3, 0.36, 0.15, 0x6f6a4e, T(0, 0.31, 0.19)),
    box(0.2, 0.14, 0.05, 0x5c583f, T(0, 0.24, 0.285)),
    paint(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 6), 0x7d7a66, TR(0, 0.53, 0.18, 0, 0, Math.PI / 2)),
  ]);
}
function forearmGeo() {
  return merge([limb(0.048, 0.04, 0.26, CLOTH), box(0.07, 0.08, 0.075, DARK, T(0, -0.29, 0))]);
}
function shinGeo() {
  return merge([limb(0.066, 0.056, 0.4, CLOTH), box(0.105, 0.1, 0.25, DARK, T(0, -0.43, -0.05)), box(0.11, 0.07, 0.115, 0x3a3a3a, T(0, -0.36, 0))]);
}
const barrel = (r: number, len: number, z: number, y = 0.02) => paint(new THREE.CylinderGeometry(r, r, len, 5), METAL, TR(0, y, z - len / 2, Math.PI / 2));
function gunGeo(kind: number) {
  switch (kind) {
    case 1: // SMG / escopeta
      return merge([box(0.05, 0.1, 0.34, METAL, T(0, 0.01, -0.1)), barrel(0.014, 0.16, -0.27), box(0.035, 0.17, 0.05, 0x222222, T(0, -0.11, -0.12)), box(0.04, 0.07, 0.16, 0x2a2a2a, T(0, 0, 0.14)), box(0.035, 0.1, 0.045, 0x222222, T(0, -0.08, 0.02))]);
    case 2: // precisão
      return merge([box(0.05, 0.08, 0.5, WOOD, T(0, 0, -0.12)), barrel(0.013, 0.5, -0.37), box(0.045, 0.11, 0.26, WOOD, T(0, -0.02, 0.25)), paint(new THREE.CylinderGeometry(0.024, 0.024, 0.24, 6), 0x1b1b1b, TR(0, 0.085, -0.1, Math.PI / 2)), box(0.03, 0.08, 0.05, 0x222222, T(0, -0.07, -0.08))]);
    case 3: // pistola
      return merge([box(0.035, 0.05, 0.19, METAL, T(0, 0.03, -0.07)), box(0.034, 0.11, 0.045, 0x222222, T(0, -0.03, 0.0))]);
    default: // fuzil
      return merge([box(0.05, 0.09, 0.44, METAL, T(0, 0.01, -0.12)), barrel(0.013, 0.26, -0.34), box(0.045, 0.1, 0.22, 0x2a2a2a, T(0, -0.01, 0.2)), box(0.035, 0.15, 0.065, 0x222222, TR(0, -0.1, -0.13, 0.25)), box(0.035, 0.1, 0.045, 0x222222, T(0, -0.08, 0.03)), box(0.02, 0.04, 0.1, 0x1b1b1b, T(0, 0.075, -0.1))]);
  }
}

// ---------- renderer instanciado ----------
const UNIFORM = [0x3f5fa8, 0xad473d, 0x4c8c45];
const HELMET = [0x2f4a86, 0x8a3730, 0x3b6f36];
const VEST = [0, 0x9a8f6c, 0x7c7658, 0x5a5a4c, 0x3c3f41];

export const GUN_KIND: Record<string, number> = { rifle: 0, smg: 1, shotgun: 1, sniper: 2, pistol: 3 };

export interface SoldierPose {
  id: number;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  crouch: boolean; prone: boolean; sprint: boolean; downed: boolean;
  team: number; armor: number; helmet: number; gun: number;
  marker: number; // 0 nenhum, 1 aliado, 2 inimigo marcado
  camo: number;   // 0..1: dentro de uma moita
  dist: number;
}

const m0 = new THREE.Matrix4(), root = new THREE.Matrix4(), hips = new THREE.Matrix4(), torso = new THREE.Matrix4(), head = new THREE.Matrix4();
const a1 = new THREE.Matrix4(), a2 = new THREE.Matrix4(), tmp = new THREE.Matrix4(), sc = new THREE.Matrix4();
const eul = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const col = new THREE.Color();

function local(x: number, y: number, z: number, rx: number, ry: number, rz: number): THREE.Matrix4 {
  return m0.makeRotationFromEuler(eul.set(rx, ry, rz)).setPosition(x, y, z);
}

/**
 * Desenha até 100 soldados com ~15 draw calls no total:
 * uma InstancedMesh por parte do corpo, animação procedural calculada por quadro.
 */
export class Soldiers {
  readonly group = new THREE.Group();
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private hipsM: THREE.InstancedMesh; private torsoM: THREE.InstancedMesh; private headM: THREE.InstancedMesh;
  private helmetM: THREE.InstancedMesh; private vestM: THREE.InstancedMesh; private packM: THREE.InstancedMesh;
  private upperM: THREE.InstancedMesh; private foreM: THREE.InstancedMesh; private thighM: THREE.InstancedMesh; private shinM: THREE.InstancedMesh;
  private guns: THREE.InstancedMesh[] = [];
  private markerM: THREE.InstancedMesh;
  private all: THREE.InstancedMesh[] = [];
  private n = 0;
  private gunN = [0, 0, 0, 0];
  private markN = 0;
  // estado de animação por id
  private phase = new Float32Array(MAX_PLAYERS);
  private crouchAmt = new Float32Array(MAX_PLAYERS);
  private speed = new Float32Array(MAX_PLAYERS);
  private px = new Float32Array(MAX_PLAYERS);
  private pz = new Float32Array(MAX_PLAYERS);
  private seen = new Uint8Array(MAX_PLAYERS);
  triangles = 0;

  constructor(max = MAX_PLAYERS) {
    const mk = (g: THREE.BufferGeometry, count: number, material: THREE.Material = this.mat) => {
      const im = new THREE.InstancedMesh(g, material, count);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, col.setHex(0xffffff));
      im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      this.group.add(im);
      this.all.push(im);
      this.triangles += g.attributes.position.count / 3;
      return im;
    };
    this.hipsM = mk(hipsGeo(), max);
    this.torsoM = mk(torsoGeo(), max);
    this.headM = mk(headGeo(), max);
    this.helmetM = mk(helmetGeo(), max);
    this.vestM = mk(vestGeo(), max);
    this.packM = mk(packGeo(), max);
    this.upperM = mk(limb(0.058, 0.05, 0.3, CLOTH), max * 2);
    this.foreM = mk(forearmGeo(), max * 2);
    this.thighM = mk(limb(0.088, 0.07, 0.44, CLOTH), max * 2);
    this.shinM = mk(shinGeo(), max * 2);
    for (let k = 0; k < 4; k++) this.guns.push(mk(gunGeo(k), max));
    this.markerM = mk(new THREE.OctahedronGeometry(0.11, 0), max, new THREE.MeshBasicMaterial({ fog: false }));
  }

  get drawCalls() { return this.all.length; }

  begin() {
    this.n = 0; this.markN = 0;
    this.gunN.fill(0);
  }

  add(p: SoldierPose, dt: number) {
    const i = this.n++;
    const id = p.id;
    // velocidade a partir do deslocamento (suavizada)
    if (!this.seen[id]) { this.seen[id] = 1; this.px[id] = p.x; this.pz[id] = p.z; this.speed[id] = 0; }
    const inst = dt > 0 ? Math.hypot(p.x - this.px[id], p.z - this.pz[id]) / dt : 0;
    this.px[id] = p.x; this.pz[id] = p.z;
    this.speed[id] += (Math.min(inst, 10) - this.speed[id]) * Math.min(1, dt * 10);
    const v = p.downed ? 0 : this.speed[id];
    const far = p.dist > 160;
    this.phase[id] += v * dt * 2.3;
    const cTarget = p.crouch && !p.prone ? 1 : 0;
    this.crouchAmt[id] += (cTarget - this.crouchAmt[id]) * Math.min(1, dt * 12);
    const c = this.crouchAmt[id];
    const ph = this.phase[id];
    const amp = far ? 0 : Math.min(1, v / 4.5);
    const sw = Math.sin(ph) * amp * (p.sprint ? 0.95 : 0.7);
    const cs = Math.cos(ph);
    const uni = col.setHex(UNIFORM[p.team]);
    // dentro da moita o uniforme "pega" a cor da folhagem (camuflagem)
    const cm = p.camo * 0.6;
    const ur = uni.r * (1 - cm) + 0.24 * cm, ug = uni.g * (1 - cm) + 0.4 * cm, ub = uni.b * (1 - cm) + 0.18 * cm;

    root.copy(local(p.x, p.y, p.z, 0, p.yaw, 0));
    if (p.downed) root.multiply(local(0, 0.16, -0.75, Math.PI / 2 - 0.06, 0, 0));
    else if (p.prone) root.multiply(local(0, 0.13, 0.55, -Math.PI / 2 + 0.05, 0, 0)); // de bruços, cabeça para frente
    const hipY = p.prone ? 0.93 : 0.93 - 0.4 * c + Math.abs(Math.sin(ph * 2)) * 0.025 * amp;
    hips.multiplyMatrices(root, local(0, hipY, 0, 0, 0, 0));
    const pitch = p.downed ? 0 : p.pitch;
    const lean = p.downed || p.prone ? 0 : 0.06 + (p.sprint ? 0.26 : 0) * amp + c * 0.28;
    torso.multiplyMatrices(hips, local(0, 0.07, 0, -lean + pitch * 0.35, 0, 0));
    head.multiplyMatrices(torso, local(0, 0.68, 0, pitch * 0.45 + lean * 0.6, 0, 0));

    this.hipsM.setMatrixAt(i, hips); this.hipsM.setColorAt(i, col.setRGB(ur * 0.9, ug * 0.9, ub * 0.9));
    this.torsoM.setMatrixAt(i, torso); this.torsoM.setColorAt(i, col.setRGB(ur, ug, ub));
    this.headM.setMatrixAt(i, head);

    if (p.helmet > 0) {
      const s = 1 + (p.helmet - 1) * 0.045;
      tmp.multiplyMatrices(head, sc.makeScale(s, s, s));
      this.helmetM.setMatrixAt(i, tmp);
      const k = 1 - (p.helmet - 1) * 0.16;
      this.helmetM.setColorAt(i, col.setHex(HELMET[p.team]).multiplyScalar(k));
    } else this.helmetM.setMatrixAt(i, ZERO);

    if (p.armor > 0) {
      const s = 1 + (p.armor - 1) * 0.06;
      tmp.multiplyMatrices(torso, sc.makeScale(s, 1, s));
      this.vestM.setMatrixAt(i, tmp);
      this.vestM.setColorAt(i, col.setHex(VEST[p.armor]));
    } else this.vestM.setMatrixAt(i, ZERO);

    this.packM.setMatrixAt(i, far || p.armor < 2 ? ZERO : torso);

    // braços
    const aim = pitch * 0.6;
    const relaxed = p.downed || (p.sprint && amp > 0.5);
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 0.235 : -0.235;
      let rx: number, rz: number, bend: number;
      if (p.downed) { rx = 0.2; rz = side === 0 ? -0.5 : 0.5; bend = 0.3; }
      else if (p.prone) { rx = Math.PI - 0.5 + (side === 0 ? 0.25 : -0.1) + (side === 0 ? -sw : sw) * 0.3; rz = side === 0 ? -0.15 : 0.35; bend = -0.5; }
      else if (relaxed) { rx = (side === 0 ? -sw : sw) * 1.1 + 0.2; rz = side === 0 ? -0.08 : 0.08; bend = 1.0; }
      else if (side === 0) { rx = 0.75 + aim; rz = -0.1; bend = 1.15; }
      else { rx = 1.25 + aim; rz = 0.5; bend = 0.35; }
      a1.multiplyMatrices(torso, local(sx, 0.5, 0, rx, 0, rz));
      const k = i * 2 + side;
      this.upperM.setMatrixAt(k, a1); this.upperM.setColorAt(k, col.setRGB(ur, ug, ub));
      if (far) this.foreM.setMatrixAt(k, ZERO);
      else { a2.multiplyMatrices(a1, local(0, -0.3, 0, bend, 0, 0)); this.foreM.setMatrixAt(k, a2); this.foreM.setColorAt(k, col.setRGB(ur, ug, ub)); }
    }

    // pernas
    for (let side = 0; side < 2; side++) {
      const s = side === 0 ? 1 : -1;
      let th: number, knee: number;
      if (p.downed) { th = side === 0 ? 0.25 : -0.05; knee = side === 0 ? -0.5 : -0.1; }
      else if (p.prone) { th = s * 0.12 + s * sw * 0.2; knee = side === 0 ? -0.15 - Math.max(0, sw) * 0.5 : -0.1 - Math.max(0, -sw) * 0.5; }
      else {
        th = s * sw * 0.8 + c * (side === 0 ? 1.25 : 1.05);
        knee = -((0.08 + 0.85 * Math.max(0, s * cs)) * amp + c * (side === 0 ? 2.05 : 1.85));
      }
      a1.multiplyMatrices(hips, local(s * 0.095, -0.06, 0, th, 0, 0));
      const k = i * 2 + side;
      this.thighM.setMatrixAt(k, a1); this.thighM.setColorAt(k, col.setRGB(ur * 0.88, ug * 0.88, ub * 0.88));
      a2.multiplyMatrices(a1, local(0, -0.44, 0, knee, 0, 0));
      this.shinM.setMatrixAt(k, a2); this.shinM.setColorAt(k, col.setRGB(ur * 0.88, ug * 0.88, ub * 0.88));
    }

    // arma
    if (!p.downed && !(far && p.dist > 260)) {
      const g = this.guns[p.gun];
      const gi = this.gunN[p.gun]++;
      if (p.prone) tmp.multiplyMatrices(torso, local(0.11, 0.62, 0.02, Math.PI / 2, 0, 0));
      else if (relaxed) tmp.multiplyMatrices(torso, local(0.13, 0.28, -0.22, -0.55, 0.5, 0));
      else tmp.multiplyMatrices(torso, local(0.13, 0.4, -0.33, aim * 0.75 + lean, 0, 0));
      g.setMatrixAt(gi, tmp);
    }

    if (p.marker) {
      const mi = this.markN++;
      this.markerM.setMatrixAt(mi, local(p.x, p.y + (p.downed ? 0.9 : p.prone ? 0.9 : 2.12 - 0.4 * c), p.z, 0, performance.now() / 600, 0));
      this.markerM.setColorAt(mi, p.marker === 2 ? col.setHex(0xff3030) : p.downed ? col.setHex(0xffe14d) : col.setHex(TEAM_COLORS[p.team]));
    }
  }

  end() {
    const n = this.n;
    const set = (im: THREE.InstancedMesh, count: number) => {
      im.count = count;
      if (count > 0) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    };
    set(this.hipsM, n); set(this.torsoM, n); set(this.headM, n); set(this.helmetM, n); set(this.vestM, n); set(this.packM, n);
    set(this.upperM, n * 2); set(this.foreM, n * 2); set(this.thighM, n * 2); set(this.shinM, n * 2);
    for (let k = 0; k < 4; k++) set(this.guns[k], this.gunN[k]);
    set(this.markerM, this.markN);
  }

  forget(id: number) { this.seen[id] = 0; }
}
