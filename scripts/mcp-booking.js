import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { planSummary } from '../src/planning.js';
const data = fileURLToPath(new URL('../data/reservations.json', import.meta.url));
const dictionary = {
 storage:'本机JSON文件，不是MySQL', resource:'reservations',
 fields:{id:'UUID唯一标识',name:'预约人，1～30字符',equipmentId:'camera/projector/recorder',date:'YYYY-MM-DD本地日期',slot:'09:00–11:00 / 14:00–16:00 / 19:00–21:00',createdAt:'ISO8601创建时间'},
 constraint:'equipmentId + date + slot唯一；写入只由预约API执行', tools:'只读元数据和汇总，不提供新增、删除、SQL或任意文件读取'
};
const tools=[
 {name:'booking_dictionary',description:'读取预约JSON结构的数据字典，返回字段与约束，不含预约人数据。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'booking_plan_summary',description:'读取本机未来七天预约计划的匿名汇总，不读取密钥，不返回姓名。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];
let initialized=false;let queue=Promise.resolve();
async function respond(message){
 if(message.jsonrpc!=='2.0'||typeof message.method!=='string')return {error:{code:-32600,message:'Invalid request'}};
 if(message.method==='initialize'){initialized=true;return {protocolVersion:['2024-11-05','2025-03-26','2025-06-18'].includes(message.params?.protocolVersion)?message.params.protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'borrow-lab-readonly',version:'1.0.0'}};}
 if(message.method.startsWith('notifications/'))return;
 if(!initialized)throw {code:-32002,message:'Initialize first'};
 if(message.method==='ping')return {};
 if(message.method==='tools/list')return {tools};
 if(message.method==='tools/call'){
  const args=message.params?.arguments||{};
  if(Object.keys(args).length)throw {code:-32602,message:'This tool accepts no arguments'};
  let value;
  if(message.params?.name==='booking_dictionary')value=dictionary;
  else if(message.params?.name==='booking_plan_summary'){
   let records=[];try{records=JSON.parse(await readFile(data,'utf8'));if(!Array.isArray(records))throw new Error();}catch(error){if(error.code!=='ENOENT')return {content:[{type:'text',text:'台账读取失败，请检查本机数据文件。'}],isError:true};}
   value=planSummary(records);
  }else throw {code:-32602,message:'Unknown read-only tool'};
  return {content:[{type:'text',text:JSON.stringify(value)}]};
 }
 throw {code:-32601,message:'Method not found'};
}
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
lines.on('line',line=>{
 queue=queue.then(async()=>{
  let message;try{message=JSON.parse(line);}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');return;}
  try{const result=await respond(message);if(message.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result})+'\n');}
  catch(error){if(message.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:error.code||-32603,message:error.code?error.message:'Internal error'}})+'\n');}
 });
});

