import {icon, brandSymbol} from './icons.js';
import {categories} from './catalog.js';
import {renderLogin as loginMarkup,renderShell as shellMarkup,renderHeading as heading,renderSpace} from './admin/space.js';
import {drawerContent} from './admin/details.js';
import {createAdminClient} from './admin/api.js';
import {createLiveSync} from './admin/live.js';
import {mountMotion,animateLoginSubmit} from './admin/motion.js';
import {reconcile} from './admin/reconcile.js';
import {escapeHtml as esc,number} from './admin-charts.js';

const root=document.querySelector('#admin-root'), overlay=document.querySelector('#admin-overlay'), toastNode=document.querySelector('#admin-toast');
const pages={dashboard:{context:'Command Center'},equipment:{context:'设备智能中心'},bookings:{context:'时间流调度'},users:{context:'创作者网络'},operations:{context:'AI 运营中心'},analytics:{context:'资源洞察'},system:{context:'系统'}};
const stateNames={upcoming:'待使用',current:'当前时段',occupied:'当前时段占用',expired:'已到期',cancelled:'已取消',active:'可运营',available:'可预约',maintenance:'维护中'};
let motion=null,live=null,liveMode='polling';
let session=null, currentPage='', request=null, requestSequence=0, detailRequest=null, detailSequence=0, reportRequestSequence=0, lastUpdated='', filterTimer, toastTimer, reportBusy=false, drawerState=null, previousFocus=null;
const params={dashboard:{days:'7'},bookings:{page:'1',pageSize:'100'},equipment:{days:'7'},users:{days:'7'},analytics:{days:'14'},operations:{days:'7'},system:{}};
let filterOptions={categories}, reportData=null;
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('borrow-lab-changes'):null;

