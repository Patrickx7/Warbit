import * as THREE from 'three';
import {
  BTN2_ADS, BTN2_BUILD, BTN2_HEAL, BTN2_MARK, BTN2_NADE, BTN2_RELOAD, BTN2_SECONDARY, BTN2_USE, BTN3_FOB, BTN3_PRONE, BTN_BACK, BTN_CROUCH,
  BTN_FIRE, BTN_FWD, BTN_JUMP, BTN_LEFT, BTN_RIGHT, BTN_SPRINT, BoxKind, DT, ITEMS, LIFE_ALIVE, LIFE_DOWNED, LIFE_NONE, MSG_SNAPSHOT,
  REVIVE_RANGE, SPRINT_FLAG_SPEED, TEAM_NAMES, TICK_RATE, World, aimDir, buildLoadout, decodeSnapshot, encodeInput, eyeHeight, maskHas,
  newMoveState, stepMove, whereIs,
  type ClientMsg, type EntityState, type Loadout, type MoveState, type OwnState, type RosterEntry, type ServerMsg, type Snapshot, type Zone,
} from '@warbit/shared';
import { Sfx } from './audio';
import { Fx } from './render/fx';
import { GameScene } from './render/scene';
import { GUN_KIND, Soldiers, TEAM_LOOK, type SoldierPose } from './render/soldiers';
import { SoldierPreview } from './render/preview';
import { ViewModel } from './render/viewmodel';
import { UI, esc, type MapDot, type MapFob } from './ui';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const UNIFORM = TEAM_LOOK.map((l) => l.jacket);
const BASE_FOV = 75;
const DEG = Math.PI / 180;
const KEYS_TO_LOCK = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyZ', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyB', 'KeyG', 'KeyH', 'KeyN', 'ControlLeft'];

interface Sample { t: number; x: number; y: number; z: number; yaw: number; pitch: number }
interface Ent { samples: Sample[]; s: EntityState; shot: number; x: number; y: number; z: number; yaw: number; pitch: number }

const dir = { x: 0, y: 0, z: 0 };
const tmpV = new THREE.Vector3();
const pose: SoldierPose = { id: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: false, prone: false, sprint: false, downed: false, team: 0, armor: 0, helmet: 0, gun: 0, marker: 0, camo: 0, pack: 0, dist: 0 };

function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

class Game {
  ui = new UI();
  sfx = new Sfx();
  preview = new SoldierPreview($<HTMLCanvasElement>('preview'));
  ws: WebSocket | null = null;
  world!: World;
  gs!: GameScene;
  soldiers!: Soldiers;
  fx!: Fx;
  vm!: ViewModel;
  ready = false;
  name = 'Mercenário';
  reconnects = 0;
  closing = false;

  myId = -1; myTeam = 0;
  roster = new Map<number, RosterEntry>();
  life = LIFE_NONE;
  own: OwnState | null = null;
  pred: MoveState = newMoveState();
  prevX = 0; prevY = 0; prevZ = 0;
  errX = 0; errY = 0; errZ = 0;
  pending: { seq: number; buttons: number; buttons3: number; yaw: number }[] = [];
  seq = 0;
  yaw = 0; pitch = 0; lastYaw = 0; lastPitch = 0;
  // recuo: deslocamento da mira em cima da mira do jogador; volta sozinho ao parar de atirar
  recP = 0; recY = 0; burst = 0; lastShotWall = 0;
  eye = 1.62;
  keys = new Set<string>();
  mouseL = false; mouseR = false;
  prone = false;
  slot = 0;
  prevButtons = 0;
  simTime = 0; nextFire = 0; localAmmo = 0; lastShotAt = -1;
  loadout: Loadout | null = null;
  speedMul = 1;
  tools = { frag: 0, medbag: 0, build: 0, fob: 0 };
  downUntil = 0;
  faceZone = false;
  builds = new Set<number>();

  ents = new Map<number, Ent>();
  tickOffset = 0; haveOffset = false;
  cz: Zone = { x: 750, z: 750, r: 150 }; hz: Zone = { x: 750, z: 750, r: 30 };
  fobs: MapFob[] = [];
  phase = 'warmup';

  acc = 0; last = 0;
  fps = 60; ping = 0; hudAt = 0; boardAt = 0;
  sens = 1;
  bytesIn = 0; kbps = 0; kbAt = 0;

  // ---------- conexão ----------
  connect(name: string) {
    this.name = name;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    $('status').textContent = 'Conectando…';
    ws.onopen = () => {
      let token: string | undefined;
      try { token = localStorage.getItem('warbit.token') ?? undefined; } catch { /* sem armazenamento */ }
      this.send({ t: 'hello', name, token });
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') { this.bytesIn += ev.data.length; this.onJson(JSON.parse(ev.data) as ServerMsg); }
      else { this.bytesIn += (ev.data as ArrayBuffer).byteLength; this.onBinary(ev.data as ArrayBuffer); }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      document.exitPointerLock();
      this.ents.clear();
      this.life = LIFE_NONE;
      // caiu o servidor/rede: tenta voltar sozinho (até 6 vezes)
      if (this.ready && !this.closing && this.reconnects < 6) {
        this.reconnects++;
        this.ui.center(`Conexão perdida — reconectando (${this.reconnects}/6)…`, 2500);
        setTimeout(() => { if (!this.ws) this.connect(this.name); }, 1500 * this.reconnects);
        return;
      }
      this.ui.show('menu', true); this.ui.show('shop', false); this.ui.show('hud', false); this.ui.show('paused', false);
      $('status').textContent = this.ready ? 'Conexão perdida. Entre de novo.' : 'Não foi possível conectar ao servidor (npm run dev).';
    };
    ws.onerror = () => {};
  }

