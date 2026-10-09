import {categories} from './catalog.js';
import {filterEquipment} from './catalog-view.js';
import {localDate} from './booking.js';
import {inspectPlan} from './creative.js';
import {deviceSvg} from './device-art.js';
import {openDialog} from './navigation.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const makeButton=(text,fn,className='secondary')=>{const button=document.createElement('button');button.type='button';button.className=className;button.textContent=text;button.addEventListener('click',fn);return button;};
export function mountBookingPicker({catalog,getIntent,getUserId,getRecords,onSelect,isBusy=()=>false}){
 const dialog=document.querySelector('#booking-device-dialog'),query=document.querySelector('#booking-device-query'),categoryList=document.querySelector('#booking-device-categories'),grid=document.querySelector('#booking-device-grid');
 if(!dialog||!query||!categoryList||!grid)throw new Error('设备选择器尚未初始化');
 let session=null,category='all';
 const key=()=>JSON.stringify([getUserId(),getIntent()?.requestId||'']);
 const targets=document.createElement('div');targets.className='booking-device-targets';query.closest('label').before(targets);
 const status=document.createElement('p');status.className='booking-device-message';status.setAttribute('role','status');grid.after(status);
 const close=()=>{if(dialog.open)dialog.close();session=null;};
 function renderTargets(){
  targets.replaceChildren();const intent=getIntent();targets.hidden=!intent||intent.equipmentIds.length<2;
  if(targets.hidden)return;
  const label=document.createElement('span');label.textContent='更换哪一件';targets.append(label);
  for(const id of intent.equipmentIds){const item=catalog.find(row=>row.id===id),button=makeButton(item?.name||'设备',()=>{session.replaceId=id;renderTargets();render();},'ghost');button.setAttribute('aria-pressed',String(session.replaceId===id));targets.append(button);}
 }
 function renderCategories(){
  categoryList.replaceChildren();for(const row of [{id:'all',name:'全部设备'},...categories]){const button=makeButton(row.name,()=>{category=row.id;renderCategories();render();},'filter-chip');button.setAttribute('aria-pressed',String(row.id===category));categoryList.append(button);}
 }
 function render(){
  if(!session)return;grid.replaceChildren();status.textContent='';const intent=getIntent(),records=getRecords(),date=intent?.date||localDate();
  const rows=filterEquipment(catalog,{category,query:query.value,date,records,sort:'name'});
  for(const item of rows){
   const original=session.replaceId||intent?.equipmentIds[0],chosen=original===item.id,elsewhere=!!intent?.equipmentIds.includes(item.id)&&!chosen,maintenance=item.operationalStatus!=='active';
   const card=document.createElement('article');card.className='booking-device-card'+(chosen?' is-selected':'');
   let availability='选好时间，再查看空闲',ready=false;
   if(maintenance)availability='维护中 · 暂不可预约';
   else if(intent?.date&&intent?.slot){const checked=inspectPlan({userId:getUserId(),date:intent.date,slot:intent.slot,equipmentIds:[item.id]},records,catalog,{allowPast:true}).items[0];availability=checked.reason;ready=checked.available;}
   card.innerHTML=`<div class="booking-device-art">${deviceSvg(item,'booking-picker')}</div><div class="booking-device-copy"><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><span class="booking-device-state${ready?' is-ready':''}">${esc(availability)}</span></div>`;
   const button=makeButton(maintenance?'维护中':chosen?'当前设备':elsewhere?'已在本次预约中':'选择这件设备',()=>{
    if(isBusy())return;
    if(!session||key()!==session.key){status.textContent='预约内容已经更新，请重新打开设备选择';return;}
    try{if(onSelect(item.id,session.replaceId)!==false)close();}catch(error){status.textContent=error.message;}
   });button.disabled=maintenance||chosen||elsewhere||isBusy();card.append(button);grid.append(card);
  }
  if(!rows.length){const empty=document.createElement('div');empty.className='booking-device-empty';const title=document.createElement('h3');title.textContent='没有找到这件设备';empty.append(title,makeButton('查看全部',()=>{query.value='';category='all';renderCategories();render();},'text-button'));grid.append(empty);}
 }
 function open({replaceId=null}={}){
  if(isBusy())return false;const intent=getIntent(),userId=getUserId();if(!userId)throw new Error('身份尚未加载');
  if(intent?.receipt)throw new Error('这次预约已经完成，请开始新的预约');
  if(replaceId&&!intent?.equipmentIds.includes(replaceId))throw new Error('请选择当前预约中的设备');
  session={key:key(),replaceId:replaceId||intent?.equipmentIds[0]||null};category='all';query.value='';renderTargets();renderCategories();render();openDialog(dialog);query.focus({preventScroll:true});return true;
 }
 query.addEventListener('input',render);dialog.addEventListener('close',()=>{session=null;});
 document.querySelector('#booking-device-open')?.addEventListener('click',()=>open());
 document.addEventListener('borrow:identity-changing',close);document.addEventListener('borrow:booked',close);
 return {open,close};
}
