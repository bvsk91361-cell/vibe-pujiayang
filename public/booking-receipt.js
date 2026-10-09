import {validReceipt} from './booking-intent.js';
import {dateLabel} from './plan-state.js';
import {creativeScenes} from './creative.js';
import {deviceSvg} from './device-art.js';
import {brandSymbol,icon} from './icons.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function receiptDetails(intent,catalog){
 if(!validReceipt(intent,intent?.receipt))throw new Error('预约结果尚未完整确认');
 const equipment=intent.equipmentIds.map(id=>catalog.find(item=>item.id===id));
 if(equipment.some(item=>!item))throw new Error('预约设备信息需要重新核对');
 const scene=creativeScenes.find(item=>item.id===intent.sceneId);
 const source=intent.planId?(intent.receipt.records.find(item=>item.planName)?.planName||intent.name):scene?.name||null;
 return {equipment,date:intent.receipt.date,slot:intent.receipt.slot,source,records:intent.receipt.records};
}
export function renderReceipt(card,intent,catalog,{onReservations,onSecondary}){
 const details=receiptDetails(intent,catalog);
 card.replaceChildren();card.classList.remove('success-card');card.classList.add('reservation-receipt');
 const head=document.createElement('div');head.className='receipt-heading';
 head.innerHTML='<div class="receipt-seal" aria-hidden="true"><svg class="receipt-orbit" viewBox="0 0 120 120"><circle cx="60" cy="60" r="55"/></svg>'+brandSymbol+'<span class="receipt-check">'+icon('check')+'</span></div><h3 id="booking-success-title" class="receipt-title" tabindex="-1">灵感有约</h3><p class="receipt-copy">设备与时间，已为你预留</p>';
 const summary=document.createElement('section');summary.className='receipt-summary';summary.setAttribute('aria-label','已确认的预约摘要');
 const timing=document.createElement('div');timing.className='receipt-timing';
 timing.innerHTML='<div>'+icon('calendar')+'<span><small>日期</small><time datetime="'+details.date+'">'+esc(dateLabel(details.date,{relative:false,weekday:true}))+'</time></span></div><div>'+icon('clock')+'<span><small>时段</small><strong>'+esc(details.slot)+'</strong></span></div>';
 const equipment=document.createElement('ul');equipment.className='receipt-equipment';equipment.dataset.count=details.equipment.length;
 for(const item of details.equipment){const row=document.createElement('li'),record=details.records.find(row=>row.equipmentId===item.id);row.innerHTML='<span class="receipt-device-art" aria-hidden="true">'+deviceSvg(item,'receipt')+'</span><span class="receipt-device-copy"><strong>'+esc(item.name)+'</strong><small>预约编号 <span>'+esc(record.id)+'</span></small></span>';equipment.append(row);}
 summary.append(timing,equipment);
 if(details.source){const source=document.createElement('p');source.className='receipt-source';source.textContent=details.source;summary.append(source);}
 const actions=document.createElement('div');actions.className='receipt-actions';
 const primary=document.createElement('button');primary.type='button';primary.className='primary';primary.innerHTML='查看我的预约 '+icon('arrow');primary.addEventListener('click',onReservations);actions.append(primary);
 if(intent.planId&&onSecondary){const secondary=document.createElement('button');secondary.type='button';secondary.className='text-button';secondary.textContent='返回创作方案';secondary.addEventListener('click',onSecondary);actions.append(secondary);}
 card.append(head,summary,actions);
}
