import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ITEMS, type Item } from '@warbit/shared';

// =====================================================================
// Um modelo próprio para cada arma da loja, montado a partir de uma "ficha":
// corpo, cano, guarda-mão, coronha, carregador, cores e acessórios.
// Usado na arma em 1ª pessoa, nos soldados e na prévia da loja.
// Eixos: frente = -Z, origem na empunhadura, metros.
// =====================================================================

type Stock = 'fixed' | 'skeleton' | 'folded' | 'wood' | 'thumbhole' | 'none';
type Mag = 'curved' | 'straight' | 'box' | 'drum' | 'tube' | 'pistol' | 'none';
type Guard = 'rail' | 'wood' | 'slim' | 'none';
type Extra = 'suppressor' | 'brake' | 'bipod' | 'carry' | 'scope' | 'bigscope' | 'foregrip' | 'pump' | 'cylinder' | 'bolt' | 'slide';

interface Spec {
  body: number;      // cor do corpo/receptor
  furn: number;      // cor da coronha/empunhadura/guarda-mão
  recv: number;      // comprimento do receptor
  recvH: number;     // altura do receptor
  barrel: number;    // comprimento do cano à frente do receptor
  br: number;        // raio do cano
  guard: Guard; guardLen: number;
  stock: Stock;
  mag: Mag; magLen: number;
  extras: Extra[];
}

const BLACK = 0x26282b, GUNMETAL = 0x3a3e42, STEEL = 0x8f959b, TAN = 0x9c8763, OLIVE = 0x5a6340, WOOD = 0x7a4a2a, WOOD2 = 0x5e3d24, FDE = 0xb09a72, GREEN = 0x3f4a33;

