import { describe, expect, it } from 'vitest';
import {
  BTN_BACK, BTN_FWD, BTN_JUMP, BTN_LEFT, BTN_RIGHT, DT, World, newVehicle, stepVehicle, VEHICLES, VEHICLE_BY_ID,
  getVendorPos, getVehicleSpawnPos,
} from '../src/index';

const world = new World(4321);

describe('veículos', () => {
  it('catálogo de veículos está definido com quadriciclo e futuros veículos', () => {
    expect(VEHICLES.length).toBeGreaterThanOrEqual(4);
    const quad = VEHICLE_BY_ID['quad'];
    expect(quad).toBeDefined();
    expect(quad.name).toContain('Quadriciclo');
    expect(quad.topSpeed).toBeGreaterThan(15);
    expect(quad.price).toBe(1200);

    const buggy = VEHICLE_BY_ID['buggy'];
    expect(buggy).toBeDefined();
    expect(buggy.soon).toBe(true);
  });

  it('posições de vendedor e entrega na base são válidas e livres', () => {
    for (let t = 0; t < 3; t++) {
      const v = getVendorPos(t, world);
      const s = getVehicleSpawnPos(t, world);
      expect(v.x).toBeGreaterThan(0);
      expect(v.z).toBeGreaterThan(0);
      expect(s.x).toBeGreaterThan(0);
      expect(s.z).toBeGreaterThan(0);
      // Spawn pad fica próximo ao vendedor
      expect(Math.hypot(v.x - s.x, v.z - s.z)).toBeLessThanOrEqual(12);
    }
  });

  it('acelera para frente e é determinístico', () => {
    const sPos = getVehicleSpawnPos(0, world);
    const run = () => {
      const v = newVehicle(1, 'quad', sPos.x, sPos.y, sPos.z, sPos.yaw, 0);
      for (let i = 0; i < 60; i++) {
        stepVehicle(v, BTN_FWD, DT, world);
      }
      return { x: v.x, z: v.z, speed: v.speed };
    };
    const r1 = run();
    const r2 = run();
    expect(r1).toEqual(r2);
    expect(r1.speed).toBeGreaterThan(10);
    expect(Math.hypot(r1.x - sPos.x, r1.z - sPos.z)).toBeGreaterThan(5);
  });

  it('freia e dá ré com BTN_BACK', () => {
    const sPos = getVehicleSpawnPos(0, world);
    const v = newVehicle(1, 'quad', sPos.x, sPos.y, sPos.z, sPos.yaw, 0);
    v.speed = 10;
    // Pressionando ré/freio enquanto está em velocidade para frente
    stepVehicle(v, BTN_BACK, DT, world);
    expect(v.speed).toBeLessThan(10);

    // Quando quase parado, engata ré
    v.speed = 0;
    for (let i = 0; i < 30; i++) {
      stepVehicle(v, BTN_BACK, DT, world);
    }
    expect(v.speed).toBeLessThan(0);
  });

  it('vira para a esquerda e direita', () => {
    const sPos = getVehicleSpawnPos(0, world);
    const vLeft = newVehicle(1, 'quad', sPos.x, sPos.y, sPos.z, 0, 0);
    const vRight = newVehicle(2, 'quad', sPos.x, sPos.y, sPos.z, 0, 0);
    vLeft.speed = 10;
    vRight.speed = 10;

    for (let i = 0; i < 20; i++) {
      stepVehicle(vLeft, BTN_FWD | BTN_LEFT, DT, world);
      stepVehicle(vRight, BTN_FWD | BTN_RIGHT, DT, world);
    }
    expect(vLeft.yaw).not.toBe(0);
    expect(vRight.yaw).not.toBe(0);
    expect(vLeft.yaw).toBeGreaterThan(vRight.yaw);
  });
});