  send(m: ClientMsg) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  private init(seed: number) {
    if (this.ready) return;
    this.world = new World(seed);
    this.gs = new GameScene(canvas, this.world);
    this.gs.setQuality(Number($<HTMLSelectElement>('quality').value));
    this.soldiers = new Soldiers();
    this.gs.scene.add(this.soldiers.group);
    this.fx = new Fx(this.gs.scene, this.world);
    this.vm = new ViewModel(this.gs.camera, UNIFORM[this.myTeam]);
    this.ui.setWorld(this.world);
    this.ready = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
  }

  private name_(id: number) {
    const e = this.roster.get(id);
    return e ? `<span class="c${e.team}">${esc(e.name)}</span>` : '?';
  }

  private applyBuild(add?: { id: number; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; kind: number; color: number }[], remove?: number[]) {
    for (const b of add ?? []) {
      if (this.builds.has(b.id)) continue;
      this.builds.add(b.id);
      this.world.addBox({ ...b });
      this.gs.addBuild({ ...b });
    }
    for (const id of remove ?? []) {
      if (!this.builds.delete(id)) continue;
      this.world.removeBox(id);
      this.gs.removeBuild(id);
    }
  }

  private onJson(m: ServerMsg) {
    switch (m.t) {
      case 'welcome':
        this.myId = m.id; this.myTeam = m.team; this.reconnects = 0;
        try { localStorage.setItem('warbit.token', m.token); } catch { /* ignora */ }
        this.setRoster(m.roster);
        this.init(m.seed);
        this.vm.setSleeve(UNIFORM[this.myTeam]);
        this.applyBuild(m.builds);
        this.life = LIFE_NONE; this.loadout = null; this.haveOffset = false;
        this.ui.show('menu', false); this.ui.show('hud', true);
        this.ui.openShop(`Você é do time ${TEAM_NAMES[this.myTeam]}. Escolha o que comprar — nada vem marcado.`);
        break;
      case 'roster': this.setRoster(m.roster); break;
      case 'state':
        this.cz = m.cz; this.hz = m.hz; this.phase = m.phase; this.fobs = m.fobs;
        if (this.ready) this.gs.setZones(m.cz, m.hz);
        this.ui.setState(m, this.myTeam);
        break;
      case 'profile': this.ui.setProfile(m); break;
      case 'reward': this.ui.reward(m.label, m.cash, m.xp); this.sfx.cash(); break;
      case 'kill': {
        this.ui.feed(`${m.killer >= 0 ? this.name_(m.killer) : 'Zona'} <small>[${esc(m.weapon)}${m.head ? ' · cabeça' : ''}]</small> ${this.name_(m.victim)}`);
        if (m.victim === this.myId && m.killer >= 0) this.ui.center(`Derrubado por ${this.roster.get(m.killer)?.name ?? '?'}`);
        break;
      }
      case 'hit': this.ui.hitmarker(m.kill); this.sfx.hit(m.kill); break;
      case 'hurt': this.ui.hurt(); this.sfx.hurt(); break;
      case 'life': this.setLife(m.life, m.reason, m.downLeft, m.tools, m.wait); break;
      case 'shopError': this.ui.shopError(m.error); break;
      case 'build': this.applyBuild(m.add, m.remove); break;
      case 'nade': this.fx.addNade({ ...m, owner: -1 }); break;
      case 'boom': {
        this.fx.boom(m.x, m.y, m.z);
        const c = this.gs.camera.position;
        this.sfx.boom(Math.hypot(m.x - c.x, m.z - c.z), this.panOf(m.x, m.z));
        break;
      }
      case 'board': this.ui.board(m.rows, this.roster, this.myId); break;
      case 'msg': this.ui.center(m.text); if (m.text.includes('Hot Zone')) this.sfx.alert(); break;
      case 'pong': this.ping = Math.round(performance.now() - m.c); break;
    }
  }

  private setRoster(r: RosterEntry[]) {
    this.roster.clear();
    for (const e of r) this.roster.set(e.id, e);
  }

