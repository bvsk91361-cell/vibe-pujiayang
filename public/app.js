import { createBrowserApi } from './browser-api.js';
import { exportCsv } from './export-csv.js';
import { visibleReservations, reservationStatus } from './reservation-view.js';
import { addDays, freeSlots, planSummary } from './planning.js';
import { deviceSvg } from './device-art.js';
import { filterEquipment } from './catalog-view.js';
import { mountShowcase } from './showcase.js';
import { createSubmission } from './submission.js';
import { categories,scenes } from './catalog.js';
import { mountProduct } from './product.js';
import { goView } from './navigation.js';
import { icon } from './icons.js';
const $ = selector => document.querySelector(selector);
const staticMode = $('meta[name="storage-mode"]')?.content === 'browser';
const browserApi = staticMode ? createBrowserApi(localStorage) : null;
const form = $('#booking-form');
for(const input of form.querySelectorAll('.semantic-fields input,.semantic-fields select'))input.tabIndex=-1;
let equipment = [], slots = [], allRecords = [], category = 'all', weekStart = '';
let cancelRecord = null, aiBusy = false;
let showroom=null,scene=null,expanded=false;
function setStep(value){document.body.dataset.bookingStep=String(value);for(const button of $('#progress-rail').children){const index=Number(button.dataset.step);button.classList.toggle('active',index===value);button.classList.toggle('done',index<value);button.setAttribute('aria-current',index===value?'step':'false');button.querySelector('b').innerHTML=index<value?icon('check'):String(index+1);}}
for(const button of $('#progress-rail').children)button.addEventListener('click',()=>{const step=Number(button.dataset.step);if(step===0)return goView('equipment');setStep(step);const target=step===1?$('#week'):step===2?$('#time-slots'):$('#booking-submit');target.scrollIntoView({block:'center',behavior:document.documentElement.dataset.motion==='reduce'?'instant':'smooth'});(target.querySelector('button:not(:disabled)')||target).focus();});
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
function toast(text){const box=node('div','toast'),close=node('button','','×');close.innerHTML=icon('close');close.type='button';close.setAttribute('aria-label','关闭通知');close.addEventListener('click',()=>box.remove());box.append(node('span','',text),close);$('#toasts').replaceChildren(box);setTimeout(()=>box.remove(),6500);}
function notify(text, failed = false) { $('#message').textContent = text; $('#message').classList.toggle('error', failed);toast(text); }
function chosenDate() { return form.elements.date.value || today(); }
function selectedEquipment() { return equipment.find(item => item.id === form.elements.equipmentId.value); }
function selectEquipment(id) {
 if(submission.state()==='loading'){notify('正在保存上一条预约，请稍候。');return;}
 if(equipment.find(item=>item.id===id)?.operationalStatus==='maintenance'){notify('这件设备正在维护，请选择其他设备。',true);return;}
 form.elements.equipmentId.value = id;
 setStep(1);
 submission.reset();$('#booking-success').hidden=true;
 $('#selection').textContent = `已选：${selectedEquipment()?.name || '请选择设备'}`;
 renderCatalog(); renderSchedule(); renderSummary();
}
function renderCatalog() {
 const query = $('#search').value.trim().toLowerCase();
 const visible=filterEquipment(equipment,{category,query,scene,status:$('#catalog-status').value,sort:$('#catalog-sort').value,date:chosenDate(),records:allRecords});
 $('#catalog-count').textContent=`${visible.length} / ${equipment.length} 件设备${scene?' · 场景筛选中':''}${$('#catalog-sort').value==='popular'&&!allRecords.length?' · 暂无预约热度数据':''}`;
 $('#show-more').hidden=visible.length<=9||expanded;
 $('#show-more').replaceChildren(document.createTextNode(`显示全部 ${visible.length} 件设备 `));const moreIcon=node('span','');moreIcon.innerHTML=icon('arrow');$('#show-more').append(moreIcon);
 const grid = $('#equipment'); grid.replaceChildren();
 if (!visible.length) { const empty = node('div','empty'); empty.append(node('b','', '暂时没有找到这件设备'),node('span','', '换个关键词，或选择“全部设备”再看看。')); grid.append(empty); return; }
 for (const item of (expanded?visible:visible.slice(0,9))) {
  const card = node('article',`card${item.id === form.elements.equipmentId.value ? ' selected' : ''}`);
  card.dataset.equipmentId=item.id;
  const art = node('div',`device-art ${item.color}`); art.innerHTML = deviceSvg(item,'card');
  const meta = node('div','card-meta'); meta.append(node('h3','',item.name),node('span','device-code',item.productName));
  const bottom = node('div','card-bottom'); const free = freeSlots(allRecords,chosenDate(),item.id).length;
  const maintenance=item.operationalStatus==='maintenance';
  const tag = node('span',`availability${free === 0 ? ' busy' : ''}`,maintenance?'维护中 · 暂不可预约':free ? `所选日期 · ${free}个空闲时段` : '所选日期已约满');
  const button = node('button','primary',item.id === form.elements.equipmentId.value ? '已选择' : '选择设备');button.insertAdjacentHTML('beforeend',icon(item.id===form.elements.equipmentId.value?'check':'arrow'));button.disabled=maintenance;
  button.type='button'; button.setAttribute('aria-label',`预约${item.name}`);
  button.addEventListener('click',()=>{selectEquipment(item.id);scrollToBooking();});
  const detail=node('button','text-button','设备详情');detail.type='button';detail.setAttribute('aria-label',`查看${item.name}详情`);detail.addEventListener('click',()=>showroom.openDetail(item));
  const tags=node('div','tags');for(const label of item.tags)tags.append(node('span','pill',label));
  const actions=node('div','card-actions');actions.append(detail,button);bottom.append(tag,actions);
  const sceneCopy=node('div','card-scenes',item.scenes.map(id=>scenes.find(row=>row.id===id)?.name).filter(Boolean).slice(0,2).join(' · '));const info=node('div','card-info');info.append(meta,node('p','',item.description),sceneCopy,tags,bottom);card.append(art,info);grid.append(card);
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
  button.disabled=day<today()||submission.state()==='loading';
  button.addEventListener('click',()=>{submission.reset();$('#booking-success').hidden=true;form.elements.date.value=day;setStep(2);renderAll();}); week.append(button);
 }
 const times = $('#time-slots'); times.replaceChildren();
 for(const slot of slots){
  const available = freeSlots(allRecords,date,form.elements.equipmentId.value).includes(slot);
  const button = node('button',`slot${form.elements.slot.value === slot?' selected':''}${available?'':' full'}`);button.type='button';
  button.setAttribute('aria-label',`选择${slot}`);button.setAttribute('aria-pressed',String(form.elements.slot.value === slot));button.disabled=!available||submission.state()==='loading';
  button.append(node('strong','',slot),node('span','',available?'这件设备可预约':'已结束或已占用'));
  button.addEventListener('click',()=>{submission.reset();$('#booking-success').hidden=true;form.elements.slot.value=slot;setStep(3);renderSchedule();renderSummary();});times.append(button);
 }
}
function renderSummary() {
 const date = chosenDate(), slot = form.elements.slot.value, item = selectedEquipment();
 $('#booking-summary').textContent = `${item?.name || '设备'} · ${date} · ${slot || '请选择时段'}`;
 document.dispatchEvent(new CustomEvent('borrow:booking-state',{detail:{equipmentId:item?.id,date,slot}}));
}
function renderInsights(){
 $('#metric-devices').replaceChildren(document.createTextNode(String(equipment.length)),node('small','','件'));
 const date = chosenDate(); const free = equipment.reduce((total,item)=>total+freeSlots(allRecords,date,item.id).length,0);
 $('#metric-free').replaceChildren(document.createTextNode(String(free)),node('small','','个'));
 const mine = visibleReservations(allRecords,form.elements.name.value,true).filter(record=>!reservationStatus(record).expired).length;
 $('#metric-mine').replaceChildren(document.createTextNode(String(mine)),node('small','','条'));
 $('#overview-date').textContent = `${date} · 台账共 ${allRecords.length} 条预约`;
 const summary = planSummary(allRecords,today(),equipment);const chart = $('#utilization'); chart.replaceChildren();
 for(const item of [...summary.devices].sort((a,b)=>b.booked-a.booked).slice(0,6)){
  const row = node('div','util-row');const bar = node('div','util-bar'); const fill = node('span');
  fill.style.width=`${Math.min(item.percent,100)}%`;bar.append(fill);row.append(node('span','',item.name),bar,node('small','',item.capacity?`${item.percent}%`:'维护')); row.title=`${item.booked}/${item.capacity}个时段已预约`;chart.append(row);
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
  const mark=node('div','record-device');mark.innerHTML=icon('camera');row.append(mark,detail,badge,cancel);list.append(row);
 }
}
function renderAll(){renderCatalog();renderSchedule();renderSummary();renderRecords();renderInsights();}
async function refresh(){allRecords=await api('/api/reservations');renderAll();document.dispatchEvent(new Event('borrow:refresh'));}
const checkmark='<svg class="checkmark" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 5 5L20 6"/></svg>';
const submission=createSubmission((state,error)=>{const button=$('#booking-submit');button.dataset.state=state;button.disabled=state==='loading';for(const field of form.querySelectorAll('input,select'))field.disabled=state==='loading';button.innerHTML=state==='loading'?'<span class="spinner" aria-hidden="true"></span> 正在保存…':state==='success'?checkmark+' 预约已确认':'确认这次预约';if(equipment.length)renderSchedule();if(error){$('#booking-success').hidden=true;notify(error.message,true);}});
function scrollToBooking(){goView('booking');}
form.addEventListener('submit',async event=>{
 event.preventDefault();const input=Object.fromEntries(new FormData(form));const result=await submission.run(()=>api('/api/reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}));
 if(!result.value)return;
 setStep(4);
 const record=result.value,item=equipment.find(item=>item.id===record.equipmentId),card=$('#booking-success');card.replaceChildren();const heading=node('h3');heading.innerHTML=checkmark;heading.append(document.createTextNode('预约成功。灵感，可以出发了。'));const link=node('button','text-button','查看我的预约');link.type='button';link.addEventListener('click',()=>{$('#mine').checked=true;renderRecords();goView('reservations');});const explore=node('button','text-button','继续探索');explore.type='button';explore.addEventListener('click',()=>goView('discover'));card.append(heading,node('p','',`${item.name} · ${record.date} · ${record.slot}`),link,explore);card.hidden=false;document.dispatchEvent(new Event('borrow:booked'));
 try{await refresh();notify('预约已确认，设备和时段已为你留好。');}catch{notify('预约已保存，但列表暂未更新，请刷新记录确认。',true);}
});
$('#cancel-keep').addEventListener('click',()=>$('#cancel-dialog').close());
$('#cancel-dialog').addEventListener('close',()=>{cancelRecord=null;});
$('#cancel-confirm').addEventListener('click',async()=>{
 if(!cancelRecord)return;const button=$('#cancel-confirm');button.disabled=true;
 try{await api(`/api/reservations/${cancelRecord.id}?userId=${encodeURIComponent(form.elements.userId.value)}`,{method:'DELETE'});await refresh();submission.reset();$('#booking-success').hidden=true;$('#cancel-dialog').close();notify('预约已取消。原时段已释放，可以重新安排。');}
 catch(error){$('#cancel-error').textContent=error.message;}
 finally{button.disabled=false;}
});
form.elements.equipmentId.addEventListener('change',()=>selectEquipment(form.elements.equipmentId.value));
for(const type of ['input','change'])form.addEventListener(type,()=>{submission.reset();$('#booking-success').hidden=true;});
form.elements.date.addEventListener('change',()=>{weekStart=chosenDate();renderAll();});
form.elements.slot.addEventListener('change',()=>{renderSchedule();renderSummary();});
form.elements.name.addEventListener('input',()=>{renderRecords();renderInsights();});
$('#mine').addEventListener('change',renderRecords);
$('#search').addEventListener('input',()=>{expanded=false;renderCatalog();});
for(const id of ['catalog-sort','catalog-status'])$('#'+id).addEventListener('change',()=>{expanded=false;renderCatalog();});
$('#show-more').addEventListener('click',()=>{expanded=true;renderCatalog();});
$('#clear-filters').addEventListener('click',()=>{category='all';scene=null;expanded=false;$('#search').value='';$('#catalog-sort').value='recommended';$('#catalog-status').value='all';renderFilterButtons();renderCatalog();});
$('#categories').addEventListener('click',event=>{
 const button=event.target.closest('[data-category]');if(!button)return;category=button.dataset.category;
 expanded=false;renderFilterButtons();renderCatalog();
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
 if(aiBusy)return;aiBusy=true;$('#ai-report').disabled=true;$('#ai-form button').disabled=true;$('#ai-message').textContent='正在生成：正在核对预约台账，请稍候…';$('#ai-message').dataset.state='generating';$('#ai-message').classList.remove('error');$('#ai-result').hidden=true;
 try{const result=await api('/api/ai/assist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,question}),signal:AbortSignal.timeout(35000)});
 const output=$('#ai-result');output.replaceChildren();if(mode==='report'&&result.sections){for(const section of result.sections){const card=node('section','report-section');card.append(node('h3','',section.title),node('p','',section.text));output.append(card);}}else{output.textContent=result.text;for(const item of result.matches||[]){if(item.slots?.length){const el=node('button','secondary','查看'+item.name+'的时间');el.type='button';el.addEventListener('click',()=>{const id=equipment.find(row=>row.name===item.name)?.id;if(id){selectEquipment(id);if(result.query?.date)form.elements.date.value=result.query.date;form.elements.slot.value=item.slots[0];renderAll();goView('booking');}});output.append(el);}}}output.hidden=false;
 $('#ai-message').dataset.state='completed';$('#ai-message').textContent='已生成 · 空闲状态已核对';}
 catch(error){const message=['TimeoutError','AbortError'].includes(error.name)?'等待助手超时，请稍后手动重试。':error.name==='TypeError'?'无法连接本地服务，请检查网络与预览服务是否运行。':error.message;$('#ai-message').dataset.state='failed';$('#ai-message').textContent=`生成失败：${message}`;$('#ai-message').classList.add('error');}
 finally{aiBusy=false;$('#ai-report').disabled=false;$('#ai-form button').disabled=false;}
}
$('#ai-report').addEventListener('click',()=>askAI('report'));
$('#ai-form').addEventListener('submit',event=>{event.preventDefault();askAI('availability',$('#ai-question').value.trim());});
async function initialize(){
 $('#storage-note').textContent=staticMode?'在线演示 · 当前浏览器独立保存预约':'本地演示 · 同机共享预约，姓名筛选不等于登录';
 const catalog=await api('/api/equipment');equipment=catalog.equipment;slots=catalog.slots;
 showroom=mountShowcase({equipment,onSelect:id=>{selectEquipment(id);scrollToBooking();},onAccount:account=>{if(submission.state()==='loading'){notify('正在保存预约，请稍后切换身份。');return false;}form.elements.name.value=account.name;submission.reset();$('#booking-success').hidden=true;$('#mine').checked=true;renderRecords();renderInsights();},onPlans:()=>{$('#mine').checked=true;renderRecords();goView('reservations');}});
 for(const item of [{id:'all',name:'全部设备'},...categories]){const button=node('button','',item.name);button.type='button';button.dataset.category=item.id;$('#categories').append(button);}
 for(const item of scenes){const button=node('button','scene-card');button.type='button';button.dataset.scene=item.id;button.append(node('b','',item.name),node('span','',item.description));button.addEventListener('click',()=>{scene=scene===item.id?null:item.id;category='all';expanded=false;renderFilterButtons();renderCatalog();$('#equipment-title').scrollIntoView();});$('#scenes').append(button);}renderFilterButtons();
 for(const item of equipment){const option=new Option(item.name+(item.operationalStatus==='maintenance'?'（维护中）':''),item.id);option.disabled=item.operationalStatus==='maintenance';form.elements.equipmentId.add(option);}
 for(const slot of slots)form.elements.slot.add(new Option(slot,slot));
 form.elements.slot.value=freeSlots([],today(),equipment[0].id)[0] || slots[0];
 form.elements.date.min=today();form.elements.date.value=today();weekStart=today();$('#selection').textContent=`已选：${equipment[0].name}`;await refresh();
 try{const state=await api('/api/ai/status');$('#ai-state').textContent=state.configured?'助手已连接。让AI把台账整理成建议，空闲结果由系统核对。':'助手尚未配置。普通预约不受影响，完成服务端设置后即可使用。';}
 catch{$('#ai-state').textContent=staticMode?'静态演示提供预约体验。AI助手需要连接配置模型的后端。':'暂时无法连接助手，普通预约可继续使用。';}
 await mountProduct({api,equipment,getRecords:()=>allRecords,notify,openDetail:item=>showroom.openDetail(item),setAccount:user=>{form.elements.name.value=user.name;form.elements.userId.value=user.id;$('#mine').checked=true;renderAll();},setBooking:(id,date,slot)=>{if(id)selectEquipment(id);if(date){form.elements.date.value=date;weekStart=date;}if(slot)form.elements.slot.value=slot;else{const available=freeSlots(allRecords,chosenDate(),form.elements.equipmentId.value);form.elements.slot.value=available[0]||slots[0];}submission.reset();$('#booking-success').hidden=true;renderAll();}});
 $('#ai-state').textContent='告诉我你准备做什么。';
 $('#storage-note').hidden=true;renderAll();
}
function renderFilterButtons(){for(const item of $('#categories').querySelectorAll('button')){const active=item.dataset.category===category;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));}for(const item of $('#scenes').querySelectorAll('button')){const active=item.dataset.scene===scene;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));}}
setInterval(()=>{if(equipment.length){renderRecords();renderInsights();}},60000);
 initialize().catch(error=>notify(`这次没有连接上。${error.message}`,true));
