import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createProductStore} from '../src/product-store.js';
import {createApp} from '../server.js';
import {createAiAssistant} from '../src/ai.js';
import {equipment,localDate,isBusinessDate,businessMoment,validateBooking} from '../src/booking.js';
import {addDays,freeSlots,planSummary,commonAvailability} from '../src/planning.js';
import {reservationStatus} from '../public/reservation-view.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const tomorrow=()=>addDays(localDate(),1),slot='14:00–16:00';
const cleanup=(t,fn)=>t.coreClose?t.coreClose(fn):t.after(fn);
async function directory(t){const dir=await mkdtemp(join(tmpdir(),'borrow-course-core-')),closers=[];t.coreClose=fn=>closers.push(fn);t.after(async()=>{for(const close of closers.reverse())await close();assert.ok(resolve(dir).startsWith(join(resolve(tmpdir()),'borrow-course-core-')));await rm(dir,{recursive:true,force:true});});return dir;}
async function server(t,store){const app=createApp(store,createAiAssistant({config:{}}));await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));cleanup(t,()=>new Promise(resolve=>app.close(resolve)));return 'http://127.0.0.1:'+app.address().port;}
const post=(base,value)=>fetch(base+'/api/reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});

test('Asia/Shanghai日期与时段在UTC、洛杉矶和上海宿主下完全一致',()=>{
 const code=`import {localDate,businessMinutes} from './src/booking.js';import {addDays,freeSlots} from './src/planning.js';import {reservationStatus} from './public/reservation-view.js';import {dateLabel} from './src/plan-state.js';const now=new Date('2026-12-31T16:30:00Z'),record={date:'2027-01-01',slot:'09:00–11:00'};console.log(JSON.stringify({today:localDate(now),minutes:businessMinutes(now),next:addDays('2026-12-31',1),status:reservationStatus(record,now),slots:freeSlots([],record.date,'camera',now),label:dateLabel(record.date,{now})}));`;
 const results=['UTC','America/Los_Angeles','Asia/Shanghai'].map(TZ=>{const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:root,env:{...process.env,TZ},encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);});
 for(const result of results){assert.deepEqual(result,results[0]);assert.equal(result.today,'2027-01-01');assert.equal(result.minutes,30);assert.equal(result.next,'2027-01-01');assert.equal(result.status.label,'待使用');assert.equal(result.label,'今天');}
});

test('预约及到期边界精确到开始/结束分钟；取消状态独立；闰年与跨年日期有效',()=>{
 const row={name:'课程验收',equipmentId:'camera',date:'2026-10-08',slot:'09:00–11:00'};
 for(const [time,label,ended]of [['08:59','待使用',false],['09:00','使用时段中',false],['10:59','使用时段中',false],['11:00','已到期',true]]){
  const now=businessMoment(row.date,time);assert.equal(reservationStatus(row,now).label,label);assert.equal(freeSlots([],row.date,'camera',now).includes(row.slot),!ended);
  if(ended)assert.throws(()=>validateBooking(row,[],row.date,now),/已经结束/);else assert.doesNotThrow(()=>validateBooking(row,[],row.date,now));
 }
 assert.equal(reservationStatus({...row,status:'cancelled'},businessMoment(row.date,'12:00')).label,'已取消');
 assert.equal(isBusinessDate('2028-02-29'),true);assert.equal(isBusinessDate('2027-02-29'),false);assert.equal(isBusinessDate('2026-04-31'),false);assert.equal(addDays('2026-12-31',1),'2027-01-01');
 assert.doesNotThrow(()=>validateBooking(row,[{...row,status:'cancelled'}],row.date,businessMoment(row.date,'08:00')));
});

test('台账seed更新目录payload，不重置预约与身份；统计排除取消及未知设备',async t=>{
 const dir=await directory(t),file=join(dir,'catalog.sqlite');let store=createProductStore(file);const user=store.users()[0],booking=store.add({userId:user.id,equipmentId:'camera',date:tomorrow(),slot});store.close();
 const db=new DatabaseSync(file);db.prepare('UPDATE equipment SET payload=? WHERE id=?').run(JSON.stringify({...equipment[0],name:'旧设备名称'}),'camera');db.close();
 store=createProductStore(file);cleanup(t,()=>store.close());const raw=new DatabaseSync(file);cleanup(t,()=>raw.close());
 assert.equal(JSON.parse(raw.prepare('SELECT payload FROM equipment WHERE id=?').get('camera').payload).name,equipment.find(row=>row.id==='camera').name);assert.equal(store.list()[0].id,booking.id);assert.equal(store.users()[0].id,user.id);
 const summary=planSummary([booking,{...booking,id:'cancelled',status:'cancelled'},{...booking,equipmentId:'unknown'}],tomorrow());assert.equal(summary.total,1);assert.equal(summary.devices.find(row=>row.id==='camera').booked,1);
});

