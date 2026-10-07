import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createProductStore} from '../src/product-store.js';
import {createApp} from '../server.js';
import {createAiAssistant} from '../src/ai.js';
import {localDate} from '../src/booking.js';
import {addDays} from '../src/planning.js';
test('过期方案保留历史而不会使个人空间失败，重新准备仍必须用有效未来日期',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'borrow-past-'));t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});const file=join(dir,'store.sqlite');let store=createProductStore(file);const user=store.users()[0],plan=store.savePlan(user.id,{name:'历史计划',date:addDays(localDate(),1),slot:'14:00–16:00',equipmentIds:['camera']});store.close();const raw=new DatabaseSync(file);raw.prepare('UPDATE plans SET payload=? WHERE id=?').run(JSON.stringify({...plan,date:addDays(localDate(),-1),status:'ready'}),plan.id);raw.close();store=createProductStore(file);const workspace=store.workspace(user.id);assert.equal(workspace.plans[0].expired,true);assert.equal(workspace.plans[0].readiness,0);assert.deepEqual(workspace.plans[0].items[0].alternatives,[]);assert.equal(workspace.notifications.length,0);assert.throws(()=>store.readyPlan(user.id,plan.id));
});
test('本地API拒绝跨站写入和未指定归属的取消，合法本机来源保留业务',async t=>{
 const store=createProductStore(':memory:');t.after(()=>store.close());const app=createApp(store,createAiAssistant({config:{}}));await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));const base='http://127.0.0.1:'+app.address().port,user=store.users()[0],booking=store.add({userId:user.id,date:addDays(localDate(),1),slot:'14:00–16:00',equipmentId:'camera'});let result=await fetch(base+'/api/users',{method:'POST',headers:{Origin:'https://external.invalid','Content-Type':'application/json'},body:JSON.stringify({name:'wrong'})});assert.equal(result.status,403);assert.equal(store.users().length,4);result=await fetch(base+'/api/reservations/'+booking.id,{method:'DELETE'});assert.equal(result.status,403);assert.equal(store.list().length,1);result=await fetch(base+'/api/reservations/'+booking.id+'?userId='+user.id,{method:'DELETE',headers:{Origin:base}});assert.equal(result.status,200);assert.equal(store.list().length,0);
});
