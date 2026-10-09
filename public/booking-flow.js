import {bookingIntent,readBooking,saveBooking,validReceipt,changeBookingEquipment} from './booking-intent.js';
import {createSubmission} from './submission.js';
import {slots,localDate} from './booking.js';
import {addDays,commonAvailability,availabilityLabel} from './planning.js';
import {inspectPlan,replacements} from './creative.js';
import {dateLabel} from './plan-state.js';
import {goView,backView,currentView} from './navigation.js';
import {deviceSvg} from './device-art.js';
import {renderReceipt} from './booking-receipt.js';

const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(label,fn,cls='secondary')=>{const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.addEventListener('click',fn);return b;};
// The selected draft and the global ledger version must both still be current.
export function createBookingAvailability({load,commit,key,onState,timeoutMs=12000}){
 let generation=0,controller=null;
 function cancel(){generation++;controller?.abort();controller=null;}
 async function run(){
  cancel();const version=generation,active=new AbortController();controller=active;
  onState({checking:true,error:''});const snapshot=key();
  const current=()=>version===generation&&!active.signal.aborted&&key()===snapshot;
  try{
   const signal=AbortSignal.any([active.signal,AbortSignal.timeout(timeoutMs)]),packet=await load({signal});
   if(!current())return false;
   if(commit(packet)===false){onState({checking:false,error:'空闲信息正在更新，请重新核对'});return false;}
   onState({checking:false,error:''});return true;
  }catch(error){
   if(current())onState({checking:false,error:error.name==='TimeoutError'?'这次核对超时了，请重新尝试':'这次没有核对到空闲时间，请重试'});
   return false;
  }finally{if(version===generation)controller=null;}
 }
 return {run,cancel,acceptFresh(){cancel();onState({checking:false,error:''});}};
}
export function mountBookingFlow({api,equipment,getRecords,syncRecords,setRecords,onUpdated}){
 let user=null,intent=null,weekStart=localDate(),checking=false,error='',storage,receiptTrusted=false,previousView=currentView();
 try{storage=localStorage;}catch{}
 const form=$('#booking-form'),submit=$('#booking-submit');
 const submission=createSubmission((state,problem)=>{submit.dataset.state=state;if(problem)error=['TimeoutError','AbortError'].includes(problem.name)?'这次确认超时了，重试会核对同一次预约':problem instanceof TypeError?'这次没有连接上，重试会核对同一次预约':problem.message;render();});
 const availability=createBookingAvailability({load:syncRecords,commit:setRecords,key:()=>JSON.stringify([user?.id||'',intent?.requestId||'']),onState:state=>{checking=state.checking;error=state.error;render();}});
 const persist=()=>intent&&saveBooking(storage,intent);
 const busy=()=>submission.state()==='loading';
 function checked(){return intent?inspectPlan({...intent,name:intent.name},getRecords(),equipment,{allowPast:true}):null;}
 function forgetReceipt(){if(!receiptTrusted&&intent?.receipt&&!validReceipt(intent,intent.receipt,getRecords())){delete intent.receipt;intent.requestId=crypto.randomUUID();submission.reset();persist();}}
 function refreshAvailability(){return intent?availability.run():Promise.resolve(false);}
 function choose(value){if(busy()||!intent)return;if(Object.entries(value).every(([key,next])=>JSON.stringify(intent[key])===JSON.stringify(next)))return;receiptTrusted=false;intent={...intent,...value,requestId:crypto.randomUUID()};delete intent.receipt;submission.reset();error='';persist();render();void refreshAvailability();}
 function changeEquipment(id,replaceId=null){
  if(busy())throw new Error('预约正在确认，请稍后再更换设备');
  const next=changeBookingEquipment(intent,id,equipment,{userId:user?.id,replaceId,sourceView:intent?.sourceView||'equipment',sourceY:intent?.sourceY??scrollY});
  if(next===intent)return true;availability.cancel();intent=next;receiptTrusted=false;submission.reset();error='';persist();render();void refreshAvailability();return true;
 }
 function start(input){if(busy())throw new Error('预约正在确认，请稍后再试');if(!user)throw new Error('身份尚未加载');const resuming=input.source==='equipment'&&!intent?.receipt&&intent?.source==='equipment'&&intent.userId===user.id&&intent.equipmentIds.length===1&&intent.equipmentIds[0]===input.equipmentIds[0];const value=resuming?{...input,date:input.date??intent.date,slot:input.slot??intent.slot}:input;receiptTrusted=false;intent=bookingIntent(value,user.id,equipment,{sourceView:currentView()||'equipment',sourceY:scrollY});weekStart=intent.date||localDate();error='';submission.reset();persist();goView('booking');render();void refreshAvailability();}
 function setUser(next){const changed=user?.id!==next.id;user=next;form.elements.name.value=user.name;form.elements.userId.value=user.id;if(changed){availability.cancel();checking=false;error='';receiptTrusted=false;intent=readBooking(storage,user.id,equipment);weekStart=intent?.date||localDate();submission.reset();}render();}
 function renderDates(){
  const focused=document.activeElement?.closest('#week,#time-slots')?document.activeElement.getAttribute('aria-label'):null;
  const week=$('#week');week.replaceChildren();$('#week-label').textContent='选择日期';$('#week-prev').disabled=!intent||weekStart<=localDate()||busy();$('#week-next').disabled=!intent||busy();
  const days=intent?commonAvailability(intent,getRecords(),equipment,weekStart):[];
  for(let i=0;i<7;i++){const date=addDays(weekStart,i),moment=days[i]?.best,b=button('',()=>choose({date}),'day'+(intent?.date===date?' selected':''));b.setAttribute('aria-label','选择'+date);b.setAttribute('aria-pressed',String(intent?.date===date));b.disabled=!intent||busy()||date<localDate();b.innerHTML='<strong>'+dateLabel(date)+'</strong><small>'+(moment?esc(availabilityLabel(moment)):intent?'暂无可约时段':'先选设备')+'</small>';week.append(b);}
  const times=$('#time-slots');times.replaceChildren();
  for(const slot of slots){const plan=intent?.date?inspectPlan({...intent,slot},getRecords(),equipment,{allowPast:true}):null,expired=plan?.planState.state==='PAST',conflict=!!plan?.blocked,owned=plan?.reserved===plan?.total&&!!plan?.total,b=button('',()=>choose({slot}),'slot'+(intent?.slot===slot?' selected':'')+(conflict?' full':'')+(owned?' secured':''));b.disabled=busy()||!intent?.date||expired;b.setAttribute('aria-label','选择'+slot);b.setAttribute('aria-pressed',String(intent?.slot===slot));b.innerHTML='<strong>'+slot+'</strong><span>'+(!intent?.date?'先选日期':expired?'已结束':esc(availabilityLabel(plan)))+'</span>';times.append(b);}
  if(focused)[...document.querySelectorAll('#week button,#time-slots button')].find(b=>b.getAttribute('aria-label')===focused&&!b.disabled)?.focus({preventScroll:true});
 }
 function render(){
  if(!user)return;forgetReceipt();const complete=!!intent?.receipt,plan=checked();
  $('.booking-section').classList.toggle('is-complete',complete);$('.booking-head').hidden=complete;$('[data-booking-back]').hidden=complete;$('#booking-empty').hidden=true;$('#booking-schedule').hidden=complete;form.hidden=false;
  const opener=$('#booking-device-open');if(opener){opener.hidden=complete;opener.disabled=busy();opener.textContent=intent?'更换设备':'选择设备';opener.classList.toggle('primary',!intent);opener.classList.toggle('secondary',!!intent);}
  if(!intent){form.elements.equipmentId.value='';form.elements.date.value='';form.elements.slot.value='';form.elements.planId.value='';for(const el of form.querySelectorAll('.form-heading,#booking-summary,#booking-checklist,#message'))el.hidden=false;$('#booking-success').hidden=true;$('#smart-replace-booking').replaceChildren();$('#selection').textContent='还没有选择设备';$('#booking-summary').textContent='';$('#booking-checklist').replaceChildren();submit.hidden=true;submit.disabled=true;$('#message').textContent='';renderDates();return;}
  form.elements.equipmentId.value=intent.equipmentIds[0];form.elements.date.value=intent.date;form.elements.slot.value=intent.slot;form.elements.planId.value=intent.planId||'';
  $('#booking-title').textContent='选一个合适的时间';$('#selection').textContent=intent.name;
  for(const el of form.querySelectorAll('.form-heading,#booking-summary,#booking-checklist,#booking-submit,#message,#smart-replace-booking'))el.hidden=complete;
  $('#booking-success').hidden=!complete;
  if(complete){renderSuccess();return;}
  renderDates();const summary=$('#booking-summary');summary.textContent=(intent.date?dateLabel(intent.date):'日期待定')+(intent.slot?' · '+intent.slot:' · 时段待定');
  const list=$('#booking-checklist');list.replaceChildren();
  for(const item of plan.items){const row=document.createElement('div');row.className='booking-equipment-row';const status=!intent.date||!intent.slot?'等待选择时间':item.secured?'本人已预约':item.available?'可预约':plan.expired?'已结束':'当前时段有冲突';row.innerHTML='<span class="booking-equipment-art">'+deviceSvg(item,'confirmation')+'</span><span><strong>'+esc(item.name)+'</strong><small class="'+(item.available?'is-ready':'')+'">'+status+'</small></span>';list.append(row);}
  submit.innerHTML=busy()?'<span class="thinking-light" aria-hidden="true"></span>正在确认':intent.equipmentIds.length>1?'确认整套预约':'确认预约';
  submit.disabled=busy()||checking||!!error||!intent.date||!intent.slot||plan.expired||plan.blocked>0;
  const message=$('#message');message.classList.toggle('error',!!error);message.textContent=checking?'正在核对空闲时间':error||(plan.blocked&&intent.date&&intent.slot?'这个时段有设备冲突，换个时间或设备即可':!intent.date?'先选日期，再选时段':'');
  message.replaceChildren(document.createTextNode(message.textContent));if(error&&!busy())message.append(button('重试',()=>refreshAvailability(),'text-button'));
  const alternatives=$('#smart-replace-booking');alternatives.replaceChildren();
  if(intent.date&&intent.slot&&!plan.expired)for(const item of plan.items.filter(i=>!i.available)){const match=replacements(item.id,intent.date,intent.slot,getRecords(),equipment,intent.equipmentIds)[0];if(match){alternatives.append(button('将'+item.name+'换成'+match.name,()=>choose({equipmentIds:intent.equipmentIds.map(id=>id===item.id?match.id:id),planId:null}),'text-button'));}}
 }
 function renderSuccess(){const card=$('#booking-success');if(card.dataset.requestId===intent.receipt.requestId)return;renderReceipt(card,intent,equipment,{onReservations:()=>goView('reservations'),onSecondary:()=>intent.planId?backView('plans'):goView('equipment')});card.dataset.requestId=intent.receipt.requestId;}
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!intent||busy()||checking)return;const snapshot={...intent,equipmentIds:[...intent.equipmentIds]},plan=checked();
  if(!snapshot.date||!snapshot.slot||plan.expired||plan.blocked){error='请先选择可预约的日期和时段';render();return;}
  error='';const result=await submission.run(async()=>{const value=await api('/api/reservations/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:snapshot.userId,requestId:snapshot.requestId,name:snapshot.name,equipmentIds:snapshot.equipmentIds,date:snapshot.date,slot:snapshot.slot,planId:snapshot.planId}),signal:AbortSignal.timeout(15000)});if(!validReceipt(snapshot,value))throw new Error('预约结果尚未完整确认，请查看我的预约或重试');return value;});
  const sameRequest=()=>user?.id===snapshot.userId&&intent?.requestId===snapshot.requestId;
  if(result.value&&sameRequest()){
   const confirmed={...snapshot,receipt:result.value};receiptTrusted=true;intent=confirmed;persist();render();$('#booking-success-title')?.focus({preventScroll:true});
   try{await onUpdated();}catch{if(sameRequest())error='预约已确认，列表暂未更新';}
   if(sameRequest())document.dispatchEvent(new CustomEvent('borrow:booked',{detail:confirmed}));
  }else if(result.error&&sameRequest()){
   if(/预约已有变更|预约内容已变化/.test(result.error.message)){intent.requestId=crypto.randomUUID();persist();}
   const problem=error,recoveryUserId=user.id,recoveryRequestId=intent.requestId;await refreshAvailability();
   if(user?.id!==recoveryUserId||intent?.requestId!==recoveryRequestId)return;
   if(!error)error=problem;render();
  }
 });
 $('#week-prev').addEventListener('click',()=>{if(busy())return;weekStart=addDays(weekStart,-7);if(weekStart<localDate())weekStart=localDate();render();});$('#week-next').addEventListener('click',()=>{if(!busy()){weekStart=addDays(weekStart,7);render();}});
 $('[data-booking-back]').addEventListener('click',()=>backView(intent?.sourceView||'equipment',intent?.sourceY));
 document.addEventListener('borrow:view',event=>{const returning=previousView==='booking';previousView=event.detail;if(event.detail==='booking'){render();}else if(returning&&intent&&!intent.receipt&&event.detail===intent.sourceView){document.dispatchEvent(new CustomEvent('borrow:booking-return',{detail:intent}));}});
 window.addEventListener('pagehide',persist);
 document.addEventListener('borrow:refresh',()=>{receiptTrusted=false;availability.acceptFresh();});
 return {start,setUser,render,busy,changeEquipment,intent:()=>intent,userId:()=>user?.id||null};
}
