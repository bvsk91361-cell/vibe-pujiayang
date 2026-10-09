// One current request. Duplicate clicks share it; older responses cannot commit UI state.
export function createLatestRequest(){
 let active=null,index=0;
 const current=ticket=>!!ticket&&active===ticket&&!ticket.signal.aborted;
 return {current,begin(key){if(active?.key===key&&!active.signal.aborted)return null;active?.controller.abort();const controller=new AbortController();active={id:++index,key,controller,signal:controller.signal};return active;},finish(ticket){if(active===ticket)active=null;},cancel(){active?.controller.abort();active=null;}};
}
