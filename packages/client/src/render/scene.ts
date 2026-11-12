import * as THREE from 'three';
import { BoxKind, Surface, TEAM_COLORS, WORLD_SIZE, type Box, type World, type Zone } from '@warbit/shared';
import { Grass } from './grass';

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
    const c = new THREE.Color(), rock = new THREE.Color(0x8d8a7c), a = new THREE.Color(), b = new THREE.Color();
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * N1 + i, x = i * cell, z = j * cell, h = w.heights[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const hx = w.heightAt(x + cell, z) - w.heightAt(x - cell, z), hz = w.heightAt(x, z + cell) - w.heightAt(x, z - cell);
      const slope = Math.hypot(hx, hz) / (2 * cell);
      const n = (Math.sin(x * 0.07) * Math.cos(z * 0.053) + Math.sin(x * 0.011 + z * 0.017)) * 0.25 + 0.5;
      const pal = SURFACE_COLORS[w.surface[k]] ?? SURFACE_COLORS[Surface.Grass];
      a.setHex(pal[0]); b.setHex(pal[1]);
      c.copy(a).lerp(b, n);
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
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 4, WORLD_SIZE * 4), new THREE.MeshBasicMaterial({ color: 0x5d7f42 }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.set(WORLD_SIZE / 2, -6, WORLD_SIZE / 2);
    this.scene.add(skirt);
  }

  /** Todas as caixas estáticas viram uma geometria só (cores por vértice). */
  private buildBoxes() {
    const boxes = this.world.boxes.filter((b) => b.kind !== BoxKind.Tree && b.kind !== BoxKind.Rock && b.kind !== BoxKind.Sandbag && b.kind !== BoxKind.Fob);
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
        const xm = (x0 + x1) / 2, ry = y + h;
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

  /** Textura de folhas gerada em código: manchas de folha verde sobre fundo transparente (os vãos deixam ver quem está dentro). */
  private leafTexture(): THREE.CanvasTexture {
    const S = 128, cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, S, S);
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const greens = ['#3f7d33', '#4c8f3b', '#2f6a2b', '#5ba043', '#386f30'];
    for (let i = 0; i < 80; i++) {
      const x = rnd() * S, y = rnd() * S, r = 4.5 + rnd() * 7, a = rnd() * Math.PI;
      // parte de baixo (onde ficam o agachado e o deitado) é bem mais rala: a silhueta aparece pelos vãos
      if (y > S * 0.62 && rnd() < 0.72) continue;
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = greens[Math.floor(rnd() * greens.length)];
      c.beginPath(); c.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(20,60,20,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.stroke();
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
    // 8 planos de folhas cruzados (6 em pé, 2 inclinados como "tampa"): denso por fora, com vãos
    const pos: number[] = [], uv: number[] = [], nor: number[] = [];
    const plane = (ang: number, tilt: number, off: number, w: number, h: number) => {
      const ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(tilt), st = Math.sin(tilt);
      const corner = (u: number, v: number): [number, number, number] => {
        // v ao longo da altura (inclinada por `tilt` para fora), u ao longo da largura
        const lx = u * w, ly = v * h * ct, lz = v * h * st + off;
        return [lx * ca + lz * sa, ly, -lx * sa + lz * ca];
      };
      const a = corner(-1, 0), b = corner(1, 0), c2 = corner(1, 1), d = corner(-1, 1);
      pos.push(...a, ...b, ...c2, ...a, ...c2, ...d);
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      for (let i = 0; i < 6; i++) nor.push(0, 1, 0);
    };
    for (let i = 0; i < 6; i++) plane((i * Math.PI) / 3 + 0.2, 0.18 + (i % 2) * 0.12, 0.05, 1.05, 1.05);
    plane(0.6, 1.15, 0.1, 0.95, 0.95);
    plane(2.4, 1.15, 0.1, 0.95, 0.95);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const mat = new THREE.MeshLambertMaterial({ map: this.leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, color: 0xffffff });
    const U = this.bushU;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.uniforms.uMovers = U.uMovers;
      sh.vertexShader = 'uniform float uTime;\nuniform vec4 uMovers[16];\nvarying float vCamDist;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ctr = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float h01 = clamp(position.y, 0.0, 1.6) / 1.6;
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
        #include <alphatest_fragment>`);
    };
    const im = new THREE.InstancedMesh(g, mat, bushes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const tones = [0xffffff, 0xe6f2d8, 0xd2e8c0, 0xf2ecc8];
    bushes.forEach((bu, i) => {
      q.setFromAxisAngle(up, (i * 1.618) % (Math.PI * 2));
      m.compose(p.set(bu.x, bu.y - 0.1, bu.z), q, s.set(bu.r * 1.1, bu.h * 1.0, bu.r * 1.1));
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
