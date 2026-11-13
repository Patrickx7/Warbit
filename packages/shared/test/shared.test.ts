import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '../src/protocol';

it('preserva o tipo e o valor confirmado da recompensa no JSON', () => {
  const message: ServerMsg = { t: 'reward', kind: 'kill', label: 'Abate (Hot Zone x2)', cash: 4000, xp: 200 };
  const decoded: ServerMsg = JSON.parse(JSON.stringify(message));
  expect(decoded).toEqual(message);
});
import {
  BUSH_HEIGHT_MAX, BUSH_HEIGHT_MIN, BUSH_RADIUS_MAX, BUSH_RADIUS_MIN, PLAYER_HEIGHT,
  BTN3_PRONE, BTN_FWD, BTN_JUMP, BTN_SPRINT, DT, ITEM_BY_ID, LIFE_ALIVE, World, buildLoadout, computePresence, controllingTeam, decodeInput,
  decodeSnapshot, encodeInput, encodeSnapshot, levelFromXp, newMoveState, pointsFor, priceFor, rewardFor, stepMove, whereIs, xpForLevel,
  SCORE_PER_PRESENCE_SECOND, ALIVE_MASK_BYTES, maskHas, maskSet,
} from '../src/index';

const world = new World(1234);

describe('mundo', () => {
  it('é determinístico pelo seed', () => {
    const b = new World(1234);
    expect(b.boxes.length).toBe(world.boxes.length);
    expect(b.heightAt(333.3, 777.7)).toBe(world.heightAt(333.3, 777.7));
    expect(b.czCandidates).toEqual(world.czCandidates);
    expect(b.bushes).toEqual(world.bushes);
    expect(b.streets).toEqual(world.streets);
    expect(b.details).toEqual(world.details);
    expect(b.industrialProps).toEqual(world.industrialProps);
    expect(b.boxes).toEqual(world.boxes);
    expect(new World(99).heightAt(333.3, 777.7)).not.toBe(world.heightAt(333.3, 777.7));
  });
  it('tem 3 bases e construções', () => {
    expect(world.bases.length).toBe(3);
    expect(world.boxes.length).toBeGreaterThan(200);
  });
  it('mantém ruas e calçadas livres de moitas', () => {
    expect(world.streets).toHaveLength(8);
    for (const s of world.streets) {
      expect(world.bushes.some(b => b.x + b.r > s.x0 - 1.2 && b.x - b.r < s.x1 + 1.2 && b.z + b.r > s.z0 - 1.2 && b.z - b.r < s.z1 + 1.2)).toBe(false);
    }
  });
  it('instalações industriais têm colisão e pátios sem moitas nos seeds de teste e produção', () => {
    for (const w of [world, new World(20261112)]) {
      expect(w.facilities.length).toBeGreaterThanOrEqual(2);
      expect(w.industrialProps.some(p => p.kind === 'chimney')).toBe(true);
      expect(w.industrialProps.some(p => p.kind === 'tank')).toBe(true);
      for (const p of w.industrialProps) {
        expect(w.boxes.some(b => b.kind === 12 && b.x0 === p.x - p.r && b.x1 === p.x + p.r && b.y1 === p.y + p.h)).toBe(true);
        expect(w.raycast(p.x, p.y + p.h + 2, p.z, 0, -1, 0, 10)).toBeCloseTo(2, 3);
      }
      for (const p of w.facilities) expect(w.bushes.some(b => Math.abs(b.x - p.x) < 22 && Math.abs(b.z - p.z) < 18)).toBe(false);
    }
  });
  it('raycast para em caixas e no terreno', () => {
    const b = world.boxes.find((x) => x.kind === 0)!;
    const y = (b.y0 + b.y1) / 2 + 1;
    const d = world.raycast(b.x0 - 5, Math.max(y, world.heightAt(b.x0 - 5, (b.z0 + b.z1) / 2) + 1), (b.z0 + b.z1) / 2, 1, 0, 0, 100);
    expect(d).toBeLessThanOrEqual(5.01);
    expect(world.raycast(500, world.heightAt(500, 500) + 50, 500, 0, -1, 0, 200)).toBeCloseTo(50, 0);
  });
});

