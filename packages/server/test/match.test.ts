import { describe, expect, it } from 'vitest';
import { LIFE_ALIVE, LIFE_DOWNED, LIFE_NONE, START_CASH, World, BTN2_USE, BTN_FWD, TICK_RATE, getVendorPos } from '@warbit/shared';
import { newVehicle } from '@warbit/shared';
import { ProfileStore } from '../src/db';
import { Match } from '../src/game/Match';

const world = new World(4321);
const conn = () => ({ sent: [] as (string | ArrayBuffer)[], send(d: string | ArrayBuffer) { this.sent.push(d); } });

describe('perfil (SQLite)', () => {
  it('cria com $10.000 uma única vez e persiste', () => {
    const store = new ProfileStore(':memory:');
    const a = store.loadOrCreate(undefined, 'Ana');
    expect(a.cash).toBe(START_CASH);
    a.cash = 4321; a.xp = 999;
    store.save(a);
    const b = store.loadOrCreate(a.token, 'Ana');
    expect(b.cash).toBe(4321);
    expect(b.xp).toBe(999);
    store.close();
  });
});

describe('partida', () => {
  it('compra, perde o equipamento ao morrer e mantém ao ser revivido', () => {
    const m = new Match(world, null, { bots: false });
    const p = m.join(conn(), 'Tester')!;
    const medic = m.join(conn(), 'Medico')!;
    // força o mesmo time para o teste de revive
    const mate = m.players.find((q) => q.team === p.team && q !== p)!;
    expect(p.cash).toBe(10000);

    expect(m.spawn(p, ['fuzil_padrao', 'blind_1'])).toBeNull();
    expect(p.life).toBe(LIFE_ALIVE);
    expect(p.cash).toBe(10000 - 800 - 200); // desconto de recruta 50%
    expect(m.spawn(p, [])).not.toBeNull(); // já em campo

    // cai e é revivido: mantém o loadout
    m.damage(p, 500, null, 'teste', false);
    expect(p.life).toBe(LIFE_DOWNED);
    mate.bot = false; mate.cash = 5000; mate.respawnAt = 0;
    expect(m.spawn(mate, ['reanimador'])).toBeNull();
    mate.ms.x = p.ms.x + 1; mate.ms.z = p.ms.z; mate.ms.y = p.ms.y;
    for (let i = 0; i < 4 * TICK_RATE && p.life === LIFE_DOWNED; i++) {
      m.processInput(mate, { seq: i + 1, buttons: 0, buttons2: BTN2_USE, buttons3: 0, yaw: 0, pitch: 0, renderTick: 0 });
      mate.ms.x = p.ms.x + 1; mate.ms.z = p.ms.z;
    }
    expect(p.life).toBe(LIFE_ALIVE);
    expect(p.loadout?.primary.id).toBe('fuzil_padrao');
    expect(mate.cash).toBeGreaterThan(5000 - 213); // ganhou a recompensa de revive

    // Só perde o equipamento quando desiste de esperar reanimação.
    const cash = p.cash;
    m.damage(p, 500, null, 'teste', false);
    m.damage(p, 500, null, 'teste', false);
    expect(p.life).toBe(LIFE_DOWNED);
    m.onJson(p, { t: 'giveup' });
    expect(p.life).toBe(LIFE_NONE);
    expect(p.loadout).toBeNull();
    expect(p.cash).toBe(cash);
    expect(medic).toBeTruthy();
  });

  it('saldo insuficiente bloqueia a compra', () => {
    const m = new Match(world, null, { bots: false });
    const p = m.join(conn(), 'Pobre')!;
    p.cash = 100;
    expect(m.spawn(p, ['fuzil_padrao'])).toBe('Saldo insuficiente');
    expect(m.spawn(p, [])).toBeNull(); // kit gratuito
  });

  it('compra quadriciclo no vendedor da base, pilota e desce', () => {
    const m = new Match(world, null, { bots: false });
    const c = conn();
    const p = m.join(c, 'Piloto')!;
    expect(m.spawn(p, [])).toBeNull();
    expect(p.life).toBe(LIFE_ALIVE);

    const initialCash = p.cash;
    // Tenta comprar longe do vendedor
    p.ms.x = 750; p.ms.z = 750;
    m.onJson(p, { t: 'buyVehicle', vehicleType: 'quad' });
    const base = m.vehicles.size; // a base não dá veículo grátis
    expect(base).toBe(0);

    // Posiciona perto do vendedor da base do time
    const vPos = getVendorPos(p.team, world);
    p.ms.x = vPos.x; p.ms.z = vPos.z;
    m.onJson(p, { t: 'buyVehicle', vehicleType: 'quad' });
    expect(m.vehicles.size).toBe(base + 1);
    expect(p.cash).toBe(initialCash - 1200);
    expect(p.vehicleId).not.toBe(-1);

    const veh = m.vehicles.get(p.vehicleId)!;
    expect(veh).toBeDefined();
    expect(veh.driverId).toBe(p.id);
    expect(veh.type).toBe('quad');

    // Pilota para frente por alguns ticks
    const startX = veh.x, startZ = veh.z;
    for (let i = 0; i < 30; i++) {
      m.processInput(p, { seq: i + 1, buttons: BTN_FWD, buttons2: 0, buttons3: 0, yaw: veh.yaw, pitch: 0, renderTick: 0 });
    }
    expect(Math.hypot(veh.x - startX, veh.z - startZ)).toBeGreaterThan(2);
    expect(p.ms.x).toBe(veh.x);
    expect(p.ms.z).toBe(veh.z);

    // Desce do veículo
    m.onJson(p, { t: 'dismountVehicle' });
    expect(p.vehicleId).toBe(-1);
    expect(veh.driverId).toBe(-1);
  });

  it('roda 60 bots por 80 s de jogo sem erro e alguém pontua', () => {
    const m = new Match(world, null);
    const t0 = performance.now();
    for (let i = 0; i < 60 * TICK_RATE + 20 * TICK_RATE; i++) m.step();
    const ms = (performance.now() - t0) / (80 * TICK_RATE);
    expect(m.players.filter((p) => p.life === LIFE_ALIVE).length).toBeGreaterThan(25);
    expect(ms).toBeLessThan(10); // tick médio < 10 ms com 60 entidades
    console.log(`tick médio com 60 bots: ${ms.toFixed(3)} ms; placar`, m.scores.map((s) => s.toFixed(1)));
  }, 60000);
});

