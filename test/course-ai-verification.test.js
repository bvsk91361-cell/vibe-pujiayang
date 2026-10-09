import test from 'node:test';
import assert from 'node:assert/strict';
import {equipment,localDate,slots} from '../src/booking.js';
import {addDays,freeSlots} from '../src/planning.js';
import {parseAvailabilityQuestion} from '../src/availability-query.js';
import {bookingContext,answerQuery,modelContext,reportWeekStart} from '../src/ai-context.js';
import {createAiAssistant} from '../src/ai.js';

test('新增课程题变体保持台账快速查询，未提供具体设备的指代需要澄清',async()=>{
 const now=new Date('2026-10-08T02:00:00Z');
 const cases=[
  ['下周一下午有空闲投影仪','2026-10-12',slots[1],'projector'],
  ['明天下午有哪些相机可以借','2026-10-09',slots[1],'camera'],
  ['周五晚上麦克风有空吗','2026-10-09',slots[2],'microphone'],
  ['有哪些适合录音的设备','2026-10-08',null,'recorder'],
  ['今天还能预约什么','2026-10-08',null,null]
 ];
 let calls=0;const ai=createAiAssistant({config:{},fetchImpl:async()=>{calls++;throw Error('No paid calls');}});
 for(const [question,date,slot,category] of cases){
  const parsed=parseAvailabilityQuestion(question,equipment,now);assert.ok(parsed,question);assert.equal(parsed.error,undefined,question);assert.equal(parsed.date,date);assert.equal(parsed.slot,slot);
  if(category)assert.ok(parsed.equipmentIds.every(id=>equipment.find(item=>item.id===id).category===category));
  const records=[{equipmentId:'projector',date:addDays(localDate(),1),slot:slots[1]}],result=await ai.assist({mode:'availability',question},records);
  assert.equal(result.provider,'ledger',question);assert.equal(result.attempts,0);
  for(const match of result.matches)for(const slot of match.slots)assert.ok(freeSlots(records,result.query.date,match.id).includes(slot));
 }
 await assert.rejects(ai.assist({mode:'availability',question:'这台设备明天下午有空吗'},[]),error=>error.status===422&&/具体设备|设备名称/.test(error.message));
 assert.equal(calls,0);
});

test('设备指代在已配置模型时也不能降级成猜测ID或全部设备查询',async()=>{
 let calls=0;const ai=createAiAssistant({config:{YOSHUB_API_KEY:'mock-only',YOSHUB_BASE_URL:'https://mock.example/v1'},fetchImpl:async()=>{calls++;throw Error('Model must not guess');}});
 for(const question of ['这台设备明天下午有空吗','那个设备今天可用吗','它明天有空吗']){
  assert.match(parseAvailabilityQuestion(question,equipment).error,/具体设备|设备名称/);
  await assert.rejects(ai.assist({mode:'creative',question},[]),error=>error.status===422&&/具体设备|设备名称/.test(error.message));
 }
 assert.equal(calls,0);
});

test('老师六个自然查询均走真实台账；本周/下周按业务时区而非旧日期解析',()=>{
 const now=new Date('2026-10-08T16:30:00Z'); // Shanghai is already October 9.
 const cases=[
  ['下周一下午有空闲的投影仪吗？','2026-10-12',slots[1],'projector'],
  ['明天下午有哪些相机能借？','2026-10-10',slots[1],'camera'],
  ['这周五晚上麦克风有空吗？','2026-10-09',slots[2],'microphone'],
  ['投影仪没空的话有没有其他时间？','2026-10-09',null,'projector'],
  ['今天有哪些设备可用？','2026-10-09',null,null],
  ['下周一下午有适合录音的设备吗？','2026-10-12',slots[1],'recorder']
 ];
 for(const [question,date,slot,category] of cases){
  const query=parseAvailabilityQuestion(question,equipment,now);
  assert.ok(query,question);assert.equal(query.error,undefined,question);
  assert.equal(query.date,date,question);assert.equal(query.slot,slot,question);
  if(category)assert.ok(query.equipmentIds.length&&query.equipmentIds.every(id=>equipment.find(item=>item.id===id).category===category),question);
  else assert.equal(query.equipmentIds,undefined);
 }
 const yearBoundary=parseAvailabilityQuestion('下周一下午有投影仪吗？',equipment,new Date('2026-12-31T16:10:00Z'));
 assert.equal(yearBoundary.date,'2027-01-04');
 assert.equal(parseAvailabilityQuestion('2027年2月29日下午有投影仪吗？',equipment,now).error,'请选择今天至未来一年内的有效日期');
});

