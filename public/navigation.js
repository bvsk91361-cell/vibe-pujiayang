const pages={discover:'workspace',equipment:'equipment-title',booking:'booking-title',plans:'plans',advisor:'advisor',space:'space',reservations:'reservations-title'};
export function currentView(){return document.body.dataset.view;}
export function goView(view){
 if(!Object.hasOwn(pages,view))return;
 function update(){for(const page of document.querySelectorAll('[data-page]'))page.hidden=page.dataset.page!==view;document.body.dataset.view=view;for(const link of document.querySelectorAll('[data-go]'))link.classList.toggle('active',link.dataset.go===view);history.replaceState(null,'','#'+pages[view]);window.scrollTo({top:0,behavior:'instant'});document.dispatchEvent(new CustomEvent('borrow:view',{detail:view}));}
 const reduced=document.documentElement.dataset.motion==='reduce'||matchMedia('(prefers-reduced-motion: reduce)').matches;
 update();
 if(!reduced){const page=document.querySelector(`[data-page="${view}"]`);for(const animation of page.getAnimations())animation.cancel();page.animate([{opacity:.4,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:420,easing:'cubic-bezier(.16,1,.3,1)'});}
}
export function mountNavigation(){
 document.addEventListener('click',event=>{const target=event.target.closest('[data-go]');if(target){event.preventDefault();goView(target.dataset.go);}});
 const original=location.hash.slice(1),view=Object.keys(pages).find(key=>pages[key]===original)||'discover';goView(view);
 window.addEventListener('hashchange',()=>goView(Object.keys(pages).find(key=>pages[key]===location.hash.slice(1))||'discover'));
 const scroll=()=>document.body.classList.toggle('scrolled',scrollY>24);window.addEventListener('scroll',scroll,{passive:true});scroll();
}
