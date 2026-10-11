import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProductStore} from '../src/product-store.js';
import {createAdminData} from '../src/admin-data.js';
import {reportWeekStart} from '../src/ai-context.js';
import {localDate,slots,businessMoment} from '../src/booking.js';
import {seedAdminSample,ADMIN_SAMPLE_SOURCE} from '../scripts/seed-admin-sample.js';

const now=new Date('2026-10-11T12:03:00Z'); // 20:03 in Beijing, an actual business slot.
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'borrow-admin-sample-')),file=join(directory,'isolated.sqlite');
 const store=createProductStore(file);store.close();
 t.after(()=>rm(directory,{recursive:true,force:true}));return {file,directory};
}
const values=db=>({users:db.prepare('SELECT * FROM users ORDER BY id').all(),equipment:db.prepare('SELECT * FROM equipment ORDER BY id').all(),reservations:db.prepare('SELECT * FROM reservations ORDER BY id').all(),plans:db.prepare('SELECT * FROM plans ORDER BY id').all(),metadata:db.prepare('SELECT * FROM metadata ORDER BY key').all()});

test('示例追加覆盖运行时可运营设备、时间状态和方案关系，明确标记且保留余量',async t=>{
 const {file}=await fixture(t),original=new DatabaseSync(file);
 original.exec('PRAGMA wal_autocheckpoint=0;');
 const user=original.prepare('SELECT * FROM users LIMIT 1').get();
 const existing={id:'retained-real-record',userId:user.id,name:user.name,equipmentId:'camera',date:localDate(now),slot:slots[2],createdAt:now.toISOString()};
 original.prepare('INSERT INTO reservations VALUES(?,?,?,?,?,?,?)').run(existing.id,user.id,'camera',existing.date,existing.slot,'active',JSON.stringify(existing));
 // Keep an unrelated auth-like local table as a sentinel: this script never accesses it.
 original.exec('CREATE TABLE sample_test_admin_sentinel(id TEXT PRIMARY KEY,payload TEXT);');original.prepare('INSERT INTO sample_test_admin_sentinel VALUES(?,?)').run('untouched-admin','retain-this-value');
 const before=values(original),index=original.prepare("SELECT sql FROM sqlite_master WHERE name='active_slot'").get().sql;
 assert.ok((await stat(file+'-wal')).size>0,'快照测试保留尚未checkpoint的已提交WAL数据');
 const result=seedAdminSample(file,{now});original.close();assert.ok(result.added.reservations>=120&&result.added.reservations<=180);assert.equal(result.added.users,6);assert.equal(result.added.plans,6);assert.equal(result.devices.covered,28);assert.equal(result.devices.activeCovered,26);assert.equal(result.currentBusinessSlot,slots[2]);assert.ok(result.states.current>0&&result.states.upcoming>0&&result.states.expired>0&&result.states.cancelled>0);assert.ok(result.backupPath);
 const db=new DatabaseSync(file),after=values(db),adminSentinel={...db.prepare('SELECT * FROM sample_test_admin_sentinel').get()},retainedIndex=db.prepare("SELECT sql FROM sqlite_master WHERE name='active_slot'").get().sql;
 const intelligence=createAdminData({db,file,catalog:()=>after.equipment.map(row=>JSON.parse(row.payload)),transaction:fn=>fn(),clock:()=>now}).intelligence({from:reportWeekStart(localDate(now)),to:localDate(now)});db.close();
 assert.deepEqual(after.equipment,before.equipment);assert.deepEqual(after.reservations.filter(row=>row.id===existing.id),before.reservations);assert.deepEqual(after.users.filter(row=>!row.id.startsWith('admin-sample-v1-')),before.users);assert.deepEqual(adminSentinel,{id:'untouched-admin',payload:'retain-this-value'});assert.equal(retainedIndex,index);
 const sample=after.reservations.filter(row=>row.id.startsWith('admin-sample-v1-')).map(row=>JSON.parse(row.payload)),devices=after.equipment.map(row=>JSON.parse(row.payload));
 assert.ok(sample.every(row=>row.sample===true&&row.seedSource===ADMIN_SAMPLE_SOURCE&&row.name.includes('示例')&&row.batchName.includes('示例')&&row.createdAt===now.toISOString()));
 assert.ok(sample.filter(row=>row.status==='cancelled').every(row=>row.cancelledAt===now.toISOString()&&row.cancellationReason.includes('示例')));
 assert.ok(after.users.filter(row=>row.id.startsWith('admin-sample-v1-')).every(row=>row.name.includes('示例')&&row.role.includes('示例')));
 assert.ok(after.plans.every(row=>{const plan=JSON.parse(row.payload);return plan.name.includes('示例')&&plan.sample===true&&plan.equipmentIds.length>1&&sample.filter(row=>row.planId===plan.id).length===plan.equipmentIds.length;}));
 assert.ok(sample.filter(row=>row.status==='active'&&row.date>=localDate(now)).every(row=>devices.find(item=>item.id===row.equipmentId).operationalStatus==='active'&&businessMoment(row.date,row.slot.slice(-5))>now));
 const active=after.reservations.filter(row=>row.status==='active').map(row=>JSON.parse(row.payload));assert.equal(new Set(active.map(row=>[row.equipmentId,row.date,row.slot].join('|'))).size,active.length);
 const deviceStates=Object.fromEntries(['available','current','upcoming','hot','maintenance'].map(state=>[state,intelligence.devices.filter(item=>item.state===state).length]));
 assert.ok(Object.values(deviceStates).every(count=>count>0));assert.ok(deviceStates.hot>=2);
 const hot=intelligence.devices.filter(item=>item.state==='hot');
 assert.ok(hot.every(item=>item.todayBookings===0&&item.nextBooking&&businessMoment(item.nextBooking.date,item.nextBooking.slot.slice(0,5))-now>86400000&&active.filter(row=>row.equipmentId===item.id&&row.date>=intelligence.week.start&&row.date<localDate(now)).length>=3));
 assert.ok(intelligence.devices.some(item=>item.state==='available'&&item.weekBookings<3&&item.nextFreeSlot));
 const maintained=devices.filter(item=>item.operationalStatus!=='active');assert.equal(maintained.length,2);
 assert.ok(maintained.every(item=>{const own=sample.filter(row=>row.equipmentId===item.id);return own.length>0&&own.every(row=>row.status==='cancelled'&&row.date<localDate(now));}));
 const futureSampleCells=new Set(sample.filter(row=>row.status==='active'&&row.date>localDate(now)).map(row=>row.date+'|'+row.slot));assert.equal(futureSampleCells.size,7*slots.length);
 assert.equal(new Set(sample.map(row=>row.equipmentId)).size,devices.length);
 t.diagnostic(JSON.stringify({added:result.added,reservationStates:result.states,deviceStates,hotEquipment:hot.map(item=>item.id),futureSampleCells:futureSampleCells.size,coveredEquipment:result.devices.covered}));
 for(const date of new Set(sample.filter(row=>row.status==='active'&&row.date>=localDate(now)).map(row=>row.date)))for(const slot of slots){const count=active.filter(row=>row.date===date&&row.slot===slot).length;assert.ok(count<=result.futureSampleCellLimit,`${date} ${slot}留有可预约设备`);}
 const snapshot=new DatabaseSync(result.backupPath,{readOnly:true});assert.deepEqual(values(snapshot),before);snapshot.close();
 const frequencies=devices.filter(item=>item.operationalStatus==='active').map(item=>sample.filter(row=>row.equipmentId===item.id&&row.status==='active').length);assert.ok(Math.max(...frequencies)>Math.min(...frequencies));
});

