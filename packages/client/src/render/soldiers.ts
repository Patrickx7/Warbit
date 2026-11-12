import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAX_PLAYERS } from '@warbit/shared';

// =====================================================================
// Geometria do soldado — tudo gerado em código, sem arquivo de modelo.
// Proporções de soldado equipado: pernas mais curtas, tronco e equipamento volumosos.
// =====================================================================
const _c = new THREE.Color();
const W = 0xffffff;

function paint(g: THREE.BufferGeometry, color: number, m?: THREE.Matrix4): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (m) geo.applyMatrix4(m);
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.setHex(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const TR = (x: number, y: number, z: number, rx: number, ry = 0, rz = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z);
const TS = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => T(x, y, z).multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
/** caixa de cantos arredondados */
const rb = (w: number, h: number, d: number, color: number, m?: THREE.Matrix4, r = 0.012) =>
  paint(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), color, m);
/** membro: pivô no topo, desce no eixo -Y */
const limb = (rTop: number, rBot: number, len: number, color: number) => paint(new THREE.CylinderGeometry(rTop, rBot, len, 8), color, T(0, -len / 2, 0));
const merge = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts, false)!; g.computeVertexNormals(); return g; };

/** manchas de tecido/camuflagem: escurece triângulos em manchas (o tom final vem da cor do time) */
function blotch(g: THREE.BufferGeometry, amt: number, freq = 9): THREE.BufferGeometry {
  const p = g.attributes.position, c = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i + 2 < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const h = Math.abs(Math.sin(Math.floor(cx * freq) * 12.9898 + Math.floor(cy * freq) * 78.233 + Math.floor(cz * freq) * 37.719) * 43758.5453) % 1;
    const f = h > 0.5 ? 1 - amt * ((h - 0.5) / 0.5) : 1;
    for (let k = 0; k < 3; k++) c.setXYZ(i + k, c.getX(i + k) * f, c.getY(i + k) * f, c.getZ(i + k) * f);
  }
  return g;
}

const DARK = 0x1b1c1e, GLOVE = 0x1e1f1c, BOOT = 0x17171a, SKIN = 0xc99472;

