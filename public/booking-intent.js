import {slots,isBusinessDate} from './booking.js';

const sources=new Set(['discover','equipment','plans','advisor','space','reservations']);
export function bookingIntent(input,userId,catalog,{sourceView='equipment',sourceY=0,requestId=crypto.randomUUID()}={}){
 const ids=[...(input.equipmentIds||[])];
 if(!userId||!ids.length||ids.length>8||new Set(ids).size!==ids.length||ids.some(id=>!catalog.some(item=>item.id===id)))throw new Error('请选择有效设备');
 const date=input.date||'',slot=input.slot||'';
 if(date&&!isBusinessDate(date))throw new Error('日期无效');
 if(slot&&!slots.includes(slot))throw new Error('时段无效');
 if(typeof requestId!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(requestId))throw new Error('预约请求无效');
 return {userId,equipmentIds:ids,name:input.name||'设备搭配',date,slot,planId:input.planId||null,sceneId:input.sceneId||null,source:input.source||'manual',sourceView:sources.has(sourceView)?sourceView:'equipment',sourceY:Number.isFinite(sourceY)?sourceY:0,requestId};
}
export function saveBooking(storage,intent){try{storage.setItem('borrow-booking:'+intent.userId,JSON.stringify(intent));return true;}catch{return false;}}
export function readBooking(storage,userId,catalog){
 try{const value=JSON.parse(storage.getItem('borrow-booking:'+userId));if(!value||value.userId!==userId)return null;const result=bookingIntent(value,userId,catalog,value);return {...result,...(value.receipt?{receipt:value.receipt}:{} )};}catch{return null;}
}
export function validReceipt(intent,receipt,records=null){
 if(receipt?.atomic!==true||receipt.requestId!==intent.requestId||receipt.date!==intent.date||receipt.slot!==intent.slot||!Array.isArray(receipt.records)||receipt.records.length!==intent.equipmentIds.length)return false;
 const ids=new Set(receipt.records.map(row=>row.equipmentId));
 return ids.size===intent.equipmentIds.length&&intent.equipmentIds.every(id=>ids.has(id))&&receipt.records.every(row=>row.userId===intent.userId&&row.date===intent.date&&row.slot===intent.slot&&row.id&&row.status!=='cancelled'&&(!records||records.some(record=>record.id===row.id&&record.userId===intent.userId&&record.equipmentId===row.equipmentId&&record.date===row.date&&record.slot===row.slot&&record.status!=='cancelled')));
}
// Change only the booking draft. Saving a plan and submitting a reservation stay explicit.
export function changeBookingEquipment(intent,id,catalog,{userId=intent?.userId,replaceId=null,sourceView=intent?.sourceView||'equipment',sourceY=intent?.sourceY||0,requestId=crypto.randomUUID()}={}){
 const item=catalog.find(row=>row.id===id);
 if(!item||item.operationalStatus!=='active')throw new Error('这件设备暂时不可预约');
 if(intent?.receipt)throw new Error('这次预约已经完成，请开始新的预约');
 if(intent&&intent.userId!==userId)throw new Error('身份已经切换，请重新选择设备');
 if(intent&&intent.equipmentIds.length>1&&!replaceId)throw new Error('请选择要更换的设备');
 if(replaceId&&!intent?.equipmentIds.includes(replaceId))throw new Error('这件设备已经不在当前预约中');
 const ids=intent?(replaceId?intent.equipmentIds.map(previous=>previous===replaceId?id:previous):[id]):[id];
 if(new Set(ids).size!==ids.length)throw new Error('这件设备已经在本次预约中');
 const same=intent&&ids.every((equipmentId,index)=>equipmentId===intent.equipmentIds[index]);
 if(same)return intent;
 return bookingIntent({...intent,equipmentIds:ids,name:ids.length===1?item.name:intent?.name||'设备搭配',planId:null,source:intent?.source||'manual'},userId,catalog,{sourceView,sourceY,requestId});
}
// Model defaults are not user choices: keep missing date / time unset in the UI.
export function requestedTime(question,result){
 const date=/(今天|明天|后天|今晚|今早|今夜|明早|明晚|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}月\d{1,2}(?:日|号)?|\d{4}-\d{2}-\d{2})/.test(question)?result.date||'':'';
 const slot=/(上午|下午|晚上|今晚|今早|今夜|明早|明晚|早上|早晨|中午|夜里|\d{1,2}[：:]\d{2}|\d{1,2}点)/.test(question)?result.slot||'':'';
 return {date,slot};
}