test('dry-run不写台账不生成快照；同一北京时间日期重复执行不增加任何业务记录',async t=>{
 const {file,directory}=await fixture(t);let db=new DatabaseSync(file);const before=values(db);db.close();
 const preview=seedAdminSample(file,{dryRun:true,now});assert.equal(preview.dryRun,true);assert.equal(preview.backupPath,null);assert.ok(preview.added.reservations>=120);db=new DatabaseSync(file);assert.deepEqual(values(db),before);db.close();assert.equal((await readdir(directory)).some(name=>name.includes('pre-admin-sample')),false);
 const applied=seedAdminSample(file,{now});db=new DatabaseSync(file);const first=values(db);db.close();
 const repeated=seedAdminSample(file,{now:new Date('2026-10-11T12:30:00Z')});assert.equal(repeated.alreadyApplied,true);assert.deepEqual(repeated.added,{users:0,plans:0,reservations:0});assert.equal(repeated.backupPath,null);db=new DatabaseSync(file);assert.deepEqual(values(db),first);db.close();
 assert.deepEqual(preview.recordIds,applied.recordIds);assert.deepEqual(preview.planIds,applied.planIds);
});

test('闭馆时不伪造当前占用，故障时全部追加回滚且保留可核对快照',async t=>{
 const {file,directory}=await fixture(t),closed=new Date('2026-10-11T14:30:00Z'); // 22:30 in Beijing.
 const preview=seedAdminSample(file,{dryRun:true,now:closed});assert.equal(preview.currentBusinessSlot,null);assert.equal(preview.states.current,0);assert.ok(preview.states.upcoming>0);
 let db=new DatabaseSync(file);db.exec("CREATE TRIGGER reject_sample_append BEFORE INSERT ON reservations WHEN NEW.id LIKE 'admin-sample-v1-%' BEGIN SELECT RAISE(ABORT,'isolated-append-rejected'); END;");const before=values(db);db.close();
 assert.throws(()=>seedAdminSample(file,{now}),/isolated-append-rejected/);db=new DatabaseSync(file);assert.deepEqual(values(db),before);db.close();assert.equal((await readdir(directory)).filter(name=>name.includes('pre-admin-sample')).length,1);
});

test('已有同名非示例用户时停止，不能认领或覆盖已有身份',async t=>{
 const {file}=await fixture(t);let db=new DatabaseSync(file);db.prepare('INSERT INTO users(id,name,role,avatar,prefs) VALUES(?,?,?,?,?)').run('existing-unrelated','示例 · 影像创作组','保留的原身份','orbit','{}');const before=values(db);db.close();
 assert.throws(()=>seedAdminSample(file,{dryRun:true,now}),/与已有身份冲突/);db=new DatabaseSync(file);assert.deepEqual(values(db),before);db.close();
});

test('当日标记缺失但确定性ID已存在时停止，不覆盖已有预约或追加部分身份',async t=>{
 const {file}=await fixture(t);let db=new DatabaseSync(file);const user=db.prepare('SELECT id,name FROM users LIMIT 1').get();
 const existing={id:`admin-sample-v1-${localDate(now)}-history-0-0-camera`,userId:user.id,name:user.name,equipmentId:'camera',date:'2026-10-01',slot:slots[0],createdAt:now.toISOString()};
 db.prepare('INSERT INTO reservations VALUES(?,?,?,?,?,?,?)').run(existing.id,user.id,existing.equipmentId,existing.date,existing.slot,'active',JSON.stringify(existing));const before=values(db);db.close();
 assert.throws(()=>seedAdminSample(file,{dryRun:true,now}),/预约 ID 已存在但当日标记缺失/);db=new DatabaseSync(file);assert.deepEqual(values(db),before);db.close();
});
