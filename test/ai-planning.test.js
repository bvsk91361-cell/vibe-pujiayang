import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiAssistant } from '../src/ai.js';
import { addDays, freeSlots, planSummary } from '../src/planning.js';
import { validateBooking, localDate } from '../src/booking.js';
const config={AI_API_KEY:'unit-test-secret',AI_BASE_URL:'https://unit-test.example/v1',AI_MODEL:'test-model'};
const response=content=>({ok:true,json:async()=>({choices:[{message:{content}}],usage:{prompt_tokens:12,completion_tokens:8}})});

test('规划统计由真实记录生成，七天容量、跨月日期和时间终点正确',()=>{
 const now=new Date('2026-10-07T11:00:00');
 assert.deepEqual(freeSlots([], '2026-10-07','camera',now),['14:00–16:00','19:00–21:00']);
 assert.deepEqual(freeSlots([], '2026-10-06','camera',now),[]);
 assert.equal(addDays('2026-12-30',3),'2027-01-02');
 const summary=planSummary([{equipmentId:'camera',date:'2026-10-07',slot:'14:00–16:00'},{equipmentId:'projector',date:'2026-10-14',slot:'14:00–16:00'}],'2026-10-07');
 assert.equal(summary.total,1);assert.equal(summary.capacity,63);assert.equal(summary.devices[0].booked,1);
 assert.throws(()=>validateBooking({name:'测试',equipmentId:'camera',date:'2026-10-07',slot:'09:00–11:00'},[],'2026-10-07',now),/已经结束/);
});

test('AI未配置时明确503，不发送外部请求',async()=>{
 let called=false;const ai=createAiAssistant({config:{},fetchImpl:async()=>{called=true;}});
 await assert.rejects(ai.assist({mode:'report'},[]),error=>error.status===503);
 assert.equal(called,false);assert.equal(ai.status().configured,false);
});

test('周报仅发送汇总台账，不发送预约人姓名或泄露密钥；usage来自接口',async()=>{
 let sent;const ai=createAiAssistant({config,fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return response('尚无趋势，先观察预约计划。');}});
 const output=await ai.assist({mode:'report'},[{name:'私密测试姓名',equipmentId:'camera',date:localDate(),slot:'19:00–21:00'}]);
 assert.equal(output.model,'test-model');assert.equal(sent.messages[1].content.includes('私密测试姓名'),false);assert.equal(JSON.stringify(ai.status()).includes('unit-test-secret'),false);
 assert.equal(ai.status().promptTokens,12);assert.equal(output.source.total,1);
});

test('空闲查询严格解析模型条件，空闲列表按台账计算而非模型推测',async()=>{
 const date=addDays(localDate(),1);const ai=createAiAssistant({config,fetchImpl:async()=>response(JSON.stringify({date,equipmentId:'projector',slot:'14:00–16:00'}))});
 const output=await ai.assist({mode:'availability',question:'明天下午有投影仪吗？'},[{equipmentId:'projector',date,slot:'14:00–16:00'}]);
 assert.deepEqual(output.matches[0].slots,[]);assert.match(output.text,/已被预约/);
});

test('模型格式、未知设备和日期异常必须拒绝，不能当成正确空闲答案',async()=>{
 for(const content of ['not-json',JSON.stringify({date:'2099-02-30',equipmentId:null,slot:null}),JSON.stringify({date:localDate(),equipmentId:'unknown',slot:null}),JSON.stringify({date:localDate(),equipmentId:null,slot:'25:00'})]){
  const ai=createAiAssistant({config,fetchImpl:async()=>response(content)});
  await assert.rejects(ai.assist({mode:'availability',question:'查空闲'},[]),error=>error.status===502);
 }
});

test('模型401、额度、网络、超时等错误提供安全兜底，不暴露上游内容',async()=>{
 for(const status of [401,402,429,500]){
  const ai=createAiAssistant({config,fetchImpl:async()=>({ok:false,status,json:async()=>({error:'unit-test-secret'})})});
  await assert.rejects(ai.assist({mode:'report'},[]),error=>!error.message.includes('unit-test-secret')&&[502,503].includes(error.status));
 }
 for(const name of ['TypeError','TimeoutError']){
  const ai=createAiAssistant({config,fetchImpl:async()=>{const error=new Error('unit-test-secret');error.name=name;throw error;}});
  await assert.rejects(ai.assist({mode:'report'},[]),error=>!error.message.includes('unit-test-secret')&&[502,504].includes(error.status));
 }
});

test('模型每日调用上限阻止重复消耗，HTTPS地址必须有效',async()=>{
 const ai=createAiAssistant({config,fetchImpl:async()=>response('报告')});
 for(let index=0;index<20;index++)await ai.assist({mode:'report'},[]);
 await assert.rejects(ai.assist({mode:'report'},[]),error=>error.status===429);
 const invalid=createAiAssistant({config:{...config,AI_BASE_URL:'http://unit-test.example'},fetchImpl:async()=>{throw new Error('Should not call');}});
 await assert.rejects(invalid.assist({mode:'report'},[]),error=>error.status===503);
});
