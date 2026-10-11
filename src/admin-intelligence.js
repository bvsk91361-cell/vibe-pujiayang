import {BookingError,slots,localDate,businessMoment,isBusinessDate} from './booking.js';
import {categories} from './catalog.js';
import {addDays,freeSlots} from './planning.js';
import {reportWeekStart} from './ai-context.js';

const round=value=>Math.round(value*10)/10;
const textMatches=(value,needle)=>String(value??'').toLocaleLowerCase().includes(needle.toLocaleLowerCase());
const slotKey=row=>[row.equipmentId,row.date,row.slot].join('|');
const positive=(value,fallback,max)=>Number.isInteger(Number(value))&&Number(value)>0?Math.min(Number(value),max):fallback;

// All projections are read-only and derived from the same persisted ledger.
// The caller enriches reservation state using the existing Admin data rules.
export function buildIntelligence({catalog,records,users,plans=[],window,pulse,now=new Date(),params={}}){
 const today=localDate(now),weekStart=reportWeekStart(today),week={start:weekStart,end:addDays(weekStart,6)};
 const deviceById=new Map(catalog.map(item=>[item.id,item]));
 const valid=records.filter(row=>row.status!=='cancelled'&&deviceById.has(row.equipmentId)&&isBusinessDate(row.date)&&slots.includes(row.slot));
 // Counting distinct physical slots also protects historical imports from inflating capacity.
 const active=[...new Map(valid.map(row=>[slotKey(row),row])).values()];
 const selected=active.filter(row=>row.date>=window.start&&row.date<=window.end);
 const currentWeek=active.filter(row=>row.date>=week.start&&row.date<=week.end);
 const weekCounts=new Map(catalog.map(item=>[item.id,currentWeek.filter(row=>row.equipmentId===item.id).length]));
 const hotThreshold=Math.max(3,[...weekCounts.values()].sort((a,b)=>b-a)[Math.max(0,Math.ceil(catalog.length/4)-1)]||0);
 const futureRows=active.filter(row=>businessMoment(row.date,row.slot.slice(-5))>now).sort((a,b)=>a.date.localeCompare(b.date)||a.slot.localeCompare(b.slot)||String(a.id).localeCompare(String(b.id)));
 const nextFree=(ids)=>{
  if(!ids.length||ids.some(id=>deviceById.get(id)?.operationalStatus!=='active'))return null;
  for(let day=0;day<14;day++){
   const date=addDays(today,day);
   for(const slot of slots)if(businessMoment(date,slot.slice(0,5))>=now&&ids.every(id=>freeSlots(active,date,id,now,catalog).includes(slot)))return {date,slot};
  }
  return null;
 };
 const devices=catalog.map(item=>{
  const own=active.filter(row=>row.equipmentId===item.id),weekBookings=weekCounts.get(item.id),windowBookings=selected.filter(row=>row.equipmentId===item.id).length;
  const nextBooking=futureRows.find(row=>row.equipmentId===item.id)||null,maintenance=item.operationalStatus!=='active';
  const current=own.some(row=>row.state==='current'),imminent=nextBooking&&businessMoment(nextBooking.date,nextBooking.slot.slice(0,5))-now<=86400000;
  const state=maintenance?'maintenance':current?'current':imminent?'upcoming':weekBookings>=hotThreshold?'hot':'available';
  const capacity=maintenance?0:window.days*slots.length;
  const attention=[...(maintenance?['设备维护中，不计可预约容量']:[]),...(current?['当前时段有有效预约']:[]),...(imminent&&!current?['24小时内有待使用预约']:[]),...(weekBookings>=hotThreshold?['本周预约次数达到热门阈值']:[])];
  return {...item,todayBookings:own.filter(row=>row.date===today).length,weekBookings,windowBookings,capacity,occupancyRate:capacity?round(windowBookings/capacity*100):null,
   trend:Array.from({length:window.days},(_,index)=>{const date=addDays(window.start,index);return {date,count:own.filter(row=>row.date===date).length};}),nextFreeSlot:nextFree([item.id]),nextBooking,state,attention};
 });
 const flows=flowRows(records,params,today,deviceById);
 const network=relationNetwork({catalog,records,users,plans,window});
 const operational=devices.filter(item=>item.operationalStatus==='active'),capacity=operational.length*window.days*slots.length;
 const occupied=selected.filter(row=>deviceById.get(row.equipmentId).operationalStatus==='active').length;
 const categoryRows=categories.map(category=>{
  const own=devices.filter(item=>item.category===category.id);
  return {...category,deviceIds:own.map(item=>item.id),bookings:own.reduce((sum,item)=>sum+item.windowBookings,0),available:own.filter(item=>item.state==='available'||item.state==='hot').length,current:own.filter(item=>item.state==='current').length,upcoming:own.filter(item=>item.state==='upcoming').length,maintenance:own.filter(item=>item.state==='maintenance').length};
 }).filter(category=>category.deviceIds.length);
 const insights=deriveInsights({devices,currentWeek,week,now,today,nextFree,plans,pulse,window});
 return {updatedAt:now.toISOString(),timezone:'Asia/Shanghai',today,window,week,
  metric:{id:'reservation-occupancy',meaning:'有效预约时段占用，并非实际领用或使用时长',capacityPolicy:'按当前正常运营设备×统计天数×每日3个固定时段计算；维护设备不计容量；不追溯未记录的历史维护时长'},
  summary:{equipment:catalog.length,operational:operational.length,maintenance:catalog.length-operational.length,current:devices.filter(item=>item.state==='current').length,todayBookings:active.filter(row=>row.date===today).length,weekBookings:currentWeek.length,windowBookings:selected.length,occupied,capacity,occupancyRate:capacity?round(occupied/capacity*100):null,users:users.length,plans:plans.length},
  devices,galaxy:{categories:categoryRows,nodes:devices.map(({id,name,category,state,weekBookings})=>({id,name,category,state,weekBookings,type:'device'}))},
  timeFlow:flows,network,pulse,insights,
  system:{timezone:'Asia/Shanghai',slots,identityType:'local-identity',identityNotice:'用户为本地身份，管理员使用独立的密码认证和服务端会话',conflictCount:null,conflictMeaning:'未持久化历史冲突事件，无法统计历史拒绝次数',
   capabilities:{equipmentManagement:true,bookingManagement:true,persistedReports:true,atomicBookings:true,readOnlyIdentityRelations:true},
   metricDefinitions:{occupancy:'有效预约占用比例，不等于设备实际使用率',hot:`本周有效预约至少${hotThreshold}次，达到设备数前四分之一的预约次数阈值`,upcoming:'正常运营设备在24小时内有有效待使用预约',maintenance:'以当前设备维护状态为准，不取消或改变已有预约',nextFreeSlot:'从当前北京时间起检查未来14天尚未开始的完整固定时段，只提供查询建议，提交仍由服务端重新校验',network:'真实本地身份、已保存方案和统计窗口内预约的关系；不推断未发生的行为'}}};
}

