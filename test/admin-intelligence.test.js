import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIntelligence} from '../src/admin-intelligence.js';
import {createProductStore} from '../src/product-store.js';
import {createAdminData} from '../src/admin-data.js';
import {DatabaseSync} from 'node:sqlite';
import {equipment,slots,localDate} from '../src/booking.js';
import {occupancyHeatmap} from '../src/occupancy.js';
import {addDays} from '../src/planning.js';

const now=new Date('2026-10-12T02:00:00Z'); // Monday 10:00 in the business timezone.
const catalog=[equipment.find(item=>item.id==='camera'),equipment.find(item=>item.id==='projector'),equipment.find(item=>item.id==='drone-a2')];
const users=[{id:'u1',name:'本地身份甲'},{id:'u2',name:'本地身份乙'}];
const row=(id,equipmentId,date,slot,state='upcoming',extra={})=>({id,userId:'u1',equipmentId,date,slot,status:'active',state,user:users[0],equipment:catalog.find(item=>item.id===equipmentId),...extra});
function build(records=[],extra={}){
 return buildIntelligence({catalog,records,users,plans:[],window:{start:'2026-10-12',end:'2026-10-18',days:7},pulse:occupancyHeatmap(records,'2026-10-12',catalog,now),now,...extra});
}

test('智能资源统计区分预约占用、维护、取消与未知设备；下一空闲只推荐完整未来时段',()=>{
 const records=[row('a','camera','2026-10-12',slots[0],'current'),row('b','camera','2026-10-12',slots[1]),row('c','projector','2026-10-13',slots[1]),row('cancel','projector','2026-10-12',slots[0],'cancelled',{status:'cancelled'}),row('unknown','not-in-catalog','2026-10-12',slots[0])];
 const data=build(records),camera=data.devices.find(item=>item.id==='camera'),projector=data.devices.find(item=>item.id==='projector'),maintenance=data.devices.find(item=>item.id==='drone-a2');
 assert.equal(data.timezone,'Asia/Shanghai');assert.equal(data.today,'2026-10-12');assert.equal(data.summary.equipment,3);assert.equal(data.summary.windowBookings,3);assert.equal(data.summary.todayBookings,2);assert.equal(data.summary.capacity,42);assert.equal(data.summary.occupancyRate,7.1);
 assert.equal(camera.state,'current');assert.equal(camera.todayBookings,2);assert.equal(camera.occupancyRate,9.5);assert.deepEqual(camera.nextFreeSlot,{date:'2026-10-12',slot:slots[2]});
 assert.equal(projector.state,'available');assert.deepEqual(projector.nextFreeSlot,{date:'2026-10-12',slot:slots[1]});
 assert.equal(maintenance.state,'maintenance');assert.equal(maintenance.capacity,0);assert.equal(maintenance.occupancyRate,null);assert.equal(maintenance.nextFreeSlot,null);
 assert.equal(data.system.conflictCount,null);assert.match(data.system.conflictMeaning,/未持久化/);assert.match(data.metric.meaning,/并非实际/);assert.match(data.metric.capacityPolicy,/不追溯/);
 assert.equal(data.galaxy.categories.reduce((sum,item)=>sum+item.deviceIds.length,0),3);
});

test('关系网络只连接数据库中实际存在的用户、方案、设备与预约，不生成悬空关系',()=>{
 const plan={id:'p1',userId:'u1',name:'采访组合',equipmentIds:['camera','projector','invalid-equipment'],updatedAt:'2026-10-11T01:00:00Z'};
 const records=[row('linked','camera','2026-10-12',slots[1],'upcoming',{planId:'p1'}),row('legacy','missing-device','2026-10-12',slots[2],'expired',{userId:'missing-user'}),row('outside','projector','2026-10-01',slots[0],'expired')];
 const data=build(records,{plans:[plan]}),network=data.network,nodeIds=new Set(network.nodes.map(item=>item.id));
 assert.equal(network.summary.bookings,2);assert.equal(network.summary.shownBookings,2);assert.equal(network.summary.plans,1);assert.ok(nodeIds.has('booking:linked'));assert.ok(!nodeIds.has('booking:outside'));assert.ok(!nodeIds.has('user:missing-user'));assert.ok(!nodeIds.has('device:missing-device'));
 assert.ok(network.edges.some(edge=>edge.type==='owns-plan'&&edge.source==='user:u1'&&edge.target==='plan:p1'));
 assert.ok(network.edges.some(edge=>edge.type==='planned-booking'&&edge.source==='plan:p1'&&edge.target==='booking:linked'));
 assert.equal(network.edges.filter(edge=>edge.type==='includes-device').length,2);assert.ok(network.edges.every(edge=>nodeIds.has(edge.source)&&nodeIds.has(edge.target)));
});

