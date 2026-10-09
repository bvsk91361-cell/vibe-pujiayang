import {slots,localDate} from './booking.js';
import {availabilityLabel} from './planning.js';
export function addEquipment(ids,id,catalog){
 if(!catalog.some(item=>item.id===id&&item.operationalStatus==='active'))throw new Error('这件设备暂时不可加入方案。');
 if(ids.includes(id))return [...ids];
 if(ids.length>=8)throw new Error('一份方案最多8件设备，请先移出一件。');
 return [...ids,id];
}
export function scenarioQuestion(scene){return `我准备做${scene.name}，请推荐2～4件合适设备。`;}

export function replaceEquipment(ids,previous,next,catalog){
 if(!ids.includes(previous))throw new Error('这件设备已经不在当前方案中。');
 if(!catalog.some(item=>item.id===next&&item.operationalStatus==='active'))throw new Error('这件设备暂时不可加入方案。');
 if(next!==previous&&ids.includes(next))throw new Error('这件设备已经在方案里了。');
 return ids.map(id=>id===previous?next:id);
}

export function draftSnapshot(plan){return {id:plan.id,name:plan.name,sceneId:plan.sceneId,date:plan.date,slot:plan.slot,equipmentIds:[...plan.equipmentIds],...(plan.source?{source:plan.source}:{})};}
export function planSignature(plan){return JSON.stringify(draftSnapshot(plan));}
export function readDraft(storage,userId,catalog){
 try{const value=JSON.parse(storage.getItem('borrow-draft:'+userId));if(!value||typeof value.name!=='string'||value.name.length>60||!Array.isArray(value.equipmentIds)||value.equipmentIds.length>8||new Set(value.equipmentIds).size!==value.equipmentIds.length||value.equipmentIds.some(id=>!catalog.some(item=>item.id===id))||(value.date&&!/^\d{4}-\d{2}-\d{2}$/.test(value.date))||(value.slot&&!slots.includes(value.slot)))return null;if(value.date){const parsed=new Date(value.date+'T12:00:00');if(Number.isNaN(parsed.getTime())||localDate(parsed)!==value.date)return null;}return draftSnapshot({...value,date:value.date||'',slot:value.slot||''});}catch{return null;}
}
export function saveDraft(storage,userId,plan){try{const value=JSON.stringify(draftSnapshot(plan));storage.setItem('borrow-draft:'+userId,value);if(plan.id)storage.setItem('borrow-plan-draft:'+userId+':'+plan.id,value);return true;}catch{return false;}}
export function readPlanDraft(storage,userId,catalog,planId){return readDraft({getItem:()=>storage?.getItem('borrow-plan-draft:'+userId+':'+planId)},userId,catalog);}
export function saveRecommendation(storage,userId,plan){try{storage.setItem('borrow-recommendation:'+userId,JSON.stringify({...draftSnapshot(plan),savedId:plan.savedId||null}));return true;}catch{return false;}}
export function readRecommendation(storage,userId,catalog){try{const value=JSON.parse(storage.getItem('borrow-recommendation:'+userId)),plan=readDraft({getItem:()=>JSON.stringify(value)},userId,catalog);return plan?.equipmentIds.length?{...plan,savedId:typeof value.savedId==='string'?value.savedId:null}:null;}catch{return null;}}
export function planOptimizationQuestion(plan,catalog){const names=plan.equipmentIds.map(id=>catalog.find(item=>item.id===id)?.name).filter(Boolean).join('、'),time=[plan.date,plan.slot].filter(Boolean).join(' ');return `我准备做${plan.name}${time?'，时间是'+time:''}，请推荐2～4件合适设备。已有${names}${plan.date&&plan.slot?'，'+availabilityLabel({...plan,total:plan.equipmentIds.length,available:plan.available??0}):''}。`.slice(0,300);}
export function optimizedDraft(result,original){return {...draftSnapshot(original),equipmentIds:[...result.equipmentIds]};}
