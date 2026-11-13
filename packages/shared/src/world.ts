import { WORLD_SIZE, STEP_HEIGHT, BUSH_RADIUS_MIN, BUSH_RADIUS_MAX, BUSH_HEIGHT_MIN, BUSH_HEIGHT_MAX } from './config';
import { hash2, mulberry32 } from './rng';

export const BoxKind = {
  Building: 0, Crate: 1, Wall: 2, Tree: 3, Sandbag: 4, Base: 5, House: 6, Roof: 7, Fence: 8, Container: 9, Rock: 10, Fob: 11, Industrial: 12,
} as const;
export type BoxKind = number;

/** Tipo de chão de cada vértice do terreno (cor do terreno e onde nasce grama). */
export const Surface = { Grass: 0, Road: 1, Field: 2, Dirt: 3, Forest: 4, Concrete: 5 } as const;

export interface Box {
  id: number;
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  kind: BoxKind;
  color: number;
}

export interface Tree { x: number; y: number; z: number; h: number; s: number }
export interface Point2 { x: number; z: number }
export interface Bush { x: number; y: number; z: number; r: number; h: number }
export interface RoofDecor { x0: number; z0: number; x1: number; z1: number; y: number; h: number; color: number; sawtooth?: boolean }
export interface RockDecor { x: number; y: number; z: number; s: number; rot: number }
export interface Poi { x: number; z: number; name: string; r: number }

interface Door { side: number; w: number; h: number }
interface HouseOpts {
  wallH: number; color: number; roofColor: number; doors: Door[];
  win?: { w: number; y0: number; y1: number; gap: number };
  pitched?: boolean; floorColor?: number; kind?: number;
}

const GRID_N = 256;
const CELL = WORLD_SIZE / GRID_N;
const N1 = GRID_N + 1;
const BCELL = 20; // célula da grade espacial de caixas
const BGRID = Math.ceil(WORLD_SIZE / BCELL);

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
function clamp01(t: number) { return t < 0 ? 0 : t > 1 ? 1 : t; }

function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

const HOUSE_COLORS = [0xd8c9a8, 0xc9b38f, 0xe0d6c2, 0xb9a88a, 0xcfbfa0, 0xa89f92];
const ROOF_COLORS = [0x8e4a3a, 0x7a3f33, 0x6b5a4a, 0x9a5a3a, 0x5d5f63];
const APT_COLORS = [0xb8a58a, 0xa9a39a, 0xc4b59a, 0x9c9488, 0xbfae98, 0x8f8c86];
const CAR_COLORS = [0x8a2f2a, 0x2f4f7a, 0xc9c4b5, 0x3e5e3a, 0x6e6a60, 0xb88a2e];
const CONTAINER_COLORS = [0xa8382c, 0x2c5ca8, 0x2f8a4a, 0xc28a1f, 0x6f7377, 0x8a4a2a];

/**
 * Mapa desenhado (determinístico pelo seed): 3 bases muradas, 4 pontos de interesse onde a
 * Control Zone pode cair — Vila Central, Distrito Industrial, Fazenda Boa Vista e Posto Avançado —
 * ligados por estradas de terra, com florestas, campos, casas em que dá para entrar e moitas.
 */
