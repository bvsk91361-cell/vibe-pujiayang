import test from 'node:test';
import assert from 'node:assert/strict';
import {derivePlanState,sortPlans,groupedSchedule,personalAction,dateLabel} from '../src/plan-state.js';
import {createProductStore} from '../src/product-store.js';
import {inspectPlan} from '../src/creative.js';
import {equipment,localDate} from '../src/booking.js';
import {addDays} from '../src/planning.js';
const date=()=>addDays(localDate(),1),slot='14:00–16:00';
const base=()=>({name:'采访',userId:'u',date:date(),slot,equipmentIds:['camera','projector']});
test('七种状态与CTA由设备、时间和真实预约推导，百分比不决定完成',()=>{
 const p=base(),check=(value,records=[])=>inspectPlan(value,records).planState;
 assert.equal(check({...p,equipmentIds:[]}).state,'DRAFT');assert.equal(check({...p,date:'',slot:''}).state,'NEED_TIME');
 assert.equal(check(p).cta,'开始预约');assert.equal(check({...p,readiness:0}).state,'READY');
 assert.equal(check(p,[{userId:'other',equipmentId:'camera',date:p.date,slot}]).cta,'解决冲突');
 const own=[{userId:'u',equipmentId:'camera',date:p.date,slot}];assert.equal(check(p,own).cta,'继续预约');
 own.push({userId:'u',equipmentId:'projector',date:p.date,slot});assert.equal(check(p,own).cta,'查看预约');
 const past=derivePlanState({...p,date:'2026-01-01'},[],new Date('2026-01-02T12:00:00'));assert.equal(past.state,'PAST');assert.equal(past.cta,'查看记录');
});
test('取消其中一件预约后状态重新推导，不沿用存储的ready标记',t=>{
 const db=createProductStore(':memory:');t.after(()=>db.close());const user=db.users()[0],plan=db.savePlan(user.id,{...base(),equipmentIds:['camera','projector']});
 const first=db.add({userId:user.id,planId:plan.id,equipmentId:'camera',date:plan.date,slot});const second=db.add({userId:user.id,planId:plan.id,equipmentId:'projector',date:plan.date,slot});
 assert.equal(db.workspace(user.id).plans[0].planState.state,'RESERVED');db.cancel(first.id,user.id);assert.equal(db.workspace(user.id).plans[0].planState.state,'PARTIALLY_RESERVED');db.cancel(second.id,user.id);assert.equal(db.workspace(user.id).plans[0].planState.state,'READY');
 assert.equal(db.workspace(user.id).upcoming.length,0);assert.equal(db.workspace(user.id).notifications.length,0);
});
test('同方案同时间合为一次安排，不同时间和无关联预约保持独立',()=>{
 const p={...base(),id:'p'},records=[{...p,userId:'u',id:'1',planId:'p',equipmentId:'camera'},{...p,userId:'u',id:'2',planId:'p',equipmentId:'projector'},{...p,userId:'u',id:'3',planId:'p',slot:'19:00–21:00',equipmentId:'camera'},{...p,userId:'u',id:'4',equipmentId:'recorder'}];
 const groups=groupedSchedule(records,[p],equipment);assert.equal(groups.length,3);assert.equal(groups.find(row=>row.planId==='p'&&row.slot===slot).count,2);
});
test('近期安排排除过期、已取消；不能借用另一个身份的方案名称聚合',()=>{
 const p={...base(),id:'p'},now=new Date('2026-10-08T17:00:00'),rows=[{id:'1',userId:'other',planId:'p',equipmentId:'camera',date:'2026-10-09',slot},{id:'2',userId:'u',equipmentId:'camera',date:'2026-10-08',slot},{id:'3',userId:'u',equipmentId:'projector',date:'2026-10-10',slot,status:'cancelled'}];
 const groups=groupedSchedule(rows,[p],equipment,{now});assert.equal(groups.length,1);assert.equal(groups[0].planId,null);assert.equal(groupedSchedule(rows,[p],equipment,{now,past:true}).length,1);
});
test('方案关联必须属于当前身份且匹配设备与时间，失败不落预约',t=>{
 const db=createProductStore(':memory:');t.after(()=>db.close());const [a,b]=db.users(),p=db.savePlan(a.id,base());
 for(const input of [{userId:b.id,equipmentId:'camera',date:p.date,slot},{userId:a.id,equipmentId:'recorder',date:p.date,slot},{userId:a.id,equipmentId:'camera',date:p.date,slot:'19:00–21:00'}])assert.throws(()=>db.add({...input,planId:p.id}));
 assert.equal(db.list().length,0);
});
test('个人首要行动按冲突、未完成、预约中、已就绪、近期安排排序',()=>{
 const plans=['READY','DRAFT','CONFLICT','RESERVED'].map((state,index)=>({id:String(index),name:state,date:date(),equipmentIds:['camera'],planState:{...derivePlanState(base()),state,priority:{CONFLICT:0,DRAFT:1,READY:3,RESERVED:4}[state]}}));
 assert.equal(sortPlans(plans)[0].name,'CONFLICT');assert.equal(personalAction(plans,[]).plan.name,'CONFLICT');assert.equal(personalAction(plans.filter(row=>row.planState.state==='RESERVED'),[{name:'明天采访',count:2}]).kind,'schedule');assert.equal(personalAction([],[]).kind,'new');
});
test('足迹使用真实总量和聚合安排，不制造3次目标',t=>{
 const db=createProductStore(':memory:');t.after(()=>db.close());const u=db.users()[0],p=db.savePlan(u.id,base());for(const id of p.equipmentIds)db.add({userId:u.id,planId:p.id,equipmentId:id,date:p.date,slot});
 const w=db.workspace(u.id);assert.equal(w.footprints.create.value,1);assert.equal(w.footprints.commit.value,1);assert.equal(w.footprints.create.target,undefined);assert.equal(w.footprints.commit.target,undefined);assert.equal(w.upcoming[0].count,2);
});
test('部分设备已约且另一个设备冲突，近期安排仍明确为预约中',()=>{const p={...base(),id:'p',planState:{state:'CONFLICT'}},row={id:'r',userId:'u',planId:'p',equipmentId:'camera',date:p.date,slot};assert.equal(groupedSchedule([row],[p],equipment)[0].status,'PARTIALLY_RESERVED');});
test('日期文案依据实际日期和年份，不写死今天明天',()=>{const now=new Date('2026-10-08T12:00:00');assert.equal(dateLabel('2026-10-08',{now}),'今天');assert.equal(dateLabel('2026-10-09',{now}),'明天');assert.equal(dateLabel('2026-10-12',{now,weekday:true}),'10月12日 · 周一');assert.equal(dateLabel('2027-01-01',{now}),'2027年1月1日');});
test('未选设备或时间的草稿可以保存并恢复状态，顾问来源可追踪',t=>{const db=createProductStore(':memory:');t.after(()=>db.close());const u=db.users()[0];db.savePlan(u.id,{name:'稍后继续',equipmentIds:[],date:'',slot:''});db.savePlan(u.id,{name:'顾问建议',source:'advisor',sceneId:'vlog',equipmentIds:['gimbal-g1'],date:'',slot:''});const plans=db.workspace(u.id).plans;assert.equal(plans.find(p=>p.name==='稍后继续').planState.state,'DRAFT');assert.equal(plans.find(p=>p.name==='顾问建议').planState.state,'NEED_TIME');assert.equal(plans.find(p=>p.name==='顾问建议').source,'advisor');});
