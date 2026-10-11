import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {localDate,slots,businessMoment,isBusinessDate,validateBooking} from '../src/booking.js';
import {addDays} from '../src/planning.js';
import {creativeScenes} from '../src/creative.js';
import {reportWeekStart} from '../src/ai-context.js';

export const ADMIN_SAMPLE_SOURCE='borrow-lab-admin-sample-v1';
const prefix='admin-sample-v1';
const label='用户授权追加的后台示例数据；用于界面、关系和预约时间状态演示，不代表真实校园运营。';
const profiles=[
 ['visual','示例 · 影像创作组','示例 · 影像筹备','prism'],
 ['voice','示例 · 声音记录组','示例 · 声音筹备','tide'],
 ['field','示例 · 户外记录组','示例 · 户外筹备','moss'],
 ['live','示例 · 直播协作组','示例 · 直播筹备','iris'],
 ['lab','示例 · 实验记录组','示例 · 实验筹备','orbit'],
 ['screen','示例 · 演示分享组','示例 · 分享筹备','silver']
].map(([key,name,role,avatar])=>({key,id:`${prefix}-user-${key}`,name,role,avatar}));
const sampleKey=date=>`admin-sample:v1:${date}`;
const parse=row=>JSON.parse(row.payload);
const cellKey=(id,date,slot)=>[id,date,slot].join('|');

function assertSchema(db){
 const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
 for(const name of ['users','equipment','reservations','plans','metadata'])if(!tables.has(name))throw new Error(`缺少现有业务表 ${name}；请先启动现有 Borrow Lab 服务，不会创建或替换台账。`);
 const index=db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='active_slot'").get()?.sql||'';
 if(!/UNIQUE\s+INDEX/i.test(index)||!/equipment_id\s*,\s*date\s*,\s*slot/i.test(index)||!/WHERE\s+status\s*=\s*'active'/i.test(index))throw new Error('有效预约唯一约束不符合现有业务规则；已停止，不修改索引。');
}

