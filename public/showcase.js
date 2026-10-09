import {heroSlides} from './catalog.js';
import {createCarousel} from './carousel.js';
import {loadPreferences,savePreferences} from './preferences.js';
import {icon,brandSymbol} from './icons.js';
import {goView,openDialog,closeDialog as closeSurface} from './navigation.js';
import {renderDetail} from './detail-view.js';
const $=selector=>document.querySelector(selector);
export function mountShowcase({equipment,onSelect,onPlans,getRecords=()=>[],getDate=()=>''}){
 let storage;try{storage=localStorage;}catch{}
 let preferences=loadPreferences(storage),detail=null,detailContext=null;const media=matchMedia('(prefers-reduced-motion: reduce)'),colorMedia=matchMedia('(prefers-color-scheme: dark)');
 const detailTitle=$('#detail-title'),detailExtra=$('#detail-extra');
 const reduced=()=>media.matches||preferences.reduceMotion;
 const capable=!(navigator.connection?.saveData||(navigator.deviceMemory&&navigator.deviceMemory<=4)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4));
 document.documentElement.dataset.effects=capable?'full':'quiet';
 const slides=heroSlides.filter(slide=>equipment.some(item=>item.id===slide.equipmentId));
 const tones={camera:'blue',gimbal:'blue',drone:'teal',microphone:'rose',projector:'ice',capture:'violet'};
 function renderSlide(index,manual=false){
  const slide=slides[index],item=equipment.find(item=>item.id===slide.equipmentId);$('#hero-title').textContent=slide.title;$('#hero-label').textContent=slide.label;$('#hero-description').textContent=slide.description;$('#hero').dataset.tone=tones[item.category]||'blue';
  $('#hero-art').replaceChildren();const poster=document.createElement('img');poster.src='/assets/hero-'+slide.visual+'.webp';poster.alt='';poster.width=1536;poster.height=1024;poster.decoding='async';poster.fetchPriority=index===0?'high':'auto';$('#hero-art').append(poster);$('#hero-book').innerHTML='立即选设备 '+icon('arrow');$('#hero-book').dataset.equipmentId=item.id;
  for(const [i,button]of [...$('#hero-nav').children].entries())button.setAttribute('aria-pressed',String(i===index));
  if(manual)$('#hero-announcement').textContent=`${index+1}/${slides.length}：${slide.label}`;
  if(!reduced()){
   const tokens=getComputedStyle(document.documentElement),duration=parseFloat(tokens.getPropertyValue('--motion-hero'))||900;
   for(const element of [$('#hero-copy'),$('#hero-art')])for(const animation of element.getAnimations())animation.cancel();
   $('#hero-art').animate([{opacity:.6,transform:'translateX(24px) rotateY(-5deg) scale(.96)'},{opacity:1,transform:'none'}],{duration,easing:tokens.getPropertyValue('--ease-out').trim()});
   [...$('#hero-copy').children].forEach((element,index)=>element.animate([{opacity:.65,transform:'translateY(18px)'},{opacity:1,transform:'none'}],{duration:650,delay:index*70,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'}));
  }
 }
 let controller;
 for(const [index,slide]of slides.entries()){const button=document.createElement('button');button.type='button';button.textContent=slide.label;button.setAttribute('aria-label','展示'+slide.label);const progress=document.createElement('span');progress.className='theme-progress';progress.setAttribute('aria-hidden','true');button.append(progress);button.addEventListener('click',()=>controller.go(index));$('#hero-nav').append(button);}
 controller=createCarousel({count:slides.length,interval:5000,resumeOnInteraction:true,onChange:renderSlide,onState:state=>{if(!$('#hero-playback'))return;$('#hero-playback').textContent=state.paused?'轮播已暂停':'每5秒切换';$('#hero').dataset.autoplay=state.paused?'paused':'running';for(const [i,tab]of [...$('#hero-nav').children].entries()){const progress=tab.querySelector('.theme-progress');for(const animation of progress.getAnimations())animation.cancel();if(i===state.index&&!state.paused)progress.animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:5000,fill:'forwards',easing:'linear'});}}});
 function applyPreferences(){document.documentElement.dataset.font=preferences.font;document.documentElement.dataset.motion=reduced()?'reduce':'normal';const theme=preferences.theme||'auto';document.documentElement.dataset.theme=theme==='auto'?(colorMedia.matches?'dark':'light'):theme;$('#motion-reduce').checked=preferences.reduceMotion;for(const button of $('#font-options').children)button.setAttribute('aria-pressed',String(button.dataset.font===preferences.font));for(const button of $('#theme-options').children)button.setAttribute('aria-pressed',String(button.dataset.theme===theme));controller.pause('reduced',reduced());if(reduced())for(const element of [$('#hero-copy'),$('#hero-art')])for(const animation of element.getAnimations())animation.cancel();}
 function updatePreferences(value){preferences={...preferences,...value};savePreferences(storage,preferences);applyPreferences();document.dispatchEvent(new CustomEvent('borrow:preferences',{detail:value}));}
 document.addEventListener('borrow:prefs',event=>{preferences={...preferences,...event.detail};applyPreferences();});
 applyPreferences();renderSlide(0);controller.pause('hidden',document.hidden);

 let pointer=null,frame=null;
 $('#hero').addEventListener('pointerdown',event=>{if(!event.target.closest('button,a'))pointer={x:event.clientX,y:event.clientY};});$('#hero').addEventListener('pointerup',event=>{if(!pointer)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy))dx<0?controller.next():controller.previous();pointer=null;});
 $('#hero').addEventListener('pointermove',event=>{if(reduced()||!capable||event.pointerType!=='mouse'||frame)return;const bounds=$('#hero').getBoundingClientRect();const x=(event.clientX-bounds.left)/bounds.width-.5,y=(event.clientY-bounds.top)/bounds.height-.5;frame=requestAnimationFrame(()=>{$('#hero-art').style.setProperty('--tilt-x',(-y*5)+'deg');$('#hero-art').style.setProperty('--tilt-y',(x*7)+'deg');$('#hero').style.setProperty('--pointer-x',((x+.5)*100)+'%');frame=null;});});$('#hero').addEventListener('pointerleave',()=>{$('#hero-art').style.setProperty('--tilt-x','0deg');$('#hero-art').style.setProperty('--tilt-y','0deg');});
 window.addEventListener('scroll',()=>{if(!reduced()&&capable&&document.body.dataset.view==='discover')$('#hero-art').style.setProperty('--depth',Math.min(scrollY*.14,80)+'px');},{passive:true});
 document.addEventListener('visibilitychange',()=>controller.pause('hidden',document.hidden));media.addEventListener('change',applyPreferences);colorMedia.addEventListener('change',applyPreferences);document.addEventListener('borrow:view',event=>controller.pause('view',event.detail!=='discover'));window.addEventListener('pagehide',()=>controller.dispose());
 $('#hero').addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();controller.next();}if(event.key==='ArrowLeft'){event.preventDefault();controller.previous();}});$('#hero-book').addEventListener('click',()=>goView('equipment'));
 for(const button of $('#font-options').children)button.addEventListener('click',()=>updatePreferences({font:button.dataset.font}));$('#motion-reduce').addEventListener('change',()=>updatePreferences({reduceMotion:$('#motion-reduce').checked}));
 function closeDialog(dialog){closeSurface(dialog,{reduce:reduced()});}
 for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>closeDialog($('#'+button.dataset.close)));
 for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog);});let y=null,outside=false;const isOutside=event=>{const box=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom);};dialog.addEventListener('pointerdown',event=>{outside=isOutside(event);});dialog.addEventListener('click',event=>{if(outside&&isOutside(event))closeDialog(dialog);outside=false;});const handle=dialog.querySelector('.sheet-handle');handle?.addEventListener('pointerdown',event=>{y=event.clientY;handle.setPointerCapture(event.pointerId);});handle?.addEventListener('pointerup',event=>{if(y!==null&&event.clientY-y>50)closeDialog(dialog);y=null;});}
 $('#detail-book').addEventListener('click',()=>{if(detail&&detail.operationalStatus!=='maintenance'){closeDialog($('#detail-dialog'));onSelect(detail.id);}});
 $('#detail-dialog').addEventListener('close',()=>{const context=detailContext;requestAnimationFrame(()=>{if(context&&document.body.dataset.view===context.view)window.scrollTo({top:context.y,behavior:'instant'});});});
 return {openDetail(item){detailContext={view:document.body.dataset.view,y:scrollY};detail=item;renderDetail({content:$('#detail-content'),title:detailTitle,extra:detailExtra,item,date:getDate(),records:getRecords()});$('#detail-book').disabled=item.operationalStatus==='maintenance';$('#detail-book').textContent=item.operationalStatus==='maintenance'?'维护中':'预约此设备';openDialog($('#detail-dialog'));document.dispatchEvent(new CustomEvent('borrow:detail',{detail:item}));}};
}
