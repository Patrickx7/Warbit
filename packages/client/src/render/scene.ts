import * as THREE from 'three';
import { BoxKind, TEAM_COLORS, WORLD_SIZE, type Box, type World, type Zone } from '@warbit/shared';

const SKY = 0xa9c9e8;

/** Cena low-poly: terreno, construções mescladas, árvores instanciadas, zonas. Sem texturas, sem sombras dinâmicas. */
export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.08, 1400);
  private czMesh: THREE.Mesh;
  private hzMesh: THREE.Mesh;
  private hzBeam: THREE.Mesh;
  private sandbags = new Map<number, THREE.Mesh>();
  private sandMat = new THREE.MeshLambertMaterial({ color: 0xb9a57c, flatShading: true });
  private spawnPoles: THREE.Mesh[] = [];
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
    this.buildTrees();
    this.buildBushes();

    const czMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, fog: false });
    this.czMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true), czMat);
    const hzMat = new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, fog: false });
    this.hzMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), hzMat);
    this.hzBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
    this.czMesh.renderOrder = 2; this.hzMesh.renderOrder = 3; this.hzBeam.renderOrder = 3;
    this.scene.add(this.czMesh, this.hzMesh, this.hzBeam);

    for (let t = 0; t < 3; t++) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 14, 0.5), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[t] }));
      this.spawnPoles.push(pole);
      this.scene.add(pole);
      // bandeira da base
      const b = world.bases[t];
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 18, 0.4), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[t] }));
      flag.position.set(b.x, world.heightAt(b.x, b.z) + 9, b.z);
      this.scene.add(flag);
    }
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
    const c = new THREE.Color(), grass = new THREE.Color(0x6e9a48), grass2 = new THREE.Color(0x86ab52), dirt = new THREE.Color(0xb09a72), rock = new THREE.Color(0x8d8a7c);
    const flats = [...w.villages.map((v) => ({ ...v, r: 58 })), ...w.bases.map((b) => ({ ...b, r: 70 }))];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * N1 + i, x = i * cell, z = j * cell, h = w.heights[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const hx = w.heightAt(x + cell, z) - w.heightAt(x - cell, z), hz = w.heightAt(x, z + cell) - w.heightAt(x, z - cell);
      const slope = Math.hypot(hx, hz) / (2 * cell);
      const n = (Math.sin(x * 0.07) * Math.cos(z * 0.053) + Math.sin(x * 0.011 + z * 0.017)) * 0.25 + 0.5;
      c.copy(grass).lerp(grass2, n);
      if (slope > 0.32) c.lerp(rock, Math.min(1, (slope - 0.32) * 4));
      let dm = 0;
      for (const f of flats) { const d = Math.hypot(f.x - x, f.z - z); if (d < f.r * 1.25) dm = Math.max(dm, Math.min(1, (f.r * 1.25 - d) / (f.r * 0.4))); }
      if (dm > 0) c.lerp(dirt, dm * 0.85);
      c.multiplyScalar(0.92 + ((i * 7 + j * 13) % 5) * 0.02);
      colr[k * 3] = c.r; colr[k * 3 + 1] = c.g; colr[k * 3 + 2] = c.b;
    }
    const idx = new Uint32Array(N * N * 6);
    let o = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * N1 + i, b = a + 1, d = a + N1, e = d + 1;
      idx[o++] = a; idx[o++] = d; idx[o++] = b; idx[o++] = b; idx[o++] = d; idx[o++] = e;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    // chão escuro além da borda
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 4, WORLD_SIZE * 4), new THREE.MeshBasicMaterial({ color: 0x5d7f42 }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.set(WORLD_SIZE / 2, -6, WORLD_SIZE / 2);
    this.scene.add(skirt);
  }

  private buildBoxes() {
    const boxes = this.world.boxes.filter((b) => b.kind !== BoxKind.Tree && b.kind !== BoxKind.Sandbag);
    const pos: number[] = [], colr: number[] = [], nor: number[] = [];
    const c = new THREE.Color();
    const quad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, nx: number, ny: number, nz: number, shade: number) => {
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
      for (let i = 0; i < 6; i++) { nor.push(nx, ny, nz); colr.push(c.r * shade, c.g * shade, c.b * shade); }
    };
    for (const b of boxes) {
      c.setHex(b.color);
      const { x0, y0, z0, x1, y1, z1 } = b;
      const roof = b.kind === BoxKind.Building ? 0.62 : 1.06;
      quad(x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0, 0, 1, 0, roof);
      quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, 1);
      quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, 0.9);
      quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, 0.96);
      quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, 0.86);
      if (b.kind === BoxKind.Building) {
        // janelas e porta: retângulos escuros levemente à frente da parede
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

  private buildTrees() {
    const trees = this.world.trees;
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 1, 5).toNonIndexed(); trunk.translate(0, 0.5, 0);
    const leaf = new THREE.ConeGeometry(1, 1, 6).toNonIndexed();
    const paintG = (g: THREE.BufferGeometry, hex: number) => {
      const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv');
      return g;
    };
    const makeTree = () => {
      const parts: THREE.BufferGeometry[] = [];
      const t = trunk.clone(); t.scale(1, 0.45, 1); parts.push(paintG(t, 0x6b4f35));
      const l1 = leaf.clone(); l1.scale(0.42, 0.5, 0.42); l1.translate(0, 0.52, 0); parts.push(paintG(l1, 0x3f7a3a));
      const l2 = leaf.clone(); l2.scale(0.32, 0.42, 0.32); l2.translate(0, 0.8, 0); parts.push(paintG(l2, 0x4c8c42));
      return parts;
    };
    const parts = makeTree();
    // mescla manual simples
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
    trees.forEach((t, i) => {
      q.setFromAxisAngle(up, (i * 2.399) % (Math.PI * 2));
      m.compose(p.set(t.x, t.y - 0.2, t.z), q, s.set(t.h * t.s * 0.75, t.h, t.h * t.s * 0.75));
      im.setMatrixAt(i, m);
      const k = 0.85 + ((i * 31) % 10) * 0.03;
      im.setColorAt(i, col.setRGB(k, k, k));
    });
    im.frustumCulled = false;
    this.scene.add(im);
  }

  private buildBushes() {
    const bushes = this.world.bushes;
    if (!bushes.length) return;
    // duas bolas facetadas mescladas = uma moita (40 triângulos)
    const a = new THREE.IcosahedronGeometry(1, 0); a.scale(1, 0.62, 1); a.translate(0, 0.5, 0);
    const b = new THREE.IcosahedronGeometry(0.7, 0); b.scale(1, 0.7, 1); b.translate(0.55, 0.42, 0.3);
    const n = a.attributes.position.count + b.attributes.position.count;
    const pos = new Float32Array(n * 3);
    pos.set(a.attributes.position.array as Float32Array, 0);
    pos.set(b.attributes.position.array as Float32Array, a.attributes.position.count * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), bushes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const tones = [0x4f8a3c, 0x5c9644, 0x447a36, 0x6a9a4a];
    bushes.forEach((bu, i) => {
      q.setFromAxisAngle(up, (i * 1.618) % (Math.PI * 2));
      m.compose(p.set(bu.x, bu.y - 0.15, bu.z), q, s.set(bu.r, bu.h * 1.25, bu.r));
      im.setMatrixAt(i, m);
      im.setColorAt(i, col.setHex(tones[i % tones.length]));
    });
    im.frustumCulled = false;
    this.scene.add(im);
  }

  setZones(cz: Zone, hz: Zone, spawns: { x: number; z: number }[]) {
    const w = this.world;
    const cy = w.heightAt(cz.x, cz.z);
    this.czMesh.scale.set(cz.r, 90, cz.r);
    this.czMesh.position.set(cz.x, cy + 20, cz.z);
    const hy = w.heightAt(hz.x, hz.z);
    this.hzMesh.scale.set(hz.r, 60, hz.r);
    this.hzMesh.position.set(hz.x, hy + 22, hz.z);
    this.hzBeam.scale.set(1, 400, 1);
    this.hzBeam.position.set(hz.x, hy + 200, hz.z);
    spawns.forEach((s, t) => this.spawnPoles[t]?.position.set(s.x, w.heightAt(s.x, s.z) + 7, s.z));
  }

  addSandbag(b: Box) {
    if (this.sandbags.has(b.id)) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), this.sandMat);
    mesh.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    this.scene.add(mesh);
    this.sandbags.set(b.id, mesh);
  }

  removeSandbag(id: number) {
    const m = this.sandbags.get(id);
    if (!m) return;
    this.scene.remove(m);
    m.geometry.dispose();
    this.sandbags.delete(id);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
