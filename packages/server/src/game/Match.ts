import {
  ALIVE_MASK_BYTES, ARMOR_REDUCTION, BASE_MAGS, BOT_START_CASH, BTN2_ADS, BTN2_BUILD, BTN2_HEAL, BTN2_MARK, BTN2_NADE, BTN2_RELOAD,
  BTN2_SECONDARY, BTN2_USE, BTN_FIRE, BTN_SPRINT, BUILD_USES, BoxKind, CROUCH_EYE_HEIGHT, CROUCH_HEIGHT, CZ_RADIUS, DEFIB_SECONDS, DOWNED_SECONDS, DT,
  EYE_HEIGHT, FAR_SNAPSHOT_EVERY, FORWARD_SPAWN_DIST, FRAG_COUNT, HP_REGEN_CAP, HP_REGEN_DELAY, HP_REGEN_RATE, HZ_MOVE_SECONDS,
  HZ_RADIUS, LIFE_ALIVE, LIFE_DOWNED, LIFE_NONE, MATCH_END_SECONDS, MAX_HP, MAX_PLAYERS, MEDBAG_USES, NADE_DAMAGE, NADE_FUSE,
  NADE_RADIUS, NADE_SPEED, NEAR_DIST, PLAYER_HEIGHT, PLAYER_RADIUS, PRESENCE_REWARD_SECONDS, REVIVE_RANGE, REVIVE_SECONDS,
  SCORE_TO_WIN, SNAPSHOT_EVERY, TEAM_COUNT, TEAM_NAMES, TICK_RATE, WARMUP_SECONDS, aimDir, buildLoadout, computePresence,
  encodeSnapshot, maskSet, newMoveState, pointsFor, rewardFor, stepMove, stepNade, whereIs,
  type BoxMsg, type ClientMsg, type EntityState, type InputMsg, type Nade, type RewardKind, type RosterEntry, type ServerMsg,
  type WeaponStats, type World, type Zone, type ZoneWhere,
} from '@warbit/shared';
import type { ProfileStore } from '../db';
import { BotBrain, botName } from './Bots';
import { HIST, Player, type Conn } from './Player';

const v3 = { x: 0, y: 0, z: 0 };

function rayCylinder(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cz: number, y0: number, y1: number, r: number): number {
  const ex = ox - cx, ez = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return -1;
  const b = ex * dx + ez * dz;
  const c = ex * ex + ez * ez - r * r;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / a;
  if (t < 0) { if (c < 0) t = 0; else return -1; }
  const y = oy + dy * t;
  if (y >= y0 && y <= y1) return t;
  const t2 = (-b + sq) / a;
  const y2 = oy + dy * t2;
  if (y < y0 && y2 >= y0) return (y0 - oy) / dy;
  if (y > y1 && y2 <= y1) return (y1 - oy) / dy;
  return -1;
}

function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const ex = ox - cx, ey = oy - cy, ez = oz - cz;
  const b = ex * dx + ey * dy + ez * dz;
  const c = ex * ex + ey * ey + ez * ez - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : c < 0 ? 0 : -1;
}

export class Match {
  readonly players: Player[] = [];
  tick = 0;
  phase: 'warmup' | 'live' | 'end' = 'warmup';
  phaseEnd = 0;
  scores = [0, 0, 0];
  presence = [0, 0, 0];
  control = -1;
  winner = -1;
  cz: Zone = { x: 0, z: 0, r: CZ_RADIUS };
  hz: Zone = { x: 0, z: 0, r: HZ_RADIUS };
  hzMoveAt = 0;
  spawns: { x: number; z: number }[] = [];
  nades: Nade[] = [];
  sandbags: number[] = [];
  private nextNade = 1;
  private snapCount = 0;
  private ents: (EntityState | null)[] = new Array(MAX_PLAYERS).fill(null);
  /** preenche vagas vazias com bots */
  fillBots = true;