describe('movimento', () => {
  it('é determinístico (cliente = servidor)', () => {
    const b = world.bases[0];
    const run = () => {
      const s = newMoveState(b.x, world.heightAt(b.x, b.z) + 2, b.z);
      for (let i = 0; i < 300; i++) stepMove(s, BTN_FWD | (i % 40 === 0 ? BTN_JUMP : 0) | (i > 100 ? BTN_SPRINT : 0), 0.7 + i * 0.01, world, DT);
      return s;
    };
    expect(run()).toEqual(run());
  });
  it('anda para frente e fica no chão', () => {
    const s = newMoveState(750, world.heightAt(750, 750) + 1, 750);
    for (let i = 0; i < 90; i++) stepMove(s, BTN_FWD, 0, world, DT);
    expect(s.onGround).toBe(true);
    expect(Math.hypot(s.x - 750, s.z - 750)).toBeGreaterThan(3);
    expect(s.y).toBeGreaterThanOrEqual(world.heightAt(s.x, s.z) - 0.001);
  });
  it('não atravessa construções', () => {
    const b = world.boxes.find((x) => x.kind === 0)!;
    const z = (b.z0 + b.z1) / 2;
    const s = newMoveState(b.x0 - 3, world.heightAt(b.x0 - 3, z), z);
    for (let i = 0; i < 120; i++) stepMove(s, BTN_FWD, -Math.PI / 2, world, DT); // yaw -90° = +X
    expect(s.x).toBeLessThan(b.x0);
  });
});

describe('posturas e fôlego', () => {
  const start = () => { const s = newMoveState(750, world.heightAt(750, 750) + 0.1, 750); for (let i = 0; i < 30; i++) stepMove(s, 0, 0, world, DT); return s; };
  it('deita, fica mais lento e levanta', () => {
    const s = start();
    for (let i = 0; i < 20; i++) stepMove(s, BTN_FWD, 0, world, DT, 1, BTN3_PRONE);
    expect(s.prone).toBe(true);
    for (let i = 0; i < 60; i++) stepMove(s, BTN_FWD, 0, world, DT, 1, BTN3_PRONE);
    expect(Math.hypot(s.vx, s.vz)).toBeLessThan(1);
    for (let i = 0; i < 40; i++) stepMove(s, 0, 0, world, DT, 1, 0);
    expect(s.prone).toBe(false);
  });
  it('não levanta com teto baixo em cima', () => {
    const s = start();
    for (let i = 0; i < 10; i++) stepMove(s, 0, 0, world, DT, 1, BTN3_PRONE);
    expect(s.prone).toBe(true);
    const slab = world.addBox({ id: 0, x0: s.x - 2, x1: s.x + 2, z0: s.z - 2, z1: s.z + 2, y0: s.y + 0.8, y1: s.y + 1.2, kind: 7, color: 0 });
    for (let i = 0; i < 20; i++) stepMove(s, 0, 0, world, DT, 1, 0);
    expect(s.prone).toBe(true); // continua deitado debaixo da laje
    world.removeBox(slab.id);
    for (let i = 0; i < 20; i++) stepMove(s, 0, 0, world, DT, 1, 0);
    expect(s.prone).toBe(false);
  });
  it('correr gasta fôlego, cansa e recupera', () => {
    const s = start();
    let everTired = false;
    for (let i = 0; i < 30 * 27; i++) { stepMove(s, BTN_FWD | BTN_SPRINT, 0.3, world, DT); everTired ||= s.tired; }
    expect(everTired).toBe(true); // ~25 s de corrida e o fôlego acaba
    for (let i = 0; i < 30 * 12; i++) stepMove(s, 0, 0, world, DT);
    expect(s.tired).toBe(false);
    expect(s.stamina).toBeGreaterThan(0.9);
  });
});

