import {randomUUID,createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {BookingError,slots,localDate,businessMoment,isBusinessDate} from './booking.js';
import {categories} from './catalog.js';
import {addDays} from './planning.js';
import {occupancyHeatmap} from './occupancy.js';
import {bookingContext,reportWeekStart} from './ai-context.js';
import {buildIntelligence} from './admin-intelligence.js';

const parse=row=>JSON.parse(row.payload);
const integer=(value,fallback,max)=>Number.isInteger(Number(value))&&Number(value)>0?Math.min(Number(value),max):fallback;
const contains=(value,query)=>String(value??'').toLocaleLowerCase().includes(query.toLocaleLowerCase());

// Additive migration: no reservation, equipment id, unique index, or user is replaced.
// VACUUM INTO captures committed WAL content consistently before the first migration.
export function migrateAdminData(db,file){
 const version=db.prepare("SELECT value FROM metadata WHERE key='admin-schema-version'").get()?.value;
 if(version==='1')return;
 if(version)throw new Error('Unsupported admin schema version; migration stopped.');
 if(file!==':memory:'){
  const backup=file+'.pre-admin-v1-backup.sqlite';
  if(!existsSync(backup))db.prepare('VACUUM INTO ?').run(backup);
 }
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec(`CREATE TABLE IF NOT EXISTS admin_audit(id TEXT PRIMARY KEY,admin_id TEXT NOT NULL,admin_name TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT NOT NULL,created_at TEXT NOT NULL,payload TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS admin_audit_created ON admin_audit(created_at DESC);
   CREATE TABLE IF NOT EXISTS admin_reports(id TEXT PRIMARY KEY,admin_id TEXT NOT NULL,generated_at TEXT NOT NULL,period_start TEXT,period_end TEXT,payload TEXT NOT NULL);`);
  db.prepare("INSERT INTO metadata(key,value) VALUES('admin-schema-version','1')").run();
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}

// Explicit local rollback is allowed only while the new tables contain no data.
// It retains every reservation and every equipment/user row created since migration.
export function rollbackAdminDataMigration(db){
 db.exec('BEGIN IMMEDIATE');
 try{
  const version=db.prepare("SELECT value FROM metadata WHERE key='admin-schema-version'").get()?.value;
  if(version&&version!=='1')throw new Error('Unsupported admin schema version; rollback stopped.');
  if(version){
   const audit=db.prepare('SELECT COUNT(*) AS total FROM admin_audit').get().total,reports=db.prepare('SELECT COUNT(*) AS total FROM admin_reports').get().total;
   if(audit||reports)throw new Error('Admin data exists; rollback stopped to preserve management history.');
   db.exec('DROP TABLE admin_reports; DROP TABLE admin_audit;');
   db.prepare("DELETE FROM metadata WHERE key='admin-schema-version'").run();
  }
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}

export function createAdminData({db,file,catalog,transaction,clock=()=>new Date()}){
 migrateAdminData(db,file);
 const stmt=sql=>db.prepare(sql);
 const allRecords=()=>stmt('SELECT payload,status FROM reservations').all().map(row=>({...parse(row),status:row.status}));
 const userRows=()=>stmt('SELECT id,name,role,avatar FROM users').all().map(row=>({...row,identityType:'demo',identityLabel:'演示身份'}));
 function state(row,now=clock()){
  if(row.status==='cancelled')return 'cancelled';
  if(!isBusinessDate(row.date)||!slots.includes(row.slot))return 'invalid';
  if(businessMoment(row.date,row.slot.slice(-5))<=now)return 'expired';
  return businessMoment(row.date,row.slot.slice(0,5))<=now?'current':'upcoming';
 }
 function enriched(rows=allRecords(),now=clock()){
  const devices=new Map(catalog().map(item=>[item.id,item])),users=new Map(userRows().map(user=>[user.id,user]));
  return rows.map(row=>({...row,state:state(row,now),user:users.get(row.userId)||{id:row.userId,name:row.name||'历史身份',identityType:'demo'},equipment:devices.get(row.equipmentId)||{id:row.equipmentId,name:'历史设备'},canCancel:row.status!=='cancelled'&&['upcoming','current'].includes(state(row,now))}));
 }
 function summary(rows){
  const result={total:rows.length,active:0,upcoming:0,current:0,cancelled:0,expired:0,invalid:0};
  for(const row of rows)result[row.state]=(result[row.state]||0)+1;
  result.active=result.upcoming+result.current;
  return result;
 }
 function range(params={},fallbackDays=14){
  const days=integer(params.days,fallbackDays,366),to=params.to||params.end||localDate(clock()),from=params.from||params.start||addDays(to,1-days);
  if(!isBusinessDate(from)||!isBusinessDate(to)||from>to)throw new BookingError('请选择有效的统计日期范围。');
  const length=Math.round((businessMoment(to,'12:00')-businessMoment(from,'12:00'))/86400000)+1;
  if(length>366)throw new BookingError('统计范围不能超过366天。');
  return {start:from,end:to,days:length};
 }
 function paginate(rows,params={}){
  const page=integer(params.page,1,1000000),pageSize=integer(params.pageSize,25,100);
  return {items:rows.slice((page-1)*pageSize,page*pageSize),total:rows.length,page,pageSize,updatedAt:clock().toISOString()};
 }
 function writeAudit(admin,action,targetId,payload){
  if(!admin||typeof admin.id!=='string'||typeof (admin.username||admin.name)!=='string')throw new BookingError('管理员会话无效，请重新登录。',401);
  const event={id:randomUUID(),adminId:admin.id,adminName:admin.username||admin.name,action,targetId,createdAt:clock().toISOString(),...payload};
  stmt('INSERT INTO admin_audit VALUES(?,?,?,?,?,?,?)').run(event.id,event.adminId,event.adminName,action,targetId,event.createdAt,JSON.stringify(payload));
  return event;
 }
 function heatmap(records,start=reportWeekStart(localDate(clock())),devices=catalog()){
  const data=occupancyHeatmap(records,start,devices,clock());
  const operational=devices.filter(item=>item.operationalStatus==='active'),ids=new Set(operational.map(item=>item.id));
  const cells=data.dates.flatMap(date=>slots.map(slot=>{
   const booked=new Set(records.filter(row=>row.status!=='cancelled'&&ids.has(row.equipmentId)&&row.date===date&&row.slot===slot).map(row=>row.equipmentId)).size;
   const capacity=operational.length;
   return {date,slot,activeBookings:booked,availableEquipment:capacity-booked,capacity,occupancyRate:capacity?Math.round(booked/capacity*1000)/10:0,elapsed:businessMoment(date,slot.slice(-5))<=clock()};
  }));
  return {...data,slots,cells};
 }
 function trend(records,selected){
  return Array.from({length:selected.days},(_,i)=>{
   const date=addDays(selected.start,i),daily=records.filter(row=>row.date===date);
   return {date,count:daily.filter(row=>row.status!=='cancelled').length,cancelled:daily.filter(row=>row.status==='cancelled').length};
  });
 }
 function ranked(records,selected,devices=catalog()){
  const rows=records.filter(row=>row.status!=='cancelled'&&row.date>=selected.start&&row.date<=selected.end);
  return devices.map(item=>({...item,bookings:rows.filter(row=>row.equipmentId===item.id).length})).sort((a,b)=>b.bookings-a.bookings||a.name.localeCompare(b.name,'zh-CN'));
 }
 function deviceStates(records,devices=catalog(),now=clock()){
  const occupied=new Set(records.filter(row=>state(row,now)==='current').map(row=>row.equipmentId));
  const maintenance=devices.filter(item=>item.operationalStatus==='maintenance').length;
  const current=devices.filter(item=>item.operationalStatus==='active'&&occupied.has(item.id)).length;
  return {available:devices.length-maintenance-current,occupied:current,maintenance};
 }
 function activity(records,devices=catalog()){
  const names=new Map(devices.map(item=>[item.id,item.name])),users=new Map(userRows().map(user=>[user.id,user.name]));
  const events=records.flatMap(row=>{
   const value={userName:users.get(row.userId)||row.name||'历史身份',equipmentName:names.get(row.equipmentId)||row.equipmentId,date:row.date,slot:row.slot};
   return [...(row.createdAt?[{...value,id:row.id+':created',type:'created',createdAt:row.createdAt}]:[]),...(row.cancelledAt?[{...value,id:row.id+':cancelled',type:'cancelled',createdAt:row.cancelledAt,cancelledBy:row.cancelledBy||'user'}]:[])];
  });
  return events.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,10);
 }
 function dashboard(params={}){
  const now=clock(),today=localDate(now),records=allRecords(),devices=catalog(),week={start:reportWeekStart(today),end:addDays(reportWeekStart(today),6)};
  const statuses=deviceStates(records,devices,now),rank=ranked(records,week,devices),selected=range({days:integer(params.days,7,30)});
  const generatedAt=now.toISOString();
  return {generatedAt,updatedAt:generatedAt,timezone:'Asia/Shanghai',range:week,
   kpis:{todayBookings:records.filter(row=>row.status!=='cancelled'&&row.date===today).length,currentOccupied:statuses.occupied,availableEquipment:statuses.available,weekBookings:records.filter(row=>row.status!=='cancelled'&&row.date>=week.start&&row.date<=week.end).length},
   definitions:{todayBookings:'北京时间今日有效预约时段数，包含已结束时段',currentOccupied:'当前时段有效预约占用设备数，并非实际领用数',availableEquipment:'正常运营且当前时段没有有效预约的设备数',weekBookings:'本周一至周日有效预约时段数'},
   trend:trend(records,selected),trendRange:selected,trendMeaning:'按预约日期统计唯一有效预约时段；取消数按该记录的原预约日期统计',deviceStates:statuses,heatmap:heatmap(records,week.start,devices),popularEquipment:rank.filter(item=>item.bookings>0).slice(0,5),activity:activity(records,devices),summary:summary(enriched(records,now))};
 }
 function bookings(params={}){
  const rows=enriched().sort((a,b)=>b.date.localeCompare(a.date)||b.slot.localeCompare(a.slot)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const from=params.from||params.start,to=params.to||params.end;
  if((from&&!isBusinessDate(from))||(to&&!isBusinessDate(to))||(from&&to&&from>to))throw new BookingError('请选择有效的预约日期范围。');
  const keyword=String(params.keyword||params.q||'').trim(),status=params.status;
  if(params.slot&&!slots.includes(params.slot))throw new BookingError('预约时段筛选无效。');
  const allowed=['active','upcoming','current','cancelled','expired'];
  if(status&&status!=='all'&&!allowed.includes(status))throw new BookingError('预约状态筛选无效。');
  const filtered=rows.filter(row=>(!params.userId||row.userId===params.userId)&&(!params.equipmentId||row.equipmentId===params.equipmentId)&&(!params.category||row.equipment.category===params.category)&&(!params.slot||row.slot===params.slot)&&(!from||row.date>=from)&&(!to||row.date<=to)&&(!status||status==='all'||(status==='active'?['upcoming','current'].includes(row.state):row.state===status))&&(!keyword||[row.id,row.user.name,row.equipment.name,row.planName,row.batchName].some(value=>contains(value,keyword))));
  return {...paginate(filtered,params),summary:summary(rows),filteredSummary:summary(filtered),filters:{users:userRows(),equipment:catalog().map(({id,name,category})=>({id,name,category})),categories}};
 }
 function bookingDetail(id){
  const row=stmt('SELECT payload,status FROM reservations WHERE id=?').get(id);
  if(!row)throw new BookingError('预约记录不存在。',404);
  const booking=enriched([{...parse(row),status:row.status}])[0];
  return {...booking,audit:stmt("SELECT created_at,action,payload FROM admin_audit WHERE target_id=? AND action='booking.cancelled' ORDER BY created_at DESC").all(id).map(item=>({...JSON.parse(item.payload),createdAt:item.created_at,action:item.action}))};
 }
 function cancelBooking(id,reason,admin){
  if(typeof reason!=='string'||!reason.trim()||reason.trim().length>200)throw new BookingError('请填写1～200字的取消原因。');
  return transaction(()=>{
   const row=stmt("SELECT payload,status FROM reservations WHERE id=? AND status='active'").get(id);
   if(!row)throw new BookingError('预约不存在或已取消。',404);
   const booking={...parse(row),status:row.status};
   if(!['upcoming','current'].includes(state(booking)))throw new BookingError('已到期预约保留为历史记录，不能取消。',409);
   const payload={...booking,status:'cancelled',cancelledAt:clock().toISOString(),cancelledBy:'admin',cancellationReason:reason.trim()};
   stmt("UPDATE reservations SET status='cancelled',payload=? WHERE id=? AND status='active'").run(JSON.stringify(payload),id);
   writeAudit(admin,'booking.cancelled',id,{reason:reason.trim(),equipmentId:booking.equipmentId,date:booking.date,slot:booking.slot});
   return bookingDetail(id);
  });
 }
 function equipment(params={}){
  const records=allRecords(),devices=catalog(),today=localDate(clock()),week={start:reportWeekStart(today),end:addDays(reportWeekStart(today),6)},ranking=ranked(records,week,devices),states=deviceStates(records,devices);
  const currentIds=new Set(records.filter(row=>state(row)==='current').map(row=>row.equipmentId));
  const keyword=String(params.keyword||params.q||'').trim();
  if(params.status&&!['all','active','maintenance','occupied','available'].includes(params.status))throw new BookingError('设备状态筛选无效。');
  const items=devices.map(item=>({...item,bookings:ranking.find(row=>row.id===item.id)?.bookings||0,weekBookings:ranking.find(row=>row.id===item.id)?.bookings||0,state:item.operationalStatus==='maintenance'?'maintenance':currentIds.has(item.id)?'occupied':'available',currentBookings:records.filter(row=>row.equipmentId===item.id&&state(row)==='current').length,upcomingBookings:records.filter(row=>row.equipmentId===item.id&&state(row)==='upcoming').length})).filter(item=>(!params.category||item.category===params.category)&&(!params.status||params.status==='all'||item.state===params.status||item.operationalStatus===params.status)&&(!keyword||[item.name,item.id,item.model,item.description].some(value=>contains(value,keyword))));
  return {...paginate(items,{...params,pageSize:params.pageSize||100}),categories,summary:{total:devices.length,...states,popular:ranking.find(item=>item.bookings>0)||null}};
 }
 function equipmentDetail(id){
  const item=catalog().find(row=>row.id===id);if(!item)throw new BookingError('设备不存在。',404);
  const records=allRecords().filter(row=>row.equipmentId===id),selected=range({days:14});
  return {...item,bookingHistory:enriched(records).sort((a,b)=>b.date.localeCompare(a.date)||b.slot.localeCompare(a.slot)),trend:trend(records,selected),heatmap:heatmap(records,reportWeekStart(localDate(clock())),[item]),summary:summary(enriched(records))};
 }
 function updateEquipment(id,input,admin){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['name','description','operationalStatus'].includes(key)))throw new BookingError('只支持编辑设备名称、说明和维护状态。');
  if(!Object.keys(input).length)throw new BookingError('请填写需要更新的设备信息。');
  for(const [key,max]of [['name',60],['description',300]])if(key in input&&(typeof input[key]!=='string'||!input[key].trim()||input[key].trim().length>max))throw new BookingError(key==='name'?'设备名称需为1～60字。':'设备说明需为1～300字。');
  if('operationalStatus' in input&&!['active','maintenance'].includes(input.operationalStatus))throw new BookingError('设备状态无效。');
  return transaction(()=>{
   const row=stmt('SELECT payload FROM equipment WHERE id=?').get(id);if(!row)throw new BookingError('设备不存在。',404);
   const previous=parse(row);
   // The same BEGIN IMMEDIATE lock covers the conflict check and status write.
   if(input.operationalStatus==='maintenance'&&previous.operationalStatus!=='maintenance'){
    const affected=allRecords().filter(row=>row.equipmentId===id&&['upcoming','current'].includes(state(row)));
    if(affected.length)throw new BookingError(`这件设备还有${affected.length}条未来或当前有效预约，请先处理受影响的预约再设为维护。`,409);
   }
   const next={...previous,...input,...('name' in input?{name:input.name.trim()}:{}),...('description' in input?{description:input.description.trim()}:{}),updatedAt:clock().toISOString()};
   stmt('UPDATE equipment SET payload=? WHERE id=?').run(JSON.stringify(next),id);
   writeAudit(admin,'equipment.updated',id,{changes:Object.fromEntries(Object.keys(input).filter(key=>previous[key]!==next[key]).map(key=>[key,{before:previous[key],after:next[key]}]))});
   return equipmentDetail(id);
  });
 }
 function users(params={}){
  const rows=enriched(),keyword=String(params.keyword||params.q||'').trim();
  const items=userRows().map(user=>{
   const own=rows.filter(row=>row.userId===user.id),counts=summary(own),latest=[...own].sort((a,b)=>b.date.localeCompare(a.date))[0];
   return {...user,bookings:own.length,bookingCount:own.length,activeBookings:counts.active,cancelledBookings:counts.cancelled,lastBookingDate:latest?.date||null,summary:counts};
  }).filter(user=>!keyword||[user.name,user.role,user.id].some(value=>contains(value,keyword)));
  return {...paginate(items,{...params,pageSize:params.pageSize||100}),identityNotice:'前台身份为本地演示身份，未进行校园账户认证；与管理员账号独立。'};
 }
 function userDetail(id){
  const user=users({pageSize:100}).items.find(row=>row.id===id)||userRows().find(row=>row.id===id);if(!user)throw new BookingError('用户身份不存在。',404);
  const records=enriched().filter(row=>row.userId===id).sort((a,b)=>b.date.localeCompare(a.date)||b.slot.localeCompare(a.slot));
  const frequentEquipment=catalog().map(item=>({id:item.id,name:item.name,category:item.category,bookings:records.filter(row=>row.equipmentId===item.id&&row.status!=='cancelled').length})).filter(item=>item.bookings>0).sort((a,b)=>b.bookings-a.bookings).slice(0,5);
  return {...user,summary:summary(records),bookingHistory:records,currentBookings:records.filter(row=>['upcoming','current'].includes(row.state)),cancelledBookings:records.filter(row=>row.state==='cancelled'),frequentEquipment};
 }
 function analytics(params={}){
  const selected=range(params),records=allRecords(),devices=catalog(),rank=ranked(records,selected,devices),operational=rank.filter(item=>item.operationalStatus==='active');
  const inRange=records.filter(row=>row.status!=='cancelled'&&row.date>=selected.start&&row.date<=selected.end),operationalIds=new Set(operational.map(item=>item.id));
  const booked=inRange.filter(row=>operationalIds.has(row.equipmentId)).length,capacity=operational.length*selected.days*slots.length;
  const distribution=categories.map(category=>({id:category.id,name:category.name,count:inRange.filter(row=>devices.find(item=>item.id===row.equipmentId)?.category===category.id).length}));
  return {updatedAt:clock().toISOString(),range:selected,timezone:'Asia/Shanghai',trend:trend(records,selected),categoryDistribution:distribution,equipmentOccupancy:rank.map(item=>({id:item.id,name:item.name,category:item.category,operationalStatus:item.operationalStatus,bookings:item.bookings,capacity:item.operationalStatus==='active'?selected.days*slots.length:0,occupancyRate:item.operationalStatus==='active'?Math.round(item.bookings/(selected.days*slots.length)*1000)/10:0})),popularEquipment:rank.filter(item=>item.bookings>0).slice(0,5),lowBookingEquipment:[...operational].sort((a,b)=>a.bookings-b.bookings).slice(0,5),heatmap:heatmap(records,addDays(selected.end,-Math.min(selected.days-1,6)),devices),source:{metric:'reservation-occupancy',timezone:'Asia/Shanghai',start:selected.start,end:selected.end,total:inRange.length,occupied:booked,capacity,occupancyRate:capacity?Math.round(booked/capacity*1000)/10:0,meaning:'唯一有效预约时段占用，并非实际领用时长；维护设备不计可预约容量'},reportBasis:bookingContext(records,reportWeekStart(localDate(clock())),devices).stats};
 }
 function reports(params={}){
  const rows=stmt('SELECT payload FROM admin_reports ORDER BY generated_at DESC').all().map(parse);
  return {...paginate(rows,params),latest:rows[0]||null};
 }
 function intelligence(params={}){
  const now=clock(),records=allRecords(),devices=catalog(),selected=range(params,7);
  // Read the existing persisted plans; no independent equipment data or write side effects.
  const plans=stmt('SELECT payload,user_id FROM plans').all().map(row=>({...parse(row),userId:row.user_id}));
  return buildIntelligence({catalog:devices,records:enriched(records,now),users:userRows(),plans,window:selected,pulse:heatmap(records,localDate(now),devices),now,params});
 }
 function revision(){
  const now=clock(),date=localDate(now);
  const snapshot={
   equipment:stmt('SELECT id,payload FROM equipment ORDER BY id').all(),
   reservations:stmt('SELECT id,status,payload FROM reservations ORDER BY id').all(),
   plans:stmt('SELECT id,payload FROM plans ORDER BY id').all(),
   users:stmt('SELECT id,name,role FROM users ORDER BY id').all(),
   temporal:{date,slots:slots.map(slot=>({slot,state:businessMoment(date,slot.slice(-5))<=now?'elapsed':businessMoment(date,slot.slice(0,5))<=now?'current':'upcoming'}))}
  };
  // Only a digest leaves this method. Credentials, sessions, avatars and wall-clock
  // seconds are excluded; unchanged business state therefore does not pulse randomly.
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
 }
 function saveReport(result,admin,period){
  if(!result||typeof result.text!=='string'||!result.text.trim()||!Array.isArray(result.sections))throw new BookingError('周报内容不完整，未保存。',502);
  if(JSON.stringify(result).length>300000)throw new BookingError('周报内容过大，未保存。',413);
  return transaction(()=>{
   const current=reportWeekStart(localDate(clock())),start=period?.start||result.source?.start||current,end=period?.end||result.source?.end||addDays(start,6);
   if(!isBusinessDate(start)||!isBusinessDate(end)||start>end)throw new BookingError('周报统计周期无效。');
   const value={...result,id:randomUUID(),generatedAt:clock().toISOString(),period:{start,end},metric:'reservation-occupancy'};
   writeAudit(admin,'report.generated',value.id,{period:value.period,provider:result.provider||'model',model:result.model||null});
   stmt('INSERT INTO admin_reports VALUES(?,?,?,?,?,?)').run(value.id,admin.id,value.generatedAt,start,end,JSON.stringify(value));
   return value;
  });
 }
 return {dashboard,intelligence,revision,bookings,booking:bookingDetail,bookingDetail,equipment,equipmentDetail,updateEquipment,cancelBooking,users,user:userDetail,userDetail,analytics,reports,saveReport};
}
