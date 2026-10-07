import { createAiAssistant } from '../src/ai.js';
import { localDate } from '../src/booking.js';
import { addDays } from '../src/planning.js';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
try { process.loadEnvFile(new URL('../.env',import.meta.url)); } catch(error) { if(error.code!=='ENOENT')throw error; }
if (!process.env.YOSHUB_API_KEY) {
 console.log('NOT RUN: YOSHUB_API_KEY is missing. Configure it locally before real-model verification.');
 process.exit(2);
}
const assistant=createAiAssistant();
const evidence={date:localDate(),timestamp:new Date().toISOString(),platform:'Yos Hub API',base:process.env.YOSHUB_BASE_URL||'https://api.yoshub.com/v1',requestedModel:process.env.YOSHUB_MODEL||'deepseek-v4-flash',fixture:'匿名测试台账，非真实用户数据',checks:[]};
const file=new URL('../docs/验收证据/YosHub-真实接口.json',import.meta.url);
async function check(label,input,records,verify){
 const start=Date.now();const result=await assistant.assist(input,records);
 verify(result);
 const item={label,status:'pass',elapsedMs:Date.now()-start,text:result.text,usage:result.usage,source:result.source||null,query:result.query||null,matches:result.matches||null};
 evidence.checks.push(item);await writeFile(file,JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({label,status:item.status,elapsedMs:item.elapsedMs,usage:item.usage,text:item.text}));
}
try {
 await check('空台账真实周报',{mode:'report'},[],result=>{assert.equal(result.source.total,0);assert.ok(result.text.trim());});
 const date=addDays(localDate(),1);
 await check('明日下午投影仪已占用的真实解析与台账核对',{mode:'availability',question:'明天下午有空闲的投影仪吗？'},[{equipmentId:'projector',date,slot:'14:00–16:00'}],result=>{
  assert.deepEqual(result.query,{intent:'availability',date,equipmentId:'projector',slot:'14:00–16:00'});
  assert.deepEqual(result.matches,[{name:'便携投影仪',slots:[]}]);
 });
 console.log('PASS: both checks used real Yos Hub calls; no credential data saved.');
} catch(error) {
 evidence.checks.push({label:'真实调用中断',status:'fail',httpStatus:error.status||null,error:error.status?error.message:'验证未通过，请检查返回内容和脚本断言'});
 await writeFile(file,JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence.checks.at(-1)));process.exitCode=1;
}

