import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiAssistant as createAssistant } from '../src/ai.js';
import { legacyEquipment } from '../src/catalog.js';
const createAiAssistant=options=>createAssistant({...options,catalog:legacyEquipment});
import { bookingContext } from '../src/ai-context.js';
import { localDate } from '../src/booking.js';
import { addDays } from '../src/planning.js';
const config={YOSHUB_API_KEY:'mock-only-credential',YOSHUB_BASE_URL:'https://mock.example/v1'};
const selection={sections:{overview:['window','count','sample'],popular:['popular'],peak:['peak'],anomalies:['anomalies'],utilization:['utilization']},suggestions:['collect-samples','review-plan']};
const content=JSON.stringify(selection);
const reply=(text=content,reason='stop')=>({ok:true,json:async()=>({choices:[{finish_reason:reason,message:{content:text}}],usage:{prompt_tokens:10,completion_tokens:20}})});
const tomorrow=()=>addDays(localDate(),1);
const row=(equipmentId='projector',date=tomorrow(),slot='14:00–16:00')=>({equipmentId,date,slot});

test('空台账周报完整六节、两条建议，明确样本不足和无法推断实际利用',async()=>{
 const ai=createAiAssistant({config,fetchImpl:async()=>reply()});
 const result=await ai.assist({mode:'report'},[]);
 assert.equal(result.sections.length,6);assert.equal(result.selection.suggestions.length,2);
 assert.match(result.text,/当前样本不足/);assert.match(result.text,/有效预约 0 条/);
 assert.match(result.text,/实际利用情况无法判断/);assert.ok(result.text.length>=300);
 assert.equal(result.attempts,1);assert.equal(result.finishReason,'stop');
});
test('有预约周报准确计数、热门设备、高峰和异常，重复或非法记录不虚增占用',async()=>{
 const date=tomorrow();const records=[row(),row('camera'),row('camera',date,'19:00–21:00'),row(),row('nonexistent')];
 const ai=createAiAssistant({config,fetchImpl:async()=>reply()});
 const result=await ai.assist({mode:'report'},records);
 assert.equal(result.source.total,3);assert.equal(result.source.capacity,63);
 assert.deepEqual(result.source.anomalies,{duplicates:1,invalid:1});
 assert.deepEqual(result.source.peak,[{slot:'14:00–16:00',count:2}]);
 assert.equal(result.source.popular[0].id,'camera');assert.match(result.text,/数码相机 2 条/);
 assert.match(result.text,/预约占比 4.8%/);assert.match(result.text,/2\/21/);
});
test('空内容最多自动重试一次，第二次仍为空清晰失败',async()=>{
 let calls=0;const ai=createAiAssistant({config,fetchImpl:async()=>{calls++;return reply('');}});
 await assert.rejects(ai.assist({mode:'report'},[]),/已尝试2次.*空内容/);assert.equal(calls,2);
});
test('标题过短最多重试一次且不作为成功周报返回',async()=>{
 let calls=0;const ai=createAiAssistant({config,fetchImpl:async()=>{calls++;return reply('本周周报');}});
 await assert.rejects(ai.assist({mode:'report'},[]),/已尝试2次.*过短/);assert.equal(calls,2);
});
test('长度截断后一次重试可成功，token上限固定1800/2400，累计两次usage',async()=>{
 const limits=[];const ai=createAiAssistant({config,fetchImpl:async(url,options)=>{
  limits.push(JSON.parse(options.body).max_tokens);return limits.length===1?reply('标题','length'):reply();
 }});
 const result=await ai.assist({mode:'report'},[]);
 assert.deepEqual(limits,[1800,2400]);assert.equal(result.attempts,2);
 assert.deepEqual(result.usage,{prompt_tokens:20,completion_tokens:40});
});
test('模型引用不存在的数据或遗漏章节时拒绝，一次重试后停止',async()=>{
 for(const value of [{...selection,sections:{...selection.sections,peak:['fabricated']}},{...selection,suggestions:['imaginary-device','review-plan']}]){
  let calls=0;const ai=createAiAssistant({config,fetchImpl:async()=>{calls++;return reply(JSON.stringify(value));}});
  await assert.rejects(ai.assist({mode:'report'},[]),/已尝试2次/);assert.equal(calls,2);
 }
});
test('上游429与500不自动重试、不透传包含敏感值的错误正文',async()=>{
 for(const status of [429,500]){
  let calls=0;const ai=createAiAssistant({config,fetchImpl:async()=>{calls++;return {ok:false,status,json:async()=>{throw new Error(config.YOSHUB_API_KEY);}};}});
  await assert.rejects(ai.assist({mode:'report'},[]),error=>!error.message.includes(config.YOSHUB_API_KEY)&&[502,503].includes(error.status));assert.equal(calls,1);
 }
});
test('超时信号生效并返回504，不因超时触发额外调用',async()=>{
 let calls=0;const ai=createAiAssistant({config,timeoutMs:10,fetchImpl:async(url,{signal})=>{
  calls++;return new Promise((resolve,reject)=>{const keepAlive=setTimeout(()=>reject(new Error('timeout not enforced')),100);signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(signal.reason);},{once:true});});
 }});
 await assert.rejects(ai.assist({mode:'report'},[]),error=>error.status===504);assert.equal(calls,1);
});
test('HTTP非JSON响应不自动重试；模型非法JSON重试一次后停止',async()=>{
 let calls=0;const ai=createAiAssistant({config,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>{throw new SyntaxError('HTML');}};}});
 await assert.rejects(ai.assist({mode:'report'},[]),/非JSON/);assert.equal(calls,1);
 let malformedCalls=0;const malformed=createAiAssistant({config,fetchImpl:async()=>{malformedCalls++;return reply('x'.repeat(200));}});
 await assert.rejects(malformed.assist({mode:'report'},[]),/已尝试2次.*有效JSON/);assert.equal(malformedCalls,2);
});
test('查询先发送真实设备和匿名预约上下文，再按完整台账核对占用；输出token受限',async()=>{
 let body;const date=tomorrow();const records=[{...row(),name:'不应出境的姓名',id:'private-id'}];
 const ai=createAiAssistant({config,fetchImpl:async(url,options)=>{body=JSON.parse(options.body);return reply(JSON.stringify({intent:'availability',date,equipmentId:null,slot:'14:00–16:00'}));}});
 const result=await ai.assist({mode:'availability',question:'明天下午有哪些设备？'},records);
 const sent=JSON.parse(body.messages[1].content);assert.equal(sent.context.catalog.length,3);assert.deepEqual(sent.context.reservations,[row()]);
 assert.equal(JSON.stringify(body).includes('不应出境的姓名'),false);assert.equal(JSON.stringify(body).includes('private-id'),false);
 assert.equal(body.max_tokens,1800);assert.equal(result.matches.find(item=>item.name==='便携投影仪').slots.length,0);
 assert.equal(result.matches.find(item=>item.name==='录音笔').slots.length,1);
});
test('替代查询不把相机或录音笔冒充投影设备；最忙时段结论由实际记录计算',async()=>{
 const ai=createAiAssistant({config,fetchImpl:async(url,options)=>reply(JSON.stringify(JSON.parse(options.body).messages[1].content.includes('替代')?{intent:'alternatives',date:null,equipmentId:'projector',slot:null}:{intent:'peak',date:null,equipmentId:null,slot:null}))});
 const alternative=await ai.assist({mode:'availability',question:'投影仪替代设备？'},[row()]);
 assert.deepEqual(alternative.matches,[]);assert.match(alternative.text,/没有同等用途替代设备/);
 const peak=await ai.assist({mode:'availability',question:'最忙的时段？'},[row(),row('camera')]);
 assert.match(peak.text,/14:00–16:00 2 条/);assert.match(peak.text,/当前样本不足/);
});
test('连续并发请求整段处理期间被拒绝，避免双重API消耗；释放后可再次使用',async()=>{
 let release;let calls=0;const ai=createAiAssistant({config,fetchImpl:async()=>{calls++;await new Promise(resolve=>{release=resolve;});return reply();}});
 const first=ai.assist({mode:'report'},[]);
 await assert.rejects(ai.assist({mode:'report'},[]),error=>error.status===429);assert.equal(calls,1);
 release();await first;
 const second=ai.assist({mode:'report'},[]);release();await second;assert.equal(calls,2);
});
test('用户输入过长在调用前拒绝；查询空或截断不自动重试',async()=>{
 let calls=0;const ai=createAiAssistant({config,fetchImpl:async()=>{calls++;return reply();}});
 await assert.rejects(ai.assist({mode:'availability',question:'问'.repeat(301)},[]),error=>error.status===422);assert.equal(calls,0);
 for(const [text,reason]of [['','stop'],['部分','length']]){
  let count=0;const bad=createAiAssistant({config,fetchImpl:async()=>{count++;return reply(text,reason);}});
  await assert.rejects(bad.assist({mode:'availability',question:'查询'},[]),error=>error.status===502);assert.equal(count,1);
 }
});
test('七天窗口外的预约不计入周报，但指定日期查询仍使用完整真实台账',async()=>{
 const date=addDays(localDate(),10);const records=[row('projector',date)];
 assert.equal(bookingContext(records).stats.total,0);
 const ai=createAiAssistant({config,fetchImpl:async()=>reply(JSON.stringify({intent:'availability',date,equipmentId:'projector',slot:'14:00–16:00'}))});
 const result=await ai.assist({mode:'availability',question:'查十天后的投影仪'},records);assert.deepEqual(result.matches[0].slots,[]);
});
