import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {prepareDemo} from './demo-day.js';
import {createApp} from '../server.js';
import {createAiAssistant} from '../src/ai.js';
import {reservationStatus} from '../public/reservation-view.js';
import {slots} from '../src/booking.js';
import {freeSlots} from '../src/planning.js';

// This checks the HTTP story on a new isolated ledger. It does not claim a spoken/browser rehearsal.
const {store,context,file}=prepareDemo(),server=createApp(store,createAiAssistant({config:{}}),{demo:context});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,started=performance.now(),steps=[];
const request=async(path,input,method='POST')=>{const response=await fetch(base+path,input?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{method:'GET'});return {status:response.status,body:await response.json()};};
async function stage(name,action){const start=performance.now();const result=await action();steps.push({name,milliseconds:Math.round(performance.now()-start),status:'PASS',result});}
const [a,b]=context.users,date=context.tomorrow,slot=slots[1];let receipt;
try{
 await stage('设备台账与场景真实',async()=>{const {body}=await request('/api/equipment'),scenes=(await request('/api/scenes')).body;assert.equal(body.equipment.length,28);assert.equal(new Set(body.equipment.map(item=>item.category)).size,10);assert.ok(scenes.find(scene=>scene.id==='interview').ids.every(id=>body.equipment.some(item=>item.id===id)));return {equipment:28,categories:10,maintenance:body.equipment.filter(item=>item.operationalStatus==='maintenance').length};});
 await stage('学生A整套预约并核对真实凭证',async()=>{const result=await request('/api/reservations/batch',{userId:a.id,equipmentIds:['camera','microphone-m1','support-t2'],date,slot,requestId:randomUUID(),name:'校园采访 · 技术验收'});assert.equal(result.status,201);receipt=result.body;assert.equal(receipt.atomic,true);assert.equal(receipt.records.length,3);return {status:201,count:3,atomic:true,ids:receipt.records.map(row=>row.id)};});
 await stage('学生B同设备同槽被拒绝',async()=>{const result=await request('/api/reservations',{userId:b.id,equipmentId:'camera',date,slot});assert.equal(result.status,409);return {status:409};});
 await stage('不同设备与不同时段分别允许',async()=>{for(const input of [{userId:b.id,equipmentId:'camera',date,slot:slots[0]},{userId:b.id,equipmentId:'recorder',date,slot}])assert.equal((await request('/api/reservations',input)).status,201);return {differentSlot:201,differentEquipment:201};});
 await stage('我的预约归属及越权取消拒绝',async()=>{const own=(await request('/api/workspace?userId='+a.id)).body;assert.ok(receipt.records.every(row=>own.history.some(record=>record.id===row.id)));assert.ok(own.history.every(row=>row.userId===a.id));const other=await fetch(base+'/api/reservations/'+receipt.records[0].id+'?userId='+b.id,{method:'DELETE'});assert.equal(other.status,403);return {foreignCancellation:403,ownedRecords:true};});
 await stage('取消真实释放，学生B重新预约成功',async()=>{for(const row of receipt.records){const result=await fetch(base+'/api/reservations/'+row.id+'?userId='+a.id,{method:'DELETE'});assert.equal(result.status,200);}assert.equal((await request('/api/reservations',{userId:b.id,equipmentId:'camera',date,slot})).status,201);const own=(await request('/api/workspace?userId='+a.id)).body;assert.ok(receipt.records.every(row=>own.history.some(record=>record.id===row.id&&record.status==='cancelled')));return {cancelled:3,rebookStatus:201};});
 await stage('到期标记与真实时钟对应',async()=>{const own=(await request('/api/workspace?userId='+a.id)).body,labels=[...new Set(own.history.map(row=>reservationStatus(row).label))];assert.ok(labels.includes('待使用'));assert.ok(labels.includes('已到期'));return {labels,inProgressAvailableNow:labels.includes('使用时段中'),note:'使用中只能在真实营业时段展示；边界由自动测试另验'};});
 await stage('无模型配置也能回答老师自然查询',async()=>{const result=await request('/api/ai/assist',{mode:'availability',question:'下周一下午有空闲的投影仪吗？'});assert.equal(result.status,200);assert.equal(result.body.provider,'ledger');assert.equal(result.body.attempts,0);assert.ok(result.body.matches.every(row=>row.id.startsWith('projector')));return {provider:'ledger',date:result.body.query.date,matches:result.body.matches.length};});
 await stage('热力图和替代建议核对真实台账',async()=>{const heatmap=(await request('/api/heatmap')).body;assert.equal(heatmap.dates.length,7);assert.equal(heatmap.days.find(day=>day.date===date).booked,4);const replacements=(await request('/api/replacements?equipmentId=camera&date='+date+'&slot='+encodeURIComponent(slot))).body;assert.ok(replacements.length>0);const records=(await request('/api/reservations')).body;assert.ok(replacements.every(item=>item.id!=='camera'&&item.operationalStatus==='active'&&freeSlots(records,date,item.id).includes(slot)));return {bookedTomorrow:4,alternatives:replacements.map(item=>item.id)};});
 const result={checkedAt:new Date().toISOString(),kind:'isolated-http-story-not-browser-or-spoken-rehearsal',database:file,milliseconds:Math.round(performance.now()-started),upstreamCalls:0,steps};writeFileSync('data/course-demo-story.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await new Promise(resolve=>server.close(resolve));store.close();}
