import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createProductStore} from '../src/product-store.js';
import {createApp} from '../server.js';
import {createAiAssistant} from '../src/ai.js';
import {equipment,localDate} from '../src/booking.js';
import {addDays} from '../src/planning.js';
import {creativeScenes} from '../src/creative.js';
import {bookingIntent,saveBooking,readBooking,validReceipt,requestedTime} from '../public/booking-intent.js';
import {saveDraft,readPlanDraft,saveRecommendation,readRecommendation} from '../public/plan-flow.js';

const date=()=>addDays(localDate(),2),slot='14:00–16:00';
const store=t=>{const db=createProductStore(':memory:');t.after(()=>db.close());return db;};
const input=(user,ids=['camera','projector','recorder'])=>({userId:user.id,equipmentIds:ids,date:date(),slot,name:'采访搭配',requestId:randomUUID()});
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};};
function assertFixtureDirectory(directory){
 const target=resolve(directory),child=relative(resolve(tmpdir()),target);
 assert.ok(child&&!isAbsolute(child)&&child===basename(target)&&child.startsWith('borrow-simplify-'),'Only this test temporary directory may be removed');
}

test('创建空方案真实可恢复；编辑、保存和重开都不产生预约',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'borrow-simplify-'));let db=createProductStore(join(dir,'test.sqlite'));
 t.after(async()=>{db.close();assertFixtureDirectory(dir);await rm(dir,{recursive:true,force:true});});
 const user=db.users()[0],empty=db.savePlan(user.id,{name:'周五创作',sceneId:'custom',date:'',slot:'',equipmentIds:[]});
 assert.ok(empty.id);assert.equal(db.list().length,0);assert.equal(empty.planState.state,'DRAFT');
 db.savePlan(user.id,{...empty,name:'周五产品短片',equipmentIds:['camera','light-f1']},empty.id);db.close();db=createProductStore(join(dir,'test.sqlite'));
 const saved=db.workspace(user.id).plans.find(plan=>plan.id===empty.id);assert.equal(saved.name,'周五产品短片');assert.deepEqual(saved.equipmentIds,['camera','light-f1']);assert.equal(saved.planState.state,'NEED_TIME');assert.equal(db.list().length,0);
});

test('场景整套直接预约三件真实设备，不先创建方案；通知按这次预约聚合',t=>{
 const db=store(t),user=db.users()[0],scene=creativeScenes.find(s=>s.id==='podcast'),result=db.reserveSet(input(user,scene.ids));
 assert.equal(result.atomic,true);assert.equal(result.records.length,3);assert.equal(result.created,3);
 const workspace=db.workspace(user.id);assert.equal(workspace.plans.length,0);assert.equal(workspace.history.length,3);assert.equal(workspace.upcoming.length,1);assert.equal(workspace.notifications.length,1);assert.equal(workspace.notifications[0].count,3);
});

test('最后一件设备冲突时整套拒绝，不部分写入，也不提前更新方案时间',t=>{
 const db=store(t),[a,b]=db.users(),plan=db.savePlan(a.id,{name:'采访',equipmentIds:['camera','projector','recorder'],date:'',slot:''});
 db.add({userId:b.id,equipmentId:'recorder',date:date(),slot});
 assert.throws(()=>db.reserveSet({...input(a),planId:plan.id}),error=>error.status===409);
 assert.equal(db.list().length,1);assert.equal(db.workspace(a.id).history.length,0);const unchanged=db.workspace(a.id).plans[0];assert.equal(unchanged.date,'');assert.equal(unchanged.slot,'');
});

test('设备重复、维护、无效时段、空请求都拒绝，不写入任何预约',t=>{
 const db=store(t),user=db.users()[0],maintenance=equipment.find(item=>item.operationalStatus==='maintenance');
 for(const value of [null,{...input(user),equipmentIds:['camera','camera']},{...input(user),equipmentIds:[]},{...input(user),equipmentIds:['unknown']},{...input(user),slot:'13:00–15:00'},{...input(user),equipmentIds:[maintenance.id]}])assert.throws(()=>db.reserveSet(value));
 assert.equal(db.list().length,0);
});

test('本人已预约设备不重复创建；其他身份的占用不能被当作本人已预约',t=>{
 const db=store(t),[a,b]=db.users(),own=db.add({userId:a.id,equipmentId:'camera',date:date(),slot});
 const result=db.reserveSet(input(a));assert.equal(result.alreadyReserved,1);assert.equal(result.created,2);assert.equal(result.records.find(r=>r.equipmentId==='camera').id,own.id);assert.equal(db.list().length,3);
 assert.throws(()=>db.reserveSet(input(b)),error=>error.status===409);assert.equal(db.workspace(b.id).history.length,0);
});

test('同一请求重复提交与重启重放均幂等；取消后旧回执不能冒充有效预约',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'borrow-simplify-'));let db=createProductStore(join(dir,'test.sqlite'));
 t.after(async()=>{db.close();assertFixtureDirectory(dir);await rm(dir,{recursive:true,force:true});});
 const user=db.users()[0],request=input(user),first=db.reserveSet(request);assert.deepEqual(db.reserveSet(request),first);assert.equal(db.list().length,3);
 db.close();db=createProductStore(join(dir,'test.sqlite'));assert.deepEqual(db.reserveSet(request),first);
 assert.throws(()=>db.reserveSet({...request,slot:'19:00–21:00'}),error=>error.status===409);
 db.cancel(first.records[0].id,user.id);assert.throws(()=>db.reserveSet(request),error=>error.status===409);
 const renewed=db.reserveSet({...request,requestId:randomUUID()});assert.equal(renewed.created,1);assert.equal(renewed.alreadyReserved,2);assert.equal(db.list().length,3);
});