const SPECS: Record<string, Spec> = {
  // pistolas
  pistola: { body: BLACK, furn: 0x1f1f1f, recv: 0.19, recvH: 0.045, barrel: 0, br: 0.008, guard: 'none', guardLen: 0, stock: 'none', mag: 'pistol', magLen: 0.11, extras: ['slide'] },
  revolver: { body: STEEL, furn: WOOD, recv: 0.1, recvH: 0.05, barrel: 0.15, br: 0.012, guard: 'none', guardLen: 0, stock: 'none', mag: 'none', magLen: 0, extras: ['cylinder'] },
  // fuzis
  fuzil_basico: { body: GUNMETAL, furn: WOOD, recv: 0.34, recvH: 0.075, barrel: 0.3, br: 0.012, guard: 'wood', guardLen: 0.22, stock: 'wood', mag: 'box', magLen: 0.07, extras: ['bolt'] },
  fuzil_leve: { body: BLACK, furn: OLIVE, recv: 0.3, recvH: 0.08, barrel: 0.2, br: 0.012, guard: 'slim', guardLen: 0.18, stock: 'skeleton', mag: 'straight', magLen: 0.13, extras: [] },
  fuzil_padrao: { body: 0x2e3033, furn: 0x8a4b2a, recv: 0.38, recvH: 0.08, barrel: 0.24, br: 0.013, guard: 'wood', guardLen: 0.2, stock: 'fixed', mag: 'curved', magLen: 0.2, extras: ['brake'] },
  fuzil_tatico: { body: BLACK, furn: FDE, recv: 0.34, recvH: 0.085, barrel: 0.2, br: 0.012, guard: 'rail', guardLen: 0.26, stock: 'fixed', mag: 'straight', magLen: 0.15, extras: ['foregrip', 'carry'] },
  fuzil_batalha: { body: 0x2b2d2a, furn: GREEN, recv: 0.42, recvH: 0.09, barrel: 0.32, br: 0.015, guard: 'wood', guardLen: 0.24, stock: 'fixed', mag: 'box', magLen: 0.13, extras: ['brake', 'carry'] },
  // submetralhadoras
  smg_compacta: { body: BLACK, furn: 0x1d1d1d, recv: 0.24, recvH: 0.08, barrel: 0.06, br: 0.012, guard: 'none', guardLen: 0, stock: 'folded', mag: 'straight', magLen: 0.16, extras: ['foregrip'] },
  smg_padrao: { body: 0x2a2c2e, furn: BLACK, recv: 0.3, recvH: 0.09, barrel: 0.08, br: 0.013, guard: 'slim', guardLen: 0.14, stock: 'fixed', mag: 'curved', magLen: 0.15, extras: [] },
  smg_pesada: { body: 0x2f2f2f, furn: WOOD2, recv: 0.32, recvH: 0.09, barrel: 0.14, br: 0.015, guard: 'none', guardLen: 0, stock: 'wood', mag: 'drum', magLen: 0, extras: ['foregrip'] },
  // escopeta
  escopeta: { body: GUNMETAL, furn: WOOD, recv: 0.22, recvH: 0.08, barrel: 0.46, br: 0.018, guard: 'none', guardLen: 0, stock: 'wood', mag: 'tube', magLen: 0.34, extras: ['pump'] },
  // precisão
  carabina_scout: { body: GUNMETAL, furn: OLIVE, recv: 0.34, recvH: 0.07, barrel: 0.34, br: 0.012, guard: 'slim', guardLen: 0.24, stock: 'fixed', mag: 'box', magLen: 0.06, extras: ['bolt', 'scope'] },
  rifle_semi: { body: 0x303234, furn: 0x8a4b2a, recv: 0.42, recvH: 0.08, barrel: 0.42, br: 0.012, guard: 'wood', guardLen: 0.24, stock: 'thumbhole', mag: 'box', magLen: 0.12, extras: ['scope', 'brake'] },
  sniper_ferrolho: { body: GUNMETAL, furn: FDE, recv: 0.44, recvH: 0.08, barrel: 0.5, br: 0.014, guard: 'slim', guardLen: 0.3, stock: 'thumbhole', mag: 'box', magLen: 0.07, extras: ['bolt', 'bigscope', 'bipod'] },
  sniper_pesado: { body: BLACK, furn: GREEN, recv: 0.46, recvH: 0.09, barrel: 0.52, br: 0.016, guard: 'rail', guardLen: 0.3, stock: 'skeleton', mag: 'box', magLen: 0.09, extras: ['bolt', 'bigscope', 'bipod', 'suppressor'] },
  antimaterial: { body: 0x3b3d3a, furn: 0x2c2e2b, recv: 0.56, recvH: 0.11, barrel: 0.6, br: 0.022, guard: 'rail', guardLen: 0.34, stock: 'skeleton', mag: 'box', magLen: 0.12, extras: ['bigscope', 'bipod', 'brake'] },
  // metralhadoras (fase 2)
  mtr_leve: { body: BLACK, furn: OLIVE, recv: 0.42, recvH: 0.1, barrel: 0.34, br: 0.015, guard: 'rail', guardLen: 0.22, stock: 'fixed', mag: 'drum', magLen: 0, extras: ['bipod', 'carry'] },
  mtr_media: { body: 0x2b2d2a, furn: WOOD2, recv: 0.48, recvH: 0.11, barrel: 0.42, br: 0.017, guard: 'slim', guardLen: 0.2, stock: 'wood', mag: 'box', magLen: 0.14, extras: ['bipod', 'carry', 'brake'] },
};

// ---------- geometria ----------
const _c = new THREE.Color();
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
const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z);
const box = (w: number, h: number, d: number, color: number, m: THREE.Matrix4, r = 0.005) =>
  paint(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 0.0005, h / 2 - 0.0005, d / 2 - 0.0005)), color, m);
/** cilindro ao longo do eixo Z, começando em z0 e indo para a frente (z menor) */
const tubeZ = (r: number, len: number, z0: number, y: number, color: number, x = 0, seg = 8, open = false) =>
  paint(new THREE.CylinderGeometry(r, r, len, seg, 1, open), color, M(x, y, z0 - len / 2, Math.PI / 2));
/** aro (anel) virado para frente: dá para ver através */
const ring = (r: number, z: number, y: number, color: number, thick = 0.005) =>
  paint(new THREE.TorusGeometry(r, thick, 5, 14), color, M(0, y, z));
const merge = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts, false)!; g.computeVertexNormals(); return g; };

