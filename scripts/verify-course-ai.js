// Manual, opt-in upstream acceptance. CI never imports or runs this script.
import {DatabaseSync} from 'node:sqlite';
import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAiAssistant} from '../src/ai.js';
import {equipment,localDate} from '../src/booking.js';
import {addDays,freeSlots} from '../src/planning.js';
import {bookingContext,reportWeekStart} from '../src/ai-context.js';
import {parseAvailabilityQuestion} from '../src/availability-query.js';

const args=process.argv.slice(2),databaseArg=args[args.indexOf('--database')+1];
if(!args.includes('--live')||!args.includes('--database')||!databaseArg)throw Error('手动运行需显式 --live --database 隔离演示SQLite路径；不会使用默认用户数据库。');
const database=resolve(databaseArg);
if(!existsSync(database))throw Error('演示数据库不存在；先初始化独立Demo环境。');
process.loadEnvFile(resolve('.env'));
const db=new DatabaseSync(database,{readOnly:true});
let records;try{records=db.prepare("SELECT payload FROM reservations WHERE status='active'").all().map(row=>JSON.parse(row.payload));}finally{db.close();}
if(!records.length||records.some(row=>row.demo!==true))throw Error('只接受显式demo:true的隔离演示数据，拒绝混用真实用户历史。');
const ai=createAiAssistant(),context=bookingContext(records,reportWeekStart()),evidence={checkedAt:new Date().toISOString(),timezone:'Asia/Shanghai',database,fixture:'明确标注的隔离演示SQLite记录',queries:[],report:null,recommendation:null};
for(const question of ['下周一下午有空闲的投影仪吗？','明天下午有哪些相机能借？','这周五晚上麦克风有空吗？','投影仪没空的话有没有其他时间？','今天有哪些设备可用？','下周一下午有适合录音的设备吗？']){
 const started=performance.now(),parsed=parseAvailabilityQuestion(question,equipment);
 if(parsed?.error){evidence.queries.push({question,status:'PASS',condition:'提及日期已过期时合理拒绝',message:parsed.error});continue;}
 const result=await ai.assist({mode:'availability',question},records);
 assert.equal(result.provider,'ledger');assert.equal(result.attempts,0);
 for(const match of result.matches){assert.ok(equipment.some(item=>item.id===match.id));for(const slot of match.slots)assert.ok(freeSlots(records,match.date||result.query.date,match.id).includes(slot));}
 evidence.queries.push({question,status:'PASS',milliseconds:Math.round(performance.now()-started),provider:result.provider,query:result.query,matches:result.matches,text:result.text});
}
let failed=false;
const started=performance.now();
try{
 const result=await ai.assist({mode:'report'},records);
 assert.equal(result.source.total,context.stats.total);assert.equal(result.source.capacity,context.stats.capacity);assert.equal(result.source.occupied,context.stats.occupied);
 assert.equal(result.source.start,reportWeekStart());assert.equal(result.source.end,addDays(reportWeekStart(),6));
 assert.deepEqual(result.sections.map(section=>section.title),['本周预约概览','热门设备','高峰时段','低预约设备','预约占用情况','调度建议']);
 for(const choice of result.scheduling)assert.ok(freeSlots(records,choice.date,choice.equipmentId).includes(choice.slot));
 evidence.report={status:'PASS',milliseconds:Math.round(performance.now()-started),model:result.model,attempts:result.attempts,finishReason:result.finishReason,usage:result.usage,source:result.source,selection:result.selection,sections:result.sections};
}catch(error){failed=true;evidence.report={status:'FAIL',milliseconds:Math.round(performance.now()-started),httpStatus:error.status||null,message:error.message};}
if(args.includes('--creative')){
 const started=performance.now();try{
  const result=await ai.assist({mode:'creative',question:'我明天下午想拍轻量Vlog，请推荐三件真实设备'},records);
  assert.ok(result.equipmentIds.length>=2&&result.equipmentIds.length<=4);assert.ok(result.equipmentIds.every(id=>equipment.some(item=>item.id===id)));
  for(const item of result.items)if(item.available)assert.ok(freeSlots(records,result.date,item.id).includes(result.slot));
  evidence.recommendation={status:'PASS',milliseconds:Math.round(performance.now()-started),model:result.model,attempts:result.attempts,finishReason:result.finishReason,usage:result.usage,equipmentIds:result.equipmentIds,date:result.date,slot:result.slot,items:result.items.map(({id,name,available,reason,alternatives})=>({id,name,available,reason,alternatives:alternatives.map(item=>item.id)}))};
 }catch(error){failed=true;evidence.recommendation={status:'FAIL',milliseconds:Math.round(performance.now()-started),httpStatus:error.status||null,message:error.message};}
}
evidence.calls=ai.status().calls;mkdirSync('data',{recursive:true});writeFileSync('data/course-ai-live-evidence.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({queries:evidence.queries.map(({question,status,milliseconds,provider})=>({question,status,milliseconds,provider})),report:evidence.report&&{status:evidence.report.status,milliseconds:evidence.report.milliseconds,model:evidence.report.model,attempts:evidence.report.attempts,finishReason:evidence.report.finishReason,total:evidence.report.source?.total,capacity:evidence.report.source?.capacity,window:evidence.report.source&&{start:evidence.report.source.start,end:evidence.report.source.end},message:evidence.report.message},recommendation:evidence.recommendation,calls:evidence.calls,evidence:'data/course-ai-live-evidence.json'},null,2));
if(failed)process.exitCode=1;
