import { BACKPACK_SECONDS, BOT_RESPAWN_MAX_IN_ZONE, LOOT_RANGE, type Magazine } from '@warbit/shared';
import { BOT_RESPAWN_SECONDS, cargoCapacity, loadoutIds, getEquipmentVendorPos, MAGAZINE_PRICE, ITEM_BY_ID, priceFor } from '@warbit/shared';
import {
  ALIVE_MASK_BYTES, ARMOR_REDUCTION, BASE_MAGS, BOT_START_CASH, BTN2_ADS, BTN2_BUILD, BTN2_HEAL, BTN2_MARK, BTN2_NADE, BTN2_RELOAD,
  BTN2_SECONDARY, BTN2_USE, BTN3_FOB, BTN_FIRE, BTN_SPRINT, BUILD_USES, BoxKind, CROUCH_HEIGHT, CZ_RADIUS, DEFIB_SECONDS,
  DOWNED_SECONDS, DT, FAR_SNAPSHOT_EVERY, FOB_HP, FOB_MIN_BASE_DIST, FOB_RADIUS, FRAG_COUNT, HP_REGEN_CAP, HP_REGEN_DELAY,
  HP_REGEN_RATE, HZ_DRIFT_SPEED, HZ_MOVE_SECONDS, HZ_RADIUS, LIFE_ALIVE, LIFE_DOWNED, LIFE_NONE, MATCH_END_SECONDS, MAX_HP, MAX_PLAYERS, MEDBAG_USES,
  NADE_DAMAGE, NADE_FUSE, NADE_RADIUS, NADE_SPEED, NEAR_DIST, PLAYER_HEIGHT, PLAYER_RADIUS, PRESENCE_REWARD_SECONDS, RESPAWN_SECONDS,
  REVIVE_RANGE, REVIVE_SECONDS, SCORE_TO_WIN, SNAPSHOT_EVERY, SPRINT_FLAG_SPEED, TEAM_COUNT, TEAM_NAMES, TICK_RATE, WARMUP_SECONDS,
  aimDir, buildLoadout, computePresence, encodeSnapshot, eyeHeight, maskSet, newMoveState, pointsFor, rewardFor, stepMove, stepNade, whereIs,
  getVendorPos, getVehicleSpawnPos, newVehicle, stepVehicle, VEHICLE_BY_ID, type VehicleState,
  type Box, type BoxMsg, type ClientMsg, type EntityState, type InputMsg, type Nade, type RewardKind, type RosterEntry, type ServerMsg,
  type WeaponStats, type World, type Zone, type ZoneWhere,
} from '@warbit/shared';
import type { ProfileStore } from '../db';
import { BotBrain, botName } from './Bots';
import { chooseControlZone } from './zones';
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

/** Mochila que sobra no chão quando o jogador desiste/morre: carregadores para lootear, some em BACKPACK_SECONDS. */
export interface Drop { id: number; x: number; y: number; z: number; mags: Magazine[]; expireAt: number }

export interface Fob { team: number; x: number; z: number; y: number; hp: number; ids: number[]; owner: number }

