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

export function aiErrorMessage(error){
 const message=error?.message||'';
 if(/^(请(?:先)?选择|请一次|时段描述不一致|问题需为)/.test(message))return message;
 if(/超时/.test(message)||error?.name==='TimeoutError')return '这次思考超时了，请再试一次';
 if(/长度上限|内容被截断|空内容|不是有效JSON|安全长度/.test(message))return '这次建议没有生成完整，请重试';
 if(/20次AI调用上限/.test(message))return '今天的智能推荐次数已用完，可以通过场景选择设备';
 if(/额度不足/.test(message))return '智能推荐服务额度不足，请联系管理员';
 if(/上一条请求/.test(message))return '上一条建议仍在生成，请稍候再试';
 if(/限流/.test(message))return '智能推荐请求较多，请稍后重试';
 if(/无法连接模型服务/.test(message))return '暂时无法连接智能推荐服务，请检查网络后重试';
 if(/授权失败|尚未配置|配置无效/.test(message))return '智能推荐连接需要检查，请联系管理员';
 return '这次没有生成完整结果，请再试一次';
}
