import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {equipment,localDate,slots} from '../src/booking.js';
import {addDays} from '../src/planning.js';
import {createProductStore} from '../src/product-store.js';
import {createAiAssistant} from '../src/ai.js';
import {createApp} from '../server.js';
import {parseAvailabilityQuestion} from '../src/availability-query.js';
import {sortPlans} from '../src/plan-state.js';
import {receiptDetails} from '../public/booking-receipt.js';
import {bookingIntent} from '../public/booking-intent.js';
import {moveAvatarCrop,avatarCrop,encodeAvatar} from '../public/profile-client.js';
import {createLatestRequest} from '../public/ai-request.js';

const tomorrow=()=>addDays(localDate(),1),slot=slots[1];
const report={sections:{overview:['window','count','sample'],popular:['popular'],peak:['peak'],lowBooking:['lowBooking'],occupancy:['utilization']},suggestions:['collect-samples','review-plan']};
const reply=value=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]})});
const config={YOSHUB_API_KEY:'mock-fixture',YOSHUB_BASE_URL:'https://mock.example/v1'};

test('成功摘要只取完整真实回执，设备分项和场景准确；拒绝部分及跨身份结果',t=>{
 const store=createProductStore(':memory:');t.after(()=>store.close());const user=store.users()[0];
 const intent=bookingIntent({equipmentIds:['microphone-m1','recorder-r2','support-t1'],sceneId:'podcast',name:'双人播客',date:tomorrow(),slot},user.id,equipment);
 intent.receipt=store.reserveSet(intent);const summary=receiptDetails(intent,equipment);
 assert.equal(summary.equipment.length,3);assert.equal(summary.source,'双人播客');assert.equal(summary.date,intent.date);assert.equal(summary.slot,slot);
 assert.throws(()=>receiptDetails({...intent,receipt:{...intent.receipt,records:intent.receipt.records.slice(0,2)}},equipment));
 assert.throws(()=>receiptDetails({...intent,userId:'another-user'},equipment));
});

test('头像拖动保持正方形比例、使用源图坐标，定位不会越界或压扁照片',()=>{
 const crop=moveAvatarCrop(1200,800,{zoom:2,x:.5,y:.5},30,-40,200),rect=avatarCrop(1200,800,crop);
 assert.equal(crop.x,.425);assert.equal(crop.y,.7);assert.equal(rect.width,400);assert.equal(rect.height,400);
 const portrait=moveAvatarCrop(800,1200,{zoom:1,x:.5,y:.5},40,20,200);assert.equal(portrait.x,.5);assert.equal(portrait.y,.3);
 const extreme=moveAvatarCrop(1200,800,{zoom:2,x:.5,y:.5},100000,-100000,200);assert.equal(extreme.x,0);assert.equal(extreme.y,1);
 assert.deepEqual(moveAvatarCrop(1200,800,crop,1,1,0),crop);
});

test('头像导出先使用圆形遮罩；WebP保留透明背景，JPEG降级才填品牌中性底',()=>{
 const calls=[],context={clearRect(){calls.push('clear');},save(){},beginPath(){},arc(){calls.push('circle');},clip(){calls.push('clip');},drawImage(){calls.push('draw');},restore(){},fillRect(){calls.push('fill');}};
 const canvas={getContext:()=>context,toDataURL:type=>type==='image/webp'?'data:image/webp;base64,YQ==':'data:image/jpeg;base64,YQ=='};
 assert.match(encodeAvatar({image:{},width:1200,height:800},{},canvas),/^data:image\/webp/);assert.deepEqual(calls,['clear','circle','clip','draw']);
 calls.length=0;canvas.toDataURL=type=>type==='image/webp'?'data:image/png;base64,YQ==':'data:image/jpeg;base64,YQ==';
 assert.match(encodeAvatar({image:{},width:800,height:1200},{},canvas),/^data:image\/jpeg/);assert.deepEqual(calls,['clear','circle','clip','draw','fill']);assert.equal(context.fillStyle,'#17243a');assert.equal(context.globalCompositeOperation,'source-over');
});

test('方案相同状态与时间按最近修改及稳定ID排序，刷新和输入顺序不改变结果',()=>{
 const base={date:tomorrow(),slot,planState:{state:'READY',priority:3}},items=[{...base,id:'z',updatedAt:'2026-10-08T10:00:00Z'},{...base,id:'a',updatedAt:'2026-10-08T10:00:00Z'},{...base,id:'new',updatedAt:'2026-10-08T11:00:00Z'}];
 assert.deepEqual(sortPlans(items).map(p=>p.id),['new','a','z']);assert.deepEqual(sortPlans([...items].reverse()),sortPlans(items));
 const past=[{date:'2026-10-06',id:'older',planState:{state:'PAST',priority:5}},{date:'2026-10-07',id:'recent',planState:{state:'PAST',priority:5}}];assert.equal(sortPlans(past)[0].id,'recent');
});

