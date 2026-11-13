import { expect, it } from 'vitest';
import { World, SNAPSHOT_EVERY, TICK_RATE, decodeSnapshot, getEquipmentVendorPos, protectionCapacity, xpForLevel } from '@warbit/shared';
import { Match } from '../src/game/Match';

const world = new World(4321);
function setup() {
  const m = new Match(world, null, {bots:false}), sent: (string | ArrayBuffer)[] = [];
  const p = m.join({send:d=>sent.push(d)}, 'Protegido')!;
  m.spawn(p, ['blind_1', 'capacete_1']);
  return {m, p, sent};
}

it('dano no corpo e na cabeça desgasta somente a proteção atingida e transmite a porcentagem real', () => {
  const {m, p, sent} = setup();
  expect(m.damage(p,40,null,'teste',false,1)).toBeCloseTo(34);
  expect(p.hp).toBeCloseTo(66); expect(p.armorDurability).toBeCloseTo(39);
  expect(p.helmetDurability).toBe(protectionCapacity(1,true));
  expect(m.damage(p,20,null,'teste',true,1)).toBeCloseTo(17);
  expect(p.helmetDurability).toBeCloseTo(22); expect(p.armorDurability).toBeCloseTo(39);
  for(let i=0;i<SNAPSHOT_EVERY;i++) m.step();
  const packet = sent.filter((d):d is ArrayBuffer=>d instanceof ArrayBuffer).at(-1)!;
  const own = decodeSnapshot(new DataView(packet)).own;
  expect(own.hp).toBe(49); expect(own.armorCondition).toBe(87); expect(own.helmetCondition).toBe(88);
});

it('proteção esgotada não absorve mais dano nem produz durabilidade negativa', () => {
  const {m,p} = setup(); p.armorDurability=4;
  expect(m.damage(p,40,null,'teste',false,1)).toBeCloseTo(36);
  expect(p.armorDurability).toBe(0);
  expect(m.damage(p,40,null,'teste',false,1)).toBe(40);
  expect(p.hp).toBe(24); expect(p.armorDurability).toBe(0);
});

it('cura e reconfirmação da compra não reparam proteção; uma peça nova vem íntegra', () => {
  const {m,p}=setup(); m.damage(p,60,null,'teste',false,1);
  for(let i=0;i<12*TICK_RATE;i++) m.step();
  expect(p.hp).toBeGreaterThan(49); expect(p.armorDurability).toBeCloseTo(36);
  Object.assign(p.ms,getEquipmentVendorPos(p.team,world));
  const cash=p.cash;
  expect(m.buyEquipment(p,['blind_1','capacete_1'],[])).toBeNull();
  expect(p.cash).toBe(cash); expect(p.armorDurability).toBeCloseTo(36);
  p.xp=xpForLevel(10);
  expect(m.buyEquipment(p,['blind_2','capacete_1'],[])).toBeNull();
  expect(p.cash).toBeLessThan(cash); expect(p.armorDurability).toBe(protectionCapacity(2));
});

it('explosões desgastam armadura com a redução menor e jogador sem proteção recebe o dano inteiro', () => {
  const {m,p} = setup();
  expect(m.damage(p,40,null,'Granada',false,.5)).toBeCloseTo(37);
  expect(p.armorDurability).toBeCloseTo(42);
  const naked=m.join({send(){}},'Sem proteção')!; m.spawn(naked,[]);
  expect(m.damage(naked,40,null,'teste',false,1)).toBe(40);
  expect(naked.hp).toBe(60); expect(naked.armorDurability).toBe(0);
  m.die(p,'teste'); m.onJson(p,{t:'spawn',items:[]});
  expect(p.armorDurability).toBe(0); expect(p.helmetDurability).toBe(0);
});