function frontendUrl(){try{const hash=sessionStorage.getItem('borrow-admin-return');return '/'+(hash&&/^#[a-zA-Z0-9/_?=&.-]+$/.test(hash)?hash:'#workspace');}catch{return '/#workspace';}}
function timeLabel(value){if(!value)return '尚未同步';const date=new Date(value);return Number.isNaN(date.getTime())?'尚未同步':date.toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'});}
function fullTime(value){if(!value)return '暂无记录';const date=new Date(value);return Number.isNaN(date.getTime())?esc(value):date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});}
function badge(state){return `<span class="badge badge-${esc(state)}">${esc(stateNames[state]||state||'暂无')}</span>`;}
function empty(message='暂无记录',description='数据变化后，这里会自动更新'){return `<div class="empty-state">${icon('calendar')}<strong>${esc(message)}</strong><span>${esc(description)}</span></div>`;}
function loading(){return `<div class="loading-grid">${Array.from({length:4},()=>'<div class="skeleton"></div>').join('')}</div><div class="skeleton loading-panel"></div>`;}
function toast(message){clearTimeout(toastTimer);toastNode.textContent=message;toastNode.classList.add('visible');toastTimer=setTimeout(()=>toastNode.classList.remove('visible'),3500);}
function syncStatus(kind='ready'){const target=document.querySelector('#sync-status');if(!target)return;target.className=`sync-status ${kind==='error'?'failed':kind==='loading'?'syncing':''}`;target.innerHTML=`<i class="sync-dot"></i><span>${kind==='error'?`同步失败 · 上次 ${timeLabel(lastUpdated)}`:kind==='loading'?'正在同步':`${liveMode==='events'?'事件同步':'已更新'} · ${timeLabel(lastUpdated)}`}</span>`;}
const client=createAdminClient({getSession:()=>session,onUnauthorized:unauthorized});
const api=(path,options)=>client.request(path,options);
function notifyChange(){channel?.postMessage({type:'changed',at:Date.now()});}
function card(title,subtitle,body,{id='',action='',className=''}={}){return `<section class="card ${className}" ${id?`id="${id}"`:''}><div class="card-header"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${action}</div>${body}</section>`;}
function mount(target,html){return reconcile(typeof target==='string'?document.querySelector(target):target,html);}

function renderLogin(message=''){
 currentPage='login';request?.abort();live?.dispose();closeOverlay();motion?.dispose();
 root.innerHTML=loginMarkup({message,frontendUrl:frontendUrl()});motion=mountMotion(root);
 if(location.hash!=='#/login')history.replaceState(null,'','#/login');
}
function renderShell(){motion?.dispose();root.innerHTML=shellMarkup({admin:session.admin,frontendUrl:frontendUrl()});motion=mountMotion(root);startLive();}
function startLive(){live?.dispose();live=createLiveSync({hasSession:()=>!!session,onChange:loadPage,onExpired:unauthorized,onMode:mode=>{liveMode=mode;const status=document.querySelector('#sync-status');if(status)status.dataset.transport=mode;}});live.start();}
function unauthorized(){session=null;request?.abort();live?.dispose();closeOverlay();renderLogin('管理员会话已失效，请重新登录。');}
function optionHtml(rows,label,value='id',name='name'){return `<option value="">${label}</option>${(rows||[]).map(row=>`<option value="${esc(typeof row==='string'?row:row[value])}">${esc(typeof row==='string'?row:row[name]||row.name||row.id)}</option>`).join('')}`;}
function filters(page){if(page==='bookings')return `<form class="card filter-card" id="filter-form"><div class="filter-grid booking-filters"><label class="field"><span>关键字</span><input name="keyword" placeholder="搜索用户、设备或预约编号" value="${esc(params.bookings.keyword)}"></label><label class="field"><span>用户身份</span><select name="userId">${optionHtml(filterOptions.users,'全部用户')}</select></label><label class="field"><span>设备</span><select name="equipmentId">${optionHtml(filterOptions.equipment,'全部设备')}</select></label><label class="field"><span>预约状态</span><select name="status"><option value="">全部状态</option><option value="upcoming">待使用</option><option value="current">当前时段</option><option value="expired">已到期</option><option value="cancelled">已取消</option></select></label></div><div class="filter-secondary"><label class="field"><span>开始日期</span><input name="from" type="date"></label><label class="field"><span>结束日期</span><input name="to" type="date"></label><label class="field"><span>设备分类</span><select name="category">${optionHtml(filterOptions.categories,'全部分类')}</select></label><label class="field"><span>预约时段</span><select name="slot"><option value="">全部时段</option>${['09:00–11:00','14:00–16:00','19:00–21:00'].map(slot=>`<option>${slot}</option>`).join('')}</select></label><button type="button" class="btn btn-quiet btn-small" data-action="reset-filters">重置筛选</button></div></form>`;
  if(page==='equipment')return `<form class="card filter-card" id="filter-form"><div class="filter-grid"><label class="field"><span>设备搜索</span><input name="keyword" placeholder="设备名称、编号或描述"></label><label class="field"><span>设备分类</span><select name="category">${optionHtml(filterOptions.categories,'全部分类')}</select></label><label class="field"><span>运营状态</span><select name="status"><option value="">全部状态</option><option value="active">可运营</option><option value="maintenance">维护中</option></select></label><div class="field"><span>&nbsp;</span><button type="button" class="btn btn-quiet" data-action="reset-filters">重置筛选</button></div></div></form>`;
  if(page==='users')return `<form class="card filter-card" id="filter-form"><div class="filter-grid"><label class="field"><span>搜索身份</span><input name="keyword" placeholder="输入身份名称或编号"></label><div class="field"><span>&nbsp;</span><button type="button" class="btn btn-quiet" data-action="reset-filters">重置筛选</button></div></div></form>`;
  return '';
}
function restoreFilters(){const form=document.querySelector('#filter-form');if(!form)return;for(const [key,value]of Object.entries(params[currentPage]||{})){const input=form.elements.namedItem(key);if(input)input.value=value;}}
function updateOptions(options){if(!options)return;filterOptions={...filterOptions,...options};const form=document.querySelector('#filter-form');if(!form)return;for(const [key,rows]of Object.entries(options)){const name={users:'userId',equipment:'equipmentId',categories:'category'}[key];const select=form.elements.namedItem(name);if(select&&select.tagName==='SELECT'){const labels={users:'全部用户',equipment:'全部设备',categories:'全部分类'};const html=optionHtml(rows,labels[key]);if(select.dataset.options!==html){select.innerHTML=html;select.dataset.options=html;select.value=params[currentPage]?.[name]||'';}}}}
async function navigate(){
  const page=location.hash.replace(/^#\/?/,'').split('?')[0]||'dashboard';
  if(!session){renderLogin();return;}
  if(page==='login'){location.hash='#/dashboard';return;}
  const next=pages[page]?page:'dashboard';if(currentPage===next){loadPage();return;}
  request?.abort();closeOverlay();if(!document.querySelector('.admin-shell'))renderShell();currentPage=next;
  document.querySelectorAll('[data-page]').forEach(link=>{const active=link.dataset.page===next;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  document.querySelector('#topbar-title').textContent=pages[next].context;
  document.querySelector('#admin-main').innerHTML=`<div class="page-enter">${heading(next,{params:params[next]||{}})}${filters(next)}<div id="page-error"></div><div id="page-data" aria-busy="true">${loading()}</div>${next==='operations'?'<div id="report-area"></div>':''}</div>`;
  restoreFilters();await loadPage();if(next==='operations')loadReports();
}
async function loadPage(){
  if(!session||!pages[currentPage])return;
  request?.abort();request=new AbortController();const sequence=++requestSequence,page=currentPage;
  syncStatus('loading');const dataNode=document.querySelector('#page-data');dataNode?.setAttribute('aria-busy','true');
  const query=new URLSearchParams(Object.entries(params[page]||{}).filter(([,value])=>value!==''&&value!=null));
  try{const queryPart=query.size?'?'+query:'';const primaryPage=page==='operations'?'analytics':page;const [data,intelligence]=await Promise.all([page==='system'?Promise.resolve({}):api(primaryPage+queryPart,{signal:request.signal}),api('intelligence'+queryPart,{signal:request.signal})]);if(sequence!==requestSequence||page!==currentPage)return;
    lastUpdated=intelligence.updatedAt||data.updatedAt||data.generatedAt||new Date().toISOString();mount('#page-error','');renderData(page,data,intelligence);if(data.filters)updateOptions(data.filters);if(data.categories)updateOptions({categories:data.categories});syncStatus();
  }catch(error){if(error.name==='AbortError'||sequence!==requestSequence||page!==currentPage||!session)return;syncStatus('error');mount('#page-error',`<div class="error-banner" role="alert"><span>${esc(error.message)}${lastUpdated?` 当前保留上次 ${timeLabel(lastUpdated)} 的数据。`:''}</span><button class="btn btn-small" data-action="refresh">重新同步</button></div>`);if(dataNode?.querySelector('.loading-grid'))mount(dataNode,empty('暂时无法加载','重新同步后即可继续查看'));
  }finally{if(sequence===requestSequence)dataNode?.setAttribute('aria-busy','false');}
}

function renderData(page,data,intelligence){const changed=mount('#page-data',renderSpace(page,{primary:data,intelligence,session},{params:params[page]||{},filterOptions,session}));if(changed)motion?.refresh();}
function reportHtml(report){if(!report)return `<div class="report-empty">${icon('spark')}<div>尚未保存管理员周报。<p class="muted">点击“生成本周周报”，根据真实台账按需生成并保存。</p></div></div>`;
  return `<div class="report-meta"><span>统计周期 ${esc(report.period?.start||report.source?.start||'')} — ${esc(report.period?.end||report.source?.end||'')}</span><span>生成于 ${fullTime(report.generatedAt)}</span><span>${report.provider==='ledger'?'台账结果':'AI 周报'}${report.model?' · '+esc(report.model):''}</span></div><div class="report-body report-text">${esc(report.text||'暂无报告正文')}</div><p class="report-footnote">依据预约台账生成；报告反映生成时的数据，不随图表刷新重新调用模型。预约占用不代表实际领用时长。</p>`;}
function renderReports(error=''){if(currentPage!=='operations')return;const reports=reportData?.items||[];mount('#report-area',card('AI 周报与调度建议','当前自然周 · 读取已保存结果，按需调用现有模型服务',`${error?`<div class="inline-error" role="alert" style="margin-bottom:16px">${esc(error)}</div>`:''}${reports.length>1?`<label class="field" style="margin-bottom:18px"><span>已保存周报 · ${number(reportData.total)} 份</span><select id="report-selector">${reports.map(report=>`<option value="${esc(report.id)}">${esc(report.period?.start||'')} — ${esc(report.period?.end||'')} · ${fullTime(report.generatedAt)}</option>`).join('')}</select></label>`:''}<div id="selected-report">${reportHtml(reportData?.latest)}</div>`,{className:'report-card',action:`<button class="btn btn-primary btn-small" data-action="generate-report" ${reportBusy?'disabled':''}>${reportBusy?'<i class="spinner"></i>正在生成':'生成本周周报 '+icon('spark')}</button>`}));}
async function loadReports(){if(!session||currentPage!=='operations')return;const sequence=++reportRequestSequence,requestSession=session;try{const result=await api('reports?pageSize=20');if(sequence!==reportRequestSequence||session!==requestSession||currentPage!=='operations')return;reportData=result;renderReports();}catch(error){if(sequence===reportRequestSequence&&session===requestSession&&currentPage==='operations')renderReports(error.message);}}

function setOverlay(html){if(!overlay.childElementCount)previousFocus=document.activeElement;overlay.innerHTML=html;document.body.style.overflow='hidden';document.querySelector('.admin-shell')?.setAttribute('inert','');queueMicrotask(()=>{overlay.querySelector('input,button,[tabindex="0"]')?.focus();});}
function closeOverlay(){detailRequest?.abort();detailSequence++;overlay.innerHTML='';drawerState=null;document.body.style.overflow='';document.querySelector('.admin-shell')?.removeAttribute('inert');if(previousFocus?.isConnected)previousFocus.focus();previousFocus=null;}
function renderDrawer(type,data){drawerState={type,data};const titles={bookings:'预约详情',equipment:'设备管理',users:'用户详情'};
  setOverlay(`<div class="overlay-backdrop" data-action="backdrop"><section class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"><header class="drawer-header"><div><h2 id="drawer-title">${titles[type]}</h2><p>${type==='equipment'?'同一份设备台账，前后台同步':type==='users'?'真实预约记录 · 只读':'保留完整预约历史'}</p></div><button class="icon-button" data-action="close-overlay" aria-label="关闭详情">${icon('close')}</button></header><div class="drawer-body">${drawerContent(type,data)}</div><footer class="drawer-footer"><button class="btn btn-quiet" data-action="close-overlay">关闭</button>${type==='bookings'&&data.canCancel?`<button class="btn btn-danger" data-action="confirm-cancel" data-id="${esc(data.id)}">取消此预约</button>`:type==='equipment'?'<button class="btn btn-primary" type="submit" form="equipment-form">保存设备信息</button>':''}</footer></section></div>`);
}
async function openDetail(type,id){
  detailRequest?.abort();detailRequest=new AbortController();const sequence=++detailSequence;drawerState=null;
  setOverlay(`<div class="overlay-backdrop" data-action="backdrop"><section class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"><header class="drawer-header"><h2 id="drawer-title">正在读取详情</h2><button class="icon-button" data-action="close-overlay" aria-label="关闭详情">${icon('close')}</button></header><div class="drawer-body"><div class="skeleton loading-panel"></div></div></section></div>`);
  try{const data=await api(type+'/'+encodeURIComponent(id),{signal:detailRequest.signal});if(sequence!==detailSequence)return;renderDrawer(type,data);}catch(error){if(error.name==='AbortError'||sequence!==detailSequence||!session)return;setOverlay(`<div class="overlay-backdrop" data-action="backdrop"><section class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="drawer-title"><h2 id="drawer-title">暂时无法读取详情</h2><p>${esc(error.message)}</p><div class="confirm-actions"><button class="btn" data-action="close-overlay">关闭</button><button class="btn btn-primary" data-detail="${type}" data-id="${esc(id)}">重试</button></div></section></div>`);}
}
function confirmCancel(id){const data=drawerState?.data;setOverlay(`<div class="overlay-backdrop modal-backdrop"><section class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">取消这条预约？</h2><p>${esc(data?.user?.name||'用户')} 的 ${esc(data?.equipment?.name||'设备')}<br>${esc(data?.date||'')} · ${esc(data?.slot||'')}<br>确认后将释放对应时段。历史记录与取消原因会保留。</p><form id="cancel-form" data-id="${esc(id)}"><label class="field"><span>取消原因</span><textarea name="reason" required maxlength="200" placeholder="填写简短说明，便于追溯此次管理操作"></textarea></label><div class="inline-error" id="cancel-error" role="alert"></div><div class="confirm-actions"><button type="button" class="btn btn-quiet" data-action="cancel-confirm">返回详情</button><button type="submit" class="btn btn-danger">确认取消预约</button></div></form></section></div>`);}
function collectFilters(){const form=document.querySelector('#filter-form');if(!form)return;for(const [key,value]of new FormData(form).entries())params[currentPage][key]=String(value).trim();if(currentPage==='bookings')params.bookings.page='1';loadPage();}

document.addEventListener('submit',async event=>{
  const form=event.target;if(!['login-form','filter-form','equipment-form','cancel-form'].includes(form.id))return;event.preventDefault();
  if(form.id==='filter-form'){clearTimeout(filterTimer);collectFilters();return;}
  const button=document.querySelector(form.id==='equipment-form'?'[form="equipment-form"]':`#${form.id} [type="submit"]`);if(button?.disabled)return;const previous=button?.innerHTML;const inputs=new FormData(form),submittedDetailSequence=detailSequence,submittedSession=session;if(button){button.disabled=true;button.innerHTML='<i class="spinner"></i>正在提交';}
  try{
    if(form.id==='login-form'){
      document.querySelector('#login-error').textContent='';animateLoginSubmit(root);session=await api('login',{method:'POST',body:{username:String(inputs.get('username')).trim(),password:String(inputs.get('password'))}});
      form.elements.password.value='';renderShell();currentPage='';location.hash='#/dashboard';toast('登录成功，欢迎进入管理控制台。');
    }else if(form.id==='equipment-form'){
      document.querySelector('#drawer-error').textContent='';const body=Object.fromEntries(inputs);const result=await api('equipment/'+encodeURIComponent(form.dataset.id),{method:'PATCH',body});if(session===submittedSession&&detailSequence===submittedDetailSequence&&drawerState?.type==='equipment'&&drawerState.data.id===form.dataset.id)renderDrawer('equipment',result);toast('设备信息已保存，用户端将同步更新。');notifyChange();await loadPage();
    }else if(form.id==='cancel-form'){
      document.querySelector('#cancel-error').textContent='';const result=await api('bookings/'+encodeURIComponent(form.dataset.id)+'/cancel',{method:'POST',body:{reason:String(inputs.get('reason')).trim()}});if(session===submittedSession&&detailSequence===submittedDetailSequence&&drawerState?.type==='bookings'&&drawerState.data.id===form.dataset.id)renderDrawer('bookings',result);toast('预约已取消，对应时段已释放。');notifyChange();await loadPage();
    }
  }catch(error){const selector=form.id==='login-form'?'#login-error':form.id==='equipment-form'?'#drawer-error':'#cancel-error';const errorNode=document.querySelector(selector),sameContext=form.id==='login-form'||(session===submittedSession&&detailSequence===submittedDetailSequence&&drawerState?.data.id===form.dataset.id);if(errorNode&&sameContext)errorNode.textContent=error.message;else if(session)toast(error.message);}
  finally{if(button?.isConnected){button.disabled=false;button.innerHTML=previous;}}
});
document.addEventListener('input',event=>{if(event.target.closest('#filter-form')&&event.target.tagName==='INPUT'){clearTimeout(filterTimer);filterTimer=setTimeout(collectFilters,300);}});
document.addEventListener('change',event=>{if(event.target.closest('#filter-form')){clearTimeout(filterTimer);collectFilters();}if(event.target.id==='report-selector'){const report=reportData?.items.find(item=>item.id===event.target.value);mount('#selected-report',reportHtml(report));}});
document.addEventListener('click',async event=>{
  if(event.target.closest('.skip-link')){event.preventDefault();const main=document.querySelector('#admin-main');main?.focus();main?.scrollIntoView({block:'start'});return;}
  const target=event.target.closest('[data-action],[data-detail],[data-heat-date],[data-days],[data-page-number]');if(!target)return;
  if(target.dataset.detail){openDetail(target.dataset.detail,target.dataset.id);return;}
  if(target.dataset.heatDate){params.bookings={page:'1',pageSize:'100',from:target.dataset.heatDate,to:target.dataset.heatDate,slot:target.dataset.heatSlot};closeOverlay();if(currentPage==='bookings'){restoreFilters();loadPage();}else location.hash='#/bookings';return;}
  if(target.dataset.days){params[currentPage].days=target.dataset.days;document.querySelectorAll('[data-days]').forEach(button=>{const active=button===target;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});loadPage();return;}
  if(target.dataset.pageNumber){params.bookings.page=target.dataset.pageNumber;loadPage();return;}
  const action=target.dataset.action;
  if(action==='toggle-password'){const input=document.querySelector('[name="password"]'),show=input.type==='password';input.type=show?'text':'password';target.textContent=show?'隐藏':'显示';target.setAttribute('aria-pressed',String(show));target.setAttribute('aria-label',show?'隐藏密码':'显示密码');input.focus();}
  if(action==='refresh'){loadPage();if(currentPage==='operations')loadReports();}
  if(action==='reset-filters'){params[currentPage]=currentPage==='bookings'?{page:'1',pageSize:'100'}:{};document.querySelector('#filter-form')?.reset();loadPage();}
  if(action==='close-overlay'||(action==='backdrop'&&event.target===target))closeOverlay();
  if(action==='confirm-cancel')confirmCancel(target.dataset.id);
  if(action==='cancel-confirm'){if(drawerState)renderDrawer(drawerState.type,drawerState.data);else closeOverlay();}
  if(action==='logout'){
    if(target.disabled)return;target.disabled=true;
    try{await api('logout',{method:'POST',body:{}});session=null;notifyChange();location.assign(frontendUrl());}catch(error){if(session){toast(error.message);target.disabled=false;}}
  }
  if(action==='generate-report'){
    if(reportBusy)return;reportBusy=true;reportRequestSequence++;renderReports();
    try{await api('reports',{method:'POST',body:{}});toast('本周周报已生成并保存。');await loadReports();}catch(error){if(session)renderReports(error.message);}finally{reportBusy=false;if(currentPage==='operations'){const button=document.querySelector('[data-action="generate-report"]');if(button){button.disabled=false;button.innerHTML='生成本周周报 '+icon('spark');}}}
  }
});
document.addEventListener('keydown',event=>{
  if(!overlay.childElementCount)return;
  if(event.key==='Escape'){event.preventDefault();if(overlay.querySelector('#cancel-form')&&drawerState)renderDrawer(drawerState.type,drawerState.data);else closeOverlay();return;}
  if(event.key==='Tab'){const focusable=[...overlay.querySelectorAll('button:not(:disabled),input,textarea,select,a[href],summary,[tabindex="0"]')].filter(node=>node.getClientRects().length),first=focusable[0],last=focusable.at(-1);if(!first)return;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
});
window.addEventListener('hashchange',()=>{clearTimeout(filterTimer);navigate();});



if(channel)channel.onmessage=()=>{if(!document.hidden&&session)loadPage();};
window.addEventListener('pagehide',()=>{request?.abort();detailRequest?.abort();live?.dispose();motion?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted){motion=mountMotion(root);if(session){startLive();loadPage();}}});
async function boot(){try{session=await api('session');await navigate();}catch(error){renderLogin(error.status===401?'':error.message);}}
boot();