test('六种课程查询不配置模型也可用，结果严格使用实时记录，不追加API调用',async()=>{
 let calls=0;const ai=createAiAssistant({config:{},fetchImpl:async()=>{calls++;throw Error('No upstream allowed');}});
 const tomorrow=addDays(localDate(),1),records=[{equipmentId:'projector',date:tomorrow,slot:slots[1]}];
 for(const question of ['下周一下午有空闲的投影仪吗？','明天下午有哪些相机能借？','这周五晚上麦克风有空吗？','投影仪没空的话有没有其他时间？','今天有哪些设备可用？','下周一下午有适合录音的设备吗？']){
  const parsed=parseAvailabilityQuestion(question,equipment);
  if(parsed?.error){await assert.rejects(ai.assist({mode:'availability',question},records),error=>error.status===422&&error.message===parsed.error);continue;}
  const output=await ai.assist({mode:'availability',question},records);
  assert.equal(output.provider,'ledger',question);assert.equal(output.attempts,0);assert.equal(output.model,null);
  for(const match of output.matches){assert.ok(equipment.some(item=>item.id===match.id));for(const slot of match.slots)assert.ok(freeSlots(records,match.date||output.query.date,match.id).includes(slot),question);}
 }
 assert.equal(calls,0);
});

test('其他时间只推荐真实空闲时段，不推荐维护设备或已占用时段',()=>{
 const date=addDays(localDate(),1),records=equipment.filter(item=>item.category==='projector').flatMap(item=>slots.map(slot=>({equipmentId:item.id,date,slot})));
 const context=bookingContext(records),query=parseAvailabilityQuestion(`如果${date}下午投影仪没空的话有没有其他时间？`,equipment);
 const answer=answerQuery(context,query);
 assert.ok(answer.matches.length);assert.ok(answer.matches.every(item=>item.date>date));
 assert.ok(answer.matches.every(item=>item.slots.every(slot=>freeSlots(records,item.date,item.id).includes(slot))));
 assert.match(answer.text,/尚未预约/);
});

test('周报含低预约设备和真实空闲调度选择；取消与维护不会虚增占用率',async()=>{
 const date=localDate(),records=[{equipmentId:'camera',date,slot:slots[1]},{equipmentId:'camera-c2',date,slot:slots[0],status:'cancelled'},{equipmentId:'drone-a2',date,slot:slots[1]}];
 const context=bookingContext(records,reportWeekStart());
 assert.equal(context.stats.total,2);assert.equal(context.stats.occupied,1);assert.equal(context.stats.capacity,546);
 assert.ok(context.stats.lowBooked.every(item=>item.capacity&&item.booked===0));
 for(const choice of context.stats.scheduling)assert.ok(freeSlots(records,choice.date,choice.equipmentId).includes(choice.slot));
 const selection={sections:{overview:['window','count','sample'],popular:['popular'],peak:['peak'],lowBooking:['lowBooking'],occupancy:['utilization']},suggestions:['collect-samples',context.stats.scheduling.length?'choose-free-slot':'review-plan']};
 const ai=createAiAssistant({config:{YOSHUB_API_KEY:'mock-only',YOSHUB_BASE_URL:'https://mock.example/v1'},fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(selection)}}]})})});
 const output=await ai.assist({mode:'report'},records);
 assert.deepEqual(output.sections.map(item=>item.title),['本周预约概览','热门设备','高峰时段','低预约设备','预约占用情况','调度建议']);
 assert.match(output.text,/预约占比 0.2%/);assert.match(output.text,/不是实际设备利用率/);assert.match(output.text,/未持久化被拒绝请求日志/);if(context.stats.scheduling.length)assert.match(output.text,/提交时再次校验/);
 assert.deepEqual(output.scheduling,context.stats.scheduling);
});

test('周报上下文仅发送完整事实与建议候选，避免重复长台账导致简单输出超时',()=>{
 const context=bookingContext([{equipmentId:'camera',date:addDays(localDate(),1),slot:slots[1],name:'私人信息'}]),sent=modelContext(context,'report');
 assert.equal(sent.reservations,undefined);assert.equal(sent.catalog,undefined);assert.equal(sent.stats,undefined);assert.equal(sent.cleanRecords,undefined);
 assert.equal(sent.facts,context.facts);assert.equal(sent.actions,context.actions);
 assert.equal(JSON.stringify(sent).includes('私人信息'),false);
 assert.ok(JSON.stringify(sent).length<JSON.stringify(context).length*.7);
});
