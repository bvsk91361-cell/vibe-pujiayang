import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProductStore} from '../src/product-store.js';
import {createAdminData,migrateAdminData,rollbackAdminDataMigration} from '../src/admin-data.js';
import {equipment,localDate,slots} from '../src/booking.js';
import {addDays} from '../src/planning.js';
import {inspectPlan} from '../src/creative.js';

const admin={id:'test-admin',username:'测试管理员'};
const tomorrow=()=>addDays(localDate(),1);
const baseSchema=`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,role TEXT NOT NULL,avatar TEXT NOT NULL,prefs TEXT NOT NULL DEFAULT '{}');
 CREATE TABLE equipment(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE reservations(id TEXT PRIMARY KEY,user_id TEXT,equipment_id TEXT NOT NULL,date TEXT NOT NULL,slot TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',payload TEXT NOT NULL);
 CREATE UNIQUE INDEX active_slot ON reservations(equipment_id,date,slot) WHERE status='active';
 CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);`;
function put(db,row){db.prepare('INSERT INTO reservations VALUES(?,?,?,?,?,?,?)').run(row.id,row.userId,row.equipmentId,row.date,row.slot,row.status||'active',JSON.stringify(row));}

test('设备持久修改跨重启保留；恢复原维护设备后预约和方案同读运行时台账',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'borrow-admin-devices-')),file=join(dir,'isolated.sqlite');let store=createProductStore(file);
 t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
 const ids=store.catalog().map(item=>item.id),user=store.users()[0];
 store.admin.updateEquipment('camera',{name:'持久相机',description:'管理端保存的设备说明',operationalStatus:'maintenance'},admin);
 assert.throws(()=>store.add({userId:user.id,equipmentId:'camera',date:tomorrow(),slot:slots[1]}),/维护/);
 const draft=store.savePlan(user.id,{name:'维护设备核对',date:tomorrow(),slot:slots[1],equipmentIds:['camera']});assert.equal(draft.readiness,0);
 assert.throws(()=>store.reserveSet({userId:user.id,equipmentIds:['projector','camera'],date:tomorrow(),slot:slots[1],requestId:'isolated-request-01'}),/维护/);assert.equal(store.list().length,0);
 store.admin.updateEquipment('drone-a2',{operationalStatus:'active'},admin);
 const plan=store.savePlan(user.id,{name:'恢复设备核对',date:tomorrow(),slot:slots[1],equipmentIds:['drone-a2']});assert.equal(plan.readiness,100);
 assert.equal(inspectPlan(plan,store.list(),store.catalog()).items[0].available,true);
 const booking=store.add({userId:user.id,equipmentId:'drone-a2',date:tomorrow(),slot:slots[1]});
 store.close();store=createProductStore(file);store.seed();
 assert.deepEqual(store.catalog().map(item=>item.id),ids);assert.equal(store.catalog().find(item=>item.id==='camera').name,'持久相机');assert.equal(store.catalog().find(item=>item.id==='camera').operationalStatus,'maintenance');
 assert.equal(store.catalog().find(item=>item.id==='drone-a2').operationalStatus,'active');assert.equal(store.list()[0].id,booking.id);
 assert.throws(()=>store.admin.updateEquipment('camera',{category:'lens'},admin),/只支持/);
 assert.throws(()=>store.admin.updateEquipment('camera',{name:'未授权编辑'},null),error=>error.status===401);
 assert.equal(store.catalog().find(item=>item.id==='camera').name,'持久相机');
});

test('维护冲突在事务内阻止；管理员取消保留历史与审计并释放唯一有效时段',t=>{
 const store=createProductStore(':memory:');t.after(()=>store.close());const user=store.users()[0];
 const booking=store.add({userId:user.id,equipmentId:'camera',date:tomorrow(),slot:slots[1]});
 assert.throws(()=>store.admin.updateEquipment('camera',{operationalStatus:'maintenance'},admin),error=>error.status===409);
 assert.equal(store.catalog().find(item=>item.id==='camera').operationalStatus,'active');assert.equal(store.list().length,1);
 assert.throws(()=>store.admin.cancelBooking(booking.id,'',admin));assert.throws(()=>store.admin.cancelBooking(booking.id,'事务验证',null),error=>error.status===401);assert.equal(store.list().length,1);
 const cancelled=store.admin.cancelBooking(booking.id,'预约人确认调整安排',admin);assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.cancelledBy,'admin');assert.equal(cancelled.audit.length,1);
 assert.equal(store.workspace(user.id).history[0].status,'cancelled');assert.equal(store.list().length,0);
 const replacement=store.add({userId:user.id,equipmentId:'camera',date:booking.date,slot:booking.slot});assert.notEqual(replacement.id,booking.id);
 assert.throws(()=>store.add({userId:user.id,equipmentId:'camera',date:booking.date,slot:booking.slot}),error=>error.status===409);
 store.cancel(replacement.id,user.id);store.admin.updateEquipment('camera',{operationalStatus:'maintenance'},admin);assert.equal(store.catalog().find(item=>item.id==='camera').operationalStatus,'maintenance');
 assert.equal(store.admin.bookings({status:'cancelled'}).total,2);
});

