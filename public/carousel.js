export function createCarousel({count,onChange=()=>{},onState=()=>{},interval=7000,scheduler={set:(fn,ms)=>setInterval(fn,ms),clear:id=>clearInterval(id)}}){
 if(!Number.isInteger(count)||count<1)throw new Error('Carousel requires slides');
 let index=0,timer=null,disposed=false;const reasons=new Set();
 const state=()=>({index,paused:reasons.size>0,reasons:[...reasons]});
 function sync(){if(timer!==null){scheduler.clear(timer);timer=null;}if(!disposed&&!reasons.size&&count>1)timer=scheduler.set(()=>go(index+1,false),interval);onState(state());}
 function pause(reason,value=true){if(value)reasons.add(reason);else reasons.delete(reason);sync();}
 function go(value,manual=true){index=((value%count)+count)%count;if(manual)reasons.add('manual');onChange(index,manual);sync();}
 sync();
 return {state,go,next:()=>go(index+1),previous:()=>go(index-1),pause,dispose(){disposed=true;if(timer!==null)scheduler.clear(timer);timer=null;}};
}
