import * as THREE from 'three';
import { Surface, hash2, type World } from '@warbit/shared';

const CELL = 10;

/**
 * Grama instanciada só em volta da câmera (refeita quando a câmera muda de célula),
 * com balanço de vento no shader. Barata: uma draw call.
 */
export class Grass {
  readonly mesh: THREE.InstancedMesh;
  private uTime = { value: 0 };
  private lastI = 1e9; private lastJ = 1e9;
  private R: number;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private p = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private c = new THREE.Color();

  constructor(private world: World, quality: number) {
    this.R = quality >= 1 ? 7 : quality >= 0.8 ? 5 : 3;
    const per = 70;
    const cap = (2 * this.R + 1) ** 2 * per;
    // tufo: 5 lâminas finas em ângulos diferentes
    const pos: number[] = [], colr: number[] = [], nor: number[] = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI + k * 0.37;
      const ox = Math.cos(a * 2.3) * 0.12, oz = Math.sin(a * 1.7) * 0.12;
      const ca = Math.cos(a) * 0.05, sa = Math.sin(a) * 0.05;
      const lean = 0.12 * (k % 2 ? 1 : -1);
      const h = 0.8 + (k % 3) * 0.15;
      pos.push(ox - ca, 0, oz - sa, ox + ca, 0, oz + sa, ox + lean * sa * 4, h, oz - lean * ca * 4);
      colr.push(0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 1.15, 1.15, 1.15);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 1.6 + wp.x * 0.31 + wp.z * 0.17) * 0.5 + sin(uTime * 2.7 + wp.z * 0.43) * 0.25;
          transformed.x += sway * 0.14 * position.y;
          transformed.z += sway * 0.07 * position.y;
        #endif`);
    };
    this.mesh = new THREE.InstancedMesh(g, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.c.setHex(0xffffff));
  }

  update(x: number, z: number, t: number) {
    this.uTime.value = t;
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    if (ci === this.lastI && cj === this.lastJ) return;
    this.lastI = ci; this.lastJ = cj;
    const w = this.world, seed = w.seed;
    let n = 0;
    const R = this.R;
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      // células nas bordas ficam mais ralas (some aos poucos com a distância)
      const ring = Math.max(Math.abs(i - ci), Math.abs(j - cj));
      const dens = ring <= R - 2 ? 1 : ring === R - 1 ? 0.6 : 0.3;
      for (let k = 0; k < 70; k++) {
        const h1 = hash2(i * 97 + k, j * 89 - k, seed);
        if (h1 > dens) continue;
        const gx = (i + hash2(i, j * 31 + k, seed + 1)) * CELL, gz = (j + hash2(i * 17 + k, j, seed + 2)) * CELL;
        const surf = w.surfaceAt(gx, gz);
        if (surf === Surface.Road || surf === Surface.Concrete) continue;
        if (surf === Surface.Dirt && h1 > 0.25) continue;
        if (surf === Surface.Forest && h1 > 0.55) continue;
        if (w.blockedAt(gx, gz)) continue;
        const gy = w.heightAt(gx, gz);
        const r = hash2(i + k * 7, j - k * 3, seed + 3);
        this.q.setFromAxisAngle(this.up, r * 6.283);
        const field = surf === Surface.Field;
        const hgt = field ? 0.3 + r * 0.2 : 0.15 + r * 0.2;
        const wid = 0.8 + r * 0.6;
        this.m.compose(this.p.set(gx, gy - 0.03, gz), this.q, this.s.set(wid, hgt, wid));
        this.mesh.setMatrixAt(n, this.m);
        if (field) this.c.setRGB(0.78 + r * 0.1, 0.68 + r * 0.08, 0.32);
        else if (surf === Surface.Forest) this.c.setRGB(0.27, 0.45 + r * 0.08, 0.2);
        else this.c.setRGB(0.36 + r * 0.12, 0.56 + r * 0.12, 0.24 + r * 0.05);
        this.mesh.setColorAt(n, this.c);
        if (++n >= this.mesh.instanceMatrix.count) break;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
