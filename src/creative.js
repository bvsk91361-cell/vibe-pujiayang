import { equipment, slots, BookingError, localDate, isBusinessDate, businessMoment } from './booking.js';
import { freeSlots, addDays } from './planning.js';
import {derivePlanState} from './plan-state.js';

export const creativeScenes = [
 ['interview','校园采访','把人物的故事，收进镜头。','声画同行','violet',['gimbal-g1','microphone-m1','light-f1','support-t2'],20],
 ['vlog','轻量 Vlog','把日常，拍成你的风格。','轻装出发','blue',['gimbal-g1','microphone-m1','support-t2'],10],
 ['podcast','双人播客','让每一个观点被听见。','双声交汇','rose',['microphone-m1','recorder-r2','support-t1'],15],
 ['outdoor','户外记录','走出室内，打开视野。','向远而行','teal',['drone-a1','camera-c3','support-t2'],25],
 ['shortfilm','产品短片','给细节，一束好光。','光影成片','amber',['camera-c2','lens-l3','light-f2','support-t2'],30],
 ['live','直播分享','把画面与声音，顺畅连接。','此刻在线','violet',['capture-s2','microphone-m3','light-f2','capture-s1'],20],
 ['speech','演讲记录','把重要的表达留下来。','清晰表达','blue',['camera','recorder','support-t2'],15],
 ['event','活动跟拍','跟上每一个精彩瞬间。','现场发生','teal',['camera-c2','microphone-m1','support-t3'],20],
 ['night','夜间拍摄','在暗处，发现新的光。','夜色成像','amber',['camera','lens-l2','light-f1','support-t2'],25],
 ['mobile','移动创作','灵感在路上，设备也轻一点。','随行创作','rose',['gimbal-g1','microphone-m1','light-f1'],10]
].map(([id,name,description,tag,tone,ids,minutes])=>({id,name,description,tag,tone,ids,minutes}));

export function checkMoment(date,slot,{allowPast=false}={}){
 if(!isBusinessDate(date)||(!allowPast&&date<localDate())||date>addDays(localDate(),365)||!slots.includes(slot))throw new BookingError('请选择未来一年内的有效日期与时段。');
}
export function replacements(id,date,slot,records,catalog=equipment,excluded=[]){
 const original=catalog.find(item=>item.id===id);if(!original)return [];
 return catalog.filter(item=>item.id!==id&&!excluded.includes(item.id)&&item.capability===original.capability&&item.operationalStatus!=='maintenance'&&freeSlots(records,date,item.id).includes(slot)).map(item=>({...item,fit:item.category===original.category?100:75,reason:item.category===original.category?'同类能力与目标时段均匹配':'同用途能力匹配；请核对附件接口'})).sort((a,b)=>b.fit-a.fit).slice(0,3);
}
export function inspectPlan(plan,records,catalog=equipment,{allowPast=false}={}){
 const timed=!!plan.date&&!!plan.slot;
 if(timed)checkMoment(plan.date,plan.slot,{allowPast});
 else{if(plan.date)checkMoment(plan.date,slots[0],{allowPast});if(plan.slot&&!slots.includes(plan.slot))throw new BookingError('请选择有效时段。');}
 const ids=plan.equipmentIds;
 if(!Array.isArray(ids)||ids.length>8||new Set(ids).size!==ids.length||ids.some(id=>!catalog.some(item=>item.id===id)))throw new BookingError('请选择最多8件不同的有效设备。');
 if(!timed||!ids.length){const items=ids.map(id=>({...catalog.find(item=>item.id===id),available:false,secured:false,reason:'选好时间，再查看可用性',alternatives:[]}));const checked={...plan,items,expired:false,available:0,reserved:0,reservable:0,blocked:0,total:ids.length,readiness:ids.length?50:0};return {...checked,planState:derivePlanState(checked,records)};}
 const expired=businessMoment(plan.date,plan.slot.slice(-5))<=new Date();
 const items=ids.map(id=>{const item=catalog.find(item=>item.id===id);const secured=!expired&&!!plan.userId&&records.some(row=>row.status!=='cancelled'&&row.userId===plan.userId&&row.equipmentId===id&&row.date===plan.date&&row.slot===plan.slot);const available=!expired&&item.operationalStatus!=='maintenance'&&(secured||freeSlots(records,plan.date,id).includes(plan.slot));return {...item,available,secured,reason:expired?'这次计划已结束':item.operationalStatus==='maintenance'?'维护中':secured?'已为你锁定':available?'这个时段可预约':'时段已占用或已结束',alternatives:available||expired?[]:replacements(id,plan.date,plan.slot,records,catalog,ids)};});
 const available=items.filter(item=>item.available).length;
 const reserved=items.filter(item=>item.secured).length,reservable=items.filter(item=>item.available&&!item.secured).length;
 const checked={...plan,expired,items,available,reserved,reservable,blocked:items.length-available,total:items.length,readiness:Math.round(available/items.length*100),checkedAt:new Date().toISOString(),capacityMeaning:'所选设备在目标时段可用或已为本人锁定的比例，不包含电量或归还状态'};
 return {...checked,planState:derivePlanState(checked,records)};
}
export function recommendCreative(value,records,catalog=equipment){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new BookingError('顾问没有返回有效装备方案，请重新描述你的计划。',502);
 const scene=creativeScenes.find(item=>item.id===value.sceneId);if(!scene)throw new BookingError('没有匹配到创作场景，请换一种描述。');
 checkMoment(value.date,value.slot);
 const requested=Array.isArray(value.equipmentIds)?value.equipmentIds:scene.ids;
 const valid=[...new Set(requested)].filter(id=>catalog.some(item=>item.id===id)).slice(0,4);
 const filtered=requested.some(id=>!catalog.some(item=>item.id===id));
 const equipmentIds=[...new Set([...valid,...scene.ids.filter(id=>catalog.some(item=>item.id===id))])].slice(0,Math.max(2,valid.length||scene.ids.length));
 const plan=inspectPlan({name:scene.name,sceneId:scene.id,date:value.date,slot:value.slot,equipmentIds},records,catalog);
 return {...plan,scene,notice:filtered?'没有找到部分设备，已根据设备库重新匹配。':null,reasoning:'设备由模型选择，空闲与替代方案由实时台账核对。'};
}
export function relationshipIds(id,catalog=equipment){
 const item=catalog.find(row=>row.id===id);if(!item)return [];
 const families={camera:['microphone','light','support','lens'],gimbal:['microphone','light','support'],drone:['camera','support'],microphone:['camera','recorder','light'],projector:['capture','microphone'],lens:['camera','support','light'],light:['camera','support'],support:['camera','microphone'],recorder:['microphone','support'],capture:['camera','microphone','light']};
 return (families[item.category]||[]).map(category=>catalog.find(row=>row.category===category&&row.operationalStatus==='active')?.id).filter(Boolean);
}
