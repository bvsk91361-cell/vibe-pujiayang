import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
import {createProductStore} from '../src/product-store.js';
import {createAdminAuth} from '../src/admin-auth.js';
import {createAiAssistant} from '../src/ai.js';
import {localDate,slots} from '../src/booking.js';
import {addDays} from '../src/planning.js';

async function readEvents(response,controller){
 const events=[],reader=response.body.getReader(),decoder=new TextDecoder();
 let buffer='',closed=false;
 const done=(async()=>{try{while(true){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))>=0){const packet=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=packet.match(/^event: (.+)$/m)?.[1],data=packet.match(/^data: (.+)$/m)?.[1];if(event)events.push({event,data:JSON.parse(data)});}}}catch(error){if(error.name!=='AbortError')throw error;}finally{closed=true;}})();
 async function waitFor(predicate){const until=Date.now()+4500;while(Date.now()<until){const result=predicate(events,closed);if(result)return result;await new Promise(resolve=>setTimeout(resolve,20));}assert.fail('预期的真实SSE事件未在期限内到达');}
 return {events,done,waitFor,close:()=>controller.abort()};
}

test('认证SSE逐客户端跟踪版本；用户预约和取消真实通知，退出撤销流且不泄露管理员数据',async t=>{
 const store=createProductStore(':memory:'),auth=createAdminAuth(':memory:');
 await auth.setup('event-verification','isolated-event-verification-password');
 const app=createApp(store,createAiAssistant({config:{}}),{adminAuth:auth,adminEventIntervalMs:1000});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.address().port,streams=[];
 t.after(async()=>{streams.forEach(stream=>stream.close());await Promise.all(streams.map(stream=>stream.done));await new Promise(resolve=>app.close(resolve));auth.close();store.close();});
 const send=(path,{method='GET',body,cookie,csrf}={})=>fetch(base+path,{method,headers:{...(method!=='GET'?{Origin:base,'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-Admin-CSRF':csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 for(const path of ['/api/admin/events','/api/admin/intelligence']){
  assert.equal((await send(path)).status,401);
  assert.equal((await send(path,{cookie:'isAdmin=true; userId=student'})).status,401);
 }
 async function login(){const response=await send('/api/admin/login',{method:'POST',body:{username:'event-verification',password:'isolated-event-verification-password'}});assert.equal(response.status,200);return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:(await response.json()).csrfToken};}
 async function open(session){const controller=new AbortController(),response=await fetch(base+'/api/admin/events',{headers:{Cookie:session.cookie},signal:controller.signal});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/event-stream/);const stream=await readEvents(response,controller);streams.push(stream);await stream.waitFor(events=>events.find(event=>event.event==='ready'));return stream;}
 const first=await login(),a=await open(first),user=store.users()[0],input={userId:user.id,equipmentId:'camera',date:addDays(localDate(),1),slot:slots[1]};
 const created=await send('/api/reservations',{method:'POST',body:input});assert.equal(created.status,201);const booking=await created.json();
 // A new client starts from the latest revision; it must not swallow A's pending update.
 const second=await login(),b=await open(second);
 const bookedEvent=await a.waitFor(events=>events.find(event=>event.event==='business-change'));
 assert.notEqual(bookedEvent.data.revision,a.events[0].data.revision);
 assert.equal((await (await send('/api/admin/intelligence',first)).json()).timeFlow.items.filter(row=>row.id===booking.id).length,1);
 assert.equal((await send('/api/reservations/'+booking.id+'?userId='+user.id,{method:'DELETE'})).status,200);
 await a.waitFor(events=>events.filter(event=>event.event==='business-change').length>=2);
 const cancelEvent=await b.waitFor(events=>events.find(event=>event.event==='business-change'));
 assert.equal(cancelEvent.data.revision,store.admin.revision());assert.equal(store.list().length,0);
 assert.equal((await send('/api/admin/logout',{...first,method:'POST',body:{}})).status,200);
 await a.waitFor(events=>events.find(event=>event.event==='session-expired'));await a.waitFor((events,closed)=>closed);
 assert.equal((await send('/api/admin/intelligence',first)).status,401);
 assert.equal((await send('/api/admin/intelligence',second)).status,200);
 assert.ok(!JSON.stringify(a.events).includes('password'));assert.ok(!JSON.stringify(a.events).includes('event-verification'));assert.ok(!JSON.stringify(a.events).includes(first.csrf));
});