export interface GunModel {
  body: THREE.BufferGeometry;
  irons: THREE.BufferGeometry | null;
  /** luneta embutida (armas de precisão), separada para sumir quando se compra outra mira */
  scopeGeo: THREE.BufferGeometry | null;
  /** topo do receptor: onde a mira óptica comprada é montada */
  topY: number;
  /** altura da linha de mira (mira de ferro ou luneta embutida) */
  sightY: number;
  /** z da mira traseira (onde o olho alinha) */
  rearZ: number;
  muzzleZ: number;
  /** tem luneta própria (armas de precisão) */
  scope: boolean;
}

const cache = new Map<string, GunModel>();

export function gunModel(id: string): GunModel {
  const hit = cache.get(id);
  if (hit) return hit;
  const s = SPECS[id] ?? SPECS.fuzil_basico;
  const parts: THREE.BufferGeometry[] = [];
  const irons: THREE.BufferGeometry[] = [];
  const scopeParts: THREE.BufferGeometry[] = [];
  const has =(e: Extra) => s.extras.includes(e);
  const handgun = s.stock === 'none';
  const rRear = 0.1;                       // traseira do receptor
  const rFront = rRear - s.recv;           // frente do receptor
  const top = s.recvH / 2;                 // topo do receptor (centro em y=0)

  // receptor
  if (has('cylinder')) {
    // revólver: armação, tambor e cão
    parts.push(box(0.04, 0.06, s.recv, s.body, M(0, 0.01, rRear - s.recv / 2)));
    parts.push(paint(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), 0x6f757b, M(0, 0.01, rRear - 0.05, Math.PI / 2)));
    parts.push(box(0.012, 0.025, 0.02, s.body, M(0, 0.05, rRear + 0.005)));
  } else if (has('slide')) {
    parts.push(box(0.034, 0.042, s.recv, s.body, M(0, 0.022, rRear - s.recv / 2), 0.006));     // ferrolho
    parts.push(box(0.03, 0.025, s.recv * 0.85, 0x2d2d2d, M(0, -0.008, rRear - s.recv * 0.45))); // armação
    for (let k = 0; k < 4; k++) parts.push(box(0.036, 0.03, 0.004, 0x1a1a1a, M(0, 0.024, rRear - 0.015 - k * 0.009))); // serrilhas
  } else {
    parts.push(box(0.05, s.recvH, s.recv, s.body, M(0, 0, rRear - s.recv / 2), 0.008));
    parts.push(box(0.008, s.recvH * 0.35, s.recv * 0.35, 0x161616, M(0.026, 0.005, rRear - s.recv * 0.45), 0.002)); // janela de ejeção
    if (!has('scope') && !has('bigscope')) parts.push(box(0.022, 0.012, s.recv * 0.8, 0x1c1c1c, M(0, top + 0.006, rRear - s.recv * 0.45), 0.002)); // trilho
  }

  // cano
  const bz0 = rFront;
  if (s.barrel > 0) parts.push(tubeZ(s.br, s.barrel + 0.02, bz0 + 0.02, 0.012, 0x232527));
  let muzzle = bz0 - s.barrel;
  if (has('suppressor')) { parts.push(tubeZ(s.br + 0.016, 0.17, muzzle, 0.012, 0x1d1f20, 0, 10)); muzzle -= 0.17; }
  if (has('brake')) { parts.push(tubeZ(s.br + 0.008, 0.05, muzzle, 0.012, 0x2a2c2e, 0, 6)); muzzle -= 0.05; }

  // guarda-mão
  if (s.guard === 'rail') {
    parts.push(box(0.056, 0.06, s.guardLen, s.furn, M(0, 0.006, bz0 - s.guardLen / 2), 0.006));
    for (let k = 0; k < Math.floor(s.guardLen / 0.03); k++) parts.push(box(0.06, 0.006, 0.012, 0x1c1c1c, M(0, 0.038, bz0 - 0.02 - k * 0.03), 0.001));
  } else if (s.guard === 'wood') {
    parts.push(box(0.05, 0.05, s.guardLen, s.furn, M(0, -0.002, bz0 - s.guardLen / 2), 0.014));
  } else if (s.guard === 'slim') {
    parts.push(box(0.042, 0.045, s.guardLen, s.furn, M(0, 0.002, bz0 - s.guardLen / 2), 0.012));
  }
  if (has('pump')) parts.push(box(0.05, 0.045, 0.14, s.furn, M(0, -0.03, bz0 - 0.12), 0.012));
  if (has('foregrip')) parts.push(box(0.03, 0.085, 0.035, s.furn === 0x1d1d1d ? 0x2a2a2a : s.furn, M(0, -0.07, bz0 - Math.max(0.06, s.guardLen * 0.45)), 0.008));
  if (has('bipod')) {
    for (const x of [-0.016, 0.016]) parts.push(paint(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 5), 0x1c1c1c, M(x, -0.02, muzzle + s.barrel * 0.35, Math.PI / 2)));
  }

  // empunhadura e guarda-mato
  if (handgun) {
    parts.push(box(0.032, 0.11, 0.046, s.furn, M(0, -0.05, rRear - 0.03, 0.18), 0.008));
  } else {
    parts.push(box(0.034, 0.1, 0.045, s.furn === WOOD || s.furn === WOOD2 || s.furn === 0x8a4b2a ? 0x2a2a2a : s.furn, M(0, -0.08, rRear - 0.04, 0.28), 0.008));
  }
  parts.push(box(0.012, 0.012, 0.06, 0x202020, M(0, -s.recvH / 2 - 0.022, rRear - 0.075), 0.003));

  // carregador
  const magZ = handgun ? rRear - 0.03 : rRear - s.recv * 0.55;
  switch (s.mag) {
    case 'straight': parts.push(box(0.03, s.magLen, 0.07, 0x1f2022, M(0, -s.recvH / 2 - s.magLen / 2 + 0.01, magZ, 0.12), 0.006)); break;
    case 'curved': {
      const n = 3, seg = s.magLen / n;
      for (let k = 0; k < n; k++) parts.push(box(0.03, seg + 0.01, 0.07, s.furn === 0x8a4b2a ? 0x6b3d22 : 0x1f2022, M(0, -s.recvH / 2 - seg * (k + 0.5) + 0.01, magZ - k * 0.025, 0.12 + k * 0.18), 0.006));
      break;
    }
    case 'box': parts.push(box(0.034, s.magLen, 0.08, 0x1f2022, M(0, -s.recvH / 2 - s.magLen / 2 + 0.01, magZ), 0.006)); break;
    case 'drum': parts.push(paint(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14), 0x1f2022, M(0, -s.recvH / 2 - 0.06, magZ, 0, 0, Math.PI / 2))); break;
    case 'tube': parts.push(tubeZ(0.014, s.magLen, bz0, -0.026, 0x232527)); break;
    case 'pistol': break; // dentro da empunhadura
    case 'none': break;
  }

  // coronha
  switch (s.stock) {
    case 'fixed':
      parts.push(box(0.045, 0.085, 0.24, s.furn, M(0, -0.012, rRear + 0.12, -0.05), 0.01));
      parts.push(box(0.05, 0.11, 0.025, 0x1a1a1a, M(0, -0.018, rRear + 0.245), 0.006));
      break;
    case 'skeleton':
      parts.push(box(0.022, 0.02, 0.24, s.furn, M(0, 0.018, rRear + 0.12), 0.004));
      parts.push(box(0.022, 0.02, 0.22, s.furn, M(0, -0.045, rRear + 0.11, -0.12), 0.004));
      parts.push(box(0.04, 0.1, 0.03, 0x1a1a1a, M(0, -0.012, rRear + 0.24), 0.006));
      break;
    case 'folded':
      parts.push(box(0.012, 0.03, 0.22, 0x2a2a2a, M(0.032, 0.0, rRear - 0.09), 0.003));
      break;
    case 'wood':
      parts.push(box(0.045, 0.075, 0.18, s.furn, M(0, -0.008, rRear + 0.08, -0.12), 0.014));
      parts.push(box(0.045, 0.11, 0.12, s.furn, M(0, -0.04, rRear + 0.21, -0.12), 0.014));
      break;
    case 'thumbhole':
      parts.push(box(0.045, 0.03, 0.26, s.furn, M(0, 0.012, rRear + 0.13), 0.01));
      parts.push(box(0.045, 0.035, 0.22, s.furn, M(0, -0.07, rRear + 0.13, -0.08), 0.01));
      parts.push(box(0.045, 0.12, 0.05, s.furn, M(0, -0.025, rRear + 0.25), 0.012));
      break;
    case 'none': break;
  }
  if (has('bolt')) parts.push(box(0.012, 0.012, 0.05, STEEL, M(0.04, 0.01, rRear - 0.06, 0, 0.6, 0), 0.004), paint(new THREE.SphereGeometry(0.012, 6, 4), STEEL, M(0.07, 0.006, rRear - 0.04)));

  // mira: luneta própria, alça de transporte ou mira de ferro
  let sightY = top + 0.018, rearZ = rRear - 0.02;
  let scope = false;
  if (has('scope') || has('bigscope')) {
    const big = has('bigscope');
    const r = big ? 0.026 : 0.021, len = big ? 0.3 : 0.22, y = top + (big ? 0.05 : 0.042);
    const z0 = rRear - 0.03;
    // luneta OCA (tubos abertos + aros): dá para enxergar através dela ao mirar
    scopeParts.push(tubeZ(r, len, z0, y, 0x15171a, 0, 12, true));
    scopeParts.push(tubeZ(r + 0.008, 0.05, z0 + 0.01, y, 0x101112, 0, 12, true));
    scopeParts.push(tubeZ(r + 0.012, 0.06, z0 - len + 0.05, y, 0x101112, 0, 12, true));
    scopeParts.push(ring(r + 0.008, z0 + 0.01, y, 0x0d0d0e, 0.006), ring(r + 0.012, z0 - len + 0.0, y, 0x0d0d0e, 0.006));
    scopeParts.push(tubeZ(r + .001, .002, z0 + .005, y, 0x294b56, 0, 24));
    scopeParts.push(tubeZ(r + .005, .002, z0 - len + .003, y, 0x294b56, 0, 24));
    scopeParts.push(paint(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 6), 0x1a1a1a, M(0, y + r + 0.008, z0 - len / 2)));
    for (const dz of [-0.05, -len + 0.08]) scopeParts.push(box(0.016, y - top, 0.02, 0x1b1b1b, M(0, top + (y - top) / 2, z0 + dz), 0.002));
    sightY = y; rearZ = z0; scope = true;
  } else if (has('carry')) {
    parts.push(box(0.022, 0.04, s.recv * 0.55, s.body, M(0, top + 0.022, rRear - s.recv * 0.4), 0.004));
    sightY = top + 0.05; rearZ = rRear - 0.04;
    irons.push(box(0.006, 0.026, 0.008, 0x111111, M(0, sightY - 0.012, muzzle + s.barrel * 0.1 + 0.01), 0.001));
    for (const sx of [-0.009, 0.009]) irons.push(box(0.006, 0.016, 0.01, 0x111111, M(sx, sightY - 0.008, rearZ), 0.001));
  } else {
    const fz = handgun ? rRear - s.recv + 0.012 : (s.barrel > 0.1 ? muzzle + 0.04 : rFront + 0.02);
    // massa de mira: um pino que sobe até a linha de mira
    irons.push(box(0.006, sightY - 0.0, 0.008, 0x111111, M(0, sightY / 2 + 0.002, fz), 0.001));
    for (const sx of [-0.009, 0.009]) irons.push(box(0.006, 0.02, 0.012, 0x111111, M(sx, sightY - 0.01, rearZ), 0.001));
  }

  const model: GunModel = { body: merge(parts), irons: irons.length ? merge(irons) : null, scopeGeo: scopeParts.length ? merge(scopeParts) : null, topY: top, sightY, rearZ, muzzleZ: muzzle, scope };
  cache.set(id, model);
  return model;
}

/** geometria única (corpo + mira de ferro) para os soldados em 3ª pessoa */
export function gunGeometryFull(id: string): THREE.BufferGeometry {
  const m = gunModel(id);
  const list = [m.body, ...(m.scopeGeo ? [m.scopeGeo] : []), ...(m.irons ? [m.irons] : [])];
  return list.length > 1 ? mergeGeometries(list, false)! : m.body;
}

/** todas as armas da loja (inclusive as "em breve") */
export const WEAPON_ITEMS: Item[] = ITEMS.filter((i) => i.weapon || SPECS[i.id]);
