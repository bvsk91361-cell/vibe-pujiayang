import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createStore } from './src/store.js';
import { equipment, slots, BookingError } from './src/booking.js';
import { createAiAssistant } from './src/ai.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const assets = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/browser-api.js', ['public/browser-api.js', 'text/javascript; charset=utf-8']],
  ['/booking.js', ['src/booking.js', 'text/javascript; charset=utf-8']],
  ['/export-csv.js', ['public/export-csv.js', 'text/javascript; charset=utf-8']],
  ['/reservation-view.js', ['public/reservation-view.js', 'text/javascript; charset=utf-8']],
  ['/planning.js', ['src/planning.js', 'text/javascript; charset=utf-8']],
  ['/device-art.js', ['public/device-art.js', 'text/javascript; charset=utf-8']],
  ['/vendor/papaparse.min.js', ['public/vendor/papaparse.min.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']]
]);
export function createApp(store = createStore(resolve(root, 'data/reservations.json')), assistant = createAiAssistant()) {
  return createServer(async (req, res) => {
    function json(status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/equipment') return json(200, { equipment, slots });
      if (req.method === 'GET' && path === '/api/reservations') return json(200, await store.list());
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
        return json(200, await assistant.assist(input, await store.list()));
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
        await store.cancel(path.split('/').pop());
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
