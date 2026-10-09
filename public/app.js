import { createBrowserApi } from './browser-api.js';
import { exportCsv } from './export-csv.js';
import { visibleReservations, reservationStatus } from './reservation-view.js';
import { addDays, freeSlots, planSummary } from './planning.js';
import { deviceSvg } from './device-art.js';
import { filterEquipment } from './catalog-view.js';
import { mountShowcase } from './showcase.js';
import { mountBookingFlow } from './booking-flow.js';
import {mountBookingPicker} from './booking-picker.js';
import { categories,scenes } from './catalog.js';
import { mountProduct } from './product.js';
import { goView,openDialog } from './navigation.js';
import { icon } from './icons.js';
import {dateLabel,identityName} from './plan-state.js';
import {localDate} from './booking.js';
import {renderOccupancy} from './occupancy-view.js';
const $ = selector => document.querySelector(selector);
const staticMode = $('meta[name="storage-mode"]')?.content === 'browser';
const browserApi = staticMode ? createBrowserApi(localStorage) : null;
const form = $('#booking-form');
for(const input of form.querySelectorAll('.semantic-fields input,.semantic-fields select'))input.tabIndex=-1;
let equipment = [], slots = [], allRecords = [], category = 'all';
let recordsVersion=0;
let cancelRecord = null;
let showroom=null,scene=null,expanded=false,bookingFlow=null;
const today=()=>localDate();
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
function toast(text,failed=false){const box=node('div','toast'),close=node('button','','×');close.innerHTML=icon('close');close.type='button';close.setAttribute('aria-label','关闭通知');close.addEventListener('click',()=>box.remove());box.classList.toggle('is-error',failed);box.append(node('span','',text),close);$('#toasts').replaceChildren(box);setTimeout(()=>box.remove(),6500);}
function notify(text, failed = false) { $('#message').textContent = text; $('#message').classList.toggle('error', failed);toast(text,failed); }
function chosenDate() { return form.elements.date.value || today(); }
function startBooking(input){
 if(bookingFlow?.busy()){toast('正在确认预约，请稍后再选设备',true);return false;}
 try{bookingFlow.start(input);return true;}catch(error){toast(error.message,true);return false;}
}
function selectEquipment(id) {
 const item=equipment.find(row=>row.id===id);if(!item)return;
 if(item.operationalStatus==='maintenance')return notify('这件设备正在维护',true);
 return startBooking({name:item.name,equipmentIds:[id],source:'equipment'});
}
function renderCatalog() {
 const query = $('#search').value.trim().toLowerCase();
 const visible=filterEquipment(equipment,{category,query,scene,status:$('#catalog-status').value,sort:$('#catalog-sort').value,date:chosenDate(),records:allRecords});
 $('#catalog-count').textContent=`${visible.length} 件设备 · ${dateLabel(chosenDate())}`;
 $('#show-more').hidden=visible.length<=9||expanded;
 $('#show-more').replaceChildren(document.createTextNode(`显示全部 ${visible.length} 件设备 `));const moreIcon=node('span','');moreIcon.innerHTML=icon('arrow');$('#show-more').append(moreIcon);
 const grid = $('#equipment'); grid.replaceChildren();
 if (!visible.length) { const empty = node('div','empty'); empty.append(node('b','', '没有找到这件设备。'));const reset=node('button','secondary','查看全部设备');reset.type='button';reset.addEventListener('click',()=>$('#clear-filters').click());empty.append(reset); grid.append(empty); return; }
 for (const item of (expanded?visible:visible.slice(0,9))) {
  const card = node('article',`card${item.id === form.elements.equipmentId.value ? ' selected' : ''}`);
  card.dataset.equipmentId=item.id;
  const art = node('div',`device-art ${item.color}`); art.innerHTML = deviceSvg(item,'card');
  const meta = node('div','card-meta'); meta.append(node('h3','',item.name),node('span','device-code',item.productName));
  const bottom = node('div','card-bottom'); const free = freeSlots(allRecords,chosenDate(),item.id).length;
  const maintenance=item.operationalStatus==='maintenance';
  const tag = node('span',`availability${free === 0 ? ' busy' : ''}`,maintenance?'维护中 · 暂不可预约':free ? `所选日期 · ${free}个空闲时段` : '所选日期已约满');
  const button = node('button','secondary','预约');button.insertAdjacentHTML('beforeend',icon(item.id===form.elements.equipmentId.value?'check':'arrow'));button.disabled=maintenance;
  button.type='button'; button.setAttribute('aria-label',`预约${item.name}`);
  button.addEventListener('click',()=>{selectEquipment(item.id);scrollToBooking();});
  const detail=node('button','text-button','设备详情');detail.type='button';detail.setAttribute('aria-label',`查看${item.name}详情`);detail.addEventListener('click',()=>showroom.openDetail(item));
  const tags=node('div','tags');for(const label of item.tags)tags.append(node('span','pill',label));
  const actions=node('div','card-actions');actions.append(detail,button);bottom.append(tag,actions);
  const sceneCopy=node('div','card-scenes',item.scenes.map(id=>scenes.find(row=>row.id===id)?.name).filter(Boolean).slice(0,2).join(' · '));const info=node('div','card-info');info.append(meta,node('p','',item.description),sceneCopy,tags,bottom);card.append(art,info);grid.append(card);
 }
}
function renderInsights(){
 renderOccupancy($('#occupancy-heatmap'),allRecords,equipment);
 $('#metric-devices').replaceChildren(document.createTextNode(String(equipment.length)),node('small','','件'));
 const date = chosenDate(); const free = equipment.reduce((total,item)=>total+freeSlots(allRecords,date,item.id).length,0);
 $('#metric-free').replaceChildren(document.createTextNode(String(free)),node('small','','个'));
 const mine = visibleReservations(allRecords,form.elements.name.value,true).filter(record=>!reservationStatus(record).expired).length;
 $('#metric-mine').replaceChildren(document.createTextNode(String(mine)),node('small','','条'));
 $('#overview-date').textContent = `${dateLabel(date)} · 共 ${allRecords.length} 项安排`;
 const summary = planSummary(allRecords,today(),equipment);const chart = $('#utilization'); chart.replaceChildren();
 for(const item of [...summary.devices].sort((a,b)=>b.booked-a.booked).slice(0,6)){
  const row = node('div','util-row');const bar = node('div','util-bar'); const fill = node('span');
  fill.style.width=`${Math.min(item.percent,100)}%`;bar.append(fill);row.append(node('span','',item.name),bar,node('small','',item.capacity?`${item.percent}%`:'维护')); row.title=`${item.booked}/${item.capacity}个时段已预约`;chart.append(row);
 }
}
function renderRecords(){
 const records=visibleReservations(allRecords,form.elements.name.value,$('#mine').checked).filter(record=>!reservationStatus(record).expired);
 const list=$('#reservations');list.replaceChildren();$('#reservation-current-count').textContent=records.length?records.length+' 件':'';
 if(!records.length){const empty=node('div','empty');empty.append(node('b','',$('#mine').checked?'你的下一次安排，从这里开始。':'好设备，正在等一个好想法。'),node('span','',$('#mine').checked?'选一件设备，留好时间。':'目前还没有预约记录，试着安排一次创作。'));const explore=node('button','secondary','去选设备');explore.type='button';explore.addEventListener('click',()=>goView('equipment'));empty.append(explore);list.append(empty);return;}
 for(const record of [...records].sort((a,b)=>a.date.localeCompare(b.date)||a.slot.localeCompare(b.slot))){
  const row=node('article','reservation');const detail=node('div','record-detail');const item=equipment.find(item=>item.id===record.equipmentId);
  detail.append(node('strong','',`${item?.name || '设备'} · ${identityName({name:record.name})}`),node('p','',`${dateLabel(record.date)} · ${record.slot}`));
  const status=reservationStatus(record);const badge=node('span',`reservation-status${status.expired?' expired':''}`,status.label);
  const cancel=node('button','cancel','取消预约');cancel.type='button';cancel.setAttribute('aria-label',`取消${record.name}的${record.date}预约`);
  cancel.addEventListener('click',()=>{cancelRecord=record;$('#cancel-description').textContent=`${item?.name || '设备'} · ${dateLabel(record.date)} · ${record.slot}。取消后，这个时段会重新开放。`;$('#cancel-error').textContent='';openDialog($('#cancel-dialog'));$('#cancel-keep').focus();});
  const mark=node('div','record-device');mark.innerHTML=deviceSvg(item,'reservation');const actions=node('div','reservation-current-actions');actions.append(badge,cancel);row.append(mark,detail,actions);list.append(row);
 }
}
function renderAll(){renderCatalog();bookingFlow?.render();renderRecords();renderInsights();}
async function syncRecords({signal}={}){const version=++recordsVersion;return {records:await api('/api/reservations',{signal:signal||AbortSignal.timeout(12000)}),version};}
function setRecords(packet){if(packet.version!==recordsVersion)return false;allRecords=packet.records;return true;}
async function refresh(){const packet=await syncRecords();if(!setRecords(packet))return;renderAll();document.dispatchEvent(new Event('borrow:refresh'));}
function scrollToBooking(){goView('booking');}
$('#cancel-keep').addEventListener('click',()=>$('#cancel-dialog').close());
$('#cancel-dialog').addEventListener('close',()=>{cancelRecord=null;});
$('#cancel-confirm').addEventListener('click',async()=>{
 if(!cancelRecord)return;const button=$('#cancel-confirm');button.disabled=true;
 try{await api(`/api/reservations/${cancelRecord.id}?userId=${encodeURIComponent(form.elements.userId.value)}`,{method:'DELETE'});await refresh();$('#cancel-dialog').close();notify('预约已取消，原时段已释放');}
 catch(error){$('#cancel-error').textContent=error.message;}
 finally{button.disabled=false;}
});
$('#mine').addEventListener('change',renderRecords);
$('#search').addEventListener('input',()=>{expanded=false;renderCatalog();});
for(const id of ['catalog-sort','catalog-status'])$('#'+id).addEventListener('change',()=>{expanded=false;renderCatalog();});
$('#show-more').addEventListener('click',()=>{expanded=true;renderCatalog();});
$('#clear-filters').addEventListener('click',()=>{category='all';scene=null;expanded=false;$('#search').value='';$('#catalog-sort').value='recommended';$('#catalog-status').value='all';renderFilterButtons();renderCatalog();});
$('#categories').addEventListener('click',event=>{
 const button=event.target.closest('[data-category]');if(!button)return;category=button.dataset.category;
 expanded=false;renderFilterButtons();renderCatalog();
});
$('#refresh').addEventListener('click',()=>refresh().then(()=>notify('预约记录已刷新。')).catch(error=>notify(error.message,true)));
document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();$('#search').focus();}});
for(const link of document.querySelectorAll('.nav-link'))link.addEventListener('click',()=>{for(const item of document.querySelectorAll('.nav-link'))item.classList.toggle('active',item===link);});
$('#export').addEventListener('click',async()=>{
 try{const csv=exportCsv(await api('/api/reservations'),equipment);const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
 const link=node('a');link.href=url;link.download='借一下-预约记录.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('已导出当前预约台账。');}
 catch(error){notify(error.message,true);}
});
async function initialize(){
 let environment={demo:false};if(!staticMode){try{environment=await api('/api/environment');}catch{}}
 if(environment.demo){const label=node('aside','demo-environment','独立演示数据');label.setAttribute('role','status');label.title='演示预约保存在独立 SQLite 数据库，不影响日常数据';document.body.append(label);}
 $('#storage-note').textContent=staticMode?'在线演示 · 当前浏览器独立保存预约':'本地演示 · 同机共享预约，姓名筛选不等于登录';
 const catalog=await api('/api/equipment');equipment=catalog.equipment;slots=catalog.slots;
 showroom=mountShowcase({equipment,getRecords:()=>allRecords,getDate:chosenDate,onSelect:id=>{selectEquipment(id);scrollToBooking();},onAccount:account=>{if(bookingFlow?.busy()){notify('正在保存预约，请稍后切换身份。');return false;}form.elements.name.value=account.name;$('#mine').checked=true;renderRecords();renderInsights();},onPlans:()=>{$('#mine').checked=true;renderRecords();goView('reservations');}});
 for(const item of [{id:'all',name:'全部设备'},...categories]){const button=node('button','',item.name);button.type='button';button.dataset.category=item.id;$('#categories').append(button);}
 for(const item of scenes){const button=node('button','scene-card');button.type='button';button.dataset.scene=item.id;button.append(node('b','',item.name),node('span','',item.description));button.addEventListener('click',()=>{scene=scene===item.id?null:item.id;category='all';expanded=false;renderFilterButtons();renderCatalog();$('#equipment-title').scrollIntoView();});$('#scenes').append(button);}renderFilterButtons();
 for(const item of equipment){const option=new Option(item.name+(item.operationalStatus==='maintenance'?'（维护中）':''),item.id);option.disabled=item.operationalStatus==='maintenance';form.elements.equipmentId.add(option);}
 for(const slot of slots)form.elements.slot.add(new Option(slot,slot));
 form.elements.date.min=today();form.elements.date.value='';form.elements.slot.value='';form.elements.equipmentId.value='';await refresh();
 bookingFlow=mountBookingFlow({api,equipment,getRecords:()=>allRecords,syncRecords,setRecords,onUpdated:refresh});
 mountBookingPicker({catalog:equipment,getIntent:()=>bookingFlow.intent(),getUserId:()=>bookingFlow.userId(),getRecords:()=>allRecords,onSelect:(id,replaceId)=>bookingFlow.changeEquipment(id,replaceId),isBusy:()=>bookingFlow.busy()});
 try{const state=await api('/api/ai/status');$('#ai-state').textContent=state.configured?'助手已连接。让AI把台账整理成建议，空闲结果由系统核对。':'助手尚未配置。普通预约不受影响，完成服务端设置后即可使用。';}
 catch{$('#ai-state').textContent=staticMode?'静态演示提供预约体验。AI助手需要连接配置模型的后端。':'暂时无法连接助手，普通预约可继续使用。';}
 await mountProduct({api,equipment,getRecords:()=>allRecords,notify:toast,openDetail:item=>showroom.openDetail(item),startBooking,getBooking:()=>bookingFlow.intent(),setAccount:user=>{bookingFlow.setUser(user);$('#mine').checked=true;renderRecords();renderInsights();},setBooking:(id,date,slot,planId=null)=>startBooking({name:equipment.find(item=>item.id===id)?.name||'设备搭配',equipmentIds:id?[id]:bookingFlow.intent()?.equipmentIds||[],date:date||'',slot:slot||'',planId})});
 $('#ai-state').textContent='告诉我你准备做什么。';
 $('#storage-note').hidden=true;renderAll();
}
function renderFilterButtons(){for(const item of $('#categories').querySelectorAll('button')){const active=item.dataset.category===category;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));}for(const item of $('#scenes').querySelectorAll('button')){const active=item.dataset.scene===scene;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));}}
setInterval(()=>{if(equipment.length){renderRecords();renderInsights();document.dispatchEvent(new Event('borrow:clock-tick'));}},60000);
 initialize().catch(error=>notify(`这次没有连接上。${error.message}`,true));
