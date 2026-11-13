import * as THREE from 'three';
import { BoxKind, Surface, TEAM_COLORS, WORLD_SIZE, type Box, type World, type Zone } from '@warbit/shared';
import { Grass } from './grass';
import { buildRoads } from './roads';
import { buildIndustry } from './industry';

const SKY = 0xa9c9e8;

const SURFACE_COLORS: Record<number, number[]> = {
  [Surface.Grass]: [0x6e9a48, 0x86ab52],
  [Surface.Road]: [0x8b8578, 0x7d786c],
  [Surface.Field]: [0xb9a24c, 0xa89440],
  [Surface.Dirt]: [0xa8946c, 0x9a875f],
  [Surface.Forest]: [0x4d7a3a, 0x436b33],
  [Surface.Concrete]: [0x9d9d97, 0x8f8f89],
};

/** Cena low-poly: terreno, construções mescladas, árvores/rochas instanciadas, zonas. */
export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 1400);
  readonly grass: Grass;
  private czMesh: THREE.Mesh;
  private hzMesh: THREE.Mesh;
  private hzBeam: THREE.Mesh;
  private builds = new Map<number, THREE.Mesh>();
  private matCache = new Map<number, THREE.MeshLambertMaterial>();
  quality = 1;

  constructor(canvas: HTMLCanvasElement, readonly world: World) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 180, 950);
    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x6f6a50, 1.25));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
    sun.position.set(0.55, 1, 0.35);
    this.scene.add(sun);
    this.scene.add(this.camera);

    this.buildTerrain();
    this.scene.add(buildRoads(world));
    this.scene.add(buildIndustry(world));
    this.buildBoxes();
    this.buildRoofs();
    this.buildTrees();
    this.buildRocks();
    this.buildBushes();
    this.grass = new Grass(world, 1);
    this.scene.add(this.grass.mesh);

    const czMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, fog: false });
    this.czMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true), czMat);
    const hzMat = new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, fog: false });
    this.hzMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), hzMat);
    this.hzBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
    this.czMesh.renderOrder = 2; this.hzMesh.renderOrder = 3; this.hzBeam.renderOrder = 3;
    this.scene.add(this.czMesh, this.hzMesh, this.hzBeam);

    world.bases.forEach((b, t) => {
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 18, 0.4), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[t] }));
      flag.position.set(b.x, world.heightAt(b.x, b.z) + 9, b.z);
      this.scene.add(flag);
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.6, 0.12), new THREE.MeshLambertMaterial({ color: TEAM_COLORS[t] }));
      cloth.position.set(b.x + 2.4, world.heightAt(b.x, b.z) + 16, b.z);
      this.scene.add(cloth);
    });
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  setQuality(q: number) { this.quality = q; this.resize(); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * this.quality);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private buildTerrain() {
    const w = this.world, N = w.gridN, cell = w.cellSize, N1 = N + 1;
    const pos = new Float32Array(N1 * N1 * 3), colr = new Float32Array(N1 * N1 * 3);
    const uv = new Float32Array(N1 * N1 * 2);
    const c = new THREE.Color(), rock = new THREE.Color(0x8d8a7c), a = new THREE.Color(), b = new THREE.Color();
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * N1 + i, x = i * cell, z = j * cell, h = w.heights[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
      const hx = w.heightAt(x + cell, z) - w.heightAt(x - cell, z), hz = w.heightAt(x, z + cell) - w.heightAt(x, z - cell);
      const slope = Math.hypot(hx, hz) / (2 * cell);
      const n = (Math.sin(x * 0.07) * Math.cos(z * 0.053) + Math.sin(x * 0.011 + z * 0.017)) * 0.25 + 0.5;
      const pal = SURFACE_COLORS[w.surface[k]] ?? SURFACE_COLORS[Surface.Grass];
      a.setHex(pal[0]); b.setHex(pal[1]);
      c.copy(a).lerp(b, n);
      // Suaviza o limite das superfícies sem alterar o chão usado pela simulação.
      for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const ni = Math.max(0, Math.min(N, i + di)), nj = Math.max(0, Math.min(N, j + dj));
        const neighbor = SURFACE_COLORS[w.surface[nj * N1 + ni]] ?? SURFACE_COLORS[Surface.Grass];
        a.setHex(neighbor[0]); b.setHex(neighbor[1]);
        c.lerp(a.lerp(b, n), .08);
      }
      if (slope > 0.34 && w.surface[k] === Surface.Grass) c.lerp(rock, Math.min(1, (slope - 0.34) * 4));
      c.multiplyScalar(0.92 + ((i * 7 + j * 13) % 5) * 0.02);
      colr[k * 3] = c.r; colr[k * 3 + 1] = c.g; colr[k * 3 + 2] = c.b;
    }
    const idx = new Uint32Array(N * N * 6);
    let o = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const aa = j * N1 + i, bb = aa + 1, d = aa + N1, e = d + 1;
      idx[o++] = aa; idx[o++] = d; idx[o++] = bb; idx[o++] = bb; idx[o++] = d; idx[o++] = e;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(128, 128);
    let seed = 8731;
    for (let p = 0; p < pixels.data.length; p += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const shade = 204 + (seed >>> 26) * .8;
      pixels.data[p] = pixels.data[p + 1] = pixels.data[p + 2] = shade;
      pixels.data[p + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const detail = new THREE.CanvasTexture(canvas);
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.colorSpace = THREE.SRGBColorSpace;
    detail.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: detail }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 4, WORLD_SIZE * 4), new THREE.MeshBasicMaterial({ color: 0x5d7f42 }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.set(WORLD_SIZE / 2, -6, WORLD_SIZE / 2);
    this.scene.add(skirt);
  }

  /** Todas as caixas estáticas viram uma geometria só (cores por vértice). */
  private buildBoxes() {
    const boxes = [...this.world.boxes.filter((b) => b.kind !== BoxKind.Tree && b.kind !== BoxKind.Rock && b.kind !== BoxKind.Sandbag && b.kind !== BoxKind.Fob && b.kind !== BoxKind.Industrial), ...this.world.details];
    const pos: number[] = [], colr: number[] = [], nor: number[] = [];
    const c = new THREE.Color();
    const quad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, nx: number, ny: number, nz: number, shade: number) => {
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
      for (let i = 0; i < 6; i++) { nor.push(nx, ny, nz); colr.push(c.r * shade, c.g * shade, c.b * shade); }
    };
    for (const b of boxes) {
      c.setHex(b.color);
      const { x0, y0, z0, x1, y1, z1 } = b;
      const roof = b.kind === BoxKind.Building ? 0.62 : b.kind === BoxKind.Roof ? 0.9 : 1.06;
      quad(x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0, 0, 1, 0, roof);
      quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, 1);
      quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, 0.9);
      quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, 0.96);
      quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, 0.86);
      if (b.kind === BoxKind.Building) {
        const cx = (x0 + x1) / 2, ground = this.world.heightAt(cx, z1);
        c.setHex(0x384047);
        quad(cx - .7, ground, z1 + .04, cx + .7, ground, z1 + .04, cx + .7, ground + 2.3, z1 + .04, cx - .7, ground + 2.3, z1 + .04, 0, 0, 1, 1);
        const detail = (xa: number, za: number, xb: number, zb: number, ya: number, yb: number, color: number) => {
          boxes.push({ id: 0, x0: xa, x1: xb, z0: za, z1: zb, y0: ya, y1: yb, kind: BoxKind.Wall, color });
        };
        detail(x0, z0, x1, z0 + .22, y1, y1 + .45, 0xaaa69c);
        detail(x0, z1 - .22, x1, z1, y1, y1 + .45, 0xaaa69c);
        detail(x0, z0, x0 + .22, z1, y1, y1 + .45, 0xaaa69c);
        detail(x1 - .22, z0, x1, z1, y1, y1 + .45, 0xaaa69c);
        detail(cx - 1, (z0 + z1) / 2 - .6, cx + 1, (z0 + z1) / 2 + .6, y1, y1 + .8, 0x717b7f);
        // prédios sólidos: janelas pintadas (os prédios com interior vêm na etapa 4)
        c.setHex(0x2c3640);
        const gy = y0 + 4;
        const floors = Math.max(1, Math.round((y1 - gy) / 2.8));
        for (let f = 0; f < floors; f++) {
          const wy = gy + 1.1 + f * 2.8;
          for (let x = x0 + 1.4; x < x1 - 1.6; x += 3) {
            quad(x, wy, z1 + 0.03, x + 1.1, wy, z1 + 0.03, x + 1.1, wy + 1, z1 + 0.03, x, wy + 1, z1 + 0.03, 0, 0, 1, 1);
            quad(x + 1.1, wy, z0 - 0.03, x, wy, z0 - 0.03, x, wy + 1, z0 - 0.03, x + 1.1, wy + 1, z0 - 0.03, 0, 0, -1, 1);
          }
          for (let z = z0 + 1.4; z < z1 - 1.6; z += 3) {
            quad(x1 + 0.03, wy, z + 1.1, x1 + 0.03, wy, z, x1 + 0.03, wy + 1, z, x1 + 0.03, wy + 1, z + 1.1, 1, 0, 0, 1);
            quad(x0 - 0.03, wy, z, x0 - 0.03, wy, z + 1.1, x0 - 0.03, wy + 1, z + 1.1, x0 - 0.03, wy + 1, z, -1, 0, 0, 1);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /** Telhados de duas águas (decoração; a laje de cima é a colisão). */
  private buildRoofs() {
    const roofs = this.world.roofs;
    if (!roofs.length) return;
    const pos: number[] = [], colr: number[] = [], nor: number[] = [];
    const c = new THREE.Color();
    const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, shade: number) => {
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      for (let i = 0; i < 3; i++) { nor.push(nx, ny, nz); colr.push(c.r * shade, c.g * shade, c.b * shade); }
    };
    for (const r of roofs) {
      c.setHex(r.color);
      const { x0, x1, z0, z1, y, h } = r;
      const alongX = x1 - x0 >= z1 - z0;
      if (alongX) {
        const zm = (z0 + z1) / 2, ry = y + h;
        tri(x0, y, z0, x1, y, z0, x1, ry, zm, 0.9); tri(x0, y, z0, x1, ry, zm, x0, ry, zm, 0.9);
        tri(x1, y, z1, x0, y, z1, x0, ry, zm, 1.05); tri(x1, y, z1, x0, ry, zm, x1, ry, zm, 1.05);
        tri(x0, y, z1, x0, y, z0, x0, ry, zm, 0.8); tri(x1, y, z0, x1, y, z1, x1, ry, zm, 0.8);
      } else {
        const xm = r.sawtooth ? x0 + (x1 - x0) * .9 : (x0 + x1) / 2, ry = y + h;
        tri(x0, y, z1, x0, y, z0, xm, ry, z0, 1.0); tri(x0, y, z1, xm, ry, z0, xm, ry, z1, 1.0);
        tri(x1, y, z0, x1, y, z1, xm, ry, z1, 0.88); tri(x1, y, z0, xm, ry, z1, xm, ry, z0, 0.88);
        tri(x0, y, z0, x1, y, z0, xm, ry, z0, 0.8); tri(x1, y, z1, x0, y, z1, xm, ry, z1, 0.8);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  private buildTrees() {
    const trees = this.world.trees;
    if (!trees.length) return;
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 1, 5).toNonIndexed(); trunk.translate(0, 0.5, 0);
    const leaf = new THREE.ConeGeometry(1, 1, 6).toNonIndexed();
    const paintG = (g: THREE.BufferGeometry, hex: number) => {
      const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv');
      return g;
    };
    const t = trunk.clone(); t.scale(1, 0.45, 1);
    const l1 = leaf.clone(); l1.scale(0.42, 0.5, 0.42); l1.translate(0, 0.52, 0);
    const l2 = leaf.clone(); l2.scale(0.32, 0.42, 0.32); l2.translate(0, 0.8, 0);
    const parts = [paintG(t, 0x6b4f35), paintG(l1, 0x3f7a3a), paintG(l2, 0x4c8c42)];
    let total = 0; for (const p of parts) total += p.attributes.position.count;
    const pos = new Float32Array(total * 3), colr = new Float32Array(total * 3);
    let o = 0;
    for (const p of parts) { pos.set(p.attributes.position.array as Float32Array, o * 3); colr.set(p.attributes.color.array as Float32Array, o * 3); o += p.attributes.position.count; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    g.computeVertexNormals();
    const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), trees.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    trees.forEach((tr, i) => {
      q.setFromAxisAngle(up, (i * 2.399) % (Math.PI * 2));
      m.compose(p.set(tr.x, tr.y - 0.2, tr.z), q, s.set(tr.h * tr.s * 0.75, tr.h, tr.h * tr.s * 0.75));
      im.setMatrixAt(i, m);
      const k = 0.85 + ((i * 31) % 10) * 0.03;
      im.setColorAt(i, col.setRGB(k, k, k));
    });
    im.frustumCulled = false;
    this.scene.add(im);
  }

  private buildRocks() {
    const rocks = this.world.rocks;
    if (!rocks.length) return;
    const g = new THREE.IcosahedronGeometry(1, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) * 0.75);
    g.computeVertexNormals();
    const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), rocks.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    rocks.forEach((r, i) => {
      q.setFromAxisAngle(up, r.rot);
      m.compose(p.set(r.x, r.y + r.s * 0.2, r.z), q, s.set(r.s * 0.9, r.s * 0.8, r.s * 0.9));
      im.setMatrixAt(i, m);
      const k = 0.78 + ((i * 17) % 7) * 0.04;
      im.setColorAt(i, col.setRGB(k, k, k * 0.97));
    });
    im.frustumCulled = false;
    this.scene.add(im);
  }

  /** Textura de um ramo: roseta de folhas pontudas em 3 camadas (as de fora mais escuras), fundo transparente. */
  private leafTexture(): THREE.CanvasTexture {
    const S = 256, cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, S, S);
    let seed = 90211;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const leaf = (a: number, d0: number, L: number, W: number, base: [number, number, number]) => {
      const k = 0.86 + rnd() * 0.28;
      const rgb = (m: number) => `rgb(${Math.round(base[0] * k * m)},${Math.round(base[1] * k * m)},${Math.round(base[2] * k * m)})`;
      c.save(); c.translate(S / 2, S / 2); c.rotate(a); c.translate(d0, 0);
      // folha inteira
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L * 0.45, -W, L, 0); c.quadraticCurveTo(L * 0.45, W, 0, 0); c.closePath();
      c.fillStyle = rgb(1); c.fill();
      // metade sombreada e nervura clara: dá volume sem depender da luz
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L * 0.45, W, L, 0); c.closePath();
      c.fillStyle = rgb(0.74); c.fill();
      c.strokeStyle = rgb(1.28); c.lineWidth = 1.2; c.beginPath(); c.moveTo(2, 0); c.lineTo(L * 0.92, 0); c.stroke();
      c.restore();
    };
    // folhas pequenas e arredondadas espalhadas num disco; as da borda são escuras e desenhadas primeiro,
    // as do miolo claras por cima — lê como um ramo cheio, não como uma estrela
    const pts: { r: number; a: number }[] = [];
    for (let i = 0; i < 86; i++) pts.push({ r: Math.sqrt(rnd()) * 88, a: rnd() * Math.PI * 2 });
    pts.sort((p, q) => q.r - p.r);
    for (const pt of pts) {
      const f = pt.r / 88; // 0 miolo .. 1 borda
      const L = 30 + rnd() * 20 + (1 - f) * 6;
      const col: [number, number, number] = [86 - f * 44, 130 - f * 58, 56 - f * 24];
      c.save(); c.translate(Math.cos(pt.a) * pt.r, Math.sin(pt.a) * pt.r);
      leaf(pt.a + (rnd() - 0.5) * 1.9, -L * 0.3, L, L * (0.36 + rnd() * 0.1), col);
      c.restore();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  private bushU = { uTime: { value: 0 }, uMovers: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) } };

  private buildBushes() {
    const bushes = this.world.bushes;
    if (!bushes.length) return;
    // Arbusto arredondado: dezenas de ramos (cartões pequenos) espalhados numa cúpula, virados para fora.
    // As normais apontam do miolo para fora (luz suave de cúpula) e a cor escurece por dentro e embaixo (sombra própria).
    const pos: number[] = [], uv: number[] = [], nor: number[] = [], colr: number[] = [];
    let seed = 4417;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), ctr = new THREE.Vector3(), v = new THREE.Vector3(), nn = new THREE.Vector3();
    const CARDS = 30;
    for (let i = 0; i < CARDS; i++) {
      // direção bem distribuída (espiral áurea) do topo até um pouco abaixo do meio
      const u = (i + 0.5) / CARDS;
      const phi = Math.acos(1 - u * 1.42), th = i * 2.39996 + rnd() * 0.5;
      n.set(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      const k = i % 4 === 3 ? 0.5 + rnd() * 0.2 : 0.8 + rnd() * 0.2; // 1 em 4 fica mais para dentro: enche o miolo
      ctr.set(n.x * 0.62 * k, Math.max(0.14, 0.42 + n.y * 0.4 * k), n.z * 0.62 * k);
      // cartão quase de frente para fora, com inclinação e giro aleatórios
      n.x += (rnd() - 0.5) * 0.7; n.y += (rnd() - 0.5) * 0.7 + 0.15; n.z += (rnd() - 0.5) * 0.7; n.normalize();
      t.set(0, 1, 0).cross(n); if (t.lengthSq() < 0.01) t.set(1, 0, 0); t.normalize();
      b.crossVectors(n, t);
      const ra = rnd() * 6.283, ca = Math.cos(ra), sa = Math.sin(ra), sz = 0.3 + rnd() * 0.12;
      const tx = t.x * ca + b.x * sa, ty = t.y * ca + b.y * sa, tz = t.z * ca + b.z * sa;
      const bx = b.x * ca - t.x * sa, by = b.y * ca - t.y * sa, bz = b.z * ca - t.z * sa;
      const shade = (0.5 + 0.5 * k) * (0.62 + 0.38 * Math.min(1, ctr.y / 0.8)) * (0.9 + rnd() * 0.2);
      const corner = (cu: number, cv2: number) => {
        v.set(ctr.x + (tx * cu + bx * cv2) * sz, Math.max(0.02, ctr.y + (ty * cu + by * cv2) * sz), ctr.z + (tz * cu + bz * cv2) * sz);
        nn.set(v.x, (v.y - 0.25) * 1.3, v.z).normalize();
        pos.push(v.x, v.y, v.z); nor.push(nn.x, nn.y, nn.z); colr.push(shade, shade, shade);
        uv.push(cu * 0.5 + 0.5, cv2 * 0.5 + 0.5);
      };
      corner(-1, -1); corner(1, -1); corner(1, 1); corner(-1, -1); corner(1, 1); corner(-1, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    const mat = new THREE.MeshLambertMaterial({ map: this.leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, color: 0xffffff, vertexColors: true });
    const U = this.bushU;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.uniforms.uMovers = U.uMovers;
      sh.vertexShader = 'uniform float uTime;\nuniform vec4 uMovers[16];\nvarying float vCamDist;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ctr = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float h01 = clamp(position.y, 0.0, 1.0);
          float sw = sin(uTime * 1.7 + ctr.x * 0.35 + ctr.z * 0.21) * 0.5 + sin(uTime * 2.9 + ctr.z * 0.5) * 0.25;
          transformed.x += sw * 0.10 * h01; transformed.z += sw * 0.05 * h01;`)
        .replace('#include <project_vertex>', `
          vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
          vec3 wv = mvPosition.xyz;
          // quem passa empurra as folhas para os lados
          for (int i = 0; i < 16; i++) {
            vec4 mv = uMovers[i];
            if (mv.w > 0.0) {
              vec2 d = wv.xz - mv.xz;
              float dist = length(d);
              float f = (1.0 - smoothstep(0.0, 2.8, dist)) * mv.w;
              if (dist > 0.001) wv.xz += normalize(d) * f * 0.5 * (0.35 + h01);
            }
          }
          vCamDist = distance(cameraPosition, wv);
          mvPosition = viewMatrix * vec4(wv, 1.0);
          gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = 'varying float vCamDist;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `
        // folhas coladas na câmera somem (em tramado), para quem está dentro da moita enxergar para fora
        if (vCamDist < 1.7 && fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > vCamDist / 1.7) discard;
        #include <alphatest_fragment>`)
        // o verso do cartão usa a mesma normal de cúpula (sem isso metade dos ramos fica preta)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
    };
    const im = new THREE.InstancedMesh(g, mat, bushes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const tones = [0xffffff, 0xe9f0d6, 0xd6e6c6, 0xf3ecc9, 0xdfe9cf];
    bushes.forEach((bu, i) => {
      q.setFromAxisAngle(up, (i * 1.618) % (Math.PI * 2));
      m.compose(p.set(bu.x, bu.y - 0.08, bu.z), q, s.set(bu.r, bu.h, bu.r));
      im.setMatrixAt(i, m);
      im.setColorAt(i, col.setHex(tones[i % tones.length]));
    });
    im.frustumCulled = false;
    this.scene.add(im);
  }

  /** posições de quem está perto (para as moitas balançarem ao passar) */
  setMovers(list: { x: number; z: number }[], t: number) {
    this.bushU.uTime.value = t;
    const arr = this.bushU.uMovers.value;
    for (let i = 0; i < 16; i++) {
      const m = list[i];
      if (m) arr[i].set(m.x, 0, m.z, 1); else arr[i].set(0, 0, 0, 0);
    }
  }

  setZones(cz: Zone, hz: Zone) {
    const w = this.world;
    const cy = w.heightAt(cz.x, cz.z);
    this.czMesh.scale.set(cz.r, 90, cz.r);
    this.czMesh.position.set(cz.x, cy + 20, cz.z);
    const hy = w.heightAt(hz.x, hz.z);
    this.hzMesh.scale.set(hz.r, 60, hz.r);
    this.hzMesh.position.set(hz.x, hy + 22, hz.z);
    this.hzBeam.scale.set(1, 400, 1);
    this.hzBeam.position.set(hz.x, hy + 200, hz.z);
  }

  /** Construções do jogador (sacos de areia, FOB): caixas com a cor que o servidor mandou. */
  addBuild(b: Box) {
    if (this.builds.has(b.id)) return;
    let mt = this.matCache.get(b.color);
    if (!mt) this.matCache.set(b.color, (mt = new THREE.MeshLambertMaterial({ color: b.color, flatShading: true })));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), mt);
    mesh.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    this.scene.add(mesh);
    this.builds.set(b.id, mesh);
  }

  removeBuild(id: number) {
    const m = this.builds.get(id);
    if (!m) return;
    this.scene.remove(m);
    m.geometry.dispose();
    this.builds.delete(id);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
