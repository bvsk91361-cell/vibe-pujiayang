// Authenticated, read-only change notifications. Booking transactions stay intact.
export function createAdminEvents({store,auth,intervalMs=5000}){
 const clients=new Set();let timer=null;
 function stop(){if(timer){clearInterval(timer);timer=null;}}
 function remove(client){clients.delete(client);if(!clients.size)stop();}
 function send(client,event,data){if(!client.res.destroyed)client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}
 function tick(){
  if(!clients.size)return;
  try{
   const revision=store.admin.revision();
   for(const client of clients){
    if(!auth.session(client.token)){send(client,'session-expired',{reason:'session-expired'});client.res.end();remove(client);continue;}
    if(revision!==client.revision){send(client,'business-change',{revision,at:new Date().toISOString()});client.revision=revision;}
    else client.res.write(': heartbeat\n\n');
   }
  }catch{for(const client of clients){send(client,'sync-error',{message:'变更同步暂时不可用，请重新读取台账。'});client.res.end();}clients.clear();stop();}
 }
 function handle(req,res,session){
  const revision=store.admin.revision();
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
  res.flushHeaders?.();
  const client={res,token:session.token,revision};clients.add(client);
  send(client,'ready',{revision,at:new Date().toISOString(),intervalMs});
  res.once('close',()=>remove(client));
  if(!timer){timer=setInterval(tick,intervalMs);timer.unref?.();}
 }
 function close(){for(const client of clients)client.res.end();clients.clear();stop();}
 return {handle,notify:tick,close};
}
