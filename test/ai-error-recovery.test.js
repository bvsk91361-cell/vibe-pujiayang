import test from 'node:test';
import assert from 'node:assert/strict';
import {aiErrorMessage} from '../public/creative-client.js';
import {createAiAssistant} from '../src/ai.js';
test('截断、额度、忙碌、超时分别显示真实原因',()=>{
 assert.match(aiErrorMessage(new Error('助手输出达到长度上限，内容被截断。')),/没有生成完整/);
 assert.match(aiErrorMessage(new Error('模型额度不足或限流')),/额度不足/);
 assert.match(aiErrorMessage(new Error('本服务今日已达20次AI调用上限')),/次数已用完/);
 assert.match(aiErrorMessage(new Error('助手正在处理上一条请求')),/仍在生成/);
 assert.match(aiErrorMessage(new Error('助手请求超时')),/超时/);
 assert.match(aiErrorMessage(new Error('无法连接模型服务，请检查网络')),/无法连接/);
});
test('DeepSeek关闭思考且保留一次调用和原token限制，其他模型不传专属参数',async()=>{
 for(const model of ['deepseek-v4-flash','other-model']){
  let sent,calls=0;
  const ai=createAiAssistant({config:{YOSHUB_API_KEY:'test-only',YOSHUB_MODEL:model},fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);calls++;return{ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})};}});
  await assert.rejects(ai.assist({mode:'creative',question:'拍采访'},[]),/长度上限/);
  assert.equal(calls,1);assert.equal(sent.max_tokens,8192);
  assert.deepEqual(sent.thinking,model.startsWith('deepseek')?{type:'disabled'}:undefined);
 }
});
