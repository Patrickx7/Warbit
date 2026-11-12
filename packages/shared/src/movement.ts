import {
  CROUCH_HEIGHT, CROUCH_SPEED, GRAVITY, JUMP_SPEED, PLAYER_HEIGHT, PLAYER_RADIUS,
  SPRINT_SPEED, STEP_HEIGHT, WALK_SPEED, WORLD_SIZE,
} from './config';
import type { World } from './world';

// Botões (byte 1)
export const BTN_FWD = 1, BTN_BACK = 2, BTN_LEFT = 4, BTN_RIGHT = 8, BTN_JUMP = 16, BTN_CROUCH = 32, BTN_SPRINT = 64, BTN_FIRE = 128;
// Botões (byte 2)
export const BTN2_RELOAD = 1, BTN2_USE = 2, BTN2_ADS = 4, BTN2_SECONDARY = 8, BTN2_NADE = 16, BTN2_HEAL = 32, BTN2_BUILD = 64, BTN2_MARK = 128;

export interface MoveState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  onGround: boolean;
  crouch: boolean;
}

export function newMoveState(x = 0, y = 0, z = 0): MoveState {
  return { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, crouch: false };
}

const tmp = { x: 0, z: 0 };

/**
 * Um passo determinístico do controlador de personagem.
 * Roda IGUAL no cliente (predição) e no servidor (autoridade).
 */
export function stepMove(s: MoveState, buttons: number, yaw: number, world: World, dt: number, speedMul = 1): void {
  const wantCrouch = (buttons & BTN_CROUCH) !== 0;
  s.crouch = wantCrouch;
  const height = s.crouch ? CROUCH_HEIGHT : PLAYER_HEIGHT;

  let f = 0, r = 0;
  if (buttons & BTN_FWD) f += 1;
  if (buttons & BTN_BACK) f -= 1;
  if (buttons & BTN_RIGHT) r += 1;
  if (buttons & BTN_LEFT) r -= 1;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  // frente = (-sin, -cos), direita = (cos, -sin)
  let wx = -sin * f + cos * r;
  let wz = -cos * f - sin * r;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }

  const sprint = (buttons & BTN_SPRINT) !== 0 && f > 0 && !s.crouch;
  const speed = (s.crouch ? CROUCH_SPEED : sprint ? SPRINT_SPEED : WALK_SPEED) * speedMul;
  const accel = s.onGround ? 60 : 12;
  const tx = wx * speed, tz = wz * speed;
  let ax = tx - s.vx, az = tz - s.vz;
  const al = Math.hypot(ax, az);
  const maxStep = accel * dt;
  if (!s.onGround && wl === 0) {
    // no ar sem input: mantém a inércia
    ax = 0; az = 0;
  } else if (al > maxStep) {
    ax = (ax / al) * maxStep; az = (az / al) * maxStep;
  }
  s.vx += ax; s.vz += az;

  if (s.onGround && buttons & BTN_JUMP && !s.crouch) {
    s.vy = JUMP_SPEED;
    s.onGround = false;
  }
  s.vy -= GRAVITY * dt;
  if (s.vy < -60) s.vy = -60;

  // horizontal
  tmp.x = s.x + s.vx * dt;
  tmp.z = s.z + s.vz * dt;
  world.collide(tmp, s.y, height, PLAYER_RADIUS);
  if (tmp.x < 2) tmp.x = 2; else if (tmp.x > WORLD_SIZE - 2) tmp.x = WORLD_SIZE - 2;
  if (tmp.z < 2) tmp.z = 2; else if (tmp.z > WORLD_SIZE - 2) tmp.z = WORLD_SIZE - 2;
  s.x = tmp.x; s.z = tmp.z;

  // vertical
  const wasGround = s.onGround;
  let ny = s.y + s.vy * dt;
  const g = world.groundAt(s.x, s.z, s.y, PLAYER_RADIUS);
  if (ny <= g) {
    ny = g; s.vy = 0; s.onGround = true;
  } else if (wasGround && s.vy <= 0 && ny - g < STEP_HEIGHT) {
    // gruda no chão ao descer ladeira/degrau
    ny = g; s.vy = 0; s.onGround = true;
  } else {
    s.onGround = false;
  }
  s.y = ny;
}

/** Direção de mira a partir de yaw/pitch. */
export function aimDir(yaw: number, pitch: number, out: { x: number; y: number; z: number }) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}
