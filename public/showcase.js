import {heroSlides} from './catalog.js';
import {createCarousel} from './carousel.js';
import {loadPreferences,savePreferences} from './preferences.js';
import {icon,brandSymbol} from './icons.js';
import {goView,openDialog,closeDialog as closeSurface} from './navigation.js';
import {renderDetail} from './detail-view.js';
import {animate as motionAnimate} from './vendor/motion-dom.js';
import {gsap} from './vendor/gsap.min.js';
const $=selector=>document.querySelector(selector);
const heroStories={
 cinema:{word:'影像',line:'从一个想法，到你的下一部作品。',question:'我准备拍摄校园短片，请推荐一套相机、镜头和补光设备。'},
 vlog:{word:'随行',line:'轻装出发，把日常拍成你的风格。',question:'我想轻便记录日常，请帮我配一套适合随身拍摄的设备。'},
 outdoor:{word:'远行',line:'换一个高度，看见更大的世界。',question:'我准备进行户外航拍，请推荐一套轻便的设备搭配。'},
 voice:{word:'声场',line:'让每一段对话，都有清晰的表达。',question:'我准备录制双人对谈，请推荐一套收音清晰的设备。'},
 presentation:{word:'映现',line:'把准备好的作品，带到更大的画面。',question:'我准备做课堂作品展示，请推荐一套投影和演示设备。'}
};
export function mountShowcase({equipment,onSelect,onPlans,getRecords=()=>[],getDate=()=>''}){
 let storage;try{storage=localStorage;}catch{}
 let preferences=loadPreferences(storage),detail=null,detailContext=null;const media=matchMedia('(prefers-reduced-motion: reduce)'),colorMedia=matchMedia('(prefers-color-scheme: dark)');
 const detailTitle=$('#detail-title'),detailExtra=$('#detail-extra');
 let osReduced=media.matches;
 const reduced=()=>osReduced||preferences.reduceMotion;
 const capable=!(navigator.connection?.saveData||(navigator.deviceMemory&&navigator.deviceMemory<=4)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4));
 document.documentElement.dataset.effects=capable?'full':'quiet';
 const slides=heroSlides.filter(slide=>equipment.some(item=>item.id===slide.equipmentId));
 let slideVersion=0;
 const sceneLabel=label=>label.replace(/\s*Vlog/gi,'记录');
 function cancelHeroEntrance(){for(const element of [$('#hero-copy'),$('#hero-art'),$('#hero-stage-word'),$('.hero-stage-trails')])for(const animation of element.getAnimations())animation.cancel();}
 async function renderSlide(index,manual=false){
  const version=++slideVersion,slide=slides[index],item=equipment.find(item=>item.id===slide.equipmentId);
  const poster=document.createElement('img');poster.src='/assets/hero-'+slide.visual+'.webp';poster.alt='';poster.width=1536;poster.height=1024;poster.decoding='async';poster.fetchPriority=index===0?'high':'auto';
  try{await poster.decode();}catch{if($('#hero-art').childElementCount)return;}
  if(version!==slideVersion)return;
  const story=heroStories[slide.visual];
  $('#hero-title').textContent='让设备\n跟上你的想法';$('#hero-label').textContent=sceneLabel(slide.label);$('#hero-description').textContent=story.line;$('#hero').dataset.tone='blue';$('#hero').dataset.scene=slide.visual;
  $('#hero-stage-word').textContent=story.word;$('#hero-advisor').dataset.question=story.question;
  $('#hero-art').replaceChildren(poster);$('#hero-book').innerHTML='开始找设备 '+icon('arrow');$('#hero-book').dataset.equipmentId=item.id;
  for(const [i,button]of [...$('#hero-nav').children].entries())button.setAttribute('aria-pressed',String(i===index));
  if(manual)$('#hero-announcement').textContent=`${index+1}/${slides.length}：${sceneLabel(slide.label)}`;
  if(!reduced()&&!document.hidden&&document.body.dataset.view==='discover'){
   const tokens=getComputedStyle(document.documentElement),duration=parseFloat(tokens.getPropertyValue('--motion-hero'))||900;
   cancelHeroEntrance();
   $('#hero-art').animate([{opacity:.6,transform:'translateX(18px)'},{opacity:1,transform:'none'}],{duration,easing:tokens.getPropertyValue('--ease-out').trim()});
   $('#hero-stage-word').animate([{opacity:0,transform:'translateX(25px)'},{opacity:1,transform:'none'}],{duration:850,easing:'cubic-bezier(.16,1,.3,1)'});
   $('.hero-stage-trails').animate([{opacity:.12,transform:'rotate(-6deg) scale(.94)'},{opacity:1,transform:'rotate(0deg) scale(1)'}],{duration:1100,easing:'cubic-bezier(.16,1,.3,1)'});
   if(index===0)$('#hero-copy').animate([{opacity:0,transform:'translateY(20px)'},{opacity:1,transform:'none'}],{duration:500,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
 }
 let controller;
 for(const [index,slide]of slides.entries()){const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','展示'+sceneLabel(slide.label));const label=document.createElement('span');label.textContent=sceneLabel(slide.label);const progress=document.createElement('span');progress.className='theme-progress';progress.setAttribute('aria-hidden','true');button.append(label,progress);button.addEventListener('click',()=>controller.go(index));$('#hero-nav').append(button);}
 controller=createCarousel({count:slides.length,interval:5000,resumeOnInteraction:true,onChange:renderSlide,onState:state=>{if(!$('#hero-playback'))return;$('#hero-playback').textContent=state.paused?'轮播已暂停':'每5秒切换';$('#hero').dataset.autoplay=state.paused?'paused':'running';for(const [i,tab]of [...$('#hero-nav').children].entries()){const progress=tab.querySelector('.theme-progress');for(const animation of progress.getAnimations())animation.cancel();if(i===state.index&&!state.paused)progress.animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:5000,fill:'forwards',easing:'linear'});}}});
 function applyPreferences(){document.documentElement.dataset.font=preferences.font;document.documentElement.dataset.motion=reduced()?'reduce':'normal';const theme=preferences.theme||'auto';document.documentElement.dataset.theme=theme==='auto'?(colorMedia.matches?'dark':'light'):theme;$('#motion-reduce').checked=preferences.reduceMotion;for(const button of $('#font-options').children)button.setAttribute('aria-pressed',String(button.dataset.font===preferences.font));for(const button of $('#theme-options').children)button.setAttribute('aria-pressed',String(button.dataset.theme===theme));controller.pause('reduced',reduced());if(reduced())cancelHeroEntrance();}
 function updatePreferences(value){preferences={...preferences,...value};savePreferences(storage,preferences);applyPreferences();document.dispatchEvent(new CustomEvent('borrow:preferences',{detail:value}));}
 document.addEventListener('borrow:prefs',event=>{preferences={...preferences,...event.detail};applyPreferences();});
 applyPreferences();renderSlide(0);controller.pause('hidden',document.hidden);

 let pointer=null,frame=null;
 $('#hero').addEventListener('pointerdown',event=>{if(!event.target.closest('button,a'))pointer={x:event.clientX,y:event.clientY};});$('#hero').addEventListener('pointerup',event=>{if(!pointer)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy))dx<0?controller.next():controller.previous();pointer=null;});
 $('#hero').addEventListener('pointermove',event=>{if(reduced()||!capable||event.pointerType!=='mouse'||frame)return;const bounds=$('#hero').getBoundingClientRect();const x=(event.clientX-bounds.left)/bounds.width-.5,y=(event.clientY-bounds.top)/bounds.height-.5;frame=requestAnimationFrame(()=>{$('#hero-art').style.setProperty('--tilt-x',(-y*5)+'deg');$('#hero-art').style.setProperty('--tilt-y',(x*7)+'deg');$('#hero').style.setProperty('--pointer-x',((x+.5)*100)+'%');frame=null;});});$('#hero').addEventListener('pointerleave',()=>{$('#hero-art').style.setProperty('--tilt-x','0deg');$('#hero-art').style.setProperty('--tilt-y','0deg');});
 window.addEventListener('scroll',()=>{if(!reduced()&&capable&&document.body.dataset.view==='discover')$('#hero-art').style.setProperty('--depth',Math.min(scrollY*.14,80)+'px');},{passive:true});
 document.addEventListener('visibilitychange',()=>{controller.pause('hidden',document.hidden);if(document.hidden)cancelHeroEntrance();});media.addEventListener('change',event=>{osReduced=event.matches;applyPreferences();});colorMedia.addEventListener('change',applyPreferences);document.addEventListener('borrow:view',event=>{controller.pause('view',event.detail!=='discover');if(event.detail!=='discover')cancelHeroEntrance();});window.addEventListener('pagehide',event=>{cancelHeroEntrance();if(event.persisted)controller.pause('hidden',true);else controller.dispose();});window.addEventListener('pageshow',event=>{if(event.persisted)controller.pause('hidden',document.hidden);});
 mountProductMotion({hero:$('#hero'),reduced,capable,media});
 $('#hero').addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();controller.next();}if(event.key==='ArrowLeft'){event.preventDefault();controller.previous();}});$('#hero-book').addEventListener('click',()=>goView('equipment'));
 $('#hero-advisor').addEventListener('click',()=>document.dispatchEvent(new CustomEvent('borrow:advisor-entry',{detail:{question:$('#hero-advisor').dataset.question||heroStories.cinema.question}})));
 for(const button of $('#font-options').children)button.addEventListener('click',()=>updatePreferences({font:button.dataset.font}));$('#motion-reduce').addEventListener('change',()=>updatePreferences({reduceMotion:$('#motion-reduce').checked}));
 function closeDialog(dialog){closeSurface(dialog,{reduce:reduced()});}
 for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>closeDialog($('#'+button.dataset.close)));
 for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog);});let y=null,outside=false;const isOutside=event=>{const box=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom);};dialog.addEventListener('pointerdown',event=>{outside=isOutside(event);});dialog.addEventListener('click',event=>{if(outside&&isOutside(event))closeDialog(dialog);outside=false;});const handle=dialog.querySelector('.sheet-handle');handle?.addEventListener('pointerdown',event=>{y=event.clientY;handle.setPointerCapture(event.pointerId);});handle?.addEventListener('pointerup',event=>{if(y!==null&&event.clientY-y>50)closeDialog(dialog);y=null;});}
 $('#detail-book').addEventListener('click',()=>{if(detail&&detail.operationalStatus!=='maintenance'){closeDialog($('#detail-dialog'));onSelect(detail.id);}});
 $('#detail-dialog').addEventListener('close',()=>{controller.pause('detail',false);const context=detailContext;requestAnimationFrame(()=>{if(context&&document.body.dataset.view===context.view)window.scrollTo({top:context.y,behavior:'instant'});});});
 function refreshDetail(){
  if(!detail||!$('#detail-dialog').open)return;
  detail=equipment.find(item=>item.id===detail.id)||detail;
  const scroll=$('#detail-dialog').scrollTop;
  renderDetail({content:$('#detail-content'),title:detailTitle,extra:detailExtra,item:detail,date:getDate(),records:getRecords()});
  $('#detail-book').disabled=detail.operationalStatus==='maintenance';
  $('#detail-book').textContent=detail.operationalStatus==='maintenance'?'维护中':'预约此设备';
  $('#detail-dialog').scrollTop=scroll;
 }
 function openDetail(item){detailContext={view:document.body.dataset.view,y:scrollY};detail=equipment.find(current=>current.id===item.id)||item;renderDetail({content:$('#detail-content'),title:detailTitle,extra:detailExtra,item:detail,date:getDate(),records:getRecords()});$('#detail-book').disabled=detail.operationalStatus==='maintenance';$('#detail-book').textContent=detail.operationalStatus==='maintenance'?'维护中':'预约此设备';controller.pause('detail',true);openDialog($('#detail-dialog'));document.dispatchEvent(new CustomEvent('borrow:detail',{detail}));}
 return {refreshDetail,openDetail};
}

