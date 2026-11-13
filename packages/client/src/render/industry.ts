import * as THREE from 'three';
import type { World } from '@warbit/shared';

export function buildIndustry(world: World): THREE.Group {
  const group = new THREE.Group(), props = world.industrialProps;
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 12), material, props.length);
  const caps = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 12), material, props.length);
  const bands = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.015, 1.015, 1, 12, 1, true), material, props.length * 3);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const place = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, r: number, h: number, hex: number) => {
    dummy.position.set(x, y, z); dummy.scale.set(r, h, r); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, color.setHex(hex));
  };
  props.forEach((p, i) => {
    const bodyH = p.kind === 'silo' ? p.h - .8 : p.h;
    place(bodies, i, p.x, p.y + bodyH / 2, p.z, p.r, bodyH, p.kind === 'chimney' ? 0xc8c4b5 : 0xa2b0ae);
    // A tampa fica dentro do volume da caixa de colisão.
    place(caps, i, p.x, p.y + p.h - .4, p.z, p.r, .8, 0x66767a);
    for (let j = 0; j < 3; j++) place(bands, i * 3 + j, p.x, p.y + p.h * (.25 + j * .3), p.z, p.r, p.kind === 'chimney' ? p.h * .12 : .16, p.kind === 'chimney' ? 0xa64b3e : 0x5b686b);
  });
  group.add(bodies, caps, bands);
  return group;
}
