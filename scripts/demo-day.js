import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createProductStore} from '../src/product-store.js';
import {createApp} from '../server.js';
import {localDate,slots,businessMinutes} from '../src/booking.js';
import {addDays} from '../src/planning.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),demoRoot=resolve(root,'data/demo');
export function prepareDemo(file=resolve(demoRoot,`demo-${localDate()}-${Date.now()}.sqlite`),now=new Date()){
 const rel=relative(demoRoot,resolve(file));
 if(!rel||rel.startsWith('..')||isAbsolute(rel)||!file.endsWith('.sqlite'))throw new Error('演示库必须位于 data/demo，不能使用正式数据库');
 mkdirSync(demoRoot,{recursive:true});
 const store=createProductStore(file),date=localDate(now),tomorrow=addDays(date,1);
 const ensure=name=>store.users().find(user=>user.name===name)||store.createUser({name});
 const a=ensure('演示学生A'),b=ensure('演示学生B');
 store.preferences(a.id,{theme:'dark'});store.preferences(b.id,{theme:'dark'});
 const db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=5000');
 const insert=db.prepare('INSERT OR IGNORE INTO reservations(id,user_id,equipment_id,date,slot,status,payload) VALUES(?,?,?,?,?,?,?)');
 const inProgress=slots.find(slot=>{const [start,end]=slot.split('–').map(time=>Number(time.slice(0,2))*60+Number(time.slice(3)));return businessMinutes(now)>=start&&businessMinutes(now)<end;});
 // Historical/time-state fixtures are deliberately labelled; they are not past-date bookings.
 const fixture=(id,equipmentId,day,slot,user=a)=>{const row={id:'demo-'+date+'-'+id,userId:user.id,name:user.name,equipmentId,date:day,slot,status:'active',createdAt:now.toISOString(),demo:true,fixturePurpose:'Demo Day 时间状态与台账统计夹具'};insert.run(row.id,user.id,equipmentId,day,slot,'active',JSON.stringify(row));};
 db.exec('BEGIN IMMEDIATE');
 try{
  fixture('expired','recorder',addDays(date,-1),slots[0]);
  if(inProgress)fixture('in-use','capture-s2',date,inProgress);
  // A small known ledger supplies a checkable report, without touching the user's normal database.
  for(let i=0;i<3;i++)fixture('statistics-'+i,['camera-c2','projector-p2','microphone-m3'][i],date,slots[i],b);
  fixture('upcoming','projector-p3',tomorrow,slots[0]);
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');store.close();throw error;}finally{db.close();}
 const plan=store.workspace(a.id).plans.find(plan=>plan.name==='校园采访 · 演示')||store.savePlan(a.id,{name:'校园采访 · 演示',sceneId:'interview',source:'manual',equipmentIds:['camera','microphone-m1','support-t2'],date:'',slot:''});
 const context={demo:true,label:'独立演示数据',file:relative(root,file).replaceAll('\\','/'),date,tomorrow,users:[{id:a.id,name:a.name},{id:b.id,name:b.name}],planId:plan.id,inProgressFixture:!!inProgress};
 return {store,context,file};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.loadEnvFile(resolve(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const arg=process.argv.indexOf('--db'),file=arg>=0?resolve(root,process.argv[arg+1]||''):undefined;
 const {store,context,file:database}=prepareDemo(file);
 console.log(JSON.stringify(context,null,2));
 if(process.argv.includes('--prepare'))store.close();
 else{const port=Number(process.env.DEMO_PORT||3005);const server=createApp(store,null,{demo:context});server.listen(port,'127.0.0.1',()=>console.log(`Borrow Lab 独立演示：http://localhost:${port}/#workspace`));const close=()=>server.close(()=>{store.close();process.exit(0);});process.once('SIGINT',close);process.once('SIGTERM',close);}
}
