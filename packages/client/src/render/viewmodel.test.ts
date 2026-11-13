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
