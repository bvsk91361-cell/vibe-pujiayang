import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {occupancyHeatmap} from '../src/occupancy.js';
import {equipment,slots,localDate} from '../src/booking.js';
import {addDays} from '../src/planning.js';
import {createProductStore} from '../src/product-store.js';
import {createApp} from '../server.js';
import {prepareDemo} from '../scripts/demo-day.js';
import {reservationStatus} from '../public/reservation-view.js';
import {validReceipt} from '../public/booking-intent.js';

test('刷新凭证逐项核对真实台账字段，不接受同编号但设备或时间不同的缓存',()=>{
 const intent={requestId:'demo-proof',equipmentIds:['camera'],userId:'demo-a',date:'2026-10-10',slot:slots[1]},row={id:'reservation-proof',equipmentId:'camera',userId:'demo-a',date:intent.date,slot:intent.slot},receipt={atomic:true,requestId:intent.requestId,date:intent.date,slot:intent.slot,records:[row]};
 assert.equal(validReceipt(intent,receipt,[row]),true);
 for(const mismatch of [{equipmentId:'projector'},{date:'2026-10-11'},{slot:slots[0]},{status:'cancelled'}])assert.equal(validReceipt(intent,receipt,[{...row,...mismatch}]),false);
 assert.equal(validReceipt(intent,{...receipt,records:[{...row,status:'cancelled'}]}),false);
});

test('占用矩阵仅统计有效预约；取消释放、维护排除、今日已结束区分于空闲',()=>{
 const now=new Date('2026-10-08T12:30:00Z'),date=localDate(now),catalog=equipment.filter(item=>['camera','projector','drone-a2'].includes(item.id));
 const value=occupancyHeatmap([{equipmentId:'camera',date,slot:slots[0],status:'active'},{equipmentId:'camera',date,slot:slots[0],status:'active'},{equipmentId:'projector',date,slot:slots[1],status:'cancelled'},{equipmentId:'unknown',date,slot:slots[0],status:'active'}],date,catalog,now);
 assert.equal(value.days[0].booked,1);assert.equal(value.days[0].capacity,6);assert.equal(value.days[0].percent,16.7);
 assert.deepEqual(value.devices[0].days[0].cells.map(cell=>cell.state),['reserved','elapsed','free']);
 assert.deepEqual(value.devices[1].days[0].cells.map(cell=>cell.state),['elapsed','elapsed','free']);
 assert.ok(value.devices[2].days.every(day=>day.capacity===0&&day.cells.every(cell=>cell.state==='maintenance')));
 assert.throws(()=>occupancyHeatmap([],'2026-02-30'));
});

test('HTTP热力图与SQLite同一记录源：一次预约增一格，取消归零',async t=>{
 const store=createProductStore(':memory:');t.after(()=>store.close());const server=createApp(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const user=store.users()[0],date=addDays(localDate(),1),base='http://127.0.0.1:'+server.address().port;
 const row=store.add({userId:user.id,equipmentId:'camera',date,slot:slots[1]});
 const before=await (await fetch(base+'/api/heatmap')).json();assert.equal(before.days.find(day=>day.date===date).booked,1);
 store.cancel(row.id,user.id);const after=await (await fetch(base+'/api/heatmap')).json();assert.equal(after.days.find(day=>day.date===date).booked,0);
 assert.equal((await (await fetch(base+'/api/environment')).json()).demo,false);
});

test('隔离演示禁止正式库路径，重复初始化不清空预约；真实时间夹具明确标识',()=>{
 assert.throws(()=>prepareDemo(resolve('data/borrow-lab.sqlite')),/演示库必须/);
 const file=resolve('data/demo/test-'+randomUUID()+'.sqlite'),now=new Date('2026-10-08T12:30:00Z');
 const first=prepareDemo(file,now),ids=first.store.list().map(row=>row.id);assert.equal(first.context.inProgressFixture,true);
 const own=first.store.workspace(first.context.users[0].id).history;
 assert.ok(own.every(row=>row.demo===true));assert.ok(own.some(row=>reservationStatus(row,now).label==='已到期'));assert.ok(own.some(row=>reservationStatus(row,now).label==='使用时段中'));assert.ok(own.some(row=>reservationStatus(row,now).label==='待使用'));
 first.store.close();const again=prepareDemo(file,now);try{assert.deepEqual(again.store.list().map(row=>row.id),ids);assert.equal(again.store.workspace(again.context.users[0].id).plans.length,1);}finally{again.store.close();}
});
