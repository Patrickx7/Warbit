import {
  CROUCH_EYE_HEIGHT, CROUCH_HEIGHT, CROUCH_SPEED, EYE_HEIGHT, GRAVITY, JUMP_SPEED, PLAYER_HEIGHT, PLAYER_RADIUS, PRONE_EYE_HEIGHT,
  PRONE_HEIGHT, PRONE_SPEED, SPRINT_SPEED, STAMINA_DRAIN, STAMINA_REGEN, STAMINA_RESUME, STEP_HEIGHT, WALK_SPEED, WORLD_SIZE,
} from './config';
import type { World } from './world';

// Botões (byte 1)
export const BTN_FWD = 1, BTN_BACK = 2, BTN_LEFT = 4, BTN_RIGHT = 8, BTN_JUMP = 16, BTN_CROUCH = 32, BTN_SPRINT = 64, BTN_FIRE = 128;
// Botões (byte 2)
export const BTN2_RELOAD = 1, BTN2_USE = 2, BTN2_ADS = 4, BTN2_SECONDARY = 8, BTN2_NADE = 16, BTN2_HEAL = 32, BTN2_BUILD = 64, BTN2_MARK = 128;
// Botões (byte 3)
export const BTN3_FOB = 1, BTN3_PRONE = 2;

export interface MoveState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  onGround: boolean;
  crouch: boolean;
  prone: boolean;
  stanceCd: number; // s: tempo de transição entre posturas (anda devagar enquanto troca)
  stamina: number; // 0..1
  tired: boolean;
}

export function newMoveState(x = 0, y = 0, z = 0): MoveState {
  return { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, crouch: false, prone: false, stanceCd: 0, stamina: 1, tired: false };
}

export function eyeHeight(s: { crouch: boolean; prone: boolean }): number {
  return s.prone ? PRONE_EYE_HEIGHT : s.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
}
export function bodyHeight(s: { crouch: boolean; prone: boolean }): number {
  return s.prone ? PRONE_HEIGHT : s.crouch ? CROUCH_HEIGHT : PLAYER_HEIGHT;
}

const tmp = { x: 0, z: 0 };
const HEIGHTS = [PLAYER_HEIGHT, CROUCH_HEIGHT, PRONE_HEIGHT];

/**
 * Um passo determinístico do controlador de personagem.
 * Roda IGUAL no cliente (predição) e no servidor (autoridade).
 */
export function stepMove(s: MoveState, buttons: number, yaw: number, world: World, dt: number, speedMul = 1, buttons3 = 0): void {
  // ---- postura: em pé / agachado / deitado (levantar exige espaço em cima)
  const cur = s.prone ? 2 : s.crouch ? 1 : 0;
  const want = (buttons3 & BTN3_PRONE) !== 0 ? 2 : (buttons & BTN_CROUCH) !== 0 ? 1 : 0;
  if (want !== cur) {
    let next = want;
    if (want < cur) {
      next = cur;
      for (let st = cur - 1; st >= want; st--) {
        tmp.x = s.x; tmp.z = s.z;
        if (world.collide(tmp, s.y, HEIGHTS[st], PLAYER_RADIUS - 0.06)) break;
        next = st;
      }
    }
    if (next !== cur) { s.crouch = next === 1; s.prone = next === 2; s.stanceCd = 0.45; }
  }
  if (s.stanceCd > 0) s.stanceCd = Math.max(0, s.stanceCd - dt);
  const low = s.crouch || s.prone;
  const height = s.prone ? PRONE_HEIGHT : s.crouch ? CROUCH_HEIGHT : PLAYER_HEIGHT;

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

  const wantSprint = (buttons & BTN_SPRINT) !== 0 && f > 0 && !low;
  if (s.tired && s.stamina >= STAMINA_RESUME) s.tired = false;
  const sprint = wantSprint && !s.tired && s.stamina > 0;
  if (sprint && wl > 0) {
    s.stamina -= STAMINA_DRAIN * dt;
    if (s.stamina <= 0) { s.stamina = 0; s.tired = true; }
  } else if (s.stamina < 1) {
    s.stamina = Math.min(1, s.stamina + STAMINA_REGEN * dt * (wl > 0 ? 0.6 : 1));
  }
  const base = s.prone ? PRONE_SPEED : s.crouch ? CROUCH_SPEED : sprint ? SPRINT_SPEED : WALK_SPEED;
  const speed = base * speedMul * (s.stanceCd > 0 ? 0.4 : 1);
  const accel = s.onGround ? 28 : 6;
  const tx = wx * speed, tz = wz * speed;
  let ax = tx - s.vx, az = tz - s.vz;
  const al = Math.hypot(ax, az);
  const maxStep = accel * dt;
  if (!s.onGround && wl === 0) {
    ax = 0; az = 0; // no ar sem input: mantém a inércia
  } else if (al > maxStep) {
    ax = (ax / al) * maxStep; az = (az / al) * maxStep;
  }
  s.vx += ax; s.vz += az;

  if (s.onGround && buttons & BTN_JUMP && !low) {
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
