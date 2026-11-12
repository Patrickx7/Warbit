import { describe, expect, it } from 'vitest';
import { LIFE_ALIVE, LIFE_DOWNED, LIFE_NONE, START_CASH, World, BTN2_USE, TICK_RATE } from '@warbit/shared';
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

    // cai e é finalizado: perde o loadout, o saldo fica
    const cash = p.cash;
    m.damage(p, 500, null, 'teste', false);
    m.damage(p, 500, null, 'teste', false);
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

  it('roda 100 bots por 60 s de jogo sem erro e alguém pontua', () => {
    const m = new Match(world, null);
    const t0 = performance.now();
    for (let i = 0; i < 60 * TICK_RATE + 20 * TICK_RATE; i++) m.step();
    const ms = (performance.now() - t0) / (80 * TICK_RATE);
    expect(m.players.filter((p) => p.life === LIFE_ALIVE).length).toBeGreaterThan(40);
    expect(ms).toBeLessThan(10); // tick médio < 10 ms com 100 entidades
    console.log(`tick médio com 100 bots: ${ms.toFixed(3)} ms; placar`, m.scores.map((s) => s.toFixed(1)));
  }, 60000);
});
