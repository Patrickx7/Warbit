import {
  BTN2_ADS, BTN2_BUILD, BTN2_HEAL, BTN2_MARK, BTN2_NADE, BTN2_USE, BTN_CROUCH, BTN_FIRE, BTN_FWD, BTN_JUMP, BTN_LEFT, BTN_RIGHT,
  BTN_SPRINT, CROUCH_EYE_HEIGHT, EYE_HEIGHT, LIFE_ALIVE, LIFE_DOWNED, LIFE_NONE, PRESETS, buildLoadout,
} from '@warbit/shared';
import type { Match } from './Match';
import type { Player } from './Player';

const CALLSIGNS = ['Lobo', 'Falcão', 'Onça', 'Jacaré', 'Carcará', 'Tubarão', 'Cobra', 'Gavião', 'Pantera', 'Touro', 'Javali', 'Coruja', 'Urso', 'Raposa', 'Tigre', 'Águia', 'Sucuri', 'Piranha', 'Guará', 'Harpia'];

export function botName(id: number): string {
  return `${CALLSIGNS[id % CALLSIGNS.length]}-${String(10 + ((id * 37) % 90))}`;
}

function angDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function gauss(): number {
  return Math.random() + Math.random() + Math.random() - 1.5;
}

/** IA simples: vai para a zona, enfrenta quem vê, usa as ferramentas que comprou. Produz inputs como um jogador. */
export class BotBrain {
  skill = 0.3 + Math.random() * 0.55;
  targetId = -1;
  seenAt = 0;
  nextThink = 0;
  goalX = 0; goalZ = 0; goalUntil = 0;
  reviveId = -1;
  strafe = 1; strafeUntil = 0;
  crouchUntil = 0;
  stuckX = 0; stuckZ = 0; stuckAt = 0; wantedMove = false;
  avoidUntil = 0; avoidDir = 1;
  aimYaw = 0; aimPitch = 0;
  errYaw = 0; errPitch = 0; nextErr = 0;
  markAt = 0;
  seq = 0;

  constructor(readonly id: number) {}

  private trySpawn(m: Match, p: Player) {
    const role = 1 + ((this.id + Math.floor(Math.random() * 2)) % (PRESETS.length - 1));
    const tries = [PRESETS[role].items, ['fuzil_leve', 'pistola', 'blind_1'], PRESETS[0].items];
    for (const items of tries) {
      const r = buildLoadout(items, 99, p.cash);
      if (!r.ok) continue;
      // bots guardam uma reserva para não quebrar
      if (r.loadout.cost > 0 && p.cash - r.loadout.cost < 500 && items !== tries[2]) continue;
      const err = m.spawn(p, items, Math.random() < 0.8 ? 'forward' : 'base');
      if (!err) {
        this.aimYaw = p.yaw; this.aimPitch = 0; this.targetId = -1; this.goalUntil = 0; this.reviveId = -1;
        this.stuckX = p.ms.x; this.stuckZ = p.ms.z; this.stuckAt = m.tick;
        return;
      }
      break;
    }
    p.respawnAt = m.tick + 60;
  }

  private pickTarget(m: Match, p: Player) {
    const sniper = p.loadout?.primary.weapon?.cls === 'sniper';
    const range = sniper ? 330 : 160;
    const r2 = range * range;
    const ex = p.ms.x, ey = p.ms.y + (p.ms.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT), ez = p.ms.z;
    // mantém o alvo atual se ainda o vê
    const cur = this.targetId >= 0 ? m.players[this.targetId] : null;
    if (cur && cur.life === LIFE_ALIVE && (cur.ms.x - ex) ** 2 + (cur.ms.z - ez) ** 2 < r2 && m.world.canSee(ex, ey, ez, cur.ms.x, cur.ms.y + 1.1, cur.ms.z)) return;
    let a: Player | null = null, b: Player | null = null, c: Player | null = null;
    let da = Infinity, db = Infinity, dc = Infinity;
    for (const e of m.players) {
      if (e.team === p.team || e.life !== LIFE_ALIVE) continue;
      const d = (e.ms.x - ex) ** 2 + (e.ms.z - ez) ** 2;
      if (d > r2) continue;
      if (d < da) { c = b; dc = db; b = a; db = da; a = e; da = d; }
      else if (d < db) { c = b; dc = db; b = e; db = d; }
      else if (d < dc) { c = e; dc = d; }
    }
    this.targetId = -1;
    for (const e of [a, b, c]) {
      if (e && m.world.canSee(ex, ey, ez, e.ms.x, e.ms.y + 1.1, e.ms.z)) {
        this.targetId = e.id;
        this.seenAt = m.tick;
        break;
      }
    }
  }

  private pickGoal(m: Match, p: Player) {
    const tick = m.tick;
    if (p.hasRevive || p.hasDefib) {
      let best: Player | null = null, bd = 45 * 45;
      for (const e of m.players) {
        if (e.team !== p.team || e.life !== LIFE_DOWNED) continue;
        const d = (e.ms.x - p.ms.x) ** 2 + (e.ms.z - p.ms.z) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        this.reviveId = best.id; this.goalX = best.ms.x; this.goalZ = best.ms.z; this.goalUntil = tick + 90;
        return;
      }
    }
    this.reviveId = -1;
    const reached = (this.goalX - p.ms.x) ** 2 + (this.goalZ - p.ms.z) ** 2 < 9;
    if (tick < this.goalUntil && !reached) return;
    if (reached && tick < this.goalUntil && Math.random() < 0.6) return; // segura a posição um pouco
    const zone = Math.random() < 0.6 ? m.hz : m.cz;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * zone.r * 0.85;
    this.goalX = zone.x + Math.cos(a) * r;
    this.goalZ = zone.z + Math.sin(a) * r;
    this.goalUntil = tick + 180 + Math.floor(Math.random() * 260);
  }

