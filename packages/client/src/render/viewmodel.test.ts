import { expect, it } from 'vitest';
import * as THREE from 'three';
import { ITEM_BY_ID } from '@warbit/shared';
import { ViewModel } from './viewmodel';

it.each(['mira_1_5x', 'mira_2x'])('%s mantém arma visível e retículo alinhado ao alvo', (id) => {
  const camera = new THREE.PerspectiveCamera(75 * ITEM_BY_ID[id].sight!.zoom, 16 / 9, .05, 1000);
  const view = new ViewModel(camera, 0x444444);
  view.setWeapon(ITEM_BY_ID.fuzil_basico, ITEM_BY_ID[id]);
  for (let i = 0; i < 180; i++) view.update(1 / 60, 0, true, true, false, false, 0, 0, true);
  camera.updateMatrixWorld(true);
  const dot = view.group.getObjectByName('opticAimPoint')!;
  const center = dot.getWorldPosition(new THREE.Vector3()).project(camera);
  expect(view.scoped).toBe(false);
  expect(dot.parent!.visible).toBe(true);
  expect(Math.abs(center.x)).toBeLessThan(.001);
  expect(Math.abs(center.y)).toBeLessThan(.001);
});

it('a luneta 4x continua usando a visão de precisão', () => {
  const view = new ViewModel(new THREE.PerspectiveCamera(), 0x444444);
  view.setWeapon(ITEM_BY_ID.fuzil_basico, ITEM_BY_ID.mira_4x);
  expect(view.scoped).toBe(true);
});

it.each(['mira_1_5x', 'mira_2x'])('%s oculta peças desde o primeiro quadro da lente, inclusive saindo da mira', id => {
  const view = new ViewModel(new THREE.PerspectiveCamera(), 0x444444);
  view.setWeapon(ITEM_BY_ID.fuzil_tatico, ITEM_BY_ID[id], true);
  const dot = view.group.getObjectByName('opticAimPoint')!;
  const shaders: { uniforms: Record<string, { value: THREE.Vector4 | THREE.Vector3 }> }[] = [];
  view.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.MeshLambertMaterial;
    const shader = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <clipping_planes_fragment>' };
    material.onBeforeCompile(shader as unknown as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
    if ('opticAperture' in shader.uniforms) shaders.push(shader);
  });
  expect(shaders.length).toBeGreaterThanOrEqual(5); // arma, braços, mãos e silenciador
  let intermediate = 0;
  for (let frame = 0; frame < 180; frame++) {
    if (frame === 55) view.fire(2);
    view.update(1 / 60, 2, true, frame < 90, false, false, .008, -.005, true);
    if (dot.parent!.visible) {
      if (view.adsAmount < .95) intermediate++;
      for (const shader of shaders) {
        expect((shader.uniforms.opticAperture.value as THREE.Vector4).w).toBeGreaterThan(0);
        expect((shader.uniforms.opticApertureNormal.value as THREE.Vector3).length()).toBeCloseTo(1);
      }
    } else {
      for (const shader of shaders) expect((shader.uniforms.opticAperture.value as THREE.Vector4).w).toBe(0);
    }
  }
  expect(intermediate).toBeGreaterThan(0);
});
