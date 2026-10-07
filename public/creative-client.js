export function apiOptions(body,method='POST'){return {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};}
export function specLabel(value){return value.match(/USB(?:-C)?|HDMI|[\d.]+(?:GHz|MHz|fps|mm|min|万|K|p|W|g|h)?/i)?.[0]||value.slice(0,2);}
export function ringSvg(value,target,color='var(--accent)'){
 const percent=Math.max(0,Math.min(1,target?value/target:0)),length=2*Math.PI*45;
 return `<svg class="progress-ring" viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="45" class="ring-track"/><circle cx="55" cy="55" r="45" style="stroke:${color};stroke-dasharray:${length};stroke-dashoffset:${length*(1-percent)}"/></svg>`;
}
export function rankSearch(query,equipment,scenes,plans=[]){
 const term=query.trim().toLowerCase();const results=[];
 for(const item of equipment)if(!term||[item.name,item.description,item.productName,...item.tags,...item.specs].join(' ').toLowerCase().includes(term))results.push({type:'equipment',id:item.id,title:item.name,subtitle:item.productName||item.description});
 for(const scene of scenes)if(!term||[scene.name,scene.description,scene.id].join(' ').toLowerCase().includes(term))results.push({type:'scene',id:scene.id,title:scene.name,subtitle:'把灵感变成一套装备'});
 for(const plan of plans)if(!term||plan.name.toLowerCase().includes(term))results.push({type:'plan',id:plan.id,title:plan.name,subtitle:'继续准备你的计划'});
 if(term)results.unshift({type:'ai',id:query,title:'问智能设备顾问',subtitle:query});return results.slice(0,15);
}