test('方案只在最终确认事务中关联时间；跨身份与已变化设备组合不能借用方案',t=>{
 const db=store(t),[a,b]=db.users(),plan=db.savePlan(a.id,{name:'校园采访',date:'',slot:'',equipmentIds:['camera','projector']});
 assert.throws(()=>db.reserveSet({...input(b,plan.equipmentIds),planId:plan.id}),error=>error.status===403);
 assert.throws(()=>db.reserveSet({...input(a),planId:plan.id}),error=>error.status===409);
 db.reserveSet({...input(a,plan.equipmentIds),planId:plan.id});const saved=db.workspace(a.id).plans[0];assert.equal(saved.date,date());assert.equal(saved.slot,slot);assert.equal(saved.planState.state,'RESERVED');
});

test('HTTP真实并发整套预约仅一套成功，失败请求不会留下部分记录',async t=>{
 const db=store(t),app=createApp(db,createAiAssistant({config:{}}));await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));
 const [a,b]=db.users(),base='http://127.0.0.1:'+app.address().port;
 const post=value=>fetch(base+'/api/reservations/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 const responses=await Promise.all([post(input(a)),post(input(b))]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal(db.list().length,3);
 const winner=responses.find(r=>r.status===201),result=await winner.json();assert.equal(result.atomic,true);assert.equal(result.records.length,3);assert.equal(new Set(db.list().map(r=>r.userId)).size,1);
 for(const path of ['/booking-flow.js','/booking-intent.js','/task-flow.css'])assert.equal((await fetch(base+path)).status,200);
});

test('预约意图不默认日期或时段；刷新保留设备、时间、来源和幂等标识，身份隔离',()=>{
 const storage=memory(),intent=bookingIntent({name:'播客',equipmentIds:['microphone-m1','recorder-r2'],source:'scene',sceneId:'podcast'},'a',equipment,{sourceView:'discover',sourceY:560});
 assert.equal(intent.date,'');assert.equal(intent.slot,'');intent.date=date();intent.slot=slot;saveBooking(storage,intent);
 assert.deepEqual(readBooking(storage,'a',equipment),intent);assert.equal(readBooking(storage,'b',equipment),null);
 assert.throws(()=>bookingIntent({equipmentIds:['camera','camera']},'a',equipment));assert.equal(saveBooking({setItem(){throw Error('quota');}},intent),false);
});

test('模型默认时间不冒充用户选择；明确日期与时段分别保留',()=>{
 const result={date:date(),slot};assert.deepEqual(requestedTime('给我一套轻量Vlog设备',result),{date:'',slot:''});
 assert.deepEqual(requestedTime('我明天下午想拍轻量Vlog',result),result);
 assert.deepEqual(requestedTime('周五做校园采访',result),{date:result.date,slot:''});
 assert.deepEqual(requestedTime('下午拍摄，需要4/3英寸画幅',result),{date:'',slot});
});

test('不完整回执、跨身份、重复设备和已取消记录不能显示整套成功',()=>{
 const intent=bookingIntent({equipmentIds:['camera','projector'],date:date(),slot},'a',equipment),records=intent.equipmentIds.map((id,index)=>({id:String(index),userId:'a',equipmentId:id,date:intent.date,slot}));
 const receipt={atomic:true,requestId:intent.requestId,date:intent.date,slot,records};assert.equal(validReceipt(intent,receipt,records),true);
 assert.equal(validReceipt(intent,{...receipt,records:records.slice(0,1)}),false);assert.equal(validReceipt(intent,{...receipt,records:[records[0],records[0]]}),false);assert.equal(validReceipt(intent,{...receipt,records:records.map(r=>({...r,userId:'b'}))}),false);assert.equal(validReceipt(intent,receipt,records.slice(0,1)),false);
});

test('切换方案保留各自本地草稿，不自动创建预约或覆盖另一身份',()=>{
 const storage=memory(),first={id:'p1',name:'采访',sceneId:'custom',equipmentIds:['camera'],date:'',slot:''},second={id:'p2',name:'播客',sceneId:'custom',equipmentIds:['recorder'],date:'',slot:''};
 saveDraft(storage,'a',first);saveDraft(storage,'a',second);assert.deepEqual(readPlanDraft(storage,'a',equipment,'p1'),first);assert.deepEqual(readPlanDraft(storage,'a',equipment,'p2'),second);assert.equal(readPlanDraft(storage,'b',equipment,'p1'),null);
});

test('AI推荐刷新可恢复真实搭配与所选时间，账号隔离且拒绝目录外设备',()=>{
 const storage=memory(),plan={name:'轻量Vlog',sceneId:'vlog',date:date(),slot,equipmentIds:['gimbal-g1','microphone-m1'],savedId:'saved-plan'};
 assert.equal(saveRecommendation(storage,'a',plan),true);const restored=readRecommendation(storage,'a',equipment);assert.deepEqual(restored.equipmentIds,plan.equipmentIds);assert.equal(restored.date,plan.date);assert.equal(restored.slot,slot);assert.equal(restored.savedId,'saved-plan');assert.equal(readRecommendation(storage,'b',equipment),null);
 saveRecommendation(storage,'a',{...plan,equipmentIds:['invented-device']});assert.equal(readRecommendation(storage,'a',equipment),null);
 assert.equal(saveRecommendation({setItem(){throw Error('quota');}},'a',plan),false);
});
