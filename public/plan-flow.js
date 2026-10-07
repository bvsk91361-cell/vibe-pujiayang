import {slots,localDate} from './booking.js';
export function addEquipment(ids,id,catalog){
 if(!catalog.some(item=>item.id===id&&item.operationalStatus==='active'))throw new Error('这件设备暂时不可加入方案。');
 if(ids.includes(id))return [...ids];
 if(ids.length>=8)throw new Error('一份方案最多8件设备，请先移出一件。');
 return [...ids,id];
}
export function scenarioQuestion(scene){return `我明天下午准备做${scene.name}，请推荐2～4件合适设备。`;}

export function replaceEquipment(ids,previous,next,catalog){
 if(!ids.includes(previous))throw new Error('这件设备已经不在当前方案中。');
 if(!catalog.some(item=>item.id===next&&item.operationalStatus==='active'))throw new Error('这件设备暂时不可加入方案。');
 if(next!==previous&&ids.includes(next))throw new Error('这件设备已经在方案里了。');
 return ids.map(id=>id===previous?next:id);
}

export function draftSnapshot(plan){return {id:plan.id,name:plan.name,sceneId:plan.sceneId,date:plan.date,slot:plan.slot,equipmentIds:[...plan.equipmentIds]};}
export function planSignature(plan){return JSON.stringify(draftSnapshot(plan));}
export function readDraft(storage,userId,catalog){
 try{const value=JSON.parse(storage.getItem('borrow-draft:'+userId));if(!value||typeof value.name!=='string'||value.name.length>60||!Array.isArray(value.equipmentIds)||value.equipmentIds.length<1||value.equipmentIds.length>8||new Set(value.equipmentIds).size!==value.equipmentIds.length||value.equipmentIds.some(id=>!catalog.some(item=>item.id===id))||!/^\d{4}-\d{2}-\d{2}$/.test(value.date)||!slots.includes(value.slot))return null;const parsed=new Date(value.date+'T12:00:00');if(Number.isNaN(parsed.getTime())||localDate(parsed)!==value.date)return null;return draftSnapshot(value);}catch{return null;}
}
export function saveDraft(storage,userId,plan){try{storage.setItem('borrow-draft:'+userId,JSON.stringify(draftSnapshot(plan)));return true;}catch{return false;}}
export function planOptimizationQuestion(plan,catalog){const names=plan.equipmentIds.map(id=>catalog.find(item=>item.id===id)?.name).filter(Boolean).join('、');return `我在${plan.date} ${plan.slot}准备做${plan.name}，请推荐2～4件合适设备。已有${names}，${plan.available??0}/${plan.equipmentIds.length}件可用。`.slice(0,300);}
export function optimizedDraft(result,original){return {...draftSnapshot(original),equipmentIds:[...result.equipmentIds]};}
