import {localDate,slots,businessMoment,isBusinessDate} from './booking.js';

export const PLAN_STATES = Object.freeze({
 DRAFT:{label:'准备中',cta:'继续准备',icon:'plan',priority:1},
 NEED_TIME:{label:'待定时间',cta:'选择时间',icon:'calendar',priority:1},
 CONFLICT:{label:'待处理',cta:'解决冲突',icon:'refresh',priority:0},
 READY:{label:'已就绪',cta:'开始预约',icon:'check',priority:3},
 PARTIALLY_RESERVED:{label:'预约中',cta:'继续预约',icon:'calendar',priority:2},
 RESERVED:{label:'已预约',cta:'查看预约',icon:'calendar',priority:4},
 PAST:{label:'已完成',cta:'查看记录',icon:'check',priority:5}
});

export function derivePlanState(plan,records=[],now=new Date()){
 const ids=plan.equipmentIds||[],total=ids.length;
 const timed=!!plan.date&&slots.includes(plan.slot);
 const expired=timed&&(plan.date<localDate(now)||(plan.date===localDate(now)&&businessMoment(plan.date,plan.slot.slice(-5))<=now));
 const reserved=timed&&plan.userId?ids.filter(id=>records.some(row=>row.status!=='cancelled'&&row.userId===plan.userId&&row.equipmentId===id&&row.date===plan.date&&row.slot===plan.slot)).length:0;
 const conflicts=timed?(plan.items||[]).filter(item=>!item.available).length:0;
 const state=!total?'DRAFT':!timed?'NEED_TIME':expired?'PAST':conflicts?'CONFLICT':reserved===total?'RESERVED':reserved?'PARTIALLY_RESERVED':'READY';
 const detail=state==='CONFLICT'?`${conflicts} 件设备待处理${reserved?' · '+reserved+'/'+total+' 已预约':''}`:state==='PARTIALLY_RESERVED'?`${reserved} / ${total} 已预约`:state==='RESERVED'?`${total} 件设备已预约`:state==='READY'?`${total} 件设备可预约`:state==='NEED_TIME'?'选好时间，再确认设备':state==='DRAFT'?'从第一件设备开始':`${total} 件设备 · 历史方案`;
 return {state,...PLAN_STATES[state],total,reserved,conflicts,detail};
}
export function sortPlans(plans){return [...plans].sort((a,b)=>{const history=a.planState?.state==='PAST'&&b.planState?.state==='PAST',first=history?b:a,second=history?a:b;return (a.planState?.priority??5)-(b.planState?.priority??5)||(first.date||'9999').localeCompare(second.date||'9999')||(first.slot||'').localeCompare(second.slot||'')||(b.updatedAt||'').localeCompare(a.updatedAt||'')||String(a.id||a.name||'').localeCompare(String(b.id||b.name||''));});}
export function dateLabel(date,{relative=true,weekday=false,now=new Date()}={}){
 if(!date)return '时间待定';
 if(!isBusinessDate(date))return '时间待定';
 const parsed=new Date(`${date}T12:00:00Z`),today=localDate(now),tomorrow=localDate(new Date(now.getTime()+86400000));
 const label=relative&&date===today?'今天':relative&&date===tomorrow?'明天':`${date.slice(0,4)!==today.slice(0,4)?date.slice(0,4)+'年':''}${parsed.getUTCMonth()+1}月${parsed.getUTCDate()}日`;
 return label+(weekday?' · 周'+['日','一','二','三','四','五','六'][parsed.getUTCDay()]:'');
}
export function identityName(user){return {'创作组同学A':'影像演示身份','创作组同学B':'声音演示身份','游客体验账号':'访客身份'}[user.name]||user.name;}

export function groupedSchedule(history,plans,catalog,{past=false,now=new Date()}={}){
 const groups=new Map();
 for(const row of history){
  if(row.status==='cancelled')continue;
  const ended=row.date<localDate(now)||(row.date===localDate(now)&&businessMoment(row.date,row.slot.slice(-5))<=now);
  if(ended!==past)continue;
  const plan=plans.find(item=>item.id===row.planId&&item.userId===row.userId);
  const key=plan?`${row.userId}:${plan.id}:${row.date}:${row.slot}`:row.batchId?`${row.userId}:batch:${row.batchId}:${row.date}:${row.slot}`:`reservation:${row.id}`;
  if(!groups.has(key))groups.set(key,{key,planId:plan?.id||null,name:plan?.name||(row.batchId?row.batchName:null)||catalog.find(item=>item.id===row.equipmentId)?.name||'设备预约',date:row.date,slot:row.slot,records:[],status:past?'PAST':'RESERVED'});
  groups.get(key).records.push(row);
 }
 return [...groups.values()].map(group=>{
  const plan=plans.find(item=>item.id===group.planId);
  const count=new Set(group.records.map(row=>row.equipmentId)).size;
  if(!past&&plan?.date===group.date&&plan?.slot===group.slot&&count<plan.equipmentIds.length&&plan.planState?.state!=='RESERVED')group.status='PARTIALLY_RESERVED';
  return {...group,count};
 }).sort((a,b)=>a.date.localeCompare(b.date)||a.slot.localeCompare(b.slot));
}
export function personalAction(plans,upcoming){
 const next=sortPlans(plans).find(plan=>!['RESERVED','PAST'].includes(plan.planState.state));
 if(next)return {kind:'plan',plan:next,title:next.name,label:next.planState.cta,detail:next.planState.detail};
 if(upcoming.length)return {kind:'schedule',schedule:upcoming[0],title:upcoming[0].name,label:'查看下一次安排',detail:`${upcoming[0].count} 件设备已预约`};
 return {kind:'new',title:'下一次，想做什么？',label:'开始一个创作',detail:null};
}