function flowRows(records,params,today,deviceById){
 const from=params.flowFrom||params.from||params.start||today,to=params.flowTo||params.to||params.end||addDays(today,6);
 if(!isBusinessDate(from)||!isBusinessDate(to)||from>to||(businessMoment(to,'12:00')-businessMoment(from,'12:00'))/86400000>=366)throw new BookingError('请选择有效的调度日期范围，最多366天。');
 const status=params.status,allowed=['all','active','upcoming','current','cancelled','expired'];
 if(status&&!allowed.includes(status))throw new BookingError('预约状态筛选无效。');
 if(params.slot&&!slots.includes(params.slot))throw new BookingError('预约时段筛选无效。');
 const query=String(params.keyword||params.q||'').trim();
 const filtered=records.filter(row=>row.date>=from&&row.date<=to&&(!params.equipmentId||row.equipmentId===params.equipmentId)&&(!params.userId||row.userId===params.userId)&&(!params.category||deviceById.get(row.equipmentId)?.category===params.category)&&(!params.slot||row.slot===params.slot)&&(!status||status==='all'||(status==='active'?['upcoming','current'].includes(row.state):row.state===status))&&(!query||[row.id,row.user?.name,row.equipment?.name,row.planName,row.batchName].some(value=>textMatches(value,query))));
 filtered.sort((a,b)=>a.date.localeCompare(b.date)||a.slot.localeCompare(b.slot)||String(a.equipmentId).localeCompare(String(b.equipmentId))||String(a.id).localeCompare(String(b.id)));
 const page=positive(params.page,1,1000000),pageSize=positive(params.pageSize,100,100);
 return {items:filtered.slice((page-1)*pageSize,page*pageSize),total:filtered.length,page,pageSize,from,to,slots};
}

