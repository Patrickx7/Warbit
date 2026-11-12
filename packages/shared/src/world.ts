import { WORLD_SIZE, STEP_HEIGHT, TEAM_COLORS } from './config';
import { hash2, mulberry32 } from './rng';

export const BoxKind = { Building: 0, Crate: 1, Wall: 2, Tree: 3, Sandbag: 4, Base: 5 } as const;
export type BoxKind = number;

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

const GRID_N = 256;
const CELL = WORLD_SIZE / GRID_N;
const BCELL = 20; // célula da grade espacial de caixas
const BGRID = Math.ceil(WORLD_SIZE / BCELL);

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

const BUILDING_COLORS = [0xc9b79c, 0xb8a58a, 0xa9a39a, 0xd4c5a8, 0x9c9488, 0xbfae98];
const CRATE_COLORS = [0x8b6b43, 0x7a5c38, 0x5f6b4a];

/** Mapa determinístico: mesmo seed gera o mesmo terreno e as mesmas construções em qualquer máquina. */
export class World {
  readonly seed: number;
  readonly heights = new Float32Array((GRID_N + 1) * (GRID_N + 1));
  readonly boxes: Box[] = [];
  readonly trees: Tree[] = [];
  readonly bases: Point2[] = [];
  readonly czCandidates: Point2[] = [];
  readonly villages: Point2[] = [];
  readonly bushes: Bush[] = [];
  private bushGrid = new Map<number, Bush[]>();
  private grid = new Map<number, Box[]>();
  private nextBoxId = 1;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.generate();
  }

  // ---------- geração ----------
  private generate() {
    const rnd = mulberry32(this.seed);
    const s = this.seed;
    const N1 = GRID_N + 1;
    for (let j = 0; j <= GRID_N; j++) {
      for (let i = 0; i <= GRID_N; i++) {
        const x = i * CELL, z = j * CELL;
        let h = valueNoise(x / 380, z / 380, s) * 34;
        h += valueNoise(x / 120, z / 120, s + 11) * 9;
        h += valueNoise(x / 34, z / 34, s + 23) * 1.6;
        // borda do mapa sobe um pouco (bacia)
        const ex = Math.min(x, WORLD_SIZE - x, z, WORLD_SIZE - z);
        if (ex < 60) h += (1 - ex / 60) * 14;
        this.heights[j * N1 + i] = h;
      }
    }

    const C = WORLD_SIZE / 2;
    // 3 bases em triângulo
    for (let t = 0; t < 3; t++) {
      const a = (t * 2 * Math.PI) / 3 + Math.PI / 6;
      this.bases.push({ x: C + Math.cos(a) * 580, z: C + Math.sin(a) * 580 });
    }
    // locais possíveis para a Control Zone
    this.czCandidates.push({ x: C, z: C });
    for (let k = 0; k < 4; k++) {
      const a = rnd() * Math.PI * 2;
      const r = 90 + rnd() * 110;
      this.czCandidates.push({ x: C + Math.cos(a) * r, z: C + Math.sin(a) * r });
    }

    // vilas: uma por candidato de CZ + espalhadas
    const villages: Point2[] = this.czCandidates.map((p) => ({ x: p.x, z: p.z }));
    let guard = 0;
    while (villages.length < 34 && guard++ < 1500) {
      const p = { x: 120 + rnd() * (WORLD_SIZE - 240), z: 120 + rnd() * (WORLD_SIZE - 240) };
      let ok = true;
      for (const v of villages) if (Math.hypot(v.x - p.x, v.z - p.z) < 100) ok = false;
      for (const b of this.bases) if (Math.hypot(b.x - p.x, b.z - p.z) < 160) ok = false;
      if (ok) villages.push(p);
    }
    this.villages.push(...villages);

    // achatar o terreno em bases e vilas
    const flats: { x: number; z: number; r: number; h: number }[] = [];
    for (const b of this.bases) flats.push({ x: b.x, z: b.z, r: 70, h: this.rawHeight(b.x, b.z) });
    for (const v of villages) flats.push({ x: v.x, z: v.z, r: 58, h: this.rawHeight(v.x, v.z) });
    for (const f of flats) {
      const R = f.r * 1.7;
      const i0 = Math.max(0, Math.floor((f.x - R) / CELL)), i1 = Math.min(GRID_N, Math.ceil((f.x + R) / CELL));
      const j0 = Math.max(0, Math.floor((f.z - R) / CELL)), j1 = Math.min(GRID_N, Math.ceil((f.z + R) / CELL));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(i * CELL - f.x, j * CELL - f.z);
          if (d >= R) continue;
          const w = d <= f.r ? 1 : smooth(1 - (d - f.r) / (R - f.r));
          const idx = j * N1 + i;
          this.heights[idx] = this.heights[idx] + (f.h - this.heights[idx]) * w;
        }
      }
    }

    // construções das vilas
    for (const v of villages) {
      const gy = this.heightAt(v.x, v.z);
      const placed: Box[] = [];
      const nb = 10 + Math.floor(rnd() * 8);
      for (let k = 0, tries = 0; k < nb && tries < 160; tries++) {
        const w = 6 + rnd() * 9, d = 6 + rnd() * 9, h = 3.2 + Math.floor(rnd() * 3) * 2.8;
        const a = rnd() * Math.PI * 2, r = 8 + rnd() * 42;
        const cx = v.x + Math.cos(a) * r, cz = v.z + Math.sin(a) * r;
        const b: Box = {
          id: 0, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: gy - 4, y1: gy + h,
          kind: BoxKind.Building, color: BUILDING_COLORS[Math.floor(rnd() * BUILDING_COLORS.length)],
        };
        if (placed.some((o) => b.x0 < o.x1 + 2.4 && b.x1 > o.x0 - 2.4 && b.z0 < o.z1 + 2.4 && b.z1 > o.z0 - 2.4)) continue;
        placed.push(b);
        this.addBox(b);
        k++;
      }
      // cobertura: caixotes e muretas
      const nc = 18 + Math.floor(rnd() * 10);
      for (let k = 0, tries = 0; k < nc && tries < 140; tries++) {
        const a = rnd() * Math.PI * 2, r = 4 + rnd() * 54;
        const cx = v.x + Math.cos(a) * r, cz = v.z + Math.sin(a) * r;
        const wall = rnd() < 0.45;
        let w: number, d: number, h: number;
        if (wall) {
          const long = 3 + rnd() * 5;
          if (rnd() < 0.5) { w = long; d = 0.5; } else { w = 0.5; d = long; }
          h = 1.15;
        } else {
          w = 1.1 + rnd() * 0.9; d = 1.1 + rnd() * 0.9; h = 1 + rnd() * 0.5;
        }
        const b: Box = {
          id: 0, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: gy - 2, y1: gy + h,
          kind: wall ? BoxKind.Wall : BoxKind.Crate,
          color: wall ? 0x8f8a80 : CRATE_COLORS[Math.floor(rnd() * CRATE_COLORS.length)],
        };
        if (placed.some((o) => b.x0 < o.x1 + 1.4 && b.x1 > o.x0 - 1.4 && b.z0 < o.z1 + 1.4 && b.z1 > o.z0 - 1.4)) continue;
        placed.push(b);
        this.addBox(b);
        k++;
      }
    }

    // estruturas das bases (cor do time)
    this.bases.forEach((b, team) => {
      const gy = this.heightAt(b.x, b.z);
      const col = TEAM_COLORS[team];
      const mk = (dx: number, dz: number, w: number, d: number, h: number, color: number) =>
        this.addBox({ id: 0, x0: b.x + dx - w / 2, x1: b.x + dx + w / 2, z0: b.z + dz - d / 2, z1: b.z + dz + d / 2, y0: gy - 4, y1: gy + h, kind: BoxKind.Base, color });
      mk(0, -22, 16, 9, 5, 0x6b7280);
      mk(0, -22, 17, 10, 0.4 + 5, col); // faixa do telhado
      mk(-24, 0, 1, 26, 2.2, col);
      mk(24, 0, 1, 26, 2.2, col);
      mk(-12, 20, 3, 3, 1.4, 0x7a5c38);
      mk(12, 20, 3, 3, 1.4, 0x7a5c38);
    });

    // casas isoladas, galpões e ruínas espalhados pelo campo
    for (let k = 0, tries = 0; k < 90 && tries < 2500; tries++) {
      const x = 60 + rnd() * (WORLD_SIZE - 120), z = 60 + rnd() * (WORLD_SIZE - 120);
      let ok = true;
      for (const f of flats) if (Math.hypot(f.x - x, f.z - z) < f.r + 14) { ok = false; break; }
      if (!ok) continue;
      const ruin = rnd() < 0.35;
      const w = ruin ? 4 + rnd() * 6 : 6 + rnd() * 7, d = ruin ? 0.6 : 5 + rnd() * 6, h = ruin ? 1.3 + rnd() * 1.4 : 3.2 + Math.floor(rnd() * 2) * 2.8;
      const swap = rnd() < 0.5;
      const hw = (swap ? d : w) / 2, hd = (swap ? w : d) / 2;
      const hs = [this.heightAt(x - hw, z - hd), this.heightAt(x + hw, z - hd), this.heightAt(x - hw, z + hd), this.heightAt(x + hw, z + hd)];
      const lo = Math.min(...hs), hi = Math.max(...hs);
      if (hi - lo > 2.2) continue; // terreno muito inclinado
      this.addBox({ id: 0, x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, y0: lo - 3, y1: hi + h, kind: ruin ? BoxKind.Wall : BoxKind.Building, color: ruin ? 0x8f8a80 : BUILDING_COLORS[Math.floor(rnd() * BUILDING_COLORS.length)] });
      k++;
    }

    // moitas: escondem o jogador (bloqueiam a visão dos bots), mas não param bala nem movimento
    const pt = { x: 0, z: 0 };
    for (let k = 0, tries = 0; k < 2200 && tries < 12000; tries++) {
      let x: number, z: number;
      if (rnd() < 0.45) {
        // em volta e dentro das vilas
        const v = villages[Math.floor(rnd() * villages.length)];
        const a = rnd() * Math.PI * 2, r = 6 + rnd() * 85;
        x = v.x + Math.cos(a) * r; z = v.z + Math.sin(a) * r;
      } else { x = 20 + rnd() * (WORLD_SIZE - 40); z = 20 + rnd() * (WORLD_SIZE - 40); }
      if (x < 10 || z < 10 || x > WORLD_SIZE - 10 || z > WORLD_SIZE - 10) continue;
      let ok = true;
      for (const b of this.bases) if (Math.hypot(b.x - x, b.z - z) < 32) { ok = false; break; }
      if (!ok) continue;
      const y = this.heightAt(x, z);
      pt.x = x; pt.z = z;
      if (this.collide(pt, y, 1.5, 1.0)) continue; // não nasce dentro de parede
      const r = 1.1 + rnd() * 0.9;
      this.addBush({ x, y, z, r, h: 1.25 + rnd() * 0.75 });
      k++;
    }

    // árvores
    for (let k = 0, tries = 0; k < 950 && tries < 6000; tries++) {
      const x = 20 + rnd() * (WORLD_SIZE - 40), z = 20 + rnd() * (WORLD_SIZE - 40);
      let ok = true;
      for (const f of flats) if (Math.hypot(f.x - x, f.z - z) < f.r + 4) { ok = false; break; }
      if (!ok) continue;
      // bosques: mais densidade onde o ruído é alto
      if (valueNoise(x / 90, z / 90, s + 77) < 0.42 && rnd() < 0.8) continue;
      const y = this.heightAt(x, z);
      const h = 5 + rnd() * 4, sc = 0.8 + rnd() * 0.6;
      this.trees.push({ x, y, z, h, s: sc });
      this.addBox({ id: 0, x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: y - 1, y1: y + h * 0.6, kind: BoxKind.Tree, color: 0x5b4632 });
      k++;
    }
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

  /** Há uma moita entre os dois pontos? De muito perto (< 6 m) a moita não esconde. */
  bushBlocks(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 6) return false;
    for (let t = 2.5; t <= d; t += 1.2) {
      const k = t / d;
      const x = ax + dx * k, y = ay + dy * k, z = az + dz * k;
      const arr = this.bushGrid.get(Math.floor(z / BCELL) * BGRID + Math.floor(x / BCELL));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (y < b.y - 0.3 || y > b.y + b.h) continue;
        const ex = x - b.x, ez = z - b.z;
        if (ex * ex + ez * ez < b.r * b.r) return true;
      }
    }
    return false;
  }

  /** Um soldado enxerga o outro? Considera terreno, construções e moitas. */
  canSee(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    return this.hasLineOfSight(ax, ay, az, bx, by, bz) && !this.bushBlocks(ax, ay, az, bx, by, bz);
  }

  private rawHeight(x: number, z: number): number {
    return this.heightAt(x, z);
  }

  // ---------- consultas ----------
  heightAt(x: number, z: number): number {
    let fx = x / CELL, fz = z / CELL;
    if (fx < 0) fx = 0; else if (fx > GRID_N - 0.0001) fx = GRID_N - 0.0001;
    if (fz < 0) fz = 0; else if (fz > GRID_N - 0.0001) fz = GRID_N - 0.0001;
    const i = fx | 0, j = fz | 0;
    const tx = fx - i, tz = fz - j;
    const N1 = GRID_N + 1;
    const h = this.heights;
    const a = h[j * N1 + i], b = h[j * N1 + i + 1], c = h[(j + 1) * N1 + i], d = h[(j + 1) * N1 + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
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

  private cellBoxes(i: number, j: number): Box[] | undefined {
    if (i < 0 || j < 0 || i >= BGRID || j >= BGRID) return undefined;
    return this.grid.get(j * BGRID + i);
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
    for (let iter = 0; iter < 2; iter++) {
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
            // centro dentro da caixa: sair pela face mais próxima
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
    // terreno: marcha adaptativa + bisseção
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
    // caixas: DDA na grade XZ
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