  think(m: Match, p: Player) {
    const tick = m.tick;
    if (p.life === LIFE_NONE) {
      if (tick >= p.respawnAt && m.phase !== 'end') this.trySpawn(m, p);
      return;
    }
    if (p.life !== LIFE_ALIVE || !p.loadout) return;

    if (tick >= this.nextThink) {
      this.nextThink = tick + 8 + (this.id % 5);
      this.pickTarget(m, p);
      this.pickGoal(m, p);
    }

    let buttons = 0, b2 = 0;
    const w = p.loadout.primary.weapon!;
    const tgt = this.targetId >= 0 ? m.players[this.targetId] : null;
    let wantYaw: number, wantPitch = 0;
    const turn = 5.5 / 30;

    if (tgt && tgt.life === LIFE_ALIVE) {
      const dx = tgt.ms.x - p.ms.x, dz = tgt.ms.z - p.ms.z;
      const dy = tgt.ms.y + (tgt.ms.crouch ? 0.8 : 1.15) - (p.ms.y + (p.ms.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT));
      const dist = Math.hypot(dx, dz);
      if (tick >= this.nextErr) {
        this.nextErr = tick + 10 + Math.floor(Math.random() * 8);
        const e = 0.01 + (1 - this.skill) * 0.04;
        this.errYaw = gauss() * e; this.errPitch = gauss() * e * 0.6;
      }
      wantYaw = Math.atan2(-dx, -dz) + this.errYaw;
      wantPitch = Math.atan2(dy, dist) + this.errPitch;
      const dyaw = angDiff(wantYaw, this.aimYaw);
      const reaction = 9 + (1 - this.skill) * 20;
      if (tick - this.seenAt > reaction && Math.abs(dyaw) < 0.07) {
        if (w.auto) { if ((tick + this.id) % 20 < 13) buttons |= BTN_FIRE; }
        else if (tick % 2 === 0) buttons |= BTN_FIRE;
      }
      if (dist > 22) b2 |= BTN2_ADS;
      const prefer = w.cls === 'sniper' ? 180 : w.cls === 'smg' || w.cls === 'shotgun' ? 22 : 60;
      if (tick >= this.strafeUntil) { this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeUntil = tick + 18 + Math.floor(Math.random() * 30); if (dist > 35 && Math.random() < 0.3 + this.skill * 0.3) this.crouchUntil = tick + 40; }
      if (dist > prefer) { buttons |= BTN_FWD; if (dist > prefer * 2) buttons |= BTN_SPRINT; }
      else if (tick < this.crouchUntil) buttons |= BTN_CROUCH;
      else buttons |= this.strafe > 0 ? BTN_RIGHT : BTN_LEFT;
      if (p.hasMark && tick >= this.markAt && Math.abs(dyaw) < 0.04) { b2 |= BTN2_MARK; this.markAt = tick + 300; }
      if (p.frags > 0 && dist > 12 && dist < 34 && Math.random() < 0.004) { b2 |= BTN2_NADE; }
      this.wantedMove = false;
    } else {
      const dx = this.goalX - p.ms.x, dz = this.goalZ - p.ms.z;
      const dist = Math.hypot(dx, dz);
      wantYaw = dist > 0.5 ? Math.atan2(-dx, -dz) : this.aimYaw;
      const reviving = this.reviveId >= 0 && m.players[this.reviveId].life === LIFE_DOWNED;
      if (reviving && dist < 2) {
        b2 |= BTN2_USE;
        this.wantedMove = false;
      } else if (dist > 2.5) {
        this.wantedMove = true;
        if (tick < this.avoidUntil) {
          buttons |= (this.avoidDir > 0 ? BTN_RIGHT : BTN_LEFT) | BTN_FWD;
        } else {
          buttons |= BTN_FWD;
          if (dist > 10 && Math.abs(angDiff(wantYaw, this.aimYaw)) < 0.6) buttons |= BTN_SPRINT;
        }
      } else {
        this.wantedMove = false;
        if ((tick + this.id * 7) % 200 < 120) buttons |= BTN_CROUCH;
        // olha em volta enquanto segura a posição
        wantYaw = this.aimYaw + Math.sin((tick + this.id * 13) / 40) * 0.05;
        if (p.builds > 0 && Math.random() < 0.003) b2 |= BTN2_BUILD;
      }
      if (tick - this.stuckAt >= 20) {
        const moved = Math.hypot(p.ms.x - this.stuckX, p.ms.z - this.stuckZ);
        if (this.wantedMove && moved < 0.7) {
          this.avoidUntil = tick + 22 + Math.floor(Math.random() * 25);
          this.avoidDir = Math.random() < 0.5 ? 1 : -1;
          buttons |= BTN_JUMP;
        }
        this.stuckX = p.ms.x; this.stuckZ = p.ms.z; this.stuckAt = tick;
      }
    }

    if (p.medbags > 0 && p.hp < 50 && tick % 30 === 0) b2 |= BTN2_HEAL;

    const dyaw = angDiff(wantYaw, this.aimYaw);
    this.aimYaw += Math.max(-turn, Math.min(turn, dyaw));
    this.aimPitch += Math.max(-turn, Math.min(turn, wantPitch - this.aimPitch));

    m.processInput(p, { seq: ++this.seq, buttons, buttons2: b2, yaw: this.aimYaw, pitch: this.aimPitch, renderTick: tick });
  }
}
