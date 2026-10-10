import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {createProductStore} from '../src/product-store.js';
import {createAdminAuth} from '../src/admin-auth.js';
import {createAiAssistant} from '../src/ai.js';
import {bookingContext,reportWeekStart} from '../src/ai-context.js';
import {localDate,slots} from '../src/booking.js';
import {addDays} from '../src/planning.js';
import {createApp} from '../server.js';

// Explicit opt-in only: one real model call, never part of npm test or polling.
if(!process.argv.includes('--live'))throw new Error('只有显式传入 --live 才发起一次真实模型调用。');
try{process.loadEnvFile(new URL('../.env',import.meta.url));}catch(error){if(error.code!=='ENOENT')throw error;}
const directory=await mkdtemp(join(tmpdir(),'borrow-admin-ai-'));
let store,auth,app;
try{
 store=createProductStore(join(directory,'isolated.sqlite'));
 auth=createAdminAuth(store.file);
 const password=randomBytes(24).toString('base64url');
 await auth.setup('isolated-ai-verifier',password);
 const assistant=createAiAssistant({catalog:store.catalog()});
 assert.equal(assistant.status().configured,true,'本地模型未配置，不生成伪造周报。');
 const date=addDays(localDate(),1),user=store.users()[0];
 for(const device of store.catalog().filter(item=>item.operationalStatus==='active').slice(0,3))store.add({userId:user.id,equipmentId:device.id,date,slot:slots[1]});
 const expected=bookingContext(store.list(),reportWeekStart(localDate()),store.catalog()).stats;
 app=createApp(store,assistant,{adminAuth:auth});
 await new Promise(resolveListening=>app.listen(0,'127.0.0.1',resolveListening));
 const base='http://127.0.0.1:'+app.address().port;
 const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'isolated-ai-verifier',password})});
 assert.equal(login.status,200);
 const session=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
 for(const path of ['dashboard','analytics','reports'])assert.equal((await fetch(base+'/api/admin/'+path,{headers:{Cookie:cookie}})).status,200);
 const before=assistant.status().calls;
 const started=performance.now();
 const response=await fetch(base+'/api/admin/reports',{method:'POST',headers:{Origin:base,Cookie:cookie,'X-Admin-CSRF':session.csrfToken,'Content-Type':'application/json'},body:'{}'});
 const result=await response.json(),durationMs=Math.round(performance.now()-started);
 await mkdir(resolve('data/admin-verification'),{recursive:true});
 await writeFile(resolve('data/admin-verification/real-ai-response.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'isolated demonstration ledger',durationMs,status:response.status,expected,result},null,2));
 assert.equal(response.status,201,result.error);
 assert.equal(result.sections.length,6);
 assert.deepEqual(result.source,expected,'模型解释必须使用相同真实台账统计快照。');
 const saved=store.admin.reports();
 assert.equal(saved.total,1);assert.equal(saved.latest.id,result.id);
 const evidence={checkedAt:new Date().toISOString(),scope:'一次真实模型调用；独立临时 SQLite 的三条演示预约，不是日常校园运营数据',durationMs,status:response.status,model:result.model,provider:result.provider,automaticModelCalls:before,explicitModelCalls:assistant.status().calls-before,sections:result.sections.length,statisticMatch:true,persisted:true,report:result};
 await mkdir(resolve('data/admin-verification'),{recursive:true});
 await writeFile(resolve('data/admin-verification/real-ai.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({status:'PASS',durationMs,sections:evidence.sections,automaticModelCalls:before,explicitModelCalls:evidence.explicitModelCalls,statisticMatch:true,persisted:true}));
}finally{
 if(app)await new Promise(resolveClosed=>app.close(resolveClosed));
 auth?.close();store?.close();
 const scoped=relative(resolve(tmpdir()),resolve(directory));
 if(!scoped.startsWith('borrow-admin-ai-')||scoped.includes('..'))throw new Error('拒绝清理范围外目录。');
 await rm(directory,{recursive:true,force:true});
}