function hipsGeo() {
  return blotch(merge([
    rb(0.35, 0.2, 0.23, W, T(0, 0, 0), 0.04),
    rb(0.365, 0.05, 0.245, 0x262626, T(0, 0.085, 0)),           // cinto
    rb(0.07, 0.1, 0.06, 0x3a3a34, T(0.16, 0.03, -0.1)),          // bolsa no cinto
    rb(0.06, 0.13, 0.05, 0x2a2a28, T(-0.19, -0.01, 0.02)),       // coldre
  ]), 0.4);
}
function torsoGeo() {
  const g = new THREE.BoxGeometry(0.44, 0.58, 0.25, 1, 2, 1).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) { p.setX(i, p.getX(i) * 0.8); p.setZ(i, p.getZ(i) * 0.88); }
  g.translate(0, 0.29, 0);
  return blotch(merge([
    paint(g, W),
    rb(0.11, 0.12, 0.15, W, T(0.24, 0.5, 0), 0.04),
    rb(0.11, 0.12, 0.15, W, T(-0.24, 0.5, 0), 0.04),
    paint(new THREE.CylinderGeometry(0.058, 0.07, 0.1, 8), DARK, T(0, 0.62, 0)), // pescoço (balaclava)
  ]), 0.45);
}
function headGeo() {
  return merge([
    paint(new THREE.IcosahedronGeometry(0.112, 1), SKIN, T(0, 0.11, 0)),
    // balaclava: cobre o alto da cabeça e o rosto de baixo, deixa a faixa dos olhos
    paint(new THREE.SphereGeometry(0.119, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), DARK, T(0, 0.112, 0)),
    paint(new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4), 0x222326, T(0, 0.112, 0)),
    rb(0.2, 0.05, 0.05, 0x3a2a12, T(0, 0.128, -0.1), 0.015),     // óculos
    paint(new THREE.CylinderGeometry(0.122, 0.122, 0.028, 12, 1, true), 0x141414, T(0, 0.128, 0.004)), // elástico dos óculos
  ]);
}
function helmetGeo() {
  return merge([
    paint(new THREE.SphereGeometry(0.152, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.53), W, TS(0, 0.125, 0.008, 1, 0.95, 1.1)),
    paint(new THREE.CylinderGeometry(0.155, 0.158, 0.022, 12), 0xd8d8d8, T(0, 0.118, 0.008)),
    rb(0.052, 0.11, 0.11, 0x3a3c3a, T(0.145, 0.095, 0.01), 0.02),   // protetor de ouvido
    rb(0.052, 0.11, 0.11, 0x3a3c3a, T(-0.145, 0.095, 0.01), 0.02),
    paint(new THREE.TorusGeometry(0.16, 0.008, 4, 16, Math.PI), 0x2a2a2a, TR(0, 0.12, 0.01, 0, 0, 0)), // arco do fone
    rb(0.06, 0.05, 0.035, 0x9a9a9a, T(0, 0.205, -0.152), 0.008),    // suporte de visão noturna
    rb(0.02, 0.012, 0.2, 0x5a5a5a, T(0.085, 0.24, 0.0), 0.004),     // trilhos
    rb(0.02, 0.012, 0.2, 0x5a5a5a, T(-0.085, 0.24, 0.0), 0.004),
  ]);
}
/** colete de placas com bolsos de carregador */
function vestGeo() {
  const parts = [
    rb(0.4, 0.36, 0.08, W, T(0, 0.33, -0.152), 0.02),       // placa frontal
    rb(0.4, 0.38, 0.07, W, T(0, 0.33, 0.152), 0.02),        // placa traseira
    rb(0.07, 0.04, 0.3, 0xcfcfcf, T(0.12, 0.535, 0)),        // alças
    rb(0.07, 0.04, 0.3, 0xcfcfcf, T(-0.12, 0.535, 0)),
    rb(0.44, 0.15, 0.3, 0xe2e2e2, T(0, 0.13, 0), 0.03),      // faixa abdominal
  ];
  for (const x of [-0.11, 0, 0.11]) parts.push(rb(0.085, 0.13, 0.055, 0xd8d8d8, T(x, 0.21, -0.215), 0.012)); // carregadores
  parts.push(rb(0.13, 0.08, 0.05, 0xc8c8c8, T(-0.08, 0.42, -0.205)));   // bolsa do peito
  parts.push(rb(0.08, 0.11, 0.08, 0xd0d0d0, T(0.235, 0.15, -0.02)));   // bolsa lateral
  return merge(parts);
}
const OLIVE = 0x5b6540, OLIVE2 = 0x67723f, TAN = 0x8b7b48, TAN2 = 0x9a8952, STRAP = 0x24251f;
function packGeo(tier: number) {
  const parts: THREE.BufferGeometry[] = [];
  const molle = (w: number, y0: number, rows: number, z: number, color: number) => { for (let k = 0; k < rows; k++) parts.push(rb(w, 0.014, 0.014, color, T(0, y0 + k * 0.075, z), 0.004)); };
  if (tier === 1) {
    parts.push(rb(0.3, 0.34, 0.15, DARK, T(0, 0.34, 0.27), 0.04));          // mochila de assalto preta/escura
    parts.push(rb(0.28, 0.1, 0.16, 0x2b2c2a, T(0, 0.5, 0.275), 0.03));
    molle(0.24, 0.24, 3, 0.35, 0x3a3b36);
  } else if (tier === 2) {
    parts.push(rb(0.36, 0.5, 0.2, OLIVE, T(0, 0.38, 0.29), 0.05));
    parts.push(rb(0.34, 0.12, 0.21, OLIVE2, T(0, 0.62, 0.295), 0.04));
    parts.push(paint(new THREE.CylinderGeometry(0.075, 0.075, 0.36, 10), 0x3b3f34, TR(0, 0.73, 0.29, 0, 0, Math.PI / 2))); // saco de dormir
    parts.push(rb(0.075, 0.22, 0.11, OLIVE2, T(0.22, 0.27, 0.29), 0.03));
    parts.push(rb(0.075, 0.22, 0.11, OLIVE2, T(-0.22, 0.27, 0.29), 0.03));
    molle(0.3, 0.2, 4, 0.395, 0x7d7653);
  } else {
    parts.push(rb(0.42, 0.66, 0.26, TAN, T(0, 0.44, 0.32), 0.06));          // mochila de patrulha coyote
    parts.push(rb(0.4, 0.15, 0.27, TAN2, T(0, 0.79, 0.325), 0.05));
    parts.push(rb(0.095, 0.3, 0.14, 0x84743f, T(0.265, 0.3, 0.32), 0.03));
    parts.push(rb(0.095, 0.3, 0.14, 0x84743f, T(-0.265, 0.3, 0.32), 0.03));
    parts.push(rb(0.32, 0.27, 0.07, 0x7d6e3c, T(0, 0.34, 0.47), 0.03));
    parts.push(rb(0.05, 0.04, 0.02, 0x333333, T(0, 0.5, 0.51), 0.008));
    for (const x of [-0.12, 0.12]) parts.push(rb(0.03, 0.62, 0.012, STRAP, T(x, 0.44, 0.455), 0.004)); // tiras de compressão
    molle(0.36, 0.56, 3, 0.455, 0xa8975e);
    parts.push(paint(new THREE.CylinderGeometry(0.085, 0.085, 0.4, 10), 0x4a4a3c, TR(0, 0.09, 0.3, 0, 0, Math.PI / 2))); // saco embaixo
  }
  // alças sobre os ombros (aparecem pela frente)
  for (const x of [-0.11, 0.11]) parts.push(rb(0.055, 0.04, 0.34, STRAP, T(x, 0.555, 0.02), 0.01));
  return merge(parts);
}
function upperArmGeo() {
  return blotch(merge([limb(0.064, 0.055, 0.3, W)]), 0.4);
}
function armbandGeo() {
  return paint(new THREE.CylinderGeometry(0.071, 0.067, 0.085, 10), W, T(0, -0.11, 0));
}
function forearmGeo() {
  return merge([
    blotch(limb(0.054, 0.045, 0.26, W), 0.4),
    rb(0.085, 0.1, 0.095, GLOVE, T(0, -0.31, 0), 0.025),
    rb(0.075, 0.07, 0.07, 0xb9b39a, T(0, -0.03, -0.02), 0.02),   // cotoveleira
  ]);
}
function thighGeo() {
  return blotch(merge([
    limb(0.094, 0.074, 0.4, W),
    rb(0.04, 0.13, 0.11, 0xe0e0e0, T(0.088, -0.18, 0), 0.015), // bolso cargo
  ]), 0.4);
}
function shinGeo() {
  return merge([
    blotch(limb(0.072, 0.058, 0.36, W), 0.4),
    rb(0.12, 0.14, 0.075, 0xb2a789, T(0, -0.02, -0.065), 0.03),   // joelheira
    rb(0.11, 0.1, 0.12, BOOT, T(0, -0.35, 0), 0.02),              // cano da bota
    rb(0.11, 0.1, 0.27, BOOT, T(0, -0.42, -0.05), 0.025),         // bota
    rb(0.115, 0.025, 0.28, 0x0a0a0a, T(0, -0.475, -0.05), 0.006), // sola
  ]);
}
const barrel = (r: number, len: number, z: number, y = 0.02) => paint(new THREE.CylinderGeometry(r, r, len, 6), 0x34383c, TR(0, y, z - len / 2, Math.PI / 2));
const METAL = 0x34383c, WOOD = 0x6e4f33;
function gunGeo(kind: number) {
  const box = (w: number, h: number, d: number, color: number, m: THREE.Matrix4) => rb(w, h, d, color, m, 0.006);
  switch (kind) {
    case 1:
      return merge([box(0.05, 0.1, 0.34, METAL, T(0, 0.01, -0.1)), barrel(0.014, 0.16, -0.27), box(0.035, 0.17, 0.05, 0x222222, T(0, -0.11, -0.12)), box(0.04, 0.07, 0.16, 0x2a2a2a, T(0, 0, 0.14)), box(0.035, 0.1, 0.045, 0x222222, T(0, -0.08, 0.02))]);
    case 2:
      return merge([box(0.05, 0.08, 0.5, WOOD, T(0, 0, -0.12)), barrel(0.013, 0.5, -0.37), box(0.045, 0.11, 0.26, WOOD, T(0, -0.02, 0.25)), paint(new THREE.CylinderGeometry(0.024, 0.024, 0.24, 8), 0x1b1b1b, TR(0, 0.085, -0.1, Math.PI / 2)), box(0.03, 0.08, 0.05, 0x222222, T(0, -0.07, -0.08))]);
    case 3:
      return merge([box(0.035, 0.05, 0.19, METAL, T(0, 0.03, -0.07)), box(0.034, 0.11, 0.045, 0x222222, T(0, -0.03, 0.0))]);
    default:
      return merge([box(0.05, 0.09, 0.44, METAL, T(0, 0.01, -0.12)), barrel(0.013, 0.26, -0.34), box(0.045, 0.1, 0.22, 0x2a2a2a, T(0, -0.01, 0.2)), box(0.035, 0.15, 0.065, 0x222222, TR(0, -0.1, -0.13, 0.25)), box(0.035, 0.1, 0.045, 0x222222, T(0, -0.08, 0.03)), box(0.03, 0.05, 0.1, 0x1b1b1b, T(0, 0.08, -0.1))]);
  }
}

