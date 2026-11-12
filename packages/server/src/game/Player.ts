import { BOT_START_CASH, LIFE_NONE, levelFromXp, newMoveState, type InputMsg, type Loadout, type MoveState } from '@warbit/shared';
import type { Profile } from '../db';
import type { BotBrain } from './Bots';

export interface Conn {
  send(data: string | ArrayBuffer): void;
}

export const HIST = 32; // ticks de histórico para lag compensation (~1 s)

export class Player {
  name = '';
  bot = true;
  conn: Conn | null = null;
  profile: Profile | null = null;
  brain: BotBrain | null = null;

  cash = BOT_START_CASH;
  xp = 0;
  kills = 0;
  deaths = 0;
  points = 0;
  lifeProfit = 0;

  life = LIFE_NONE;
  ms: MoveState = newMoveState();
  yaw = 0;
  pitch = 0;
  hp = 0;
  sprinting = false;

  loadout: Loadout | null = null;
  slot = 0;
  ammo = [0, 0];
  reserve = [0, 0];
  reloadEnd = 0;
  nextFire = 0;
  shot = 0;
  frags = 0;
  medbags = 0;
  builds = 0;
  hasRevive = false;
  hasDefib = false;
  hasMark = false;
  hasFob = false;
  lastFireTick = -99999;
  maxReserve = [0, 0];
  lastAttacker = -1;
  healReady = 0;
  markReady = 0;

  simTime = 0;
  budget = 0;
  inputs: InputMsg[] = [];
  ack = 0;
  prevB = 0;
  prevB2 = 0;
  renderTick = 0;

  lastDamageTick = -99999;
  damagers = new Map<number, number>();
  downUntil = 0;
  reviveProg = 0;
  reviveTick = 0;
  markedUntil = 0;
  markedTeam = -1;
  markedBy = -1;
  presenceAcc = 0;
  respawnAt = 0;
  profileDirty = false;
  saveDirty = false;

  readonly hx = new Float32Array(HIST);
  readonly hy = new Float32Array(HIST);
  readonly hz = new Float32Array(HIST);
  readonly hc = new Uint8Array(HIST); // 0 fora, 1 em pé, 2 agachado, 3 caído

  constructor(readonly id: number, readonly team: number) {}

  get level(): number {
    return levelFromXp(this.xp);
  }
}