describe('protocolo', () => {
  it('input vai e volta', () => {
    const m = { seq: 77, buttons: 133, buttons2: 9, buttons3: 3, yaw: 1.25, pitch: -0.5, renderTick: 123456 };
    const d = decodeInput(new DataView(encodeInput(m)))!;
    expect(d.seq).toBe(77); expect(d.buttons).toBe(133); expect(d.buttons2).toBe(9); expect(d.buttons3).toBe(3);
    expect(d.yaw).toBeCloseTo(1.25, 5); expect(d.pitch).toBeCloseTo(-0.5, 5); expect(d.renderTick).toBe(123456);
  });
  it('snapshot vai e volta', () => {
    const alive = new Uint8Array(ALIVE_MASK_BYTES); maskSet(alive, 5); maskSet(alive, 59);
    const buf = encodeSnapshot({
      tick: 900, ack: 42, alive,
      own: { x: 10.5, y: 3.25, z: 700, vx: 1, vy: -2, vz: 3, hp: 87, life: LIFE_ALIVE, ammo: 30, reserve: 120, flags: 3, slot: 1, stamina: 0.5, stanceCd: 0.25 },
      ents: [{ id: 5, x: 812.4, y: 17.3, z: 44.9, yaw: 2.1, pitch: -0.4, life: 1, crouch: true, prone: true, sprint: false, marked: true, team: 2, armor: 3, helmet: 4, pack: 2, weapon: 7, shot: 250, hp: 66, suppressed: true }],
    });
    const s = decodeSnapshot(new DataView(buf));
    expect(s.tick).toBe(900); expect(s.ack).toBe(42); expect(s.own.hp).toBe(87); expect(s.own.reserve).toBe(120); expect(s.own.slot).toBe(1);
    expect(maskHas(s.alive, 5)).toBe(true); expect(maskHas(s.alive, 6)).toBe(false); expect(maskHas(s.alive, 59)).toBe(true);
    const e = s.ents[0];
    expect(e.id).toBe(5); expect(e.x).toBeCloseTo(812.4, 1); expect(e.y).toBeCloseTo(17.3, 1); expect(e.z).toBeCloseTo(44.9, 1);
    expect(e.yaw).toBeCloseTo(2.1, 1); expect(e.pitch).toBeCloseTo(-0.4, 1);
    expect(s.own.stamina).toBeCloseTo(0.5, 2); expect(s.own.stanceCd).toBeCloseTo(0.25, 2);
    expect(e.suppressed).toBe(true); expect(e.hp).toBe(66); expect(e.crouch).toBe(true); expect(e.prone).toBe(true); expect(e.marked).toBe(true); expect(e.team).toBe(2); expect(e.armor).toBe(3); expect(e.helmet).toBe(4); expect(e.pack).toBe(2);
    expect(e.weapon).toBe(7); expect(e.shot).toBe(250); expect(e.hp).toBe(66);
  });
});

describe('pontuação', () => {
  const cz = { x: 0, z: 0, r: 150 }, hz = { x: 50, z: 0, r: 30 };
  it('hot zone conta em dobro', () => {
    expect(whereIs(50, 0, cz, hz)).toBe('hz');
    expect(whereIs(-100, 0, cz, hz)).toBe('cz');
    expect(whereIs(500, 0, cz, hz)).toBe('out');
    const p = computePresence([{ team: 0, x: -100, z: 0 }, { team: 0, x: -90, z: 0 }, { team: 1, x: 50, z: 5 }, { team: 2, x: 900, z: 0 }], cz, hz);
    expect(p).toEqual([2, 2, 0]);
  });
  it('empate = contestada, ninguém pontua', () => {
    expect(controllingTeam([2, 2, 0])).toBe(-1);
    expect(pointsFor([2, 2, 0], 1).points).toBe(0);
    expect(controllingTeam([0, 0, 0])).toBe(-1);
  });
  it('pontos proporcionais à presença', () => {
    const r = pointsFor([3, 8, 1], 1);
    expect(r.team).toBe(1);
    expect(r.points).toBeCloseTo(8 * SCORE_PER_PRESENCE_SECOND);
  });
});

