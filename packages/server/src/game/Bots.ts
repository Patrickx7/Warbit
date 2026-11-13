import {
  BTN2_ADS, BTN2_BUILD, BTN2_HEAL, BTN2_MARK, BTN2_NADE, BTN2_RELOAD, BTN2_SECONDARY, BTN2_USE, BTN3_FOB, BTN_CROUCH, BTN_FIRE, BTN_FWD, BTN_JUMP,
  BTN_LEFT, BTN_RIGHT, BTN_SPRINT, BTN_BACK, BTN3_PRONE, WORLD_SIZE, eyeHeight, LIFE_ALIVE, LIFE_DOWNED, LIFE_NONE, PRESETS, buildLoadout,
  VEHICLE_BY_ID, getVendorPos, type VehicleState,
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
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/**
 * Dentro do muro da base (quadrado de ±47 m com portões no meio de cada lado): devolve o próximo ponto para sair
 * pelo portão mais alinhado com o destino. Primeiro alinha com o portão, depois atravessa. Fora da base devolve o destino.
 */
function gateWaypoint(base: { x: number; z: number }, x: number, z: number, tx: number, tz: number, lane = 4): { x: number; z: number } {
  const bx = x - base.x, bz = z - base.z;
  if (!(Math.abs(bx) < 47 && Math.abs(bz) < 47 && Math.hypot(tx - base.x, tz - base.z) > 50)) return { x: tx, z: tz };
  const gx = tx - base.x, gz = tz - base.z;
  const alongX = Math.abs(gx) > Math.abs(gz);
  const gate = alongX ? Math.sign(gx) * 46 : Math.sign(gz) * 46;
  const inLane = alongX ? Math.abs(bz) < lane : Math.abs(bx) < lane;
  if (inLane) return alongX ? { x: base.x + gate * 1.25, z: base.z } : { x: base.x, z: base.z + gate * 1.25 };
  // alinha: vai até a linha do portão sem se aproximar do muro
  return alongX ? { x: base.x + Math.max(-30, Math.min(30, bx)), z: base.z } : { x: base.x, z: base.z + Math.max(-30, Math.min(30, bz)) };
}

/** quantos bots já estão indo reviver cada caído (evita 6 bots no mesmo corpo) */
const reviveClaims = new Map<number, { by: number; until: number }[]>();

/**
 * IA dos bots — produz inputs como um jogador:
 * nasce na base, vai até a zona procurando cobertura, enfrenta quem vê (campo de visão limitado),
 * revida quando leva tiro, revive companheiros caídos, ergue FOB e usa as ferramentas que comprou.
 */
export class BotBrain {
  skill = 0.3 + Math.random() * 0.55;
  targetId = -1;
  seenAt = 0;
  lastSeenAt = -999;
  nextThink = 0;
  goalX = 0; goalZ = 0; goalUntil = 0; holding = false;
  reviveId = -1;
  strafe = 1; strafeUntil = 0;
  crouchUntil = 0;
  steer = 0; steerUntil = 0;
  stuckX = 0; stuckZ = 0; stuckAt = 0;
  aimYaw = 0; aimPitch = 0;
  errYaw = 0; errPitch = 0; nextErr = 0;
  markAt = 0; fobAt = 0; buildAt = 0; proneUntil = 0;
  lookYaw = 0;
  seq = 0;
  /** Metade de cada time (10 de 20) vai de quadriciclo: 5 compram e pilotam, 5 vão de garupa.
   *  Dois pilotos por time vão direto para a Hot Zone; os outros entram na Control Zone. */
  readonly rider: boolean;
  readonly buyer: boolean;
  readonly toHot: boolean;
  spawnedAt = 0;
  rideStart = 0; reverseUntil = 0; rideStuckX = 0; rideStuckZ = 0; rideStuckAt = 0;
  rideStuckCount = 0; destX = 0; destZ = 0; hasDest = false;
  avoidDir = 0; avoidUntil = 0; avoidSide = 1; turnSide = 1;
  hotPref = Math.random();
  hasFinal = false; finalX = 0; finalZ = 0; // destino final enquanto vai por um ponto de flanco

  constructor(readonly id: number) {
    const slot = Math.floor(id / 3);
    this.rider = slot < 10;
    this.buyer = this.rider && slot % 2 === 0;
    this.toHot = slot === 0 || slot === 2;
  }

  // ---------- compra ----------
  private trySpawn(m: Match, p: Player) {
    const role = 1 + ((this.id + Math.floor(Math.random() * 3)) % (PRESETS.length - 1));
    const tries = [PRESETS[role].items, ['fuzil_padrao', 'pistola', 'blind_1', 'reanimador'], ['fuzil_leve', 'pistola', 'reanimador'], PRESETS[0].items];
    for (const items of tries) {
      const r = buildLoadout(items, 99, p.cash);
      if (!r.ok) continue;
      // bots guardam uma reserva para não quebrar
      if (r.loadout.cost > 0 && p.cash - r.loadout.cost < 400 && items !== tries[3]) continue;
      if (!m.spawn(p, items)) {
        this.aimYaw = p.yaw; this.aimPitch = 0; this.targetId = -1; this.goalUntil = 0; this.reviveId = -1; this.holding = false; this.hasFinal = false;
        this.stuckX = p.ms.x; this.stuckZ = p.ms.z; this.stuckAt = m.tick; this.spawnedAt = m.tick;
        return;
      }
      break;
    }
    p.respawnAt = m.tick + 60;
  }

  // ---------- percepção ----------
  private eye(p: Player) { return p.ms.y + eyeHeight(p.ms); }

  private canSpot(m: Match, p: Player, e: Player, alerted: boolean): boolean {
    const dx = e.ms.x - p.ms.x, dz = e.ms.z - p.ms.z;
    const d = Math.hypot(dx, dz);
    // campo de visão: ~200° à frente; de perto (ou quando acabou de levar tiro) percebe em volta
    if (d > 14 && !alerted && Math.abs(angDiff(yawTo(dx, dz), this.aimYaw)) > 1.75) return false;
    // dentro de uma moita: só é notado de perto, e o alcance cai se estiver parado/baixo.
    // Atirar revela por 3 s; folhagem não esconde de quem está colado (< 4 m).
    if (m.world.inBush(e.ms.x, e.ms.z) && m.tick - e.lastFireTick > 90) {
      const moving = Math.hypot(e.ms.vx, e.ms.vz) > 1.5;
      const lim = e.ms.prone ? (moving ? 12 : 4) : e.ms.crouch ? (moving ? 22 : 8) : (moving ? 35 : 20);
      if (d > Math.max(4, lim)) return false;
    }
    // agachado e longe é mais difícil de notar
    if ((e.ms.crouch || e.ms.prone) && d > (e.ms.prone ? 60 : 120) && Math.random() < (e.ms.prone ? 0.75 : 0.5)) return false;
    return m.world.canSee(p.ms.x, this.eye(p), p.ms.z, e.ms.x, e.ms.y + (e.ms.prone ? 0.3 : e.ms.crouch ? 0.9 : 1.3), e.ms.z);
  }

  private pickTarget(m: Match, p: Player) {
    const sniper = p.loadout?.primary.weapon?.cls === 'sniper';
    const range = sniper ? 330 : 170;
    const r2 = range * range;
    const alerted = m.tick - p.lastDamageTick < 45;
    const cur = this.targetId >= 0 ? m.players[this.targetId] : null;
    if (cur && cur.team !== p.team && cur.life === LIFE_ALIVE && (cur.ms.x - p.ms.x) ** 2 + (cur.ms.z - p.ms.z) ** 2 < r2 && this.canSpot(m, p, cur, true)) {
      this.lastSeenAt = m.tick;
      return;
    }
    // quem atirou em mim tem prioridade
    if (alerted && p.lastAttacker >= 0) {
      const a = m.players[p.lastAttacker];
      if (a.life === LIFE_ALIVE && a.team !== p.team) {
        if (this.canSpot(m, p, a, true)) { this.setTarget(m, a); return; }
        // não vejo, mas viro para o lado de onde veio o tiro
        this.lookYaw = yawTo(a.ms.x - p.ms.x, a.ms.z - p.ms.z);
      }
    }
    const cand: { e: Player; d: number }[] = [];
    for (const e of m.players) {
      if (e.team === p.team || e.life !== LIFE_ALIVE) continue;
      const d = (e.ms.x - p.ms.x) ** 2 + (e.ms.z - p.ms.z) ** 2;
      if (d < r2) cand.push({ e, d });
    }
    cand.sort((a, b) => a.d - b.d);
    this.targetId = -1;
    // Inimigos próximos atrás de paredes não podem ocultar outros alvos visíveis.
    for (let i = 0; i < cand.length; i++) {
      if (this.canSpot(m, p, cand[i].e, alerted)) { this.setTarget(m, cand[i].e); return; }
    }
  }

  private setTarget(m: Match, e: Player) {
    if (this.targetId !== e.id) this.seenAt = m.tick;
    this.targetId = e.id;
    this.lastSeenAt = m.tick;
  }

  // ---------- objetivos ----------
  private pickRevive(m: Match, p: Player): boolean {
    if (!p.hasRevive && !p.hasDefib) return false;
    const medic = p.hasDefib || p.medbags > 0;
    const maxD = medic ? 90 : 60;
    // se tem inimigo à vista e perto, primeiro lutar (exceto médico)
    if (this.targetId >= 0 && !medic) {
      const t = m.players[this.targetId];
      if (Math.hypot(t.ms.x - p.ms.x, t.ms.z - p.ms.z) < 30) return false;
    }
    let best: Player | null = null, bd = maxD * maxD;
    for (const e of m.players) {
      if (e.team !== p.team || e.life !== LIFE_DOWNED) continue;
      const left = e.downUntil - m.tick;
      const d = (e.ms.x - p.ms.x) ** 2 + (e.ms.z - p.ms.z) ** 2;
      // chega a tempo? (andando ~5 m/s + 3 s de reanimação)
      if (Math.sqrt(d) / 5 + 3 > left / 30) continue;
      const claims = (reviveClaims.get(e.id) ?? []).filter((c) => c.until > m.tick && c.by !== this.id);
      if (claims.length >= 2) continue;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return false;
    const list = (reviveClaims.get(best.id) ?? []).filter((c) => c.until > m.tick && c.by !== this.id);
    list.push({ by: this.id, until: m.tick + 60 });
    reviveClaims.set(best.id, list);
    this.reviveId = best.id;
    this.goalX = best.ms.x; this.goalZ = best.ms.z; this.goalUntil = m.tick + 60; this.holding = false;
    return true;
  }

  private pickGoal(m: Match, p: Player) {
    const tick = m.tick;
    if (this.hotPref < .75 && !this.hasFinal && Math.hypot(this.goalX - m.hz.x, this.goalZ - m.hz.z) > m.hz.r * .8) this.goalUntil = 0;
    if (this.pickRevive(m, p)) return;
    this.reviveId = -1;
    // sem munição nenhuma: recua até a FOB do time (ou a base) para reabastecer
    if (this.outOfAmmo(p)) {
      const f = m.fobs[p.team], b = m.world.bases[p.team];
      this.goalX = f ? f.x + 3 : b.x; this.goalZ = f ? f.z + 3 : b.z;
      this.goalUntil = tick + 60; this.holding = false; this.hasFinal = false;
      return;
    }
    // indo por um ponto de flanco: chegou (ou demorou demais)? segue para o destino final
    if (this.hasFinal) {
      const near = (this.goalX - p.ms.x) ** 2 + (this.goalZ - p.ms.z) ** 2 < 100;
      if (near || tick >= this.goalUntil) {
        this.goalX = this.finalX; this.goalZ = this.finalZ; this.hasFinal = false; this.holding = false;
        this.goalUntil = tick + 30 * (15 + Math.floor(Math.random() * 25));
      }
      return;
    }
    const reached = (this.goalX - p.ms.x) ** 2 + (this.goalZ - p.ms.z) ** 2 < 4;
    if (reached) this.holding = true;
    if (tick < this.goalUntil && !(this.holding && tick > this.goalUntil - 30)) return;
    // 75% dos bots disputam a Hot Zone (cobertura mais perto dela); o resto segura o restante da Control Zone
    const cz = m.cz, hz = m.hz, base = m.world.bases[p.team];
    const wantHot = this.hotPref < 0.75;
    let best: { x: number; z: number } | null = null, bestScore = Infinity;
    for (let i = 0; i < 14 && m.cover.length; i++) {
      const c = m.cover[Math.floor(Math.random() * m.cover.length)];
      const dh = Math.hypot(c.x - hz.x, c.z - hz.z);
      const db = Math.hypot(c.x - base.x, c.z - base.z);
      const score = wantHot ? dh + Math.random() * 25 : db * 0.4 + Math.abs(Math.hypot(c.x - cz.x, c.z - cz.z) - cz.r * 0.55) + Math.random() * 30;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    if (!best || (wantHot && Math.hypot(best.x - hz.x, best.z - hz.z) > hz.r * .8)) {
      const c = wantHot ? hz : cz;
      for (let i = 0; i < 32; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * c.r * .8;
        const candidate = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
        if (!m.world.blockedAt(candidate.x, candidate.z)) { best = candidate; break; }
      }
      best ??= { x: c.x, z: c.z };
    }
    this.holding = false;
    // Quem está longe da zona contorna: passa antes por um ponto de flanco num lado aleatório,
    // então a ofensiva chega de várias direções e não todo mundo pela mesma estrada.
    const dzone = Math.hypot(p.ms.x - cz.x, p.ms.z - cz.z);
    if (dzone > cz.r + 80 && Math.random() < 0.7) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const ang = Math.atan2(p.ms.z - cz.z, p.ms.x - cz.x) + side * (0.5 + Math.random() * 1.2);
      const R = cz.r + 50 + Math.random() * 70;
      this.finalX = best.x; this.finalZ = best.z; this.hasFinal = true;
      this.goalX = Math.max(25, Math.min(WORLD_SIZE - 25, cz.x + Math.cos(ang) * R));
      this.goalZ = Math.max(25, Math.min(WORLD_SIZE - 25, cz.z + Math.sin(ang) * R));
      this.goalUntil = tick + 30 * 70;
    } else {
      this.goalX = best.x; this.goalZ = best.z;
      this.goalUntil = tick + 30 * (12 + Math.floor(Math.random() * 25));
    }
  }

  private outOfAmmo(p: Player): boolean {
    return p.ammo[0] === 0 && p.reserve[0] === 0 && p.ammo[1] === 0 && p.reserve[1] === 0;
  }

  // ---------- navegação ----------
  /** desvia de obstáculos testando raios na altura do joelho */
  private steerAround(m: Match, p: Player, yaw: number): number {
    const y = p.ms.y + 0.8;
    const free = (a: number, len: number) => m.world.raycast(p.ms.x, y, p.ms.z, -Math.sin(a), 0, -Math.cos(a), len) >= len - 0.05;
    if (free(yaw, 2.4)) return yaw;
    const order = this.steer >= 0 ? [0.6, -0.6, 1.1, -1.1, 1.6, -1.6, 2.3, -2.3] : [-0.6, 0.6, -1.1, 1.1, -1.6, 1.6, -2.3, 2.3];
    for (const o of order) if (free(yaw + o, 2.6)) { this.steer = o; this.steerUntil = m.tick + 20; return yaw + o; }
    return yaw + Math.PI;
  }

  // ---------- quadriciclo ----------
  private send(m: Match, p: Player, buttons: number, yaw: number, pitch = 0) {
    this.aimYaw = yaw; this.aimPitch = pitch;
    m.processInput(p, { seq: ++this.seq, buttons, buttons2: 0, buttons3: 0, yaw, pitch, renderTick: m.tick });
  }

  /** Bots "rider": pegam um quadriciclo na base e vão até a Hot Zone. Devolve true quando o bot está ocupado com isso. */
  private rideVehicle(m: Match, p: Player): boolean {
    const tick = m.tick;
    if (p.vehicleId !== -1) {
      const v = m.vehicles.get(p.vehicleId);
      if (!v) { p.vehicleId = -1; return false; }
      if (v.driverId !== p.id) { this.send(m, p, 0, v.yaw); return true; } // garupa: só segue viagem
      if (v.passengerId === -1 && tick - this.rideStart < 30 * 8 && m.players.some((q) => q.bot && q.team === p.team && q.life === LIFE_ALIVE && q.vehicleId === -1
        && q.brain?.rider && !q.brain.buyer && Math.hypot(q.ms.x - v.x, q.ms.z - v.z) < 60)) {
        this.rideStuckAt = tick; this.rideStuckX = v.x; this.rideStuckZ = v.z; // esperando a garupa não é "empacado"
        this.send(m, p, BTN_JUMP, v.yaw); return true;
      }
      // destino: Hot Zone (2 pilotos por time) ou um ponto dentro da Control Zone, do lado de onde o time vem
      if (!this.hasDest) this.pickRideDest(m, p);
      const tx = this.toHot ? m.hz.x : this.destX, tz = this.toHot ? m.hz.z : this.destZ;
      const dDest = Math.hypot(tx - v.x, tz - v.z);
      const inCz = Math.hypot(v.x - m.cz.x, v.z - m.cz.z) < m.cz.r * 0.75;
      const arrived = this.toHot ? dDest < 40 : dDest < 15 || inCz;
      if (arrived || this.rideStuckCount >= 4 || tick - this.rideStart > 30 * 90) { this.leaveVehicle(m, p); return false; }
      this.send(m, p, this.driveButtons(m, p, v, tx, tz), v.yaw);
      return true;
    }
    if (!this.rider || m.phase === 'end' || tick - this.spawnedAt > 30 * 25) return false; // demorou: vai a pé
    const base = m.world.bases[p.team];
    if (Math.hypot(p.ms.x - base.x, p.ms.z - base.z) > 75) return false;
    const walkTo = (x: number, z: number) => {
      const d = Math.hypot(x - p.ms.x, z - p.ms.z);
      this.send(m, p, BTN_FWD | (d > 12 ? BTN_SPRINT : 0), this.steerAround(m, p, yawTo(x - p.ms.x, z - p.ms.z)));
    };
    const board = (v: VehicleState) => {
      if (Math.hypot(v.x - p.ms.x, v.z - p.ms.z) < 2.6) {
        if (m.mountVehicle(p, v)) this.startRide(m, p, v.x, v.z);
      } else walkTo(v.x, v.z);
      return true;
    };
    let best: VehicleState | null = null, bd = 60;
    if (!this.buyer) {
      // garupa: sobe atrás de um bot do time que já comprou; enquanto ninguém comprou, espera na base
      for (const v of m.vehicles.values()) {
        if (v.team !== p.team || v.driverId === -1 || v.passengerId !== -1 || !m.players[v.driverId]?.bot) continue;
        const d = Math.hypot(v.x - p.ms.x, v.z - p.ms.z);
        if (d < bd) { bd = d; best = v; }
      }
      if (best) return board(best);
      const anyBuyer = m.players.some((q) => q.bot && q.team === p.team && q.life === LIFE_ALIVE && q.brain?.buyer && q.vehicleId === -1 && Math.hypot(q.ms.x - base.x, q.ms.z - base.z) < 75);
      if (!anyBuyer) return false;
      this.send(m, p, 0, this.aimYaw);
      return true;
    }
    // comprador: aproveita um quadriciclo do time parado sem piloto; senão compra o seu
    for (const v of m.vehicles.values()) {
      if (v.team !== p.team || v.driverId !== -1) continue;
      const d = Math.hypot(v.x - p.ms.x, v.z - p.ms.z);
      if (d < bd) { bd = d; best = v; }
    }
    if (best) return board(best);
    const price = VEHICLE_BY_ID.quad.price;
    let teamVehicles = 0;
    for (const v of m.vehicles.values()) if (v.team === p.team && (v.driverId !== -1 || Math.hypot(v.x - base.x, v.z - base.z) < 80)) teamVehicles++;
    if (p.cash < price + 300 || teamVehicles >= 7) return false;
    const vendor = getVendorPos(p.team, m.world);
    if (Math.hypot(vendor.x - p.ms.x, vendor.z - p.ms.z) > 18) { walkTo(vendor.x, vendor.z); return true; }
    if (m.buyVehicle(p, 'quad') !== null) { this.spawnedAt = -99999; return false; }
    this.startRide(m, p, p.ms.x, p.ms.z);
    return true;
  }

  private startRide(m: Match, p: Player, x: number, z: number) {
    this.rideStart = m.tick; this.rideStuckAt = m.tick; this.rideStuckX = x; this.rideStuckZ = z;
    this.rideStuckCount = 0; this.reverseUntil = 0; this.avoidUntil = 0; this.hasDest = false;
    this.pickRideDest(m, p);
  }

  /** ponto de desembarque dentro da Control Zone, espalhado pelo lado de onde o time chega */
  private pickRideDest(m: Match, p: Player) {
    const cz = m.cz, base = m.world.bases[p.team];
    const a = Math.atan2(base.z - cz.z, base.x - cz.x) + (Math.random() - 0.5) * 1.4;
    const r = cz.r * (0.35 + Math.random() * 0.3);
    this.destX = cz.x + Math.cos(a) * r; this.destZ = cz.z + Math.sin(a) * r; this.hasDest = true;
  }

  /** Chegou (ou desistiu): desce, e o quadriciclo some se só tinha bot nele — não fica largado pesando no servidor. */
  private leaveVehicle(m: Match, p: Player) {
    const v = m.vehicles.get(p.vehicleId);
    const onlyBots = !!v && [v.driverId, v.passengerId].every((id) => id === -1 || m.players[id]?.bot);
    if (v && onlyBots) m.despawnVehicle(v.id);
    else m.dismountPlayer(p);
    this.hasDest = false; this.goalUntil = 0; this.nextThink = 0; this.holding = false; this.hasFinal = false;
  }

  /**
   * Pilotagem: sai da base pelo portão, olha à frente com 3 raios (centro e as duas laterais do quadriciclo),
   * escolhe um desvio e se compromete com ele por um tempo (não fica balançando), reduz para fazer curva fechada
   * e, se empacar, dá ré esterçando para o outro lado. Depois de 4 empacadas seguidas desiste e vai a pé.
   */
  private driveButtons(m: Match, p: Player, v: VehicleState, tx: number, tz: number): number {
    const tick = m.tick;
    const base = m.world.bases[p.team];
    const wp = gateWaypoint(base, v.x, v.z, tx, tz, 1.6);
    const want = yawTo(wp.x - v.x, wp.z - v.z);
    const sp = Math.abs(v.speed);
    const look = 6 + sp * 0.9;
    const y = v.y + 0.7;
    const free = (a: number, len: number) => {
      const dx = -Math.sin(a), dz = -Math.cos(a), rx = Math.cos(a) * 0.85, rz = -Math.sin(a) * 0.85;
      for (const k of [0, -1, 1]) if (m.world.raycast(v.x + rx * k, y, v.z + rz * k, dx, 0, dz, len) < len - 0.05) return false;
      return true;
    };
    let target = tick < this.avoidUntil ? want + this.avoidDir : want;
    if (!free(target, look)) {
      if (tick < this.avoidUntil && free(want, look)) { target = want; this.avoidUntil = 0; }
      else {
        let found = false;
        for (const o of [0.45, 0.9, 1.35, 1.8, 2.4]) {
          for (const sgn of [this.avoidSide, -this.avoidSide]) {
            if (free(want + sgn * o, look * 0.8)) { target = want + sgn * o; this.avoidDir = sgn * o; this.avoidSide = sgn; this.avoidUntil = tick + 24; found = true; break; }
          }
          if (found) break;
        }
        if (!found && tick >= this.reverseUntil) { this.reverseUntil = tick + 30; this.avoidSide = -this.avoidSide; }
      }
    }
    // empacou (andou menos de 2 m em 1 s): ré esterçando, e troca o lado preferido do desvio
    // durante a ré a referência acompanha o veículo: só mede 1,5 s DEPOIS da ré (senão a própria troca de
    // sentido conta como "empacado" e ele entra num vai-e-volta sem fim)
    if (tick < this.reverseUntil) { this.rideStuckX = v.x; this.rideStuckZ = v.z; this.rideStuckAt = tick; }
    else if (tick - this.rideStuckAt >= 45) {
      const moved = Math.hypot(v.x - this.rideStuckX, v.z - this.rideStuckZ);
      if (moved < 2) { this.rideStuckCount++; this.reverseUntil = tick + 36; this.avoidSide = -this.avoidSide; this.avoidUntil = 0; }
      else if (moved > 6) this.rideStuckCount = 0;
      this.rideStuckX = v.x; this.rideStuckZ = v.z; this.rideStuckAt = tick;
    }
    let diff = angDiff(target, v.yaw);
    // alvo quase atrás (±180°): o sinal da diferença alterna a cada tick e o quadriciclo não gira nunca, só vai e volta.
    // Mantém o lado da curva até o alvo sair de trás.
    if (Math.abs(diff) > 2.4) diff = this.turnSide * Math.abs(diff);
    else this.turnSide = diff >= 0 ? 1 : -1;
    if (tick < this.reverseUntil) return BTN_BACK | (diff > 0 ? BTN_RIGHT : BTN_LEFT); // de ré o volante inverte
    let b = diff > 0.06 ? BTN_LEFT : diff < -0.06 ? BTN_RIGHT : 0;
    // curva fechada: tira o pé (e freia se estiver rápido) para não abrir a curva no muro
    if (Math.abs(diff) > 1.0 && sp > 7) b |= BTN_JUMP;
    else if (Math.abs(diff) < 0.9 || sp < 4) b |= BTN_FWD;
    return b;
  }

  // ---------- decisão por tick ----------
  think(m: Match, p: Player) {
    const tick = m.tick;
    if (p.life === LIFE_NONE) {
      if (tick >= p.respawnAt && m.phase !== 'end') this.trySpawn(m, p);
      return;
    }
    if (p.life !== LIFE_ALIVE || !p.loadout) return;

    if (this.rideVehicle(m, p)) return;

    if (tick >= this.nextThink) {
      this.nextThink = tick + 8 + (this.id % 5);
      this.pickTarget(m, p);
      this.pickGoal(m, p);
    }

    let buttons = 0, b2 = 0, b3 = 0;
    // acabou a munição da arma principal: saca a secundária; sem nenhuma, larga o combate e vai reabastecer
    const dry = this.outOfAmmo(p);
    if (p.ammo[0] === 0 && p.reserve[0] === 0 && !dry) b2 |= BTN2_SECONDARY;
    const w = (b2 & BTN2_SECONDARY ? p.loadout.secondary : p.loadout.primary).weapon!;
    const tgt = this.targetId >= 0 && !dry ? m.players[this.targetId] : null;
    let wantYaw: number, wantPitch = 0;
    const turn = 4.5 / 30;
    const reviving = this.reviveId >= 0 && m.players[this.reviveId].life === LIFE_DOWNED;
    const dGoal = Math.hypot(this.goalX - p.ms.x, this.goalZ - p.ms.z);
    const tgtDist = tgt ? Math.hypot(tgt.ms.x - p.ms.x, tgt.ms.z - p.ms.z) : Infinity;
    // reviver tem prioridade quando já está do lado do companheiro e o inimigo não está colado
    const doRevive = reviving && dGoal < 2.2 && tgtDist > 15;

    if (tgt && tgt.life === LIFE_ALIVE && !doRevive) {
      const dx = tgt.ms.x - p.ms.x, dz = tgt.ms.z - p.ms.z;
      const dy = tgt.ms.y + (tgt.ms.prone ? 0.3 : tgt.ms.crouch ? 0.8 : 1.15) - this.eye(p);
      if (tick >= this.nextErr) {
        this.nextErr = tick + 10 + Math.floor(Math.random() * 8);
        const e = 0.004 + (1 - this.skill) * 0.02 + Math.min(0.012, tgtDist / 10000);
        this.errYaw = gauss() * e; this.errPitch = gauss() * e * 0.6;
      }
      wantYaw = yawTo(dx, dz) + this.errYaw;
      wantPitch = Math.atan2(dy, tgtDist) + this.errPitch;
      const dyaw = angDiff(wantYaw, this.aimYaw);
      const reaction = 10 + (1 - this.skill) * 22;
      // rajadas: para, firma a mira e atira; só se mexe entre uma rajada e outra (andando o tiro abre demais)
      const phase = (tick + this.id * 7) % 26;
      const settle = phase < 16 && tgtDist > 12;
      const inRange = tgtDist < (w.cls === 'sniper' ? 330 : Math.max(60, w.falloffEnd));
      if (inRange && tick - this.seenAt > reaction && Math.abs(dyaw) < 0.06 && tick - this.lastSeenAt < 14) {
        if (w.auto) { if (phase >= 3 && phase < 16) buttons |= BTN_FIRE; }
        else if (tick % 3 === 0 && (phase >= 3 || tgtDist <= 12)) buttons |= BTN_FIRE;
      }
      if (tgtDist > 5) b2 |= BTN2_ADS;
      const prefer = w.cls === 'sniper' ? 160 : w.cls === 'smg' || w.cls === 'shotgun' ? 20 : 55;
      if (tick >= this.strafeUntil) {
        this.strafe = Math.random() < 0.5 ? 1 : -1;
        this.strafeUntil = tick + 25 + Math.floor(Math.random() * 35);
        if (tgtDist > 30 && Math.random() < 0.35 + this.skill * 0.3) this.crouchUntil = tick + 60;
      }
      if (this.holding && tgtDist > 70 && tick >= this.proneUntil && Math.random() < 0.01) this.proneUntil = tick + 150;
      if (this.holding && tgtDist > 25) buttons |= BTN_CROUCH; // segura a posição atrás da cobertura
      else if (tick < this.crouchUntil) buttons |= BTN_CROUCH;
      else if (settle && inRange) { /* parado, firmando a mira */ }
      else if (tgtDist > prefer * 1.6) buttons |= BTN_FWD;
      else buttons |= this.strafe > 0 ? BTN_RIGHT : BTN_LEFT;
      if (p.hasMark && tick >= this.markAt && Math.abs(dyaw) < 0.04) { b2 |= BTN2_MARK; this.markAt = tick + 300; }
      if (p.frags > 0 && tgtDist > 12 && tgtDist < 32 && Math.random() < 0.004) b2 |= BTN2_NADE;
    } else {
      wantYaw = this.aimYaw;
      if (doRevive) {
        const d = m.players[this.reviveId];
        wantYaw = yawTo(d.ms.x - p.ms.x, d.ms.z - p.ms.z);
        wantPitch = -0.5;
        buttons |= BTN_CROUCH;
        b2 |= BTN2_USE;
      } else if (dGoal > 1.6) {
        // dentro do muro da base: sai pelo portão mais alinhado com o destino
        let tx = this.goalX, tz = this.goalZ;
        const base = m.world.bases[p.team];
        const bx = p.ms.x - base.x, bz = p.ms.z - base.z;
        if (Math.abs(bx) < 47 && Math.abs(bz) < 47 && Math.hypot(this.goalX - base.x, this.goalZ - base.z) > 50) {
          const gx = this.goalX - base.x, gz = this.goalZ - base.z;
          // portões no meio de cada lado do muro (±46)
          const gate = Math.abs(gx) > Math.abs(gz) ? { x: Math.sign(gx) * 46, z: 0 } : { x: 0, z: Math.sign(gz) * 46 };
          // primeiro alinha com o portão, depois atravessa
          const inLane = gate.x !== 0 ? Math.abs(bz) < 4 : Math.abs(bx) < 4;
          const out = gate.x !== 0 ? { x: gate.x * 1.25, z: 0 } : { x: 0, z: gate.z * 1.25 };
          const t = inLane ? out : gate.x !== 0 ? { x: Math.max(-30, Math.min(30, bx)), z: 0 } : { x: 0, z: Math.max(-30, Math.min(30, bz)) };
          if (!inLane) { if (gate.x !== 0) t.x = bx; else t.z = bz; }
          tx = base.x + t.x; tz = base.z + t.z;
        }
        const raw = yawTo(tx - p.ms.x, tz - p.ms.z);
        const mv = tick < this.steerUntil ? raw + this.steer : this.steerAround(m, p, raw);
        if (tick >= this.steerUntil) this.steer = 0;
        wantYaw = mv;
        buttons |= BTN_FWD;
        // corre longe da zona; perto, anda com cuidado
        const inZone = Math.hypot(p.ms.x - m.cz.x, p.ms.z - m.cz.z) < m.cz.r + 30;
        if ((dGoal > 25 && !inZone) || reviving || dGoal > 70) {
          if (Math.abs(angDiff(wantYaw, this.aimYaw)) < 0.5) buttons |= BTN_SPRINT;
        }
      } else {
        // segurando posição: agachado, olhando para a frente de combate
        if (Math.abs(angDiff(this.lookYaw, this.aimYaw)) > 0.05 && tick - p.lastDamageTick < 120) wantYaw = this.lookYaw;
        else {
          const away = m.world.bases[p.team];
          const watch = yawTo(m.cz.x - away.x, m.cz.z - away.z);
          wantYaw = watch + Math.sin((tick + this.id * 37) / 70) * 1.1;
        }
        if ((tick + this.id * 7) % 300 < 220) buttons |= BTN_CROUCH;
        if (p.builds > 0 && tick >= this.buildAt) { b2 |= BTN2_BUILD; this.buildAt = tick + 90 + Math.floor(Math.random() * 120); }
      }
      // recarrega quando está tranquilo
      if (!(b2 & BTN2_SECONDARY) && p.ammo[0] < w.mag * 0.5 && p.reserve[0] > 0 && tick - this.lastSeenAt > 45) b2 |= BTN2_RELOAD;
      // anti-travamento
      if (tick - this.stuckAt >= 25) {
        const moved = Math.hypot(p.ms.x - this.stuckX, p.ms.z - this.stuckZ);
        if (buttons & BTN_FWD && moved < 0.8) {
          this.steer = (Math.random() < 0.5 ? 1 : -1) * (1 + Math.random());
          this.steerUntil = tick + 25 + Math.floor(Math.random() * 25);
          buttons |= BTN_JUMP;
          if (moved < 0.2 && Math.random() < 0.3) this.goalUntil = 0; // escolhe outro objetivo
        }
        this.stuckX = p.ms.x; this.stuckZ = p.ms.z; this.stuckAt = tick;
      }
    }

    if (tick < this.proneUntil && this.holding && !doRevive) b3 |= BTN3_PRONE;
    // FOB: ergue perto da zona se o time ainda não tem
    if (p.hasFob && tick >= this.fobAt && !m.fobs[p.team]) {
      const dc = Math.hypot(p.ms.x - m.cz.x, p.ms.z - m.cz.z);
      if (dc < m.cz.r + 20 && dc > 40 && !tgt) { b3 |= BTN3_FOB; this.fobAt = tick + 60; }
    }
    if (p.medbags > 0 && p.hp < 55 && tick % 30 === 0) b2 |= BTN2_HEAL;

    const dyaw = angDiff(wantYaw, this.aimYaw);
    this.aimYaw += Math.max(-turn, Math.min(turn, dyaw));
    this.aimPitch += Math.max(-turn, Math.min(turn, wantPitch - this.aimPitch));

    m.processInput(p, { seq: ++this.seq, buttons, buttons2: b2, buttons3: b3, yaw: this.aimYaw, pitch: this.aimPitch, renderTick: tick });
  }
}