function planRows(db,now){
 const date=localDate(now),timestamp=now.toISOString(),marker=db.prepare('SELECT value FROM metadata WHERE key=?').get(sampleKey(date));
 if(marker){
  let previous;try{previous=JSON.parse(marker.value);}catch{throw new Error('当日示例来源标记损坏；已停止，保留现有数据。');}
  if(previous.source!==ADMIN_SAMPLE_SOURCE)throw new Error('当日示例标记来源不匹配；已停止，保留现有数据。');
  return {alreadyApplied:true,previous,date,users:[],plans:[],reservations:[],skipped:[]};
 }
 const catalog=db.prepare('SELECT payload FROM equipment ORDER BY rowid').all().map(parse);
 if(!catalog.length||new Set(catalog.map(item=>item.id)).size!==catalog.length)throw new Error('设备台账为空或设备 ID 重复；已停止。');
 const operational=catalog.filter(item=>item.operationalStatus==='active');
 if(!operational.length)throw new Error('没有可运营设备；不会向维护设备增加有效预约。');
 const existing=db.prepare('SELECT id,payload,status FROM reservations').all();
 const occupied=new Set(existing.filter(row=>row.status==='active').map(row=>{const value=parse(row);return cellKey(value.equipmentId,value.date,value.slot);}));
 const perCell=new Map();
 for(const row of existing.filter(row=>row.status==='active')){const item=parse(row);const key=item.date+'|'+item.slot;perCell.set(key,(perCell.get(key)||0)+1);}
 const oldIds=new Set(existing.map(row=>row.id)),reservations=[],plans=[],users=[],skipped=[];
 const profilesByKey=new Map(profiles.map(user=>[user.key,user]));
 const selectProfile=item=>profilesByKey.get(({microphone:'voice',recorder:'voice',drone:'field',capture:'live',projector:'screen',support:'lab',light:'lab'})[item.category]||'visual');
 const limit=Math.max(1,Math.floor(operational.length*.35));
 for(const user of profiles){
  const old=db.prepare('SELECT * FROM users WHERE id=? OR name=?').all(user.id,user.name);
  if(old.length){
   if(old.length!==1||old[0].id!==user.id||old[0].name!==user.name||JSON.parse(old[0].prefs).adminSample?.source!==ADMIN_SAMPLE_SOURCE)throw new Error(`示例身份 ${user.name} 与已有身份冲突；已停止，不覆盖已有用户。`);
  }else users.push({...user,prefs:{theme:'dark',adminSample:{source:ADMIN_SAMPLE_SOURCE,label,createdAt:timestamp}}});
 }
 const candidates=(start,count,offset=0)=>Array.from({length:count*slots.length},(_,i)=>{const position=(i+offset)%(count*slots.length);return {date:addDays(start,Math.floor(position/slots.length)),slot:slots[position%slots.length]};});
 const historical=candidates(addDays(date,-14),14);
 const weekHistory=historical.filter(moment=>moment.date>=reportWeekStart(date));
 // Keep two popular devices outside today's occupancy and the 24-hour priority state.
 const hotDevices=operational.slice(6).filter(item=>!existing.some(row=>{if(row.status!=='active')return false;const booking=parse(row);return booking.equipmentId===item.id&&(booking.date===date||(businessMoment(booking.date,booking.slot.slice(-5))>now&&businessMoment(booking.date,booking.slot.slice(0,5))-now<=86400000));})).slice(0,2);
 const hotIds=new Set(hotDevices.map(item=>item.id));
 const beyondTomorrow=choices=>choices.filter(moment=>businessMoment(moment.date,moment.slot.slice(0,5))-now>86400000);
 const remaining=slots.filter(slot=>businessMoment(date,slot.slice(-5))>now).map(slot=>({date,slot}));
 const current=slots.find(slot=>businessMoment(date,slot.slice(0,5))<=now&&businessMoment(date,slot.slice(-5))>now)||null;
 const commonFree=(ids,choices,status)=>choices.find(moment=>ids.every(id=>!occupied.has(cellKey(id,moment.date,moment.slot)))&&(status!=='active'||moment.date<date||(perCell.get(moment.date+'|'+moment.slot)||0)+ids.length<=limit));
 function addRows(ids,moment,purpose,{status='active',user=null,sceneId='custom',planName=null}={}){
  const selectedUser=user||selectProfile(catalog.find(item=>item.id===ids[0]));
  const batchId=`${prefix}-${date}-${purpose}`,name=planName||`示例 · ${ids.length>1?'多设备搭配':'单设备预约'}`;
  const planId=planName?`${prefix}-${date}-plan-${purpose}`:null;
  if(planId){
   if(db.prepare('SELECT id FROM plans WHERE id=?').get(planId))throw new Error('示例方案 ID 已存在但当日标记缺失；已停止，不覆盖方案。');
   plans.push({id:planId,userId:selectedUser.id,name:planName,source:'manual',sceneId,date:moment.date,slot:moment.slot,equipmentIds:ids,status:'draft',updatedAt:timestamp,sample:true,seedSource:ADMIN_SAMPLE_SOURCE,seedDay:date,fixturePurpose:label});
  }
  for(const id of ids){
   const rowId=`${batchId}-${id}`;if(oldIds.has(rowId))throw new Error('示例预约 ID 已存在但当日标记缺失；已停止，不覆盖预约。');
   const value={id:rowId,userId:selectedUser.id,name:selectedUser.name,equipmentId:id,date:moment.date,slot:moment.slot,status,createdAt:timestamp,batchId,batchName:name,...(planId?{planId,planName}:{}),sample:true,seedSource:ADMIN_SAMPLE_SOURCE,seedDay:date,fixturePurpose:label,timeFixture:moment.date<date?'historical':businessMoment(moment.date,moment.slot.slice(0,5))<=now?'current':'upcoming'};
   if(status==='cancelled'){value.cancelledAt=timestamp;value.cancelledBy='sample';value.cancellationReason='示例 · 已取消预约状态演示，不是实际用户取消事件';}
   if(status==='active'){
    if(!isBusinessDate(value.date)||!slots.includes(value.slot))throw new Error('示例日期或时段无效。');
    const key=cellKey(id,value.date,value.slot);if(occupied.has(key))throw new Error('示例安排与已有有效预约冲突。');
    if(value.date>=date)validateBooking(value,[...existing.filter(row=>row.status==='active').map(parse),...reservations.filter(row=>row.status==='active')],date,now,catalog);
    occupied.add(key);perCell.set(value.date+'|'+value.slot,(perCell.get(value.date+'|'+value.slot)||0)+1);
   }
   reservations.push(value);oldIds.add(rowId);
  }
 }
 function append(item,choices,purpose,options){
  const moment=commonFree([item.id],choices,options?.status||'active');
  if(moment)addRows([item.id],moment,purpose,options);else skipped.push({purpose,equipmentId:item.id,reason:'保留已有预约与时段余量，没有合适空余格'});
 }
 // Three historical fixtures and one future fixture per operational device.
 // These dates are explicitly fixtures; creation/cancellation timestamps are the actual import time.
 operational.forEach((item,index)=>{
  for(let occurrence=0;occurrence<3;occurrence++)append(item,candidates(addDays(date,-14),14,(index*5+occurrence*13)%42),`history-${index}-${occurrence}`);
  const future=candidates(addDays(date,1),7,(index*4)%21);
  append(item,hotIds.has(item.id)?beyondTomorrow(future):future,`future-${index}`);
 });
 [...hotDevices,...operational.slice(0,3)].forEach((item,index)=>{for(let occurrence=0;occurrence<4;occurrence++){const choices=candidates(addDays(date,-14),14,(index*9+occurrence*7)%42);append(item,hotIds.has(item.id)&&weekHistory.length?choices.filter(moment=>moment.date>=reportWeekStart(date)):choices,`popular-history-${index}-${occurrence}`);}});
 operational.slice(0,4).forEach((item,index)=>{for(let occurrence=0;occurrence<2;occurrence++)append(item,candidates(addDays(date,1),7,(index*5+occurrence*8)%21),`popular-future-${index}-${occurrence}`);});
 // One coherent creator/scene/plan relation per scene, with a genuinely common free cell.
 for(const [index,scene]of creativeScenes.slice(0,6).entries()){
  const ids=scene.ids.filter(id=>operational.some(item=>item.id===id)).slice(0,4);
  if(!ids.length)continue;
  const choices=candidates(addDays(date,1),7,(index*3+1)%21);
  const moment=commonFree(ids,ids.some(id=>hotIds.has(id))?beyondTomorrow(choices):choices,'active');
  if(moment)addRows(ids,moment,`scene-${scene.id}`,{sceneId:scene.id,user:profiles[index%profiles.length],planName:`示例 · ${scene.name}搭配`});
  else skipped.push({purpose:`scene-${scene.id}`,reason:'没有共同空余格，未追加该搭配'});
 }
 const cancellationCatalog=[...catalog.filter(item=>item.operationalStatus!=='active'),...operational];
 for(let index=0;index<16;index++){
  const item=cancellationCatalog[index%cancellationCatalog.length],moment=historical[(index*5+2)%historical.length];
  addRows([item.id],moment,`cancelled-${index}`,{status:'cancelled'});
 }
 // Current occupancy exists only during a real business slot. Closed hours stay closed.
 const todayChoices=current?[{date,slot:current},...remaining.filter(moment=>moment.slot!==current)]:remaining;
 for(const [index,item]of operational.filter(item=>!hotIds.has(item.id)).slice(0,6).entries())if(todayChoices.length)append(item,todayChoices,`today-${index}`);
 const histogram={active:0,cancelled:0,expired:0,current:0,upcoming:0};
 for(const row of reservations){histogram[row.status]++;if(row.status==='active')histogram[businessMoment(row.date,row.slot.slice(-5))<=now?'expired':businessMoment(row.date,row.slot.slice(0,5))<=now?'current':'upcoming']++;}
 return {alreadyApplied:false,date,users,plans,reservations,skipped,catalogCount:catalog.length,operationalCount:operational.length,maintenanceCount:catalog.length-operational.length,currentSlot:current,histogram,perCellLimit:limit,coveredEquipment:new Set(reservations.map(row=>row.equipmentId)).size,activeCoveredEquipment:new Set(reservations.filter(row=>row.status==='active').map(row=>row.equipmentId)).size};
}

