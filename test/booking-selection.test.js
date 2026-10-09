import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingIntent,changeBookingEquipment} from '../public/booking-intent.js';
import {createBookingAvailability} from '../public/booking-flow.js';
import {equipment,localDate} from '../src/booking.js';
import {addDays} from '../src/planning.js';

const date=()=>addDays(localDate(),1),slot='14:00–16:00';
const intent=()=>bookingIntent({name:'相机预约',equipmentIds:['camera'],date:date(),slot,source:'equipment',planId:'saved-plan'},'u',equipment,{sourceView:'equipment',sourceY:540});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

test('空预约从真实选择建立单件草稿，不默认设备/日期/时段，身份与滚动上下文保留',()=>{
 const selected=changeBookingEquipment(null,'projector',equipment,{userId:'u',sourceView:'equipment',sourceY:540});
 assert.deepEqual(selected.equipmentIds,['projector']);assert.equal(selected.date,'');assert.equal(selected.slot,'');assert.equal(selected.name,equipment.find(item=>item.id==='projector').name);assert.equal(selected.userId,'u');assert.equal(selected.sourceY,540);assert.equal(selected.receipt,undefined);
 assert.throws(()=>changeBookingEquipment(null,'unknown',equipment,{userId:'u'}));assert.throws(()=>changeBookingEquipment(null,'camera',equipment,{userId:null}));
});

test('更换单件保留日期/时段/来源及滚动位置，幂等ID重建且不修改保存的方案',()=>{
 const previous=intent(),changed=changeBookingEquipment(previous,'projector',equipment);
 assert.deepEqual(changed.equipmentIds,['projector']);for(const key of ['date','slot','source','sourceView','sourceY','userId'])assert.equal(changed[key],previous[key]);assert.notEqual(changed.requestId,previous.requestId);assert.equal(changed.planId,null);assert.equal(previous.planId,'saved-plan');assert.deepEqual(previous.equipmentIds,['camera']);assert.equal(changeBookingEquipment(previous,'camera',equipment),previous);
 assert.throws(()=>changeBookingEquipment({...previous,receipt:{}},'projector',equipment),/已经完成/);assert.throws(()=>changeBookingEquipment(previous,'projector',equipment,{userId:'other'}),/身份/);
});

test('组合只替换指定目标，保留其余设备；重复、维护、错误目标均拒绝',()=>{
 const previous=bookingIntent({name:'校园采访',equipmentIds:['camera','microphone-m1','support-t2'],date:date(),slot,source:'scene'},'u',equipment),changed=changeBookingEquipment(previous,'camera-c2',equipment,{replaceId:'camera'});
 assert.deepEqual(changed.equipmentIds,['camera-c2','microphone-m1','support-t2']);assert.equal(changed.name,previous.name);assert.equal(changed.slot,previous.slot);assert.deepEqual(previous.equipmentIds,['camera','microphone-m1','support-t2']);
 assert.throws(()=>changeBookingEquipment(previous,'camera-c2',equipment),/请选择要更换/);assert.throws(()=>changeBookingEquipment(previous,'microphone-m1',equipment,{replaceId:'camera'}),/已经在/);assert.throws(()=>changeBookingEquipment(previous,'camera-c2',equipment,{replaceId:'projector'}),/不在当前/);assert.throws(()=>changeBookingEquipment(previous,equipment.find(item=>item.operationalStatus==='maintenance').id,equipment,{replaceId:'camera'}),/不可预约/);
});

test('快速切换设备：即使旧GET不理会Abort，只有新草稿响应可以提交台账',async()=>{
 const pending=[],states=[],commits=[];let key='u:camera';
 const request=createBookingAvailability({load:({signal})=>{const job=deferred();pending.push({...job,signal});return job.promise;},commit:packet=>{commits.push(packet);return true;},key:()=>key,onState:state=>states.push(state)});
 const old=request.run();key='u:projector';const fresh=request.run();assert.equal(pending[0].signal.aborted,true);
 pending[1].resolve({records:['fresh'],version:2});assert.equal(await fresh,true);pending[0].resolve({records:['old'],version:1});assert.equal(await old,false);assert.deepEqual(commits,[{records:['fresh'],version:2}]);assert.deepEqual(states.at(-1),{checking:false,error:''});
});

test('共享台账版本拒绝旧包时不能放行确认；普通最新刷新能结束旧核对',async()=>{
 const states=[],pending=deferred();let accept=false;
 const request=createBookingAvailability({load:()=>pending.promise,commit:()=>accept,key:()=> 'u:draft',onState:state=>states.push(state)});
 const waiting=request.run();pending.resolve({records:[],version:1});assert.equal(await waiting,false);assert.equal(states.at(-1).checking,false);assert.match(states.at(-1).error,/重新核对/);
 request.acceptFresh();assert.deepEqual(states.at(-1),{checking:false,error:''});accept=true;assert.equal(await request.run(),true);
});

test('网络失败和超时只有一次请求；身份切换与最新刷新不被旧响应恢复',async()=>{
 let networkCalls=0;const networkStates=[];const failed=createBookingAvailability({load:async()=>{networkCalls++;throw new TypeError('network');},commit:()=>{throw new Error('不得提交网络失败结果');},key:()=> 'u:draft',onState:state=>networkStates.push(state)});assert.equal(await failed.run(),false);assert.equal(networkCalls,1);assert.match(networkStates.at(-1).error,/重试/);
 let calls=0;const states=[];const timeout=createBookingAvailability({load:({signal})=>new Promise((resolve,reject)=>{calls++;const timer=setTimeout(resolve,30);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});}),commit:()=>{throw new Error('不得提交超时结果');},key:()=> 'u:draft',onState:state=>states.push(state),timeoutMs:5});assert.equal(await timeout.run(),false);assert.equal(calls,1);assert.match(states.at(-1).error,/超时/);
 const pending=deferred();let key='a:draft',commits=0;const switched=createBookingAvailability({load:()=>pending.promise,commit:()=>{commits++;return true;},key:()=>key,onState:state=>states.push(state)});const old=switched.run();key='b:draft';switched.acceptFresh();pending.resolve({records:['old-user'],version:1});assert.equal(await old,false);assert.equal(commits,0);assert.deepEqual(states.at(-1),{checking:false,error:''});
});