test('简单查询解析真实设备、日期和唯一时段，云台不混入相机，未知或复杂表达交给模型',()=>{
 const now=new Date('2026-10-08T10:00:00'),parse=q=>parseAvailabilityQuestion(q,equipment,now);
 const projector=parse('明天下午有投影仪吗？');assert.equal(projector.date,'2026-10-09');assert.equal(projector.slot,slot);assert.ok(projector.equipmentIds.every(id=>equipment.find(item=>item.id===id).category==='projector'));
 const gimbal=parse('下周一上午云台相机可借吗？');assert.equal(gimbal.date,'2026-10-12');assert.ok(gimbal.equipmentIds.every(id=>equipment.find(item=>item.id===id).category==='gimbal'));
 assert.equal(parse('2026年10月10日14:00到16:00哪些设备可以预约？').date,'2026-10-10');
 assert.deepEqual(new Set(parse('明天相机和麦克风空闲吗？').equipmentIds.map(id=>equipment.find(item=>item.id===id).category)),new Set(['camera','microphone']));
 assert.equal(parse('激光刀和投影仪有吗？'),null);assert.equal(parse('我明天下午想拍轻量Vlog，推荐三件设备'),null);assert.equal(parse('十天后的投影仪空闲吗？'),null);
 assert.match(parse('明天下午和晚上投影仪有吗？').error,/一个时段/);assert.match(parse('明天或后天投影仪有吗？').error,/一个日期/);assert.match(parse('2026-02-30投影仪有吗？').error,/有效日期/);
});

test('简单空闲查询直接按实际台账回答，无Key也可核对，零模型调用且不泄露身份',async()=>{
 let calls=0;const ai=createAiAssistant({config:{},fetchImpl:async()=>{calls++;throw Error('Must not call');}}),records=[{equipmentId:'projector',date:tomorrow(),slot,name:'私人姓名',userId:'private-user'}];
 const result=await ai.assist({mode:'creative',question:'明天下午有投影仪吗？'},records);
 assert.equal(result.kind,'availability');assert.equal(result.provider,'ledger');assert.equal(result.attempts,0);assert.equal(calls,0);assert.equal(result.matches.find(item=>item.id==='projector').slots.length,0);assert.equal(JSON.stringify(result).includes('私人姓名'),false);assert.equal(JSON.stringify(result).includes('private-user'),false);
 assert.deepEqual(result.usage,{prompt_tokens:0,completion_tokens:0});assert.equal(ai.status().calls,0);
 await assert.rejects(ai.assist({mode:'availability',question:'明天或后天投影仪有吗？'},records),/一个日期/);assert.equal(calls,0);
});

test('复杂推荐未完成时简单查询仍即时返回，使用真实台账且不追加上游调用',async()=>{
 let release,calls=0;const ai=createAiAssistant({config,fetchImpl:async()=>{calls++;await new Promise(resolve=>release=resolve);return reply({sceneId:'vlog',date:tomorrow(),slot,equipmentIds:['gimbal-g1','microphone-m1','support-t2']});}});
 const recommendation=ai.assist({mode:'creative',question:'帮我推荐轻量Vlog装备'},[]);const query=await ai.assist({mode:'availability',question:'明天下午有投影仪吗？'},[]);
 assert.equal(query.provider,'ledger');assert.equal(calls,1);release();const plan=await recommendation;assert.equal(plan.equipmentIds.length,3);assert.ok(plan.equipmentIds.every(id=>equipment.some(real=>real.id===id)));
});

test('AI重复点击不新建请求；新请求取消旧请求，旧响应与旧finally不能覆盖新状态',async()=>{
 const requests=createLatestRequest(),old=requests.begin('old'),same=requests.begin('old');assert.equal(same,null);
 const next=requests.begin('new');assert.equal(old.signal.aborted,true);assert.equal(requests.current(old),false);assert.equal(requests.current(next),true);
 requests.finish(old);assert.equal(requests.current(next),true);const committed=[];
 await Promise.all([Promise.resolve('old').then(value=>{if(requests.current(old))committed.push(value);}),Promise.resolve('new').then(value=>{if(requests.current(next))committed.push(value);})]);assert.deepEqual(committed,['new']);
 requests.cancel();assert.equal(next.signal.aborted,true);assert.equal(requests.current(next),false);assert.equal(requests.current(null),false);
});

test('取消AI请求传到上游并释放忙碌锁，不自动重试或丢失后续请求',async()=>{
 let calls=0;const ai=createAiAssistant({config,fetchImpl:async(url,{signal})=>{calls++;if(calls>1)return reply(report);return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}}),controller=new AbortController();
 const first=ai.assist({mode:'creative',question:'帮我推荐采访装备'},[],{signal:controller.signal}),rejected=assert.rejects(first,error=>error.status===499);controller.abort();await rejected;
 const reportResult=await ai.assist({mode:'report'},[]);assert.equal(reportResult.sections.length,6);assert.equal(calls,2);
});

test('HTTP客户端断开会取消对应的上游任务；后续请求可恢复',async t=>{
 let started,aborted;const start=new Promise(resolve=>started=resolve),cancelled=new Promise(resolve=>aborted=resolve);
 const assistant=createAiAssistant({config,fetchImpl:async(url,{signal})=>{started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted();reject(signal.reason);},{once:true}));}}),store=createProductStore(':memory:'),app=createApp(store,assistant);
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>app.close(resolve));store.close();});
 const base='http://127.0.0.1:'+app.address().port,controller=new AbortController(),request=fetch(base+'/api/ai/assist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'creative',question:'推荐轻量Vlog装备'}),signal:controller.signal}),rejected=assert.rejects(request,error=>error.name==='AbortError');
 await start;controller.abort();await rejected;let timer;try{await Promise.race([cancelled,new Promise((resolve,reject)=>timer=setTimeout(()=>reject(Error('Upstream not cancelled')),1000))]);}finally{clearTimeout(timer);}
 const recovered=await fetch(base+'/api/ai/assist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'availability',question:'明天下午有投影仪吗？'})});assert.equal(recovered.status,200);assert.equal((await recovered.json()).provider,'ledger');
});
