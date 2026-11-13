import type { World } from './world';
import { WORLD_SIZE } from './config';
import { BTN_BACK, BTN_FWD, BTN_JUMP, BTN_LEFT, BTN_RIGHT } from './movement';

export interface VehicleDef {
  id: string;
  name: string;
  description: string;
  price: number;
  maxHp: number;
  topSpeed: number;     // m/s para frente (~17.5 m/s = 63 km/h vs 6 m/s corrida a pé)
  reverseSpeed: number; // m/s marcha ré
  accel: number;        // aceleração m/s²
  brake: number;        // frenagem m/s²
  friction: number;     // desaceleração natural
  turnSpeed: number;    // taxa de giro rad/s
  radius: number;       // raio de colisão horizontal
  soon?: boolean;       // futuro veículo em desenvolvimento
}

export const VEHICLES: VehicleDef[] = [
  {
    id: 'quad',
    name: 'Quadriciclo 4x4 Tático',
    description: 'Veículo off-road leve e veloz para 1 tripulante. Saia da base em disparada e alcance o front em segundos.',
    price: 1200,
    maxHp: 200,
    topSpeed: 17.5,
    reverseSpeed: 6.0,
    accel: 15.0,
    brake: 22.0,
    friction: 5.0,
    turnSpeed: 2.5,
    radius: 1.0,
  },
  {
    id: 'buggy',
    name: 'Buggy de Assalto',
    description: 'Veículo de reconhecimento rápido para 2 mercenários, equipado com suporte para atirador lateral.',
    price: 2500,
    maxHp: 320,
    topSpeed: 21.0,
    reverseSpeed: 7.0,
    accel: 16.0,
    brake: 24.0,
    friction: 4.5,
    turnSpeed: 2.2,
    radius: 1.3,
    soon: true,
  },
  {
    id: 'jipe',
    name: 'Jipe Tático Blindado',
    description: 'Transporte com blindagem reforçada para resistir a fogo cerrado de fuzil enquanto avança até a zona.',
    price: 4500,
    maxHp: 600,
    topSpeed: 14.0,
    reverseSpeed: 5.0,
    accel: 10.0,
    brake: 18.0,
    friction: 5.5,
    turnSpeed: 1.8,
    radius: 1.6,
    soon: true,
  },
  {
    id: 'caminhao',
    name: 'Caminhão de Suprimentos',
    description: 'Caminhão pesado com baú de munição integrada. Funciona como ponto móvel de reabastecimento.',
    price: 6000,
    maxHp: 900,
    topSpeed: 12.0,
    reverseSpeed: 4.0,
    accel: 7.0,
    brake: 15.0,
    friction: 6.5,
    turnSpeed: 1.4,
    radius: 2.1,
    soon: true,
  },
];

export const VEHICLE_BY_ID: Record<string, VehicleDef> = Object.fromEntries(
  VEHICLES.map((v) => [v.id, v])
);

export interface VehicleState {
  id: number;
  type: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  steer: number;
  hp: number;
  driverId: number; // -1 quando vazio
  team: number;
}

export function newVehicle(id: number, type: string, x: number, y: number, z: number, yaw: number, team: number): VehicleState {
  const def = VEHICLE_BY_ID[type] ?? VEHICLES[0];
  return {
    id,
    type,
    x,
    y,
    z,
    yaw,
    pitch: 0,
    roll: 0,
    speed: 0,
    steer: 0,
    hp: def.maxHp,
    driverId: -1,
    team,
  };
}

const tmpPos = { x: 0, z: 0 };

/**
 * Atualização física determinística do veículo.
 * Roda no cliente (predição) e no servidor (autoridade).
 */
