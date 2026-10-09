import test from 'node:test';
import assert from 'node:assert/strict';
import {mountBookingFlow} from '../public/booking-flow.js';
import {equipment,localDate} from '../src/booking.js';
import {addDays} from '../src/planning.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// Exercise the real flow's handlers. This small DOM port has no layout/CSS claims.
function page(){
 const nodes=new Map(),documentEvents=new Map(),saved=new Map();
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes=new Map();this.events=new Map();this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.innerHTML='';const classes=new Set();this.classList={add:(...items)=>items.forEach(item=>classes.add(item)),remove:(...items)=>items.forEach(item=>classes.delete(item)),toggle:(item,on)=>{const enabled=on??!classes.has(item);enabled?classes.add(item):classes.delete(item);return enabled;}};}
  addEventListener(name,handler){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(handler);}
  invoke(name,event={}){return Promise.all((this.events.get(name)||[]).map(handler=>handler({preventDefault(){},...event})));}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];}
  setAttribute(key,value){this.attributes.set(key,String(value));}getAttribute(key){return this.attributes.get(key)||null;}
  querySelectorAll(selector){return selector.split(',').map(key=>nodes.get(key.trim())).filter(Boolean);}closest(){return null;}focus(){}
 }
 for(const selector of ['#booking-form','#booking-submit','#booking-empty','#booking-schedule','#booking-title','#booking-device-open','#booking-success','#booking-success-title','#booking-summary','#booking-checklist','#selection','#message','#smart-replace-booking','#week','#week-label','#week-prev','#week-next','#time-slots','.booking-section','.booking-head','.form-heading','[data-booking-back]'])nodes.set(selector,new Element(selector==='#booking-form'?'form':'div'));
 const form=nodes.get('#booking-form');form.elements=Object.fromEntries(['name','userId','equipmentId','date','slot','planId'].map(key=>[key,{value:''}]));
 const document={body:{dataset:{view:'booking'}},activeElement:null,querySelector:selector=>nodes.get(selector)||null,querySelectorAll:selector=>selector.split(',').map(key=>nodes.get(key.trim())).filter(Boolean),createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),addEventListener:(name,handler)=>{if(!documentEvents.has(name))documentEvents.set(name,[]);documentEvents.get(name).push(handler);},dispatchEvent:event=>{for(const handler of documentEvents.get(event.type)||[])handler(event);return true;}};
 const install={document,window:{addEventListener(){}},scrollY:340,localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)}};
 const old=Object.fromEntries(Object.keys(install).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));for(const [key,value]of Object.entries(install))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 return {nodes,form,document,restore(){for(const key of Object.keys(install)){if(old[key])Object.defineProperty(globalThis,key,old[key]);else delete globalThis[key];}}};
}
function flowFor(ui,{post,onUpdated,load}){
 let records=[],version=0;
 return mountBookingFlow({equipment,getRecords:()=>records,api:post,syncRecords:async options=>{const current=++version;return {records:await(load?.(options)||Promise.resolve([])),version:current};},setRecords:packet=>{if(packet.version!==version)return false;records=packet.records;return true;},onUpdated});
}
async function selectTime(ui){
 const date=addDays(localDate(),1);
 await ui.nodes.get('#week').children.find(item=>item.getAttribute('aria-label')==='选择'+date).invoke('click');await tick();
 await ui.nodes.get('#time-slots').children.find(item=>item.getAttribute('aria-label')==='选择14:00–16:00').invoke('click');await tick();
 assert.equal(ui.nodes.get('#booking-submit').disabled,false);
}

test('真实预约失败恢复GET等待时更换设备，旧409不禁用新设备的确认',async()=>{
 const ui=page();try{
  const recovery=deferred(),started=deferred();let hold=false;
  const flow=flowFor(ui,{post:async()=>{hold=true;throw new Error('旧相机已被预约');},onUpdated:async()=>{},load:()=>{if(hold){hold=false;started.resolve();return recovery.promise;}return Promise.resolve([]);}});
  flow.setUser({id:'a',name:'学生A'});flow.changeEquipment('camera');await tick();await selectTime(ui);
  const submitting=ui.form.invoke('submit');await started.promise;flow.changeEquipment('projector');await tick();
  recovery.resolve([]);await submitting;
  assert.deepEqual(flow.intent().equipmentIds,['projector']);assert.equal(flow.intent().slot,'14:00–16:00');assert.equal(ui.nodes.get('#booking-submit').disabled,false);assert.doesNotMatch(ui.nodes.get('#message').textContent,/旧相机/);
 }finally{ui.restore();}
});

test('真实预约成功后列表刷新等待时换身份，旧成功/失败不污染新草稿或关闭其选择器',async()=>{
 for(const failed of [false,true]){
  const ui=page();try{
   const refresh=deferred(),started=deferred(),booked=[];ui.document.addEventListener('borrow:booked',event=>booked.push(event.detail));
   const flow=flowFor(ui,{post:async(path,options)=>{const input=JSON.parse(options.body);return {atomic:true,requestId:input.requestId,date:input.date,slot:input.slot,records:input.equipmentIds.map(id=>({id:'receipt-'+id,equipmentId:id,userId:input.userId,date:input.date,slot:input.slot}))};},onUpdated:()=>{started.resolve();return refresh.promise;}});
   flow.setUser({id:'a',name:'学生A'});flow.changeEquipment('camera');await tick();await selectTime(ui);
   const submitting=ui.form.invoke('submit');await started.promise;flow.setUser({id:'b',name:'学生B'});flow.changeEquipment('projector');await tick();
   failed?refresh.reject(new Error('旧列表没有连接上')):refresh.resolve();await submitting;
   assert.equal(flow.intent().userId,'b');assert.deepEqual(flow.intent().equipmentIds,['projector']);assert.equal(flow.intent().receipt,undefined);assert.deepEqual(booked,[]);assert.doesNotMatch(ui.nodes.get('#message').textContent,/预约已确认|列表暂未更新/);
  }finally{ui.restore();}
 }
});
