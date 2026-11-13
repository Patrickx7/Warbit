import type { Magazine } from './inventory';
import type { RewardKind } from './rewards';
import { MAX_PLAYERS, WORLD_SIZE } from './config';
import type { VehicleState } from './vehicles';

// Mensagens binárias (alta frequência). Mensagens raras vão em JSON (texto).
export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

export const LIFE_NONE = 0;   // na loja / morto
export const LIFE_ALIVE = 1;
export const LIFE_DOWNED = 2; // caído, aguardando médico

export interface InputMsg {
  seq: number;
  buttons: number;
  buttons2: number;
  buttons3: number;
  yaw: number;
  pitch: number;
  renderTick: number; // tick do servidor que o cliente estava vendo (lag compensation)
}

export const INPUT_BYTES = 20;

export function encodeInput(m: InputMsg): ArrayBuffer {
  const buf = new ArrayBuffer(INPUT_BYTES);
  const v = new DataView(buf);
  v.setUint8(0, MSG_INPUT);
  v.setUint32(1, m.seq);
  v.setUint8(5, m.buttons);
  v.setUint8(6, m.buttons2);
  v.setFloat32(7, m.yaw);
  v.setFloat32(11, m.pitch);
  v.setUint32(15, m.renderTick);
  v.setUint8(19, m.buttons3);
  return buf;
}

export function decodeInput(v: DataView): InputMsg | null {
  if (v.byteLength < INPUT_BYTES || v.getUint8(0) !== MSG_INPUT) return null;
  const yaw = v.getFloat32(7), pitch = v.getFloat32(11);
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return null;
  return {
    seq: v.getUint32(1), buttons: v.getUint8(5), buttons2: v.getUint8(6), buttons3: v.getUint8(19),
    yaw, pitch: Math.max(-1.55, Math.min(1.55, pitch)), renderTick: v.getUint32(15),
  };
}

export interface EntityState {
  id: number;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  life: number;      // LIFE_*
  crouch: boolean;
  prone: boolean;
  sprint: boolean;
  marked: boolean;
  team: number;
  armor: number;     // 0-4
  helmet: number;    // 0-4
  pack: number;      // 0-3 (tamanho da mochila)
  weapon: number;    // índice do item na mão
  shot: number;      // contador de tiros (u8, dá a volta)
  hp: number;
  suppressed?: boolean;
}

export interface OwnState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  hp: number;
  life: number;
  ammo: number;
  reserve: number;
  flags: number;     // bit0 recarregando, bit1 no chão, bit2 agachado, bit3 cansado
  slot: number;      // 0 principal, 1 secundária
  stamina: number;   // 0..1
  stanceCd: number;  // s
}

export interface Snapshot {
  tick: number;
  ack: number;       // último input processado
  own: OwnState;
  alive: Uint8Array; // máscara de bits: quem está no campo (vivo ou caído)
  ents: EntityState[];
}

export const ALIVE_MASK_BYTES = Math.ceil(MAX_PLAYERS / 8);
const HEADER = 1 + 4 + 4 + 24 + 1 + 1 + 1 + 2 + 1 + 1 + 1 + 1 + ALIVE_MASK_BYTES + 1;
export const ENTITY_BYTES = 14;
const Y_MIN = -40, Y_RANGE = 256;
const TWO_PI = Math.PI * 2;

const qx = (x: number) => Math.max(0, Math.min(65535, Math.round((x / WORLD_SIZE) * 65535)));
const qy = (y: number) => Math.max(0, Math.min(65535, Math.round(((y - Y_MIN) / Y_RANGE) * 65535)));