// =====================================================================
// Visual de cada time: uniforme próprio + braçadeira na cor do time
// =====================================================================
export const TEAM_LOOK = [
  { jacket: 0x34558c, pants: 0x7e8794, band: 0x2f7bff }, // Azul: jaqueta azul, calça cinza-azulada
  { jacket: 0x2a2c30, pants: 0x34383e, band: 0xe23535 }, // Vermelho: tudo preto
  { jacket: 0x6a7444, pants: 0x6e6646, band: 0x2fd04a }, // Verde: camuflado oliva/terra
];
const HELMET_TINT = [0, 0x8a8f86, 0x737866, 0x5c6150, 0x40443a];
const VEST_TINT = [0, 0x7a7d58, 0x8c8160, 0x5f6249, 0x3c3f37];

export const GUN_KIND: Record<string, number> = { rifle: 0, smg: 1, shotgun: 1, sniper: 2, pistol: 3 };

export interface SoldierPose {
  id: number;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  crouch: boolean; prone: boolean; sprint: boolean; downed: boolean;
  team: number; armor: number; helmet: number; pack: number; gun: number;
  marker: number; // 0 nenhum, 1 aliado, 2 inimigo marcado
  camo: number;   // 0..1: dentro de uma moita
  dist: number;
}

const HIP_Y = 0.87;
const m0 = new THREE.Matrix4(), root = new THREE.Matrix4(), hips = new THREE.Matrix4(), torso = new THREE.Matrix4(), head = new THREE.Matrix4();
const a1 = new THREE.Matrix4(), a2 = new THREE.Matrix4(), tmp = new THREE.Matrix4(), sc = new THREE.Matrix4();
const eul = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const col = new THREE.Color();
const jac = new THREE.Color(), pan = new THREE.Color();

