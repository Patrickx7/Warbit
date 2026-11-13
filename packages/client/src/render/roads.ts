import * as THREE from 'three';
import type { World } from '@warbit/shared';

/** Faixas amostradas no relevo; tudo estático é enviado em uma única malha. */
export function buildRoads(world: World): THREE.Group {
  const group = new THREE.Group(), positions: number[] = [], colors: number[] = [];
  const color = new THREE.Color();
  const strip = (ax: number, az: number, bx: number, bz: number, width: number, hex: number, lift: number) => {
    const length = Math.hypot(bx - ax, bz - az);
    if (length < .01) return;
    const nx = -(bz - az) / length * width / 2, nz = (bx - ax) / length * width / 2;
    const steps = Math.ceil(length / 3);
    color.setHex(hex);
    for (let i = 0; i < steps; i++) {
      const x0 = ax + (bx - ax) * i / steps, z0 = az + (bz - az) * i / steps;
      const x1 = ax + (bx - ax) * (i + 1) / steps, z1 = az + (bz - az) * (i + 1) / steps;
      const points = [[x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x0 - nx, z0 - nz]];
      for (const j of [0, 1, 2, 0, 2, 3]) {
        const [x, z] = points[j];
        positions.push(x, world.heightAt(x, z) + lift, z);
        colors.push(color.r, color.g, color.b);
      }
    }
  };
  for (const r of world.roads) {
    strip(r.ax, r.az, r.bx, r.bz, 7, 0x514b40, .045);
    strip(r.ax, r.az, r.bx, r.bz, 6, 0x65635c, .06);
    const length = Math.hypot(r.bx - r.ax, r.bz - r.az);
    for (let t = 1; t + 3 < length; t += 9) {
      const p = (d: number) => [r.ax + (r.bx - r.ax) * d / length, r.az + (r.bz - r.az) * d / length];
      const a = p(t), b = p(t + 3);
      strip(a[0], a[1], b[0], b[1], .14, 0xd9c999, .085);
    }
  }
  const vertical = world.streets.filter(s => s.z1 - s.z0 > s.x1 - s.x0);
  const horizontal = world.streets.filter(s => s.x1 - s.x0 > s.z1 - s.z0);
  const lamps: [number, number][] = [];
  for (const s of world.streets) {
    const alongZ = s.z1 - s.z0 > s.x1 - s.x0;
    const center = alongZ ? (s.x0 + s.x1) / 2 : (s.z0 + s.z1) / 2;
    const start = alongZ ? s.z0 : s.x0, end = alongZ ? s.z1 : s.x1;
    const draw = (a: number, b: number, offset: number, width: number, hex: number, lift: number) => {
      if (alongZ) strip(center + offset, a, center + offset, b, width, hex, lift);
      else strip(a, center + offset, b, center + offset, width, hex, lift);
    };
    draw(start, end, 0, 8, 0x45494b, .11);
    const crossings = (alongZ ? horizontal : vertical).map(c => alongZ ? [c.z0, c.z1] : [c.x0, c.x1]);
    // Calçadas param nos cruzamentos, sem atravessar as vias.
    let cursor = start;
    for (const [lo, hi] of [...crossings.sort((a, b) => a[0] - b[0]), [end, end]]) {
      if (lo > cursor) {
        for (const side of [-1, 1]) {
          draw(cursor, lo, side * 4.6, 1.2, 0xb3b0a5, .23);
          draw(cursor, lo, side * 4.05, .12, 0xd1cec2, .24);
        }
        for (let d = cursor + 8; d < lo - 4; d += 24) lamps.push(alongZ ? [center + 4.8, d] : [d, center + 4.8]);
        for (let d = cursor + 3; d + 2 < lo - 2; d += 7) draw(d, d + 2, 0, .12, 0xd4cfb7, .14);
      }
      cursor = Math.max(cursor, hi);
    }
  }
  for (const v of vertical) for (const h of horizontal) {
    const x = (v.x0 + v.x1) / 2, z = (h.z0 + h.z1) / 2;
    for (const side of [-1, 1]) for (let offset = -2.8; offset <= 2.8; offset += .8) {
      strip(x + offset, z + side * 5 - 1, x + offset, z + side * 5 + 1, .4, 0xe2ded0, .15);
      strip(x + side * 5 - 1, z + offset, x + side * 5 + 1, z + offset, .4, 0xe2ded0, .15);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  group.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(.07, .11, 5, 5), new THREE.MeshLambertMaterial({ color: 0x454b4e }), lamps.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .15, .8), new THREE.MeshLambertMaterial({ color: 0xd9d5ba }), lamps.length);
  const matrix = new THREE.Matrix4();
  lamps.forEach(([x, z], i) => {
    const y = world.heightAt(x, z);
    poles.setMatrixAt(i, matrix.makeTranslation(x, y + 2.7, z));
    heads.setMatrixAt(i, matrix.makeTranslation(x, y + 5.2, z));
  });
  group.add(poles, heads);
  return group;
}