describe('loot, mochila e reforço de bots', () => {
  it('mochila de quem desistiu fica 2 min e pode ser lootada; HUD conta só a Control Zone', () => {
    const m = new Match(world, null, { bots: false });
    const a = m.join(conn(), 'A')!;
    const b = m.players.find((q) => q.team !== a.team && q !== a)!;
    a.respawnAt = 0; b.bot = false; b.respawnAt = 0; b.cash = 99999;
    expect(m.spawn(a, ['fuzil_padrao', 'mochila_pequena'])).toBeNull();
    expect(m.spawn(b, ['fuzil_padrao', 'mochila_pequena'])).toBeNull();
    a.cargo[0] = { weapon: 'fuzil_padrao', rounds: 30 };

    // longe da zona: ninguém conta no HUD
    expect((m as any).stateMsg().counts[a.team]).toBe(0);
    a.ms.x = m.cz.x; a.ms.z = m.cz.z;
    expect((m as any).stateMsg().counts[a.team]).toBe(1);

    // A cai e desiste: só a mochila fica
    a.ms.x = 750; a.ms.z = 250; a.ms.y = world.heightAt(750, 250);
    m.damage(a, 500, null, 'teste', false);
    expect(a.life).toBe(LIFE_DOWNED);
    m.die(a, 'Você desistiu');
    expect(m.drops.length).toBe(1);
    b.ms.x = a.ms.x + 0.5; b.ms.z = a.ms.z; b.ms.y = a.ms.y;
    (m as any).loot(b);
    expect(b.cargo.some((x) => x?.weapon === 'fuzil_padrao')).toBe(true);

    // sem ninguém lootando, some em 2 min
    m.drops.length = 0;
    a.life = LIFE_ALIVE; a.loadout = b.loadout; a.cargo = [{ weapon: 'fuzil_padrao', rounds: 30 }]; a.ammo = [0, 0];
    m.die(a, 'x');
    expect(m.drops.length).toBe(1);
    m.tick += 121 * TICK_RATE;
    (m as any).everySecond();
    expect(m.drops.length).toBe(0);
  });

  it('bot caído renasce na hora se o time tem ≤3 na Control Zone', () => {
    const m = new Match(world, null, { bots: false });
    const p = m.players.find((q) => q.bot)!;
    p.respawnAt = 0;
    expect(m.spawn(p, ['fuzil_padrao'])).toBeNull();
    m.damage(p, 500, null, 'teste', false);
    expect(p.life).toBe(LIFE_NONE);
  });
});