test('全台账筛选先于分页，预约状态与演示用户统计来自真实历史',t=>{
 const store=createProductStore(':memory:');t.after(()=>store.close());const [user,other]=store.users();
 for(let i=1;i<=40;i++)store.add({userId:i%2?user.id:other.id,equipmentId:i%2?'camera':'projector',date:addDays(localDate(),i),slot:slots[i%3]});
 const first=store.admin.bookings({userId:user.id,category:'camera',status:'upcoming',page:1,pageSize:5});assert.equal(first.total,20);assert.equal(first.items.length,5);assert.equal(first.summary.upcoming,40);assert.equal(first.filteredSummary.upcoming,20);
 const next=store.admin.bookings({userId:user.id,page:2,pageSize:5});assert.equal(next.items.length,5);assert.equal(new Set([...first.items,...next.items].map(row=>row.id)).size,10);
 const filtered=store.admin.bookings({keyword:'相机',from:addDays(localDate(),30),to:addDays(localDate(),40),slot:slots[1]});assert.equal(filtered.total,2);
 const id=first.items[0].id;store.admin.cancelBooking(id,'测试真实取消统计',admin);
 const details=store.admin.userDetail(user.id);assert.equal(details.summary.total,20);assert.equal(details.summary.active,19);assert.equal(details.cancelledBookings.length,1);assert.equal(details.frequentEquipment[0].bookings,19);
 assert.equal(store.admin.users({keyword:user.name}).items[0].identityType,'demo');assert.equal(store.admin.users({keyword:user.name}).items[0].cancelledBookings,1);
 assert.throws(()=>store.admin.bookings({slot:'无效'}));assert.throws(()=>store.admin.analytics({from:'2026-02-30',to:'2026-03-01'}));
});

test('北京时区驾驶舱、互斥设备状态、趋势与热图使用相同有效预约口径',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(baseSchema);
 const devices=equipment.slice(0,3),now=new Date('2026-10-12T02:00:00Z');
 for(const item of devices)db.prepare('INSERT INTO equipment VALUES(?,?)').run(item.id,JSON.stringify(item));
 db.prepare('INSERT INTO users(id,name,role,avatar) VALUES(?,?,?,?)').run('u','测试身份','创作者','orbit');
 put(db,{id:'ongoing',userId:'u',name:'测试身份',equipmentId:'camera',date:'2026-10-12',slot:slots[0],createdAt:'2026-10-11T02:00:00Z'});
 put(db,{id:'future',userId:'u',name:'测试身份',equipmentId:'projector',date:'2026-10-13',slot:slots[1],createdAt:'2026-10-11T03:00:00Z'});
 put(db,{id:'expired',userId:'u',name:'测试身份',equipmentId:'camera',date:'2026-10-11',slot:slots[2],createdAt:'2026-10-10T02:00:00Z'});
 put(db,{id:'cancelled',userId:'u',name:'测试身份',equipmentId:'recorder',date:'2026-10-12',slot:slots[0],status:'cancelled',createdAt:'2026-10-10T02:00:00Z',cancelledAt:'2026-10-12T01:00:00Z'});
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}};
 const data=createAdminData({db,file:':memory:',catalog:()=>db.prepare('SELECT payload FROM equipment').all().map(row=>JSON.parse(row.payload)),transaction,clock:()=>now});
 const dashboard=data.dashboard();assert.deepEqual(dashboard.kpis,{todayBookings:1,currentOccupied:1,availableEquipment:2,weekBookings:2});assert.deepEqual(dashboard.deviceStates,{available:2,occupied:1,maintenance:0});
 assert.equal(dashboard.trend.find(day=>day.date==='2026-10-12').count,1);assert.equal(dashboard.trend.find(day=>day.date==='2026-10-12').cancelled,1);
 const cell=dashboard.heatmap.cells.find(cell=>cell.date==='2026-10-12'&&cell.slot===slots[0]);assert.equal(cell.activeBookings,1);assert.equal(cell.availableEquipment,2);assert.equal(cell.occupancyRate,33.3);
 assert.equal(dashboard.heatmap.days[0].booked,1);assert.equal(data.booking('ongoing').state,'current');assert.equal(data.booking('expired').state,'expired');assert.throws(()=>data.cancelBooking('expired','不能改写历史',admin),error=>error.status===409);
 const analysis=data.analytics({from:'2026-10-12',to:'2026-10-18'});assert.equal(analysis.source.total,2);assert.equal(analysis.categoryDistribution.reduce((sum,item)=>sum+item.count,0),2);assert.equal(analysis.trend.reduce((sum,item)=>sum+item.count,0),2);assert.equal(analysis.heatmap.days.reduce((sum,item)=>sum+item.booked,0),2);
 assert.equal(data.reports().total,0);const saved=data.saveReport({text:'服务端现有模型报告',sections:[{title:'概览',text:'真实预约2条'}],source:{start:'2026-10-12',end:'2026-10-18'},model:'test-model'},admin);assert.equal(data.reports().latest.id,saved.id);assert.equal(data.reports().latest.period.start,'2026-10-12');assert.throws(()=>data.saveReport({text:'不完整'},admin));
});

