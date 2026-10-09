import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync,existsSync,readFileSync,copyFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { equipment,validateBooking,BookingError,localDate } from './booking.js';
import { inspectPlan,creativeScenes,replacements } from './creative.js';
import { addDays,freeSlots } from './planning.js';
import {groupedSchedule,sortPlans,personalAction,dateLabel} from './plan-state.js';
import {buildNotifications} from './notifications.js';

const avatars=['orbit','prism','tide','dusk','sunrise','moss','iris','silver'];
export function createProductStore(file,{legacyFile}={}){
 if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
 const db=new DatabaseSync(file);db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,role TEXT NOT NULL,avatar TEXT NOT NULL,prefs TEXT NOT NULL DEFAULT '{}');
 CREATE TABLE IF NOT EXISTS equipment(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),equipment_id TEXT NOT NULL,date TEXT NOT NULL,slot TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',payload TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS active_slot ON reservations(equipment_id,date,slot) WHERE status='active';
 CREATE TABLE IF NOT EXISTS favorites(user_id TEXT REFERENCES users(id),equipment_id TEXT REFERENCES equipment(id),PRIMARY KEY(user_id,equipment_id));
 CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS achievements(user_id TEXT REFERENCES users(id),key TEXT,title TEXT,created_at TEXT,PRIMARY KEY(user_id,key));
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE IF NOT EXISTS notification_reads(user_id TEXT REFERENCES users(id),event_id TEXT NOT NULL,read_at TEXT NOT NULL,PRIMARY KEY(user_id,event_id));`);
 db.exec('CREATE TABLE IF NOT EXISTS booking_requests(user_id TEXT REFERENCES users(id),request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(user_id,request_id));');
 const stmt=sql=>db.prepare(sql),parse=row=>JSON.parse(row.payload);
 function databaseError(error){
  // Only this business unique constraint means an occupied reservation slot.
  if(error.errcode===2067&&/reservations\.equipment_id, reservations\.date, reservations\.slot/.test(error.message))return new BookingError('这个器材在该时段已被预约，请换一个时段。',409);
  if(error.errcode===5||error.errcode===6)return new BookingError('预约台账正忙，请稍后重试。',503);
  return error;
 }
 function transaction(fn){let started=false;try{db.exec('BEGIN IMMEDIATE');started=true;const result=fn();db.exec('COMMIT');return result;}catch(error){if(started)db.exec('ROLLBACK');throw databaseError(error);}}
 function requireUser(id){if(typeof id!=='string'||!id||id.length>100)throw new BookingError('请选择一个有效账号。');const row=stmt('SELECT * FROM users WHERE id=?').get(id);if(!row)throw new BookingError('请选择一个有效账号。',404);return {...row,prefs:JSON.parse(row.prefs)};}
 function userForName(name){if(typeof name!=='string'||!name.trim()||name.length>30)throw new BookingError('昵称需为1～30个字符。');let row=stmt('SELECT * FROM users WHERE name=?').get(name);if(!row){const id=randomUUID();stmt('INSERT INTO users(id,name,role,avatar) VALUES(?,?,?,?)').run(id,name,'创作者','orbit');row=stmt('SELECT * FROM users WHERE id=?').get(id);}return row;}
 function seed(){for(const item of equipment)stmt('INSERT INTO equipment VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(item.id,JSON.stringify(item));for(const [name,role,avatar]of [['蒲嘉洋','创作者','orbit'],['创作组同学A','影像探索者','prism'],['创作组同学B','声音记录者','tide'],['游客体验账号','新朋友','dusk']]){if(!stmt('SELECT id FROM users WHERE name=?').get(name))stmt('INSERT INTO users(id,name,role,avatar) VALUES(?,?,?,?)').run(randomUUID(),name,role,avatar);}}
 transaction(seed);
 if(legacyFile&&existsSync(legacyFile)&&!stmt("SELECT value FROM metadata WHERE key='legacy-import'").get()){
  try{
  const rows=JSON.parse(readFileSync(legacyFile,'utf8'));if(!Array.isArray(rows))throw new Error('Legacy data invalid; import stopped');
  if(!existsSync(legacyFile+'.pre-sqlite-backup'))copyFileSync(legacyFile,legacyFile+'.pre-sqlite-backup');
  transaction(()=>{for(const row of rows){if(!row.id||!equipment.some(item=>item.id===row.equipmentId))throw new Error('Legacy record invalid; import stopped');const user=userForName(row.name);const payload={...row,userId:user.id};stmt('INSERT INTO reservations VALUES(?,?,?,?,?,?,?)').run(row.id,user.id,row.equipmentId,row.date,row.slot,'active',JSON.stringify(payload));}stmt("INSERT INTO metadata VALUES('legacy-import',?)").run(String(rows.length));});
  }catch(error){db.close();throw error;}
 }
 function list(){return stmt("SELECT payload FROM reservations WHERE status='active'").all().map(parse);}
 function unlock(userId,key,title){stmt('INSERT OR IGNORE INTO achievements VALUES(?,?,?,?)').run(userId,key,title,new Date().toISOString());}
 function add(input){return transaction(()=>addInside(input));}
 function addInside(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new BookingError('请填写预约信息。');
  const user=input.userId?requireUser(input.userId):userForName(input.name?.trim());const value={...input,name:user.name};
  let linked=null;
  if(input.planId){const row=stmt('SELECT payload FROM plans WHERE id=? AND user_id=?').get(input.planId,user.id);if(!row)throw new BookingError('这份方案不属于当前身份。',403);linked=parse(row);if(linked.date!==input.date||linked.slot!==input.slot||!linked.equipmentIds.includes(input.equipmentId))throw new BookingError('预约与方案时间或设备不一致，请返回方案重新检查。',409);}
  const booking={...validateBooking(value,list()),id:randomUUID(),userId:user.id,createdAt:new Date().toISOString(),...(linked?{planId:linked.id,planName:linked.name}: {})};
  stmt('INSERT INTO reservations VALUES(?,?,?,?,?,?,?)').run(booking.id,user.id,booking.equipmentId,booking.date,booking.slot,'active',JSON.stringify(booking));const total=stmt('SELECT COUNT(*) n FROM reservations WHERE user_id=?').get(user.id).n;unlock(user.id,'first-booking','创作启程');if(total>=5)unlock(user.id,'five-bookings','五次启程');const categories=new Set(stmt('SELECT payload FROM reservations WHERE user_id=?').all(user.id).map(parse).map(row=>equipment.find(item=>item.id===row.equipmentId)?.category));if(categories.size>=5)unlock(user.id,'five-categories','跨界探索者');return booking;
 }
 function reserveSet(input){return transaction(()=>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new BookingError('请填写预约信息。');
  if(typeof input.userId!=='string'||!input.userId||input.userId.length>100)throw new BookingError('请选择一个有效账号。');
  if(input.planId&&(typeof input.planId!=='string'||input.planId.length>100))throw new BookingError('方案信息无效，请重新打开方案。');
  const user=requireUser(input.userId),ids=input.equipmentIds;
  if(!Array.isArray(ids)||ids.length<1||ids.length>8||new Set(ids).size!==ids.length||ids.some(id=>!equipment.some(item=>item.id===id)))throw new BookingError('请选择1～8件不重复的有效设备。');
  if(typeof input.requestId!=='string'||! /^[a-zA-Z0-9-]{8,100}$/.test(input.requestId))throw new BookingError('预约请求已失效，请重新确认。');
  const fingerprint=JSON.stringify({equipmentIds:[...ids].sort(),date:input.date,slot:input.slot,planId:input.planId||null});
  const cached=stmt('SELECT fingerprint,payload FROM booking_requests WHERE user_id=? AND request_id=?').get(user.id,input.requestId);
  if(cached){if(cached.fingerprint!==fingerprint)throw new BookingError('预约内容已变化，请重新确认。',409);const result=parse(cached);if(result.records.some(row=>!stmt("SELECT id FROM reservations WHERE id=? AND user_id=? AND status='active'").get(row.id,user.id)))throw new BookingError('这次预约已有变更，请重新确认。',409);return result;}
  let plan=null;
  if(input.planId){const row=stmt('SELECT payload FROM plans WHERE id=? AND user_id=?').get(input.planId,user.id);if(!row)throw new BookingError('这份方案不属于当前身份。',403);plan=parse(row);if([...plan.equipmentIds].sort().join(',')!==[...ids].sort().join(','))throw new BookingError('方案设备已变化，请重新打开方案。',409);}
  const records=list(),existing=new Map();
  // Validate every device under the same write transaction before creating any record.
  for(const id of ids){const own=records.find(row=>row.userId===user.id&&row.equipmentId===id&&row.date===input.date&&row.slot===input.slot);validateBooking({equipmentId:id,date:input.date,slot:input.slot,name:user.name},records.filter(row=>row.id!==own?.id));if(own)existing.set(id,own);}
  if(plan){plan={...plan,date:input.date,slot:input.slot,updatedAt:new Date().toISOString()};stmt('UPDATE plans SET payload=? WHERE id=? AND user_id=?').run(JSON.stringify(plan),plan.id,user.id);}
  const created=[],resultRecords=[];
  for(const id of ids){if(existing.has(id)){resultRecords.push(existing.get(id));continue;}const booking=addInside({userId:user.id,equipmentId:id,date:input.date,slot:input.slot,...(plan?{planId:plan.id}:{})});const tagged={...booking,batchId:input.requestId,batchName:plan?.name||(typeof input.name==='string'&&input.name.trim()?input.name.trim().slice(0,60):'设备搭配')};stmt('UPDATE reservations SET payload=? WHERE id=?').run(JSON.stringify(tagged),booking.id);created.push(tagged);resultRecords.push(tagged);}
  const result={atomic:true,requestId:input.requestId,date:input.date,slot:input.slot,records:resultRecords,created:created.length,alreadyReserved:existing.size};
  stmt('INSERT INTO booking_requests VALUES(?,?,?,?)').run(user.id,input.requestId,fingerprint,JSON.stringify(result));return result;
 });}
 function cancel(id,userId){return transaction(()=>{if(typeof id!=='string'||!id)throw new BookingError('预约不存在或已取消。',404);const row=stmt("SELECT * FROM reservations WHERE id=? AND status='active'").get(id);if(!row)throw new BookingError('预约不存在或已取消。',404);if(!userId)throw new BookingError('请选择预约所属账号。',403);if(row.user_id!==userId)throw new BookingError('只能取消自己的预约。',403);const payload={...parse(row),status:'cancelled',cancelledAt:new Date().toISOString()};stmt("UPDATE reservations SET status='cancelled',payload=? WHERE id=? AND status='active'").run(JSON.stringify(payload),id);});}
 function users(){return stmt('SELECT * FROM users').all().map(row=>({...row,prefs:JSON.parse(row.prefs)}));}
 function createUser(input){const name=typeof input.name==='string'?input.name.trim():'';if(!name||name.length>30)throw new BookingError('昵称需为1～30个字符。');if(stmt('SELECT id FROM users WHERE name=?').get(name))throw new BookingError('这个昵称已经存在。',409);return requireUser(userForName(name).id);}
 function preferences(id,input){const user=requireUser(id);const prefs={...user.prefs};if(input.font) {if(!['standard','large','xlarge'].includes(input.font))throw new BookingError('字号设置无效。');prefs.font=input.font;}if(input.theme){if(!['auto','light','dark'].includes(input.theme))throw new BookingError('主题设置无效。');prefs.theme=input.theme;}if(typeof input.reduceMotion==='boolean')prefs.reduceMotion=input.reduceMotion;let avatar=user.avatar;if(input.avatar){if(!avatars.includes(input.avatar)&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.avatar))throw new BookingError('头像需为PNG/JPEG/WebP图片。');if(input.avatar.length>240000)throw new BookingError('头像资源过大，请重新优化图片。');avatar=input.avatar;}stmt('UPDATE users SET prefs=?,avatar=? WHERE id=?').run(JSON.stringify(prefs),avatar,id);return requireUser(id);}
 function favorite(id,equipmentId,enabled){requireUser(id);if(!equipment.some(item=>item.id===equipmentId))throw new BookingError('设备不存在。',404);stmt(enabled?'INSERT OR IGNORE INTO favorites VALUES(?,?)':'DELETE FROM favorites WHERE user_id=? AND equipment_id=?').run(id,equipmentId);return workspace(id);}
 function savePlan(id,input,planId){requireUser(id);const scene=creativeScenes.find(row=>row.id===input.sceneId);const name=typeof input.name==='string'?input.name.trim():scene?.name;if(!name||name.length>60)throw new BookingError('请给计划取一个不超过60字的名字。');const value={name,source:['advisor','scene','manual'].includes(input.source)?input.source:'manual',sceneId:scene?.id||'custom',date:input.date,slot:input.slot,equipmentIds:input.equipmentIds};inspectPlan(value,list());if(planId){const old=stmt('SELECT * FROM plans WHERE id=? AND user_id=?').get(planId,id);if(!old)throw new BookingError('计划不存在。',404);}const plan={...value,id:planId||randomUUID(),userId:id,status:'draft',updatedAt:new Date().toISOString()};stmt('INSERT INTO plans VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(plan.id,id,JSON.stringify(plan));unlock(id,'first-plan','灵感成形');return inspectPlan(plan,list());}
 function readyPlan(id,planId){requireUser(id);const row=stmt('SELECT * FROM plans WHERE id=? AND user_id=?').get(planId,id);if(!row)throw new BookingError('计划不存在。',404);const plan=inspectPlan(parse(row),list());if(plan.readiness!==100)throw new BookingError('先解决设备冲突，再完成准备。',409);const value={...parse(row),status:'ready',readyAt:new Date().toISOString()};stmt('UPDATE plans SET payload=? WHERE id=?').run(JSON.stringify(value),planId);unlock(id,'ready-plan','万事就绪');return value;}
 function workspace(id){
  const user=requireUser(id),records=list();
  const history=stmt('SELECT payload,status FROM reservations WHERE user_id=? ORDER BY date DESC').all(id).map(row=>({...parse(row),status:row.status}));
  const plans=sortPlans(stmt('SELECT payload FROM plans WHERE user_id=?').all(id).map(parse).map(plan=>inspectPlan(plan,records,equipment,{allowPast:true})));
  const achievements=stmt('SELECT key,title,created_at FROM achievements WHERE user_id=?').all(id),favs=stmt('SELECT equipment_id FROM favorites WHERE user_id=?').all(id).map(row=>row.equipment_id);
  const categories=new Set(history.map(row=>equipment.find(item=>item.id===row.equipmentId)?.category).filter(Boolean));
  const upcoming=groupedSchedule(history,plans,equipment),past=groupedSchedule(history,plans,equipment,{past:true});
  const readIds=new Set(stmt('SELECT event_id FROM notification_reads WHERE user_id=?').all(id).map(row=>row.event_id));
  const notifications=buildNotifications(upcoming,plans,readIds);
  return {user,history,plans,upcoming,past,nextAction:personalAction(plans,upcoming),favorites:favs,achievements,notifications,unreadCount:notifications.filter(item=>!item.read).length,footprints:{explore:{value:categories.size,target:new Set(equipment.map(item=>item.category)).size,label:'探索类别'},create:{value:plans.length,label:'创作方案'},commit:{value:upcoming.length+past.length,label:'预约安排'}},avatars};
 }
 function markNotificationsRead(id,ids){requireUser(id);if(!Array.isArray(ids)||ids.length>100||ids.some(key=>typeof key!=='string'||key.length>1000))throw new BookingError('通知内容无效。');const allowed=new Set(workspace(id).notifications.map(item=>item.id));if(ids.some(key=>!allowed.has(key)))throw new BookingError('这条通知已经变化，请重新打开通知中心。',409);transaction(()=>{for(const key of ids)stmt('INSERT OR IGNORE INTO notification_reads VALUES(?,?,?)').run(id,key,new Date().toISOString());});return workspace(id);}
 return {list,add,reserveSet,cancel,users,createUser,preferences,favorite,savePlan,readyPlan,workspace,markNotificationsRead,seed,close:()=>db.close(),replace:(id,date,slot)=>replacements(id,date,slot,list()),heatmap:(date=localDate())=>Array.from({length:7},(_,i)=>{const day=addDays(date,i);return {date:day,slots:freeSlots(list(),day,'camera'),free:equipment.reduce((n,item)=>n+freeSlots(list(),day,item.id).length,0),capacity:equipment.filter(item=>item.operationalStatus==='active').length*3};})};
}