describe('recompensas', () => {
  it('abate vale $2.000 e dobra na hot zone', () => {
    expect(rewardFor('kill', 'out').cash).toBe(2000);
    expect(rewardFor('kill', 'cz').cash).toBe(2000);
    expect(rewardFor('kill', 'hz').cash).toBe(4000);
  });
  it('reviver: $400 fora, $800 na CZ, $1.600 na HZ', () => {
    expect(rewardFor('revive', 'out').cash).toBe(400);
    expect(rewardFor('revive', 'cz').cash).toBe(800);
    expect(rewardFor('revive', 'hz').cash).toBe(1600);
  });
});

describe('loja', () => {
  it('sem seleção fica desarmado', () => {
    const r = buildLoadout([], 1, 0);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.loadout.cost).toBe(0); expect(r.loadout.primary.empty).toBe(true); expect(r.loadout.secondary.empty).toBe(true); }
  });
  it('desconto de recruta de 50% até o nível 10', () => {
    expect(priceFor(ITEM_BY_ID.fuzil_padrao, 1)).toBe(800);
    expect(priceFor(ITEM_BY_ID.fuzil_padrao, 10)).toBe(800);
    expect(priceFor(ITEM_BY_ID.fuzil_padrao, 11)).toBe(1600);
  });
  it('recusa saldo insuficiente, nível baixo, itens duplicados de slot e itens da Fase 2', () => {
    expect(buildLoadout(['fuzil_padrao'], 1, 100).ok).toBe(false);
    expect(buildLoadout(['fuzil_batalha'], 1, 99999).ok).toBe(false);
    expect(buildLoadout(['fuzil_padrao', 'fuzil_leve'], 20, 99999).ok).toBe(false);
    expect(buildLoadout(['tanque'], 99, 999999).ok).toBe(false);
    expect(buildLoadout(['nao_existe'], 99, 999999).ok).toBe(false);
  });
  it('soma o custo do loadout', () => {
    const r = buildLoadout(['fuzil_padrao', 'blind_1', 'capacete_1', 'reanimador'], 20, 99999);
    expect(r.ok && r.loadout.cost).toBe(1600 + 400 + 200 + 425);
  });
});

describe('moitas', () => {
  it('têm tamanho para esconder um soldado e dá para entrar nelas', () => {
    expect(world.bushes.length).toBeGreaterThan(300);
    const b = world.bushes[0];
    expect(world.bushes.every(b => b.r >= BUSH_RADIUS_MIN && b.r <= BUSH_RADIUS_MAX && b.h >= BUSH_HEIGHT_MIN && b.h <= BUSH_HEIGHT_MAX && b.h < PLAYER_HEIGHT)).toBe(true); // menor que o soldado em pé
    expect(world.inBush(b.x, b.z)).toBe(b);
    expect(world.inBush(b.x + b.r * 2, b.z)).not.toBe(b);
    // sem colisão: o jogador atravessa a moita
    const s = newMoveState(b.x - b.r * 1.5, world.heightAt(b.x, b.z) + 0.1, b.z);
    for (let i = 0; i < 60; i++) stepMove(s, 0, 0, world, DT);
    let inside = false;
    for (let i = 0; i < 90; i++) { stepMove(s, BTN_FWD, -Math.PI / 2, world, DT); inside ||= world.inBush(s.x, s.z) !== null; }
    expect(inside).toBe(true);
  });
  it('a moita em que o observador/alvo está não bloqueia a visão, uma no meio do caminho sim', () => {
    // moita isolada: nenhuma outra por perto, para o resultado depender só dela
    const b = world.bushes.find((q) => world.bushes.every((o) => o === q || Math.hypot(o.x - q.x, o.z - q.z) > 45)
      && world.heightAt(q.x - 30, q.z) < q.y + 2 && world.heightAt(q.x + 30, q.z) < q.y + 2 && world.heightAt(q.x + 30, q.z) > q.y - 2)!;
    expect(b).toBeTruthy();
    const y = b.y + b.h * 0.5;
    expect(world.bushBlocks(b.x - 30, b.y + b.h + 0.1, b.z, b.x + 30, b.y + b.h + 0.1, b.z)).toBe(false);
    expect(world.bushBlocks(b.x - 30, b.y + 1.05, b.z, b.x + 30, b.y + 1.05, b.z)).toBe(true); // altura dos olhos agachado
    expect(world.bushBlocks(b.x - 30, y, b.z, b.x + 30, y, b.z)).toBe(true); // no meio do caminho
    expect(world.bushBlocks(b.x, y, b.z, b.x + 30, y, b.z)).toBe(false); // observador dentro dela
    expect(world.bushBlocks(b.x - 30, y, b.z, b.x, y, b.z)).toBe(false); // alvo dentro dela
  });
});

