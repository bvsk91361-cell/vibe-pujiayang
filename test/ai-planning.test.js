import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiAssistant as createAssistant } from '../src/ai.js';
import { legacyEquipment } from '../src/catalog.js';
const createAiAssistant=options=>createAssistant({...options,catalog:legacyEquipment});
import { addDays, freeSlots, planSummary } from '../src/planning.js';
import { validateBooking, localDate } from '../src/booking.js';
const config={YOSHUB_API_KEY:'unit-test-secret',YOSHUB_BASE_URL:'https://unit-test.example/v1',YOSHUB_MODEL:'test-model'};
const response=content=>({ok:true,json:async()=>({choices:[{message:{content}}],usage:{prompt_tokens:12,completion_tokens:8}})});
const report=JSON.stringify({sections:{overview:['window','count','sample'],popular:['popular'],peak:['peak'],lowBooking:['lowBooking'],occupancy:['utilization']},suggestions:['collect-samples','review-plan']});

test('规划统计由真实记录生成，七天容量、跨月日期和时间终点正确',()=>{
 const now=new Date('2026-10-07T11:00:00');
 assert.deepEqual(freeSlots([], '2026-10-07','camera',now),['14:00–16:00','19:00–21:00']);
 assert.deepEqual(freeSlots([], '2026-10-06','camera',now),[]);
 assert.equal(addDays('2026-12-30',3),'2027-01-02');
 const summary=planSummary([{equipmentId:'camera',date:'2026-10-07',slot:'14:00–16:00'},{equipmentId:'projector',date:'2026-10-14',slot:'14:00–16:00'}],'2026-10-07',legacyEquipment);
 assert.equal(summary.total,1);assert.equal(summary.capacity,63);assert.equal(summary.devices[0].booked,1);
 assert.throws(()=>validateBooking({name:'测试',equipmentId:'camera',date:'2026-10-07',slot:'09:00–11:00'},[],'2026-10-07',now),/已经结束/);
});

test('AI未配置时明确503，不发送外部请求',async()=>{
 let called=false;const ai=createAiAssistant({config:{},fetchImpl:async()=>{called=true;}});
 await assert.rejects(ai.assist({mode:'report'},[]),error=>error.status===503);
 assert.equal(called,false);assert.equal(ai.status().configured,false);
});

test('周报仅发送汇总台账，不发送预约人姓名或泄露密钥；usage来自接口',async()=>{
 let sent;const ai=createAiAssistant({config,fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return response(report);}});
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
 const ai=createAiAssistant({config,fetchImpl:async()=>response(report)});
 for(let index=0;index<20;index++)await ai.assist({mode:'report'},[]);
 await assert.rejects(ai.assist({mode:'report'},[]),error=>error.status===429);
 const invalid=createAiAssistant({config:{...config,YOSHUB_BASE_URL:'http://unit-test.example'},fetchImpl:async()=>{throw new Error('Should not call');}});
 await assert.rejects(invalid.assist({mode:'report'},[]),error=>error.status===503);
});

test('Yos Hub默认地址和模型生效，密钥只进入服务端Authorization，不进入返回状态',async()=>{
 let request;
 const ai=createAiAssistant({config:{YOSHUB_API_KEY:'server-only-fixture'},fetchImpl:async(url,options)=>{request={url,options};return response(report);}});
 await ai.assist({mode:'report'},[]);
 assert.equal(request.url,'https://api.yoshub.com/v1/chat/completions');
 assert.equal(JSON.parse(request.options.body).model,'deepseek-v4-flash');
 assert.equal(request.options.headers.Authorization,'Bearer server-only-fixture');
 assert.equal(ai.status().model,'deepseek-v4-flash');
 assert.equal(JSON.stringify(ai.status()).includes('server-only-fixture'),false);
 const legacy=createAiAssistant({config:{AI_API_KEY:'unused-legacy-value'}});
 assert.equal(legacy.status().configured,false);
});

test('报告输出截断或只有标题时不能显示为有效报告，截断usage仍计入统计',async()=>{
 const truncated=createAiAssistant({config,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'报告标题'}}],usage:{prompt_tokens:10,completion_tokens:800}})})});
 await assert.rejects(truncated.assist({mode:'report'},[]),error=>error.status===502&&/截断/.test(error.message));
 assert.equal(truncated.status().completionTokens,1600);
 const short=createAiAssistant({config,fetchImpl:async()=>response('报告标题')});
 await assert.rejects(short.assist({mode:'report'},[]),error=>error.status===502&&/不完整/.test(error.message));
});
