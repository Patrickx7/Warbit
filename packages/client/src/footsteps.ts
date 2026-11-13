/** Distance-based gait: ignores spawn, teleports, airborne movement and stale entities. */
export class Footsteps {
 private states=new Map<number,{x:number;y:number;z:number;distance:number;at:number}>();
 advance(id:number,x:number,y:number,z:number,now:number,grounded:boolean,crouch:boolean,prone:boolean,sprint:boolean):boolean {
  const prev=this.states.get(id);const state={x,y,z,distance:prev?.distance??0,at:now};this.states.set(id,state);
  if(!prev||now-prev.at>500||!grounded||prone){state.distance=0;return false;}
  const d=Math.hypot(x-prev.x,z-prev.z);
  if(d>2||Math.abs(y-prev.y)>.2){state.distance=0;return false;}
  if(d<.002)return false;
  state.distance+=d;const stride=crouch?.95:sprint?2.1:1.65;
  if(state.distance<stride)return false;state.distance%=stride;return true;
 }
 prune(now:number){for(const [id,s] of this.states)if(now-s.at>1000)this.states.delete(id);}
}
