import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const paths = new Set(['index.html', 'app.js', 'booking.js', 'browser-api.js', 'export-csv.js', 'reservation-view.js', 'style.css', 'vendor/papaparse.min.js']);
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (req.method !== 'GET' || !paths.has(path)) { res.writeHead(404); return res.end('Not found'); }
  try {
    const body = await readFile(new URL(`../dist/${path}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': `${types[path.split('.').pop()]}; charset=utf-8` }); res.end(body);
  } catch { res.writeHead(404); res.end('Run npm run build:pages first'); }
}).listen(3003, '127.0.0.1', () => console.log('Pages preview: http://localhost:3003/'));
