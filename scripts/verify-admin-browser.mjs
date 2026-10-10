import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createProductStore} from '../src/product-store.js';
import {createAdminAuth} from '../src/admin-auth.js';
import {createApp} from '../server.js';
import {localDate} from '../src/booking.js';
import {addDays} from '../src/planning.js';
import {bookingContext} from '../src/ai-context.js';

// Deliberately outside product dependencies. No credential, cookie or CSRF value
// is written to an artifact; all writes use a fresh, ignored verification DB.
const playwright=process.env.ADMIN_PLAYWRIGHT_PATH||'E:/桌面/vibecode/Borrow Lab 路演影片/V5/project/node_modules/playwright/index.mjs';
const browserExecutable=process.env.ADMIN_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const {chromium}=await import(pathToFileURL(playwright));
const output=resolve('data/admin-verification');
const asyncOnly=process.argv.includes('--async-only');
const reportErrorOnly=process.argv.includes('--report-error-only');
await mkdir(output,{recursive:true});
const isolated=await mkdtemp(join(output,'run-'));
const report={startedAt:new Date().toISOString(),databaseScope:'fresh isolated verification SQLite; no ordinary user data',steps:[],screenshots:[],http:[],consoleErrors:[],model:{type:'explicit deterministic test fixture; no paid provider called',calls:0},viewports:[]};
const password=randomBytes(24).toString('base64url'),username='verification-admin';
const store=createProductStore(join(isolated,'verification.sqlite'));
const auth=createAdminAuth(store.file);
const adminIdentity=await auth.setup(username,password);
const assistant={status:()=>({configured:true,available:true,provider:'verification-fixture',model:'fixture',remaining:20}),setCatalog(){},async assist(input,records){
  report.model.calls++;
  assert.equal(input.mode,'report','Only explicit weekly report generation is expected');
  const context=bookingContext(records,undefined,store.catalog());
  return {provider:'verification-fixture',model:'fixture',text:'隔离验收周报：数字来自当前测试预约台账。',sections:['预约概览','热门设备','高峰时段','低预约设备','预约占用','调度建议'].map(title=>({title,text:'根据隔离验收台账统计，样本有限，不推断实际使用时长。'})),source:context.stats,stats:context.stats};
}};
const server=createApp(store,assistant,{adminAuth:auth});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
let failed=false;
async function step(name,action){const start=performance.now();try{const detail=await action();report.steps.push({name,status:'PASS',durationMs:Math.round(performance.now()-start),detail:detail??null});console.log('PASS '+name);}catch(error){failed=true;report.steps.push({name,status:'FAIL',durationMs:Math.round(performance.now()-start),error:String(error.message).replaceAll(password,'[redacted]')});console.log('FAIL '+name+': '+String(error.message).replaceAll(password,'[redacted]'));throw error;}}
function observe(page,label){page.on('pageerror',error=>report.consoleErrors.push({page:label,error:error.message}));page.on('response',response=>{const url=new URL(response.url());if(url.pathname.startsWith('/api/')&&[401,403,409].includes(response.status()))report.http.push({page:label,method:response.request().method(),path:url.pathname,status:response.status()});});}
async function screenshot(page,name){const path=join(output,name+'.png');await page.screenshot({path,fullPage:false});report.screenshots.push(path);}
async function ready(page){await page.locator('#page-data[aria-busy="false"]').waitFor({timeout:15000});await page.waitForTimeout(120);}
async function nav(page,id){await page.locator(`[data-page="${id}"]`).click();await ready(page);}
async function noOverflow(page,label){const value=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,drawers:[...document.querySelectorAll('.drawer,.dialog-card,.confirm-modal')].filter(node=>node.getClientRects().length).map(node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};}),narrowButtons:[...document.querySelectorAll('button,.nav-item')].filter(node=>node.getClientRects().length&&node.textContent.trim().length>2&&!node.classList.contains('icon-button')).filter(node=>{const s=getComputedStyle(node);return s.writingMode!=='horizontal-tb'||(node.clientWidth>0&&node.scrollWidth>node.clientWidth+4);}).map(node=>node.textContent.trim().slice(0,40))}));assert.ok(value.scrollWidth<=value.width+2,label+' horizontal document overflow '+JSON.stringify(value));assert.deepEqual(value.narrowButtons,[],label+' buttons must not be squeezed');for(const box of value.drawers)assert.ok(box.left>=-2&&box.top>=-2&&box.right<=value.width+2&&box.bottom<=value.height+2,label+' drawer outside viewport');return value;}
function gate(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}
async function verifyAsync(context){
  const page=await context.newPage();observe(page,'async-admin');
  await page.goto(base+'/admin#/login');await page.locator('#login-form').waitFor();
  await page.locator('input[name=username]').fill(username);await page.locator('input[name=password]').fill(password);
  await page.locator('#login-form button[type=submit]').click();await ready(page);
  const source=bookingContext(store.list(),undefined,store.catalog()).stats;
  store.admin.saveReport({provider:'verification-fixture',model:'fixture',text:'旧报告快照：仅用于隔离异步验收。',sections:[{title:'隔离验收',text:'旧报告'}],source},adminIdentity);
  await step('Delayed old weekly-report GET cannot overwrite explicitly generated newer report',async()=>{
    await nav(page,'analytics');await page.locator('#selected-report').filter({hasText:'旧报告快照'}).waitFor();
    const held=gate(),release=gate(),completed=gate();let captured=false;
    await page.route('**/api/admin/reports*',async route=>{
      if(route.request().method()!=='GET'||captured)return route.continue();
      captured=true;const response=await route.fetch();held.resolve();await release.promise;
      try{await route.fulfill({response});}finally{completed.resolve();}
    });
    try{
      await page.locator('[data-action=refresh]').first().click();await held.promise;
      await page.locator('[data-action=generate-report]').click();
      await page.locator('#selected-report').filter({hasText:'隔离验收周报'}).waitFor();
      assert.equal(report.model.calls,1);release.resolve();await completed.promise;await page.waitForTimeout(300);
      assert.ok((await page.locator('#selected-report').innerText()).includes('隔离验收周报'));
      assert.ok(!(await page.locator('#selected-report').innerText()).includes('旧报告快照'));
      assert.equal(store.admin.reports().total,2);
      return {heldOldSnapshot:true,newReportPersisted:true,manualModelFixtureCalls:1,oldSnapshotRejected:true};
    }finally{release.resolve();await page.unroute('**/api/admin/reports*');}
  });
  await step('Delayed equipment mutation result cannot reopen a closed or switched drawer',async()=>{
    await nav(page,'equipment');await page.locator('[data-detail=equipment][data-id=projector]').click();await page.locator('#equipment-form').waitFor();
    await page.locator('#equipment-form input[name=name]').fill('投影仪 · 异步隔离验收');
    const held=gate(),release=gate(),completed=gate();
    await page.route('**/api/admin/equipment/projector',async route=>{
      if(route.request().method()!=='PATCH')return route.continue();
      const response=await route.fetch();held.resolve();await release.promise;
      try{await route.fulfill({response});}finally{completed.resolve();}
    });
    try{
      await page.locator('button[form=equipment-form]').click();await held.promise;
      await page.locator('[data-action=close-overlay]').first().click();await nav(page,'users');
      await page.locator('[data-detail=users]').first().click();await page.locator('.drawer #drawer-title').filter({hasText:'用户详情'}).waitFor();
      release.resolve();await completed.promise;await page.waitForTimeout(300);
      assert.equal(await page.locator('.drawer #drawer-title').innerText(),'用户详情');
      assert.equal(await page.locator('#equipment-form').count(),0);
      assert.equal(store.catalog().find(row=>row.id==='projector').name,'投影仪 · 异步隔离验收');
      return {serverWritePersisted:true,closedDrawerStayedClosed:true,newUserDrawerPreserved:true};
    }finally{release.resolve();await page.unroute('**/api/admin/equipment/projector');}
  });
  assert.deepEqual(report.consoleErrors,[],'No async browser JavaScript exceptions');
}
async function verifyReportRecovery(context){
  const page=await context.newPage();observe(page,'report-recovery-admin');
  await page.goto(base+'/admin#/login');await page.locator('#login-form').waitFor();
  await page.locator('input[name=username]').fill(username);await page.locator('input[name=password]').fill(password);
  await page.locator('#login-form button[type=submit]').click();await ready(page);
  const source=bookingContext(store.list(),undefined,store.catalog()).stats;
  store.admin.saveReport({provider:'verification-fixture',model:'fixture',text:'已有隔离验收周报：错误不能替换已保存资料。',sections:[{title:'预约概览',text:'隔离测试台账，无实际使用时长记录。'}],source},adminIdentity);
  await nav(page,'analytics');await page.locator('#selected-report').filter({hasText:'已有隔离验收周报'}).waitFor();
  let submissions=0;
  await page.route('**/api/admin/reports',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    submissions++;
    if(submissions===1)return route.fulfill({status:502,contentType:'application/json; charset=utf-8',body:JSON.stringify({error:'无法连接模型服务，请检查网络；普通预约可继续。'})});
    return route.continue();
  });
  await step('Report 502 preserves prior data, clears loading and never retries; explicit retry saves valid result',async()=>{
    const initial=store.admin.reports().total;
    await page.locator('[data-action=generate-report]').click();
    await page.locator('#report-area .inline-error').filter({hasText:'无法连接模型服务，请检查网络；普通预约可继续。'}).waitFor();
    await page.locator('[data-action=generate-report]:not([disabled])').waitFor();
    assert.equal(store.admin.reports().total,initial);
    assert.equal(report.model.calls,0);
    assert.ok((await page.locator('#selected-report').innerText()).includes('已有隔离验收周报'));
    assert.ok((await page.locator('#page-data').innerText()).includes('预约变化'));
    // Let one normal 15-second statistics polling cycle occur. It must neither
    // clear the explicit error nor retry the failed paid operation.
    await page.waitForTimeout(16000);
    assert.equal(submissions,1);
    assert.equal(report.model.calls,0);
    assert.equal(store.admin.reports().total,initial);
    assert.ok((await page.locator('#report-area .inline-error').innerText()).includes('普通预约可继续'));
    assert.equal(await page.locator('[data-action=generate-report]').isDisabled(),false);
    await page.locator('[data-action=generate-report]').click();
    await page.locator('#selected-report').filter({hasText:'隔离验收周报：数字来自当前测试预约台账。'}).waitFor();
    await page.locator('[data-action=generate-report]:not([disabled])').waitFor();
    assert.equal(submissions,2);
    assert.equal(report.model.calls,1);
    assert.equal(store.admin.reports().total,initial+1);
    assert.equal(await page.locator('#report-area .inline-error').count(),0);
    assert.deepEqual(report.consoleErrors,[]);
    return {upstreamFailureStatus:502,previousSavedReports:initial,savedAfterFailure:initial,loadingReleased:true,errorRetainedThroughStatisticsPoll:true,automaticRetryCalls:0,explicitSubmissions:2,testModelCalls:1,savedAfterExplicitRetry:initial+1,paidProviderCalls:0};
  });
}
try{
  browser=await chromium.launch({executablePath:browserExecutable,headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  if(asyncOnly){await verifyAsync(context);}else if(reportErrorOnly){await verifyReportRecovery(context);}else{
  const admin=await context.newPage();observe(admin,'admin');
  const anonymous=await browser.newContext();
  await step('Unauthenticated and ordinary identity cannot read or write admin API',async()=>{for(const path of ['/api/admin/dashboard','/api/admin/equipment','/api/admin/users'])assert.equal((await anonymous.request.get(base+path)).status(),401);assert.equal((await anonymous.request.patch(base+'/api/admin/equipment/camera',{data:{operationalStatus:'maintenance'}})).status(),401);return {reads:3,writes:1,status:401};});
  let activeUser;
  await step('Existing identity menu opens real administrator login',async()=>{await admin.goto(base+'/#space');await admin.locator('#space-name').waitFor();activeUser=await admin.evaluate(()=>localStorage.getItem('borrow-active-user'));await admin.locator('#space-avatar').click();await admin.getByRole('menuitem',{name:'身份管理',exact:true}).click();await admin.getByRole('button',{name:'管理员：进入管理端',exact:true}).click();await admin.locator('#login-form').waitFor();assert.ok(admin.url().includes('/admin#/login'));return {ordinaryIdentityPreserved:true};});
  await screenshot(admin,'login-1440');
  await step('Incorrect password stays on login and returns unified error',async()=>{await admin.locator('input[name=username]').fill(username);await admin.locator('input[name=password]').fill(password+'-wrong');await admin.locator('#login-form button[type=submit]').click();await admin.locator('#login-error').filter({hasText:'账号或密码不正确'}).waitFor();assert.equal(await admin.locator('.admin-shell').count(),0);});
  await step('Correct credential opens protected dashboard; cookie flags and refresh session are valid',async()=>{await admin.locator('input[name=password]').fill(password);await admin.locator('#login-form button[type=submit]').click();await ready(admin);assert.equal(await admin.locator('.admin-shell').count(),1);const cookie=(await context.cookies()).find(row=>row.name==='borrow_admin');assert.ok(cookie?.httpOnly&&cookie.sameSite==='Strict'&&cookie.path==='/api/admin');await admin.reload();await ready(admin);assert.equal(await admin.locator('.admin-shell').count(),1);return {httpOnly:true,sameSite:'Strict',sessionRestoredAfterReload:true};});
  await step('Five real pages render, search filters and read-only user detail work',async()=>{for(const id of ['dashboard','bookings','equipment','users','analytics']){await nav(admin,id);assert.ok(await admin.locator('#page-data').innerText());assert.equal(await admin.locator('#page-error').innerText(),'');}await nav(admin,'equipment');await admin.locator('#filter-form input[name=keyword]').fill('camera');await admin.waitForTimeout(600);await ready(admin);assert.ok((await admin.locator('#page-data').innerText()).includes(store.catalog().find(row=>row.id==='camera').name));await admin.locator('[data-action=reset-filters]').click();await ready(admin);const category=await admin.locator('#filter-form select[name=category] option').nth(1).getAttribute('value');await admin.locator('#filter-form select[name=category]').selectOption(category);await ready(admin);assert.equal(await admin.locator('[data-detail=equipment]').count(),store.admin.equipment({category}).total);await admin.locator('[data-action=reset-filters]').click();await ready(admin);await nav(admin,'users');await admin.locator('[data-detail=users]').first().click();await admin.locator('.drawer').waitFor();assert.ok((await admin.locator('.drawer').innerText()).includes('本地演示身份'));await admin.locator('[data-action=close-overlay]').first().click();return {pages:5,automaticModelCalls:report.model.calls,userDetailReadOnly:true};});
  await nav(admin,'dashboard');
  const front=await context.newPage();observe(front,'front');await front.goto(base+'/#booking-title');await front.locator('#booking-device-open').waitFor();
  const date=addDays(localDate(),1),slot='14:00–16:00';let booking;
  await step('Frontend freely selects camera, date and slot, submits real reservation and receipt',async()=>{await front.locator('#booking-device-open').click();await front.locator('#booking-device-query').fill('数码相机');await front.locator('.booking-device-card').filter({hasText:'数码相机'}).getByRole('button',{name:'选择这件设备'}).click();await front.getByRole('button',{name:'选择'+date,exact:true}).click();await front.getByRole('button',{name:'选择'+slot,exact:true}).click();await front.locator('#booking-submit:not([disabled])').waitFor();await front.locator('#booking-submit').click();await front.locator('#booking-success-title').filter({hasText:'灵感有约'}).waitFor();booking=store.list().find(row=>row.equipmentId==='camera'&&row.userId===activeUser&&row.date===date&&row.slot===slot);assert.ok(booking);await front.getByRole('button',{name:'查看我的预约'}).click();await front.locator('#reservations').filter({hasText:'数码相机'}).waitFor();await front.reload();await front.locator('#reservations').filter({hasText:'数码相机'}).waitFor();return {equipmentId:booking.equipmentId,date,slot,persistedAfterRefresh:true};});
  await step('Frontend booking updates backend dashboard without reload or model call',async()=>{await admin.locator('#page-data').filter({hasText:'数码相机'}).waitFor({timeout:22000});assert.ok((await admin.locator('#page-data').innerText()).includes('数码相机'));assert.equal(report.model.calls,0);const data=store.admin.dashboard();assert.ok(data.activity.some(row=>row.equipmentName==='数码相机'));return {liveActivity:true,updateWithoutPageSwitchOrManualRefresh:true,modelCalls:0};});
  await step('Future reservation prevents silent maintenance invalidation',async()=>{await nav(admin,'equipment');await admin.locator('#filter-form input[name=keyword]').fill('camera');await admin.waitForTimeout(600);await ready(admin);await admin.locator('[data-detail="equipment"]').first().click();await admin.locator('#equipment-form').waitFor();await admin.locator('#equipment-form select[name=operationalStatus]').selectOption('maintenance');await admin.locator('button[form=equipment-form]').click();await admin.locator('#drawer-error').filter({hasText:'请先处理受影响'}).waitFor();assert.equal(store.catalog().find(row=>row.id==='camera').operationalStatus,'active');await admin.locator('[data-action=close-overlay]').first().click();return {status:409,ordinaryBookingStillActive:store.list().some(row=>row.id===booking.id)};});
  await step('Admin cancellation confirms reason, updates database audit and releases slot',async()=>{await nav(admin,'bookings');await admin.locator('#filter-form input[name=keyword]').fill(booking.id);await admin.waitForTimeout(600);await ready(admin);await admin.locator('[data-detail="bookings"]').first().click();await admin.locator('[data-action="confirm-cancel"]').click();await admin.locator('textarea[name=reason]').fill('隔离浏览器验收：确认释放预约时段');await admin.locator('#cancel-form button[type=submit]').click();await admin.locator('.drawer .badge-cancelled').waitFor();await admin.locator('[data-action=close-overlay]').first().click();assert.ok(!store.list().some(row=>row.id===booking.id));const detail=store.admin.bookingDetail(booking.id);assert.equal(detail.state,'cancelled');assert.equal(detail.cancelledBy,'admin');assert.equal(detail.audit.length,1);return {databaseStatus:'cancelled',slotReleased:true,auditPersisted:true};});
  await step('Frontend synchronizes admin cancellation and rebooks released slot through UI',async()=>{await front.locator('#reservation-cancelled-list [data-reservation-id="'+booking.id+'"]').waitFor({timeout:22000});await front.locator('#reservation-cancelled-list [data-reservation-id="'+booking.id+'"]').getByRole('button',{name:/再次预约/}).click();await front.locator('#booking-submit:not([disabled])').waitFor();await front.locator('#booking-submit').click();await front.locator('#booking-success-title').waitFor();const rows=store.list().filter(row=>row.equipmentId==='camera'&&row.date===date&&row.slot===slot);assert.equal(rows.length,1);assert.notEqual(rows[0].id,booking.id);return {newEffectiveRecords:rows.length,newIdDifferent:true};});
  await step('Unused device edit and maintenance persist and frontend catalog follows; restore works',async()=>{const id='projector';await nav(admin,'equipment');await admin.locator('#filter-form input[name=keyword]').fill(id);await admin.waitForTimeout(600);await ready(admin);await admin.locator('[data-detail="equipment"]').first().click();await admin.locator('#equipment-form').waitFor();await admin.locator('#equipment-form input[name=name]').fill('投影仪 · 隔离验收');await admin.locator('#equipment-form textarea[name=description]').fill('设备管理持久化与前后台同步的隔离验收说明');await admin.locator('#equipment-form select[name=operationalStatus]').selectOption('maintenance');await admin.locator('button[form=equipment-form]').click();await admin.locator('#admin-toast').filter({hasText:'设备信息已保存'}).waitFor();await admin.locator('[data-action=close-overlay]').first().click();assert.equal(store.catalog().find(row=>row.id===id).operationalStatus,'maintenance');assert.equal((await (await front.request.get(base+'/api/equipment')).json()).equipment.find(row=>row.id===id).name,'投影仪 · 隔离验收');await front.locator('[data-go=equipment]').first().click();await front.locator('#search').fill('投影仪 · 隔离验收');await front.locator('#equipment').filter({hasText:'维护'}).waitFor({timeout:22000});await admin.locator('[data-detail="equipment"]').first().click();await admin.locator('#equipment-form select[name=operationalStatus]').selectOption('active');await admin.locator('button[form=equipment-form]').click();await admin.locator('#admin-toast').filter({hasText:'设备信息已保存'}).waitFor();await admin.locator('[data-action=close-overlay]').first().click();assert.equal(store.catalog().find(row=>row.id===id).operationalStatus,'active');return {persistentName:true,persistentDescription:true,maintenanceAndRestore:true,frontendSynced:true};});
  await step('Explicit weekly report is saved once; statistics polling never calls model',async()=>{await nav(admin,'analytics');assert.equal(report.model.calls,0);await admin.locator('[data-action="generate-report"]').click();await admin.locator('#report-area').filter({hasText:'隔离验收周报'}).waitFor();assert.equal(report.model.calls,1);assert.equal(store.admin.reports().total,1);await admin.locator('[data-action=refresh]').first().click();await ready(admin);assert.equal(report.model.calls,1);return {manualCalls:1,automaticCalls:0,savedReports:1,provider:'explicit test fixture'};});
  await step('API loading failure is honest and recovers without losing shell',async()=>{await admin.route('**/api/admin/users*',route=>route.abort('failed'));await nav(admin,'users');await admin.locator('#page-error').filter({hasText:'暂时无法连接服务'}).waitFor();assert.equal(await admin.locator('.admin-shell').count(),1);await admin.unroute('**/api/admin/users*');await admin.locator('#page-error [data-action=refresh]').click();await ready(admin);assert.equal(await admin.locator('#page-error').innerText(),'');});
  await step('Four desktop sizes remain readable without horizontal overflow',async()=>{for(const viewport of [{width:1366,height:768},{width:1440,height:900},{width:1600,height:900},{width:1920,height:1080}]){await admin.setViewportSize(viewport);await nav(admin,'dashboard');const dash=await noOverflow(admin,'dashboard '+viewport.width);if([1366,1920].includes(viewport.width))await screenshot(admin,'dashboard-'+viewport.width);await nav(admin,'bookings');await noOverflow(admin,'bookings '+viewport.width);if(viewport.width===1440)await screenshot(admin,'bookings-1440');await nav(admin,'equipment');await noOverflow(admin,'equipment '+viewport.width);await admin.locator('[data-detail="equipment"]').first().click();await admin.locator('#equipment-form').waitFor();await noOverflow(admin,'equipment drawer '+viewport.width);if(viewport.width===1600)await screenshot(admin,'equipment-drawer-1600');await admin.locator('[data-action=close-overlay]').first().click();report.viewports.push({viewport,status:'PASS',dashboard:dash});}return {sizes:4,screenshotLimit:5};});
  await step('Ordinary user cancellation releases slot and automatically updates open dashboard',async()=>{
    const current=store.list().find(row=>row.equipmentId==='camera'&&row.date===date&&row.slot===slot);
    assert.ok(current);await nav(admin,'dashboard');
    await front.locator('#profile-open').click();await front.locator('#personal-action').getByRole('button',{name:'我的预约',exact:true}).click();
    await front.locator('#reservations .reservation').filter({hasText:'数码相机'}).getByRole('button',{name:/取消/}).click();
    await front.locator('#cancel-confirm').click();
    await front.locator('#reservation-cancelled-list [data-reservation-id="'+current.id+'"]').waitFor();
    await admin.locator('#dashboard-activity [data-event="'+current.id+':cancelled"]').waitFor({timeout:22000});
    assert.ok(!store.list().some(row=>row.id===current.id));
    assert.equal(store.admin.bookingDetail(current.id).state,'cancelled');
    return {databaseCancelled:true,slotReleased:true,openDashboardUpdatedWithoutManualRefresh:true};
  });
  await step('Logout invalidates server session and returns previous ordinary identity',async()=>{await admin.locator('[data-action=logout]').click();await admin.waitForURL(url=>!url.pathname.startsWith('/admin'));await admin.locator('#space-name').waitFor();assert.equal(await admin.evaluate(()=>localStorage.getItem('borrow-active-user')),activeUser);assert.equal((await context.request.get(base+'/api/admin/dashboard')).status(),401);await admin.goto(base+'/admin#/dashboard');await admin.locator('#login-form').waitFor();assert.equal(await admin.locator('.admin-shell').count(),0);return {sessionRevoked:true,ordinaryIdentityPreserved:true};});
  assert.deepEqual(report.consoleErrors,[],'No browser JavaScript exceptions');
  await anonymous.close();
  }
  await context.close();
}catch(error){failed=true;report.fatal=String(error.stack||error).replaceAll(password,'[redacted]');}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));auth.close();store.close();report.finishedAt=new Date().toISOString();report.passed=report.steps.filter(row=>row.status==='PASS').length;report.failed=report.steps.filter(row=>row.status==='FAIL').length;report.status=failed?'FAIL':'PASS';const reportPath=join(output,asyncOnly?'async.json':reportErrorOnly?'report-recovery.json':'report.json');await writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,report:reportPath,screenshots:report.screenshots.length,modelCalls:report.model.calls}));process.exitCode=failed?1:0;}