test('时间流在全库过滤后分页，状态和合法日期筛选不受已加载条数限制',()=>{
 const records=Array.from({length:150},(_,i)=>row('r'+String(i).padStart(3,'0'),i%2?'camera':'projector','2026-10-13',slots[i%3]));
 const data=build(records,{params:{flowFrom:'2026-10-13',flowTo:'2026-10-13',equipmentId:'camera',page:2,pageSize:20}});
 assert.equal(data.timeFlow.total,75);assert.equal(data.timeFlow.items.length,20);assert.ok(data.timeFlow.items.every(row=>row.equipmentId==='camera'));
 const first=build(records,{params:{flowFrom:'2026-10-13',flowTo:'2026-10-13',equipmentId:'camera',page:1,pageSize:20}});assert.equal(new Set([...first.timeFlow.items,...data.timeFlow.items].map(row=>row.id)).size,40);
 assert.throws(()=>build(records,{params:{flowFrom:'2026-02-30'}}),/有效的调度日期/);assert.throws(()=>build(records,{params:{status:'made-up'}}),/状态/);assert.throws(()=>build(records,{params:{slot:'14:00–17:00'}}),/时段/);
});

test('运营建议逐条提供统计来源、逻辑和可执行建议；不编造样本或实际利用率',()=>{
 const empty=build([]);assert.ok(empty.insights.some(item=>item.id==='low-reservation'&&item.evidence.sampleSize===0));assert.ok(!empty.insights.some(item=>item.id==='peak-slot'||item.id==='popular-device'));assert.ok(empty.insights.every(item=>item.source&&item.logic&&item.advice));
 const records=[row('a','camera','2026-10-12',slots[1]),row('b','camera','2026-10-13',slots[1]),row('c','camera','2026-10-14',slots[2])];
 const data=build(records,{plans:[{id:'p1',userId:'u1',name:'采访组合',equipmentIds:['camera','projector']}]}),peak=data.insights.find(item=>item.id==='peak-slot'),common=data.insights.find(item=>item.id==='common-availability');
 assert.equal(peak.evidence.slot,slots[1]);assert.equal(peak.evidence.bookings,2);assert.equal(peak.evidence.share,66.7);assert.equal(peak.source.sampleSize,3);assert.ok(!peak.title.includes('17:00'));
 assert.deepEqual(common.evidence.nextFreeSlot,{date:'2026-10-12',slot:slots[2]});assert.match(common.advice,/不自动提交/);assert.equal(data.devices.find(item=>item.id==='camera').state,'upcoming');
});

test('数据库运营投影读取持久化方案与预约，调用不会写审计、周报或业务记录',t=>{
 const store=createProductStore(':memory:');t.after(()=>store.close());const user=store.users()[0],date=addDays(localDate(),1);
 const plan=store.savePlan(user.id,{name:'真实方案关系',equipmentIds:['camera','projector'],date,slot:slots[1]}),booking=store.add({userId:user.id,equipmentId:'camera',date,slot:slots[1]});
 const before=store.admin.bookings().total,reportsBefore=store.admin.reports().total,data=store.admin.intelligence({from:date,to:date,flowFrom:date,flowTo:date});
 assert.equal(data.summary.equipment,28);assert.equal(data.summary.plans,1);assert.equal(data.summary.windowBookings,1);assert.equal(data.timeFlow.total,1);assert.equal(data.timeFlow.items[0].id,booking.id);
 assert.ok(data.network.nodes.some(node=>node.id==='plan:'+plan.id));assert.ok(data.network.edges.some(edge=>edge.source==='user:'+user.id&&edge.target==='plan:'+plan.id));
 assert.equal(store.admin.bookings().total,before);assert.equal(store.admin.reports().total,reportsBefore);assert.equal(store.admin.bookingDetail(booking.id).audit.length,0);assert.equal(store.workspace(user.id).plans[0].id,plan.id);
});

test('业务版本摘要在无变化时稳定，预约和取消改变摘要，且不泄露账户或头像内容',t=>{
 const store=createProductStore(':memory:');t.after(()=>store.close());const user=store.users()[0],before=store.admin.revision();
 assert.match(before,/^[a-f0-9]{64}$/);assert.equal(store.admin.revision(),before);
 const booking=store.add({userId:user.id,equipmentId:'camera',date:addDays(localDate(),1),slot:slots[1]});
 const booked=store.admin.revision();assert.notEqual(booked,before);assert.equal(store.admin.revision(),booked);
 store.cancel(booking.id,user.id);const cancelled=store.admin.revision();assert.notEqual(cancelled,booked);assert.equal(store.admin.revision(),cancelled);
});

test('版本摘要仅在北京时间日期与时段边界改变，不随秒数或头像blob随机变动',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,role TEXT,avatar TEXT);
 CREATE TABLE equipment(id TEXT PRIMARY KEY,payload TEXT);
 CREATE TABLE reservations(id TEXT PRIMARY KEY,status TEXT,payload TEXT);
 CREATE TABLE plans(id TEXT PRIMARY KEY,payload TEXT,user_id TEXT);`);
 db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('u','本地身份','创作者','orbit');
 let time=new Date('2026-10-12T00:59:59Z');
 const data=createAdminData({db,file:':memory:',catalog:()=>[],transaction:fn=>fn(),clock:()=>time}),before=data.revision();
 time=new Date('2026-10-12T01:00:00Z');const started=data.revision();assert.notEqual(started,before);
 time=new Date('2026-10-12T01:30:40Z');assert.equal(data.revision(),started);
 db.prepare('UPDATE users SET avatar=? WHERE id=?').run('data:image/jpeg;base64,local-avatar-content','u');assert.equal(data.revision(),started);
 time=new Date('2026-10-12T03:00:00Z');const ended=data.revision();assert.notEqual(ended,started);
 time=new Date('2026-10-12T16:00:00Z');assert.notEqual(data.revision(),ended);
});