  private setLife(life: number, reason?: string, downLeft?: number, tools?: Record<string, number>, wait?: number) {
    const was = this.life;
    this.life = life;
    if (tools) { this.tools.frag = tools.frag ?? 0; this.tools.medbag = tools.medbag ?? 0; this.tools.build = tools.build ?? 0; this.tools.fob = tools.fob ?? 0; this.refreshTools(); }
    if (life === LIFE_ALIVE) {
      this.ui.closeShop(); this.ui.downed(false);
      if (was !== LIFE_ALIVE) { this.pending.length = 0; this.errX = this.errY = this.errZ = 0; this.prevButtons = 0; }
      if (was === LIFE_NONE) { this.slot = 0; this.nextFire = 0; this.simTime = 0; this.lastShotAt = -1; this.faceZone = true; this.prone = false; this.recP = this.recY = 0; this.burst = 0; }
      this.lockInput();
    } else if (life === LIFE_DOWNED) {
      this.downUntil = performance.now() + (downLeft ?? 20) * 1000;
      this.ui.downed(true, downLeft ?? 20);
    } else {
      this.ui.downed(false);
      this.loadout = null;
      this.prone = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      this.ui.show('paused', false);
      this.ui.openShop(reason ? `${reason}. Equipamento perdido — escolha de novo.` : 'Escolha o que comprar.', wait ?? 0);
    }
  }

  private refreshTools() {
    const lo = this.loadout;
    if (!lo) { this.ui.setTools([]); return; }
    const list: { key: string; label: string; n?: number }[] = [];
    for (const t of lo.tools) {
      if (t.tool === 'frag') list.push({ key: 'G', label: 'Granada', n: this.tools.frag });
      else if (t.tool === 'medbag') list.push({ key: 'H', label: 'Bolsa médica', n: this.tools.medbag });
      else if (t.tool === 'build') list.push({ key: 'B', label: 'Sacos de areia', n: this.tools.build });
      else if (t.tool === 'fob') list.push({ key: 'F', label: 'Kit de FOB', n: this.tools.fob });
      else if (t.tool === 'revive') list.push({ key: 'E', label: 'Reanimador' });
      else if (t.tool === 'defib') list.push({ key: 'E', label: 'Desfibrilador' });
      else if (t.tool === 'mark') list.push({ key: 'Q', label: 'Marcar alvo' });
    }
    this.ui.setTools(list);
  }

  spawn(items: string[]) {
    const r = buildLoadout(items, this.ui.profile.level, this.ui.profile.cash);
    if (!r.ok) { this.ui.shopError(r.error); return; }
    this.loadout = r.loadout;
    const armor = r.loadout.armor?.armor ?? 0;
    this.speedMul = armor >= 4 ? 0.92 : armor === 3 ? 0.96 : 1;
    this.localAmmo = r.loadout.primary.weapon!.mag;
    this.sfx.click();
    this.send({ t: 'spawn', items });
  }

  // ---------- snapshots ----------
  private onBinary(buf: ArrayBuffer) {
    const v = new DataView(buf);
    if (v.getUint8(0) !== MSG_SNAPSHOT || !this.ready) return;
    const s = decodeSnapshot(v);
    const now = performance.now();
    const sample = s.tick - now * (TICK_RATE / 1000);
    if (!this.haveOffset || Math.abs(sample - this.tickOffset) > 12) { this.tickOffset = sample; this.haveOffset = true; }
    else this.tickOffset += (sample - this.tickOffset) * 0.05;
    this.applyOwn(s);
    for (const id of this.ents.keys()) if (!maskHas(s.alive, id)) { this.ents.delete(id); this.soldiers.forget(id); }
    for (const e of s.ents) {
      let ent = this.ents.get(e.id);
      if (!ent) { ent = { samples: [], s: e, shot: e.shot, x: e.x, y: e.y, z: e.z, yaw: e.yaw, pitch: e.pitch }; this.ents.set(e.id, ent); }
      const shots = (e.shot - ent.shot) & 255;
      ent.shot = e.shot;
      ent.s = e;
      ent.samples.push({ t: s.tick, x: e.x, y: e.y, z: e.z, yaw: e.yaw, pitch: e.pitch });
      if (ent.samples.length > 8) ent.samples.shift();
      if (shots > 0 && shots < 12) this.remoteShot(e, Math.min(shots, 3));
    }
  }

