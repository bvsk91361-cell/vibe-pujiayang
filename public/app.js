import { createBrowserApi } from './browser-api.js';
import { exportCsv } from './export-csv.js';
import { visibleReservations, reservationStatus } from './reservation-view.js';
import { addDays, freeSlots, planSummary } from './planning.js';
import { deviceSvg } from './device-art.js';
const $ = selector => document.querySelector(selector);
const staticMode = $('meta[name="storage-mode"]')?.content === 'browser';
const browserApi = staticMode ? createBrowserApi(localStorage) : null;
const form = $('#booking-form');
let equipment = [], slots = [], allRecords = [], category = 'all', weekStart = '';
let cancelRecord = null, aiBusy = false;
function today() {
 const now = new Date();
 return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
function node(tag, className, text) {
 const element = document.createElement(tag);
 if (className) element.className = className;
 if (text !== undefined) element.textContent = text;
 return element;
}
async function api(path, options) {
 if (staticMode && !path.startsWith('/api/ai')) return browserApi(path, options);
 if (staticMode) throw new Error('在线静态演示暂未连接AI服务，请使用已配置模型的本地版。');
 const response = await fetch(path, options);
 let result;
 try { result = await response.json(); } catch { throw new Error('服务返回异常，请稍后重试。'); }
 if (!response.ok) throw new Error(result.error || '请求失败，请稍后再试。');
 return result;
}
function notify(text, failed = false) { $('#message').textContent = text; $('#message').classList.toggle('error', failed); }
function chosenDate() { return form.elements.date.value || today(); }
function selectedEquipment() { return equipment.find(item => item.id === form.elements.equipmentId.value); }
function selectEquipment(id) {
 form.elements.equipmentId.value = id;
 $('#selection').textContent = `已选：${selectedEquipment()?.name || '请选择设备'}`;
 renderCatalog(); renderSchedule(); renderSummary();
}
function renderCatalog() {
 const query = $('#search').value.trim().toLowerCase();
 const visible = equipment.filter(item => (category === 'all' || item.id === category) && `${item.name} ${item.description}`.toLowerCase().includes(query));
 const grid = $('#equipment'); grid.replaceChildren();
 if (!visible.length) { const empty = node('div','empty'); empty.append(node('b','', '暂时没有找到这件设备'),node('span','', '换个关键词，或选择“全部设备”再看看。')); grid.append(empty); return; }
 for (const [index,item] of visible.entries()) {
  const card = node('article',`card${item.id === form.elements.equipmentId.value ? ' selected' : ''}`);
  const art = node('div',`device-art ${item.color}`); art.innerHTML = deviceSvg(item.id);
  const meta = node('div','card-meta'); meta.append(node('h3','',item.name),node('span','device-code',`BL / 00${equipment.indexOf(item)+1}`));
  const bottom = node('div','card-bottom'); const free = freeSlots(allRecords,chosenDate(),item.id).length;
  const tag = node('span',`tag${free === 0 ? ' busy' : ''}`,free ? `所选日期 · ${free}个空闲时段` : '所选日期已约满');
  const button = node('button','',item.id === form.elements.equipmentId.value ? '已选择 ✓' : '选择设备 ↗');
  button.type='button'; button.setAttribute('aria-label',`预约${item.name}`);
  button.addEventListener('click',()=>{selectEquipment(item.id);$('#booking-title').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});
  bottom.append(tag,button); card.append(art,meta,node('p','',item.description),bottom); grid.append(card);
 }
}
function renderSchedule() {
 const date = chosenDate(); if (!weekStart) weekStart = date;
 $('#week-label').textContent = `${weekStart.slice(0,4)}年${Number(weekStart.slice(5,7))}月 · 选择日期`;
 $('#week-prev').disabled = weekStart <= today();
 const week = $('#week'); week.replaceChildren();
 for(let index=0;index<7;index++){
  const day = addDays(weekStart,index); const value = new Date(`${day}T12:00:00`);
  const button = node('button',`day${day === date?' selected':''}`); button.type='button';
  button.setAttribute('aria-label',`选择${day}`);button.setAttribute('aria-pressed',String(day === date));button.disabled=day<today();
  button.append(node('span','',day === today()?'今天':['日','一','二','三','四','五','六'][value.getDay()]),node('strong','',String(value.getDate())),node('small','',`${freeSlots(allRecords,day,form.elements.equipmentId.value).length}空闲`));
  button.addEventListener('click',()=>{form.elements.date.value=day;renderAll();}); week.append(button);
 }
 const times = $('#time-slots'); times.replaceChildren();
 for(const slot of slots){
  const available = freeSlots(allRecords,date,form.elements.equipmentId.value).includes(slot);
  const button = node('button',`slot${form.elements.slot.value === slot?' selected':''}${available?'':' full'}`);button.type='button';
  button.setAttribute('aria-label',`选择${slot}`);button.setAttribute('aria-pressed',String(form.elements.slot.value === slot));
  button.append(node('strong','',slot),node('span','',available?'这件设备可预约':'已结束或已占用'));
  button.addEventListener('click',()=>{form.elements.slot.value=slot;renderSchedule();renderSummary();});times.append(button);
 }
}
function renderSummary() {
 const date = chosenDate(), slot = form.elements.slot.value, item = selectedEquipment();
 $('#booking-summary').textContent = `${item?.name || '设备'} · ${date} · ${slot || '请选择时段'}`;
}
function renderInsights(){
 $('#metric-devices').replaceChildren(document.createTextNode(String(equipment.length)),node('small','','件'));
 const date = chosenDate(); const free = equipment.reduce((total,item)=>total+freeSlots(allRecords,date,item.id).length,0);
 $('#metric-free').replaceChildren(document.createTextNode(String(free)),node('small','','个'));
 const mine = visibleReservations(allRecords,form.elements.name.value,true).filter(record=>!reservationStatus(record).expired).length;
 $('#metric-mine').replaceChildren(document.createTextNode(String(mine)),node('small','','条'));
 $('#overview-date').textContent = `${date} · 台账共 ${allRecords.length} 条预约`;
 const summary = planSummary(allRecords);const chart = $('#utilization'); chart.replaceChildren();
 for(const item of summary.devices){
  const row = node('div','util-row');const bar = node('div','util-bar'); const fill = node('span');
  fill.style.width=`${Math.min(item.percent,100)}%`;bar.append(fill);row.append(node('span','',item.name),bar,node('small','',`${item.percent}%`)); row.title=`${item.booked}/${item.capacity}个时段已预约`;chart.append(row);
 }
}
function renderRecords(){
 const records=visibleReservations(allRecords,form.elements.name.value,$('#mine').checked);
 const list=$('#reservations');list.replaceChildren();
 if(!records.length){const empty=node('div','empty');empty.append(node('b','',$('#mine').checked?'你的下一次安排，从这里开始。':'好设备，正在等一个好想法。'),node('span','',$('#mine').checked?'这个姓名下还没有预约，选择设备后即可开始。':'目前还没有预约记录，试着安排一次创作。'));list.append(empty);return;}
 for(const record of [...records].sort((a,b)=>a.date.localeCompare(b.date)||a.slot.localeCompare(b.slot))){
  const row=node('article','reservation');const detail=node('div','record-detail');const item=equipment.find(item=>item.id===record.equipmentId);
  detail.append(node('strong','',`${item?.name || '设备'} · ${record.name}`),node('p','',`${record.date} / ${record.slot}`));
  const status=reservationStatus(record);const badge=node('span',`reservation-status${status.expired?' expired':''}`,status.label);
  const cancel=node('button','cancel','取消预约');cancel.type='button';cancel.setAttribute('aria-label',`取消${record.name}的${record.date}预约`);
  cancel.addEventListener('click',()=>{cancelRecord=record;$('#cancel-description').textContent=`${item?.name || '设备'} · ${record.date} · ${record.slot}。取消后，这个时段会重新开放。`;$('#cancel-error').textContent='';$('#cancel-dialog').showModal();$('#cancel-keep').focus();});
  row.append(node('div','record-device',record.equipmentId==='camera'?'▣':record.equipmentId==='projector'?'▱':'▤'),detail,badge,cancel);list.append(row);
 }
}
function renderAll(){renderCatalog();renderSchedule();renderSummary();renderRecords();renderInsights();}
async function refresh(){allRecords=await api('/api/reservations');renderAll();}
form.addEventListener('submit',async event=>{
 event.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;submit.textContent='正在保存…';
 try{await api('/api/reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});await refresh();notify('预约成功，记录已保存。你的下一次创作，安排好了。');}
 catch(error){notify(error.message,true);}
 finally{submit.disabled=false;submit.replaceChildren(document.createTextNode('确认这次预约'),node('span','','↗'));}
});
$('#cancel-keep').addEventListener('click',()=>$('#cancel-dialog').close());
$('#cancel-dialog').addEventListener('close',()=>{cancelRecord=null;});
$('#cancel-confirm').addEventListener('click',async()=>{
 if(!cancelRecord)return;const button=$('#cancel-confirm');button.disabled=true;
 try{await api(`/api/reservations/${cancelRecord.id}`,{method:'DELETE'});await refresh();$('#cancel-dialog').close();notify('预约已取消。原时段已释放，可以重新安排。');}
 catch(error){$('#cancel-error').textContent=error.message;}
 finally{button.disabled=false;}
});
form.elements.equipmentId.addEventListener('change',()=>selectEquipment(form.elements.equipmentId.value));
form.elements.date.addEventListener('change',()=>{weekStart=chosenDate();renderAll();});
form.elements.slot.addEventListener('change',()=>{renderSchedule();renderSummary();});
form.elements.name.addEventListener('input',()=>{renderRecords();renderInsights();});
$('#mine').addEventListener('change',renderRecords);
$('#search').addEventListener('input',renderCatalog);
$('#categories').addEventListener('click',event=>{
 const button=event.target.closest('[data-category]');if(!button)return;category=button.dataset.category;
 for(const item of $('#categories').querySelectorAll('button')){item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));}renderCatalog();
});
$('#week-prev').addEventListener('click',()=>{weekStart=addDays(weekStart,-7);if(weekStart<today())weekStart=today();renderSchedule();});
$('#week-next').addEventListener('click',()=>{weekStart=addDays(weekStart,7);renderSchedule();});
$('#refresh').addEventListener('click',()=>refresh().then(()=>notify('预约记录已刷新。')).catch(error=>notify(error.message,true)));
document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();$('#search').focus();}});
for(const link of document.querySelectorAll('.nav-link'))link.addEventListener('click',()=>{for(const item of document.querySelectorAll('.nav-link'))item.classList.toggle('active',item===link);});
$('#export').addEventListener('click',async()=>{
 try{const csv=exportCsv(await api('/api/reservations'),equipment);const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
 const link=node('a');link.href=url;link.download='借一下-预约记录.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('已导出当前预约台账。');}
 catch(error){notify(error.message,true);}
});
async function askAI(mode,question=''){
 if(aiBusy)return;aiBusy=true;$('#ai-report').disabled=true;$('#ai-form button').disabled=true;$('#ai-message').textContent='正在整理台账，请稍候…';$('#ai-message').classList.remove('error');$('#ai-result').hidden=true;
 try{const result=await api('/api/ai/assist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,question})});
 const output=$('#ai-result');output.textContent=result.text;output.hidden=false;
 $('#ai-message').textContent=`本次由 ${result.model} 生成，空闲数据经服务端核对。`;}
 catch(error){$('#ai-message').textContent=error.message;$('#ai-message').classList.add('error');}
 finally{aiBusy=false;$('#ai-report').disabled=false;$('#ai-form button').disabled=false;}
}
$('#ai-report').addEventListener('click',()=>askAI('report'));
$('#ai-form').addEventListener('submit',event=>{event.preventDefault();askAI('availability',$('#ai-question').value.trim());});
async function initialize(){
 $('#storage-note').textContent=staticMode?'在线演示 · 当前浏览器独立保存预约':'本地演示 · 同机共享预约，姓名筛选不等于登录';
 const catalog=await api('/api/equipment');equipment=catalog.equipment;slots=catalog.slots;
 for(const item of equipment)form.elements.equipmentId.add(new Option(item.name,item.id));
 for(const slot of slots)form.elements.slot.add(new Option(slot,slot));
 form.elements.slot.value=freeSlots([],today(),equipment[0].id)[0] || slots[0];
 form.elements.date.min=today();form.elements.date.value=today();weekStart=today();$('#selection').textContent=`已选：${equipment[0].name}`;await refresh();
 try{const state=await api('/api/ai/status');$('#ai-state').textContent=state.configured?'助手已连接。让AI把台账整理成建议，空闲结果由系统核对。':'助手尚未配置。普通预约不受影响，完成服务端设置后即可使用。';}
 catch{$('#ai-state').textContent=staticMode?'静态演示提供预约体验。AI助手需要连接配置模型的后端。':'暂时无法连接助手，普通预约可继续使用。';}
}
setInterval(()=>{if(equipment.length){renderRecords();renderInsights();}},60000);
initialize().catch(error=>notify(`加载失败：${error.message}`,true));