export function encodeSnapshot(s: Snapshot): ArrayBuffer {
  const n = Math.min(255, s.ents.length);
  const buf = new ArrayBuffer(HEADER + n * ENTITY_BYTES);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, MSG_SNAPSHOT); o += 1;
  v.setUint32(o, s.tick); o += 4;
  v.setUint32(o, s.ack); o += 4;
  v.setFloat32(o, s.own.x); o += 4; v.setFloat32(o, s.own.y); o += 4; v.setFloat32(o, s.own.z); o += 4;
  v.setFloat32(o, s.own.vx); o += 4; v.setFloat32(o, s.own.vy); o += 4; v.setFloat32(o, s.own.vz); o += 4;
  v.setUint8(o, Math.max(0, Math.min(255, Math.ceil(s.own.hp)))); o += 1;
  v.setUint8(o, s.own.life); o += 1;
  v.setUint8(o, Math.min(255, s.own.ammo)); o += 1;
  v.setUint16(o, Math.min(65535, s.own.reserve)); o += 2;
  v.setUint8(o, s.own.flags); o += 1;
  v.setUint8(o, s.own.slot); o += 1;
  v.setUint8(o, Math.max(0, Math.min(255, Math.round(s.own.stamina * 255)))); o += 1;
  v.setUint8(o, Math.max(0, Math.min(255, Math.round(s.own.stanceCd * 200)))); o += 1;
  new Uint8Array(buf, o, ALIVE_MASK_BYTES).set(s.alive); o += ALIVE_MASK_BYTES;
  v.setUint8(o, n); o += 1;
  for (let i = 0; i < n; i++) {
    const e = s.ents[i];
    v.setUint8(o, e.id);
    v.setUint16(o + 1, qx(e.x));
    v.setUint16(o + 3, qy(e.y));
    v.setUint16(o + 5, qx(e.z));
    let yaw = e.yaw % TWO_PI; if (yaw < 0) yaw += TWO_PI;
    v.setUint8(o + 7, Math.round((yaw / TWO_PI) * 256) & 255);
    v.setInt8(o + 8, Math.max(-127, Math.min(127, Math.round((e.pitch / 1.6) * 127))));
    v.setUint8(o + 9, (e.life & 3) | (e.crouch ? 4 : 0) | ((e.team & 3) << 3) | (e.sprint ? 32 : 0) | (e.marked ? 64 : 0) | (e.prone ? 128 : 0));
    v.setUint8(o + 10, (e.armor & 7) | ((e.helmet & 7) << 3) | ((e.pack & 3) << 6));
    v.setUint8(o + 11, e.weapon);
    v.setUint8(o + 12, e.shot & 255);
    v.setUint8(o + 13, Math.max(0, Math.min(127, Math.ceil(e.hp))) | (e.suppressed ? 128 : 0));
    o += ENTITY_BYTES;
  }
  return buf;
}

export function decodeSnapshot(v: DataView): Snapshot {
  let o = 1;
  const tick = v.getUint32(o); o += 4;
  const ack = v.getUint32(o); o += 4;
  const own: OwnState = {
    x: v.getFloat32(o), y: v.getFloat32(o + 4), z: v.getFloat32(o + 8),
    vx: v.getFloat32(o + 12), vy: v.getFloat32(o + 16), vz: v.getFloat32(o + 20),
    hp: v.getUint8(o + 24), life: v.getUint8(o + 25), ammo: v.getUint8(o + 26),
    reserve: v.getUint16(o + 27), flags: v.getUint8(o + 29), slot: v.getUint8(o + 30), stamina: v.getUint8(o + 31) / 255, stanceCd: v.getUint8(o + 32) / 200,
  };
  o += 33;
  const alive = new Uint8Array(v.buffer.slice(v.byteOffset + o, v.byteOffset + o + ALIVE_MASK_BYTES)); o += ALIVE_MASK_BYTES;
  const n = v.getUint8(o); o += 1;
  const ents: EntityState[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const f = v.getUint8(o + 9), g = v.getUint8(o + 10);
    ents[i] = {
      id: v.getUint8(o),
      x: (v.getUint16(o + 1) / 65535) * WORLD_SIZE,
      y: (v.getUint16(o + 3) / 65535) * Y_RANGE + Y_MIN,
      z: (v.getUint16(o + 5) / 65535) * WORLD_SIZE,
      yaw: (v.getUint8(o + 7) / 256) * TWO_PI,
      pitch: (v.getInt8(o + 8) / 127) * 1.6,
      life: f & 3, crouch: (f & 4) !== 0, prone: (f & 128) !== 0, team: (f >> 3) & 3, sprint: (f & 32) !== 0, marked: (f & 64) !== 0,
      armor: g & 7, helmet: (g >> 3) & 7, pack: (g >> 6) & 3,
      weapon: v.getUint8(o + 11), shot: v.getUint8(o + 12), hp: v.getUint8(o + 13) & 127, suppressed: (v.getUint8(o + 13) & 128) !== 0,
    };
    o += ENTITY_BYTES;
  }
  return { tick, ack, own, alive, ents };
}