function relationNetwork({catalog,records,users,plans,window}){
 const nodes=[],edges=[],known=new Set(),addNode=node=>{if(!known.has(node.id)){known.add(node.id);nodes.push(node);}},addEdge=(source,target,type)=>{if(known.has(source)&&known.has(target))edges.push({id:source+'>'+target+':'+type,source,target,type});};
 for(const user of users)addNode({id:'user:'+user.id,entityId:user.id,type:'user',name:user.name,identityType:'local-identity'});
 for(const item of catalog)addNode({id:'device:'+item.id,entityId:item.id,type:'device',name:item.name,category:item.category});
 const visiblePlans=[...plans].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||String(a.id).localeCompare(String(b.id))).slice(0,200);
 for(const plan of visiblePlans)addNode({id:'plan:'+plan.id,entityId:plan.id,type:'plan',name:plan.name,userId:plan.userId,sceneId:plan.sceneId});
 for(const plan of visiblePlans){addEdge('user:'+plan.userId,'plan:'+plan.id,'owns-plan');for(const id of new Set(plan.equipmentIds||[]))addEdge('plan:'+plan.id,'device:'+id,'includes-device');}
 const scoped=records.filter(row=>isBusinessDate(row.date)&&row.date>=window.start&&row.date<=window.end).sort((a,b)=>b.date.localeCompare(a.date)||String(a.id).localeCompare(String(b.id)));
 const visibleBookings=scoped.slice(0,200);
 for(const row of visibleBookings)addNode({id:'booking:'+row.id,entityId:row.id,type:'booking',name:row.equipment?.name||row.equipmentId,date:row.date,slot:row.slot,state:row.state,status:row.status,userId:row.userId,equipmentId:row.equipmentId});
 for(const row of visibleBookings){addEdge('user:'+row.userId,'booking:'+row.id,'made-booking');addEdge('booking:'+row.id,'device:'+row.equipmentId,'reserves-device');if(row.planId)addEdge('plan:'+row.planId,'booking:'+row.id,'planned-booking');}
 return {nodes,edges,window,summary:{users:users.length,devices:catalog.length,plans:plans.length,shownPlans:visiblePlans.length,bookings:scoped.length,shownBookings:visibleBookings.length,relations:edges.length},identityNotice:'基于本地身份及实际保存关系；每次最多展示最近200份方案及窗口内200条预约，保留真实总数',scope:'selected-window'};
}

