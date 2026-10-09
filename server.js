import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { equipment, slots, BookingError } from './src/booking.js';
import { createAiAssistant } from './src/ai.js';
import { createProductStore } from './src/product-store.js';
import { creativeScenes,inspectPlan } from './src/creative.js';
import { commonAvailability } from './src/planning.js';
import {occupancyHeatmap} from './src/occupancy.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const assets = new Map([
  ...['camera','pocket','air','mic','beam'].map(name=>['/assets/'+name+'.webp',['public/assets/'+name+'.webp','image/webp']]),
  ...['cinema','vlog','outdoor','voice','presentation'].map(name=>['/assets/hero-'+name+'.webp',['public/assets/hero-'+name+'.webp','image/webp']]),
  ['/scene-art.js',['public/scene-art.js','text/javascript; charset=utf-8']],
  ['/profile-client.js',['public/profile-client.js','text/javascript; charset=utf-8']],
  ['/avatar-editor.js',['public/avatar-editor.js','text/javascript; charset=utf-8']],
  ...['booking-flow.js','booking-intent.js','booking-receipt.js','booking-picker.js','ai-request.js','occupancy-view.js'].map(file=>['/'+file,['public/'+file,'text/javascript; charset=utf-8']]),
  ['/occupancy.js',['src/occupancy.js','text/javascript; charset=utf-8']],
  ['/notifications.js',['src/notifications.js','text/javascript; charset=utf-8']],
  ['/interactions.css',['public/interactions.css','text/css; charset=utf-8']],
  ['/task-flow.css',['public/task-flow.css','text/css; charset=utf-8']],
  ['/booking-picker.css',['public/booking-picker.css','text/css; charset=utf-8']],
  ['/plan-flow.js',['public/plan-flow.js','text/javascript; charset=utf-8']],
  ['/desktop-polish.css',['public/desktop-polish.css','text/css; charset=utf-8']],
  ['/desktop-workspace.css',['public/desktop-workspace.css','text/css; charset=utf-8']],
  ['/detail-view.js',['public/detail-view.js','text/javascript; charset=utf-8']],
  ['/creative.js',['src/creative.js','text/javascript; charset=utf-8']],
  ['/plan-state.js',['src/plan-state.js','text/javascript; charset=utf-8']],
  ['/settings.js',['public/settings.js','text/javascript; charset=utf-8']],
  ['/product-logic.css',['public/product-logic.css','text/css; charset=utf-8']],
  ['/brand.svg',['public/brand.svg','image/svg+xml']],
  ['/manifest.webmanifest',['public/manifest.webmanifest','application/manifest+json']],
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/browser-api.js', ['public/browser-api.js', 'text/javascript; charset=utf-8']],
  ['/booking.js', ['src/booking.js', 'text/javascript; charset=utf-8']],
  ['/export-csv.js', ['public/export-csv.js', 'text/javascript; charset=utf-8']],
  ['/reservation-view.js', ['public/reservation-view.js', 'text/javascript; charset=utf-8']],
  ['/planning.js', ['src/planning.js', 'text/javascript; charset=utf-8']],
  ['/device-art.js', ['public/device-art.js', 'text/javascript; charset=utf-8']],
  ...['carousel.js','preferences.js','catalog-view.js','submission.js','showcase.js','product.js','creative-client.js','navigation.js','icons.js'].map(file=>['/'+file,['public/'+file,'text/javascript; charset=utf-8']]),
  ['/catalog.js', ['src/catalog.js', 'text/javascript; charset=utf-8']],
  ['/vendor/papaparse.min.js', ['public/vendor/papaparse.min.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']]
  ,...['tokens.css','shell.css','showcase.css','workspace.css','product.css'].map(file=>['/'+file,['public/'+file,'text/css; charset=utf-8']])
]);
export function createApp(store = createProductStore(resolve(root,'data/borrow-lab.sqlite'),{legacyFile:resolve(root,'data/reservations.json')}), assistant = null, {catalog=equipment,demo=null}={}) {
  assistant ||= createAiAssistant({catalog});
  return createServer(async (req, res) => {
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");
    function json(status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const url=new URL(req.url,'http://localhost');
      if (!['GET','HEAD'].includes(req.method) && req.headers.origin) {
        const origin=new URL(req.headers.origin);
        if (!['localhost','127.0.0.1','[::1]'].includes(origin.hostname) || origin.host!==req.headers.host) throw new BookingError('请求来源不受支持。',403);
      }
      async function inputBody(limit=550000){const parts=[];let length=0;for await(const part of req){length+=part.length;if(length>limit)throw new BookingError('内容过长。',413);parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new BookingError('内容格式错误。',400);}}
      if(req.method==='GET'&&path==='/api/environment')return json(200,demo||{demo:false});
      if(req.method==='GET'&&path==='/api/users'){const users=store.users();if(demo)users.sort((a,b)=>Number(b.id===demo.users[0].id)-Number(a.id===demo.users[0].id));return json(200,users);}
      if(req.method==='POST'&&path==='/api/users')return json(201,store.createUser(await inputBody(4096)));
      if(req.method==='GET'&&path==='/api/workspace')return json(200,store.workspace(url.searchParams.get('userId')));
      if(req.method==='POST'&&path==='/api/notifications/read'){const input=await inputBody(110000);return json(200,store.markNotificationsRead(input.userId,input.ids));}
      if(req.method==='PATCH'&&path==='/api/preferences'){const input=await inputBody();return json(200,store.preferences(input.userId,input));}
      if(req.method==='POST'&&path==='/api/favorites'){const input=await inputBody(4096);return json(200,store.favorite(input.userId,input.equipmentId,!!input.enabled));}
      if(req.method==='GET'&&path==='/api/scenes')return json(200,creativeScenes);
      if(req.method==='POST'&&path==='/api/plans/check'){
        const input=await inputBody(8192),records=await store.list(),checked=inspectPlan(input,records,catalog);
        return json(200,{...checked,commonTimes:commonAvailability(checked,records,catalog)});
      }
      if(req.method==='POST'&&path==='/api/plans'){const input=await inputBody(8192);return json(201,store.savePlan(input.userId,input,input.id));}
      if(req.method==='POST'&&path==='/api/plans/ready'){const input=await inputBody(4096);return json(200,store.readyPlan(input.userId,input.id));}
      if(req.method==='GET'&&path==='/api/replacements')return json(200,store.replace(url.searchParams.get('equipmentId'),url.searchParams.get('date'),url.searchParams.get('slot')));
      if(req.method==='GET'&&path==='/api/heatmap')return json(200,occupancyHeatmap(await store.list(),undefined,catalog));
      if (req.method === 'GET' && path === '/api/equipment') return json(200, { equipment:catalog, slots });
      if (req.method === 'GET' && path === '/api/reservations') return json(200, await store.list());
      if (req.method === 'POST' && path === '/api/reservations/batch')return json(201,await store.reserveSet(await inputBody(8192)));
      if (req.method === 'GET' && path === '/api/ai/status') return json(200, assistant.status());
      if (req.method === 'POST' && path === '/api/ai/assist') {
        const parts = []; let length = 0;
        for await (const part of req) {
          length += part.length;
          if (length > 4096) throw new BookingError('问题内容过长。', 413);
          parts.push(part);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new BookingError('问题格式错误。', 400); }
        const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});
        const result=await assistant.assist(input, await store.list(),{signal:controller.signal});
        if(!res.destroyed)return json(200,result);return;
      }
      if (req.method === 'POST' && path === '/api/reservations') {
        const chunks = []; let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 8192) throw new BookingError('预约信息过长。', 413);
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks).toString('utf8');
        let input;
        try { input = JSON.parse(body); } catch { throw new BookingError('预约信息格式错误。', 400); }
        return json(201, await store.add(input));
      }
      if (req.method === 'DELETE' && /^\/api\/reservations\/[a-zA-Z0-9-]+$/.test(path)) {
        await store.cancel(path.split('/').pop(),url.searchParams.get('userId')||undefined);
        return json(200, { ok: true });
      }
      if (req.method === 'GET' && assets.has(path)) {
        const [file, contentType] = assets.get(path);
        const body = await readFile(resolve(root, file));
        res.writeHead(200, { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' });
        return res.end(body);
      }
      json(404, { error: '页面或接口不存在。' });
    } catch (error) {
      if(res.destroyed)return;
      if (!(error instanceof BookingError)) console.error(error);
      json(error.status || 500, { error: error.status ? error.message : '服务器暂时出错，请稍后重试。' });
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try { process.loadEnvFile(resolve(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, '127.0.0.1', () => console.log(`器材预约已启动：http://localhost:${port}`));
}