describe('garupa e bots de quadriciclo', () => {
  it('humano que entra na vaga de um bot pilotando não herda o assento (não fica preso no quadriciclo)', () => {
    const m = new Match(world, null, { bots: false });
    const bot = m.players.find((q) => q.team === 1)!;
    bot.respawnAt = 0;
    expect(m.spawn(bot, ['fuzil_padrao'])).toBeNull();
    const v = newVehicle(77, 'quad', bot.ms.x, bot.ms.y, bot.ms.z, 0, 1); m.vehicles.set(v.id, v);
    expect(m.mountVehicle(bot, v)).toBe('driver');
    // o join prefere bots mortos: com o time todo em campo, a vaga escolhida é a do piloto
    for (const q of m.players) if (q.team === 1 && q !== bot) q.life = LIFE_ALIVE;
    const human = m.join(conn(), 'Patrick', undefined, 1)!;
    expect(human).toBe(bot); // assumiu a vaga do bot
    expect(v.driverId).toBe(-1);
    // renasce e anda: o servidor move o jogador a pé, e nenhum veículo o tem como piloto
    human.respawnAt = 0;
    expect(m.spawn(human, ['fuzil_padrao'])).toBeNull();
    expect([...m.vehicles.values()].some((x) => x.driverId === human.id || x.passengerId === human.id)).toBe(false);
    // assento fantasma (estado antigo): descer limpa mesmo com vehicleId = -1
    v.driverId = human.id; human.vehicleId = -1;
    m.onJson(human, { t: 'dismountVehicle' });
    expect(v.driverId).toBe(-1);
  });

  it('quadriciclo leva piloto e garupa; garupa assume o guidão quando o piloto desce', () => {
    const m = new Match(world, null, { bots: false });
    const a = m.players.find((q) => q.team === 0)!, b = m.players.find((q) => q.team === 0 && q !== a)!, c = m.players.find((q) => q.team === 1)!;
    for (const p of [a, b, c]) { p.bot = false; p.respawnAt = 0; p.cash = 99999; expect(m.spawn(p, ['fuzil_padrao'])).toBeNull(); }
    const v = newVehicle(99, 'quad', a.ms.x, a.ms.y, a.ms.z, 0, 0); m.vehicles.set(v.id, v);
    expect(m.mountVehicle(a, v)).toBe('driver');
    expect(m.mountVehicle(b, v)).toBe('passenger');
    expect(m.mountVehicle(c, v)).toBeNull(); // inimigo não sobe
    // o E que montou continua apertado no input seguinte: não pode derrubar ninguém do quadriciclo
    m.processInput(a, { seq: 1, buttons: 0, buttons2: BTN2_USE, buttons3: 0, yaw: 0, pitch: 0, renderTick: 0 });
    m.processInput(b, { seq: 1, buttons: 0, buttons2: BTN2_USE, buttons3: 0, yaw: 0, pitch: 0, renderTick: 0 });
    expect(v.driverId).toBe(a.id);
    expect(v.passengerId).toBe(b.id);
    // soltou e apertou de novo: aí sim desce
    m.processInput(a, { seq: 2, buttons: 0, buttons2: 0, buttons3: 0, yaw: 0, pitch: 0, renderTick: 0 });
    m.processInput(a, { seq: 3, buttons: 0, buttons2: BTN2_USE, buttons3: 0, yaw: 0, pitch: 0, renderTick: 0 });
    expect(v.driverId).toBe(b.id);
    expect(v.passengerId).toBe(-1);
  });
  it('metade dos bots vai de quadriciclo com garupa e chega rápido à Control Zone', () => {
    const m = new Match(world, null, { bots: true });
    let used = 0, garupas = 0, inCzAt60 = 0, stuckQuit = 0;
    const origLeave = m.dismountPlayer.bind(m);
    const where: string[] = [];
    m.dismountPlayer = (p) => {
      if (p.bot && p.vehicleId !== -1 && p.life === 1 && p.brain && p.brain.rideStuckCount >= 4) {
        stuckQuit++;
        const b = m.world.bases[p.team];
        where.push(`${Math.round(p.ms.x - b.x)},${Math.round(p.ms.z - b.z)}`);
      }
      origLeave(p);
    };
    for (let i = 0; i < 90 * TICK_RATE; i++) {
      m.step();
      if (i % TICK_RATE === 0) {
        used = Math.max(used, m.players.filter((p) => p.bot && p.vehicleId !== -1).length);
        garupas = Math.max(garupas, [...m.vehicles.values()].filter((v) => v.passengerId !== -1).length);
      }
      if (i === 60 * TICK_RATE) inCzAt60 = m.players.filter((p) => p.life !== 0 && Math.hypot(p.ms.x - m.cz.x, p.ms.z - m.cz.z) < m.cz.r).length;
    }
    console.log(`quadriciclo: máx. ${used} bots montados · ${garupas} com garupa · ${inCzAt60} na CZ aos 60 s · ${stuckQuit} desistiram por empacar (pos. rel. à base: ${where.join(' ')}) · ${m.vehicles.size} veículos`);
    expect(used).toBeGreaterThanOrEqual(15);    // metade de 60 = 30 riders; nem todos ao mesmo tempo
    expect(garupas).toBeGreaterThanOrEqual(5);
    expect(stuckQuit).toBeLessThanOrEqual(4);   // quase ninguém fica preso em obstáculo
    expect(m.vehicles.size).toBeLessThanOrEqual(21); // até 7 por time
  });
});

describe('troca de time no meio da partida', () => {
  it('vai para outro time, devolve o equipamento e a vaga antiga vira bot', () => {
    const m = new Match(world, null, { bots: false });
    const c = conn();
    const p = m.join(c, 'Patrick', undefined, 0)!;
    p.respawnAt = 0;
    expect(m.spawn(p, ['fuzil_padrao'])).toBeNull();
    const cash = p.cash + p.loadout!.cost;
    const np = m.switchTeam(p, 1)!;
    expect(np).toBeTruthy();
    expect(np.team).toBe(1);
    expect(np.bot).toBe(false);
    expect(np.conn).toBe(c);
    expect(np.cash).toBe(cash);          // equipamento devolvido
    expect(p.bot).toBe(true);            // a vaga antiga voltou a ser bot
    expect(m.switchTeam(np, 2)).toBeNull(); // trocar de novo logo em seguida é bloqueado
  });
});
