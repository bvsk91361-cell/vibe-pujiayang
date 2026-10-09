import test from 'node:test';
import assert from 'node:assert/strict';
import { equipment,categories,heroSlides,legacyEquipment } from '../src/catalog.js';
import { validateBooking,localDate } from '../src/booking.js';
import { freeSlots,planSummary,addDays } from '../src/planning.js';
import { bookingContext,answerQuery,modelContext } from '../src/ai-context.js';
import { createAiAssistant } from '../src/ai.js';
import { filterEquipment } from '../public/catalog-view.js';
import { createCarousel } from '../public/carousel.js';
import { createSubmission } from '../public/submission.js';
import { loadPreferences,savePreferences } from '../public/preferences.js';
import { createApp } from '../server.js';
const date=()=>addDays(localDate(),1);
test('生产台账28件10类、ID唯一、旧设备保持、Hero指向可借设备，型号参数齐全',()=>{
 assert.equal(equipment.length,28);assert.equal(categories.length,10);assert.equal(new Set(equipment.map(item=>item.id)).size,28);assert.deepEqual(legacyEquipment.map(item=>item.id),['camera','projector','recorder']);
 assert.equal(new Set(equipment.map(item=>item.category)).size,10);
 for(const item of equipment){assert.ok(item.specs.length&&item.tags.length&&item.model&&item.scenes.length&&item.cover.type==='original-svg');}
 for(const slide of heroSlides)assert.equal(equipment.find(item=>item.id===slide.equipmentId).operationalStatus,'active');
});
test('新增设备遵循原冲突规则；维护设备拒约且不虚增空闲或计划容量',()=>{
 const input={name:'验收',equipmentId:'gimbal-g1',date:date(),slot:'14:00–16:00'};
 assert.deepEqual(validateBooking(input,[]),input);assert.throws(()=>validateBooking(input,[input]),error=>error.status===409);
 assert.throws(()=>validateBooking({...input,equipmentId:'drone-a2'},[]),/维护/);assert.deepEqual(freeSlots([],date(),'drone-a2'),[]);
 assert.equal(planSummary([],localDate(),legacyEquipment).capacity,63);assert.equal(planSummary([]).capacity,26*21);
 assert.equal(bookingContext([]).stats.capacity,26*21);assert.equal(bookingContext([]).catalog.length,28);
});
test('分类、型号/用途搜索、场景与维护过滤一致；热门只用实际预约数量排序',()=>{
 const options={date:date()};assert.equal(filterEquipment(equipment,{...options,category:'lens'}).length,3);
 assert.equal(filterEquipment(equipment,{...options,query:'BL G1'})[0].id,'gimbal-g1');assert.equal(filterEquipment(equipment,{...options,status:'maintenance'}).length,2);
 assert.equal(filterEquipment(equipment,{...options,status:'available'}).length,26);
 assert.ok(filterEquipment(equipment,{...options,scene:'interview'}).every(item=>item.scenes.includes('interview')));
 const records=[{equipmentId:'capture-s2',date:date(),slot:'14:00–16:00'}];assert.equal(filterEquipment(equipment,{...options,records,sort:'popular'})[0].id,'capture-s2');
});
test('扩充后台台账用于AI查询与六节周报，替代设备来自实际同用途设备而非旧ID硬判断',async()=>{
 const config={YOSHUB_API_KEY:'mock',YOSHUB_BASE_URL:'https://mock.example'};let context;
 const ai=createAiAssistant({config,fetchImpl:async(url,{body})=>{context=JSON.parse(JSON.parse(body).messages[1].content).context;return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({intent:'availability',date:date(),equipmentId:'gimbal-g1',slot:'14:00–16:00'})}}]})};}});
 const records=[{equipmentId:'gimbal-g1',date:date(),slot:'14:00–16:00'}];const result=await ai.assist({mode:'availability',question:'明日下午云台相机'},records);assert.equal(context.catalog.length,28);assert.deepEqual(result.matches[0].slots,[]);
 const alternatives=answerQuery(bookingContext([]),{intent:'alternatives',date:date(),equipmentId:'projector',slot:'14:00–16:00'});assert.equal(alternatives.matches.length,2);assert.ok(alternatives.matches.every(item=>item.name.includes('投影')));
 const report=createAiAssistant({config,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sections:{overview:['window','count','sample'],popular:['popular'],peak:['peak'],lowBooking:['lowBooking'],occupancy:['utilization']},suggestions:['collect-samples','review-plan']})}}]})})});
 const output=await report.assist({mode:'report'},records.map(row=>({...row,date:localDate()})));assert.equal(output.sections.length,6);assert.equal(output.source.total,1);assert.equal(output.source.devices.length,28);assert.equal(output.source.capacity,546);assert.match(output.text,/有效预约 1 条/);
});
function fakeClock(){let task=null;return {set(fn){task=fn;return 1;},clear(){task=null;},tick(){task?.();},running:()=>!!task};}
test('28件查询上下文保留真实台账/匿名预约/时段，避免重复周报长文本；周报仍保留完整依据',()=>{
 const record={equipmentId:'gimbal-g1',date:date(),slot:'14:00–16:00',name:'不传模型'};
 const context=bookingContext([record]),query=modelContext(context,'availability');
 assert.equal(query.catalog.length,28);assert.deepEqual(query.reservations,[{equipmentId:record.equipmentId,date:record.date,slot:record.slot}]);
 assert.equal(query.stats.slotCounts.length,3);assert.equal(query.stats.peak[0].slot,record.slot);assert.equal(query.facts,undefined);assert.equal(query.actions,undefined);assert.equal(query.cleanRecords,undefined);
 assert.ok(JSON.stringify(query).length<JSON.stringify(context).length);assert.ok(JSON.stringify(modelContext(context)).length<JSON.stringify(context).length);assert.equal(modelContext(context).facts,context.facts);
});
test('轮播自动切换、边界循环；手动选择持久暂停，不在用户操作后抢画面',()=>{
 const clock=fakeClock(),changes=[];const carousel=createCarousel({count:5,scheduler:clock,onChange:index=>changes.push(index)});
 clock.tick();assert.equal(carousel.state().index,1);carousel.previous();assert.equal(carousel.state().index,0);assert.equal(clock.running(),false);clock.tick();assert.equal(carousel.state().index,0);
 carousel.go(-1);assert.equal(carousel.state().index,4);carousel.pause('manual',false);clock.tick();assert.equal(carousel.state().index,0);carousel.dispose();assert.equal(clock.running(),false);
});
test('轮播焦点、悬停、隐藏与减弱动画暂停独立，解除一个原因不能强行恢复',()=>{
 const clock=fakeClock(),carousel=createCarousel({count:3,scheduler:clock});carousel.pause('focus');carousel.pause('hidden');carousel.pause('focus',false);assert.equal(clock.running(),false);carousel.pause('hidden',false);assert.equal(clock.running(),true);carousel.pause('reduced');clock.tick();assert.equal(carousel.state().index,0);carousel.dispose();
});
test('预约按钮只在保存成功后进入success，并发点击不重复保存；失败返回idle可修正重试',async()=>{
 const states=[];let release,calls=0;const machine=createSubmission(state=>states.push(state));const first=machine.run(async()=>{calls++;return new Promise(resolve=>{release=resolve;});});assert.equal(machine.state(),'loading');assert.deepEqual(await machine.run(()=>{calls++;}),{ignored:true});machine.reset();assert.equal(machine.state(),'loading');release({id:'saved'});assert.equal((await first).value.id,'saved');assert.equal(calls,1);assert.deepEqual(states,['loading','success']);
 machine.reset();const failed=await machine.run(async()=>{throw new Error('409 冲突');});assert.match(failed.error.message,/冲突/);assert.equal(machine.state(),'idle');assert.equal(states.at(-1),'idle');
});
test('字号/动效偏好保存并恢复，损坏或不可用的localStorage不阻断页面且不谎报已保存',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 assert.equal(savePreferences(storage,{font:'xlarge',reduceMotion:true}).saved,true);assert.deepEqual(loadPreferences(storage),{font:'xlarge',reduceMotion:true});
 assert.equal(savePreferences({setItem(){throw new Error('quota');}},{font:'large'}).saved,false);assert.deepEqual(loadPreferences({getItem:()=>'{broken'}),{font:'standard',reduceMotion:false});assert.equal(savePreferences(storage,{font:'invalid'}).value.font,'standard');
});
test('本机HTTP提供统一28件设备与所有模块资源，后端与.env仍不可访问',async t=>{
 const app=createApp({list:async()=>[]},createAiAssistant({config:{}}));await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));const base='http://127.0.0.1:'+app.address().port;
 const catalog=await (await fetch(base+'/api/equipment')).json();assert.equal(catalog.equipment.length,28);
 for(const path of ['/catalog.js','/showcase.js','/carousel.js','/submission.js','/tokens.css','/shell.css','/showcase.css','/workspace.css'])assert.equal((await fetch(base+path)).status,200,path);
 for(const path of ['/.env','/src/ai.js'])assert.equal((await fetch(base+path)).status,404);
});