describe('área industrial', () => {
  it('tem pouco mato e bastante cobertura (contêineres, barreiras, muretas, caminhões)', () => {
    const I = world.pois[1];
    const bushes = world.bushes.filter((b) => Math.hypot(b.x - I.x, b.z - I.z) < I.r + 15).length;
    const cover = world.boxes.filter((b) => (b.kind === 9 || b.kind === 2) && Math.hypot((b.x0 + b.x1) / 2 - I.x, (b.z0 + b.z1) / 2 - I.z) < 100).length;
    const crates = world.boxes.filter((b) => b.kind === 1 && Math.hypot((b.x0 + b.x1) / 2 - I.x, (b.z0 + b.z1) / 2 - I.z) < 100).length;
    console.log(`industrial: ${bushes} moitas, ${cover} contêineres/muros/barreiras, ${crates} caixotes`);
    expect(bushes).toBeLessThan(25);
    expect(cover).toBeGreaterThan(45);
  });
});

describe('mochilas', () => {
  it('uma só, soma custo e vai para o loadout', () => {
    const r = buildLoadout(['fuzil_padrao', 'mochila_grande'], 20, 99999);
    expect(r.ok && r.loadout.pack?.pack).toBe(3);
    expect(r.ok && r.loadout.cost).toBe(1600 + 800);
    expect(buildLoadout(['mochila_pequena', 'mochila_media'], 20, 99999).ok).toBe(false);
    expect(buildLoadout(['mochila_grande'], 2, 99999).ok).toBe(false); // exige nível 4
  });
});

describe('miras', () => {
  it('compra mira óptica e soma o custo', () => {
    const r = buildLoadout(['fuzil_padrao', 'mira_pontovermelho'], 20, 99999);
    expect(r.ok && r.loadout.sight?.id).toBe('mira_pontovermelho');
    expect(r.ok && r.loadout.cost).toBe(1600 + 350);
  });
  it('lunetas 6x/8x só em arma de precisão', () => {
    expect(buildLoadout(['fuzil_padrao', 'mira_6x'], 20, 99999).ok).toBe(false);
    expect(buildLoadout(['sniper_ferrolho', 'mira_8x'], 20, 99999).ok).toBe(true);
  });
  it('só uma mira', () => {
    expect(buildLoadout(['fuzil_padrao', 'mira_2x', 'mira_4x'], 20, 99999).ok).toBe(false);
  });
});

describe('níveis', () => {
  it('xp ↔ nível', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(xpForLevel(7))).toBe(7);
    expect(levelFromXp(xpForLevel(7) - 1)).toBe(6);
  });
});