test('SQLite唯一约束异常映射409，事务完全回滚，不泄露SQL',async t=>{
 const dir=await directory(t),file=join(dir,'constraint.sqlite'),store=createProductStore(file);cleanup(t,()=>store.close());
 const raw=new DatabaseSync(file);raw.exec(`CREATE TRIGGER simulate_constraint BEFORE INSERT ON reservations BEGIN INSERT INTO reservations VALUES('constraint-probe',NEW.user_id,NEW.equipment_id,NEW.date,NEW.slot,'active',NEW.payload); END;`);raw.close();
 const base=await server(t,store),response=await post(base,{userId:store.users()[0].id,equipmentId:'camera',date:tomorrow(),slot});
 assert.equal(response.status,409);const body=await response.json();assert.match(body.error,/已被预约/);assert.doesNotMatch(body.error,/UNIQUE|SELECT|INSERT|reservations\./);assert.equal(store.list().length,0);assert.equal(store.workspace(store.users()[0].id).achievements.length,0);
});

test('非法单件输入与未知用户有业务错误；越权取消拒绝；取消释放并保留已取消历史',async t=>{
 const store=createProductStore(':memory:');t.after(()=>store.close());const base=await server(t,store),[a,b]=store.users();
 assert.equal((await post(base,null)).status,422);assert.equal((await fetch(base+'/api/workspace')).status,422);assert.equal((await post(base,{userId:'unknown',equipmentId:'camera',date:tomorrow(),slot})).status,404);
 const first=await post(base,{userId:a.id,equipmentId:'camera',date:tomorrow(),slot});assert.equal(first.status,201);const booking=await first.json();
 assert.equal((await fetch(base+'/api/reservations/'+booking.id+'?userId='+b.id,{method:'DELETE'})).status,403);assert.equal(store.list().length,1);
 assert.equal((await fetch(base+'/api/reservations/'+booking.id,{method:'DELETE'})).status,403);
 assert.equal((await fetch(base+'/api/reservations/'+booking.id+'?userId='+a.id,{method:'DELETE'})).status,200);
 assert.equal((await fetch(base+'/api/reservations/'+booking.id+'?userId='+a.id,{method:'DELETE'})).status,404);
 assert.equal(store.workspace(a.id).history[0].status,'cancelled');assert.equal((await post(base,{userId:b.id,equipmentId:'camera',date:tomorrow(),slot})).status,201);
 assert.equal(store.workspace(a.id).history.filter(row=>row.status==='active').length,0);assert.equal(store.workspace(b.id).history.length,1);
});

async function processServer(t,file){
 const code=`import {createProductStore} from './src/product-store.js';import {createApp} from './server.js';import {createAiAssistant} from './src/ai.js';const store=createProductStore(${JSON.stringify(file)}),app=createApp(store,createAiAssistant({config:{}}));await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));process.send({port:app.address().port,users:store.users().map(({id})=>id)});let stopping=false;const stop=()=>{if(stopping)return;stopping=true;app.close(()=>{store.close();if(process.connected)process.disconnect();});};process.on('message',stop);process.on('disconnect',stop);`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{cwd:root,env:{...process.env,NODE_NO_WARNINGS:'1'},stdio:['ignore','pipe','pipe','ipc']});let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
 cleanup(t,async()=>{if(child.exitCode!==null)return;const exited=new Promise(resolve=>child.once('exit',resolve));child.send('close');const timer=setTimeout(()=>child.kill(),5000);await exited;clearTimeout(timer);});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('演示进程启动超时 '+stderr)),15000);child.once('message',message=>{clearTimeout(timer);resolve(message);});child.once('error',reject);child.once('exit',code=>{if(code!==null&&code!==0)reject(new Error(stderr));});});return {base:'http://127.0.0.1:'+ready.port,users:ready.users};
}

