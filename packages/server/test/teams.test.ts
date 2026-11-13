import {describe,it,expect} from 'vitest';
import {World} from '@warbit/shared';
import {Match} from '../src/game/Match';
const world=new World(4321);const conn=()=>({send:(_d:string|ArrayBuffer)=>{}});
describe('escolha de time',()=>{
 it('amigos podem entrar na mesma equipe e recebem o mesmo mundo',()=>{const m=new Match(world,null,{bots:false});for(const team of [0,1,2]){expect(m.join(conn(),'A',undefined,team)?.team).toBe(team);expect(m.join(conn(),'B',undefined,team)?.team).toBe(team);}});
 it('time cheio é rejeitado, sem trocar silenciosamente de equipe',()=>{const m=new Match(world,null,{bots:false});for(let i=0;i<20;i++)expect(m.join(conn(),'A',undefined,1)?.team).toBe(1);expect(m.join(conn(),'A',undefined,1)).toBeNull();expect(m.join(conn(),'B',undefined,2)?.team).toBe(2);});
 it('valores inválidos usam distribuição automática',()=>{const m=new Match(world,null,{bots:false});for(const team of [-1,8,NaN,1.5])expect(m.join(conn(),'A',undefined,team)).not.toBeNull();});
});