export function maskHas(mask: Uint8Array, id: number): boolean {
  return (mask[id >> 3] & (1 << (id & 7))) !== 0;
}
export function maskSet(mask: Uint8Array, id: number): void {
  mask[id >> 3] |= 1 << (id & 7);
}

// ---------- mensagens JSON ----------
export interface RosterEntry { id: number; name: string; team: number; bot: boolean; level: number }
export interface ZoneMsg { x: number; z: number; r: number }
export interface BoxMsg { id: number; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; kind: number; color: number }
export interface LootView { target: number; revision: number; name: string; weapons: string[]; ammo: number[]; magazines: Magazine[] }

export type ServerMsg =
  | { t: 'welcome'; id: number; team: number; seed: number; token: string; tick: number; roster: RosterEntry[]; builds: BoxMsg[] }
  | { t: 'roster'; roster: RosterEntry[] }
  | { t: 'state'; phase: 'warmup' | 'live' | 'end'; timeLeft: number; scores: number[]; presence: number[]; control: number; cz: ZoneMsg; hz: ZoneMsg; hzIn: number; fobs: { team: number; x: number; z: number; hp: number }[]; winner: number; counts: number[]; drops: { id: number; x: number; y: number; z: number }[] }
  | { t: 'profile'; cash: number; xp: number; level: number; lifeProfit: number; kills: number; deaths: number }
  | { t: 'reward'; kind: RewardKind; label: string; cash: number; xp: number }
  | { t: 'kill'; killer: number; victim: number; weapon: string; head: boolean; downed: boolean }
  | { t: 'hit'; dmg: number; head: boolean; kill: boolean }
  | { t: 'hurt'; x: number; z: number; dmg: number }
  | { t: 'life'; life: number; reason?: string; downLeft?: number; wait?: number; tools?: Record<string, number> }
  | { t: 'purchase'; amount: number; kind?: 'weapon' | 'gear' | 'vehicle' }
  | { t: 'shopError'; error: string }
  | { t: 'build'; add?: BoxMsg[]; remove?: number[] }
  | { t: 'nade'; id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; fuse: number }
  | { t: 'boom'; x: number; y: number; z: number }
  | { t: 'board'; rows: { id: number; kills: number; deaths: number; score: number }[] }
  | { t: 'msg'; text: string }
  | { t: 'pong'; c: number }
  | { t: 'vehicles'; list: VehicleState[] }
  | { t: 'inventory'; items: string[]; cargo: (Magazine | null)[]; ammo: number[]; purchased?: boolean }
  | { t: 'lootView'; body: LootView | null }
  | { t: 'vehicleBoom'; id: number; x: number; y: number; z: number };

export type ClientMsg =
  | { t: 'hello'; name: string; token?: string; team?: number }
  | { t: 'spawn'; items: string[] }
  | { t: 'buyEquipment'; items: string[]; magazines: { slot: number; weapon: string }[] }
  | { t: 'discardMagazine'; slot: number }
  | { t: 'moveMagazine'; from: number; to: number }
  | { t: 'inventory' }
  | { t: 'giveup' }
  | { t: 'switchTeam'; team: number }
  | { t: 'loot' }
  | { t: 'inspectLoot' }
  | { t: 'swapLootWeapon'; target: number; revision: number; slot: number }
  | { t: 'board' }
  | { t: 'ping'; c: number }
  | { t: 'buyVehicle'; vehicleType: string }
  | { t: 'mountVehicle'; vehicleId: number }
  | { t: 'dismountVehicle' };