test('两个独立Node进程/SQLite连接同时抢槽：12次请求1成功11冲突；批量全有或全无',async t=>{
 const dir=await directory(t),file=join(dir,'race.sqlite'),seed=createProductStore(file);seed.close();
 const [a,b]=await Promise.all([processServer(t,file),processServer(t,file)]),date=tomorrow();
 const responses=await Promise.all(Array.from({length:12},(_,index)=>{const actor=index%2?a:b;return post(actor.base,{userId:actor.users[index%2],equipmentId:'camera',date,slot});}));
 const results=await Promise.all(responses.map(async response=>({status:response.status,body:await response.json()})));assert.equal(results.filter(row=>row.status===201).length,1);assert.equal(results.filter(row=>row.status===409).length,11);
 const db=new DatabaseSync(file);cleanup(t,()=>db.close());assert.equal(db.prepare("SELECT COUNT(*) n FROM reservations WHERE status='active' AND equipment_id='camera' AND date=? AND slot=?").get(date,slot).n,1);
 const winner=results.find(row=>row.status===201).body,other=a.users.find(id=>id!==winner.userId);assert.equal((await fetch(a.base+'/api/reservations/'+winner.id+'?userId='+winner.userId,{method:'DELETE'})).status,200);assert.equal((await post(b.base,{userId:other,equipmentId:'camera',date,slot})).status,201);
 const sets=await Promise.all([a,b].map((actor,index)=>fetch(actor.base+'/api/reservations/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:actor.users[index],equipmentIds:['microphone-m1','light-f1','support-t2'],date,slot,requestId:randomUUID()})})));assert.deepEqual(sets.map(row=>row.status).sort(),[201,409]);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM reservations WHERE status='active' AND equipment_id IN ('microphone-m1','light-f1','support-t2')").get().n,3);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 const unique=db.prepare("SELECT sql FROM sqlite_master WHERE name='active_slot'").get().sql;assert.match(unique,/UNIQUE INDEX/);assert.match(unique,/WHERE status='active'/);
 console.log('课程并发证据 '+JSON.stringify({processes:2,connections:2,requests:12,success:1,conflicts:11,activeSameSlot:1,cancelThenRebook:true,batchRequests:2,batchSuccess:1,batchConflicts:1,batchRecords:3}));
});

test('旧JSON有重复占用时停止迁移并完整回滚，不静默丢记录；保留原始备份',async t=>{
 const dir=await directory(t),file=join(dir,'migration.sqlite'),legacyFile=join(dir,'legacy.json'),rows=[{id:'old-a',name:'测试甲',equipmentId:'camera',date:tomorrow(),slot},{id:'old-b',name:'测试乙',equipmentId:'camera',date:tomorrow(),slot}];await writeFile(legacyFile,JSON.stringify(rows));
 assert.throws(()=>createProductStore(file,{legacyFile}),error=>error.status===409);const raw=new DatabaseSync(file);cleanup(t,()=>raw.close());assert.equal(raw.prepare('SELECT COUNT(*) n FROM reservations').get().n,0);assert.equal(raw.prepare("SELECT value FROM metadata WHERE key='legacy-import'").get(),undefined);assert.deepEqual(JSON.parse(await readFile(legacyFile+'.pre-sqlite-backup','utf8')),rows);
});

test('七天共同时间明确区分本人已预约、仍可预约、他人占用；切换日期不误复用本人状态',()=>{
 const date='2026-10-10',now=businessMoment('2026-10-08','12:00'),plan={userId:'a',equipmentIds:['camera','projector','recorder'],date,slot},records=[{id:'mine',userId:'a',equipmentId:'camera',date,slot},{id:'other',userId:'b',equipmentId:'recorder',date,slot}];
 const days=commonAvailability(plan,records,equipment,'2026-10-08',now),target=days.find(day=>day.date===date).moments.find(row=>row.slot===slot);assert.equal(target.reserved,1);assert.equal(target.reservable,1);assert.equal(target.blocked,1);assert.equal(target.available,2);assert.equal(target.complete,false);
 const next=days.find(day=>day.date==='2026-10-11').moments.find(row=>row.slot===slot);assert.equal(next.reserved,0);assert.equal(next.reservable,3);assert.equal(next.complete,true);
});