function local(x: number, y: number, z: number, rx: number, ry: number, rz: number): THREE.Matrix4 {
  return m0.makeRotationFromEuler(eul.set(rx, ry, rz)).setPosition(x, y, z);
}

/**
 * Desenha até 100 soldados com ~20 draw calls no total:
 * uma InstancedMesh por parte do corpo/equipamento, animação procedural calculada por quadro.
 */
export class Soldiers {
  readonly group = new THREE.Group();
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private hipsM: THREE.InstancedMesh; private torsoM: THREE.InstancedMesh; private headM: THREE.InstancedMesh;
  private helmetM: THREE.InstancedMesh; private vestM: THREE.InstancedMesh;
  private packMs: THREE.InstancedMesh[] = [];
  private upperM: THREE.InstancedMesh; private bandM: THREE.InstancedMesh; private foreM: THREE.InstancedMesh;
  private thighM: THREE.InstancedMesh; private shinM: THREE.InstancedMesh;
  private guns: THREE.InstancedMesh[] = [];
  private markerM: THREE.InstancedMesh;
  private all: THREE.InstancedMesh[] = [];
  private n = 0;
  private gunN = [0, 0, 0, 0];
  private packN = [0, 0, 0];
  private markN = 0;
  private phase = new Float32Array(MAX_PLAYERS);
  private crouchAmt = new Float32Array(MAX_PLAYERS);
  private speed = new Float32Array(MAX_PLAYERS);
  private px = new Float32Array(MAX_PLAYERS);
  private pz = new Float32Array(MAX_PLAYERS);
  private seen = new Uint8Array(MAX_PLAYERS);
  triangles = 0;

