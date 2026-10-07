export const MAX_AVATAR_BYTES=350000;
export function validateAvatarFile(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择 PNG、JPG 或 WEBP 图片。');
 if(!Number.isInteger(file.size)||file.size<1||file.size>MAX_AVATAR_BYTES)throw new Error('图片请小于 350KB。');
}
function readDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('没有读取到图片，请重新选择。'));reader.readAsDataURL(file);});}
function decodeImage(data){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>reject(new Error('这张图片无法打开，请换一张。'));image.src=data;});}
export async function readAvatar(file,{read=readDataUrl,decode=decodeImage}={}){validateAvatarFile(file);const data=await read(file);if(typeof data!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(data))throw new Error('这张图片无法打开，请换一张。');await decode(data);return data;}

// Preserve click order even when requests complete at different speeds.
export function createPreferenceQueue(save){
 let pending=Promise.resolve();
 return (id,value)=>{const operation=pending.catch(()=>{}).then(()=>save(id,value));pending=operation;return operation;};
}
