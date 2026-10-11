import {icon,brandSymbol} from '../icons.js';
import {deviceSvg} from '../device-art.js';
import {categories} from '../catalog.js';

export {icon,brandSymbol};
export const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const num=value=>Number.isFinite(Number(value))?Number(value):0;
export const percent=value=>value==null?'—':`${num(value).toFixed(1)}%`;
export const date=value=>value?String(value).slice(5).replace('-','月')+'日':'时间待定';
export const category=id=>categories.find(row=>row.id===id)?.name||id||'共享设备';
export const states={available:'当前空闲',current:'预约占用',occupied:'预约占用',upcoming:'即将使用',hot:'本期热门',maintenance:'维护中',expired:'已到期',cancelled:'已取消',active:'正常运营'};
export const pages={
 dashboard:{title:'资源智能中心',name:'Resource Intelligence Center',context:'指挥中心',icon:'discover',description:'设备、时间与创作需求，在同一个空间清楚连接'},
 equipment:{title:'设备智能墙',name:'Equipment Intelligence',context:'设备智能',icon:'camera',description:'掌握每件设备的状态、预约需求与下一次空闲'},
 bookings:{title:'时间流调度',name:'Time Flow Engine',context:'预约调度',icon:'calendar',description:'沿时间看清资源安排，直接处理需要关注的预约'},
 users:{title:'创作者网络',name:'Creator Network',context:'用户生态',icon:'user',description:'从真实身份、方案与预约关系，理解资源需求'},
 operations:{title:'AI 运营中心',name:'Operations Brain',context:'智能决策',icon:'spark',description:'先看事实，再看推理，最后做出可解释的决策'},
 analytics:{title:'资源脉冲',name:'Resource Insight',context:'资源洞察',icon:'sound',description:'让预约占用的分布、热点与空闲空间变得可见'},
 system:{title:'系统状态',name:'System',context:'系统',icon:'layers',description:'查看当前会话、同步机制与业务统计边界'}
};
export function badge(state){return `<span class="command-state state-${esc(state)}"><i></i>${esc(states[state]||state||'暂无')}</span>`;}
export function empty(title='暂无记录',description='这里会随真实台账的变化更新'){return `<div class="command-empty">${icon('layers')}<h3>${esc(title)}</h3><p>${esc(description)}</p></div>`;}
export function artwork(item,id='wall'){try{return deviceSvg({...item,model:item.model||''},`command-${id}-${item.id}`);}catch{return icon('camera');}}
export function section(title,subtitle,body,{action='',className=''}={}){return `<section class="command-panel ${className}"><header class="command-panel-head"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${action}</header>${body}</section>`;}
export function sparkline(rows=[],id='spark'){
 if(!rows.length)return '<span class="device-spark-empty">本期暂无趋势数据</span>';
 const width=180,height=42,max=Math.max(1,...rows.map(row=>num(row.count))),x=i=>i/(Math.max(1,rows.length-1))*(width-6)+3,y=count=>height-5-num(count)/max*(height-12),points=rows.map((row,i)=>`${x(i).toFixed(2)},${y(row.count).toFixed(2)}`).join(' ');
 return `<svg class="command-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(rows.map(row=>`${row.date}预约${num(row.count)}次`).join('，'))}"><defs><linearGradient id="${esc(id)}-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#9a8dff" stop-opacity=".24"/><stop offset="1" stop-color="#9a8dff" stop-opacity="0"/></linearGradient></defs><path d="M3 ${height} L${points.replaceAll(' ',' L')} L${width-3} ${height}Z" fill="url(#${esc(id)}-fill)"/><polyline points="${points}" pathLength="1" data-light-track fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
export function nextFree(item){return item.nextFreeSlot?`${date(item.nextFreeSlot.date)} · ${esc(item.nextFreeSlot.slot)}`:item.operationalStatus==='maintenance'?'维护期间暂停预约':'未来 14 天暂无空闲'};
export function sourceText(source){
 if(typeof source==='string')return source;
 if(!source)return '当前持久化业务台账';
 const names={reservations:'预约台账',equipment:'设备运营状态','plans + reservations + equipment':'创作方案与设备预约台账'};
 return [names[source.table]||'当前业务台账',source.start&&source.end?`${source.start} — ${source.end}`:source.asOf?`截至 ${source.asOf}`:'',source.sampleSize!=null?`${num(source.sampleSize)} 个有效预约时段`:''].filter(Boolean).join(' · ');
}
export function evidenceText(evidence){
 if(typeof evidence==='string')return evidence;
 if(!evidence)return '依据当前真实台账计算';
 const parts=[];
 if(evidence.devices)parts.push(evidence.devices.map(item=>`${item.name}：${num(item.bookings)} 次`).join('；'));
 if(evidence.names)parts.push(evidence.names.join('、'));
 if(evidence.bookings!=null)parts.push(`${num(evidence.bookings)} 次有效预约`);
 if(evidence.totalBookings!=null)parts.push(`本周共 ${num(evidence.totalBookings)} 次`);
 if(evidence.sampleSize!=null)parts.push(`本周样本 ${num(evidence.sampleSize)} 次`);
 if(evidence.share!=null)parts.push(`占本周 ${percent(evidence.share)}`);
 if(evidence.activeBookings!=null)parts.push(`该时段占用 ${num(evidence.activeBookings)} 件，空闲 ${num(evidence.availableEquipment)} 件`);
 if(evidence.occupancyRate!=null)parts.push(`预约占用 ${percent(evidence.occupancyRate)}`);
 if(evidence.equipmentIds&&!evidence.names)parts.push(`已检查 ${evidence.equipmentIds.length} 件真实设备`);
 if(evidence.nextFreeSlot)parts.push(`下一空闲 ${evidence.nextFreeSlot.date} · ${evidence.nextFreeSlot.slot}`);
 if('nextFreeSlot' in evidence&&!evidence.nextFreeSlot)parts.push('未来 14 天未找到匹配空闲');
 return parts.join('；')||'依据当前真实预约与设备状态计算';
}
export function insightRail(insights=[],summary={}){
 return `<aside class="command-insight-rail" aria-label="运营决策提示"><div class="insight-rail-title"><span class="brain-mark">${icon('spark')}</span><div><h2>运营脉络</h2><p>台账规则分析 · 依据可查</p></div></div>${insights.length?insights.slice(0,3).map((item,index)=>`<article class="command-insight ${esc(item.severity||'info')}"><div class="insight-number">${String(index+1).padStart(2,'0')}<i></i></div><h3>${esc(item.title)}</h3><p class="insight-advice">${esc(item.advice)}</p><details><summary>查看依据 ${icon('plus')}</summary><dl><dt>数据来源</dt><dd>${esc(sourceText(item.source))}</dd><dt>分析逻辑</dt><dd>${esc(item.logic)}</dd><dt>事实证据</dt><dd>${esc(evidenceText(item.evidence))}</dd></dl></details></article>`).join(''):empty('等待台账同步','不会生成没有依据的建议')}<div class="insight-boundary">${icon('check')}<p>建议仅供决策参考<br>不会自动移动或取消预约</p></div><a class="command-text-link" href="#/operations">进入运营分析 ${icon('arrow')}</a></aside>`;
}
export function pagination(data={}){const page=Math.max(1,num(data.page)||1),size=Math.max(1,num(data.pageSize)||20),pages=Math.max(1,Math.ceil(num(data.total)/size));return `<div class="command-pagination"><span>匹配 ${num(data.total)} 条 · 完整台账筛选</span><div><button class="btn btn-quiet btn-small" data-page-number="${page-1}" ${page<=1?'disabled':''}>上一页</button><span>${page} / ${pages}</span><button class="btn btn-quiet btn-small" data-page-number="${page+1}" ${page>=pages?'disabled':''}>下一页</button></div></div>`;}
