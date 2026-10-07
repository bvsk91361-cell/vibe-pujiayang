import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createStore } from './src/store.js';
import { equipment, slots, BookingError } from './src/booking.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const assets = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']]
]);
export function createApp(store = createStore(resolve(root, 'data/reservations.json'))) {
  return createServer(async (req, res) => {
    function json(status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/equipment') return json(200, { equipment, slots });
      if (req.method === 'GET' && path === '/api/reservations') return json(200, await store.list());
      if (req.method === 'POST' && path === '/api/reservations') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 8192) throw new BookingError('预约信息过长。', 413); }
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
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, '127.0.0.1', () => console.log(`器材预约已启动：http://localhost:${port}`));
}
