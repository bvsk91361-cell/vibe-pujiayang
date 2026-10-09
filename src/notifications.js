import {dateLabel} from './plan-state.js';
import {businessMoment} from './booking.js';

// Event identity follows real reservations / plan conflicts, never a display title.
export function buildNotifications(upcoming,plans,readIds=new Set(),now=new Date()){
 const events=upcoming.map(group=>{
  const recordIds=group.records.map(row=>row.id).sort();
  const id='schedule:'+group.key+':'+recordIds.join(',');
  const start=businessMoment(group.date,group.slot.slice(0,5)),minutes=(start-now)/60000;
  const kind=minutes<=120?'upcoming':'confirmation';
  return {id,kind,title:group.name,date:group.date,slot:group.slot,count:group.count,text:`${dateLabel(group.date,{now})} · ${group.slot}`,label:minutes<0?'正在使用':kind==='upcoming'?'即将开始':'已预约',action:'查看预约',target:{type:'schedule',key:group.key},read:readIds.has(id)};
 });
 for(const plan of plans){if(plan.planState.state!=='CONFLICT')continue;
  const blocked=plan.items.filter(item=>!item.available).map(item=>item.id).sort();
  const id=`conflict:${plan.id}:${plan.date}:${plan.slot}:${blocked.join(',')}`;
  events.push({id,kind:'conflict',title:plan.name,date:plan.date,slot:plan.slot,count:blocked.length,text:`${blocked.length} 件设备需要调整`,label:'待处理',action:'解决冲突',target:{type:'plan',id:plan.id},read:readIds.has(id)});
 }
 return [...new Map(events.map(event=>[event.id,event])).values()].sort((a,b)=>
  a.date.localeCompare(b.date)||a.slot.localeCompare(b.slot)||Number(b.kind==='conflict')-Number(a.kind==='conflict'));
}
