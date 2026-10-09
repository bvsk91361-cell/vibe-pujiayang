const $=s=>document.querySelector(s);
import {openDialog} from './navigation.js';
export function mountSettings(){
 const dialog=$('#profile-dialog'),menu=$('#identity-menu'),trigger=$('#space-avatar'),tabs=[...document.querySelectorAll('[data-settings-tab]')];
 let returnTo=null,position=0;
 function select(page){for(const tab of tabs){const active=tab.dataset.settingsTab===page;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}for(const panel of document.querySelectorAll('[data-settings-page]'))panel.hidden=panel.dataset.settingsPage!==page;}
 function identities(show){$('#identity-management').hidden=!show;$('#account-switch-open').setAttribute('aria-expanded',String(show));if(show)$('#avatar-themes').hidden=true;}
 function open(page='account',from=document.activeElement,manage=false){returnTo=from?.closest('#identity-menu')?trigger:from;position=scrollY;if(menu.matches(':popover-open'))menu.hidePopover();select(page);identities(manage);$('#preference-message').textContent='';openDialog(dialog);tabs.find(tab=>tab.dataset.settingsTab===page)?.focus({preventScroll:true});}
 for(const tab of tabs){tab.addEventListener('click',()=>select(tab.dataset.settingsTab));tab.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(tabs.indexOf(tab)+(event.key==='ArrowDown'?1:-1)+tabs.length)%tabs.length;select(tabs[index].dataset.settingsTab);tabs[index].focus();});}
 dialog.addEventListener('close',()=>{window.scrollTo({top:position,behavior:'instant'});if(returnTo?.isConnected)returnTo.focus({preventScroll:true});});
 menu.addEventListener('beforetoggle',event=>{if(event.newState==='open'){const box=trigger.getBoundingClientRect();menu.style.left=Math.max(16,Math.min(box.left,innerWidth-240))+'px';menu.style.top=Math.min(box.bottom+12,innerHeight-180)+'px';}});
 menu.addEventListener('toggle',event=>{if(event.newState==='open')menu.querySelector('button').focus({preventScroll:true});else if(!dialog.open)trigger.focus({preventScroll:true});});
 menu.addEventListener('keydown',event=>{const rows=[...menu.querySelectorAll('button')],index=rows.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();rows[(index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length].focus();}});
 for(const entry of menu.querySelectorAll('[data-settings]'))entry.addEventListener('click',()=>open(entry.dataset.settings,entry,entry.dataset.identities==='true'));
 $('#preferences-open').addEventListener('click',event=>open('appearance',event.currentTarget));
 $('#account-switch-open').addEventListener('click',()=>identities($('#identity-management').hidden));
 $('#avatar-default-open').addEventListener('click',()=>identities(false));
 for(const choice of $('#motion-options').children)choice.addEventListener('click',()=>{const input=$('#motion-reduce');input.checked=choice.dataset.motionChoice==='reduce';input.dispatchEvent(new Event('change'));});
 return {open,select};
}
