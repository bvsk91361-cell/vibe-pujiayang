import { freeSlots } from './planning.js';
import {categories} from './catalog.js';
import {creativeScenes} from './creative.js';
export function filterEquipment(catalog,{category='all',query='',status='all',sort='recommended',scene=null,date,records=[]}={}){
 const keyword=query.trim().toLowerCase();const counts=new Map();for(const record of records)counts.set(record.equipmentId,(counts.get(record.equipmentId)||0)+1);
 const result=catalog.filter(item=>{
  if(category!=='all'&&item.category!==category)return false;
  if(scene&&!item.scenes.includes(scene))return false;
  const maintenance=item.operationalStatus==='maintenance',free=freeSlots(records,date,item.id).length;
  const availabilityQuery=/^(空闲|可借|可用)$/.test(keyword);
  const names=creativeScenes.filter(row=>row.ids.includes(item.id)).map(row=>row.name);
  if(availabilityQuery ? maintenance||free===0 : ![item.name,item.model,item.description,categories.find(row=>row.id===item.category)?.name,...names,...item.tags,...item.specs].join(' ').toLowerCase().includes(keyword))return false;
  return status==='all'||(status==='maintenance'&&maintenance)||(status==='available'&&!maintenance&&free>0)||(status==='booked'&&!maintenance&&free===0);
 });
 return result.sort((a,b)=>sort==='popular'?(counts.get(b.id)||0)-(counts.get(a.id)||0):sort==='new'?Number(b.isNew)-Number(a.isNew):sort==='name'?a.name.localeCompare(b.name,'zh-CN'):Number(b.recommended)-Number(a.recommended));
}
