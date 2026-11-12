import * as THREE from 'three';
import { stepNade, type Nade, type World } from '@warbit/shared';

const MAX_TRACERS = 160;

/** Efeitos baratos: traçantes (um único LineSegments), clarões, explosões e granadas. */
export class Fx {
  private tracerGeo = new THREE.BufferGeometry();
  private tPos = new Float32Array(MAX_TRACERS * 6);
  private tCol = new Float32Array(MAX_TRACERS * 6);
  private tLife = new Float32Array(MAX_TRACERS);
  private tNext = 0;
  private flashes: { m: THREE.Mesh; life: number }[] = [];
  private booms: { m: THREE.Mesh; life: number }[] = [];
  private nades = new Map<number, { n: Nade; m: THREE.Mesh }>();
  private flashGeo = new THREE.OctahedronGeometry(0.16, 0);
  private flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private boomGeo = new THREE.IcosahedronGeometry(1, 1);
  private nadeGeo = new THREE.IcosahedronGeometry(0.07, 0);
  private nadeMat = new THREE.MeshLambertMaterial({ color: 0x2f3b2c, flatShading: true });

  constructor(private scene: THREE.Scene, private world: World) {
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerGeo.setAttribute('color', new THREE.BufferAttribute(this.tCol, 3).setUsage(THREE.DynamicDrawUsage));
    const lines = new THREE.LineSegments(this.tracerGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    lines.frustumCulled = false;
    scene.add(lines);
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(this.flashGeo, this.flashMat);
      m.visible = false;
      scene.add(m);
      this.flashes.push({ m, life: 0 });
    }
  }

  tracer(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number) {
    const i = this.tNext;
    this.tNext = (this.tNext + 1) % MAX_TRACERS;
    const start = Math.min(len * 0.5, 1.2);
    const p = this.tPos;
    p[i * 6] = ox + dx * start; p[i * 6 + 1] = oy + dy * start; p[i * 6 + 2] = oz + dz * start;
    p[i * 6 + 3] = ox + dx * len; p[i * 6 + 4] = oy + dy * len; p[i * 6 + 5] = oz + dz * len;
    this.tLife[i] = 1;
  }

  flash(x: number, y: number, z: number) {
    const f = this.flashes.find((q) => q.life <= 0) ?? this.flashes[0];
    f.m.position.set(x, y, z);
    f.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    f.m.visible = true;
    f.life = 0.05;
  }

  boom(x: number, y: number, z: number) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
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

  /** passo fixo das granadas (mesma física do servidor) */
  tick(dt: number) {
    for (const [id, o] of this.nades) {
      if (stepNade(o.n, this.world, dt)) { this.scene.remove(o.m); this.nades.delete(id); }
      else o.m.position.set(o.n.x, o.n.y, o.n.z);
    }
  }

  update(dt: number) {
    let any = false;
    for (let i = 0; i < MAX_TRACERS; i++) {
      if (this.tLife[i] <= 0) continue;
      any = true;
      this.tLife[i] -= dt * 9;
      const v = Math.max(0, this.tLife[i]);
      const c = this.tCol;
      c[i * 6] = v; c[i * 6 + 1] = v * 0.85; c[i * 6 + 2] = v * 0.5;
      c[i * 6 + 3] = v * 0.5; c[i * 6 + 4] = v * 0.4; c[i * 6 + 5] = v * 0.2;
    }
    if (any) { this.tracerGeo.attributes.position.needsUpdate = true; this.tracerGeo.attributes.color.needsUpdate = true; }
    for (const f of this.flashes) if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.m.visible = false; }
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