// Only an existing database is accepted. This never initializes users, equipment, or admins.
export function seedAdminSample(database,{dryRun=false,now=new Date()}={}){
 const file=resolve(database);
 if(!existsSync(file))throw new Error('数据库不存在；不会创建新数据库。请使用 --database 指向已有台账。');
 if(!(now instanceof Date)||Number.isNaN(now.getTime()))throw new Error('当前业务时间无效。');
 const db=new DatabaseSync(file,{readOnly:dryRun});let started=false,backupPath=null;
 try{
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');assertSchema(db);
  if(db.prepare('SELECT value FROM metadata WHERE key=?').get(sampleKey(localDate(now)))){
   const proposed=planRows(db,now);
   return {source:ADMIN_SAMPLE_SOURCE,label,database:file,dryRun,alreadyApplied:true,seedDay:proposed.date,backupPath:null,added:{users:0,plans:0,reservations:0},previous:proposed.previous};
  }
  if(!dryRun){
   backupPath=`${file}.pre-admin-sample-${localDate(now)}-${Date.now()}.sqlite`;
   if(existsSync(backupPath))throw new Error('备份路径已存在；停止以防覆盖快照。');
   db.prepare('VACUUM INTO ?').run(backupPath);
  }
  db.exec(dryRun?'BEGIN':'BEGIN IMMEDIATE');started=true;
  const proposed=planRows(db,now);
  if(proposed.alreadyApplied){db.exec('ROLLBACK');started=false;return {source:ADMIN_SAMPLE_SOURCE,label,database:file,dryRun,alreadyApplied:true,seedDay:proposed.date,backupPath,added:{users:0,plans:0,reservations:0},previous:proposed.previous};}
  const result={source:ADMIN_SAMPLE_SOURCE,label,database:file,dryRun,alreadyApplied:false,seedDay:proposed.date,importedAt:now.toISOString(),backupPath,range:{historyStart:addDays(proposed.date,-14),historyEnd:addDays(proposed.date,-1),futureStart:addDays(proposed.date,1),futureEnd:addDays(proposed.date,7)},added:{users:proposed.users.length,plans:proposed.plans.length,reservations:proposed.reservations.length},states:proposed.histogram,devices:{total:proposed.catalogCount,operational:proposed.operationalCount,maintenance:proposed.maintenanceCount,covered:proposed.coveredEquipment,activeCovered:proposed.activeCoveredEquipment},currentBusinessSlot:proposed.currentSlot,futureSampleCellLimit:proposed.perCellLimit,skipped:proposed.skipped.length,recordIds:proposed.reservations.map(row=>row.id),planIds:proposed.plans.map(row=>row.id),createdUserIds:proposed.users.map(row=>row.id),recoveryBoundary:'快照包含备份时所有已提交的WAL数据。恢复前先停止服务并另备份当前库；不能直接覆盖正在运行的SQLite或丢弃快照之后新增的真实预约。可按metadata记录的示例ID核对后定向处理；此脚本没有删除/自动恢复功能。'};
  if(dryRun){db.exec('ROLLBACK');started=false;return result;}
  const insertUser=db.prepare('INSERT INTO users(id,name,role,avatar,prefs) VALUES(?,?,?,?,?)'),insertPlan=db.prepare('INSERT INTO plans(id,user_id,payload) VALUES(?,?,?)'),insertReservation=db.prepare('INSERT INTO reservations(id,user_id,equipment_id,date,slot,status,payload) VALUES(?,?,?,?,?,?,?)');
  for(const user of proposed.users)insertUser.run(user.id,user.name,user.role,user.avatar,JSON.stringify(user.prefs));
  for(const plan of proposed.plans)insertPlan.run(plan.id,plan.userId,JSON.stringify(plan));
  for(const row of proposed.reservations)insertReservation.run(row.id,row.userId,row.equipmentId,row.date,row.slot,row.status,JSON.stringify(row));
  db.prepare('INSERT INTO metadata(key,value) VALUES(?,?)').run(sampleKey(proposed.date),JSON.stringify(result));
  db.exec('COMMIT');started=false;return result;
 }catch(error){if(started)db.exec('ROLLBACK');throw error;}finally{db.close();}
}

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  try{process.loadEnvFile(resolve(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const args=process.argv.slice(2);let database=process.env.BORROW_DB_FILE||resolve(root,'data/borrow-lab.sqlite'),dryRun=false;
  if(args.includes('--help'))console.log('预览：node scripts/seed-admin-sample.js --database 路径 --dry-run\n追加：node scripts/seed-admin-sample.js --database 路径\n仅追加明确标记的示例数据；先一致快照、单事务追加；同一北京时间日期重复运行不累加。');
  else{
   for(let i=0;i<args.length;i++)if(args[i]==='--dry-run'&&!dryRun)dryRun=true;else if(args[i]==='--database'&&args[i+1]&&!args[i+1].startsWith('--'))database=resolve(args[++i]);else throw new Error('参数无效，请使用 --help。');
   const result=seedAdminSample(database,{dryRun});
   // IDs are persisted in metadata for traceability; keep console output concise.
   const {recordIds,planIds,createdUserIds,...summary}=result;
   if(summary.previous){const {recordIds,planIds,createdUserIds,...previous}=summary.previous;summary.previous=previous;}
   console.log(JSON.stringify(summary,null,2));
  }
 }catch(error){console.error(error.message);process.exitCode=1;}
}
