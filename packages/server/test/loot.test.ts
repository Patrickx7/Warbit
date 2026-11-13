import { expect, it } from 'vitest';
import { LIFE_ALIVE, LIFE_DOWNED, LIFE_NONE, TICK_RATE, World } from '@warbit/shared';
import { Match } from '../src/game/Match';

const world = new World(4321);
function setup() {
  const m = new Match(world, null, { bots: false });
  const a = m.join({send() {}}, 'A')!, b = m.join({send() {}}, 'B', undefined, (a.team + 1) % 3)!;
  m.spawn(a, ['fuzil_basico','pistola']); m.spawn(b, ['fuzil_padrao']);
  Object.assign(a.ms, {x: 750, z: 250, y: world.heightAt(750, 250)});
  Object.assign(b.ms, {x: 751, z: 250, y: a.ms.y});
  b.cargo[0] = {weapon: 'fuzil_basico', rounds: 9}; b.ammo[0] = 7; a.ammo[0] = 4;
  m.damage(b, 500, a, 'teste', false);
  return {m, a, b};
}
it('troca arma e balas sem duplicar, rejeita repetição e preserva o corpo', () => {
  const {m, a, b} = setup(), revision = b.lootRevision;
  m.onJson(a, {t:'swapLootWeapon',target:b.id,revision,slot:0});
  expect(a.loadout!.primary.id).toBe('fuzil_padrao'); expect(a.ammo[0]).toBe(7);
  expect(b.loadout!.primary.id).toBe('fuzil_basico'); expect(b.ammo[0]).toBe(4);
  m.onJson(a, {t:'swapLootWeapon',target:b.id,revision,slot:0});
  expect(a.loadout!.primary.id).toBe('fuzil_padrao');
  expect(b.life).toBe(LIFE_DOWNED);
});
it('jogador desarmado pode pegar a arma do corpo e deixa o espaço dele vazio', () => {
  const {m, a, b} = setup();
  a.life = LIFE_NONE; m.onJson(a, {t:'spawn',items:[]});
  Object.assign(a.ms, {x:750,y:b.ms.y,z:250});
  m.onJson(a, {t:'swapLootWeapon',target:b.id,revision:b.lootRevision,slot:0});
  expect(a.loadout!.primary.id).toBe('fuzil_padrao'); expect(a.ammo[0]).toBe(7);
  expect(b.loadout!.primary.empty).toBe(true); expect(b.ammo[0]).toBe(0);
  m.onJson(a, {t:'swapLootWeapon',target:b.id,revision:b.lootRevision,slot:0});
  expect(a.loadout!.primary.id).toBe('fuzil_padrao');
});
it('bloqueia saque remoto e transfere carregadores uma única vez', () => {
  const {m,a,b} = setup(); a.ms.x += 20;
  m.onJson(a,{t:'swapLootWeapon',target:b.id,revision:b.lootRevision,slot:0});
  m.onJson(a,{t:'loot'}); expect(a.cargo.every(x=>!x)).toBe(true);
  a.ms.x=750; m.onJson(a,{t:'loot'}); m.onJson(a,{t:'loot'});
  expect(a.cargo.filter(x=>x?.rounds===9)).toHaveLength(1);
  expect(b.cargo[0]).toBeNull();
});
it('jogador caído não expira nem é removido por tiros; desistir libera o renascimento', () => {
  const {m,a,b} = setup();
  m.tick += 301 * TICK_RATE; m.step(); m.damage(b,500,a,'teste',false);
  expect(b.life).toBe(LIFE_DOWNED); expect(b.loadout).not.toBeNull();
  m.onJson(b,{t:'giveup'}); expect(b.life).toBe(LIFE_NONE);
  expect(a.life).toBe(LIFE_ALIVE);
});
