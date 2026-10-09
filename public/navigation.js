const pages={discover:'workspace',equipment:'equipment-title',booking:'booking-title',plans:'plans',advisor:'advisor',space:'space',reservations:'reservations-title'};
const names={discover:'发现',equipment:'设备中心',booking:'预约',plans:'创作方案',advisor:'智能推荐',space:'个人空间',reservations:'我的预约'};
const closingDialogs=new WeakMap(),boundDialogs=new WeakSet();
const dialogContexts=new WeakMap(),openDialogs=new Set();let previousOverflow='',backgroundContext=null;
function captureTrigger(){const trigger=document.activeElement;return {trigger,id:trigger?.id,label:trigger?.getAttribute('aria-label')};}
function visibleTrigger(context){
 if(!context)return null;
 const candidates=[context.trigger,context.id?document.getElementById(context.id):null,...(context.label?[...document.querySelectorAll('[aria-label]')].filter(el=>el.getAttribute('aria-label')===context.label):[])];
 return candidates.find(el=>el?.isConnected&&el.getClientRects().length&&!el.closest('dialog:not([open])'))||null;
}
function bindContext(dialog){
 if(typeof document==='undefined')return;
 if(!openDialogs.size){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';backgroundContext={...captureTrigger(),position:scrollY,view:document.body.dataset.view};}
 dialogContexts.set(dialog,{...captureTrigger(),position:scrollY,view:document.body.dataset.view,fallback:backgroundContext});openDialogs.add(dialog);
}
function restoreContext(dialog){
 if(typeof document==='undefined')return;
 openDialogs.delete(dialog);if(openDialogs.size)return;document.body.style.overflow=previousOverflow;
 const context=dialogContexts.get(dialog);if(context&&document.body.dataset.view===context.view){window.scrollTo({top:context.position,behavior:'instant'});(visibleTrigger(context)||visibleTrigger(context.fallback))?.focus({preventScroll:true});}backgroundContext=null;
}
function cancelClosing(dialog){const timer=closingDialogs.get(dialog);if(timer!==undefined)clearTimeout(timer);closingDialogs.delete(dialog);dialog.classList.remove('closing');}
export function openDialog(dialog){cancelClosing(dialog);if(!boundDialogs.has(dialog)){dialog.addEventListener('close',()=>{cancelClosing(dialog);restoreContext(dialog);});boundDialogs.add(dialog);}if(!dialog.open){bindContext(dialog);dialog.showModal();}}
export function closeDialog(dialog,{reduce=false,duration=220}={}){if(!dialog.open)return;if(reduce){cancelClosing(dialog);dialog.close();return;}if(closingDialogs.has(dialog))return;dialog.classList.add('closing');closingDialogs.set(dialog,setTimeout(()=>{closingDialogs.delete(dialog);dialog.classList.remove('closing');dialog.close();},duration));}
export function createRouteMemory(initial='discover'){
 const positions=new Map(),trail=[initial];let index=0;
 const state=()=>({view:trail[index],index,back:trail[index-1]||null});
 return {state,move(view,y,{top=false,replace=false}={}){positions.set(trail[index],y);if(view===trail[index])return {...state(),position:top?0:y,changed:false};if(replace)trail[index]=view;else{trail.splice(index+1);trail.push(view);index++;}return {...state(),position:top?0:positions.get(view)||0,changed:true};},restore(next,y){if(!Number.isInteger(next)||next<0||next>=trail.length)return null;positions.set(trail[index],y);index=next;return {...state(),position:positions.get(trail[index])||0,changed:true};}};
}
let memory=null;
export function currentView(){return document.body.dataset.view;}
export function backView(fallback='equipment',position=null){if(memory?.state().back)history.back();else{goView(fallback,{replace:true});if(Number.isFinite(position))window.scrollTo({top:position,behavior:'instant'});}}
function render(route){
 for(const page of document.querySelectorAll('[data-page]'))page.hidden=page.dataset.page!==route.view;
 document.body.dataset.view=route.view;
 for(const link of document.querySelectorAll('[data-go]')){link.classList.toggle('active',link.dataset.go===route.view);link.setAttribute('aria-current',link.dataset.go===route.view?'page':'false');}
 for(const button of document.querySelectorAll('[data-back]')){button.hidden=!route.back||route.view==='discover';button.textContent=route.back?'返回'+names[route.back]:'返回';}
 window.scrollTo({top:route.position||0,behavior:'instant'});document.body.classList.toggle('scrolled',route.position>24);
 document.dispatchEvent(new CustomEvent('borrow:view',{detail:route.view}));
 if(route.changed&&document.documentElement.dataset.motion!=='reduce'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const page=document.querySelector(`[data-page="${route.view}"]`);for(const animation of page.getAnimations())animation.cancel();page.animate([{opacity:.72,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:320,easing:'cubic-bezier(.16,1,.3,1)'});}
}
export function goView(view,options={}){
 if(!Object.hasOwn(pages,view))return;
 if(!memory)memory=createRouteMemory(currentView()||'discover');
 const route=memory.move(view,scrollY,options);
 if(route.changed){history[options.replace?'replaceState':'pushState']({borrowLab:true,index:route.index},'','#'+pages[view]);render(route);}else if(options.top)window.scrollTo({top:0,behavior:'instant'});
}
export function mountNavigation(){
 const original=location.hash.slice(1),view=Object.keys(pages).find(key=>pages[key]===original)||'discover';memory=createRouteMemory(view);history.replaceState({borrowLab:true,index:0},'','#'+pages[view]);render({...memory.state(),position:0,changed:false});
 document.addEventListener('click',event=>{const back=event.target.closest('[data-back]');if(back&&!back.hidden){event.preventDefault();history.back();return;}const target=event.target.closest('[data-go]');if(target){event.preventDefault();goView(target.dataset.go,{top:target.dataset.reset==='true'});}});
 window.addEventListener('popstate',event=>{if(event.state?.borrowLab){const route=memory.restore(event.state.index,scrollY);if(route)render(route);}});
 window.addEventListener('hashchange',()=>{const next=Object.keys(pages).find(key=>pages[key]===location.hash.slice(1));if(next&&next!==currentView())goView(next,{replace:true});});
 window.addEventListener('scroll',()=>document.body.classList.toggle('scrolled',scrollY>24),{passive:true});
}
