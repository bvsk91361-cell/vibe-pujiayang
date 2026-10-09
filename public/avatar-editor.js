import {prepareAvatar,drawAvatar,encodeAvatar,moveAvatarCrop} from './profile-client.js';
const $=selector=>document.querySelector(selector);

export function mountAvatarEditor({getUser,save,notify}){
 const input=$('#avatar-upload'),editor=$('#avatar-editor'),canvas=$('#avatar-crop-preview'),upload=$('#avatar-upload-open'),apply=$('#avatar-crop-apply'),message=$('#avatar-message');
 const controls=[...editor.querySelectorAll('input[type="range"]')];
 let prepared=null,owner=null,version=0,drag=null;
 const crop=()=>Object.fromEntries(controls.map(control=>[control.dataset.crop,Number(control.value)]));
 function status(text,error=false){message.textContent=text;message.classList.toggle('is-error',error);}
 function stopDrag(){if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);drag=null;delete canvas.dataset.dragging;}
 function cancel(){stopDrag();version++;prepared=null;owner=null;editor.hidden=true;input.value='';upload.disabled=false;status('');}
 function preview(){if(prepared)drawAvatar(canvas,prepared,crop());}
 upload.addEventListener('click',()=>input.click());
 input.addEventListener('change',async()=>{
  const file=input.files[0];if(!file)return;
  const current=++version,id=getUser().id;upload.disabled=true;status('正在优化照片');
  try{
   const next=await prepareAvatar(file);if(version!==current||getUser().id!==id)return;
   prepared=next;owner=id;controls.forEach(control=>control.value=control.dataset.crop==='zoom'?'1':'0.5');
   $('#avatar-themes').hidden=true;editor.hidden=false;preview();status('');apply.focus({preventScroll:true});
  }catch(error){if(version===current){status(error.message,true);editor.hidden=true;prepared=null;}}
  finally{input.value='';if(version===current)upload.disabled=false;}
 });
 for(const control of controls)control.addEventListener('input',preview);
 canvas.addEventListener('pointerdown',event=>{if(!prepared||owner!==getUser().id||apply.disabled||event.button!==0)return;event.preventDefault();canvas.focus({preventScroll:true});drag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);canvas.dataset.dragging='true';});
 canvas.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId||apply.disabled)return;const next=moveAvatarCrop(prepared.width,prepared.height,crop(),event.clientX-drag.x,event.clientY-drag.y,canvas.getBoundingClientRect().width);for(const control of controls)control.value=String(next[control.dataset.crop]);drag.x=event.clientX;drag.y=event.clientY;preview();});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{drag=null;delete canvas.dataset.dragging;});
 canvas.addEventListener('keydown',event=>{if(!prepared||apply.disabled||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const axis=event.key.includes('Left')||event.key.includes('Right')?'x':'y',control=controls.find(item=>item.dataset.crop===axis),step=event.shiftKey ? .05 : .01;control.value=String(Math.max(0,Math.min(1,Number(control.value)+(['ArrowLeft','ArrowUp'].includes(event.key)?step:-step))));preview();});
 apply.addEventListener('click',async()=>{
  if(!prepared||owner!==getUser().id)return cancel();
  const current=version,id=owner;stopDrag();apply.disabled=true;upload.disabled=true;controls.forEach(control=>control.disabled=true);canvas.setAttribute('aria-disabled','true');status('正在保存头像');
  try{
   const data=encodeAvatar(prepared,crop());await save(data,id);
   if(version===current&&id===getUser().id){cancel();notify('已更换头像');upload.focus({preventScroll:true});}
  }catch(error){if(version===current)status('头像没有保存：'+error.message+' 可以重新尝试。',true);}
  finally{apply.disabled=false;controls.forEach(control=>control.disabled=false);canvas.removeAttribute('aria-disabled');if(version===current)upload.disabled=false;}
 });
 $('#avatar-crop-cancel').addEventListener('click',()=>{cancel();upload.focus({preventScroll:true});});
 $('#profile-dialog').addEventListener('close',cancel);
 $('#avatar-default-open').addEventListener('click',()=>{cancel();$('#avatar-themes').hidden=false;});
 $('#avatar-reset').addEventListener('click',cancel);
 document.addEventListener('borrow:identity-changing',cancel);
 return {cancel};
}
