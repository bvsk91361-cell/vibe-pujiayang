import { equipment, slots, localDate } from './booking.js';
import { addDays, freeSlots } from './planning.js';

export const reportSections = {
 overview: ['window', 'count', 'sample'], popular: ['popular'], peak: ['peak'],
 anomalies: ['anomalies'], utilization: ['utilization']
};
export function bookingContext(records, start = localDate(), catalog = equipment) {
 const end=addDays(start,6);let invalid=0,duplicates=0;const seen=new Set(),clean=[];
 for(const row of records){
  if(!row||!catalog.some(item=>item.id===row.equipmentId)||!slots.includes(row.slot)||typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||localDate(new Date(`${row.date}T12:00:00`))!==row.date){invalid++;continue;}
  const key=`${row.equipmentId}|${row.date}|${row.slot}`;
  if(seen.has(key)){duplicates++;continue;}seen.add(key);
  clean.push({equipmentId:row.equipmentId,date:row.date,slot:row.slot});
 }
 const windowRecords=clean.filter(row=>row.date>=start&&row.date<=end);
 const deviceCapacity=7*slots.length;
 const devices=catalog.map(item=>({id:item.id,name:item.name,booked:windowRecords.filter(row=>row.equipmentId===item.id).length,capacity:item.operationalStatus==='maintenance'?0:deviceCapacity}));
 const slotCounts=slots.map(slot=>({slot,count:windowRecords.filter(row=>row.slot===slot).length}));
 const total=windowRecords.length,capacity=devices.reduce((sum,item)=>sum+item.capacity,0),insufficient=total<5;
 const popular=total?devices.filter(item=>item.booked===Math.max(...devices.map(item=>item.booked))):[];
 const peak=total?slotCounts.filter(item=>item.count===Math.max(...slotCounts.map(item=>item.count))):[];
 const percentage=(a,b)=>b?(a/b*100).toFixed(1)+'%':'维护中，不计可用容量';
 const facts={
  window:`统计窗口：${start} 至 ${end}（当前七天预约计划）。`,
  count:`有效预约 ${total} 条，台账 ${catalog.length} 件设备，计划容量 ${capacity} 个时段，预约占比 ${percentage(total,capacity)}。`,
  sample:insufficient?'当前样本不足：少于5条预约，仅描述当前记录，不推断长期需求或使用趋势。':'以下仅反映当前七天预约计划，不能推断长期趋势或实际使用量。',
  popular:total?`当前预约最多：${popular.map(item=>`${item.name} ${item.booked} 条`).join('、')}（并列全部列出）。`:'当前没有预约，无法识别热门设备；当前样本不足。',
  peak:total?`当前记录最多的时段：${peak.map(item=>`${item.slot} ${item.count} 条`).join('、')}；${slotCounts.map(item=>`${item.slot}=${item.count}条`).join('，')}。`:'当前没有预约，无法识别高峰时段；当前样本不足。',
  anomalies:`当前台账发现 ${duplicates} 条重复设备/日期/时段记录、${invalid} 条无效记录。唯一有效时段用于统计。系统未持久化被拒绝请求日志，无法据此统计历史冲突尝试；无异常记录不代表从未发生异常。`,
  utilization:`${devices.map(item=>`${item.name}：${item.booked}/${item.capacity} 个预约时段（${percentage(item.booked,item.capacity)}）`).join('；')}。这是预约占用率，不是实际设备利用率；没有签到/归还使用记录，实际利用情况无法判断。`
 };
 const actions={
  'collect-samples':{factIds:['sample'],text:'继续收集有效预约样本，并记录需求来源；样本不足时先观察，不据此判断长期趋势。'},
  'review-plan':{factIds:['count','window'],text:'复核已登记预约的设备、日期和时段，并与领用/归还安排确认。'},
  'monitor-changes':{factIds:['window'],text:'定期查看当前七天预约计划变化，依据实时台账调整安排。'}
 };
 if(total>=5&&peak.some(item=>item.count>1))actions['spread-peak']={factIds:['peak'],text:`当前记录集中于${peak.map(item=>item.slot).join('、')}，可与预约人确认能否改到同设备的空闲时段；改约前重新检查冲突。`};
 if(invalid||duplicates)actions['inspect-anomalies']={factIds:['anomalies'],text:'先复核异常台账并备份，不自动删除或覆盖原始预约；修复后重新生成统计。'};
 return {today:start,timezone:'Asia/Shanghai',window:{start,end},catalog:catalog.map(item=>({id:item.id,name:item.name,purpose:item.description,capability:item.capability,operationalStatus:item.operationalStatus})),reservations:windowRecords,reservationScope:'仅当前七天唯一有效预约，不包含姓名；其他日期的查询由服务端完整台账核对',stats:{start,end,total,capacity,devices,slotCounts,popular,peak,insufficient,anomalies:{duplicates,invalid}},facts,actions,cleanRecords:clean};
}
export function modelContext(context, mode = 'report') {
 if(mode==='availability'){
  const {today,timezone,window,catalog,reservations,reservationScope}=context;
  return {today,timezone,window,catalog,reservations,reservationScope,stats:{slotCounts:context.stats.slotCounts,peak:context.stats.peak,insufficient:context.stats.insufficient}};
 }
 const {cleanRecords,...safe}=context;return safe;
}
export function renderReport(context,selection) {
 const titles={overview:'本周预约概览',popular:'热门设备',peak:'高峰时段',anomalies:'冲突/异常情况',utilization:'设备利用情况'};
 const sections=Object.entries(titles).map(([key,title])=>({title,text:selection.sections[key].map(ref=>context.facts[ref]).join('\n')}));
 sections.push({title:'改进建议',text:selection.suggestions.map((id,index)=>`${index+1}. ${context.actions[id].text}`).join('\n')});
 return {sections,text:sections.map((section,index)=>`${index+1}. ${section.title}\n${section.text}`).join('\n\n')+'\n\n数据说明：事实和统计由服务端台账计算；建议由模型在有数据依据的选项中选择，不输出未经验证的自由事实。'};
}
export function answerQuery(context,query) {
 if(query.intent==='peak'){
  return {text:`当前七天预约时段分析\n${context.facts.peak}\n${context.facts.sample}\n不能把预约数量等同冲突概率；缺少被拒绝请求日志。`,matches:[],source:context.stats};
 }
 if(query.intent==='alternatives'){
  const original=context.catalog.find(item=>item.id===query.equipmentId);
  const same=context.catalog.filter(item=>item.id!==original.id&&item.capability===original.capability&&item.operationalStatus!=='maintenance');
  const equivalents=query.date?same.map(item=>({name:item.name,slots:freeSlots(context.cleanRecords,query.date,item.id).filter(slot=>!query.slot||slot===query.slot)})):same.map(item=>({name:item.name,slots:[]}));
  const available=equivalents.filter(item=>item.slots.length);
  let text=available.length?`同用途且指定时间空闲的替代设备：${available.map(item=>item.name+': '+item.slots.join('、')).join('；')}。`:same.length?(query.date?'同用途替代设备在指定时段均不可用，请调整日期或时段。':'同用途替代设备需明确日期/时段后再核对空闲。'):`台账中只有这一件同用途设备（${original.name}），没有同等用途替代设备。${context.catalog.filter(item=>item.id!==original.id).map(item=>item.name).join('、')}用途不同，不能当作等效替代。`;
  if(query.date)text+=`\n${query.date} 原设备其他空闲时段：${freeSlots(context.cleanRecords,query.date,original.id).join('、')||'无'}。`;
  else text+='\n请明确日期和时段，可再查询原设备的空闲时间并改约。';
  return {text:`替代设备核对\n${text}`,matches:equivalents,source:{catalog:context.catalog}};
 }
 const matches=context.catalog.filter(item=>query.equipmentId===null||item.id===query.equipmentId).map(item=>({name:item.name,slots:freeSlots(context.cleanRecords,query.date,item.id).filter(slot=>query.slot===null||query.slot===slot)}));
 return {text:`${query.date} 空闲查询\n${matches.map(item=>`${item.name}：${item.slots.length?item.slots.join('、'):'指定时段已被预约或已结束'}`).join('\n')}\n\n结果来自当前预约台账；提交时再次检测冲突。`,matches,source:{date:query.date,catalog:context.catalog}};
}
