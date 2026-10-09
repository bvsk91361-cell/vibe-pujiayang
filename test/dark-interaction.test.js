import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProductStore} from '../src/product-store.js';
import {createApp} from '../server.js';
import {createAiAssistant} from '../src/ai.js';
import {buildNotifications} from '../src/notifications.js';
import {inspectPlan} from '../src/creative.js';
import {commonAvailability,availabilityLabel,displayedAvailability,addDays} from '../src/planning.js';
import {localDate,equipment} from '../src/booking.js';
import {prepareAvatar,avatarCrop,encodeAvatar,personalExport,MAX_AVATAR_BYTES,SAVED_AVATAR_BYTES} from '../public/profile-client.js';
const date=()=>addDays(localDate(),1),slot='14:00–16:00';

test('通知按真实方案与时间聚合；不同身份、预约和时段不误合并',t=>{
 const db=createProductStore(':memory:');t.after(()=>db.close());const [a,b]=db.users();
 const plan=db.savePlan(a.id,{name:'校园采访',date:date(),slot,equipmentIds:['camera','projector']});
 for(const id of plan.equipmentIds)db.add({userId:a.id,planId:plan.id,date:plan.date,slot,equipmentId:id});
 db.add({userId:a.id,date:plan.date,slot:'19:00–21:00',equipmentId:'camera'});
 db.add({userId:b.id,date:plan.date,slot,equipmentId:'recorder'});
 const notices=db.workspace(a.id).notifications;
 assert.equal(notices.length,2);assert.equal(notices[0].count,2);assert.equal(notices[0].title,'校园采访');
 assert.equal(notices[0].target.type,'schedule');assert.ok(notices[0].target.key.includes(plan.id));
 assert.equal(db.workspace(b.id).notifications.length,1);assert.equal(new Set(notices.map(n=>n.id)).size,2);
});

test('已读按身份持久化，重复确认幂等，取消后未读不残留',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'borrow-notice-'));let db=createProductStore(join(dir,'test.sqlite'));
 t.after(async()=>{db.close();await rm(dir,{recursive:true,force:true});});const [a,b]=db.users();
 const booking=db.add({userId:a.id,date:date(),slot,equipmentId:'camera'}),id=db.workspace(a.id).notifications[0].id;
 assert.equal(db.workspace(a.id).unreadCount,1);assert.throws(()=>db.markNotificationsRead(b.id,[id]),/已经变化/);
 db.markNotificationsRead(a.id,[id,id]);assert.equal(db.workspace(a.id).unreadCount,0);
 db.close();db=createProductStore(join(dir,'test.sqlite'));assert.equal(db.workspace(a.id).notifications[0].read,true);
 db.cancel(booking.id,a.id);assert.equal(db.workspace(a.id).notifications.length,0);assert.equal(db.workspace(a.id).unreadCount,0);
});

test('冲突通知指向具体方案；进行中的预约不再写即将开始',t=>{
 const db=createProductStore(':memory:');t.after(()=>db.close());const [a,b]=db.users();
 const p=db.savePlan(a.id,{name:'播客',date:date(),slot,equipmentIds:['camera']});db.add({userId:b.id,date:p.date,slot,equipmentId:'camera'});
 const notice=db.workspace(a.id).notifications[0];assert.equal(notice.kind,'conflict');assert.deepEqual(notice.target,{type:'plan',id:p.id});
 const group={key:'event',name:'采访',date:'2026-10-08',slot,count:1,records:[{id:'r'}]};
 const result=buildNotifications([group,group],[],new Set(),new Date('2026-10-08T15:00:00'));
 assert.equal(result.length,1);assert.equal(result[0].label,'正在使用');
});

