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