// One finite interaction language across the existing native product pages.
// Visual effects never alter selection, booking state or availability.
function mountProductMotion({hero,reduced,capable,media}){
 const lifetime=new AbortController(),lightfield=document.createElement('div'),ns='http://www.w3.org/2000/svg';
 lightfield.className='product-lightfield';lightfield.setAttribute('aria-hidden','true');hero.prepend(lightfield);
 // Keep the large vector field static. Only tiny compositor layers move;
 // redrawing a full-screen alpha canvas made the enlarged stage drop frames.
 const tracks=document.createElementNS(ns,'svg');tracks.setAttribute('preserveAspectRatio','none');
 tracks.innerHTML='<defs><linearGradient id="product-track-light"><stop stop-color="#8489FF" stop-opacity="0"/><stop offset=".54" stop-color="#8B83F6" stop-opacity=".17"/><stop offset="1" stop-color="#74A4EB" stop-opacity="0"/></linearGradient></defs>';
 const paths=Array.from({length:2},()=>{const path=document.createElementNS(ns,'path');path.setAttribute('fill','none');path.setAttribute('stroke','url(#product-track-light)');path.setAttribute('stroke-width','1');tracks.append(path);return path;});lightfield.append(tracks);
 const hoverControls=new WeakMap(),activeHovers=new Set(),posterControls=new WeakMap(),finiteAnimations=new Map(),entrySeen=new Set();
 let entryFrame=0,lightFrame=0,lightTarget=null,lightPoint=null;
 let width=1,height=1,frame=0,inside=true,paused=false,disposed=false,draws=0,slowFrames=0,limited=false;
 const visible=()=>!disposed&&!paused&&!document.hidden&&!reduced()&&capable&&inside&&document.body.dataset.view==='discover'&&!limited;
 const dots=Array.from({length:12},(_,i)=>{const node=document.createElement('i');node.className='product-lightpoint';node.style.width=node.style.height=(i%4?2:3.6)+'px';lightfield.append(node);return {phase:i*.61803398875%1,lane:i%2,node};});
 const curve=(p,lane)=>({x:width*(.04+p*.93),y:height*(.42+lane*.21+Math.sin(p*4.6+lane)*.12)});
 function draw(t){
  const start=performance.now(),time=t/1000;
  for(const dot of dots){const p=curve((dot.phase+time*.018)%1,dot.lane);dot.node.style.transform=`translate3d(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px,0)`;}
  lightfield.dataset.motionFrames=String(++draws);const cost=performance.now()-start;slowFrames=cost>8?slowFrames+1:Math.max(0,slowFrames-1);if(slowFrames>=5){limited=true;sync();}
 }
 function tick(t){frame=0;if(!visible())return;draw(t);if(visible())frame=requestAnimationFrame(tick);}
 function clearHover(node){hoverControls.get(node)?.cancel();hoverControls.delete(node);activeHovers.delete(node);node.style.translate='none';}
 function sync(){
  if(!visible()&&frame){cancelAnimationFrame(frame);frame=0;}
  if(visible()&&!frame)frame=requestAnimationFrame(tick);
  for(const node of activeHovers)if(paused||document.hidden||reduced()||!node.isConnected||!node.getClientRects().length)clearHover(node);
  for(const [node,animation]of finiteAnimations)if(paused||document.hidden||reduced()||!node.isConnected||!node.getClientRects().length){animation.cancel();finiteAnimations.delete(node);}
  if(reduced()){
   for(const ring of document.querySelectorAll('.product-click-wave')){for(const animation of ring.getAnimations())animation.cancel();ring.remove();}
   const images=hero.querySelectorAll('.hero-art img');gsap.killTweensOf(images);gsap.set(images,{clearProps:'transform'});
   images.forEach(img=>posterControls.delete(img));
   hero.querySelector('.hero-art')?.style.setProperty('--tilt-x','0deg');hero.querySelector('.hero-art')?.style.setProperty('--tilt-y','0deg');
  }
  lightfield.hidden=reduced();lightfield.dataset.motionState=visible()?'running':'paused';
 }
 function resize(){const box=hero.getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);tracks.setAttribute('viewBox',`0 0 ${width} ${height}`);for(const [lane,path]of paths.entries()){const points=Array.from({length:33},(_,i)=>{const p=curve(i/32,lane);return `${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;});path.setAttribute('d',points.join(' '));}sync();}
 const size=new ResizeObserver(resize),intersection=new IntersectionObserver(entries=>{inside=entries[0]?.isIntersecting??true;sync();});size.observe(hero);intersection.observe(hero);resize();
 const hoverSelector='.experience-card,.saved-plan,.card .device-art,.mini-device button,.primary,.secondary,.quick-prompt,.day,.slot,.filter-chip,.filter-choice,#categories button,.date-chip';
 function hover(event,entering){
  const node=event.target.closest?.(hoverSelector);if(!node||(event.relatedTarget&&node.contains(event.relatedTarget)))return;
  if(node.disabled||reduced()||!node.isConnected||!node.getClientRects().length){clearHover(node);return;}
  const from=getComputedStyle(node).translate;hoverControls.get(node)?.cancel();
  node.style.translate=from;activeHovers.add(node);
  const control=motionAnimate(node,{translate:[from==='none'?'0 0':from,entering?'0 -2px':'0 0']},{duration:.18,ease:[.2,.7,.2,1]});hoverControls.set(node,control);
 }
 document.addEventListener('pointerover',e=>hover(e,true),{signal:lifetime.signal});document.addEventListener('pointerout',e=>hover(e,false),{signal:lifetime.signal});
 document.addEventListener('focusin',e=>hover(e,true),{signal:lifetime.signal});document.addEventListener('focusout',e=>hover(e,false),{signal:lifetime.signal});
 function finite(node,keyframes,options){
  if(!node||paused||document.hidden||reduced()||!node.isConnected||!node.getClientRects().length)return;
  finiteAnimations.get(node)?.cancel();const animation=node.animate(keyframes,options);finiteAnimations.set(node,animation);
  const forget=()=>{if(finiteAnimations.get(node)===animation)finiteAnimations.delete(node);};animation.finished.then(forget,forget);
 }
 function enterItems(){
  entryFrame=0;sync();if(disposed||paused||document.hidden)return;
  const view=document.body.dataset.view;let index=0;
  for(const node of document.querySelectorAll('.experience-card,.cards>.card,#plans-list .saved-plan,#plan-editor .kit-item')){
   if(!node.getClientRects().length)continue;const box=node.getBoundingClientRect();if(box.top>=innerHeight||box.bottom<=0)continue;
   const id=node.dataset.sceneId||node.dataset.equipmentId||node.dataset.planId||node.querySelector('h3')?.textContent;
   const key=view+':'+node.classList[0]+':'+id;if(entrySeen.has(key))continue;entrySeen.add(key);
   if(reduced()||!capable||index>=8)continue;
   finite(node,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:360,delay:Math.min(index++*35,160),easing:'cubic-bezier(.16,1,.3,1)'});
  }
 }
 const queueEntries=()=>{if(!entryFrame&&!disposed)entryFrame=requestAnimationFrame(enterItems);};
 const entryObserver=new MutationObserver(queueEntries);
 for(const id of ['scene-experiences','equipment','plans-list','plan-editor']){const root=document.getElementById(id);if(root)entryObserver.observe(root,{childList:true,subtree:true});}
 document.addEventListener('borrow:view',()=>{entrySeen.clear();queueEntries();},{signal:lifetime.signal});
 document.addEventListener('pointermove',event=>{
  if(reduced()||!capable||event.pointerType!=='mouse')return;const node=event.target.closest?.('.cards>.card,.experience-card,.saved-plan');if(!node)return;
  lightTarget=node;lightPoint={x:event.clientX,y:event.clientY};if(lightFrame)return;
  lightFrame=requestAnimationFrame(()=>{lightFrame=0;if(paused||document.hidden||reduced()||!lightTarget?.isConnected||!lightTarget.getClientRects().length)return;const rect=lightTarget.getBoundingClientRect();lightTarget.style.setProperty('--card-x',(lightPoint.x-rect.left)+'px');lightTarget.style.setProperty('--card-y',(lightPoint.y-rect.top)+'px');});
 },{passive:true,signal:lifetime.signal});
 document.addEventListener('click',event=>{
  const choice=event.target.closest?.('.day,.slot,#categories button,.filter-choice,.filter-chip');if(!choice||choice.disabled||reduced())return;
  const selector=choice.matches('.day')?'#week .day.selected':choice.matches('.slot')?'#time-slots .slot.selected':null;
  requestAnimationFrame(()=>{if(disposed||reduced())return;const selected=selector?document.querySelector(selector):choice;if(!selected||selected.disabled||selected.classList.contains('full'))return;
   finite(selected,[{boxShadow:'inset 0 0 0 2px var(--color-focus)'},{boxShadow:'inset 0 0 0 0px transparent'}],{duration:420,easing:'ease-out'});
  });
 },{capture:true,signal:lifetime.signal});
 document.addEventListener('click',event=>{
  const button=event.target.closest('button.primary,button.secondary');if(!button||button.disabled||reduced())return;
  const rect=button.getBoundingClientRect(),ring=document.createElement('span');ring.className='product-click-wave';ring.setAttribute('aria-hidden','true');ring.style.left=(event.detail?event.clientX-rect.left:rect.width/2)+'px';ring.style.top=(event.detail?event.clientY-rect.top:rect.height/2)+'px';button.append(ring);
  const effect=ring.animate([{transform:'translate(-50%,-50%) scale(.2)',opacity:.5},{transform:'translate(-50%,-50%) scale(7)',opacity:0}],{duration:450,easing:'cubic-bezier(.2,.8,.2,1)'});effect.finished.then(()=>ring.remove(),()=>ring.remove());
 },{capture:true,signal:lifetime.signal});
 function posterMotion(x,y){const img=hero.querySelector('.hero-art img');if(!img||reduced()||!capable)return;let quick=posterControls.get(img);if(!quick){quick={x:gsap.quickTo(img,'x',{duration:.6,ease:'power2.out'}),y:gsap.quickTo(img,'y',{duration:.6,ease:'power2.out'})};posterControls.set(img,quick);}quick.x(x);quick.y(y);}
 hero.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse')return;const box=hero.getBoundingClientRect();posterMotion((event.clientX-box.left)/box.width*8-4,(event.clientY-box.top)/box.height*6-3);},{passive:true,signal:lifetime.signal});hero.addEventListener('pointerleave',()=>posterMotion(0,0),{signal:lifetime.signal});
 document.addEventListener('borrow:view',sync,{signal:lifetime.signal});document.addEventListener('borrow:prefs',sync,{signal:lifetime.signal});document.addEventListener('borrow:preferences',sync,{signal:lifetime.signal});document.addEventListener('visibilitychange',sync,{signal:lifetime.signal});media.addEventListener('change',sync,{signal:lifetime.signal});
 window.addEventListener('pagehide',event=>{paused=true;sync();if(entryFrame){cancelAnimationFrame(entryFrame);entryFrame=0;}if(lightFrame){cancelAnimationFrame(lightFrame);lightFrame=0;}for(const animation of finiteAnimations.values())animation.cancel();finiteAnimations.clear();if(!event.persisted){disposed=true;for(const node of activeHovers)clearHover(node);entryObserver.disconnect();lifetime.abort();size.disconnect();intersection.disconnect();gsap.killTweensOf(hero.querySelectorAll('.hero-art img'));}},{signal:lifetime.signal});window.addEventListener('pageshow',()=>{paused=false;sync();},{signal:lifetime.signal});
}