const COVER_KINDS: number[] = [BoxKind.House, BoxKind.Wall, BoxKind.Crate, BoxKind.Container, BoxKind.Building, BoxKind.Rock, BoxKind.Fence];

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
  nades: Nade[] = [];
  sandbags: number[] = [];
  fobs: (Fob | null)[] = [null, null, null];
  drops: Drop[] = [];
  private nextDrop = 1;
  readonly vehicles = new Map<number, VehicleState>();
  private nextVehicleId = 1;
  private vehicleSyncTick = 0;
  /** pontos de cobertura dentro da Control Zone (para os bots) */
  cover: { x: number; z: number }[] = [];
  private nextNade = 1;
  private snapCount = 0;
  private ents: (EntityState | null)[] = new Array(MAX_PLAYERS).fill(null);
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
  vehicleList(): VehicleState[] {
    return Array.from(this.vehicles.values());
  }
  sendVehicles() {
    this.broadcast({ t: 'vehicles', list: this.vehicleList() });
  }
  /** O veículo onde o jogador está sentado, pelo assento (não confia só em p.vehicleId). */
  private seatOf(p: Player): VehicleState | undefined {
    const byId = p.vehicleId !== -1 ? this.vehicles.get(p.vehicleId) : undefined;
    if (byId && (byId.driverId === p.id || byId.passengerId === p.id)) return byId;
    for (const v of this.vehicles.values()) if (v.driverId === p.id || v.passengerId === p.id) return v;
    return undefined;
  }
  /** Tira o jogador do veículo. Também limpa assento "fantasma": quando um humano entra na vaga de um bot que
   *  estava pilotando, o veículo continuava com aquele id como piloto e o cliente ficava preso nele. */
  dismountPlayer(p: Player) {
    const veh = this.seatOf(p);
    if (!veh) { if (p.vehicleId !== -1) { p.vehicleId = -1; this.sendVehicles(); } return; }
    {
      const wasDriver = veh.driverId === p.id;
      if (wasDriver) { veh.driverId = veh.passengerId; veh.passengerId = -1; } // a garupa assume o guidão
      else veh.passengerId = -1;
      const side = wasDriver ? 1.5 : -1.5;
      const sideX = veh.x + Math.cos(veh.yaw) * side;
      const sideZ = veh.z - Math.sin(veh.yaw) * side;
      const gy = this.world.groundAt(sideX, sideZ, veh.y + 0.2, PLAYER_RADIUS);
      p.ms.x = sideX; p.ms.z = sideZ; p.ms.y = gy;
      p.ms.vx = 0; p.ms.vz = 0;
    }
    p.vehicleId = -1;
    this.sendVehicles();
  }
  destroyVehicle(id: number) {
    const v = this.vehicles.get(id);
    if (!v) return;
    this.broadcast({ t: 'vehicleBoom', id: v.id, x: v.x, y: v.y, z: v.z });
    this.broadcast({ t: 'boom', x: v.x, y: v.y, z: v.z });
    for (const pid of [v.driverId, v.passengerId]) {
      if (pid === -1) continue;
      const rider = this.players[pid];
      if (rider && rider.life === LIFE_ALIVE) {
        rider.vehicleId = -1;
        this.damage(rider, 80, null, 'Explosão do veículo', false);
      }
    }
    this.vehicles.delete(id);
    this.sendVehicles();
  }
  /** Vaga de piloto livre (qualquer time) ou garupa livre (só do mesmo time). */
  mountVehicle(p: Player, veh: VehicleState): 'driver' | 'passenger' | null {
    if (p.life !== LIFE_ALIVE || p.vehicleId !== -1) return null;
    let seat: 'driver' | 'passenger';
    if (veh.driverId === -1) { veh.driverId = p.id; seat = 'driver'; }
    else if (veh.passengerId === -1 && veh.team === p.team) { veh.passengerId = p.id; seat = 'passenger'; }
    else return null;
    p.vehicleId = veh.id;
    p.ms.x = veh.x; p.ms.y = veh.y; p.ms.z = veh.z;
    p.yaw = veh.yaw;
    p.ms.vx = 0; p.ms.vy = 0; p.ms.vz = 0;
    p.prevB2 |= BTN2_USE; // o E que montou ainda está apertado: não pode contar como "descer" no próximo input
    p.reloadEnd = 0;
    this.sendVehicles();
    return seat;
  }
  /** Compra no vendedor da base: o veículo nasce na vaga e o comprador já sai pilotando. */
  buyVehicle(p: Player, vType: string): string | null {
    if (p.life !== LIFE_ALIVE) return 'Você precisa estar em campo';
    const def = VEHICLE_BY_ID[vType];
    if (!def || def.soon) return 'Veículo indisponível no momento';
    const vPos = getVendorPos(p.team, this.world);
    if (Math.hypot(p.ms.x - vPos.x, p.ms.z - vPos.z) > 25) return 'Vá até o vendedor de veículos da base para comprar!';
    if (p.cash < def.price) return `Saldo insuficiente! Custa $${def.price.toLocaleString('pt-BR')}`;
    this.dismountPlayer(p);
    p.cash -= def.price;
    this.sendTo(p, { t: 'purchase', amount: def.price, kind: 'vehicle' });
    p.profileDirty = true; p.saveDirty = true;
    if (p.conn) this.sendProfile(p);
    const sp = getVehicleSpawnPos(p.team, this.world);
    // vaga ocupada por outro veículo parado: encosta ao lado
    let x = sp.x;
    const z = sp.z;
    for (let k = 0; k < 6 && [...this.vehicles.values()].some((v) => Math.hypot(v.x - x, v.z - z) < 3); k++) x = sp.x + (k % 2 ? 1 : -1) * 3.5 * Math.ceil((k + 1) / 2);
    const veh = newVehicle(this.nextVehicleId++, vType, x, this.world.groundAt(x, z, sp.y + 0.5, def.radius), z, sp.yaw, p.team);
    this.vehicles.set(veh.id, veh);
    this.mountVehicle(p, veh);
    p.prevB2 = 0;
    return null;
  }
  whereOf(p: Player): ZoneWhere {
    return p.life === LIFE_NONE ? 'out' : whereIs(p.ms.x, p.ms.z, this.cz, this.hz);
  }
  roster(): RosterEntry[] {
    return this.players.filter((p) => !p.bot || this.fillBots).map((p) => ({ id: p.id, name: p.name, team: p.team, bot: p.bot, level: p.level }));
  }
  private active(p: Player) { return !p.bot || this.fillBots; }
  private toolsMsg(p: Player) { return { frag: p.frags, medbag: p.medbags, build: p.builds, fob: p.hasFob ? 1 : 0 }; }

  private resetAsBot(p: Player) {
    this.dismountPlayer(p);
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
    this.cz = chooseControlZone(w.bases, CZ_RADIUS, () => this.rnd());
    this.moveHotZone();
    this.scores = [0, 0, 0];
    this.presence = [0, 0, 0];
    this.control = -1;
    this.winner = -1;
    this.phase = 'warmup';
    this.phaseEnd = this.tick + WARMUP_SECONDS * TICK_RATE;
    this.nades.length = 0;
    this.vehicles.clear();
    this.broadcast({ t: 'vehicles', list: [] });
    const remove: number[] = [...this.sandbags];
    for (let t = 0; t < 3; t++) { const f = this.fobs[t]; if (f) remove.push(...f.ids); this.fobs[t] = null; }
    if (remove.length) {
      for (const id of remove) this.world.removeBox(id);
      this.broadcast({ t: 'build', remove });
    }
    this.sandbags.length = 0;
    this.drops.length = 0;
    this.computeCover();
    for (const p of this.players) {
      if (p.life !== LIFE_NONE) {
        // devolve o valor do loadout de quem estava em campo
        if (p.loadout) { p.cash += p.loadout.cost; p.profileDirty = true; p.saveDirty = true; }
        p.life = LIFE_NONE; p.loadout = null; p.lifeProfit = 0;
        this.sendTo(p, { t: 'life', life: LIFE_NONE, reason: 'Nova partida', wait: 0 });
      }
      p.points = 0; p.presenceAcc = 0; p.markedUntil = 0; p.respawnAt = 0; p.vehicleId = -1;
      if (p.bot) { p.deaths = 0; p.kills = 0; p.respawnAt = this.tick + 30 + Math.floor(this.rnd() * 240); }
    }
    this.broadcast({ t: 'msg', text: 'Control Zone sorteada entre a vila e o distrito industrial' });
    this.sendState();
  }

  private computeCover() {
    const cz = this.cz;
    const pts: { x: number; z: number }[] = [];
    const seen = new Set<number>();
    for (const b of this.world.boxes) {
      if (!COVER_KINDS.includes(b.kind) || seen.has(b.id)) continue;
      const cx = (b.x0 + b.x1) / 2, cz2 = (b.z0 + b.z1) / 2;
      if ((cx - cz.x) ** 2 + (cz2 - cz.z) ** 2 > (cz.r - 5) ** 2) continue;
      if (b.y1 - this.world.heightAt(cx, cz2) < 0.9) continue;
      seen.add(b.id);
      // pontos ao lado da caixa, um pouco afastados
      const opts = [
        { x: b.x0 - 1.1, z: cz2 }, { x: b.x1 + 1.1, z: cz2 }, { x: cx, z: b.z0 - 1.1 }, { x: cx, z: b.z1 + 1.1 },
      ];
      for (const o of opts) {
        if (this.rnd() < 0.5) continue;
        if (this.world.blockedAt(o.x, o.z)) continue;
        pts.push(o);
      }
    }
    this.cover = pts;
  }

  private hzTarget = { x: 0, z: 0 };
  private hzPoint() {
    for (let i = 0; i < 64; i++) {
      const district = this.world.pois[this.rnd() < .5 ? 0 : 1];
      const a = this.rnd() * Math.PI * 2, r = Math.sqrt(this.rnd()) * district.r * .65;
      const point = { x: district.x + Math.cos(a) * r, z: district.z + Math.sin(a) * r };
      if (Math.hypot(point.x - this.cz.x, point.z - this.cz.z) < this.cz.r - HZ_RADIUS - 12 && !this.world.blockedAt(point.x, point.z)) return point;
    }
    return { x: this.cz.x, z: this.cz.z };
  }
  /** Nova rodada: a Hot Zone surge num ponto da Control Zone e já parte, devagar, para outro. */
  private moveHotZone() {
    const s = this.hzPoint();
    this.hz = { x: s.x, z: s.z, r: HZ_RADIUS };
    this.pickHzTarget();
  }
  /** Próximo destino: um ponto da Control Zone a pelo menos 70 m do atual. */
  private pickHzTarget() {
    let t = this.hzPoint();
    for (let i = 0; i < 10 && Math.hypot(t.x - this.hz.x, t.z - this.hz.z) < 70; i++) t = this.hzPoint();
    this.hzTarget = t;
    this.hzMoveAt = this.tick + Math.ceil(Math.hypot(t.x - this.hz.x, t.z - this.hz.z) / HZ_DRIFT_SPEED) * TICK_RATE;
  }
  /** Chamado a cada segundo: a Hot Zone desliza para o destino (como no WarDogs), sem teleporte. */
  private driftHotZone() {
    const dx = this.hzTarget.x - this.hz.x, dz = this.hzTarget.z - this.hz.z, d = Math.hypot(dx, dz);
    if (d <= HZ_DRIFT_SPEED) { this.hz = { x: this.hzTarget.x, z: this.hzTarget.z, r: HZ_RADIUS }; this.pickHzTarget(); return; }
    this.hz = { x: this.hz.x + (dx / d) * HZ_DRIFT_SPEED, z: this.hz.z + (dz / d) * HZ_DRIFT_SPEED, r: HZ_RADIUS };
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
  join(conn: Conn, name: string, token?: string, preferredTeam?: number): Player | null {
    const humans = [0, 0, 0];
    for (const p of this.players) if (!p.bot) humans[p.team]++;
    let team = 0;
    for (let t = 1; t < TEAM_COUNT; t++) if (humans[t] < humans[team] || (humans[t] === humans[team] && this.scores[t] < this.scores[team])) team = t;
    const chosen=Number.isInteger(preferredTeam) && preferredTeam!>=0 && preferredTeam!<TEAM_COUNT;
    if(chosen) team=preferredTeam!;
    let slot: Player | undefined;
    for (let pass = 0; pass < (chosen ? 1 : 2) && !slot; pass++) {
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
    this.dismountPlayer(p); // o bot desta vaga podia estar num veículo
    p.bot = false; p.brain = null; p.conn = conn; p.profile = profile; p.name = clean;
    p.cash = profile.cash; p.xp = profile.xp; p.kills = 0; p.deaths = 0; p.points = 0; p.lifeProfit = 0;
    p.life = LIFE_NONE; p.loadout = null; p.inputs.length = 0; p.ack = 0; p.budget = 0; p.respawnAt = 0;
    const b = this.world.bases[p.team];
    p.ms = newMoveState(b.x, this.world.heightAt(b.x, b.z), b.z);
    const builds: BoxMsg[] = [];
    for (const id of this.sandbags) { const bx = this.world.boxes.find((x) => x.id === id); if (bx) builds.push(bx); }
    for (const f of this.fobs) if (f) for (const id of f.ids) { const bx = this.world.boxes.find((x) => x.id === id); if (bx) builds.push(bx); }
    this.sendTo(p, { t: 'welcome', id: p.id, team: p.team, seed: this.world.seed, token: profile.token, tick: this.tick, roster: this.roster(), builds });
    this.sendProfile(p);
    this.sendTo(p, this.stateMsg());
    this.sendTo(p, { t: 'vehicles', list: this.vehicleList() });
    this.broadcast({ t: 'roster', roster: this.roster() });
    return p;
  }

  leave(p: Player) {
    this.dismountPlayer(p);
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
        const err = this.spawn(p, []);
        if (err) this.sendTo(p, { t: 'shopError', error: err });
        break;
      }
      case 'inventory': this.sendInventory(p); break;
      case 'buyEquipment': {
        const error = this.buyEquipment(p, m.items, m.magazines);
        if (error) this.sendTo(p, {t:'shopError',error});
        break;
      }
      case 'discardMagazine': {
        if(p.life!==LIFE_ALIVE||p.reloadEnd>0||!Number.isInteger(m.slot)||m.slot<0||m.slot>=p.cargo.length)return;
        p.cargo[m.slot]=null;this.syncReserve(p);this.sendInventory(p);break;
      }
      case 'moveMagazine': {
        if (p.life !== LIFE_ALIVE || p.reloadEnd > 0 || !Number.isInteger(m.from) || !Number.isInteger(m.to)) return;
        if (m.from < 0 || m.to < 0 || m.from >= p.cargo.length || m.to >= p.cargo.length) return;
        [p.cargo[m.from],p.cargo[m.to]]=[p.cargo[m.to],p.cargo[m.from]];
        this.sendInventory(p); break;
      }
      case 'loot': this.loot(p); break;
      case 'inspectLoot': this.inspectLoot(p); break;
      case 'swapLootWeapon': this.swapLootWeapon(p, m.target, m.revision, m.slot); break;
      case 'giveup':
        if (p.life === LIFE_DOWNED) this.die(p, 'Você desistiu');
        break;
      case 'board':
        this.sendTo(p, { t: 'board', rows: this.players.filter((q) => this.active(q)).map((q) => ({ id: q.id, kills: q.kills, deaths: q.deaths, score: Math.round(q.points) })) });
        break;
      case 'buyVehicle': {
        const vType = typeof m.vehicleType === 'string' ? m.vehicleType : 'quad';
        const error = this.buyVehicle(p, vType);
        this.sendTo(p, { t: 'msg', text: error ?? `${VEHICLE_BY_ID[vType]!.name} pronto! [WASD] pilota, [E] desce. Um aliado pode subir na garupa.` });
        break;
      }
      case 'mountVehicle': {
        if (p.life !== LIFE_ALIVE || p.vehicleId !== -1) return;
        const vid = Number(m.vehicleId);
        const veh = this.vehicles.get(vid);
        if (!veh) return;
        const d = Math.hypot(p.ms.x - veh.x, p.ms.z - veh.z, p.ms.y - veh.y);
        if (d > 3.5) return;
        const seat = this.mountVehicle(p, veh);
        if (!seat) return;
        this.sendTo(p, { t: 'msg', text: seat === 'driver' ? `Você montou no ${VEHICLE_BY_ID[veh.type]?.name ?? 'veículo'}. [E] para descer.` : 'Você subiu na garupa. [E] para descer.' });
        break;
      }
      case 'dismountVehicle':
        this.dismountPlayer(p);
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
  /** Todo mundo nasce na base do time e vai a pé até a zona. */
  spawn(p: Player, items: string[]): string | null {
    if (p.life !== LIFE_NONE) return 'Você já está em campo';
    if (this.phase === 'end') return 'Aguarde a próxima partida';
    if (!p.bot && this.tick < p.respawnAt) return `Aguarde ${Math.ceil((p.respawnAt - this.tick) / TICK_RATE)}s para renascer`;
    const res = buildLoadout(items, p.bot ? 99 : p.level, p.cash);
    if (!res.ok) return res.error;
    const lo = res.loadout;
    p.cash -= lo.cost;
    p.loadout = lo;
    p.lifeProfit = 0;
    p.profileDirty = true; p.saveDirty = true;
    const mags = p.bot ? BASE_MAGS + 2 : 0;
    p.cargo = Array(cargoCapacity(lo)).fill(null);
    const pw = lo.primary.weapon!, sw = lo.secondary.weapon!;
    p.ammo = [pw.mag, sw.mag];
    p.reserve = [pw.mag * mags, sw.mag * (p.bot ? 3 : 0)];
    p.maxReserve = [p.reserve[0], p.reserve[1]];
    p.slot = 0; p.reloadEnd = 0; p.nextFire = 0; p.simTime = 0;
    p.frags = lo.tools.some((t) => t.tool === 'frag') ? FRAG_COUNT : 0;
    p.medbags = lo.tools.some((t) => t.tool === 'medbag') ? MEDBAG_USES : 0;
    p.builds = lo.tools.some((t) => t.tool === 'build') ? BUILD_USES : 0;
    p.hasRevive = lo.tools.some((t) => t.tool === 'revive');
    p.hasDefib = lo.tools.some((t) => t.tool === 'defib');
    p.hasMark = lo.tools.some((t) => t.tool === 'mark');
    p.hasFob = lo.tools.some((t) => t.tool === 'fob');
    p.healReady = 0; p.markReady = 0;
    const c = this.world.bases[p.team];
    const pos = { x: c.x, z: c.z };
    for (let tries = 0; tries < 12; tries++) {
      const a = this.rnd() * Math.PI * 2, r = 4 + this.rnd() * 14;
      pos.x = c.x + Math.cos(a) * r; pos.z = c.z + Math.sin(a) * r;
      if (!this.world.blockedAt(pos.x, pos.z)) break;
    }
    const gy = this.world.heightAt(pos.x, pos.z);
    this.world.collide(pos, gy, PLAYER_HEIGHT, PLAYER_RADIUS + 0.2);
    p.ms = newMoveState(pos.x, this.world.groundAt(pos.x, pos.z, gy + 0.2, PLAYER_RADIUS), pos.z);
    p.ms.onGround = true;
    p.yaw = Math.atan2(-(this.cz.x - pos.x), -(this.cz.z - pos.z));
    p.pitch = 0;
    p.hp = MAX_HP;
    p.life = LIFE_ALIVE;
    p.damagers.clear();
    p.lastDamageTick = -99999;
    p.lastAttacker = -1;
    p.markedUntil = 0;
    p.presenceAcc = 0;
    this.dismountPlayer(p); // nasce a pé: nenhum veículo pode continuar com ele no assento
    p.ms = newMoveState(pos.x, this.world.groundAt(pos.x, pos.z, gy + 0.2, PLAYER_RADIUS), pos.z);
    p.ms.onGround = true;
    p.inputs.length = 0;
    p.prevB = 0; p.prevB2 = 0;
    this.sendInventory(p);
    this.sendTo(p, { t: 'life', life: LIFE_ALIVE, tools: this.toolsMsg(p) });
    return null;
  }

  private syncReserve(p: Player) {
    if (!p.loadout) return;
    p.reserve = [p.loadout.primary,p.loadout.secondary].map(w=>p.cargo.reduce((n,m)=>n+(m?.weapon===w.id?m.rounds:0),0));
    p.maxReserve = [...p.reserve];
  }
  private sendInventory(p: Player, purchased = false) {
    if (p.loadout) this.sendTo(p,{t:'inventory',items:loadoutIds(p.loadout),cargo:p.cargo,ammo:p.ammo,purchased});
  }
  buyEquipment(p: Player, items: string[], magazines: {slot:number;weapon:string}[]): string | null {
    const v=getEquipmentVendorPos(p.team,this.world);
    if(p.life!==LIFE_ALIVE || p.vehicleId!==-1 || Math.hypot(p.ms.x-v.x,p.ms.y-v.y,p.ms.z-v.z)>3.8) return 'Aproxime-se do comerciante de equipamento';
    if(!Array.isArray(items)||items.length>16||!Array.isArray(magazines)||magazines.length>16) return 'Compra inválida';
    const res=buildLoadout(items,p.level,Infinity);
    if(!res.ok) return res.error;
    const lo=res.loadout, old=p.loadout!;
    const specialist=lo.tools.filter(i=>['revive','defib','mark'].includes(i.tool ?? ''));
    if(specialist.length>1) return 'Escolha somente um especialista';
    const owned=new Set(loadoutIds(old));
    const bought=loadoutIds(lo).filter(id=>!owned.has(id));
    // som da compra no cliente: arma engatilhando se levou arma nova, zíper se foi só equipamento
    const boughtKind: 'weapon' | 'gear' = bought.some(id=>!!ITEM_BY_ID[id].weapon && priceFor(ITEM_BY_ID[id],p.level)>0) ? 'weapon' : 'gear';
    let cost=bought.reduce((n,id)=>n+priceFor(ITEM_BY_ID[id],p.level),0);
    const cap=cargoCapacity(lo);
    if(p.cargo.slice(cap).some(Boolean)) return 'Esvazie os espaços excedentes antes de trocar a mochila';
    const cargo=Array.from({length:cap},(_,i)=>p.cargo[i] ? {...p.cargo[i]!} : null);
    for(const m of magazines){
      if(!m || !Number.isInteger(m.slot)||m.slot<0||m.slot>=cap||cargo[m.slot]) return 'Espaço de carregador inválido ou ocupado';
      const w=ITEM_BY_ID[m.weapon];
      if(!w?.weapon||![lo.primary.id,lo.secondary.id].includes(w.id)) return 'Carregador incompatível';
      cargo[m.slot]={weapon:w.id,rounds:w.weapon.mag}; cost+=MAGAZINE_PRICE;
    }
    if(cost>p.cash) return 'Saldo insuficiente';
    p.cash-=cost; p.profileDirty=true;p.saveDirty=true;
    if(old.primary.id!==lo.primary.id) p.ammo[0]=lo.primary.weapon!.mag;
    if(old.secondary.id!==lo.secondary.id) p.ammo[1]=lo.secondary.weapon!.mag;
    p.loadout=lo;p.cargo=cargo;p.reloadEnd=0;
    const has=(kind:string)=>lo.tools.some(t=>t.tool===kind);
    const added=(kind:string)=>has(kind)&&!old.tools.some(t=>t.tool===kind);
    if(added('frag')) p.frags=FRAG_COUNT;
    if(added('medbag')) p.medbags=MEDBAG_USES;
    if(added('build')) p.builds=BUILD_USES;
    p.hasRevive=has('revive');p.hasDefib=has('defib');p.hasMark=has('mark');p.hasFob=has('fob');
    this.syncReserve(p);this.sendProfile(p);this.sendInventory(p,true);
    if(cost>0)this.sendTo(p,{t:'purchase',amount:cost,kind:boughtKind});
    this.sendTo(p,{t:'life',life:LIFE_ALIVE,tools:this.toolsMsg(p)});
    return null;
  }

  // ---------- economia ----------
  award(p: Player, kind: RewardKind) {
    const r = rewardFor(kind, this.whereOf(p));
    p.cash += r.cash; p.xp += r.xp; p.lifeProfit += r.cash;
    p.profileDirty = true; p.saveDirty = true;
    this.sendTo(p, { t: 'reward', kind, label: r.label, cash: r.cash, xp: r.xp });
  }

  // ---------- simulação ----------
  step() {
    const tick = ++this.tick;

    if (this.phase === 'warmup' && tick >= this.phaseEnd) { this.phase = 'live'; this.broadcast({ t: 'msg', text: 'Partida valendo! Avancem e dominem a Control Zone.' }); this.sendState(); }
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
        if (p.bot && tick >= p.downUntil) this.die(p, 'O bot desistiu de esperar');
      }
    }

    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      if (stepNade(n, this.world, DT)) {
        this.nades.splice(i, 1);
        this.explode(n);
      }
    }

    for (const v of this.vehicles.values()) {
      if (v.driverId === -1 && Math.abs(v.speed) > 0.05) {
        v.speed *= Math.max(0, 1 - 6 * DT);
        if (Math.abs(v.speed) < 0.05) v.speed = 0;
        stepVehicle(v, 0, DT, this.world);
      }
    }
    if (++this.vehicleSyncTick % 6 === 0 && this.vehicles.size > 0) {
      this.sendVehicles();
    }

    const hi = tick % HIST;
    for (const p of this.players) {
      p.hx[hi] = p.ms.x; p.hy[hi] = p.ms.y; p.hz[hi] = p.ms.z;
      p.hc[hi] = p.life === LIFE_NONE ? 0 : p.life === LIFE_DOWNED ? 3 : p.ms.prone ? 4 : p.ms.crouch ? 2 : 1;
    }

    if (tick % TICK_RATE === 0) this.everySecond();
    if (tick % 15 === 0) for (const p of this.players) if (p.conn && p.profileDirty) this.sendProfile(p);
    if (tick % 300 === 0) this.persistAll();
    if (tick % SNAPSHOT_EVERY === 0) this.sendSnapshots();
  }

  private everySecond() {
    const tick = this.tick;
    const alive: Player[] = [];
    if (this.drops.length) this.drops = this.drops.filter((d) => d.expireAt > tick);
    for (const p of this.players) {
      if (this.botShouldRespawn(p)) this.die(p, 'Reforço imediato');
      if (p.life !== LIFE_ALIVE) continue;
      alive.push(p);
      if (p.hp < HP_REGEN_CAP && tick - p.lastDamageTick > HP_REGEN_DELAY * TICK_RATE) p.hp = Math.min(HP_REGEN_CAP, p.hp + HP_REGEN_RATE);
    }
    // FOB: aliados por perto se curam e recebem munição
    for (const f of this.fobs) {
      if (!f) continue;
      for (const p of alive) {
        if (p.team !== f.team || (p.ms.x - f.x) ** 2 + (p.ms.z - f.z) ** 2 > FOB_RADIUS * FOB_RADIUS) continue;
        if (p.hp < MAX_HP) p.hp = Math.min(MAX_HP, p.hp + 4);
        if (p.bot && tick % (TICK_RATE * 6) === 0 && (p.reserve[0] < p.maxReserve[0] || p.reserve[1] < p.maxReserve[1])) {
          p.reserve[0] = p.maxReserve[0]; p.reserve[1] = p.maxReserve[1];
          const owner = this.players[f.owner];
          if (owner && owner !== p && owner.team === f.team && owner.life !== LIFE_NONE) this.award(owner, 'resupply');
        }
      }
    }
    // bots sem munição que voltaram à base reabastecem (humanos compram no comerciante)
    for (const p of alive) {
      if (!p.bot || (p.reserve[0] >= p.maxReserve[0] && p.reserve[1] >= p.maxReserve[1])) continue;
      const b = this.world.bases[p.team];
      if (Math.abs(p.ms.x - b.x) < 46 && Math.abs(p.ms.z - b.z) < 46) { p.reserve[0] = p.maxReserve[0]; p.reserve[1] = p.maxReserve[1]; }
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
      this.driftHotZone();
    } else {
      this.control = -1;
    }
    this.sendState();
  }

  private stateMsg(): ServerMsg {
    // HUD: só quem está vivo dentro da Control Zone
    const counts = [0, 0, 0];
    for (const p of this.players) if (p.life === LIFE_ALIVE && this.inCz(p)) counts[p.team]++;
    return {
      t: 'state', phase: this.phase, timeLeft: Math.max(0, Math.ceil((this.phaseEnd - this.tick) / TICK_RATE)),
      // 3 casas: a barra do próximo ponto enche suave
      scores: this.scores.map((s) => Math.round(s * 1000) / 1000), presence: this.presence, control: this.control,
      cz: this.cz, hz: this.hz, hzIn: Math.max(0, Math.ceil((this.hzMoveAt - this.tick) / TICK_RATE)),
      fobs: this.fobs.filter((f): f is Fob => !!f).map((f) => ({ team: f.team, x: f.x, z: f.z, hp: Math.round(f.hp) })),
      winner: this.winner, counts,
      drops: this.drops.map((d) => ({ id: d.id, x: d.x, y: d.y, z: d.z })),
    };
  }

  private inCz(p: Player): boolean { return (p.ms.x - this.cz.x) ** 2 + (p.ms.z - this.cz.z) ** 2 <= this.cz.r * this.cz.r; }
  private czCount(team: number): number {
    let n = 0;
    for (const p of this.players) if (p.team === team && p.life === LIFE_ALIVE && this.inCz(p)) n++;
    return n;
  }
  /** Bot caído com o time quase sem ninguém na zona renasce na hora (senão a partida desequilibra). */
  private botShouldRespawn(p: Player): boolean {
    return p.bot && p.life === LIFE_DOWNED && this.czCount(p.team) <= BOT_RESPAWN_MAX_IN_ZONE;
  }

  // ---------- loot ----------
  private lootBody(p: Player, target?: number): Player | undefined {
    if (p.life !== LIFE_ALIVE || p.vehicleId !== -1 || !p.loadout) return;
    return this.players.filter(e => e !== p && e.team !== p.team && e.life === LIFE_DOWNED && e.loadout && (target === undefined || e.id === target))
      .filter(e => Math.hypot(e.ms.x - p.ms.x, e.ms.y - p.ms.y, e.ms.z - p.ms.z) < LOOT_RANGE
        && this.world.canSee(p.ms.x, p.ms.y + .5, p.ms.z, e.ms.x, e.ms.y + .5, e.ms.z))
      .sort((a, b) => Math.hypot(a.ms.x - p.ms.x, a.ms.z - p.ms.z) - Math.hypot(b.ms.x - p.ms.x, b.ms.z - p.ms.z))[0];
  }

  private inspectLoot(p: Player) {
    const b = this.lootBody(p);
    if (!b) this.loot(p);
    this.sendTo(p, { t: 'lootView', body: b ? { target: b.id, revision: b.lootRevision, name: b.name, weapons: [b.loadout!.primary.id, b.loadout!.secondary.id], ammo: [...b.ammo], magazines: this.mags(b) } : null });
  }

  private swapLootWeapon(p: Player, target: number, revision: number, slot: number) {
    if (!Number.isInteger(target) || !Number.isInteger(revision) || (slot !== 0 && slot !== 1) || p.reloadEnd > 0) return;
    const b = this.lootBody(p, target);
    if (!b || b.lootRevision !== revision) { this.inspectLoot(p); return; }
    const a = p.loadout!, lo = b.loadout!, key = slot === 0 ? 'primary' : 'secondary';
    if (lo[key].empty) return;
    // Reservas virtuais dos bots ficam no corpo como carregadores da arma anterior.
    if (b.bot) {
      for (let left = b.reserve[slot]; left > 0; left -= lo[key].weapon!.mag) b.cargo.push({ weapon: lo[key].id, rounds: Math.min(left, lo[key].weapon!.mag) });
      b.reserve[slot] = 0;
    }
    [a[key], lo[key]] = [lo[key], a[key]];
    [p.ammo[slot], b.ammo[slot]] = [b.ammo[slot], p.ammo[slot]];
    const accessory = slot === 0 ? 'suppressor' : 'secondarySuppressor';
    [a[accessory], lo[accessory]] = [lo[accessory], a[accessory]];
    if (slot === 0) [a.sight, lo.sight] = [lo.sight, a.sight];
    p.nextFire = Math.max(p.nextFire, p.simTime + .45);
    b.reloadEnd = 0; b.lootRevision++;
    this.syncReserve(p); if (!b.bot) this.syncReserve(b);
    this.sendInventory(p); this.sendInventory(b); this.inspectLoot(p);
  }

  private mags(p: Player): Magazine[] {
    const out: Magazine[] = p.cargo.filter((m): m is Magazine => !!m && m.rounds > 0).map((m) => ({ ...m }));
    const lo = p.loadout;
    if (!lo) return out;
    [lo.primary, lo.secondary].forEach((it, i) => {
      if (p.ammo[i] > 0) out.push({ weapon: it.id, rounds: p.ammo[i] });
      if (p.bot) for (let left = p.reserve[i], size = it.weapon!.mag; left > 0 && out.length < 14; left -= size) out.push({ weapon: it.id, rounds: Math.min(size, left) });
    });
    return out.slice(0, 14);
  }

  private dropBackpack(p: Player) {
    const mags = this.mags(p);
    if (!mags.length) return;
    this.drops.push({ id: this.nextDrop++, x: p.ms.x, y: p.ms.y, z: p.ms.z, mags, expireAt: this.tick + BACKPACK_SECONDS * TICK_RATE });
    if (this.drops.length > 40) this.drops.shift();
  }

  /** Coloca um carregador no primeiro espaço livre, se a arma for uma das do jogador. */
  private giveMag(p: Player, mag: Magazine): boolean {
    const lo = p.loadout;
    if (!lo || (mag.weapon !== lo.primary.id && mag.weapon !== lo.secondary.id)) return false;
    const slot = p.cargo.findIndex((m) => !m);
    if (slot < 0) return false;
    p.cargo[slot] = mag;
    return true;
  }

  private loot(p: Player) {
    if (p.life !== LIFE_ALIVE || !p.loadout || p.vehicleId !== -1 || p.reloadEnd > 0) return;
    const r2 = LOOT_RANGE * LOOT_RANGE;
    const d2 = (x: number, y: number, z: number) => (x - p.ms.x) ** 2 + (z - p.ms.z) ** 2 + (y - p.ms.y) ** 2;
    let body: Player | null = null, drop: Drop | null = null, best = r2;
    for (const e of this.players) {
      if (e.life !== LIFE_DOWNED || e.team === p.team || !this.lootBody(p, e.id)) continue;
      const d = d2(e.ms.x, e.ms.y, e.ms.z);
      if (d < best) { best = d; body = e; drop = null; }
    }
    for (const dr of this.drops) {
      if (!this.world.canSee(p.ms.x, p.ms.y + .5, p.ms.z, dr.x, dr.y + .5, dr.z)) continue;
      const d = d2(dr.x, dr.y, dr.z);
      if (d < best) { best = d; drop = dr; body = null; }
    }
    if (!body && !drop) return;
    let got = 0;
    if (drop) {
      drop.mags = drop.mags.filter((mg) => { if (this.giveMag(p, mg)) { got++; return false; } return true; });
      if (!drop.mags.length) { this.drops = this.drops.filter((x) => x !== drop); this.sendState(); }
    } else if (body?.loadout) {
      const b = body;
      b.lootRevision++;
      for (let i = 0; i < b.cargo.length; i++) {
        const mg = b.cargo[i];
        if (mg && this.giveMag(p, mg)) { b.cargo[i] = null; got++; }
      }
      [b.loadout!.primary, b.loadout!.secondary].forEach((it, i) => {
        if (b.ammo[i] > 0 && this.giveMag(p, { weapon: it.id, rounds: b.ammo[i] })) { b.ammo[i] = 0; got++; }
      });
      if (b.bot) [b.loadout!.primary, b.loadout!.secondary].forEach((it, i) => {
        while (b.reserve[i] > 0) {
          const rounds = Math.min(it.weapon!.mag, b.reserve[i]);
          if (!this.giveMag(p, { weapon: it.id, rounds })) break;
          b.reserve[i] -= rounds; got++;
        }
      });
      else { this.syncReserve(b); this.sendInventory(b); }
    }
    this.syncReserve(p); this.sendInventory(p);
    this.sendTo(p, { t: 'msg', text: got > 0 ? `Você pegou ${got} carregador${got > 1 ? 'es' : ''}` : 'Nada útil ou sem espaço na mochila' });
  }
  private sendState() { this.broadcast(this.stateMsg()); }

  // ---------- input ----------
  processInput(p: Player, inp: InputMsg) {
    p.yaw = inp.yaw; p.pitch = inp.pitch; p.renderTick = inp.renderTick; p.ack = inp.seq;
    if (p.life === LIFE_ALIVE && p.loadout) {
      if (p.vehicleId !== -1) {
        const veh = this.vehicles.get(p.vehicleId);
        if (veh && veh.driverId === p.id) {
          stepVehicle(veh, inp.buttons, DT, this.world);
          p.ms.x = veh.x; p.ms.y = veh.y; p.ms.z = veh.z;
          p.yaw = veh.yaw;
          p.ms.vx = -Math.sin(veh.yaw) * veh.speed;
          p.ms.vz = -Math.cos(veh.yaw) * veh.speed;
          p.sprinting = false;
          p.simTime += DT;
          if ((inp.buttons2 & BTN2_USE) && !(p.prevB2 & BTN2_USE)) {
            this.dismountPlayer(p);
          }
        } else if (veh && veh.passengerId === p.id) {
          // garupa: vai atrás do piloto, olha e atira livremente
          p.ms.x = veh.x + Math.sin(veh.yaw) * 0.55; p.ms.z = veh.z + Math.cos(veh.yaw) * 0.55; p.ms.y = veh.y + 0.08;
          p.ms.vx = -Math.sin(veh.yaw) * veh.speed; p.ms.vz = -Math.cos(veh.yaw) * veh.speed; p.ms.vy = 0;
          p.sprinting = false;
          p.simTime += DT;
          if ((inp.buttons2 & BTN2_USE) && !(p.prevB2 & BTN2_USE)) this.dismountPlayer(p);
          else this.weapons(p, inp);
        } else {
          p.vehicleId = -1;
        }
      } else {
        const armor = p.loadout.armor?.armor ?? 0;
        stepMove(p.ms, inp.buttons, inp.yaw, this.world, DT, armor >= 4 ? 0.92 : armor === 3 ? 0.96 : 1, inp.buttons3);
        p.sprinting = (inp.buttons & BTN_SPRINT) !== 0 && !p.ms.prone && !p.ms.crouch && Math.hypot(p.ms.vx, p.ms.vz) > SPRINT_FLAG_SPEED;
        p.simTime += DT;
        this.weapons(p, inp);
        this.tools(p, inp);
      }
    }
    p.prevB = inp.buttons; p.prevB2 = inp.buttons2;
  }

  private weapons(p: Player, inp: InputMsg) {
    const lo = p.loadout!;
    const slot = inp.buttons2 & BTN2_SECONDARY ? 1 : 0;
    if (slot !== p.slot) { p.slot = slot; p.reloadEnd = 0; p.nextFire = Math.max(p.nextFire, p.simTime + 0.45); }
    const w = (slot === 0 ? lo.primary : lo.secondary).weapon!;
    if ((slot === 0 ? lo.primary : lo.secondary).empty) return;
    if (p.reloadEnd > 0) {
      if (p.simTime < p.reloadEnd) return;
      if (p.bot) {
        const take = Math.min(w.mag - p.ammo[slot], p.reserve[slot]);
        p.ammo[slot] += take; p.reserve[slot] -= take;
      } else {
        const weapon = slot === 0 ? lo.primary.id : lo.secondary.id;
        const index = p.cargo.findIndex(m => m?.weapon === weapon && m.rounds > 0);
        if (index >= 0) {
          const old = p.ammo[slot]; p.ammo[slot] = p.cargo[index]!.rounds;
          p.cargo[index] = old > 0 ? {weapon,rounds:old} : null;
          this.syncReserve(p); this.sendInventory(p);
        }
      }
      p.reloadEnd = 0;
    }
    const wantReload = (inp.buttons2 & BTN2_RELOAD) !== 0 && !(p.prevB2 & BTN2_RELOAD);
    if (p.reserve[slot] > 0 && ((wantReload && p.ammo[slot] < w.mag) || p.ammo[slot] === 0)) {
      p.reloadEnd = p.simTime + w.reload;
      return;
    }
    // correndo não atira: a arma está baixa; leva um instante para levantar
    if (p.sprinting) { p.nextFire = Math.max(p.nextFire, p.simTime + 0.25); return; }
    const fire = (inp.buttons & BTN_FIRE) !== 0;
    if (fire && (w.auto || !(p.prevB & BTN_FIRE)) && p.simTime >= p.nextFire && p.ammo[slot] > 0) {
      p.ammo[slot]--;
      p.nextFire = p.simTime + 60 / w.rpm;
      p.shot = (p.shot + 1) & 255;
      p.lastFireTick = this.tick; // atirar revela quem está escondido na moita
      this.shoot(p, w, (inp.buttons2 & BTN2_ADS) !== 0, slot === 0 ? lo.primary.name : lo.secondary.name);
    }
  }

  eyeY(p: Player) { return p.ms.y + eyeHeight(p.ms); }

  private shoot(p: Player, w: WeaponStats, ads: boolean, weaponName: string) {
    // sem mirar (botão direito) o tiro é bem impreciso: a ideia é obrigar a mirar
    let spread = ads ? w.adsSpread : w.spread * 2.5;
    const speed = Math.hypot(p.ms.vx, p.ms.vz);
    if (speed > 1.2) spread *= ads ? 1.8 : 1.5;
    if (!p.ms.onGround) spread *= 3;
    if (p.ms.prone) spread *= 0.5;
    else if (p.ms.crouch) spread *= 0.7;
    const ox = p.ms.x, oy = this.eyeY(p), oz = p.ms.z;
    const pellets = w.pellets ?? 1;
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
        else { ex = e.ms.x; ey = e.ms.y; ez = e.ms.z; st = e.life === LIFE_DOWNED ? 3 : e.ms.prone ? 4 : e.ms.crouch ? 2 : 1; }
        if (st === 4) {
          // deitado: corpo comprido na direção em que ele olha (cabeça à frente, pés atrás)
          const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
          const cxm = ex + fx * 0.35, czm = ez + fz * 0.35;
          if ((cxm - ox) * dx + (czm - oz) * dz < -2) continue;
          const th = raySphere(ox, oy, oz, dx, dy, dz, ex + fx * 1.13, ey + 0.3, ez + fz * 1.13, 0.18);
          let tb = -1;
          for (const f of [-0.4, 0, 0.4, 0.8]) {
            const t = raySphere(ox, oy, oz, dx, dy, dz, ex + fx * f, ey + 0.27, ez + fz * f, 0.27);
            if (t >= 0 && (tb < 0 || t < tb)) tb = t;
          }
          if (th >= 0 && th < best && (tb < 0 || th <= tb + 0.3)) { best = th; hit = e; head = true; }
          else if (tb >= 0 && tb < best) { best = tb; hit = e; head = false; }
          continue;
        }
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
        const th = raySphere(ox, oy, oz, dx, dy, dz, ex, ey + h - 0.15, ez, 0.26);
        const tb = rayCylinder(ox, oy, oz, dx, dy, dz, ex, ez, ey, ey + h - 0.3, 0.38);
        if (th >= 0 && th < best && (tb < 0 || th <= tb + 0.45)) { best = th; hit = e; head = true; }
        else if (tb >= 0 && tb < best) { best = tb; hit = e; head = false; }
      }
      let hitVeh: VehicleState | null = null;
      for (const v of this.vehicles.values()) {
        const dveh = rayCylinder(ox, oy, oz, dx, dy, dz, v.x, v.z, v.y, v.y + 1.2, 1.1);
        if (dveh >= 0 && dveh < best) {
          best = dveh;
          hit = null;
          hitVeh = v;
        }
      }
      if (hitVeh) {
        let dmg = w.dmg;
        if (best > w.falloffStart) {
          const f = Math.min(1, (best - w.falloffStart) / Math.max(1, w.falloffEnd - w.falloffStart));
          dmg *= 1 - f * (1 - w.minDmgMul);
        }
        hitVeh.hp -= dmg;
        totalDmg += dmg;
        if (hitVeh.hp <= 0) {
          this.destroyVehicle(hitVeh.id);
          anyKill = true;
        } else {
          this.sendVehicles();
        }
      } else if (hit) {
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
    if (victim.life !== LIFE_ALIVE || amount <= 0) return;
    victim.hp -= amount;
    victim.lastDamageTick = this.tick;
    if (attacker && attacker !== victim) { victim.damagers.set(attacker.id, this.tick); victim.lastAttacker = attacker.id; }
    if (victim.conn) this.sendTo(victim, { t: 'hurt', x: attacker ? attacker.ms.x : victim.ms.x, z: attacker ? attacker.ms.z : victim.ms.z, dmg: Math.round(amount) });
    if (victim.hp > 0) return;
    if (victim.life === LIFE_ALIVE) this.goDown(victim, attacker, weaponName, head);
    else this.die(victim, 'Você foi finalizado');
  }

  private goDown(victim: Player, attacker: Player | null, weaponName: string, head: boolean) {
    this.dismountPlayer(victim);
    victim.life = LIFE_DOWNED;
    victim.hp = 30;
    victim.downUntil = victim.bot ? this.tick + DOWNED_SECONDS * TICK_RATE : Infinity;
    victim.lootRevision++;
    victim.reviveProg = 0;
    victim.ms.vx = 0; victim.ms.vz = 0;
    this.sendTo(victim, { t: 'life', life: LIFE_DOWNED, downLeft: victim.bot ? DOWNED_SECONDS : -1 });
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
    if (this.botShouldRespawn(victim)) this.die(victim, 'Reforço imediato');
  }

  die(p: Player, reason: string) {
    if (p.life === LIFE_NONE) return;
    this.dismountPlayer(p);
    this.dropBackpack(p); // o corpo some; só a mochila fica para lootear
    p.life = LIFE_NONE;
    p.hp = 0;
    p.deaths++;
    if (p.profile) p.profile.deaths++;
    p.loadout = null; // morreu: perdeu o equipamento comprado
    p.lifeProfit = 0;
    p.profileDirty = true; p.saveDirty = true;
    const wait = p.bot ? BOT_RESPAWN_SECONDS : RESPAWN_SECONDS;
    p.respawnAt = this.tick + wait * TICK_RATE + (p.bot ? Math.floor(this.rnd() * 5 * TICK_RATE) : 0);
    this.sendTo(p, { t: 'life', life: LIFE_NONE, reason, wait });
  }

  private tools(p: Player, inp: InputMsg) {
    const b2 = inp.buttons2, edge = b2 & ~p.prevB2;
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
          this.sendTo(best, { t: 'life', life: LIFE_ALIVE, tools: this.toolsMsg(best) });
          this.sendTo(best, { t: 'msg', text: `${p.name} te reanimou — você voltou com o equipamento que estava no corpo.` });
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
      this.sendTo(p, { t: 'life', life: LIFE_ALIVE, tools: this.toolsMsg(p) });
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
        this.sendTo(p, { t: 'life', life: LIFE_ALIVE, tools: this.toolsMsg(p) });
      }
    }
    if (edge & BTN2_BUILD && p.builds > 0 && p.ms.onGround) this.buildSandbag(p);
    if (edge & BTN2_MARK && p.hasMark && p.simTime >= p.markReady) this.mark(p);
    if (inp.buttons3 & BTN3_FOB && p.hasFob && p.ms.onGround) this.buildFob(p);
  }

  private buildSandbag(p: Player) {
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const cx = p.ms.x + fx * 1.9, cz = p.ms.z + fz * 1.9;
    const alongX = Math.abs(fx) < Math.abs(fz);
    const hw = alongX ? 1.3 : 0.4, hd = alongX ? 0.4 : 1.3;
    const gy = this.world.heightAt(cx, cz);
    if (Math.abs(gy - p.ms.y) > 1.2) return;
    if (!this.world.canBuild(cx - hw, cz - hd, cx + hw, cz + hd)) return;
    for (const e of this.players) {
      if (e.life === LIFE_NONE) continue;
      if (e.ms.x > cx - hw - 0.5 && e.ms.x < cx + hw + 0.5 && e.ms.z > cz - hd - 0.5 && e.ms.z < cz + hd + 0.5) return;
    }
    const b = this.world.addBox({ id: 0, x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, y0: gy - 1, y1: gy + 1.1, kind: BoxKind.Sandbag, color: 0xb9a57c });
    this.sandbags.push(b.id);
    p.builds--;
    this.broadcast({ t: 'build', add: [b] });
    if (this.sandbags.length > 120) {
      const old = this.sandbags.shift()!;
      this.world.removeBox(old);
      this.broadcast({ t: 'build', remove: [old] });
    }
    p.points += 1;
    this.award(p, 'build');
    this.sendTo(p, { t: 'life', life: LIFE_ALIVE, tools: this.toolsMsg(p) });
  }

  /** FOB: caixa de suprimentos do time cercada por sacos de areia, à frente do jogador. */
  buildFob(p: Player): boolean {
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const cx = p.ms.x + fx * 6, cz = p.ms.z + fz * 6;
    const err = (t: string) => { this.sendTo(p, { t: 'msg', text: t }); p.hasFob = p.hasFob; return false; };
    if (this.world.bases.some((b) => Math.hypot(b.x - cx, b.z - cz) < FOB_MIN_BASE_DIST)) return err('Longe demais da frente: monte a FOB mais perto da zona');
    const R = 4.2;
    if (!this.world.canBuild(cx - R, cz - R, cx + R, cz + R)) return err('Sem espaço aqui para a FOB');
    const hs = [this.world.heightAt(cx - R, cz - R), this.world.heightAt(cx + R, cz - R), this.world.heightAt(cx - R, cz + R), this.world.heightAt(cx + R, cz + R)];
    if (Math.max(...hs) - Math.min(...hs) > 1.6) return err('Terreno inclinado demais para a FOB');
    for (const e of this.players) {
      if (e.life !== LIFE_NONE && Math.abs(e.ms.x - cx) < R + 0.6 && Math.abs(e.ms.z - cz) < R + 0.6) return err('Tem gente no caminho da FOB');
    }
    // substitui a FOB antiga do time
    const old = this.fobs[p.team];
    if (old) this.destroyFob(p.team, null, false);
    const gy = this.world.heightAt(cx, cz);
    const ids: Box[] = [];
    const add = (x0: number, z0: number, x1: number, z1: number, h: number, kind: number, color: number) =>
      ids.push(this.world.addBox({ id: 0, x0: cx + x0, x1: cx + x1, z0: cz + z0, z1: cz + z1, y0: gy - 1, y1: gy + h, kind, color }));
    const TEAM_CRATE = [0x3b6fd1, 0xc9433a, 0x3f9e4a];
    add(-0.8, -0.7, 0.8, 0.7, 1.15, BoxKind.Fob, TEAM_CRATE[p.team]);
    for (const s of [-1, 1]) {
      add(-3.2, s * R - 0.4, -1.0, s * R + 0.4, 1.15, BoxKind.Sandbag, 0xb9a57c);
      add(1.0, s * R - 0.4, 3.2, s * R + 0.4, 1.15, BoxKind.Sandbag, 0xb9a57c);
      add(s * R - 0.4, -3.2, s * R + 0.4, -1.0, 1.15, BoxKind.Sandbag, 0xb9a57c);
      add(s * R - 0.4, 1.0, s * R + 0.4, 3.2, 1.15, BoxKind.Sandbag, 0xb9a57c);
    }
    this.fobs[p.team] = { team: p.team, x: cx, z: cz, y: gy, hp: FOB_HP, ids: ids.map((b) => b.id), owner: p.id };
    p.hasFob = false;
    this.broadcast({ t: 'build', add: ids });
    for (const q of this.players) if (q.team === p.team) this.sendTo(q, { t: 'msg', text: `${p.name} ergueu uma FOB: munição e cura perto da caixa do time` });
    this.award(p, 'fob');
    this.sendTo(p, { t: 'life', life: LIFE_ALIVE, tools: this.toolsMsg(p) });
    this.sendState();
    return true;
  }

  private destroyFob(team: number, by: Player | null, announce = true) {
    const f = this.fobs[team];
    if (!f) return;
    for (const id of f.ids) this.world.removeBox(id);
    this.broadcast({ t: 'build', remove: f.ids });
    this.fobs[team] = null;
    if (announce) {
      this.broadcast({ t: 'msg', text: `FOB do time ${TEAM_NAMES[team]} foi destruída!` });
      if (by && by.team !== team) this.award(by, 'fobKill');
    }
    this.sendState();
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
    // FOBs inimigas sofrem dano de explosão
    for (const f of this.fobs) {
      if (!f || f.team === owner.team) continue;
      const d = Math.hypot(f.x - n.x, f.y + 0.6 - n.y, f.z - n.z);
      if (d > NADE_RADIUS + 1.5) continue;
      f.hp -= NADE_DAMAGE * (1 - d / (NADE_RADIUS + 1.5)) * 1.2;
      if (f.hp <= 0) this.destroyFob(f.team, owner);
      else this.sendState();
    }
    for (const v of this.vehicles.values()) {
      const d = Math.hypot(v.x - n.x, v.y + 0.6 - n.y, v.z - n.z);
      if (d <= NADE_RADIUS + 1.2) {
        v.hp -= NADE_DAMAGE * (1 - d / (NADE_RADIUS + 1.2)) * 1.5;
        if (v.hp <= 0) this.destroyVehicle(v.id);
        else this.sendVehicles();
      }
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
        id: p.id, x: p.ms.x, y: p.ms.y, z: p.ms.z, yaw: p.yaw, pitch: p.pitch, life: p.life, crouch: p.ms.crouch, prone: p.ms.prone, sprint: p.sprinting,
        suppressed: !!(p.slot===0 ? lo?.suppressor : lo?.secondarySuppressor), marked: false, team: p.team, armor: lo?.armor?.armor ?? 0, helmet: lo?.helmet?.helmet ?? 0, pack: lo?.pack?.pack ?? 0,
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
          flags: (p.reloadEnd > 0 ? 1 : 0) | (p.ms.onGround ? 2 : 0) | (p.ms.crouch ? 4 : 0) | (p.ms.tired ? 8 : 0) | (p.ms.prone ? 16 : 0), slot,
          stamina: p.ms.stamina, stanceCd: p.ms.stanceCd,
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
