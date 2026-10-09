import test from 'node:test';
import assert from 'node:assert/strict';
import {equipment} from '../src/catalog.js';
import {addDays,commonAvailability} from '../src/planning.js';
import {localDate,slots} from '../src/booking.js';
import {optimizationContext,applyOptimization} from '../src/plan-optimization.js';
import {createAiAssistant} from '../src/ai.js';
import {filterEquipment} from '../public/catalog-view.js';
const date=()=>addDays(localDate(),1);
const plan=()=>({name:'校园采访',sceneId:'interview',date:date(),slot:slots[1],equipmentIds:['gimbal-g1','microphone-m1','light-f1'],userId:'owner'});
const records=()=>[{equipmentId:'microphone-m1',date:date(),slot:slots[1],userId:'other',name:'不得传输的预约人'}];

test('优化只提供当前装备和最多两件真实可用替代，排除其他预约及姓名',()=>{
 const context=optimizationContext(plan(),records(),equipment),text=JSON.stringify(context);
 assert.equal(context.items.length,3);assert.equal(context.items[1].available,false);assert.equal(context.items[1].alternatives.length,2);
 assert.ok(context.items[1].alternatives.every(item=>equipment.some(real=>real.id===item.id)));
 assert.equal(text.includes('不得传输'),false);assert.equal(text.includes('recorder-r2'),false);assert.equal(Object.hasOwn(context,'catalog'),false);assert.ok(text.length<1800);
});
test('优化替换冲突装备，保持方案名称、身份、日期与时段',()=>{
 const original=plan(),context=optimizationContext(original,records(),equipment);
 const value={keep:['gimbal-g1','light-f1'],replace:[{from:'microphone-m1',to:'microphone-m2',reason:'同类设备此时空闲'}],remove:[]};
 const result=applyOptimization(value,original,context,records(),equipment);
 assert.deepEqual(result.equipmentIds,['gimbal-g1','microphone-m2','light-f1']);assert.equal(result.readiness,100);
 for(const field of ['name','sceneId','userId','date','slot'])assert.equal(result[field],original[field]);assert.equal(original.equipmentIds[1],'microphone-m1');
});
test('优化拒绝非候选设备，包含已存在但用途错误的真实设备',()=>{
 const p=plan(),context=optimizationContext(p,records(),equipment);
 for(const to of ['not-real','projector','microphone-m1'])assert.throws(()=>applyOptimization({keep:['gimbal-g1','light-f1'],replace:[{from:'microphone-m1',to}],remove:[]},p,context,records(),equipment));
});
test('优化拒绝重复归类、重复装备、遗漏原设备与移除所有装备',()=>{
 const p=plan(),context=optimizationContext(p,records(),equipment);
 for(const value of [{keep:['gimbal-g1','gimbal-g1','light-f1'],replace:[],remove:[]},{keep:['gimbal-g1'],replace:[],remove:[]},{keep:[],replace:[],remove:p.equipmentIds}])assert.throws(()=>applyOptimization(value,p,context,records(),equipment));
});
test('缺少当前方案不消耗模型调用',async()=>{
 let count=0;const ai=createAiAssistant({config:{YOSHUB_API_KEY:'mock'},fetchImpl:async()=>count++});
 await assert.rejects(ai.assist({mode:'creative',optimization:true,question:'优化'},[]),/选择要优化/);assert.equal(count,0);
});
test('共同时间使用全组合，不将部分可用误标为共同可用',()=>{
 const p=plan(),days=commonAvailability(p,records(),equipment),tomorrow=days.find(row=>row.date===date());
 assert.equal(days.length,7);assert.equal(tomorrow.moments.find(row=>row.slot===slots[1]).available,2);assert.equal(tomorrow.moments.find(row=>row.slot===slots[1]).complete,false);assert.equal(tomorrow.complete,2);assert.equal(tomorrow.best.available,3);
});
test('本人已经锁定的设备计入准备度，其他账号不共享',()=>{
 const r=records(),owner={...plan(),userId:'other'};
 assert.equal(commonAvailability(owner,r,equipment).find(row=>row.date===date()).complete,3);
 assert.equal(commonAvailability(plan(),r,equipment).find(row=>row.date===date()).complete,2);
});
test('共同时间不包含已结束时段，维护设备不参与空闲',()=>{
 const now=new Date('2026-10-08T17:00:00'),p={...plan(),date:'2026-10-08',equipmentIds:['camera','light-f3']};
 const days=commonAvailability(p,[],equipment,'2026-10-08',now);
 assert.equal(days[0].moments.length,1);assert.equal(days[0].best.slot,slots[2]);assert.equal(days[0].best.available,1);assert.equal(days[0].complete,0);
});
test('设备搜索支持创作场景、分类与可借状态',()=>{
 const dateValue=date();
 const matches=filterEquipment(equipment,{query:'校园采访',date:dateValue});
 assert.ok(matches.some(item=>item.id==='gimbal-g1'));assert.ok(matches.some(item=>item.id==='microphone-m1'));
 assert.ok(filterEquipment(equipment,{query:'云台相机',date:dateValue}).some(item=>item.id==='gimbal-g1'));
 assert.ok(filterEquipment(equipment,{query:'空闲',date:dateValue}).every(item=>item.operationalStatus!=='maintenance'));
});
test('设备视觉类别覆盖全部台账，区别高、宽、紧凑产品',()=>{
 assert.equal(equipment.length,28);assert.ok(equipment.every(item=>['compact','standard','tall','wide'].includes(item.visualClass)));
 assert.equal(equipment.find(item=>item.id==='gimbal-g1').visualClass,'tall');assert.equal(equipment.find(item=>item.id==='microphone-m1').visualClass,'wide');
});
