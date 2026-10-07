const key='borrow-lab-preferences-v1';
export const defaultPreferences={font:'standard',reduceMotion:false};
function sanitize(value){return {font:['standard','large','xlarge'].includes(value?.font)?value.font:'standard',reduceMotion:value?.reduceMotion===true};}
export function loadPreferences(storage){try{return sanitize(JSON.parse(storage.getItem(key)||'{}'));}catch{return {...defaultPreferences};}}
export function savePreferences(storage,value){const safe=sanitize(value);try{storage.setItem(key,JSON.stringify(safe));return {value:safe,saved:true};}catch{return {value:safe,saved:false};}}
export const previewAccounts=[{id:'pu',name:'蒲嘉洋',avatar:'蒲',role:'校园创作者'},{id:'a',name:'创作组同学A',avatar:'A',role:'影像探索者'},{id:'b',name:'创作组同学B',avatar:'B',role:'声音记录者'},{id:'guest',name:'游客体验账号',avatar:'访',role:'初次体验'}];
