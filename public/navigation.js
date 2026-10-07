const pages={discover:'workspace',equipment:'equipment-title',booking:'booking-title',plans:'plans',advisor:'advisor',space:'space',reservations:'reservations-title'};
const names={discover:'发现',equipment:'设备中心',booking:'预约',plans:'创作方案',advisor:'智能推荐',space:'个人空间',reservations:'我的预约'};
export function createRouteMemory(initial='discover'){
 const positions=new Map(),trail=[initial];let index=0;
 const state=()=>({view:trail[index],index,back:trail[index-1]||null});
 return {state,move(view,y,{top=false,replace=false}={}){positions.set(trail[index],y);if(view===trail[index])return {...state(),position:top?0:y,changed:false};if(replace)trail[index]=view;else{trail.splice(index+1);trail.push(view);index++;}return {...state(),position:top?0:positions.get(view)||0,changed:true};},restore(next,y){if(!Number.isInteger(next)||next<0||next>=trail.length)return null;positions.set(trail[index],y);index=next;return {...state(),position:positions.get(trail[index])||0,changed:true};}};
}
let memory=null;
export function currentView(){return document.body.dataset.view;}
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
