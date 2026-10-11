export function createLiveSync({hasSession,onChange,onExpired,onMode}){
 let source=null,connected=false,timer=null,disposed=false;
 const visible=()=>!document.hidden&&hasSession();
 function poll(){if(visible()&&!connected)onChange();}
 function connect(){
  if(disposed||!visible()||source||typeof EventSource!=='function')return;
  source=new EventSource('/api/admin/events');
  source.addEventListener('ready',()=>{connected=true;onMode('events');});
  source.addEventListener('business-change',()=>{if(visible())onChange();});
  source.addEventListener('session-expired',()=>{disconnect();onExpired();});
  source.addEventListener('sync-error',()=>{connected=false;onMode('polling');if(visible())onChange();});
  source.onerror=()=>{connected=false;onMode('polling');};
 }
 function disconnect(){source?.close();source=null;connected=false;}
 function focus(){if(visible()){connect();onChange();}}
 function visibility(){if(document.hidden){disconnect();onMode('paused');}else focus();}
 window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);
 timer=setInterval(poll,15000);
 return {start(){disposed=false;connect();},isConnected:()=>connected,dispose(){disposed=true;disconnect();clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility);}};
}