  private applyOwn(s: Snapshot) {
    const o = s.own;
    this.own = o;
    if (o.life !== this.life && (o.life === LIFE_ALIVE || this.life === LIFE_ALIVE) && o.life !== LIFE_NONE) this.setLife(o.life);
    const p = this.pred;
    if (o.life === LIFE_ALIVE) {
      if (this.faceZone) {
        this.faceZone = false;
        this.yaw = Math.atan2(-(this.cz.x - o.x), -(this.cz.z - o.z));
        this.pitch = 0;
      }
      const bx = p.x, by = p.y, bz = p.z;
      p.x = o.x; p.y = o.y; p.z = o.z; p.vx = o.vx; p.vy = o.vy; p.vz = o.vz;
      p.onGround = (o.flags & 2) !== 0; p.crouch = (o.flags & 4) !== 0; p.tired = (o.flags & 8) !== 0; p.prone = (o.flags & 16) !== 0;
      p.stamina = o.stamina; p.stanceCd = o.stanceCd;
      let i = 0;
      while (i < this.pending.length && this.pending[i].seq <= s.ack) i++;
      if (i) this.pending.splice(0, i);
      for (const inp of this.pending) stepMove(p, inp.buttons, inp.yaw, this.world, DT, this.speedMul, inp.buttons3);
      const dx = bx - p.x, dy = by - p.y, dz = bz - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 9) { this.errX = this.errY = this.errZ = 0; this.prevX = p.x; this.prevY = p.y; this.prevZ = p.z; }
      else if (d2 > 1e-6) { this.errX += dx; this.errY += dy; this.errZ += dz; this.prevX -= dx; this.prevY -= dy; this.prevZ -= dz; }
    } else {
      p.x = o.x; p.y = o.y; p.z = o.z; p.vx = p.vy = p.vz = 0;
      p.crouch = false; p.prone = false;
      this.prevX = p.x; this.prevY = p.y; this.prevZ = p.z;
      this.pending.length = 0;
    }
    if (this.simTime - this.lastShotAt > 0.3 || o.ammo < this.localAmmo) this.localAmmo = o.ammo;
  }

  private panOf(x: number, z: number) {
    const dx = x - this.gs.camera.position.x, dz = z - this.gs.camera.position.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw)) / d;
  }

  private remoteShot(e: EntityState, n: number) {
    const it = ITEMS[e.weapon];
    const kind = GUN_KIND[it?.weapon?.cls ?? 'rifle'] ?? 0;
    const oy = e.y + eyeHeight(e) - 0.1;
    const c = this.gs.camera.position;
    const dist = Math.hypot(e.x - c.x, e.y - c.y, e.z - c.z);
    for (let i = 0; i < n; i++) {
      aimDir(e.yaw + (Math.random() - 0.5) * 0.03, e.pitch + (Math.random() - 0.5) * 0.03, dir);
      const len = this.world.raycast(e.x, oy, e.z, dir.x, dir.y, dir.z, 260);
      this.fx.tracer(e.x + dir.x * 0.6, oy, e.z + dir.z * 0.6, dir.x, dir.y, dir.z, len);
    }
    if (dist < 220) this.fx.flash(e.x + dir.x * 0.9, oy + dir.y * 0.9, e.z + dir.z * 0.9);
    this.sfx.shot(kind, dist, this.panOf(e.x, e.z));
  }

  // ---------- entrada ----------
  private locked() { return document.pointerLockElement === canvas; }

  /** captura mouse e teclado (em tela cheia, o navegador deixa de tratar Ctrl+W etc.) */
  private lockInput() {
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock()?.catch?.(() => {});
  }

  private buttons(): [number, number, number] {
    if (!this.locked()) return [0, 0, 0];
    const k = this.keys;
    let b = 0, b2 = 0, b3 = 0;
    if (k.has('KeyW')) b |= BTN_FWD;
    if (k.has('KeyS')) b |= BTN_BACK;
    if (k.has('KeyA')) b |= BTN_LEFT;
    if (k.has('KeyD')) b |= BTN_RIGHT;
    if (k.has('Space')) b |= BTN_JUMP;
    if (k.has('KeyC')) b |= BTN_CROUCH;
    if (k.has('ShiftLeft')) b |= BTN_SPRINT;
    if (this.mouseL) b |= BTN_FIRE;
    if (k.has('KeyR')) b2 |= BTN2_RELOAD;
    if (k.has('KeyE')) b2 |= BTN2_USE;
    if (this.mouseR) b2 |= BTN2_ADS;
    if (this.slot === 1) b2 |= BTN2_SECONDARY;
    if (k.has('KeyG')) b2 |= BTN2_NADE;
    if (k.has('KeyH')) b2 |= BTN2_HEAL;
    if (k.has('KeyB')) b2 |= BTN2_BUILD;
    if (k.has('KeyQ')) b2 |= BTN2_MARK;
    if (k.has('KeyF')) b3 |= BTN3_FOB;
    if (this.prone) b3 |= BTN3_PRONE;
    return [b, b2, b3];
  }

  private weapon() {
    const lo = this.loadout;
    return lo ? (this.slot === 0 ? lo.primary : lo.secondary) : null;
  }

  /** aumento efetivo ao mirar: mira comprada > aumento embutido da arma */
  private effZoom(): number {
    const w = this.weapon()?.weapon;
    if (!w) return 1;
    const s = this.slot === 0 ? this.loadout?.sight?.sight : undefined;
    return s ? s.zoom : w.zoom;
  }

  private tick() {
    const p = this.pred;
    this.prevX = p.x; this.prevY = p.y; this.prevZ = p.z;
    this.fx.tick(DT);
    if (this.life !== LIFE_ALIVE) return;
    const [b, b2, b3] = this.buttons();
    const aimYaw = this.yaw + this.recY, aimPitch = Math.max(-1.5, Math.min(1.5, this.pitch + this.recP));
    stepMove(p, b, aimYaw, this.world, DT, this.speedMul, b3);
    this.simTime += DT;
    const seq = ++this.seq;
    this.pending.push({ seq, buttons: b, buttons3: b3, yaw: aimYaw });
    if (this.pending.length > 90) this.pending.shift();
    const rt = Math.max(0, Math.floor(performance.now() * (TICK_RATE / 1000) + this.tickOffset - 4));
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeInput({ seq, buttons: b, buttons2: b2, buttons3: b3, yaw: aimYaw, pitch: aimPitch, renderTick: rt }));

    // tiro local (efeito imediato; o servidor decide o acerto)
    const it = this.weapon();
    const w = it?.weapon;
    const sprinting = (b & BTN_SPRINT) !== 0 && !p.prone && !p.crouch && Math.hypot(p.vx, p.vz) > SPRINT_FLAG_SPEED;
    if (w && b & BTN_FIRE && !sprinting && (w.auto || !(this.prevButtons & BTN_FIRE)) && this.simTime >= this.nextFire && this.localAmmo > 0 && !(this.own && this.own.flags & 1)) {
      this.localAmmo--;
      this.nextFire = this.simTime + 60 / w.rpm;
      this.lastShotAt = this.simTime;
      const ads = (b2 & BTN2_ADS) !== 0;
      this.vm.fire(w.recoil);
      const eyeY = p.y + this.eye;
      const n = w.pellets ?? 1;
      const sp = ads ? w.adsSpread : w.spread * 2.5;
      const cam = this.gs.camera;
      cam.updateMatrixWorld();
      tmpV.copy(this.vm.muzzle);
      if (this.vm.group.visible && this.vm.adsAmount < 0.85) cam.localToWorld(tmpV); else tmpV.set(p.x, eyeY - 0.12, p.z);
      for (let i = 0; i < n; i++) {
        aimDir(aimYaw + (Math.random() - 0.5) * sp, aimPitch + (Math.random() - 0.5) * sp, dir);
        const len = this.world.raycast(p.x, eyeY, p.z, dir.x, dir.y, dir.z, 300);
        // o risco sai do cano e vai até o ponto de impacto: mostra a direção real do tiro
        const hx = p.x + dir.x * len, hy = eyeY + dir.y * len, hz = p.z + dir.z * len;
        const vx = hx - tmpV.x, vy = hy - tmpV.y, vz = hz - tmpV.z, vl = Math.hypot(vx, vy, vz) || 1;
        this.fx.tracer(tmpV.x, tmpV.y, tmpV.z, vx / vl, vy / vl, vz / vl, vl, len < 299);
      }
      this.fx.flash(tmpV.x, tmpV.y, tmpV.z);
      this.sfx.shot(GUN_KIND[w.cls] ?? 0, 0, 0);
      // recuo: sobe pouco, estabiliza e VOLTA sozinho quando para de atirar
      const stanceK = p.prone ? 0.55 : p.crouch ? 0.8 : 1;
      const kick = w.recoil * DEG * (ads ? 0.32 : 0.5) * stanceK / (1 + 0.22 * this.burst);
      this.recP = Math.min(0.1, this.recP + kick);
      this.recY = Math.max(-0.045, Math.min(0.045, this.recY + (Math.random() - 0.5) * kick * 0.8));
      this.burst++;
      this.lastShotWall = performance.now();
    }
    this.prevButtons = b;
  }

  /** as moitas balançam com o jogador e com os 15 soldados mais próximos */
  private updateMovers(t: number) {
    const cam = this.gs.camera.position;
    const list: { x: number; z: number; d: number }[] = [];
    if (this.life !== LIFE_NONE) list.push({ x: cam.x, z: cam.z, d: 0 });
    for (const e of this.ents.values()) {
      const d = (e.x - cam.x) ** 2 + (e.z - cam.z) ** 2;
      if (d > 900) continue;
      list.push({ x: e.x, z: e.z, d });
    }
    list.sort((a, b) => a.d - b.d);
    this.gs.setMovers(list.slice(0, 16), t);
  }

  // ---------- quadro ----------
  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n < 5) { this.tick(); this.acc -= DT; n++; }
    if (this.acc > DT) this.acc = 0;
    const alpha = this.acc / DT;

    // o recuo volta ao ponto de origem quando o jogador para de atirar
    if (now - this.lastShotWall > 110) {
      const k = Math.exp(-dt * 7);
      this.recP *= k; this.recY *= k;
      if (Math.abs(this.recP) < 1e-4) this.recP = 0;
      if (Math.abs(this.recY) < 1e-4) this.recY = 0;
      this.burst = Math.max(0, this.burst - dt * 6);
    }

    const cam = this.gs.camera;
    const p = this.pred;
    const k = Math.exp(-dt * 14);
    this.errX *= k; this.errY *= k; this.errZ *= k;
    const alive = this.life === LIFE_ALIVE;
    const it = this.weapon();
    const w = it?.weapon;
    let ads = false;
    const zoomEff = this.effZoom();

    if (this.life === LIFE_NONE) {
      const a = now / 9000;
      const cy = this.world.heightAt(this.cz.x, this.cz.z);
      cam.position.set(this.cz.x + Math.cos(a) * 230, cy + 120, this.cz.z + Math.sin(a) * 230);
      cam.lookAt(this.cz.x, cy + 5, this.cz.z);
      cam.fov = BASE_FOV;
    } else {
      const targetEye = this.life === LIFE_DOWNED ? 0.35 : eyeHeight(p);
      this.eye += (targetEye - this.eye) * Math.min(1, dt * 12);
      const x = this.prevX + (p.x - this.prevX) * alpha + this.errX;
      const y = this.prevY + (p.y - this.prevY) * alpha + this.errY;
      const z = this.prevZ + (p.z - this.prevZ) * alpha + this.errZ;
      cam.position.set(x, y + this.eye, z);
      cam.rotation.set(Math.max(-1.5, Math.min(1.5, this.pitch + this.recP)), this.yaw + this.recY, this.life === LIFE_DOWNED ? 0.35 : 0, 'YXZ');
      ads = alive && this.mouseR && this.locked();
      const zoom = w ? 1 - (1 - zoomEff) * this.vm.adsAmount : 1;
      cam.fov = BASE_FOV * zoom;
    }
    cam.updateProjectionMatrix();

    // soldados
    const rtBase = now * (TICK_RATE / 1000) + this.tickOffset;
    const s = this.soldiers;
    s.begin();
    const dots: MapDot[] = [];
    let reviveHint: string | null = null;
    const hasRevive = !!this.loadout?.tools.some((t) => t.tool === 'revive' || t.tool === 'defib');
    for (const [id, e] of this.ents) {
      const sm = e.samples;
      if (!sm.length) continue;
      const lastGap = sm.length > 1 ? sm[sm.length - 1].t - sm[sm.length - 2].t : 2;
      const rt = rtBase - Math.max(4, Math.min(12, lastGap * 1.3 + 1.5));
      let a = sm[0], b = sm[sm.length - 1];
      if (rt >= b.t) a = b;
      else for (let i = sm.length - 2; i >= 0; i--) if (sm[i].t <= rt) { a = sm[i]; b = sm[i + 1]; break; }
      const span = b.t - a.t;
      const t = span > 0 ? Math.max(0, Math.min(1, (rt - a.t) / span)) : 0;
      e.x = a.x + (b.x - a.x) * t; e.y = a.y + (b.y - a.y) * t; e.z = a.z + (b.z - a.z) * t;
      e.yaw = lerpAngle(a.yaw, b.yaw, t); e.pitch = a.pitch + (b.pitch - a.pitch) * t;
      const st = e.s;
      const ally = st.team === this.myTeam;
      const downed = st.life === LIFE_DOWNED;
      pose.id = id; pose.x = e.x; pose.y = e.y; pose.z = e.z; pose.yaw = e.yaw; pose.pitch = e.pitch;
      pose.crouch = st.crouch; pose.prone = st.prone; pose.sprint = st.sprint; pose.downed = downed; pose.team = st.team; pose.armor = st.armor; pose.helmet = st.helmet; pose.pack = st.pack;
      pose.gun = GUN_KIND[ITEMS[st.weapon]?.weapon?.cls ?? 'rifle'] ?? 0;
      pose.dist = Math.hypot(e.x - cam.position.x, e.z - cam.position.z);
      pose.marker = ally ? 1 : st.marked ? 2 : 0;
      pose.camo = this.world.inBush(e.x, e.z) ? 1 : 0;
      s.add(pose, dt);
      if (ally) dots.push({ x: e.x, z: e.z, team: st.team, kind: downed ? 2 : 0 });
      else if (st.marked) dots.push({ x: e.x, z: e.z, team: st.team, kind: 1 });
      if (ally && downed && alive && Math.hypot(e.x - p.x, e.z - p.z, e.y - p.y) < REVIVE_RANGE) {
        const nm = this.roster.get(id)?.name ?? 'aliado';
        reviveHint = hasRevive ? `Segure [E] para reanimar ${nm}` : `${nm} está caído — você precisa de um Reanimador`;
      }
    }
    s.end();

    this.gs.grass.update(cam.position.x, cam.position.z, now / 1000);
    this.updateMovers(now / 1000);

    const speed = Math.hypot(p.vx, p.vz);
    const reloading = !!this.own && (this.own.flags & 1) !== 0;
    const sprintingNow = alive && !p.prone && !p.crouch && speed > SPRINT_FLAG_SPEED && this.keys.has('ShiftLeft');
    if (w) this.vm.setWeapon(w.cls, this.slot === 0 ? this.loadout?.sight : undefined);
    this.vm.scoped = zoomEff <= 0.3;
    this.vm.update(dt, speed, p.onGround, ads, reloading, sprintingNow, this.yaw - this.lastYaw, this.pitch - this.lastPitch, alive && !!w);
    this.lastYaw = this.yaw; this.lastPitch = this.pitch;
    this.fx.update(dt);
    this.gs.render();
    if (!$('shop').classList.contains('hidden')) this.preview.render(now);

    // HUD (10 Hz)
    if (now - this.hudAt > 100) {
      this.hudAt = now;
      const scoped = alive && zoomEff <= 0.3 && this.vm.adsAmount > 0.85;
      this.ui.aim(scoped);
      this.ui.hint(reviveHint);
      if (this.own) this.ui.setVitals(alive ? this.own.hp : 0, alive ? Math.min(this.localAmmo, 999) : 0, alive ? this.own.reserve : 0, it?.name ?? '', reloading, this.slot === 0 ? this.loadout?.sight?.name ?? '' : '');
      this.ui.setStamina(p.stamina, p.tired, p.prone ? 'Deitado' : p.crouch ? 'Agachado' : p.tired ? 'Cansado' : 'Em pé');
      this.ui.setZone(whereIs(p.x, p.z, this.cz, this.hz), alive);
      if (this.life === LIFE_DOWNED) this.ui.downed(true, (this.downUntil - now) / 1000);
      const inField = alive || this.life === LIFE_DOWNED;
      this.ui.minimap(inField ? cam.position.x : this.cz.x, inField ? cam.position.z : this.cz.z, inField ? this.yaw : 0, this.cz, this.hz, this.world.bases, this.fobs, dots, this.myTeam);
      if (now - this.kbAt > 1000) { this.kbps = (this.bytesIn * 8) / (now - this.kbAt); this.bytesIn = 0; this.kbAt = now; }
      const info = this.gs.renderer.info.render;
      this.ui.perf(`${Math.round(this.fps)} fps · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris · ${this.ping} ms · ${this.kbps.toFixed(0)} kbps · ${this.ents.size + 1} em campo`);
      if (this.keys.has('Tab') && now - this.boardAt > 1000) { this.boardAt = now; this.send({ t: 'board' }); }
    }
  }

  // ---------- eventos ----------
  bind() {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') { e.preventDefault(); if (this.ready && !this.keys.has('Tab')) { this.ui.show('board', true); this.boardAt = 0; } }
      // Ctrl+W / Ctrl+S etc. não podem escapar para o navegador durante a partida
      if (this.ready && this.life !== LIFE_NONE && (e.ctrlKey || e.metaKey) && e.code !== 'KeyR') e.preventDefault();
      if (this.locked() && e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (!this.ready || this.life === LIFE_NONE) return;
      if (e.code === 'KeyN') this.ui.cycleZoom(e.shiftKey ? -1 : 1);
      if (e.code === 'KeyZ' && this.life === LIFE_ALIVE) this.prone = !this.prone;
      if ((e.code === 'KeyC' || e.code === 'Space') && this.life === LIFE_ALIVE) this.prone = false;
      if (e.code === 'Digit1' && this.slot !== 0) { this.slot = 0; this.nextFire = this.simTime + 0.45; this.localAmmo = 0; this.lastShotAt = -1; }
      if (e.code === 'Digit2' && this.slot !== 1) { this.slot = 1; this.nextFire = this.simTime + 0.45; this.localAmmo = 0; this.lastShotAt = -1; }
      if (e.code === 'KeyR' && this.life === LIFE_ALIVE) this.sfx.reload();
      if (e.code === 'Space' && this.life === LIFE_DOWNED) this.send({ t: 'giveup' });
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Tab') this.ui.show('board', false);
    });
    addEventListener('blur', () => { this.keys.clear(); this.mouseL = this.mouseR = false; });
    // fechar/recarregar a aba no meio da partida pede confirmação
    addEventListener('beforeunload', (e) => {
      if (this.ws && this.ready) { e.preventDefault(); e.returnValue = ''; this.closing = true; setTimeout(() => { this.closing = false; }, 1000); }
    });
    canvas.addEventListener('mousedown', (e) => {
      this.sfx.unlock();
      if (!this.locked()) { if (this.life !== LIFE_NONE) this.lockInput(); return; }
      if (e.button === 0) this.mouseL = true;
      if (e.button === 2) this.mouseR = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseL = false; if (e.button === 2) this.mouseR = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked()) return;
      const f = 0.0022 * this.sens * (this.gs.camera.fov / BASE_FOV);
      this.yaw -= e.movementX * f;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * f));
    });
    document.addEventListener('pointerlockchange', () => {
      const on = this.locked();
      if (!on) { this.mouseL = this.mouseR = false; this.keys.clear(); }
      this.ui.show('paused', !on && this.ready && this.life !== LIFE_NONE && !!this.ws);
    });
    $('resume').onclick = () => this.lockInput();
    $('play').onclick = async () => {
      this.sfx.unlock();
      this.sens = Number($<HTMLSelectElement>('sens').value);
      const name = $<HTMLInputElement>('name').value.trim() || 'Mercenário';
      try { localStorage.setItem('warbit.name', name); } catch { /* ignora */ }
      if (this.ready) this.gs.setQuality(Number($<HTMLSelectElement>('quality').value));
      // tela cheia + captura de teclas: o navegador para de tratar atalhos como Ctrl+W
      if ($<HTMLSelectElement>('fs').value === '1') {
        try {
          await document.documentElement.requestFullscreen();
          await (navigator as unknown as { keyboard?: { lock?: (k: string[]) => Promise<void> } }).keyboard?.lock?.(KEYS_TO_LOCK);
        } catch { /* sem tela cheia: segue com a confirmação ao fechar a aba */ }
      }
      if (!this.ws) this.connect(name);
    };
    this.ui.onSpawn = (items) => this.spawn(items);
    this.ui.onPreview = (look) => this.preview.set(look, this.myTeam);
    try { $<HTMLInputElement>('name').value = localStorage.getItem('warbit.name') ?? ''; } catch { /* ignora */ }
  }
}

