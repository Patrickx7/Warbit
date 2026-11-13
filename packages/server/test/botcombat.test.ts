import { expect, it, vi } from 'vitest';
import { LIFE_ALIVE, World } from '@warbit/shared';
import { Match } from '../src/game/Match';

it('bot percebe e atira num jogador visível além de quatro inimigos escondidos', () => {
  const world = new World(4321), m = new Match(world, null, { bots:false });
  const bot = m.players[30]; bot.respawnAt=0; m.spawn(bot,['fuzil_padrao']);
  const human = m.join({send() {}},'Alvo',undefined,1)!; m.spawn(human,[]);
  const x=750,z=250,y=world.heightAt(x,z);
  Object.assign(bot.ms,{x,y,z}); Object.assign(human.ms,{x,y,z:z-25});
  const hidden = m.players.filter(p=>p!==human && p.team!==bot.team).slice(0,4);
  hidden.forEach((p,i)=>{p.life=LIFE_ALIVE;Object.assign(p.ms,{x:x+3+i,y,z:z-5});});
  const sight=vi.spyOn(world,'canSee').mockImplementation((_x,_y,_z,tx,_ty,tz)=>Math.abs(tx-human.ms.x)<.1 && Math.abs(tz-human.ms.z)<.1);
  bot.brain!.aimYaw=0; bot.brain!.spawnedAt=-9999;
  try {
    let acquired=false;
    for(let i=0;i<100;i++){m.tick++;bot.brain!.think(m,bot);acquired ||= bot.brain!.targetId===human.id;}
    expect(acquired).toBe(true);
    expect(bot.shot).toBeGreaterThan(0);
  } finally { sight.mockRestore(); }
});
