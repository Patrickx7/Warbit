import { expect, it } from 'vitest';
import {
  BOT_RESPAWN_SECONDS, BTN_FIRE, BTN_FWD, BTN2_ADS, BTN2_RELOAD, BTN2_SECONDARY,
  EMPTY_WEAPON_INDEX, LIFE_NONE, PRESETS, SNAPSHOT_EVERY, TICK_RATE, World,
  decodeSnapshot, getEquipmentVendorPos, loadoutIds,
} from '@warbit/shared';
import { Match } from '../src/game/Match';

const world = new World(4321);
function setup() {
  const m = new Match(world, null, { bots: false });
  const sent: (string | ArrayBuffer)[] = [];
  const p = m.join({ send: d => sent.push(d) }, 'Desarmado')!;
  m.onJson(p, { t: 'spawn', items: ['fuzil_padrao', 'pistola'] });
  return { m, p, sent };
}

it('jogador nasce sem armas, anda e não atira ou recarrega em nenhum espaço vazio', () => {
  const { m, p, sent } = setup();
  expect(loadoutIds(p.loadout!)).toEqual([]);
  expect(p.ammo).toEqual([0, 0]); expect(p.reserve).toEqual([0, 0]);
  const inventory = sent.filter((d): d is string => typeof d === 'string').map(d => JSON.parse(d)).find(d => d.t === 'inventory');
  expect(inventory.items).toEqual([]);
  Object.assign(p.ms, { x: 750, y: world.heightAt(750, 250), z: 250 });
  for (let i = 0; i < 60; i++) m.processInput(p, {
    seq: i + 1, buttons: BTN_FWD | BTN_FIRE,
    buttons2: BTN2_ADS | BTN2_RELOAD | (i >= 30 ? BTN2_SECONDARY : 0),
    buttons3: 0, yaw: 0, pitch: 0, renderTick: 0,
  });
  expect(p.ms.z).toBeLessThan(247); expect(p.shot).toBe(0);
  expect(p.ammo).toEqual([0, 0]); expect(p.reloadEnd).toBe(0);
});

it('comprar mochila não dá armas; comprar só principal não dá pistola', () => {
  const { m, p } = setup();
  Object.assign(p.ms, getEquipmentVendorPos(p.team, world));
  expect(m.buyEquipment(p, ['mochila_pequena'], [])).toBeNull();
  expect(loadoutIds(p.loadout!)).toEqual(['mochila_pequena']);
  expect(p.ammo).toEqual([0, 0]); expect(p.cargo.every(x => x === null)).toBe(true);
  expect(m.buyEquipment(p, ['mochila_pequena', 'fuzil_basico'], [])).toBeNull();
  expect(p.loadout!.primary.id).toBe('fuzil_basico'); expect(p.loadout!.secondary.empty).toBe(true);
  expect(p.ammo).toEqual([15, 0]);
});

it('snapshot binário informa aos outros jogadores que não há arma', () => {
  const { m, p } = setup(), received: ArrayBuffer[] = [];
  const observer = m.join({ send: d => { if (d instanceof ArrayBuffer) received.push(d); } }, 'Observador')!;
  m.onJson(observer, { t: 'spawn', items: [] }); Object.assign(observer.ms, p.ms);
  for (let i = 0; i < SNAPSHOT_EVERY; i++) m.step();
  const snapshot = decodeSnapshot(new DataView(received.at(-1)!));
  expect(snapshot.ents.find(e => e.id === p.id)?.weapon).toBe(EMPTY_WEAPON_INDEX);
});

it('bots mantêm todos os kits, munição e intervalo de renascimento anteriores', () => {
  const { m } = setup(), bot = m.players.find(p => p.bot)!;
  for (const preset of PRESETS) {
    bot.life = LIFE_NONE; bot.cash = 99999;
    expect(m.spawn(bot, preset.items)).toBeNull();
    expect(bot.loadout!.primary.empty).not.toBe(true); expect(bot.loadout!.secondary.empty).not.toBe(true);
    expect(bot.ammo[0]).toBeGreaterThan(0); expect(bot.ammo[1]).toBeGreaterThan(0);
    expect(bot.reserve[0]).toBeGreaterThan(0); expect(bot.reserve[1]).toBeGreaterThan(0);
  }
  m.die(bot, 'teste');
  expect(bot.respawnAt - m.tick).toBeGreaterThanOrEqual(BOT_RESPAWN_SECONDS * TICK_RATE);
  expect(bot.respawnAt - m.tick).toBeLessThan((BOT_RESPAWN_SECONDS + 5) * TICK_RATE);
});