export function stepVehicle(v: VehicleState, buttons: number, dt: number, world: World): void {
  const def = VEHICLE_BY_ID[v.type] ?? VEHICLES[0];

  // Aceleração / Frenagem / Ré
  const wantFwd = (buttons & BTN_FWD) !== 0;
  const wantBack = (buttons & BTN_BACK) !== 0;
  const wantHandbrake = (buttons & BTN_JUMP) !== 0;

  if (wantHandbrake) {
    if (v.speed > 0) v.speed = Math.max(0, v.speed - def.brake * 1.6 * dt);
    else if (v.speed < 0) v.speed = Math.min(0, v.speed + def.brake * 1.6 * dt);
  } else if (wantFwd) {
    if (v.speed < 0) {
      v.speed = Math.min(0, v.speed + def.brake * dt);
    } else {
      v.speed = Math.min(def.topSpeed, v.speed + def.accel * dt);
    }
  } else if (wantBack) {
    if (v.speed > 0.4) {
      v.speed = Math.max(0, v.speed - def.brake * dt);
    } else {
      v.speed = Math.max(-def.reverseSpeed, v.speed - def.accel * 0.7 * dt);
    }
  } else {
    // Atrito natural
    if (v.speed > 0) v.speed = Math.max(0, v.speed - def.friction * dt);
    else if (v.speed < 0) v.speed = Math.min(0, v.speed + def.friction * dt);
  }

  // Direção (volante/guidão)
  let targetSteer = 0;
  if ((buttons & BTN_LEFT) !== 0) targetSteer -= 1;
  if ((buttons & BTN_RIGHT) !== 0) targetSteer += 1;
  v.steer += (targetSteer - v.steer) * Math.min(1, 10 * dt);

  // Giro (Yaw)
  const speedRatio = Math.min(1, Math.abs(v.speed) / 2.2);
  if (speedRatio > 0.05) {
    const turnSign = v.speed >= 0 ? 1 : -1;
    v.yaw -= v.steer * def.turnSpeed * speedRatio * turnSign * dt;
  }

  // Deslocamento horizontal
  const vx = -Math.sin(v.yaw) * v.speed;
  const vz = -Math.cos(v.yaw) * v.speed;
  tmpPos.x = v.x + vx * dt;
  tmpPos.z = v.z + vz * dt;

  // Colisão com obstáculos
  const hit = world.collide(tmpPos, v.y, 1.3, def.radius);
  if (hit) {
    v.speed *= 0.25; // desacelera ao bater
  }

  // Limites do mapa
  if (tmpPos.x < 4) { tmpPos.x = 4; v.speed = 0; }
  else if (tmpPos.x > WORLD_SIZE - 4) { tmpPos.x = WORLD_SIZE - 4; v.speed = 0; }
  if (tmpPos.z < 4) { tmpPos.z = 4; v.speed = 0; }
  else if (tmpPos.z > WORLD_SIZE - 4) { tmpPos.z = WORLD_SIZE - 4; v.speed = 0; }

  v.x = tmpPos.x;
  v.z = tmpPos.z;

  // Altura e inclinação do terreno (Pitch / Roll)
  const gy = world.groundAt(v.x, v.z, v.y + 0.3, def.radius);
  v.y = gy;

  // Amostragem de terreno à frente e atrás para pitch
  const fx = -Math.sin(v.yaw) * 0.9, fz = -Math.cos(v.yaw) * 0.9;
  const frontY = world.heightAt(v.x + fx, v.z + fz);
  const rearY = world.heightAt(v.x - fx, v.z - fz);
  v.pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(rearY - frontY, 1.8)));

  // Amostragem lateral para roll
  const rx = Math.cos(v.yaw) * 0.6, rz = -Math.sin(v.yaw) * 0.6;
  const rightY = world.heightAt(v.x + rx, v.z + rz);
  const leftY = world.heightAt(v.x - rx, v.z - rz);
  v.roll = Math.max(-0.5, Math.min(0.5, Math.atan2(leftY - rightY, 1.2)));
}

/** Localização do estande / NPC do vendedor de veículos na base */
export function getVendorPos(team: number, world: World): { x: number; y: number; z: number; yaw: number } {
  const b = world.bases[team];
  const vx = b.x + 8;
  const vz = b.z - 4;
  const vy = world.heightAt(vx, vz);
  return { x: vx, y: vy, z: vz, yaw: -Math.PI / 2 };
}

/** Localização onde o veículo comprado é entregue na base */
export function getVehicleSpawnPos(team: number, world: World): { x: number; y: number; z: number; yaw: number } {
  const b = world.bases[team];
  const sx = b.x;
  const sz = b.z + 2;
  const sy = world.heightAt(sx, sz);
  const toCenterYaw = Math.atan2(-(world.pois[0].x - sx), -(world.pois[0].z - sz));
  return { x: sx, y: sy, z: sz, yaw: toCenterYaw };
}