// ---------- modo benchmark: 100 soldados animados, sem rede (?bench=1) ----------
function runBench() {
  const world = new World(20261112);
  const gs = new GameScene(canvas, world);
  const soldiers = new Soldiers();
  gs.scene.add(soldiers.group);
  const c = world.czCandidates[0];
  gs.setZones({ x: c.x, z: c.z, r: 150 }, { x: c.x + 20, z: c.z, r: 30 });
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  for (const id of ['top', 'feed', 'bl', 'br', 'wallet', 'minimap', 'mmZoom']) $(id).style.display = 'none';
  const perf = $('perf');
  perf.style.fontSize = '15px'; perf.style.color = '#fff';
  const camR = Number(new URLSearchParams(location.search).get('r')) || 34;
  const focus = new URLSearchParams(location.search).has('bush');
  const bd = Number(new URLSearchParams(location.search).get('bd')) || 7; // distância da câmera à moita no modo foco
  const bu = [...world.bushes].sort((p, q) => Math.hypot(p.x - c.x, p.z - c.z) - Math.hypot(q.x - c.x, q.z - c.z))[0];
  let last = performance.now(), fps = 60, minFps = 999, frames = 0;
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    fps += (1 / Math.max(dt, 0.001) - fps) * 0.05;
    if (++frames > 120) minFps = Math.min(minFps, fps);
    const t = now / 1000;
    const a = t * 0.15;
    const cy = world.heightAt(c.x, c.z);
    if (focus) {
      // câmera parada olhando uma moita: um soldado deitado e um agachado dentro, um em pé do lado de fora
      gs.camera.position.set(bu.x + bd, bu.y + 1.2, bu.z + bd * 0.4);
      gs.camera.lookAt(bu.x, bu.y + 0.9, bu.z);
    } else {
      gs.camera.position.set(c.x + Math.cos(a) * camR, cy + camR * 0.24 + 0.9, c.z + Math.sin(a) * camR);
      gs.camera.lookAt(c.x, cy + 1, c.z);
    }
    gs.grass.update(gs.camera.position.x, gs.camera.position.z, t);
    gs.setMovers(focus ? [{ x: bu.x + 3, z: bu.z + 0.5 }] : [], t);
    soldiers.begin();
    for (let i = 0; i < 100; i++) {
      const ring = 6 + (i % 10) * 3, sp = 1.5 + (i % 4) * 1.6, ang = (i * 0.7 + (t * sp) / ring) * (i % 2 ? 1 : -1);
      const x = c.x + Math.cos(ang) * ring, z = c.z + Math.sin(ang) * ring;
      pose.id = i; pose.x = x; pose.z = z; pose.y = world.groundAt(x, z, world.heightAt(x, z) + 0.3, 0.4);
      pose.yaw = (i % 2 ? -ang : -ang + Math.PI); pose.pitch = Math.sin(t + i) * 0.2;
      pose.crouch = i % 9 === 0; pose.prone = i % 13 === 0; pose.sprint = sp > 5; pose.downed = i % 23 === 0; pose.team = i % 3; pose.armor = i % 5; pose.helmet = (i * 3) % 5; pose.pack = i % 4; pose.gun = i % 4;
      pose.marker = i % 3 === 0 ? 1 : i % 17 === 0 ? 2 : 0;
      pose.camo = 0;
      if (focus && i < 3) {
        const ox = i === 0 ? -0.3 : i === 1 ? 0.5 : 3.2, oz = i === 0 ? 0.2 : i === 1 ? -0.6 : 0.5;
        pose.x = bu.x + ox; pose.z = bu.z + oz; pose.y = bu.y; pose.yaw = Math.PI / 2 + 0.3;
        pose.prone = i === 0; pose.crouch = i === 1; pose.downed = false; pose.sprint = false; pose.marker = 0; pose.team = i;
        pose.camo = i < 2 ? 1 : 0;
      } else if (focus) { pose.x = bu.x + 400; pose.z = bu.z + 400; }
      pose.dist = Math.hypot(pose.x - gs.camera.position.x, pose.z - gs.camera.position.z);
      soldiers.add(pose, focus && i < 3 ? 0 : dt);
    }
    soldiers.end();
    gs.render();
    const info = gs.renderer.info.render;
    perf.textContent = `BENCH · 100 soldados · ${Math.round(fps)} fps (mín ${minFps === 999 ? '…' : Math.round(minFps)}) · ${info.calls} draws no total (${soldiers.drawCalls} dos soldados) · ${(info.triangles / 1000).toFixed(0)}k tris`;
    (window as unknown as { __bench: unknown }).__bench = { fps, minFps, calls: info.calls, soldierCalls: soldiers.drawCalls, tris: info.triangles, soldierTris: soldiers.triangles };
  };
  requestAnimationFrame(loop);
}

if (new URLSearchParams(location.search).has('bench')) runBench();
else {
  const game = new Game();
  game.bind();
  (window as unknown as { __game: Game }).__game = game;
}
