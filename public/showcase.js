import { heroSlides } from './catalog.js';
import { deviceSvg } from './device-art.js';
import { createCarousel } from './carousel.js';
import { loadPreferences,savePreferences,previewAccounts } from './preferences.js';
const $=selector=>document.querySelector(selector);
function node(tag,className,text){const item=document.createElement(tag);item.className=className||'';if(text!==undefined)item.textContent=text;return item;}
export function mountShowcase({equipment,onSelect,onAccount,onPlans}){
 let storage;try{storage=localStorage;}catch{storage=null;}
 let preferences=loadPreferences(storage),detail=null;const media=matchMedia('(prefers-reduced-motion: reduce)');
 const reduced=()=>media.matches||preferences.reduceMotion;
 function closeDialog(dialog){if(reduced()){dialog.close();return;}dialog.classList.add('closing');setTimeout(()=>{dialog.close();dialog.classList.remove('closing');},parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--duration-base'))||240);}
 const slides=heroSlides.filter(slide=>equipment.some(item=>item.id===slide.equipmentId));
 function renderSlide(index,manual=false){
  const slide=slides[index],item=equipment.find(item=>item.id===slide.equipmentId);
  $('#hero-title').textContent=slide.title;$('#hero-label').textContent='BORROW LAB / '+slide.label;$('#hero-description').textContent=slide.description;
  $('#hero-art').innerHTML=deviceSvg(item,'hero');$('#hero-art').append(node('span','hero-code',item.model+' / ORIGINAL EQUIPMENT EDIT'));
  $('#hero-book').textContent='预约'+item.name+' ↗';$('#hero-book').dataset.equipmentId=item.id;
  for(const [i,button]of [...$('#hero-nav').children].entries())button.setAttribute('aria-pressed',String(i===index));
  if(manual)$('#hero-announcement').textContent=`第${index+1}款，共${slides.length}款：${item.name}`;
  if(!reduced())for(const element of [$('#hero-copy'),$('#hero-art')]){for(const animation of element.getAnimations())animation.cancel();const tokens=getComputedStyle(document.documentElement);element.animate([{opacity:.2,transform:`translateY(${tokens.getPropertyValue('--hero-enter-offset').trim()})`},{opacity:1,transform:'none'}],{duration:parseFloat(tokens.getPropertyValue('--duration-slow')),easing:tokens.getPropertyValue('--ease-out').trim()});}
 }
 let controller;
 for(const [index,slide]of slides.entries()){
  const item=equipment.find(item=>item.id===slide.equipmentId),button=node('button');button.type='button';button.setAttribute('aria-label',`展示${item.name}`);button.append(node('b','',item.model),node('span','',slide.label));button.addEventListener('click',()=>controller.go(index));$('#hero-nav').append(button);
 }
 controller=createCarousel({count:slides.length,onChange:renderSlide,onState:state=>{
  const stopped=state.reasons.includes('manual')||state.reasons.includes('user');
  $('#hero-playback').textContent=reduced()?'减弱动画':state.paused?'已暂停':'自动播放';$('#hero-pause').textContent=stopped?'▶':'Ⅱ';$('#hero-pause').setAttribute('aria-label',stopped?'继续自动轮播':'暂停自动轮播');$('#hero-pause').disabled=reduced();
 }});
 function applyPreferences(){
  document.documentElement.dataset.font=preferences.font;document.documentElement.dataset.motion=reduced()?'reduce':'normal';$('#motion-reduce').checked=preferences.reduceMotion;
  for(const button of $('#font-options').children)button.setAttribute('aria-pressed',String(button.dataset.font===preferences.font));
  controller.pause('reduced',reduced());if(reduced())for(const element of [$('#hero-copy'),$('#hero-art')])for(const animation of element.getAnimations())animation.cancel();
 }
 function updatePreferences(value){const result=savePreferences(storage,{...preferences,...value});preferences=result.value;applyPreferences();$('#preference-message').textContent=result.saved?'阅读偏好已保存在本机。':'当前浏览器无法保存偏好，已在本次页面生效。';}
 applyPreferences();renderSlide(0);controller.pause('hidden',document.hidden);
 $('#hero-prev').addEventListener('click',()=>controller.previous());$('#hero-next').addEventListener('click',()=>controller.next());
 $('#hero-pause').addEventListener('click',()=>{const stopped=controller.state().reasons.some(reason=>['manual','user'].includes(reason));controller.pause('manual',false);controller.pause('user',!stopped);});
 $('#hero').addEventListener('mouseenter',()=>controller.pause('hover'));$('#hero').addEventListener('mouseleave',()=>controller.pause('hover',false));
 $('#hero').addEventListener('focusin',()=>controller.pause('focus'));$('#hero').addEventListener('focusout',event=>{if(!$('#hero').contains(event.relatedTarget))controller.pause('focus',false);});
 $('#hero').addEventListener('keydown',event=>{if(['INPUT','SELECT'].includes(event.target.tagName))return;if(event.key==='ArrowRight'){event.preventDefault();controller.next();}if(event.key==='ArrowLeft'){event.preventDefault();controller.previous();}});
 document.addEventListener('visibilitychange',()=>controller.pause('hidden',document.hidden));media.addEventListener('change',applyPreferences);window.addEventListener('pagehide',()=>controller.dispose());
 $('#hero-book').addEventListener('click',()=>onSelect($('#hero-book').dataset.equipmentId));
 for(const button of $('[aria-label="字体大小"]').children)button.addEventListener('click',()=>updatePreferences({font:button.dataset.font}));
 $('#motion-reduce').addEventListener('change',()=>updatePreferences({reduceMotion:$('#motion-reduce').checked}));
 $('#profile-open').addEventListener('click',()=>$('#profile-dialog').showModal());
 for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>closeDialog($('#'+button.dataset.close)));
 for(const dialog of [$('#profile-dialog'),$('#detail-dialog'),$('#cancel-dialog')])dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog);});
 function renderAccount(active){
  $('#accounts').replaceChildren();$('#profile-avatar').textContent=active.avatar;$('#profile-name').textContent=active.name;$('#panel-avatar').textContent=active.avatar;$('#panel-name').textContent=active.name;$('#panel-role').textContent=active.role+' · 本地身份预览';
  for(const account of previewAccounts){const button=node('button','account-card'+(active.id===account.id?' active':''));button.type='button';button.setAttribute('aria-pressed',String(active.id===account.id));button.setAttribute('aria-label','切换为'+account.name);const title=node('span');title.append(node('b','',account.name),node('small','',account.role));button.append(node('span','avatar',account.avatar),title);button.addEventListener('click',()=>{if(onAccount(account)!==false){renderAccount(account);$('#accounts .active').focus();}});$('#accounts').append(button);}
 }
 renderAccount(previewAccounts[0]);
 $('#profile-plans').addEventListener('click',()=>{closeDialog($('#profile-dialog'));onPlans();});
 $('#detail-book').addEventListener('click',()=>{if(detail&&detail.operationalStatus!=='maintenance'){closeDialog($('#detail-dialog'));onSelect(detail.id);}});
 return {openDetail(item){
  detail=item;$('#detail-title').textContent=item.name;const content=$('#detail-content');content.replaceChildren();const art=node('div','detail-art');art.innerHTML=deviceSvg(item,'detail');const tags=node('div','tags');for(const tag of item.tags)tags.append(node('span','pill',tag));const specs=node('div','detail-grid');for(const spec of item.specs)specs.append(node('div','detail-spec',spec));content.append(art,node('p','eyebrow',item.model+' / 原创演示配置'),node('p','',item.description),specs,tags,node('p','fine-print','实际空闲以所选日期与预约台账为准。设备外观为原创示意图。'));$('#detail-book').disabled=item.operationalStatus==='maintenance';$('#detail-book').textContent=item.operationalStatus==='maintenance'?'设备维护中':'预约这件设备 ↗';$('#detail-dialog').showModal();
 }};
}