test('新增迁移前一致备份，幂等重启不覆盖已有设备、不改预约ID和唯一约束',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'borrow-admin-migration-')),file=join(dir,'legacy.sqlite');let store;
 t.after(async()=>{store?.close();await rm(dir,{recursive:true,force:true});});
 const old=new DatabaseSync(file);old.exec(baseSchema);old.prepare('INSERT INTO users(id,name,role,avatar) VALUES(?,?,?,?)').run('original-user','原有身份','创作者','orbit');
 old.prepare('INSERT INTO equipment VALUES(?,?)').run('camera',JSON.stringify({...equipment[0],name:'原有设备名称'}));
 put(old,{id:'original-booking',userId:'original-user',name:'原有身份',equipmentId:'camera',date:tomorrow(),slot:slots[1],createdAt:new Date().toISOString()});old.close();
 store=createProductStore(file);assert.equal(existsSync(file+'.pre-admin-v1-backup.sqlite'),true);
 const snapshot=new DatabaseSync(file+'.pre-admin-v1-backup.sqlite',{readOnly:true});assert.equal(snapshot.prepare('SELECT id FROM reservations').get().id,'original-booking');assert.equal(JSON.parse(snapshot.prepare('SELECT payload FROM equipment WHERE id=?').get('camera').payload).name,'原有设备名称');snapshot.close();
 assert.equal(store.list()[0].id,'original-booking');assert.equal(store.catalog().find(item=>item.id==='camera').name,'原有设备名称');assert.equal(store.catalog().length,equipment.length);
 store.close();store=createProductStore(file);assert.equal(store.admin.bookings().total,1);assert.equal(store.catalog().find(item=>item.id==='camera').name,'原有设备名称');assert.throws(()=>store.add({userId:'original-user',equipmentId:'camera',date:tomorrow(),slot:slots[1]}),error=>error.status===409);
});

test('空管理迁移可显式回滚且保留业务记录；已有审计时阻止回滚',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(baseSchema);
 put(db,{id:'retain-me',userId:'u',equipmentId:'camera',date:tomorrow(),slot:slots[1]});
 migrateAdminData(db,':memory:');rollbackAdminDataMigration(db);assert.equal(db.prepare('SELECT id FROM reservations').get().id,'retain-me');
 assert.equal(db.prepare("SELECT value FROM metadata WHERE key='admin-schema-version'").get(),undefined);
 migrateAdminData(db,':memory:');db.prepare('INSERT INTO admin_audit VALUES(?,?,?,?,?,?,?)').run('audit','a','admin','test','retain-me',new Date().toISOString(),'{}');
 assert.throws(()=>rollbackAdminDataMigration(db),/preserve management history/);assert.equal(db.prepare('SELECT COUNT(*) AS total FROM admin_audit').get().total,1);assert.equal(db.prepare('SELECT id FROM reservations').get().id,'retain-me');
});
