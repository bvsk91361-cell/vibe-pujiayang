// Manual local verification only. Never included in npm test or CI.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { localDate } from '../src/booking.js';
import { addDays } from '../src/planning.js';
import { bookingContext, answerQuery } from '../src/ai-context.js';
const base='http://localhost:3004';
const path=new URL('../docs/验收证据/国赛阶段1-真实AI.json',import.meta.url);
const evidence={date:localDate(),timestamp:new Date().toISOString(),kind:'手动本机真模型验收，非CI',platform:'Yos Hub API',model:'deepseek-v4-flash',checks:[],fixture:'临时预约通过当前HTTP业务接口写入真实本机存储，结束后只取消本脚本创建的记录',cleanup:false};
async function api(path,options){
 const response=await fetch(base+path,{...options,signal:AbortSignal.timeout(40000)});
 const result=await response.json();
 if(!response.ok)throw Object.assign(new Error(result.error||'Local API failed'),{status:response.status});
 return result;
}
const post=(path,value)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
async function save(){await writeFile(path,JSON.stringify(evidence,null,2)+'\n');}
async function check(label,input,verify){
 const start=Date.now();const result=await post('/api/ai/assist',input);await verify(result);
 const item={label,status:'pass',elapsedMs:Date.now()-start,text:result.text,sections:result.sections,query:result.query,matches:result.matches,source:result.source,usage:result.usage,attempts:result.attempts,finishReason:result.finishReason};
 evidence.checks.push(item);await save();console.log(JSON.stringify({label,status:'pass',elapsedMs:item.elapsedMs,attempts:item.attempts,usage:item.usage}));
}
const created=[];let baseline;
try{
 const status=await api('/api/ai/status');assert.equal(status.configured,true);assert.equal(status.model,'deepseek-v4-flash');
 baseline=await api('/api/reservations');
 if(baseline.length)throw new Error('Local acceptance requires an empty baseline; no existing records were changed.');
 const verifyReport=records=>result=>{
  const actual=bookingContext(records);assert.equal(result.sections.length,6);assert.equal(result.source.total,actual.stats.total);assert.deepEqual(result.source.devices,actual.stats.devices);assert.deepEqual(result.source.slotCounts,actual.stats.slotCounts);
  assert.match(result.text,/当前样本不足/);assert.match(result.text,/实际利用情况无法判断/);assert.ok(result.text.length>=300);
 };
 await check('无预约：完整六部分周报',{mode:'report'},verifyReport(baseline));
 const date=addDays(localDate(),1),next=addDays(localDate(),2);
 for(const item of [{equipmentId:'projector',date,slot:'14:00–16:00'},{equipmentId:'camera',date,slot:'14:00–16:00'},{equipmentId:'recorder',date:next,slot:'14:00–16:00'},{equipmentId:'camera',date:next,slot:'19:00–21:00'}]){
  const added=await post('/api/reservations',{...item,name:'国赛阶段1临时验收'});created.push(added.id);
 }
 const records=await api('/api/reservations');
 evidence.fixtureRecords=records.map(({equipmentId,date,slot})=>({equipmentId,date,slot}));
 await check('有预约：六部分周报统计核对',{mode:'report'},verifyReport(records));
 for(const [question,expected]of [
  ['明天下午有投影仪吗？',{intent:'availability',date,equipmentId:'projector',slot:'14:00–16:00'}],
  ['10月8日下午有哪些设备可以预约？',{intent:'availability',date:'2026-10-08',equipmentId:null,slot:'14:00–16:00'}],
  ['如果投影仪已经被预约了，有什么替代设备？',{intent:'alternatives',date:null,equipmentId:'projector',slot:null}],
  ['总结目前最忙的预约时段。',{intent:'peak',date:null,equipmentId:null,slot:null}]
 ]){
  await check(question,{mode:'availability',question},result=>{
   assert.deepEqual(result.query,expected);
   const verified=answerQuery(bookingContext(records),expected);assert.deepEqual(result.matches,verified.matches);assert.equal(result.text,verified.text);
  });
 }
}catch(error){
 evidence.checks.push({label:'真实验收中断',status:'fail',httpStatus:error.status||null,error:error.status?error.message:'验证断言未通过，或验收前置条件不满足；请核对当前台账和返回内容'});console.log(JSON.stringify(evidence.checks.at(-1)));process.exitCode=1;
}finally{
 for(const id of created){try{await api('/api/reservations/'+id,{method:'DELETE'});}catch{evidence.cleanupError=true;process.exitCode=1;}}
 evidence.cleanup=!evidence.cleanupError;
 if(baseline){const after=await api('/api/reservations');evidence.baselineRestored=JSON.stringify(after)===JSON.stringify(baseline);if(!evidence.baselineRestored)process.exitCode=1;}
 evidence.summary={passed:evidence.checks.filter(item=>item.status==='pass').length,failed:evidence.checks.filter(item=>item.status==='fail').length};await save();console.log(JSON.stringify(evidence.summary));
}