export class World {
  readonly seed: number;
  readonly heights = new Float32Array(N1 * N1);
  readonly surface = new Uint8Array(N1 * N1);
  readonly boxes: Box[] = [];
  readonly trees: Tree[] = [];
  readonly bases: Point2[] = [];
  readonly pois: Poi[] = [];
  readonly czCandidates: Point2[] = [];
  readonly bushes: Bush[] = [];
  readonly roofs: RoofDecor[] = [];
  readonly rocks: RockDecor[] = [];
  readonly houses: Point2[] = [];
  readonly details: Box[] = [];
  readonly industrialProps: { x: number; y: number; z: number; r: number; h: number; kind: 'tank' | 'silo' | 'chimney' }[] = [];
  readonly facilities: Point2[] = [];
  readonly roads: { ax: number; az: number; bx: number; bz: number }[] = [];
  readonly streets: { x0: number; z0: number; x1: number; z1: number }[] = [];
  private bushGrid = new Map<number, Bush[]>();
  private grid = new Map<number, Box[]>();
  private nextBoxId = 1;
  private rnd: () => number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rnd = mulberry32(this.seed);
    this.generate();
  }

  /** compatibilidade: centros dos pontos de interesse */
  get villages(): Point2[] { return this.pois; }

  // =====================================================================
  // geração
  // =====================================================================
  private generate() {
    const s = this.seed;
    const C = WORLD_SIZE / 2;
    // ---- terreno base
    for (let j = 0; j <= GRID_N; j++) {
      for (let i = 0; i <= GRID_N; i++) {
        const x = i * CELL, z = j * CELL;
        let h = valueNoise(x / 420, z / 420, s) * 26;
        h += valueNoise(x / 130, z / 130, s + 11) * 7;
        h += valueNoise(x / 30, z / 30, s + 23) * 1.2;
        const ex = Math.min(x, WORLD_SIZE - x, z, WORLD_SIZE - z);
        if (ex < 70) h += (1 - ex / 70) * 16;
        this.heights[j * N1 + i] = h;
      }
    }

    // ---- layout: bases em triângulo, pontos de interesse entre elas
    for (let t = 0; t < 3; t++) {
      const a = -Math.PI / 2 + (t * 2 * Math.PI) / 3;
      this.bases.push({ x: C + Math.cos(a) * 500, z: C + Math.sin(a) * 500 });
    }
    this.pois.push({ x: C - 45 * Math.cos(-Math.PI / 6), z: C - 45 * Math.sin(-Math.PI / 6), name: 'Vila Central', r: 90 });
    const names = ['Distrito Industrial', 'Fazenda Boa Vista', 'Posto Avançado'];
    const radii = [110, 80, 85];
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + Math.PI / 3 + (k * 2 * Math.PI) / 3;
      const distance = k === 0 ? 180 : 240;
      this.pois.push({ x: C + Math.cos(a) * distance, z: C + Math.sin(a) * distance, name: names[k], r: radii[k] });
    }
    for (const p of this.pois) this.czCandidates.push({ x: p.x, z: p.z });

    // ---- morro do posto avançado
    const op = this.pois[3];
    this.eachVertex(op.x, op.z, 190, (k, d) => { this.heights[k] += 16 * smooth(clamp01(1 - d / 190)); });

    // ---- áreas planas
    for (const b of this.bases) this.flatten(b.x, b.z, 70, 130);
    this.flatten(this.pois[0].x, this.pois[0].z, 135, 200);
    this.flatten(this.pois[1].x, this.pois[1].z, 115, 170);
    this.flatten(this.pois[2].x, this.pois[2].z, 70, 120);
    this.flatten(op.x, op.z, 80, 120);

    // ---- estradas
    const P = this.pois;
    for (let t = 0; t < 3; t++) this.road(this.bases[t], P[0], 26);
    for (let k = 0; k < 3; k++) {
      this.road(P[k + 1], P[0], 18);
      this.road(P[k + 1], this.bases[k], 22);
      this.road(P[k + 1], this.bases[(k + 1) % 3], 22);
    }

    // ---- pontos de interesse
    this.buildBases();
    this.buildTown(P[0]);
    this.buildIndustrial(P[1]);
    this.buildFarm(P[2]);
    this.buildOutpost(P[3]);

    // pinta as estradas por cima de tudo
    for (let k = 0; k < N1 * N1; k++) {
      const x = (k % N1) * CELL, z = Math.floor(k / N1) * CELL;
      if (this.roadDist(x, z) < 3.6) this.surface[k] = Surface.Road;
    }

    this.buildCountryside();
    this.buildForests();
    this.buildRocks();
    this.buildBushes();
  }

  private eachVertex(x: number, z: number, R: number, fn: (k: number, d: number) => void) {
    const i0 = Math.max(0, Math.floor((x - R) / CELL)), i1 = Math.min(GRID_N, Math.ceil((x + R) / CELL));
    const j0 = Math.max(0, Math.floor((z - R) / CELL)), j1 = Math.min(GRID_N, Math.ceil((z + R) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i * CELL - x, j * CELL - z);
      if (d < R) fn(j * N1 + i, d);
    }
  }

  private flatten(x: number, z: number, r: number, R: number) {
    const target = this.heightAt(x, z);
    this.eachVertex(x, z, R, (k, d) => {
      const w = d <= r ? 1 : smooth(1 - (d - r) / (R - r));
      this.heights[k] += (target - this.heights[k]) * w;
    });
  }

  private paintCircle(x: number, z: number, r: number, surf: number) {
    this.eachVertex(x, z, r, (k) => { this.surface[k] = surf; });
  }

  private paintRect(x0: number, z0: number, x1: number, z1: number, surf: number) {
    const i0 = Math.max(0, Math.ceil(x0 / CELL)), i1 = Math.min(GRID_N, Math.floor(x1 / CELL));
    const j0 = Math.max(0, Math.ceil(z0 / CELL)), j1 = Math.min(GRID_N, Math.floor(z1 / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.surface[j * N1 + i] = surf;
  }

  private road(a: Point2, b: Point2, wig: number) {
    const rnd = this.rnd;
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    const nx = -dz / L, nz = dx / L, ph = rnd() * 6.28;
    const n = Math.max(6, Math.round(L / 30));
    let px = a.x, pz = a.z;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const off = Math.sin(t * Math.PI) * Math.sin(t * Math.PI * 2 + ph) * wig;
      const x = a.x + dx * t + nx * off, z = a.z + dz * t + nz * off;
      this.roads.push({ ax: px, az: pz, bx: x, bz: z });
      px = x; pz = z;
    }
  }

  /** Distância até a estrada mais próxima. */
  roadDist(x: number, z: number): number {
    let best = Infinity;
    for (const r of this.roads) {
      const minx = Math.min(r.ax, r.bx) - best, maxx = Math.max(r.ax, r.bx) + best;
      if (x < minx || x > maxx) continue;
      const minz = Math.min(r.az, r.bz) - best, maxz = Math.max(r.az, r.bz) + best;
      if (z < minz || z > maxz) continue;
      const vx = r.bx - r.ax, vz = r.bz - r.az;
      const t = clamp01(((x - r.ax) * vx + (z - r.az) * vz) / (vx * vx + vz * vz));
      const d = Math.hypot(x - (r.ax + vx * t), z - (r.az + vz * t));
      if (d < best) best = d;
    }
    return best;
  }

  /** Retângulo livre de construções (árvores e moitas não contam). */
  private areaFree(x0: number, z0: number, x1: number, z1: number, m: number): boolean {
    if (x0 - m < 4 || z0 - m < 4 || x1 + m > WORLD_SIZE - 4 || z1 + m > WORLD_SIZE - 4) return false;
    const i0 = Math.floor((x0 - m) / BCELL), i1 = Math.floor((x1 + m) / BCELL);
    const j0 = Math.floor((z0 - m) / BCELL), j1 = Math.floor((z1 + m) / BCELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const arr = this.cellBoxes(i, j);
      if (!arr) continue;
      for (const b of arr) {
        if (b.kind === BoxKind.Tree) continue;
        if (b.x0 < x1 + m && b.x1 > x0 - m && b.z0 < z1 + m && b.z1 > z0 - m) return false;
      }
    }
    return true;
  }

  private nearRoad(x0: number, z0: number, x1: number, z1: number, m: number): boolean {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    return this.roadDist(cx, cz) < Math.hypot(x1 - x0, z1 - z0) / 2 + m;
  }

  private solid(x0: number, z0: number, x1: number, z1: number, h: number, kind: number, color: number, sink = 3): Box {
    const lo = Math.min(this.heightAt(x0, z0), this.heightAt(x1, z0), this.heightAt(x0, z1), this.heightAt(x1, z1));
    const hi = Math.max(this.heightAt(x0, z0), this.heightAt(x1, z0), this.heightAt(x0, z1), this.heightAt(x1, z1));
    return this.addBox({ id: 0, x0, x1, z0, z1, y0: lo - sink, y1: hi + h, kind, color });
  }

  /** caixa centrada */
  private block(cx: number, cz: number, w: number, d: number, h: number, kind: number, color: number, sink = 3): Box {
    return this.solid(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h, kind, color, sink);
  }

  /** Casa em que dá para entrar: piso, paredes com porta e janelas de verdade, laje. */
  private house(cx: number, cz: number, w: number, d: number, o: HouseOpts): boolean {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const hs = [this.heightAt(x0, z0), this.heightAt(x1, z0), this.heightAt(x0, z1), this.heightAt(x1, z1), this.heightAt(cx, cz)];
    const lo = Math.min(...hs), hi = Math.max(...hs);
    if (hi - lo > 0.55) return false;
    if (!this.areaFree(x0, z0, x1, z1, 1.2)) return false;
    const kind = o.kind ?? BoxKind.House;
    const fy = hi + 0.12, base = lo - 2, th = 0.3, top = fy + o.wallH;
    this.addBox({ id: 0, x0, x1, z0, z1, y0: base, y1: fy, kind, color: o.floorColor ?? 0x7d6e5c });
    for (let side = 0; side < 4; side++) {
      const alongX = side === 0 || side === 2;
      const a0 = alongX ? x0 : z0 + th, a1 = alongX ? x1 : z1 - th;
      const len = a1 - a0, mid = (a0 + a1) / 2;
      const f0 = side === 0 ? z0 : side === 2 ? z1 - th : side === 1 ? x1 - th : x0;
      const ops: { c: number; w: number; y0: number; y1: number }[] = [];
      for (const dr of o.doors) if (dr.side === side) ops.push({ c: mid, w: dr.w, y0: 0, y1: dr.h });
      if (o.win) {
        const n = Math.max(0, Math.floor((len - 1.5) / o.win.gap));
        for (let k = 0; k < n; k++) {
          const c = a0 + ((k + 0.5) * len) / n;
          if (ops.some((p) => Math.abs(p.c - c) < (p.w + o.win!.w) / 2 + 0.5)) continue;
          ops.push({ c, w: o.win.w, y0: o.win.y0, y1: o.win.y1 });
        }
      }
      this.wallRun(alongX, f0, f0 + th, a0, a1, base, fy, top, ops, kind, o.color);
      const trim = (a: number, b: number, y0: number, y1: number, color = 0xe2d8c2) => {
        this.details.push(alongX
          ? { id: 0, x0: a, x1: b, z0: f0 - .07, z1: f0 + th + .07, y0, y1, kind: BoxKind.Wall, color }
          : { id: 0, x0: f0 - .07, x1: f0 + th + .07, z0: a, z1: b, y0, y1, kind: BoxKind.Wall, color });
      };
      trim(a0, a1, fy - .18, fy, 0x777368);
      trim(a0, a1, top - .16, top, 0xd6cfbd);
      for (const op of ops) {
        const a = op.c - op.w / 2, b = op.c + op.w / 2;
        trim(a - .1, a, fy + op.y0, fy + op.y1 + .1);
        trim(b, b + .1, fy + op.y0, fy + op.y1 + .1);
        trim(a, b, fy + op.y1, fy + op.y1 + .1);
        if (op.y0 > 0) trim(a - .1, b + .1, fy + op.y0 - .1, fy + op.y0);
      }
    }
    this.addBox({ id: 0, x0: x0 - 0.25, x1: x1 + 0.25, z0: z0 - 0.25, z1: z1 + 0.25, y0: top, y1: top + 0.25, kind: BoxKind.Roof, color: o.roofColor });
    if (o.pitched) this.roofs.push({ x0: x0 - 0.4, z0: z0 - 0.4, x1: x1 + 0.4, z1: z1 + 0.4, y: top + 0.25, h: Math.min(w, d) * 0.3, color: o.roofColor });
    if (o.pitched && o.wallH < 4) {
      this.details.push({ id: 0, x0: x0 + 1, x1: x0 + 1.7, z0: cz - .4, z1: cz + .4, y0: top, y1: top + Math.min(w, d) * .3 + .7, kind: BoxKind.Wall, color: 0x895d48 });
      // Móveis encostados nos cantos deixam o centro e as portas livres.
      const furniture = (xa: number, za: number, xb: number, zb: number, h: number, color: number) =>
        this.addBox({ id: 0, x0: xa, x1: xb, z0: za, z1: zb, y0: fy, y1: fy + h, kind: BoxKind.Crate, color });
      furniture(x0 + .5, z0 + .5, x0 + 2.5, z0 + 1.5, .55, 0x7e8270);
      furniture(x1 - 1.8, z1 - 1.3, x1 - .5, z1 - .5, .8, 0x73553b);
      furniture(x0 + .5, z1 - 1.3, x0 + 1.6, z1 - .5, 1.8, 0x68513d);
      if (w >= 12 && d >= 10) {
        furniture(cx - .12, z0 + th, cx + .12, cz - 1.1, o.wallH, o.color);
        furniture(cx - .12, cz + 1.1, cx + .12, z1 - th, o.wallH, o.color);
      }
    }
    this.houses.push({ x: cx, z: cz });
    for (const door of o.doors) {
      const side = door.side;
      const sx = side === 1 ? x1 + .3 : side === 3 ? x0 - .3 : cx;
      const sz = side === 0 ? z0 - .3 : side === 2 ? z1 + .3 : cz;
      const sw = side % 2 === 0 ? door.w + .2 : .6, sd = side % 2 === 0 ? .6 : door.w + .2;
      const ground = this.heightAt(sx, sz);
      this.addBox({ id: 0, x0: sx - sw / 2, x1: sx + sw / 2, z0: sz - sd / 2, z1: sz + sd / 2, y0: ground - .4, y1: Math.max(ground + .03, fy - .12), kind: BoxKind.Wall, color: 0x99958a });
    }
    return true;
  }

  private wallRun(alongX: boolean, f0: number, f1: number, a0: number, a1: number, base: number, fy: number, top: number,
    ops: { c: number; w: number; y0: number; y1: number }[], kind: number, color: number) {
    ops.sort((p, q) => p.c - q.c);
    let cur = a0;
    const mk = (s0: number, s1: number, y0: number, y1: number) => {
      if (s1 - s0 < 0.05 || y1 - y0 < 0.05) return;
      this.addBox(alongX ? { id: 0, x0: s0, x1: s1, z0: f0, z1: f1, y0, y1, kind, color } : { id: 0, x0: f0, x1: f1, z0: s0, z1: s1, y0, y1, kind, color });
    };
    for (const op of ops) {
      const s0 = op.c - op.w / 2, s1 = op.c + op.w / 2;
      if (s0 < cur) continue;
      mk(cur, s0, base, top);
      if (op.y0 > 0) mk(s0, s1, base, fy + op.y0);
      if (fy + op.y1 < top) mk(s0, s1, fy + op.y1, top);
      cur = s1;
    }
    mk(cur, a1, base, top);
  }

  private homeOpts(doorSide: number, rnd: () => number): HouseOpts {
    return {
      wallH: 2.9, color: HOUSE_COLORS[Math.floor(rnd() * HOUSE_COLORS.length)], roofColor: ROOF_COLORS[Math.floor(rnd() * ROOF_COLORS.length)],
      doors: [{ side: doorSide, w: 1.4, h: 2.25 }, ...(rnd() < 0.5 ? [{ side: (doorSide + 2) % 4, w: 1.4, h: 2.25 }] : [])],
      win: { w: 1.25, y0: 1.0, y1: 2.05, gap: 3.6 }, pitched: true,
    };
  }

  private car(cx: number, cz: number, alongX: boolean, rnd: () => number) {
    const L = 4.3, W = 1.85;
    const w = alongX ? L : W, d = alongX ? W : L;
    if (!this.areaFree(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 0.8)) return;
    const col = CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)];
    const g = this.heightAt(cx, cz);
    this.addBox({ id: 0, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: g - 1, y1: g + 1.0, kind: BoxKind.Crate, color: col });
    const cw = alongX ? 2.2 : W - 0.2, cd = alongX ? W - 0.2 : 2.2;
    this.addBox({ id: 0, x0: cx - cw / 2, x1: cx + cw / 2, z0: cz - cd / 2, z1: cz + cd / 2, y0: g + 1.0, y1: g + 1.55, kind: BoxKind.Crate, color: 0x2a3540 });
  }

  // ---------------------------------------------------------------------
  private buildBases() {
    this.bases.forEach((b) => {
      this.paintCircle(b.x, b.z, 62, Surface.Dirt);
      const H = 46, T = 0.8, gap = 14, wh = 2.7, col = 0x8a8f94;
      for (const s of [-1, 1]) {
        // paredes norte/sul (ao longo de X) e leste/oeste (ao longo de Z), cada uma com portão no meio
        for (const half of [-1, 1]) {
          const a = half < 0 ? -H : gap / 2, c = half < 0 ? -gap / 2 : H;
          this.solid(b.x + a, b.z + s * H - T / 2, b.x + c, b.z + s * H + T / 2, wh, BoxKind.Base, col);
          this.solid(b.x + s * H - T / 2, b.z + a, b.x + s * H + T / 2, b.z + c, wh, BoxKind.Base, col);
        }
        for (const s2 of [-1, 1]) this.block(b.x + s * (H - 3), b.z + s2 * (H - 3), 3, 3, 7, BoxKind.Building, 0x6e6253);
      }
      this.block(b.x - 18, b.z - 18, 14, 11, 6, BoxKind.Building, 0x6b7280);
      this.block(b.x + 20, b.z - 20, 16, 8, 4, BoxKind.Building, 0x7d7466);
      this.block(b.x + 20, b.z + 20, 16, 8, 4, BoxKind.Building, 0x7d7466);
      for (let k = 0; k < 6; k++) this.block(b.x - 24 + k * 3.2, b.z + 26, 1.6, 1.6, 1.3, BoxKind.Crate, 0x6a5a3e, 1);
    });
  }

  private buildTown(T: Poi) {
    const rnd = this.rnd;
    const B = 34, S = 8, P = B + S;
    // ruas
    for (let k = -2; k <= 1; k++) {
      const c = (k + 0.5) * P;
      this.streets.push({ x0: T.x + c - S / 2, z0: T.z - 1.5 * P - S / 2, x1: T.x + c + S / 2, z1: T.z + 1.5 * P + S / 2 });
      this.streets.push({ x0: T.x - 1.5 * P - S / 2, z0: T.z + c - S / 2, x1: T.x + 1.5 * P + S / 2, z1: T.z + c + S / 2 });
      this.paintRect(T.x + c - S / 2, T.z - 1.5 * P - S / 2, T.x + c + S / 2, T.z + 1.5 * P + S / 2, Surface.Road);
      this.paintRect(T.x - 1.5 * P - S / 2, T.z + c - S / 2, T.x + 1.5 * P + S / 2, T.z + c + S / 2, Surface.Road);
    }
    for (let gi = -1; gi <= 1; gi++) for (let gj = -1; gj <= 1; gj++) {
      const bx = T.x + gi * P, bz = T.z + gj * P;
      if (gi === 0 && gj === 0) {
        // praça
        this.paintRect(bx - B / 2, bz - B / 2, bx + B / 2, bz + B / 2, Surface.Concrete);
        this.block(bx, bz, 2.4, 2.4, 1.2, BoxKind.Wall, 0x9a9a92, 1);
        this.block(bx, bz, 1.0, 1.0, 4.2, BoxKind.Wall, 0x8c8c86, 1);
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2 + Math.PI / 4;
          this.block(bx + Math.cos(a) * 9, bz + Math.sin(a) * 9, 2.2, 0.6, 0.55, BoxKind.Crate, 0x6e5238, 1);
        }
        continue;
      }
      this.paintRect(bx - B / 2, bz - B / 2, bx + B / 2, bz + B / 2, Surface.Dirt);
      const r = rnd();
      const splitX = rnd() < 0.5;
      if (r < 0.5) {
        // duas casas, porta para a rua
        for (const s of [-1, 1]) {
          const w = 10 + rnd() * 3, d = 8.5 + rnd() * 2.5;
          const hx = splitX ? bx + s * 8.5 : bx + (rnd() - 0.5) * 6, hz = splitX ? bz + (rnd() - 0.5) * 6 : bz + s * 8.5;
          const door = splitX ? (s < 0 ? 3 : 1) : (s < 0 ? 0 : 2);
          this.house(hx, hz, splitX ? d : w, splitX ? w : d, this.homeOpts(door, rnd));
        }
        // muro de quintal
        if (rnd() < 0.6) this.solid(bx - 0.3, bz - B / 2 + 2, bx + 0.3, bz - B / 2 + 9, 1.2, BoxKind.Wall, 0x9a8f80, 1);
      } else if (r < 0.82) {
        // prédio sólido de 2 a 4 andares
        const w = 18 + rnd() * 8, d = 13 + rnd() * 7, floors = 2 + Math.floor(rnd() * 3);
        const lo = this.heightAt(bx, bz);
        this.addBox({ id: 0, x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2, y0: lo - 4, y1: lo + floors * 2.9 + 0.5, kind: BoxKind.Building, color: APT_COLORS[Math.floor(rnd() * APT_COLORS.length)] });
        for (let k = 0; k < 3; k++) this.block(bx + (rnd() - 0.5) * B * 0.9, bz + (s1(rnd) * (d / 2 + 2.5)), 1.4, 1.4, 1.2, BoxKind.Crate, 0x7a5c38, 1);
      } else {
        // terreno baldio com ruínas
        const lw = 6 + rnd() * 6;
        this.solid(bx - lw / 2, bz - 0.3, bx + lw / 2, bz + 0.3, 1.6 + rnd() * 1.2, BoxKind.Wall, 0x8f8a80, 1);
        this.solid(bx - lw / 2 - 0.3, bz, bx - lw / 2 + 0.3, bz + 4 + rnd() * 4, 1.4 + rnd(), BoxKind.Wall, 0x8f8a80, 1);
        this.ruinRemains(bx, bz, lw, 6);
        for (let k = 0; k < 4; k++) this.block(bx + (rnd() - 0.5) * 24, bz + (rnd() - 0.5) * 24, 1.3, 1.3, 1.1, BoxKind.Crate, 0x7a5c38, 1);
      }
    }
    // carros abandonados nas ruas
    for (let k = 0; k < 16; k++) {
      const line = Math.floor(rnd() * 4) - 2, along = (rnd() - 0.5) * 2.8 * P;
      const c = (line + 0.5) * P + (rnd() < 0.5 ? -2 : 2);
      if (rnd() < 0.5) this.car(T.x + c, T.z + along, false, rnd);
      else this.car(T.x + along, T.z + c, true, rnd);
    }
  }

  private buildIndustrial(I: Poi) {
    const rnd = this.rnd;
    this.paintCircle(I.x, I.z, 104, Surface.Concrete);
    const whOpts = (a: number, b: number): HouseOpts => ({
      wallH: 6.5, color: 0x9aa0a6, roofColor: 0x5d6166, kind: BoxKind.House, floorColor: 0x6f7377,
      doors: [{ side: a, w: 5, h: 4.6 }, { side: b, w: 5, h: 4.6 }], win: { w: 2, y0: 4.2, y1: 5.3, gap: 6 },
    });
    this.house(I.x - 42, I.z - 30, 28, 16, whOpts(1, 3));
    this.house(I.x + 38, I.z - 36, 16, 28, whOpts(0, 2));
    this.house(I.x + 4, I.z + 42, 30, 16, whOpts(1, 3));
    this.industrialProp(I.x + 65, I.z + 58, 3.5, 12, 'silo');
    // escritório de dois andares (sólido)
    this.block(I.x - 50, I.z + 38, 14, 10, 6.5, BoxKind.Building, 0xa9a39a, 4);
    // pilhas de contêineres
    for (let k = 0, tries = 0; k < 14 && tries < 300; tries++) {
      const a = rnd() * Math.PI * 2, r = 12 + rnd() * 78;
      const cx = I.x + Math.cos(a) * r, cz = I.z + Math.sin(a) * r;
      const alongX = rnd() < 0.5;
      const w = alongX ? 6.1 : 2.5, d = alongX ? 2.5 : 6.1;
      if (!this.areaFree(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 2)) continue;
      const g = this.heightAt(cx, cz);
      const col = CONTAINER_COLORS[Math.floor(rnd() * CONTAINER_COLORS.length)];
      this.addBox({ id: 0, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: g - 1, y1: g + 2.6, kind: BoxKind.Container, color: col });
      if (rnd() < 0.4) this.addBox({ id: 0, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: g + 2.6, y1: g + 5.2, kind: BoxKind.Container, color: CONTAINER_COLORS[Math.floor(rnd() * CONTAINER_COLORS.length)] });
      k++;
    }
    // tanques de combustível
    for (let k = 0; k < 3; k++) {
      const cx = I.x + 62, cz = I.z - 8 + k * 9;
      this.industrialProp(cx, cz, 2.5, 6, 'tank');
    }
    // caixotes e pallets
    for (let k = 0; k < 40; k++) {
      const a = rnd() * Math.PI * 2, r = 6 + rnd() * 85;
      const cx = I.x + Math.cos(a) * r, cz = I.z + Math.sin(a) * r;
      if (this.areaFree(cx - 0.8, cz - 0.8, cx + 0.8, cz + 0.8, 1)) this.block(cx, cz, 1.5, 1.5, 1.2 + (rnd() < 0.3 ? 1.2 : 0), BoxKind.Crate, 0x7a5c38, 1);
    }
    // Cobertura no lugar de mato: o pátio industrial tem poucas moitas, então há obstáculos para se proteger.
    // 1) fileiras de contêineres com corredores de 4 m entre eles
    for (let k = 0, tries = 0; k < 6 && tries < 60; tries++) {
      const a = rnd() * Math.PI * 2, r = 15 + rnd() * 62;
      const bx = I.x + Math.cos(a) * r, bz = I.z + Math.sin(a) * r;
      const alongX = rnd() < 0.5;
      let placed = 0;
      for (let j = 0; j < 4; j++) {
        const cx = alongX ? bx + j * 10.6 : bx, cz = alongX ? bz : bz + j * 10.6;
        const w = alongX ? 6.1 : 2.5, d = alongX ? 2.5 : 6.1;
        if (Math.hypot(cx - I.x, cz - I.z) > 88 || this.roadDist(cx, cz) < 7) continue;
        if (!this.areaFree(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 1.5)) continue;
        const g = this.heightAt(cx, cz);
        this.addBox({ id: 0, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: g - 1, y1: g + 2.6, kind: BoxKind.Container, color: CONTAINER_COLORS[Math.floor(rnd() * CONTAINER_COLORS.length)] });
        placed++;
      }
      if (placed >= 2) k++;
    }
    // 2) barreiras de concreto (cobertura na altura da cintura)
    for (let k = 0, tries = 0; k < 26 && tries < 500; tries++) {
      const a = rnd() * Math.PI * 2, r = 8 + rnd() * 82;
      const cx = I.x + Math.cos(a) * r, cz = I.z + Math.sin(a) * r;
      const alongX = rnd() < 0.5;
      const w = alongX ? 2.8 : 0.7, d = alongX ? 0.7 : 2.8;
      if (this.roadDist(cx, cz) < 6 || !this.areaFree(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 1.2)) continue;
      this.block(cx, cz, w, d, 1.05, BoxKind.Wall, 0x9a9a92, 1);
      k++;
    }
    // 3) muretas em L (dá para agachar atrás e espiar pelos cantos)
    for (let k = 0, tries = 0; k < 10 && tries < 200; tries++) {
      const a = rnd() * Math.PI * 2, r = 10 + rnd() * 78;
      const cx = I.x + Math.cos(a) * r, cz = I.z + Math.sin(a) * r;
      const sx = rnd() < 0.5 ? 1 : -1, sz = rnd() < 0.5 ? 1 : -1;
      if (this.roadDist(cx, cz) < 6 || !this.areaFree(cx - 3.6, cz - 3.6, cx + 3.6, cz + 3.6, 1)) continue;
      this.block(cx, cz, 5.5, 0.5, 1.2, BoxKind.Wall, 0x8f8a80, 1);
      this.block(cx + sx * 2.5, cz + sz * 2, 0.5, 4.5, 1.2, BoxKind.Wall, 0x8f8a80, 1);
      k++;
    }
    // 4) caminhões e empilhadeiras paradas
    for (let k = 0, tries = 0; k < 7 && tries < 200; tries++) {
      const a = rnd() * Math.PI * 2, r = 12 + rnd() * 74;
      const cx = I.x + Math.cos(a) * r, cz = I.z + Math.sin(a) * r;
      const alongX = rnd() < 0.5;
      const w = alongX ? 8 : 2.6, d = alongX ? 2.6 : 8;
      if (this.roadDist(cx, cz) < 7 || !this.areaFree(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 1.5)) continue;
      const g = this.heightAt(cx, cz);
      const col = CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)];
      this.addBox({ id: 0, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: g - 1, y1: g + 3.0, kind: BoxKind.Container, color: 0xc9c4b5 }); // carroceria
      const cabW = alongX ? 2.2 : 2.6, cabD = alongX ? 2.6 : 2.2;
      const cabX = alongX ? cx + w / 2 + cabW / 2 : cx, cabZ = alongX ? cz : cz + d / 2 + cabD / 2;
      if (this.areaFree(cabX - cabW / 2, cabZ - cabD / 2, cabX + cabW / 2, cabZ + cabD / 2, 0.3)) {
        this.addBox({ id: 0, x0: cabX - cabW / 2, x1: cabX + cabW / 2, z0: cabZ - cabD / 2, z1: cabZ + cabD / 2, y0: g - 1, y1: g + 2.4, kind: BoxKind.Crate, color: col });
      }
      k++;
    }
    // cerca alta com portões (não dá para pular)
    this.industrialProp(I.x - 70, I.z - 66, 2, 26, 'chimney');
    this.industrialProp(I.x - 62, I.z - 66, 2, 20, 'chimney');
    this.house(I.x + 12, I.z + 86, 6, 5, { wallH: 2.8, color: 0xb7b6a8, roofColor: 0x596268, doors: [{ side: 3, w: 1.4, h: 2.2 }], win: { w: 1.5, y0: 1, y1: 2.2, gap: 3 } });
    // Pórtico acima da passagem e doca com degraus que o controlador consegue subir.
    const pipeY = this.heightAt(I.x + 42, I.z + 20) + 5;
    this.addBox({ id: 0, x0: I.x + 25, x1: I.x + 66, z0: I.z + 20, z1: I.z + 20.5, y0: pipeY, y1: pipeY + .5, kind: BoxKind.Wall, color: 0x89938d });
    for (const dx of [25, 66]) if (this.areaFree(I.x + dx - .2, I.z + 19.8, I.x + dx + .2, I.z + 20.7, .3))
      this.block(I.x + dx, I.z + 20.25, .4, .9, 5, BoxKind.Wall, 0x70787a, 1);
    for (let k = 0; k < 5; k++) {
      const x = I.x - 7 + k * .65, z = I.z + 54;
      if (this.areaFree(x - .32, z - 2, x + .32, z + 2, .05)) this.block(x, z, .64, 4, (k + 1) * .22, BoxKind.Wall, 0x8f9189, 1);
    }
    for (const roof of this.boxes.filter(b => b.kind === BoxKind.Roof && Math.hypot((b.x0 + b.x1) / 2 - I.x, (b.z0 + b.z1) / 2 - I.z) < 75)) {
      for (let x = roof.x0; x < roof.x1; x += 4) this.roofs.push({ x0: x, x1: Math.min(x + 4, roof.x1), z0: roof.z0, z1: roof.z1, y: roof.y1, h: 1.4, color: 0x707b80, sawtooth: true });
    }
    const H = 96;
    for (const s of [-1, 1]) for (const half of [-1, 1]) {
      const a = half < 0 ? -H : 6, c = half < 0 ? -6 : H;
      for (const [x0, z0, x1, z1] of [[I.x + a, I.z + s * H - 0.15, I.x + c, I.z + s * H + 0.15], [I.x + s * H - 0.15, I.z + a, I.x + s * H + 0.15, I.z + c]]) {
        // pula o trecho onde a estrada atravessa
        const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 8);
        for (let q = 0; q < n; q++) {
          const sx0 = x0 + ((x1 - x0) * q) / n, sx1 = x0 + ((x1 - x0) * (q + 1)) / n;
          const sz0 = z0 + ((z1 - z0) * q) / n, sz1 = z0 + ((z1 - z0) * (q + 1)) / n;
          if (this.roadDist((sx0 + sx1) / 2, (sz0 + sz1) / 2) < 7) continue;
          this.solid(Math.min(sx0, sx1), Math.min(sz0, sz1), Math.max(sx0, sx1), Math.max(sz0, sz1), 2.4, BoxKind.Fence, 0x8d9296, 1);
        }
      }
    }
  }

  private buildFarm(F: Poi) {
    const rnd = this.rnd;
    this.paintCircle(F.x, F.z, 44, Surface.Dirt);
    // campos de cultivo ao redor
    const fields: [number, number, number, number][] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + rnd() * 0.3, r = 75 + rnd() * 35;
      const cx = F.x + Math.cos(a) * r, cz = F.z + Math.sin(a) * r;
      const w = 34 + rnd() * 26, d = 24 + rnd() * 18;
      const x0 = cx - w / 2, z0 = cz - d / 2, x1 = cx + w / 2, z1 = cz + d / 2;
      if (fields.some(([a0, b0, a1, b1]) => x0 < a1 + 8 && x1 > a0 - 8 && z0 < b1 + 8 && z1 > b0 - 8)) continue;
      if (this.roadDist(cx, cz) < Math.max(w, d) / 2 + 4) continue;
      fields.push([x0, z0, x1, z1]);
      this.paintRect(x0, z0, x1, z1, Surface.Field);
      // cerca baixa de madeira (dá para pular), com porteira
      const fence = (ax: number, az: number, bx: number, bz: number) => {
        const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 6);
        for (let q = 0; q < n; q++) {
          if (q === Math.floor(n / 2)) continue;
          const sx0 = ax + ((bx - ax) * q) / n, sx1 = ax + ((bx - ax) * (q + 1)) / n;
          const sz0 = az + ((bz - az) * q) / n, sz1 = az + ((bz - az) * (q + 1)) / n;
          this.solid(Math.min(sx0, sx1) - 0.08, Math.min(sz0, sz1) - 0.08, Math.max(sx0, sx1) + 0.08, Math.max(sz0, sz1) + 0.08, 0.95, BoxKind.Fence, 0x7a5a3a, 1);
        }
      };
      fence(x0, z0, x1, z0); fence(x0, z1, x1, z1); fence(x0, z0, x0, z1); fence(x1, z0, x1, z1);
      // fardos de feno no campo
      for (let q = 0; q < 4; q++) {
        const hx = x0 + 4 + rnd() * (w - 8), hz = z0 + 4 + rnd() * (d - 8);
        this.block(hx, hz, 1.5, 1.2, 1.2, BoxKind.Crate, 0xd4b65e, 1);
      }
    }
    const opts = this.homeOpts(2, rnd);
    this.house(F.x - 16, F.z - 12, 12, 10, opts);
    this.house(F.x + 18, F.z + 4, 20, 13, {
      wallH: 5.4, color: 0x9b3b2e, roofColor: 0x5a3a2e, pitched: true, floorColor: 0x6e5a40,
      doors: [{ side: 3, w: 4.5, h: 4.0 }, { side: 1, w: 2, h: 2.4 }], win: { w: 1.4, y0: 3.4, y1: 4.4, gap: 5 },
    });
    this.house(F.x - 20, F.z + 20, 8, 7, { ...this.homeOpts(0, rnd), wallH: 2.8 });
    this.block(F.x + 34, F.z - 20, 4.5, 4.5, 13, BoxKind.Building, 0xc8c8c0, 1);
    this.block(F.x + 40, F.z - 20, 4.5, 4.5, 11, BoxKind.Building, 0xb8b8b0, 1);
    for (let k = 0; k < 10; k++) {
      const a = rnd() * Math.PI * 2, r = 8 + rnd() * 32;
      const cx = F.x + Math.cos(a) * r, cz = F.z + Math.sin(a) * r;
      if (this.areaFree(cx - 0.8, cz - 0.7, cx + 0.8, cz + 0.7, 1)) this.block(cx, cz, 1.6, 1.3, 1.25, BoxKind.Crate, 0xd4b65e, 1);
    }
    this.car(F.x + 2, F.z - 26, true, rnd);
  }

  private buildOutpost(O: Poi) {
    const rnd = this.rnd;
    this.paintCircle(O.x, O.z, 82, Surface.Dirt);
    const bunker = (x: number, z: number, door: number) => this.house(x, z, 9, 7, {
      wallH: 2.75, color: 0x8c8c86, roofColor: 0x6f6f6a, kind: BoxKind.House, floorColor: 0x77776f,
      doors: [{ side: door, w: 1.3, h: 2.2 }], win: { w: 1.8, y0: 1.3, y1: 1.75, gap: 3 },
    });
    bunker(O.x - 22, O.z - 14, 1);
    bunker(O.x + 20, O.z - 18, 3);
    bunker(O.x + 2, O.z + 24, 0);
    // torre de vigia e antena
    this.block(O.x - 4, O.z - 4, 3.2, 3.2, 9, BoxKind.Building, 0x6e6253, 1);
    this.block(O.x + 6, O.z + 2, 0.5, 0.5, 24, BoxKind.Wall, 0x55595e, 1);
    // trincheiras de sacos de areia em zigue-zague
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2, r = 52 + (k % 2) * 6;
      const cx = O.x + Math.cos(a) * r, cz = O.z + Math.sin(a) * r;
      if (this.roadDist(cx, cz) < 6) continue;
      const tang = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
      const w = tang ? 0.9 : 6, d = tang ? 6 : 0.9;
      if (this.areaFree(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 0.5)) this.block(cx, cz, w, d, 1.2, BoxKind.Wall, 0xb3a07a, 1);
    }
    // barreiras de concreto
    for (let k = 0; k < 12; k++) {
      const a = rnd() * Math.PI * 2, r = 8 + rnd() * 40;
      const cx = O.x + Math.cos(a) * r, cz = O.z + Math.sin(a) * r;
      const alongX = rnd() < 0.5;
      const w = alongX ? 2.2 : 0.6, d = alongX ? 0.6 : 2.2;
      if (this.areaFree(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 0.8)) this.block(cx, cz, w, d, 1.05, BoxKind.Wall, 0x9a9a92, 1);
    }
  }

  private buildCountryside() {
    const rnd = this.rnd;
    const awayFromPois = (x: number, z: number, extra: number) =>
      this.pois.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + extra) && this.bases.every((b) => Math.hypot(b.x - x, b.z - z) > 85 + extra);
    // Instalações menores nos trechos planos, sem alterar o relevo nem o PRNG.
    for (const road of this.roads) {
      if (this.facilities.length >= 3) break;
      const dx = road.bx - road.ax, dz = road.bz - road.az, length = Math.hypot(dx, dz);
      for (const side of [-1, 1]) {
        if (this.facilities.length >= 3) break;
        const x = (road.ax + road.bx) / 2 - dz / length * 32 * side;
        const z = (road.az + road.bz) / 2 + dx / length * 32 * side;
        if (!awayFromPois(x, z, 30) || this.facilities.some(p => Math.hypot(p.x - x, p.z - z) < 180)) continue;
        if (this.roadDist(x, z) < 22 || !this.areaFree(x - 20, z - 16, x + 20, z + 16, 2)) continue;
        if (!this.house(x, z, 14, 10, { wallH: 4.5, color: 0x92968c, roofColor: 0x667278, pitched: true, doors: [{ side: 0, w: 4, h: 3.5 }, { side: 2, w: 4, h: 3.5 }] })) continue;
        this.facilities.push({ x, z });
        this.paintRect(x - 20, z - 16, x + 20, z + 16, Surface.Concrete);
        this.industrialProp(x + 13, z, 2.5, 10, 'silo');
        this.block(x - 13, z - 5, 6, 2.5, 2.6, BoxKind.Container, 0x496b73, 1);
        this.block(x - 13, z + 4, 6, 2.5, 2.6, BoxKind.Container, 0x91613f, 1);
      }
    }
    // casas à beira da estrada, porta virada para a estrada
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < 46; tries++) {
      const r = this.roads[Math.floor(rnd() * this.roads.length)];
      const t = rnd();
      const vx = r.bx - r.ax, vz = r.bz - r.az, L = Math.hypot(vx, vz);
      const side = rnd() < 0.5 ? -1 : 1;
      const off = 13 + rnd() * 8;
      const cx = r.ax + vx * t + (-vz / L) * off * side, cz = r.az + vz * t + (vx / L) * off * side;
      if (!awayFromPois(cx, cz, 15)) continue;
      // lado da casa que olha para a estrada
      const tx = -(-vz / L) * side, tz = -(vx / L) * side;
      const door = Math.abs(tx) > Math.abs(tz) ? (tx > 0 ? 1 : 3) : (tz > 0 ? 2 : 0);
      const w = 9 + rnd() * 4, d = 8 + rnd() * 3;
      if (this.house(cx, cz, w, d, this.homeOpts(door, rnd))) {
        placed++;
        // galpão ou muro no quintal
        if (rnd() < 0.5) {
          const sx = cx - tx * (d / 2 + 6), sz = cz - tz * (d / 2 + 6);
          if (this.areaFree(sx - 2.5, sz - 2, sx + 2.5, sz + 2, 1)) this.block(sx, sz, 5, 4, 2.6, BoxKind.Building, 0x8a7a66, 1);
        }
      }
    }
    // ruínas no campo
    for (let k = 0, tries = 0; k < 34 && tries < 1200; tries++) {
      const x = 80 + rnd() * (WORLD_SIZE - 160), z = 80 + rnd() * (WORLD_SIZE - 160);
      if (!awayFromPois(x, z, 10) || this.roadDist(x, z) < 12) continue;
      const lw = 4 + rnd() * 6, ld = 3 + rnd() * 5;
      if (!this.areaFree(x - lw / 2, z - ld / 2, x + lw / 2, z + ld / 2, 2)) continue;
      this.solid(x - lw / 2, z - 0.3, x + lw / 2, z + 0.3, 1.4 + rnd() * 1.6, BoxKind.Wall, 0x8f8a80, 1);
      this.solid(x - lw / 2, z, x - lw / 2 + 0.6, z + ld, 1.2 + rnd() * 1.4, BoxKind.Wall, 0x8f8a80, 1);
      this.ruinRemains(x, z, lw, ld);
      k++;
    }
  }

  private forests: { x: number; z: number; r: number }[] = [];

  private ruinRemains(x: number, z: number, w: number, d: number) {
    this.block(x + w / 2, z + d * .25, .5, d * .5, .85, BoxKind.Wall, 0x817b70, 1);
    this.block(x + w * .2, z + d, w * .6, .5, .6, BoxKind.Wall, 0x817b70, 1);
    for (let k = 0; k < 6; k++) {
      const px = x - w * .35 + k * w * .13, pz = z + d * (.3 + (k % 3) * .18);
      this.block(px, pz, .65 + (k % 2) * .35, .6, .25 + (k % 3) * .15, BoxKind.Crate, 0x999183, .4);
    }
  }

  private industrialProp(x: number, z: number, r: number, h: number, kind: 'tank' | 'silo' | 'chimney') {
    if (!this.areaFree(x - r, z - r, x + r, z + r, .8)) return;
    const y = this.heightAt(x, z);
    this.addBox({ id: 0, x0: x - r, x1: x + r, z0: z - r, z1: z + r, y0: y - 1, y1: y + h, kind: BoxKind.Industrial, color: 0xb3b9b7 });
    this.industrialProps.push({ x, y, z, r, h, kind });
  }

  private buildForests() {
    const rnd = this.rnd;
    for (let tries = 0; tries < 400 && this.forests.length < 10; tries++) {
      const x = 110 + rnd() * (WORLD_SIZE - 220), z = 110 + rnd() * (WORLD_SIZE - 220);
      const r = 55 + rnd() * 50;
      if (this.roadDist(x, z) < r * 0.6) continue;
      if (!this.pois.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r * 0.7)) continue;
      if (!this.bases.every((b) => Math.hypot(b.x - x, b.z - z) > 80 + r)) continue;
      if (this.forests.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + r)) continue;
      this.forests.push({ x, z, r });
      this.paintCircle(x, z, r, Surface.Forest);
      const n = Math.round(r * r * 0.03);
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
        this.tree(x + Math.cos(a) * d, z + Math.sin(a) * d, rnd);
      }
    }
    // árvores esparsas
    for (let k = 0, tries = 0; k < 260 && tries < 3000; tries++) {
      const x = 20 + rnd() * (WORLD_SIZE - 40), z = 20 + rnd() * (WORLD_SIZE - 40);
      if (!this.pois.every((p) => Math.hypot(p.x - x, p.z - z) > p.r * 0.8)) continue;
      if (this.tree(x, z, rnd)) k++;
    }
  }

  private tree(x: number, z: number, rnd: () => number): boolean {
    if (x < 8 || z < 8 || x > WORLD_SIZE - 8 || z > WORLD_SIZE - 8) return false;
    if (this.roadDist(x, z) < 5.5) return false;
    if (this.bases.some((b) => Math.hypot(b.x - x, b.z - z) < 62)) return false;
    if (!this.areaFree(x - 0.4, z - 0.4, x + 0.4, z + 0.4, 1.5)) return false;
    const y = this.heightAt(x, z);
    const h = 6 + rnd() * 5, sc = 0.8 + rnd() * 0.6;
    this.trees.push({ x, y, z, h, s: sc });
    this.addBox({ id: 0, x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: y - 1, y1: y + h * 0.6, kind: BoxKind.Tree, color: 0x5b4632 });
    return true;
  }

  private buildRocks() {
    const rnd = this.rnd;
    for (let k = 0, tries = 0; k < 150 && tries < 3000; tries++) {
      let x: number, z: number;
      if (rnd() < 0.5 && this.forests.length) {
        const f = this.forests[Math.floor(rnd() * this.forests.length)];
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * f.r;
        x = f.x + Math.cos(a) * d; z = f.z + Math.sin(a) * d;
      } else { x = 40 + rnd() * (WORLD_SIZE - 80); z = 40 + rnd() * (WORLD_SIZE - 80); }
      if (this.roadDist(x, z) < 6) continue;
      if (!this.pois.every((p) => Math.hypot(p.x - x, p.z - z) > p.r * 0.7)) continue;
      if (this.bases.some((b) => Math.hypot(b.x - x, b.z - z) < 70)) continue;
      const s = 0.9 + rnd() * 1.8;
      if (!this.areaFree(x - s * 0.7, z - s * 0.7, x + s * 0.7, z + s * 0.7, 1)) continue;
      const y = this.heightAt(x, z);
      this.rocks.push({ x, y, z, s, rot: rnd() * 6.28 });
      this.addBox({ id: 0, x0: x - s * 0.7, x1: x + s * 0.7, z0: z - s * 0.7, z1: z + s * 0.7, y0: y - 1, y1: y + s * 0.8, kind: BoxKind.Rock, color: 0x8a8a84 });
      k++;
    }
  }

  private buildBushes() {
    const rnd = this.rnd;
    const tryBush = (x: number, z: number) => {
      if (x < 6 || z < 6 || x > WORLD_SIZE - 6 || z > WORLD_SIZE - 6) return;
      if (this.roadDist(x, z) < 4.2) return;
      if (this.streets.some(s => x > s.x0 - 3 && x < s.x1 + 3 && z > s.z0 - 3 && z < s.z1 + 3)) return;
      if (this.facilities.some(p => Math.abs(x - p.x) < 22 && Math.abs(z - p.z) < 18)) return;
      if (this.bases.some((b) => Math.hypot(b.x - x, b.z - z) < 50)) return;
      // área industrial: só algumas moitas (a cobertura vem de contêineres, barreiras e muretas)
      const ind = this.pois[1];
      if (Math.hypot(x - ind.x, z - ind.z) < ind.r + 15 && rnd() > 0.06) return;
      // Porte de arbusto também na borda da floresta, sem ampliar o raio.
      const r = BUSH_RADIUS_MIN + rnd() * (BUSH_RADIUS_MAX - BUSH_RADIUS_MIN);
      if (!this.areaFree(x - r * 0.7, z - r * 0.7, x + r * 0.7, z + r * 0.7, 0.2)) return;
      const y = this.heightAt(x, z);
      this.addBush({ x, y, z, r, h: BUSH_HEIGHT_MIN + rnd() * (BUSH_HEIGHT_MAX - BUSH_HEIGHT_MIN) });
    };
    // cercas vivas ao longo das estradas
    for (const r of this.roads) {
      const vx = r.bx - r.ax, vz = r.bz - r.az, L = Math.hypot(vx, vz);
      const nx = -vz / L, nz = vx / L;
      for (let t = 0; t < L; t += 3.6) {
        for (const s of [-1, 1]) {
          if (rnd() < 0.45) continue;
          const off = 6 + rnd() * 3;
          tryBush(r.ax + (vx / L) * t + nx * off * s, r.az + (vz / L) * t + nz * off * s);
        }
      }
    }
    // borda das florestas
    for (const f of this.forests) {
      const n = Math.round(f.r * 1.4);
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, d = f.r + (rnd() - 0.3) * 14;
        tryBush(f.x + Math.cos(a) * d, f.z + Math.sin(a) * d);
      }
      for (let k = 0; k < f.r * 0.5; k++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * f.r;
        tryBush(f.x + Math.cos(a) * d, f.z + Math.sin(a) * d);
      }
    }
    // em volta das casas
    for (const h of this.houses) {
      for (let k = 0; k < 3; k++) {
        const a = rnd() * Math.PI * 2, d = 8 + rnd() * 6;
        tryBush(h.x + Math.cos(a) * d, h.z + Math.sin(a) * d);
      }
    }
    // dentro das áreas das zonas (cobertura extra)
    for (const p of this.pois) {
      for (let k = 0; k < p.r * 1.6; k++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (p.r + 30);
        tryBush(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d);
      }
    }
    // espalhadas pelo campo
    for (let k = 0; k < 900; k++) tryBush(20 + rnd() * (WORLD_SIZE - 40), 20 + rnd() * (WORLD_SIZE - 40));
  }

  // =====================================================================
  // consultas
  // =====================================================================
  heightAt(x: number, z: number): number {
    let fx = x / CELL, fz = z / CELL;
    if (fx < 0) fx = 0; else if (fx > GRID_N - 0.0001) fx = GRID_N - 0.0001;
    if (fz < 0) fz = 0; else if (fz > GRID_N - 0.0001) fz = GRID_N - 0.0001;
    const i = fx | 0, j = fz | 0;
    const tx = fx - i, tz = fz - j;
    const h = this.heights;
    const a = h[j * N1 + i], b = h[j * N1 + i + 1], c = h[(j + 1) * N1 + i], d = h[(j + 1) * N1 + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  surfaceAt(x: number, z: number): number {
    const i = Math.max(0, Math.min(GRID_N, Math.round(x / CELL)));
    const j = Math.max(0, Math.min(GRID_N, Math.round(z / CELL)));
    return this.surface[j * N1 + i];
  }

  /** Ponto coberto por construção/rocha/árvore (para não nascer grama ou moita dentro). */
  blockedAt(x: number, z: number): boolean {
    const arr = this.cellBoxes(Math.floor(x / BCELL), Math.floor(z / BCELL));
    if (!arr) return false;
    for (const b of arr) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
    return false;
  }

  get gridN() { return GRID_N; }
  get cellSize() { return CELL; }

  addBox(b: Box): Box {
    if (!b.id) b.id = this.nextBoxId++;
    else if (b.id >= this.nextBoxId) this.nextBoxId = b.id + 1;
    this.boxes.push(b);
    const i0 = Math.max(0, Math.floor(b.x0 / BCELL)), i1 = Math.min(BGRID - 1, Math.floor(b.x1 / BCELL));
    const j0 = Math.max(0, Math.floor(b.z0 / BCELL)), j1 = Math.min(BGRID - 1, Math.floor(b.z1 / BCELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const key = j * BGRID + i;
      let arr = this.grid.get(key);
      if (!arr) this.grid.set(key, (arr = []));
      arr.push(b);
    }
    return b;
  }

  removeBox(id: number): boolean {
    const idx = this.boxes.findIndex((b) => b.id === id);
    if (idx < 0) return false;
    const b = this.boxes[idx];
    this.boxes.splice(idx, 1);
    const i0 = Math.max(0, Math.floor(b.x0 / BCELL)), i1 = Math.min(BGRID - 1, Math.floor(b.x1 / BCELL));
    const j0 = Math.max(0, Math.floor(b.z0 / BCELL)), j1 = Math.min(BGRID - 1, Math.floor(b.z1 / BCELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const arr = this.grid.get(j * BGRID + i);
      if (arr) { const k = arr.indexOf(b); if (k >= 0) arr.splice(k, 1); }
    }
    return true;
  }

  /** Área livre para construir (FOB, sacos de areia) — sem caixas nem estrada. */
  canBuild(x0: number, z0: number, x1: number, z1: number): boolean {
    return this.areaFree(x0, z0, x1, z1, 0.3);
  }

  private cellBoxes(i: number, j: number): Box[] | undefined {
    if (i < 0 || j < 0 || i >= BGRID || j >= BGRID) return undefined;
    return this.grid.get(j * BGRID + i);
  }

  private addBush(b: Bush) {
    this.bushes.push(b);
    const i0 = Math.max(0, Math.floor((b.x - b.r) / BCELL)), i1 = Math.min(BGRID - 1, Math.floor((b.x + b.r) / BCELL));
    const j0 = Math.max(0, Math.floor((b.z - b.r) / BCELL)), j1 = Math.min(BGRID - 1, Math.floor((b.z + b.r) / BCELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const key = j * BGRID + i;
      let arr = this.bushGrid.get(key);
      if (!arr) this.bushGrid.set(key, (arr = []));
      arr.push(b);
    }
  }

  /**
   * A moita em que o ponto está DENTRO (dá para entrar nela), se houver.
   * Quem está dentro fica camuflado: ver `Bots.canSpot` para o alcance de detecção.
   */
  inBush(x: number, z: number): Bush | null {
    const arr = this.bushGrid.get(Math.floor(z / BCELL) * BGRID + Math.floor(x / BCELL));
    if (!arr) return null;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      const ex = x - b.x, ez = z - b.z, r = b.r * 0.85;
      if (ex * ex + ez * ez < r * r) return b;
    }
    return null;
  }

  /** Há uma moita ENTRE os dois pontos (que não seja aquela em que um deles está)? De perto (< 6 m) a folhagem não esconde. */
  bushBlocks(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 6) return false;
    for (let t = 2.5; t <= d - 1; t += 1.2) {
      const k = t / d;
      const x = ax + dx * k, y = ay + dy * k, z = az + dz * k;
      const arr = this.bushGrid.get(Math.floor(z / BCELL) * BGRID + Math.floor(x / BCELL));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (y < b.y - 0.3 || y > b.y + b.h) continue;
        const ex = x - b.x, ez = z - b.z;
        if (ex * ex + ez * ez >= b.r * b.r) continue;
        // moita em que o observador ou o alvo está: não bloqueia (a camuflagem dela é tratada à parte)
        if ((ax - b.x) ** 2 + (az - b.z) ** 2 < b.r * b.r || (bx - b.x) ** 2 + (bz - b.z) ** 2 < b.r * b.r) continue;
        return true;
      }
    }
    return false;
  }

  /** Um soldado enxerga o outro? Considera terreno, construções e moitas. */
  canSee(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    return this.hasLineOfSight(ax, ay, az, bx, by, bz) && !this.bushBlocks(ax, ay, az, bx, by, bz);
  }

  /** Altura do chão sob o jogador: terreno ou topo de caixa em que dá para subir. */
  groundAt(x: number, z: number, feetY: number, r: number): number {
    let g = this.heightAt(x, z);
    const rr = r * 0.6;
    const i0 = Math.floor((x - rr) / BCELL), i1 = Math.floor((x + rr) / BCELL);
    const j0 = Math.floor((z - rr) / BCELL), j1 = Math.floor((z + rr) / BCELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const arr = this.cellBoxes(i, j);
      if (!arr) continue;
      for (let k = 0; k < arr.length; k++) {
        const b = arr[k];
        if (x > b.x0 - rr && x < b.x1 + rr && z > b.z0 - rr && z < b.z1 + rr && b.y1 <= feetY + STEP_HEIGHT && b.y1 > g) g = b.y1;
      }
    }
    return g;
  }

  /** Empurra o círculo (x,z,r) para fora das caixas que bloqueiam entre feetY e feetY+height. */
  collide(pos: { x: number; z: number }, feetY: number, height: number, r: number): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      const x = pos.x, z = pos.z;
      const i0 = Math.floor((x - r) / BCELL), i1 = Math.floor((x + r) / BCELL);
      const j0 = Math.floor((z - r) / BCELL), j1 = Math.floor((z + r) / BCELL);
      let any = false;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const arr = this.cellBoxes(i, j);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const b = arr[k];
          if (feetY + STEP_HEIGHT >= b.y1 || feetY + height <= b.y0) continue;
          const cx = pos.x < b.x0 ? b.x0 : pos.x > b.x1 ? b.x1 : pos.x;
          const cz = pos.z < b.z0 ? b.z0 : pos.z > b.z1 ? b.z1 : pos.z;
          const dx = pos.x - cx, dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          any = true;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            const push = (r - d) / d;
            pos.x += dx * push;
            pos.z += dz * push;
          } else {
            const l = pos.x - b.x0, rr2 = b.x1 - pos.x, n = pos.z - b.z0, f = b.z1 - pos.z;
            const m = Math.min(l, rr2, n, f);
            if (m === l) pos.x = b.x0 - r;
            else if (m === rr2) pos.x = b.x1 + r;
            else if (m === n) pos.z = b.z0 - r;
            else pos.z = b.z1 + r;
          }
        }
      }
      if (!any) break;
      hit = true;
    }
    return hit;
  }

  /** Distância até o primeiro obstáculo (terreno ou caixa) ao longo do raio; maxDist se livre. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number {
    let best = maxDist;
    {
      let t = 0, prev = 0;
      while (t < best) {
        const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
        if (px < 0 || pz < 0 || px > WORLD_SIZE || pz > WORLD_SIZE) { best = Math.min(best, t); break; }
        const h = this.heightAt(px, pz);
        if (py < h) {
          let a = prev, b = t;
          for (let i = 0; i < 6; i++) {
            const m = (a + b) * 0.5;
            if (oy + dy * m < this.heightAt(ox + dx * m, oz + dz * m)) b = m; else a = m;
          }
          best = Math.min(best, b);
          break;
        }
        prev = t;
        const clear = (py - h) * 0.5;
        t += clear < 1 ? 1 : clear > 8 ? 8 : clear;
      }
    }
    {
      let ci = Math.floor(ox / BCELL), cj = Math.floor(oz / BCELL);
      const si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
      const adx = Math.abs(dx), adz = Math.abs(dz);
      const tdx = adx > 1e-9 ? BCELL / adx : Infinity, tdz = adz > 1e-9 ? BCELL / adz : Infinity;
      let tmx = adx > 1e-9 ? ((dx > 0 ? (ci + 1) * BCELL - ox : ox - ci * BCELL) / adx) : Infinity;
      let tmz = adz > 1e-9 ? ((dz > 0 ? (cj + 1) * BCELL - oz : oz - cj * BCELL) / adz) : Infinity;
      let tEnter = 0;
      const ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12);
      for (let steps = 0; steps < 256 && tEnter < best; steps++) {
        const arr = this.cellBoxes(ci, cj);
        if (arr) {
          for (let k = 0; k < arr.length; k++) {
            const b = arr[k];
            let t0 = (b.x0 - ox) * ix, t1 = (b.x1 - ox) * ix;
            if (t0 > t1) { const q = t0; t0 = t1; t1 = q; }
            let u0 = (b.y0 - oy) * iy, u1 = (b.y1 - oy) * iy;
            if (u0 > u1) { const q = u0; u0 = u1; u1 = q; }
            if (u0 > t0) t0 = u0;
            if (u1 < t1) t1 = u1;
            let w0 = (b.z0 - oz) * iz, w1 = (b.z1 - oz) * iz;
            if (w0 > w1) { const q = w0; w0 = w1; w1 = q; }
            if (w0 > t0) t0 = w0;
            if (w1 < t1) t1 = w1;
            if (t1 >= t0 && t1 >= 0) {
              const th = t0 < 0 ? 0 : t0;
              if (th < best) best = th;
            }
          }
        }
        if (tmx < tmz) { tEnter = tmx; tmx += tdx; ci += si; } else { tEnter = tmz; tmz += tdz; cj += sj; }
        if (ci < 0 || cj < 0 || ci >= BGRID || cj >= BGRID) break;
      }
    }
    return best;
  }

  /** Linha de visão livre entre dois pontos? */
  hasLineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.01) return true;
    return this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d) >= d - 0.3;
  }
}

function s1(rnd: () => number) { return rnd() < 0.5 ? -1 : 1; }
