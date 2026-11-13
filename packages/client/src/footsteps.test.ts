import {describe,it,expect} from 'vitest';
import {Footsteps} from './footsteps';
describe('passos',()=>{
 it('gera passos pela distância, sem som parado',()=>{const f=new Footsteps();let steps=0;for(let i=0;i<100;i++)if(f.advance(1,i*.1,0,0,i*16,true,false,false,false))steps++;expect(steps).toBeGreaterThan(4);for(let i=100;i<200;i++)expect(f.advance(1,9.9,0,0,i*16,true,false,false,false)).toBe(false);});
 it('não toca passos no ar, deitado ou ao teleportar',()=>{const f=new Footsteps();for(let i=0;i<100;i++)expect(f.advance(1,i,0,0,i*16,false,false,false,false)).toBe(false);expect(f.advance(1,200,0,0,1600,true,false,false,false)).toBe(false);for(let i=0;i<100;i++)expect(f.advance(2,i,0,0,i*16,true,false,true,false)).toBe(false);});
 it('descarta histórico velho para não tocar passos de reconexão',()=>{const f=new Footsteps();f.advance(1,0,0,0,0,true,false,false,false);f.prune(2000);expect(f.advance(1,1.8,0,0,2001,true,false,false,false)).toBe(false);});
});
