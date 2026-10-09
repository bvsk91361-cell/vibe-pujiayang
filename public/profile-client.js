export const MAX_AVATAR_BYTES=10*1024*1024;
export const MAX_AVATAR_PIXELS=40_000_000;
export const SAVED_AVATAR_BYTES=160_000;
export const AVATAR_SIZE=512;
export function validateAvatarFile(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择 PNG、JPG 或 WEBP 图片。');
 if(!Number.isInteger(file.size)||file.size<1)throw new Error('这张图片没有内容，请重新选择。');
 if(file.size>MAX_AVATAR_BYTES)throw new Error('原图超过 10MB，请选择一张较小的照片。');
}
function readDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('没有读取到图片，请重新选择。'));reader.readAsDataURL(file);});}
function decodeImage(data){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('这张图片无法打开，请换一张。'));image.src=data;});}
export async function prepareAvatar(file,{read=readDataUrl,decode=decodeImage}={}){
 validateAvatarFile(file);const data=await read(file);
 if(typeof data!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(data))throw new Error('这张图片无法打开，请换一张。');
 const image=await decode(data),width=image?.naturalWidth||image?.width,height=image?.naturalHeight||image?.height;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('这张图片无法打开，请换一张。');
 if(width*height>MAX_AVATAR_PIXELS||Math.max(width,height)>12000)throw new Error('照片像素过大，请选择不超过 4000 万像素的图片。');
 return {image,width,height};
}
// Always crop a square in source coordinates; no aspect-ratio stretching.
export function avatarCrop(width,height,{zoom=1,x=.5,y=.5}={}){
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
 const side=Math.min(width,height)/clamp(zoom,1,2.5);
 return {x:(width-side)*clamp(x,0,1),y:(height-side)*clamp(y,0,1),width:side,height:side};
}
export function moveAvatarCrop(width,height,crop,dx,dy,previewSize){
 if(!Number.isFinite(previewSize)||previewSize<=0||!Number.isFinite(dx)||!Number.isFinite(dy))return {...crop};
 const rect=avatarCrop(width,height,crop),clamp=value=>Math.max(0,Math.min(1,value));
 return {...crop,x:width===rect.width ? .5 : clamp((rect.x-dx*rect.width/previewSize)/(width-rect.width)),y:height===rect.height ? .5 : clamp((rect.y-dy*rect.height/previewSize)/(height-rect.height))};
}
export function drawAvatar(canvas,prepared,crop={}){
 canvas.width=AVATAR_SIZE;canvas.height=AVATAR_SIZE;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器暂时无法处理照片，请重新尝试。');
 const rect=avatarCrop(prepared.width,prepared.height,crop);
 ctx.clearRect(0,0,AVATAR_SIZE,AVATAR_SIZE);ctx.save();ctx.beginPath();ctx.arc(AVATAR_SIZE/2,AVATAR_SIZE/2,AVATAR_SIZE/2,0,Math.PI*2);ctx.clip();
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(prepared.image,rect.x,rect.y,rect.width,rect.height,0,0,AVATAR_SIZE,AVATAR_SIZE);
 ctx.restore();
 return canvas;
}
export function encodeAvatar(prepared,crop={},canvas=document.createElement('canvas')){
 drawAvatar(canvas,prepared,crop);
 for(const quality of [.86,.74,.62,.48]){
  let data=canvas.toDataURL('image/webp',quality);
  if(!data.startsWith('data:image/webp;')){const ctx=canvas.getContext('2d');ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#17243a';ctx.fillRect(0,0,AVATAR_SIZE,AVATAR_SIZE);ctx.globalCompositeOperation='source-over';data=canvas.toDataURL('image/jpeg',quality);}
  const payload=data.split(',')[1]||'';
  if(/^data:image\/(webp|jpeg);base64,/.test(data)&&Math.ceil(payload.length*3/4)<=SAVED_AVATAR_BYTES)return data;
 }
 throw new Error('这张照片暂时无法优化，请调整裁剪范围或换一张。');
}
export async function readAvatar(file,{encode=encodeAvatar,...dependencies}={}){return encode(await prepareAvatar(file,dependencies));}

// Preserve click order even when requests complete at different speeds.
export function createPreferenceQueue(save){
 let pending=Promise.resolve();
 return (id,value)=>{const operation=pending.catch(()=>{}).then(()=>save(id,value));pending=operation;return operation;};
}

export function accountPreferences(prefs={}){
 return {font:['standard','large','xlarge'].includes(prefs.font)?prefs.font:'standard',theme:['auto','light','dark'].includes(prefs.theme)?prefs.theme:'auto',reduceMotion:prefs.reduceMotion===true};
}

export function personalExport(workspace,now=new Date()){
 if(!workspace?.user?.id||!Array.isArray(workspace.history)||!Array.isArray(workspace.plans))throw new Error('个人数据尚未加载');
 return JSON.stringify({...workspace,exportedAt:now.toISOString()},null,2);
}