function deriveInsights({devices,currentWeek,week,today,nextFree,plans,pulse,window}){
 const source={table:'reservations',metric:'reservation-occupancy',start:week.start,end:week.end,timezone:'Asia/Shanghai',sampleSize:currentWeek.length};
 const insights=[];
 const populated=devices.filter(item=>item.operationalStatus==='active'&&item.weekBookings>0).sort((a,b)=>b.weekBookings-a.weekBookings||a.id.localeCompare(b.id));
 if(populated.length){const popular=populated[0];insights.push({id:'popular-device',title:popular.name+'本周预约较集中',severity:'info',evidence:{equipmentId:popular.id,bookings:popular.weekBookings,totalBookings:currentWeek.length,nextFreeSlot:popular.nextFreeSlot},source,logic:'按本周一至周日未取消的真实预约次数排序，未推断实际领用或长期趋势',advice:popular.nextFreeSlot?`可优先提示${popular.nextFreeSlot.date} ${popular.nextFreeSlot.slot}这一真实空闲时段；最终提交需再次校验`:'未来14天未查询到可预约时段，请检查维护或预约安排'});}
 const slotCounts=slots.map(slot=>({slot,count:currentWeek.filter(row=>row.slot===slot).length})).sort((a,b)=>b.count-a.count||slots.indexOf(a.slot)-slots.indexOf(b.slot));
 if(slotCounts[0].count){const peak=slotCounts[0];insights.push({id:'peak-slot',title:peak.slot+'预约较集中',severity:'info',evidence:{slot:peak.slot,bookings:peak.count,totalBookings:currentWeek.length,share:round(peak.count/currentWeek.length*100)},source,logic:'按真实固定时段汇总本周有效预约，时段范围保持原始09–11、14–16、19–21',advice:'安排时先查询其他固定时段的真实空闲，不自动移动任何用户预约'});}
 const low=devices.filter(item=>item.operationalStatus==='active').sort((a,b)=>a.weekBookings-b.weekBookings||a.id.localeCompare(b.id)).slice(0,3);
 if(low.length)insights.push({id:'low-reservation',title:currentWeek.length?'关注本周低预约设备':'本周暂未形成有效预约样本',severity:'neutral',evidence:{devices:low.map(({id,name,weekBookings})=>({id,name,bookings:weekBookings})),sampleSize:currentWeek.length},source,logic:'维护设备不参与低预约排名；少量或零预约不能证明设备没有实际使用，也不能推断长期需求',advice:'可观察用途说明和预约需求，继续积累数据后再决定开放策略；不据此自动停用设备'});
 const maintenance=devices.filter(item=>item.state==='maintenance');
 if(maintenance.length)insights.push({id:'maintenance',title:maintenance.length+'件设备当前维护中',severity:'warning',evidence:{equipmentIds:maintenance.map(item=>item.id),names:maintenance.map(item=>item.name)},source:{table:'equipment',asOf:today},logic:'来自当前持久化设备运营状态，维护设备不计可预约容量',advice:'确认维护完成后再恢复预约；如果存在未来预约，先按规则处理，不能静默取消'});
 const future=pulse?.cells?.filter(cell=>!cell.elapsed&&cell.capacity>0).sort((a,b)=>b.occupancyRate-a.occupancyRate||a.date.localeCompare(b.date)||slots.indexOf(a.slot)-slots.indexOf(b.slot))||[];
 if(future[0]?.activeBookings){const cell=future[0];insights.push({id:'pulse-focus',title:cell.date+' '+cell.slot+'是未来七天关注点',severity:cell.occupancyRate>=75?'warning':'info',evidence:{...cell},source:{table:'reservations',start:pulse.start,end:pulse.end,metric:'reservation-occupancy'},logic:'按当前正常运营设备容量计算未来七天各固定时段占用比例，仅有真实预约才生成热点',advice:'点击该时段查看实际预约，或在用户确认后安排其他空闲时段'});}
 const candidate=[...plans].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||String(a.id).localeCompare(String(b.id))).find(plan=>plan.equipmentIds?.length>1&&plan.equipmentIds.every(id=>devices.some(item=>item.id===id)));
 if(candidate){const ids=[...new Set(candidate.equipmentIds)],slot=nextFree(ids);insights.push({id:'common-availability',title:candidate.name+'的共同空闲',severity:slot?'info':'warning',evidence:{planId:candidate.id,equipmentIds:ids,nextFreeSlot:slot},source:{table:'plans + reservations + equipment',asOf:today},logic:'复用固定时段空闲规则，检查同一日期、同一时段所有设备均未被有效预约且未处于维护',advice:slot?`未来14天首个共同空闲为${slot.date} ${slot.slot}；仅供排期参考，不自动提交`:'未来14天未查询到完整共同空闲；请查看维护状态或调整设备组合'});}
 return insights;
}
