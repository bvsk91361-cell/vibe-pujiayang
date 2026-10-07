import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const child=spawn(process.execPath,[fileURLToPath(new URL('./mcp-booking.js',import.meta.url))],{stdio:['pipe','pipe','pipe']});
const lines=createInterface({input:child.stdout});
const waiters=new Map();let next=0;
lines.on('line',line=>{const value=JSON.parse(line);const entry=waiters.get(value.id);if(entry){waiters.delete(value.id);entry(value);}});
function request(method,params){
 const id=++next;return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{waiters.delete(id);reject(new Error('MCP response timeout'));},5000);
  waiters.set(id,value=>{clearTimeout(timeout);resolve(value);});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 });
}
try{
 const init=await request('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'course-check',version:'1.0.0'}});
 assert.equal(init.result.serverInfo.name,'borrow-lab-readonly');
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const listed=await request('tools/list',{});assert.equal(listed.result.tools.length,2);
 assert.ok(listed.result.tools.every(tool=>tool.annotations.readOnlyHint));
 const called=await request('tools/call',{name:'booking_dictionary',arguments:{}});
 const dictionary=JSON.parse(called.result.content[0].text);assert.equal(dictionary.resource,'reservations');
 const rejected=await request('tools/call',{name:'booking_delete',arguments:{}});assert.equal(rejected.error.code,-32602);
 const doc='# 预约数据字典（通过只读MCP实际读取）\n\n日期：2026-10-07。传输为stdio/JSON-RPC。客户端完成initialize、tools/list、tools/call；写工具booking_delete被明确拒绝。这里使用本项目JSON台账，不冒充MySQL或Trae实操。\n\n'+Object.entries(dictionary.fields).map(([name,meaning])=>'- '+name+'：'+meaning).join('\n')+'\n\n约束：'+dictionary.constraint+'。\n';
 await writeFile(new URL('../docs/数据字典-MCP.md',import.meta.url),doc);
 console.log('PASS: MCP initialize → list 2 read-only tools → dictionary → deny write tool');
}finally{child.stdin.end();child.kill();}

