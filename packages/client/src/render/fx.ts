import * as THREE from 'three';
import { stepNade, type Nade, type World } from '@warbit/shared';

const MAX_TRACERS = 128;
const BULLET_SPEED = 420; // m/s visual (mais lento que o real para dar para ver a direção)
const STREAK = 2.2;       // comprimento do risco

interface Bullet { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number; len: number; d: number; impact: boolean; alive: boolean }

/** Efeitos discretos: risco curto viajando na direção do tiro, clarão pequeno, poeira no impacto, explosões. */
export class Fx {
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX_TRACERS * 6);
  private col = new Float32Array(MAX_TRACERS * 6);
  private bullets: Bullet[] = [];
  private next = 0;
  private flashes: { m: THREE.Mesh; life: number }[] = [];
  private puffs: { m: THREE.Mesh; life: number }[] = [];
  private booms: { m: THREE.Mesh; life: number }[] = [];
  private nades = new Map<number, { n: Nade; m: THREE.Mesh }>();
  private boomGeo = new THREE.IcosahedronGeometry(1, 1);
  private nadeGeo = new THREE.IcosahedronGeometry(0.07, 0);
  private nadeMat = new THREE.MeshLambertMaterial({ color: 0x2f3b2c, flatShading: true });

  constructor(private scene: THREE.Scene, private world: World) {
    for (let i = 0; i < MAX_TRACERS; i++) this.bullets.push({ ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0, len: 0, d: 0, impact: false, alive: false });
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false }));
    lines.frustumCulled = false;
    scene.add(lines);
    const flashGeo = new THREE.OctahedronGeometry(0.07, 0);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(flashGeo, flashMat);
      m.visible = false; scene.add(m);
      this.flashes.push({ m, life: 0 });
    }
    const puffGeo = new THREE.IcosahedronGeometry(0.12, 0);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0x9c8b6e, transparent: true, opacity: 0.6, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.puffs.push({ m, life: 0 });
    }
  }

  /** dispara um risco do ponto de origem na direção (dx,dy,dz) até `len` metros */
  tracer(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number, impact = true) {
    const b = this.bullets[this.next];
    this.next = (this.next + 1) % MAX_TRACERS;
    b.ox = ox; b.oy = oy; b.oz = oz; b.dx = dx; b.dy = dy; b.dz = dz; b.len = len; b.d = 0; b.impact = impact && len < 299; b.alive = true;
  }

  flash(x: number, y: number, z: number) {
    const f = this.flashes.find((q) => q.life <= 0) ?? this.flashes[0];
    f.m.position.set(x, y, z);
    f.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    f.m.visible = true;
    f.life = 0.035;
  }

  private puff(x: number, y: number, z: number) {
    const p = this.puffs.find((q) => q.life <= 0) ?? this.puffs[0];
    p.m.position.set(x, y, z);
    p.m.scale.setScalar(1);
    p.m.visible = true;
    p.life = 0.5;
  }

  boom(x: number, y: number, z: number) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(this.boomGeo, mat);
    m.position.set(x, y, z);
    this.scene.add(m);
    this.booms.push({ m, life: 0.45 });
  }

  addNade(n: Nade) {
    const m = new THREE.Mesh(this.nadeGeo, this.nadeMat);
    m.position.set(n.x, n.y, n.z);
    this.scene.add(m);
    this.nades.set(n.id, { n, m });
  }

  tick(dt: number) {
    for (const [id, o] of this.nades) {
      if (stepNade(o.n, this.world, dt)) { this.scene.remove(o.m); this.nades.delete(id); }
      else o.m.position.set(o.n.x, o.n.y, o.n.z);
    }
  }

  update(dt: number) {
    const p = this.pos, c = this.col;
    for (let i = 0; i < MAX_TRACERS; i++) {
      const b = this.bullets[i];
      const k = i * 6;
      if (!b.alive) { p[k] = p[k + 3]; p[k + 1] = p[k + 4]; p[k + 2] = p[k + 5]; c.fill(0, k, k + 6); continue; }
      b.d += BULLET_SPEED * dt;
      const head = Math.min(b.d, b.len), tail = Math.max(0, Math.min(b.d - STREAK, b.len));
      if (b.d - STREAK >= b.len) {
        b.alive = false;
        if (b.impact) this.puff(b.ox + b.dx * b.len, b.oy + b.dy * b.len, b.oz + b.dz * b.len);
        c.fill(0, k, k + 6);
        continue;
      }
      p[k] = b.ox + b.dx * tail; p[k + 1] = b.oy + b.dy * tail; p[k + 2] = b.oz + b.dz * tail;
      p[k + 3] = b.ox + b.dx * head; p[k + 4] = b.oy + b.dy * head; p[k + 5] = b.oz + b.dz * head;
      c[k] = 0.35; c[k + 1] = 0.3; c[k + 2] = 0.2;     // cauda apagada
      c[k + 3] = 1.0; c[k + 4] = 0.88; c[k + 5] = 0.6; // ponta clara: mostra a direção
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    for (const f of this.flashes) if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.m.visible = false; }
    for (const q of this.puffs) {
      if (q.life <= 0) continue;
      q.life -= dt;
      q.m.scale.setScalar(1 + (0.5 - q.life) * 4);
      q.m.position.y += dt * 0.4;
      (q.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, q.life * 1.1);
      if (q.life <= 0) q.m.visible = false;
    }
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.life -= dt;
      const k = 1 - b.life / 0.45;
      b.m.scale.setScalar(1 + k * 6.5);
      (b.m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      if (b.life <= 0) { this.scene.remove(b.m); (b.m.material as THREE.Material).dispose(); this.booms.splice(i, 1); }
    }
  }
}