  constructor(readonly world: World, readonly store: ProfileStore | null, opts?: { bots?: boolean }) {
    if (opts?.bots === false) this.fillBots = false;
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = new Player(i, i % TEAM_COUNT);
      this.resetAsBot(p);
      this.players.push(p);
    }
    this.newRound();
  }

  // ---------- util ----------
  private rnd() { return Math.random(); }
  sendTo(p: Player, m: ServerMsg) { if (p.conn) p.conn.send(JSON.stringify(m)); }
  broadcast(m: ServerMsg) {
    const s = JSON.stringify(m);
    for (const p of this.players) if (p.conn) p.conn.send(s);
  }
  whereOf(p: Player): ZoneWhere {
    return p.life === LIFE_NONE ? 'out' : whereIs(p.ms.x, p.ms.z, this.cz, this.hz);
  }
  roster(): RosterEntry[] {
    return this.players.filter((p) => !p.bot || this.fillBots).map((p) => ({ id: p.id, name: p.name, team: p.team, bot: p.bot, level: p.level }));
  }
  private active(p: Player) { return !p.bot || this.fillBots; }

  private resetAsBot(p: Player) {
    p.bot = true; p.conn = null; p.profile = null;
    p.name = botName(p.id);
    p.brain = new BotBrain(p.id);
    p.cash = BOT_START_CASH; p.xp = Math.floor(Math.random() * 30000); p.kills = 0; p.deaths = 0; p.points = 0; p.lifeProfit = 0;
    p.life = LIFE_NONE; p.loadout = null; p.inputs.length = 0;
    p.respawnAt = this.tick + Math.floor(Math.random() * 150);
    p.markedUntil = 0;
  }

  // ---------- rodada ----------
  private newRound() {
    const w = this.world;
    const c = w.czCandidates[Math.floor(this.rnd() * w.czCandidates.length)];
    this.cz = { x: c.x, z: c.z, r: CZ_RADIUS };
    this.moveHotZone();
    this.spawns = w.bases.map((b) => {
      const dx = b.x - c.x, dz = b.z - c.z;
      const d = Math.hypot(dx, dz);
      const k = Math.min(d - 40, CZ_RADIUS + FORWARD_SPAWN_DIST) / d;
      return { x: c.x + dx * k, z: c.z + dz * k };
    });
    this.scores = [0, 0, 0];
    this.presence = [0, 0, 0];
    this.control = -1;
    this.winner = -1;
    this.phase = 'warmup';
    this.phaseEnd = this.tick + WARMUP_SECONDS * TICK_RATE;
    this.nades.length = 0;
    if (this.sandbags.length) {
      for (const id of this.sandbags) this.world.removeBox(id);
      this.broadcast({ t: 'build', remove: this.sandbags.slice() });
      this.sandbags.length = 0;
    }
    for (const p of this.players) {
      if (p.life !== LIFE_NONE) {
        // devolve o valor do loadout de quem estava em campo
        if (p.loadout) { p.cash += p.loadout.cost; p.profileDirty = true; p.saveDirty = true; }
        p.life = LIFE_NONE; p.loadout = null; p.lifeProfit = 0;
        this.sendTo(p, { t: 'life', life: LIFE_NONE, reason: 'Nova partida' });
      }
      p.points = 0; p.kills = p.bot ? 0 : p.kills; p.presenceAcc = 0; p.markedUntil = 0;
      if (p.bot) { p.deaths = 0; p.respawnAt = this.tick + 30 + Math.floor(this.rnd() * 240); }
    }
    this.sendState();
  }

  private moveHotZone() {
    const a = this.rnd() * Math.PI * 2;
    const r = Math.sqrt(this.rnd()) * (CZ_RADIUS - HZ_RADIUS - 12);
    this.hz = { x: this.cz.x + Math.cos(a) * r, z: this.cz.z + Math.sin(a) * r, r: HZ_RADIUS };
    this.hzMoveAt = this.tick + HZ_MOVE_SECONDS * TICK_RATE;
  }

  private endMatch(winner: number) {
    this.phase = 'end';
    this.winner = winner;
    this.phaseEnd = this.tick + MATCH_END_SECONDS * TICK_RATE;
    for (const p of this.players) {
      if (p.team !== winner || !this.active(p)) continue;
      this.award(p, 'win');
      if (p.profile) { p.profile.wins++; p.saveDirty = true; }
    }
    this.broadcast({ t: 'msg', text: `Time ${TEAM_NAMES[winner]} venceu a partida!` });
    this.sendState();
  }

  // ---------- conexões ----------
  join(conn: Conn, name: string, token?: string): Player | null {
    const humans = [0, 0, 0];
    for (const p of this.players) if (!p.bot) humans[p.team]++;
    let team = 0;
    for (let t = 1; t < TEAM_COUNT; t++) if (humans[t] < humans[team] || (humans[t] === humans[team] && this.scores[t] < this.scores[team])) team = t;
    let slot: Player | undefined;
    for (let pass = 0; pass < 2 && !slot; pass++) {
      for (const p of this.players) {
        if (!p.bot) continue;
        if (pass === 0 && p.team !== team) continue;
        if (!slot || (slot.life !== LIFE_NONE && p.life === LIFE_NONE)) slot = p;
      }
    }
    if (!slot) return null;
    const p = slot;
    const clean = (name || 'Mercenário').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16) || 'Mercenário';
    const profile = this.store ? this.store.loadOrCreate(token, clean) : { token: 'mem', name: clean, cash: 10000, xp: 0, kills: 0, deaths: 0, wins: 0 };
    p.bot = false; p.brain = null; p.conn = conn; p.profile = profile; p.name = clean;
    p.cash = profile.cash; p.xp = profile.xp; p.kills = 0; p.deaths = 0; p.points = 0; p.lifeProfit = 0;
    p.life = LIFE_NONE; p.loadout = null; p.inputs.length = 0; p.ack = 0; p.budget = 0;
    const b = this.world.bases[p.team];
    p.ms = newMoveState(b.x, this.world.heightAt(b.x, b.z), b.z);
    const builds: BoxMsg[] = this.sandbags.map((id) => this.world.boxes.find((x) => x.id === id)!).filter(Boolean);
    this.sendTo(p, { t: 'welcome', id: p.id, team: p.team, seed: this.world.seed, token: profile.token, tick: this.tick, roster: this.roster(), builds });
    this.sendProfile(p);
    this.sendTo(p, this.stateMsg());
    this.broadcast({ t: 'roster', roster: this.roster() });
    return p;
  }

  leave(p: Player) {
    this.persist(p);
    this.resetAsBot(p);
    this.broadcast({ t: 'roster', roster: this.roster() });
  }

  private persist(p: Player) {
    if (!p.profile || !this.store) return;
    p.profile.cash = p.cash; p.profile.xp = p.xp;
    this.store.save(p.profile);
    p.saveDirty = false;
  }

  private sendProfile(p: Player) {
    this.sendTo(p, { t: 'profile', cash: Math.round(p.cash), xp: p.xp, level: p.level, lifeProfit: Math.round(p.lifeProfit), kills: p.kills, deaths: p.deaths });
    p.profileDirty = false;
  }

  onJson(p: Player, m: ClientMsg) {
    switch (m.t) {
      case 'spawn': {
        if (!Array.isArray(m.items) || m.items.length > 12) return;
        const err = this.spawn(p, m.items.map(String), m.where === 'base' ? 'base' : 'forward');
        if (err) this.sendTo(p, { t: 'shopError', error: err });
        break;
      }
      case 'giveup':
        if (p.life === LIFE_DOWNED) this.die(p, 'Você desistiu');
        break;
      case 'board':
        this.sendTo(p, { t: 'board', rows: this.players.filter((q) => this.active(q)).map((q) => ({ id: q.id, kills: q.kills, deaths: q.deaths, score: Math.round(q.points) })) });
        break;
      case 'ping':
        this.sendTo(p, { t: 'pong', c: Number(m.c) || 0 });
        break;
    }
  }

  onInput(p: Player, inp: InputMsg) {
    if (p.inputs.length < 12) p.inputs.push(inp);
  }

  // ---------- spawn / loja ----------
  spawn(p: Player, items: string[], where: 'base' | 'forward'): string | null {
    if (p.life !== LIFE_NONE) return 'Você já está em campo';
    if (this.phase === 'end') return 'Aguarde a próxima partida';
    const res = buildLoadout(items, p.bot ? 99 : p.level, p.cash);
    if (!res.ok) return res.error;
    const lo = res.loadout;
    p.cash -= lo.cost;
    p.loadout = lo;
    p.lifeProfit = 0;
    p.profileDirty = true; p.saveDirty = true;
    const mags = BASE_MAGS + (lo.vest?.mags ?? 0);
    const pw = lo.primary.weapon!, sw = lo.secondary.weapon!;
    p.ammo = [pw.mag, sw.mag];
    p.reserve = [pw.mag * mags, sw.mag * 3];
    p.slot = 0; p.reloadEnd = 0; p.nextFire = 0; p.simTime = 0;
    p.frags = lo.tools.some((t) => t.tool === 'frag') ? FRAG_COUNT : 0;
    p.medbags = lo.tools.some((t) => t.tool === 'medbag') ? MEDBAG_USES : 0;
    p.builds = lo.tools.some((t) => t.tool === 'build') ? BUILD_USES : 0;
    p.hasRevive = lo.tools.some((t) => t.tool === 'revive');
    p.hasDefib = lo.tools.some((t) => t.tool === 'defib');
    p.hasMark = lo.tools.some((t) => t.tool === 'mark');
    p.healReady = 0; p.markReady = 0;
    const c = where === 'base' ? this.world.bases[p.team] : this.spawns[p.team];
    const a = this.rnd() * Math.PI * 2, r = 3 + this.rnd() * 9;
    const pos = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
    const gy = this.world.heightAt(pos.x, pos.z);
    this.world.collide(pos, gy, PLAYER_HEIGHT, PLAYER_RADIUS + 0.2);
    p.ms = newMoveState(pos.x, this.world.heightAt(pos.x, pos.z), pos.z);
    p.ms.onGround = true;
    p.yaw = Math.atan2(-(this.cz.x - pos.x), -(this.cz.z - pos.z));
    p.pitch = 0;
    p.hp = MAX_HP;
    p.life = LIFE_ALIVE;
    p.damagers.clear();
    p.lastDamageTick = -99999;
    p.markedUntil = 0;
    p.presenceAcc = 0;
    p.inputs.length = 0;
    p.prevB = 0; p.prevB2 = 0;
    this.sendTo(p, { t: 'life', life: LIFE_ALIVE, tools: { frag: p.frags, medbag: p.medbags, build: p.builds } });
    return null;
  }

  // ---------- economia ----------
  award(p: Player, kind: RewardKind) {
    const r = rewardFor(kind, this.whereOf(p));
    p.cash += r.cash; p.xp += r.xp; p.lifeProfit += r.cash;
    p.profileDirty = true; p.saveDirty = true;
    this.sendTo(p, { t: 'reward', label: r.label, cash: r.cash, xp: r.xp });
  }

  // ---------- simulação ----------
  step() {
    const tick = ++this.tick;

    if (this.phase === 'warmup' && tick >= this.phaseEnd) { this.phase = 'live'; this.broadcast({ t: 'msg', text: 'Partida valendo! Dominem a Control Zone.' }); this.sendState(); }
    else if (this.phase === 'end' && tick >= this.phaseEnd) this.newRound();

    for (const p of this.players) {
      if (p.bot) {
        if (!this.fillBots) continue;
        p.brain!.think(this, p);
      } else {
        p.budget = Math.min(p.budget + 1, 6);
        while (p.inputs.length && p.budget >= 1) {
          this.processInput(p, p.inputs.shift()!);
          p.budget -= 1;
        }
        if (p.inputs.length > 6) p.inputs.splice(0, p.inputs.length - 3);
      }
      if (p.life === LIFE_DOWNED) {
        if (tick - p.reviveTick > 4) p.reviveProg = 0;
        if (tick >= p.downUntil) this.die(p, 'Ninguém te reanimou a tempo');
      }
    }

    // granadas
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      if (stepNade(n, this.world, DT)) {
        this.nades.splice(i, 1);
        this.explode(n);
      }
    }

    // histórico para lag compensation
    const hi = tick % HIST;
    for (const p of this.players) {
      p.hx[hi] = p.ms.x; p.hy[hi] = p.ms.y; p.hz[hi] = p.ms.z;
      p.hc[hi] = p.life === LIFE_NONE ? 0 : p.life === LIFE_DOWNED ? 3 : p.ms.crouch ? 2 : 1;
    }

    if (tick % TICK_RATE === 0) this.everySecond();
    if (tick % 15 === 0) for (const p of this.players) if (p.conn && p.profileDirty) this.sendProfile(p);
    if (tick % 300 === 0) this.persistAll();
    if (tick % SNAPSHOT_EVERY === 0) this.sendSnapshots();
  }

  private everySecond() {
    const tick = this.tick;
    const alive: Player[] = [];
    for (const p of this.players) {
      if (p.life !== LIFE_ALIVE) continue;
      alive.push(p);
      if (p.hp < HP_REGEN_CAP && tick - p.lastDamageTick > HP_REGEN_DELAY * TICK_RATE) p.hp = Math.min(HP_REGEN_CAP, p.hp + HP_REGEN_RATE);
    }
    this.presence = computePresence(alive.map((p) => ({ team: p.team, x: p.ms.x, z: p.ms.z })), this.cz, this.hz);
    if (this.phase === 'live') {
      const res = pointsFor(this.presence, 1);
      this.control = res.team;
      if (res.team >= 0) {
        this.scores[res.team] += res.points;
        if (this.scores[res.team] >= SCORE_TO_WIN) { this.scores[res.team] = SCORE_TO_WIN; this.endMatch(res.team); return; }
      }
      for (const p of alive) {
        const w = this.whereOf(p);
        if (w === 'out') { p.presenceAcc = 0; continue; }
        p.points += w === 'hz' ? 0.2 : 0.1;
        if (++p.presenceAcc >= PRESENCE_REWARD_SECONDS) { p.presenceAcc = 0; this.award(p, 'presence'); }
      }
      if (tick >= this.hzMoveAt) { this.moveHotZone(); this.broadcast({ t: 'msg', text: 'A Hot Zone mudou de lugar!' }); }
    } else {
      this.control = -1;
    }
    this.sendState();
  }

  private stateMsg(): ServerMsg {
    const counts = [0, 0, 0];
    for (const p of this.players) if (p.life === LIFE_ALIVE) counts[p.team]++;
    return {
      t: 'state', phase: this.phase, timeLeft: Math.max(0, Math.ceil((this.phaseEnd - this.tick) / TICK_RATE)),
      scores: this.scores.map((s) => Math.round(s * 10) / 10), presence: this.presence, control: this.control,
      cz: this.cz, hz: this.hz, hzIn: Math.max(0, Math.ceil((this.hzMoveAt - this.tick) / TICK_RATE)), spawns: this.spawns, winner: this.winner, counts,
    };
  }
  private sendState() { this.broadcast(this.stateMsg()); }

  // ---------- input ----------
  processInput(p: Player, inp: InputMsg) {
    p.yaw = inp.yaw; p.pitch = inp.pitch; p.renderTick = inp.renderTick; p.ack = inp.seq;
    if (p.life === LIFE_ALIVE && p.loadout) {
      const armor = p.loadout.armor?.armor ?? 0;
      stepMove(p.ms, inp.buttons, inp.yaw, this.world, DT, armor >= 4 ? 0.92 : armor === 3 ? 0.96 : 1);
      p.sprinting = (inp.buttons & BTN_SPRINT) !== 0 && Math.hypot(p.ms.vx, p.ms.vz) > 6;
      p.simTime += DT;
      this.weapons(p, inp);
      this.tools(p, inp);
    }
    p.prevB = inp.buttons; p.prevB2 = inp.buttons2;
  }

  private weapons(p: Player, inp: InputMsg) {
    const lo = p.loadout!;
    const slot = inp.buttons2 & BTN2_SECONDARY ? 1 : 0;
    if (slot !== p.slot) { p.slot = slot; p.reloadEnd = 0; p.nextFire = Math.max(p.nextFire, p.simTime + 0.35); }
    const w = (slot === 0 ? lo.primary : lo.secondary).weapon!;
    if (p.reloadEnd > 0) {
      if (p.simTime < p.reloadEnd) return;
      const take = Math.min(w.mag - p.ammo[slot], p.reserve[slot]);
      p.ammo[slot] += take; p.reserve[slot] -= take; p.reloadEnd = 0;
    }
    const wantReload = (inp.buttons2 & BTN2_RELOAD) !== 0 && !(p.prevB2 & BTN2_RELOAD);
    if (p.reserve[slot] > 0 && ((wantReload && p.ammo[slot] < w.mag) || p.ammo[slot] === 0)) {
      p.reloadEnd = p.simTime + w.reload;
      return;
    }
    const fire = (inp.buttons & BTN_FIRE) !== 0;
    if (fire && (w.auto || !(p.prevB & BTN_FIRE)) && p.simTime >= p.nextFire && p.ammo[slot] > 0) {
      p.ammo[slot]--;
      p.nextFire = p.simTime + 60 / w.rpm;
      p.shot = (p.shot + 1) & 255;
      this.shoot(p, w, (inp.buttons2 & BTN2_ADS) !== 0, slot === 0 ? lo.primary.name : lo.secondary.name);
    }
  }

  private eyeY(p: Player) { return p.ms.y + (p.ms.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT); }

  private shoot(p: Player, w: WeaponStats, ads: boolean, weaponName: string) {
    let spread = ads ? w.adsSpread : w.spread;
    const speed = Math.hypot(p.ms.vx, p.ms.vz);
    if (speed > 1.5) spread *= ads ? 1.5 : 1.7;
    if (!p.ms.onGround) spread *= 2.5;
    if (p.ms.crouch) spread *= 0.75;
    const ox = p.ms.x, oy = this.eyeY(p), oz = p.ms.z;
    const pellets = w.pellets ?? 1;
    // tick visto pelo atirador (lag compensation); bots usam o presente
    let rt = p.bot ? -1 : Math.min(this.tick - 1, Math.max(this.tick - HIST + 2, p.renderTick));
    if (rt >= 0) rt %= HIST;
    let totalDmg = 0, anyHead = false, anyKill = false;
    for (let k = 0; k < pellets; k++) {
      const yaw = p.yaw + (this.rnd() + this.rnd() - 1) * spread;
      const pitch = p.pitch + (this.rnd() + this.rnd() - 1) * spread;
      aimDir(yaw, pitch, v3);
      const dx = v3.x, dy = v3.y, dz = v3.z;
      let best = this.world.raycast(ox, oy, oz, dx, dy, dz, 650);
      let hit: Player | null = null, head = false;
      for (const e of this.players) {
        if (e.team === p.team || e.life === LIFE_NONE) continue;
        let ex: number, ey: number, ez: number, st: number;
        if (rt >= 0 && e.hc[rt] !== 0) { ex = e.hx[rt]; ey = e.hy[rt]; ez = e.hz[rt]; st = e.hc[rt]; }
        else { ex = e.ms.x; ey = e.ms.y; ez = e.ms.z; st = e.life === LIFE_DOWNED ? 3 : e.ms.crouch ? 2 : 1; }
        // rejeição rápida: distância perpendicular ao raio
        const px = ex - ox, py = ey + 0.9 - oy, pz = ez - oz;
        const along = px * dx + py * dy + pz * dz;
        if (along < -1 || along > best + 1) continue;
        const perp2 = px * px + py * py + pz * pz - along * along;
        if (perp2 > 2.6) continue;
        if (st === 3) {
          const t = rayCylinder(ox, oy, oz, dx, dy, dz, ex, ez, ey, ey + 0.5, 0.7);
          if (t >= 0 && t < best) { best = t; hit = e; head = false; }
          continue;
        }
        const h = st === 2 ? CROUCH_HEIGHT : PLAYER_HEIGHT;
        const th = raySphere(ox, oy, oz, dx, dy, dz, ex, ey + h - 0.14, ez, 0.21);
        const tb = rayCylinder(ox, oy, oz, dx, dy, dz, ex, ez, ey, ey + h - 0.3, 0.38);
        if (th >= 0 && th < best && (tb < 0 || th <= tb + 0.35)) { best = th; hit = e; head = true; }
        else if (tb >= 0 && tb < best) { best = tb; hit = e; head = false; }
      }
      if (hit) {
        let dmg = w.dmg;
        if (best > w.falloffStart) {
          const f = Math.min(1, (best - w.falloffStart) / Math.max(1, w.falloffEnd - w.falloffStart));
          dmg *= 1 - f * (1 - w.minDmgMul);
        }
        if (head) dmg *= w.headMul * (1 - ARMOR_REDUCTION[hit.loadout?.helmet?.helmet ?? 0]);
        else dmg *= 1 - ARMOR_REDUCTION[hit.loadout?.armor?.armor ?? 0];
        const wasAlive = hit.life === LIFE_ALIVE;
        this.damage(hit, dmg, p, weaponName, head);
        totalDmg += dmg; anyHead ||= head;
        if (wasAlive && hit.life !== LIFE_ALIVE) anyKill = true;
      }
    }
    if (totalDmg > 0) this.sendTo(p, { t: 'hit', dmg: Math.round(totalDmg), head: anyHead, kill: anyKill });
  }

  damage(victim: Player, amount: number, attacker: Player | null, weaponName: string, head: boolean) {
    if (victim.life === LIFE_NONE || amount <= 0) return;
    victim.hp -= amount;
    victim.lastDamageTick = this.tick;
    if (attacker && attacker !== victim) victim.damagers.set(attacker.id, this.tick);
    if (victim.conn) this.sendTo(victim, { t: 'hurt', x: attacker ? attacker.ms.x : victim.ms.x, z: attacker ? attacker.ms.z : victim.ms.z, dmg: Math.round(amount) });
    if (victim.hp > 0) return;
    if (victim.life === LIFE_ALIVE) this.goDown(victim, attacker, weaponName, head);
    else this.die(victim, 'Você foi finalizado');
  }

  private goDown(victim: Player, attacker: Player | null, weaponName: string, head: boolean) {
    victim.life = LIFE_DOWNED;
    victim.hp = 30;
    victim.downUntil = this.tick + DOWNED_SECONDS * TICK_RATE;
    victim.reviveProg = 0;
    victim.ms.vx = 0; victim.ms.vz = 0;
    this.sendTo(victim, { t: 'life', life: LIFE_DOWNED, downLeft: DOWNED_SECONDS });
    const credit = attacker && attacker !== victim && attacker.team !== victim.team ? attacker : null;
    if (credit) {
      credit.kills++; credit.points += 10;
      if (credit.profile) credit.profile.kills++;
      this.award(credit, 'kill');
      if (head) this.award(credit, 'headshot');
      for (const [id, t] of victim.damagers) {
        const a = this.players[id];
        if (a !== credit && a.team !== victim.team && this.tick - t < 10 * TICK_RATE) { a.points += 4; this.award(a, 'assist'); }
      }
      if (victim.markedUntil > this.tick && victim.markedTeam === credit.team && victim.markedBy !== credit.id) {
        const m = this.players[victim.markedBy];
        if (m && m.team === credit.team) { m.points += 2; this.award(m, 'mark'); }
      }
    }
    victim.damagers.clear();
    victim.markedUntil = 0;
    this.broadcast({ t: 'kill', killer: credit ? credit.id : -1, victim: victim.id, weapon: weaponName, head, downed: true });
  }

  die(p: Player, reason: string) {
    if (p.life === LIFE_NONE) return;
    p.life = LIFE_NONE;
    p.hp = 0;
    p.deaths++;
    if (p.profile) p.profile.deaths++;
    p.loadout = null; // morreu: perdeu o equipamento comprado
    p.lifeProfit = 0;
    p.profileDirty = true; p.saveDirty = true;
    p.respawnAt = this.tick + (4 + Math.floor(this.rnd() * 5)) * TICK_RATE;
    this.sendTo(p, { t: 'life', life: LIFE_NONE, reason });
  }

  private tools(p: Player, inp: InputMsg) {
    const b2 = inp.buttons2, edge = b2 & ~p.prevB2;
    // reviver aliado caído (segurar E)
    if (b2 & BTN2_USE && (p.hasRevive || p.hasDefib)) {
      let best: Player | null = null, bd = REVIVE_RANGE * REVIVE_RANGE;
      for (const e of this.players) {
        if (e.team !== p.team || e.life !== LIFE_DOWNED) continue;
        const d = (e.ms.x - p.ms.x) ** 2 + (e.ms.z - p.ms.z) ** 2 + (e.ms.y - p.ms.y) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        best.reviveProg += DT; best.reviveTick = this.tick;
        if (best.reviveProg >= (p.hasDefib ? DEFIB_SECONDS : REVIVE_SECONDS)) {
          best.life = LIFE_ALIVE; best.hp = p.hasDefib ? MAX_HP : 40; best.lastDamageTick = this.tick; best.reviveProg = 0;
          best.inputs.length = 0;
          this.sendTo(best, { t: 'life', life: LIFE_ALIVE, tools: { frag: best.frags, medbag: best.medbags, build: best.builds } });
          this.sendTo(best, { t: 'msg', text: `${p.name} te reanimou — equipamento mantido!` });
          p.points += 5;
          this.award(p, 'revive');
        }
      }
    }
    if (edge & BTN2_NADE && p.frags > 0) {
      p.frags--;
      aimDir(p.yaw, p.pitch + 0.12, v3);
      const n: Nade = { id: this.nextNade++, owner: p.id, x: p.ms.x + v3.x * 0.5, y: this.eyeY(p), z: p.ms.z + v3.z * 0.5, vx: v3.x * NADE_SPEED + p.ms.vx, vy: v3.y * NADE_SPEED, vz: v3.z * NADE_SPEED + p.ms.vz, fuse: NADE_FUSE };
      this.nades.push(n);
      this.broadcast({ t: 'nade', id: n.id, x: n.x, y: n.y, z: n.z, vx: n.vx, vy: n.vy, vz: n.vz, fuse: n.fuse });
      this.sendTo(p, { t: 'life', life: LIFE_ALIVE, tools: { frag: p.frags, medbag: p.medbags, build: p.builds } });
    }
    if (edge & BTN2_HEAL && p.medbags > 0 && p.simTime >= p.healReady) {
      let healed = 0, self = false;
      for (const e of this.players) {
        if (e.team !== p.team || e.life !== LIFE_ALIVE || e.hp >= MAX_HP) continue;
        if ((e.ms.x - p.ms.x) ** 2 + (e.ms.z - p.ms.z) ** 2 > 64) continue;
        e.hp = Math.min(MAX_HP, e.hp + 50);
        if (e !== p) healed++; else self = true;
      }
      if (healed > 0 || self) {
        p.medbags--; p.healReady = p.simTime + 3;
        for (let i = 0; i < Math.min(healed, 4); i++) this.award(p, 'heal');
        this.sendTo(p, { t: 'life', life: LIFE_ALIVE, tools: { frag: p.frags, medbag: p.medbags, build: p.builds } });
      }
    }
    if (edge & BTN2_BUILD && p.builds > 0 && p.ms.onGround) this.buildSandbag(p);
    if (edge & BTN2_MARK && p.hasMark && p.simTime >= p.markReady) this.mark(p);
  }

  private buildSandbag(p: Player) {
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const cx = p.ms.x + fx * 1.9, cz = p.ms.z + fz * 1.9;
    const alongX = Math.abs(fx) < Math.abs(fz); // parede perpendicular à direção em que o jogador olha
    const hw = alongX ? 1.3 : 0.4, hd = alongX ? 0.4 : 1.3;
    const gy = this.world.heightAt(cx, cz);
    if (Math.abs(gy - p.ms.y) > 1.2) return;
    for (const e of this.players) {
      if (e.life === LIFE_NONE) continue;
      if (e.ms.x > cx - hw - 0.5 && e.ms.x < cx + hw + 0.5 && e.ms.z > cz - hd - 0.5 && e.ms.z < cz + hd + 0.5) return;
    }
    const b = this.world.addBox({ id: 0, x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, y0: gy - 1, y1: gy + 1.1, kind: BoxKind.Sandbag, color: 0xb9a57c });
    this.sandbags.push(b.id);
    p.builds--;
    this.broadcast({ t: 'build', add: [b] });
    if (this.sandbags.length > 80) {
      const old = this.sandbags.shift()!;
      this.world.removeBox(old);
      this.broadcast({ t: 'build', remove: [old] });
    }
    p.points += 1;
    this.award(p, 'build');
    this.sendTo(p, { t: 'life', life: LIFE_ALIVE, tools: { frag: p.frags, medbag: p.medbags, build: p.builds } });
  }

  private mark(p: Player) {
    aimDir(p.yaw, p.pitch, v3);
    const ox = p.ms.x, oy = this.eyeY(p), oz = p.ms.z;
    let best: Player | null = null, bestDot = Math.cos(0.07);
    for (const e of this.players) {
      if (e.team === p.team || e.life !== LIFE_ALIVE) continue;
      const dx = e.ms.x - ox, dy = e.ms.y + 1 - oy, dz = e.ms.z - oz;
      const d = Math.hypot(dx, dy, dz);
      if (d > 450 || d < 0.5) continue;
      const dot = (dx * v3.x + dy * v3.y + dz * v3.z) / d;
      if (dot > bestDot && this.world.canSee(ox, oy, oz, e.ms.x, e.ms.y + 1, e.ms.z)) { bestDot = dot; best = e; }
    }
    p.markReady = p.simTime + 1.5;
    if (!best) return;
    best.markedUntil = this.tick + 14 * TICK_RATE;
    best.markedTeam = p.team;
    best.markedBy = p.id;
    this.sendTo(p, { t: 'msg', text: `Alvo marcado: ${best.name}` });
  }

  private explode(n: Nade) {
    this.broadcast({ t: 'boom', x: n.x, y: n.y, z: n.z });
    const owner = this.players[n.owner];
    for (const e of this.players) {
      if (e.life === LIFE_NONE) continue;
      if (e.team === owner.team && e !== owner) continue;
      const d = Math.hypot(e.ms.x - n.x, e.ms.y + 0.9 - n.y, e.ms.z - n.z);
      if (d > NADE_RADIUS) continue;
      if (!this.world.hasLineOfSight(n.x, n.y + 0.3, n.z, e.ms.x, e.ms.y + 1, e.ms.z)) continue;
      const dmg = NADE_DAMAGE * (1 - d / NADE_RADIUS) * (1 - ARMOR_REDUCTION[e.loadout?.armor?.armor ?? 0] * 0.5);
      this.damage(e, dmg, owner, 'Granada', false);
    }
  }

  // ---------- snapshots ----------
  private sendSnapshots() {
    const tick = this.tick;
    this.snapCount++;
    const mask = new Uint8Array(ALIVE_MASK_BYTES);
    for (const p of this.players) {
      if (p.life === LIFE_NONE) { this.ents[p.id] = null; continue; }
      maskSet(mask, p.id);
      const lo = p.loadout;
      this.ents[p.id] = {
        id: p.id, x: p.ms.x, y: p.ms.y, z: p.ms.z, yaw: p.yaw, pitch: p.pitch, life: p.life, crouch: p.ms.crouch, sprint: p.sprinting,
        marked: false, team: p.team, armor: lo?.armor?.armor ?? 0, helmet: lo?.helmet?.helmet ?? 0,
        weapon: lo ? (p.slot === 0 ? lo.primary.idx : lo.secondary.idx) : 0, shot: p.shot, hp: p.hp,
      };
    }
    const near2 = NEAR_DIST * NEAR_DIST;
    const list: EntityState[] = [];
    for (const p of this.players) {
      if (!p.conn) continue;
      list.length = 0;
      for (const q of this.players) {
        const e = this.ents[q.id];
        if (!e || q === p) continue;
        const marked = q.markedUntil > tick && q.markedTeam === p.team;
        const d2 = (q.ms.x - p.ms.x) ** 2 + (q.ms.z - p.ms.z) ** 2;
        if (d2 > near2 && !marked && (this.snapCount + q.id) % FAR_SNAPSHOT_EVERY !== 0) continue;
        e.marked = marked;
        list.push(e);
      }
      const slot = p.slot;
      p.conn.send(encodeSnapshot({
        tick, ack: p.ack,
        own: {
          x: p.ms.x, y: p.ms.y, z: p.ms.z, vx: p.ms.vx, vy: p.ms.vy, vz: p.ms.vz, hp: p.hp, life: p.life,
          ammo: p.ammo[slot], reserve: p.reserve[slot],
          flags: (p.reloadEnd > 0 ? 1 : 0) | (p.ms.onGround ? 2 : 0) | (p.ms.crouch ? 4 : 0), slot,
        },
        alive: mask, ents: list,
      }));
    }
  }

  private persistAll() {
    const dirty = this.players.filter((p) => p.saveDirty && p.profile);
    if (!dirty.length || !this.store) return;
    this.store.batch(() => { for (const p of dirty) this.persist(p); });
  }

  shutdown() {
    this.persistAll();
  }
}