  constructor(max = MAX_PLAYERS) {
    const mk = (g: THREE.BufferGeometry, count: number, material: THREE.Material = this.mat, perSoldier = 1) => {
      const im = new THREE.InstancedMesh(g, material, count);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, col.setHex(0xffffff));
      im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      this.group.add(im);
      this.all.push(im);
      this.triangles += (g.attributes.position.count / 3) * perSoldier;
      return im;
    };
    this.hipsM = mk(hipsGeo(), max);
    this.torsoM = mk(torsoGeo(), max);
    this.headM = mk(headGeo(), max);
    this.helmetM = mk(helmetGeo(), max);
    this.vestM = mk(vestGeo(), max);
    for (let t = 1; t <= 3; t++) this.packMs.push(mk(packGeo(t), max, this.mat, 1 / 3));
    this.upperM = mk(upperArmGeo(), max * 2, this.mat, 2);
    this.bandM = mk(armbandGeo(), max);
    this.foreM = mk(forearmGeo(), max * 2, this.mat, 2);
    this.thighM = mk(thighGeo(), max * 2, this.mat, 2);
    this.shinM = mk(shinGeo(), max * 2, this.mat, 2);
    for (let k = 0; k < 4; k++) this.guns.push(mk(gunGeo(k), max, this.mat, 0.25));
    this.markerM = mk(new THREE.OctahedronGeometry(0.11, 0), max, new THREE.MeshBasicMaterial({ fog: false }), 0);
  }

  get drawCalls() { return this.all.length; }

  begin() {
    this.n = 0; this.markN = 0;
    this.gunN.fill(0); this.packN.fill(0);
  }

  add(p: SoldierPose, dt: number) {
    const i = this.n++;
    const id = p.id;
    if (!this.seen[id]) { this.seen[id] = 1; this.px[id] = p.x; this.pz[id] = p.z; this.speed[id] = 0; }
    const inst = dt > 0 ? Math.hypot(p.x - this.px[id], p.z - this.pz[id]) / dt : 0;
    this.px[id] = p.x; this.pz[id] = p.z;
    this.speed[id] += (Math.min(inst, 10) - this.speed[id]) * Math.min(1, dt * 10);
    const v = p.downed ? 0 : this.speed[id];
    const far = p.dist > 160;
    // passada: comprimento cresce com a velocidade (sem "patinar")
    const stride = p.sprint ? 2.3 : 1.5;
    this.phase[id] += (v * dt * Math.PI * 2) / stride;
    const cTarget = p.crouch && !p.prone ? 1 : 0;
    this.crouchAmt[id] += (cTarget - this.crouchAmt[id]) * Math.min(1, dt * 12);
    const c = this.crouchAmt[id];
    const ph = this.phase[id];
    const amp = far ? 0 : Math.min(1, v / 3.6);
    const sw = Math.sin(ph) * amp * (p.sprint ? 0.95 : 0.6);
    const cs = Math.cos(ph);

    // cores do time (+ leve variação por soldado; dentro da moita puxa para a cor da folhagem)
    const look = TEAM_LOOK[p.team] ?? TEAM_LOOK[0];
    const vary = 0.92 + (id % 5) * 0.035;
    const cm = p.camo * 0.55;
    jac.setHex(look.jacket).multiplyScalar(vary);
    pan.setHex(look.pants).multiplyScalar(vary);
    jac.setRGB(jac.r * (1 - cm) + 0.24 * cm, jac.g * (1 - cm) + 0.4 * cm, jac.b * (1 - cm) + 0.18 * cm);
    pan.setRGB(pan.r * (1 - cm) + 0.24 * cm, pan.g * (1 - cm) + 0.4 * cm, pan.b * (1 - cm) + 0.18 * cm);

    root.copy(local(p.x, p.y, p.z, 0, p.yaw, 0));
    if (p.downed) root.multiply(local(0, 0.16, -0.75, Math.PI / 2 - 0.06, 0, 0));
    else if (p.prone) root.multiply(local(0, 0.14, 0.55, -Math.PI / 2 + 0.05, 0, 0)); // de bruços, cabeça para frente
    const bounce = Math.abs(Math.sin(ph)) * (p.sprint ? 0.05 : 0.025) * amp;
    const hipY = p.prone ? HIP_Y : HIP_Y - 0.41 * c + bounce;
    hips.multiplyMatrices(root, local(0, hipY, 0, 0, sw * 0.12, 0));
    const pitch = p.downed ? 0 : p.pitch;
    const lean = p.downed || p.prone ? 0 : 0.05 + (p.sprint ? 0.24 : 0.04) * amp + c * 0.3;
    // tronco gira contra o quadril ao andar (contra-rotação natural)
    torso.multiplyMatrices(hips, local(0, 0.06, 0, -lean + pitch * 0.35, -sw * 0.22, 0));
    head.multiplyMatrices(torso, local(0, 0.62, 0, pitch * 0.45 + lean * 0.6, sw * 0.12, 0));

    this.hipsM.setMatrixAt(i, hips); this.hipsM.setColorAt(i, pan);
    this.torsoM.setMatrixAt(i, torso); this.torsoM.setColorAt(i, jac);
    this.headM.setMatrixAt(i, head);

    if (p.helmet > 0) {
      const s = 1 + (p.helmet - 1) * 0.04;
      tmp.multiplyMatrices(head, sc.makeScale(s, s, s));
      this.helmetM.setMatrixAt(i, tmp);
      this.helmetM.setColorAt(i, col.setHex(HELMET_TINT[p.helmet]));
    } else this.helmetM.setMatrixAt(i, ZERO);

    if (p.armor > 0) {
      const s = 1 + (p.armor - 1) * 0.05;
      tmp.multiplyMatrices(torso, sc.makeScale(s, 1, s));
      this.vestM.setMatrixAt(i, tmp);
      this.vestM.setColorAt(i, col.setHex(VEST_TINT[p.armor]));
    } else this.vestM.setMatrixAt(i, ZERO);

    if (p.pack > 0 && p.pack <= 3) {
      const pm = this.packMs[p.pack - 1];
      const k = this.packN[p.pack - 1]++;
      pm.setMatrixAt(k, torso);
      const pv = 0.9 + ((id * 7) % 5) * 0.03;
      pm.setColorAt(k, col.setRGB(pv, pv, pv));
    }

    // braços
    const aim = pitch * 0.6;
    const relaxed = p.downed || (p.sprint && amp > 0.5);
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 0.25 : -0.25;
      let rx: number, rz: number, bend: number;
      if (p.downed) { rx = 0.2; rz = side === 0 ? -0.5 : 0.5; bend = 0.3; }
      else if (p.prone) { rx = Math.PI - 0.5 + (side === 0 ? 0.25 : -0.1) + (side === 0 ? -sw : sw) * 0.3; rz = side === 0 ? -0.15 : 0.35; bend = -0.5; }
      else if (relaxed) { rx = 0.55 + (side === 0 ? -sw : sw) * 0.35; rz = side === 0 ? -0.15 : 0.25; bend = 1.5; } // arma atravessada no peito, correndo
      else if (side === 0) { rx = 0.75 + aim; rz = -0.1; bend = 1.15; }
      else { rx = 1.25 + aim; rz = 0.5; bend = 0.35; }
      a1.multiplyMatrices(torso, local(sx, 0.5, 0, rx, 0, rz));
      const k = i * 2 + side;
      this.upperM.setMatrixAt(k, a1); this.upperM.setColorAt(k, jac);
      if (side === 1) { this.bandM.setMatrixAt(i, a1); this.bandM.setColorAt(i, col.setHex(look.band)); } // braçadeira no braço esquerdo
      if (far) this.foreM.setMatrixAt(k, ZERO);
      else { a2.multiplyMatrices(a1, local(0, -0.3, 0, bend, 0, 0)); this.foreM.setMatrixAt(k, a2); this.foreM.setColorAt(k, jac); }
    }

    // pernas
    for (let side = 0; side < 2; side++) {
      const s = side === 0 ? 1 : -1;
      let th: number, knee: number;
      if (p.downed) { th = side === 0 ? 0.25 : -0.05; knee = side === 0 ? -0.5 : -0.1; }
      else if (p.prone) { th = s * 0.12 + s * sw * 0.2; knee = side === 0 ? -0.15 - Math.max(0, sw) * 0.5 : -0.1 - Math.max(0, -sw) * 0.5; }
      else {
        const run = p.sprint ? 1 : 0;
        th = s * sw * (0.85 + run * 0.25) + c * (side === 0 ? 1.25 : 1.05);
        // joelho dobra mais na fase em que a perna vem para frente
        knee = -((0.1 + (0.75 + run * 0.6) * Math.max(0, s * cs)) * amp + c * (side === 0 ? 2.05 : 1.85));
      }
      a1.multiplyMatrices(hips, local(s * 0.1, -0.04, 0, th, 0, 0));
      const k = i * 2 + side;
      this.thighM.setMatrixAt(k, a1); this.thighM.setColorAt(k, pan);
      a2.multiplyMatrices(a1, local(0, -0.4, 0, knee, 0, 0));
      this.shinM.setMatrixAt(k, a2); this.shinM.setColorAt(k, pan);
    }

    // arma
    if (!p.downed && !(far && p.dist > 260)) {
      const g = this.guns[p.gun];
      const gi = this.gunN[p.gun]++;
      if (p.prone) tmp.multiplyMatrices(torso, local(0.11, 0.62, 0.02, Math.PI / 2, 0, 0));
      else if (relaxed) tmp.multiplyMatrices(torso, local(0.02, 0.36, -0.26, 0.85, 0.35, 0.7)); // atravessada no peito
      else tmp.multiplyMatrices(torso, local(0.13, 0.4, -0.33, aim * 0.75 + lean, 0, 0));
      g.setMatrixAt(gi, tmp);
    }

    if (p.marker) {
      const mi = this.markN++;
      this.markerM.setMatrixAt(mi, local(p.x, p.y + (p.downed || p.prone ? 0.9 : 2.12 - 0.4 * c), p.z, 0, performance.now() / 600, 0));
      this.markerM.setColorAt(mi, p.marker === 2 ? col.setHex(0xff3030) : p.downed ? col.setHex(0xffe14d) : col.setHex(look.band));
    }
  }

  end() {
    const n = this.n;
    const set = (im: THREE.InstancedMesh, count: number) => {
      im.count = count;
      if (count > 0) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    };
    set(this.hipsM, n); set(this.torsoM, n); set(this.headM, n); set(this.helmetM, n); set(this.vestM, n);
    for (let t = 0; t < 3; t++) set(this.packMs[t], this.packN[t]);
    set(this.upperM, n * 2); set(this.bandM, n); set(this.foreM, n * 2); set(this.thighM, n * 2); set(this.shinM, n * 2);
    for (let k = 0; k < 4; k++) set(this.guns[k], this.gunN[k]);
    set(this.markerM, this.markN);
  }

  forget(id: number) { this.seen[id] = 0; }
}