test('通知阅读接口校验真实事件，错误请求不改变未读；样式和头像模块可加载',async t=>{
 const store=createProductStore(':memory:');t.after(()=>store.close());const app=createApp(store,createAiAssistant({config:{}}));
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base='http://127.0.0.1:'+app.address().port,user=store.users()[0];store.add({userId:user.id,date:date(),slot,equipmentId:'camera'});
 const post=ids=>fetch(base+'/api/notifications/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,ids})});
 assert.equal((await post(['invented'])).status,409);assert.equal(store.workspace(user.id).unreadCount,1);
 assert.equal((await post([store.workspace(user.id).notifications[0].id])).status,200);assert.equal(store.workspace(user.id).unreadCount,0);
 for(const path of ['/interactions.css','/avatar-editor.js'])assert.equal((await fetch(base+path)).status,200);
});

test('1件本人已预约+2件可预约明确分离；其他身份占用不能计为已预约',()=>{
 const p={userId:'me',date:date(),slot,equipmentIds:['camera','projector','recorder']};
 const records=[{userId:'me',date:p.date,slot,equipmentId:'camera'}];
 let checked=inspectPlan(p,records),moment=commonAvailability(p,records,equipment,p.date)[0].best;
 assert.equal(checked.reserved,1);assert.equal(checked.reservable,2);assert.equal(moment.reserved,1);assert.equal(moment.reservable,2);
 assert.equal(availabilityLabel(moment),'1 已预约 · 2 可预约');assert.equal(checked.planState.state,'PARTIALLY_RESERVED');
 records.push({userId:'other',date:p.date,slot,equipmentId:'projector'});checked=inspectPlan(p,records);
 assert.equal(checked.reservable,1);assert.equal(checked.reserved,1);assert.equal(checked.blocked,1);assert.equal(checked.planState.state,'CONFLICT');
 records[0].status='cancelled';checked=inspectPlan(p,records);assert.equal(checked.reserved,0);assert.equal(checked.reservable,2);
 const expired=commonAvailability(p,records,equipment,'2026-10-08',new Date('2026-10-08T17:00:00'))[0];
 assert.equal(expired.moments.some(m=>m.slot===slot),false);
});

test('允许普通大照片，拒绝超过10MB、解码无效和过大像素，不原样保存',async()=>{
 const file={type:'image/jpeg',size:4*1024*1024},deps={read:async()=> 'data:image/jpeg;base64,YQ==',decode:async()=>({width:2400,height:1800})};
 assert.equal((await prepareAvatar(file,deps)).width,2400);
 await assert.rejects(prepareAvatar({...file,size:MAX_AVATAR_BYTES+1},deps),/10MB/);
 await assert.rejects(prepareAvatar(file,{...deps,decode:async()=>({width:10000,height:10000})}),/像素过大/);
 await assert.rejects(prepareAvatar(file,{...deps,decode:async()=>({width:0,height:1})}),/无法打开/);
});

test('日期轨道保留所选时段的冲突，不能偷换为当天另一个全空时段',()=>{
 const p={userId:'me',date:date(),slot,equipmentIds:['camera','projector','recorder']};
 const records=[{userId:'me',equipmentId:'camera',date:p.date,slot},{userId:'other',equipmentId:'projector',date:p.date,slot}];
 const day=commonAvailability(p,records,equipment,p.date)[0];
 assert.notEqual(day.best.slot,slot);assert.equal(day.best.reservable,3);
 const selected=displayedAvailability(day,p);assert.equal(selected.slot,slot);assert.equal(selected.blocked,1);
 assert.equal(availabilityLabel(selected),'1 已预约 · 1 可预约 · 1 待处理');
 assert.equal(displayedAvailability(day,{...p,date:addDays(p.date,1)}),day.best);
});

test('个人导出包含当前身份真实预约、收藏、方案和偏好，未加载不能导出空文件',t=>{
 const db=createProductStore(':memory:');t.after(()=>db.close());const [a,b]=db.users();
 db.preferences(a.id,{font:'large'});db.favorite(a.id,'camera',true);
 const plan=db.savePlan(a.id,{name:'个人采访',date:date(),slot,equipmentIds:['camera']});
 const booking=db.add({userId:a.id,planId:plan.id,date:date(),slot,equipmentId:'camera'});
 db.add({userId:b.id,date:date(),slot,equipmentId:'projector'});
 const result=JSON.parse(personalExport(db.workspace(a.id),new Date('2026-10-08T08:00:00Z')));
 assert.equal(result.user.id,a.id);assert.equal(result.user.prefs.font,'large');assert.deepEqual(result.favorites,['camera']);
 assert.equal(result.plans[0].id,plan.id);assert.deepEqual(result.history.map(r=>r.id),[booking.id]);
 assert.equal(result.exportedAt,'2026-10-08T08:00:00.000Z');assert.throws(()=>personalExport(null),/尚未加载/);
});

test('源图正方形裁剪保持比例，圆形遮罩保留透明背景，编码有上限',()=>{
 assert.deepEqual(avatarCrop(1200,800),{x:200,y:0,width:800,height:800});
 assert.deepEqual(avatarCrop(800,1200,{zoom:2,x:1,y:0}),{x:400,y:0,width:400,height:400});
 const calls=[],ctx={clearRect:(...args)=>calls.push(['clear',...args]),save(){},beginPath(){},arc:(...args)=>calls.push(['circle',...args]),clip(){},restore(){},fillRect:(...args)=>calls.push(['fill',...args]),drawImage:(...args)=>calls.push(['draw',...args])};let encodes=0;
 const canvas={getContext:()=>ctx,toDataURL:()=>++encodes===1?'data:image/webp;base64,'+'A'.repeat(300000):'data:image/webp;base64,YQ=='};
 assert.equal(encodeAvatar({image:{},width:1200,height:800},{},canvas),'data:image/webp;base64,YQ==');
 assert.equal(canvas.width,512);assert.equal(canvas.height,512);assert.deepEqual(calls.find(call=>call[0]==='draw').slice(2),[200,0,800,800,0,0,512,512]);
 assert.deepEqual(calls.find(call=>call[0]==='circle').slice(1),[256,256,256,0,Math.PI*2]);assert.equal(calls.some(call=>call[0]==='fill'),false);assert.equal(encodes,2);
 canvas.toDataURL=()=>'data:image/webp;base64,'+'A'.repeat(SAVED_AVATAR_BYTES*2);assert.throws(()=>encodeAvatar({image:{},width:800,height:800},{},canvas),/无法优化/);
 assert.throws(()=>encodeAvatar({image:{},width:800,height:800},{},{getContext:()=>null}),/无法处理/);
});

test('头像与偏好写入绑定身份；超限资源失败保持原头像和偏好',t=>{
 const db=createProductStore(':memory:');t.after(()=>db.close());const [a,b]=db.users(),small='data:image/webp;base64,YQ==';
 db.preferences(a.id,{avatar:small,font:'large'});assert.equal(db.workspace(a.id).user.avatar,small);assert.equal(db.workspace(b.id).user.avatar,b.avatar);
 assert.throws(()=>db.preferences(a.id,{avatar:'data:image/webp;base64,'+'A'.repeat(240001),font:'xlarge'}),/资源过大/);
 assert.equal(db.workspace(a.id).user.avatar,small);assert.equal(db.workspace(a.id).user.prefs.font,'large');
});
