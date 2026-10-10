import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { createAdminAuth } from '../src/admin-auth.js';
import { createProductStore } from '../src/product-store.js';
import { localDate, slots } from '../src/booking.js';
import { addDays } from '../src/planning.js';
import { bookingContext } from '../src/ai-context.js';
import { request } from 'node:http';

async function fixture(t, authOptions = {}, appOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'borrow-admin-api-'));
  const file = join(directory, 'isolated.sqlite'), store = createProductStore(file), auth = createAdminAuth(file, authOptions);
  await auth.setup('test-admin', 'isolated-api-password');
  let reportCalls = 0;
  const assistant = {
    status: () => ({ configured: true, model: 'isolated-test-model', calls: reportCalls }),
    assist: async (input, records) => {
      assert.equal(input.mode, 'report'); reportCalls++;
      return { model: 'isolated-test-model', text: '仅用于独立数据库接口验证的模型返回', sections: [], source: bookingContext(records).stats, usage: { prompt_tokens: 0, completion_tokens: 0 } };
    }
  };
  const app = createApp(store, assistant, { ...appOptions, adminAuth: auth });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  t.after(async () => { await new Promise(resolve => app.close(resolve)); auth.close(); store.close(); await rm(directory, { recursive: true, force: true }); });
  const send = (path, { method = 'GET', body, cookie, csrf, origin = base, headers = {} } = {}) => fetch(base + path, {
    method, headers: { ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-Admin-CSRF': csrf } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  async function login() {
    const response = await send('/api/admin/login', { method: 'POST', body: { username: 'test-admin', password: 'isolated-api-password' } });
    assert.equal(response.status, 200); const session = await response.json(), cookie = response.headers.get('set-cookie').split(';')[0];
    assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    return { cookie, csrf: session.csrfToken, session };
  }
  return { file, store, auth, app, assistant, send, login, reportCalls: () => reportCalls, base };
}

test('管理员接口鉴权闭环：演示身份/未登录全拒绝，错误密码、同源保护、CSRF与退出失效', async t => {
  const f = await fixture(t);
  for (const path of ['/session', '/dashboard', '/bookings', '/equipment', '/users', '/analytics', '/reports', '/unknown']) {
    assert.equal((await f.send('/api/admin' + path)).status, 401, path);
    assert.equal((await f.send('/api/admin' + path, { cookie: 'isAdmin=true; userId=demo' })).status, 401, path);
  }
  const ordinary = f.store.users()[0];
  assert.equal((await f.send('/api/admin/equipment/camera', { method: 'PATCH', body: { userId: ordinary.id, operationalStatus: 'maintenance' } })).status, 401);
  const wrong = await f.send('/api/admin/login', { method: 'POST', body: { username: 'test-admin', password: 'wrong-password' } });
  assert.equal(wrong.status, 401); assert.equal(wrong.headers.get('set-cookie'), null);
  assert.equal((await f.send('/api/admin/login', { method: 'POST', origin: 'https://evil.example', body: { username: 'test-admin', password: 'isolated-api-password' } })).status, 403);
  assert.equal((await f.send('/api/admin/login', { method: 'POST', origin: 'http://evil.example', headers: { Host: 'evil.example' }, body: { username: 'test-admin', password: 'isolated-api-password' } })).status, 403);
  assert.equal((await f.send('/api/admin/login', { method: 'POST', headers: { Origin: '' }, body: { username: 'test-admin', password: 'isolated-api-password' } })).status, 403);
  const admin = await f.login();
  assert.deepEqual(await (await f.send('/api/admin/session', admin)).json(), admin.session);
  assert.equal((await f.send('/api/admin/equipment/camera', { method: 'PATCH', cookie: admin.cookie, body: { name: 'changed' } })).status, 403);
  assert.equal((await f.send('/api/admin/equipment/camera', { ...admin, method: 'PATCH', origin: 'https://evil.example', body: { name: 'changed' } })).status, 403);
  assert.equal((await f.send('/api/admin/equipment/camera', { ...admin, method: 'PATCH', csrf: 'a'.repeat(64), body: { name: 'changed' } })).status, 403);
  assert.equal((await f.send('/api/admin/logout', { ...admin, method: 'POST', body: {} })).status, 200);
  assert.equal((await f.send('/api/admin/session', admin)).status, 401);
  assert.equal((await f.send('/api/admin/equipment/camera', { ...admin, method: 'PATCH', body: { name: 'changed' } })).status, 401);
});

test('真实共库联动：用户预约/取消更新后台，管理员取消释放事务，维护冲突阻止且目录持久化', async t => {
  const f = await fixture(t), admin = await f.login(), user = f.store.users()[0], date = addDays(localDate(), 1);
  const input = { userId: user.id, equipmentId: 'camera', date, slot: slots[0] };
  const baseline = await (await f.send('/api/admin/dashboard', admin)).json();
  const booked = await f.send('/api/reservations', { method: 'POST', body: input }); assert.equal(booked.status, 201); const first = await booked.json();
  const list = await (await f.send(`/api/admin/bookings?userId=${user.id}&equipmentId=camera&start=${date}&end=${date}`, admin)).json();
  assert.equal(list.total, 1); assert.equal(list.items[0].id, first.id);
  assert.equal((await f.send(`/api/admin/bookings/${first.id}`, admin)).status, 200);
  const afterBooking = await (await f.send('/api/admin/dashboard', admin)).json(); assert.notDeepEqual(afterBooking, baseline);
  const blocked = await f.send('/api/admin/equipment/camera', { ...admin, method: 'PATCH', body: { operationalStatus: 'maintenance' } }); assert.equal(blocked.status, 409);
  assert.equal((await f.send(`/api/admin/bookings/${first.id}/cancel`, { ...admin, method: 'POST', body: { reason: '独立测试：管理员释放该时段' } })).status, 200);
  assert.equal(f.store.list().length, 0);
  const history = await (await f.send(`/api/admin/bookings/${first.id}`, admin)).json(); assert.equal(history.status || history.booking?.status, 'cancelled');
  assert.equal((await f.send('/api/reservations', { method: 'POST', body: input })).status, 201);
  const second = f.store.list()[0];
  assert.equal((await f.send(`/api/reservations/${second.id}?userId=${user.id}`, { method: 'DELETE' })).status, 200);
  const maintained = await f.send('/api/admin/equipment/camera', { ...admin, method: 'PATCH', body: { name: '隔离测试相机', operationalStatus: 'maintenance' } }); assert.equal(maintained.status, 200);
  const catalog = await (await f.send('/api/equipment')).json(); const camera = catalog.equipment.find(row => row.id === 'camera');
  assert.equal(camera.name, '隔离测试相机'); assert.equal(camera.operationalStatus, 'maintenance');
  const refused = await f.send('/api/reservations', { method: 'POST', body: input });
  assert.equal(refused.status, 422); assert.match((await refused.json()).error, /维护/);
  assert.equal((await f.send('/api/admin/equipment/camera', { ...admin, method: 'PATCH', body: { operationalStatus: 'active' } })).status, 200);
  assert.equal((await f.send('/api/reservations', { method: 'POST', body: input })).status, 201);
  for (const path of [`/users/${user.id}`, '/users', '/equipment', '/equipment/camera', '/analytics']) assert.equal((await f.send('/api/admin' + path, admin)).status, 200, path);
});

test('AI周报仅显式生成一次并保存来源；重复统计/列表读取不调用模型', async t => {
  const f = await fixture(t), admin = await f.login();
  for (let i = 0; i < 3; i++) for (const path of ['/dashboard', '/analytics', '/reports']) assert.equal((await f.send('/api/admin' + path, admin)).status, 200);
  assert.equal(f.reportCalls(), 0);
  const generated = await f.send('/api/admin/reports', { ...admin, method: 'POST', body: {} }); assert.equal(generated.status, 201);
  const report = await generated.json(); assert.ok(report.id); assert.equal(f.reportCalls(), 1);
  const stored = await (await f.send('/api/admin/reports', admin)).json(); assert.ok((stored.items || stored).some(row => row.id === report.id));
  for (const path of ['/dashboard', '/analytics', '/reports']) await f.send('/api/admin' + path, admin);
  assert.equal(f.reportCalls(), 1);
});

test('HTTP限流和会话过期真实拦截，过期后写操作不能执行', async t => {
  let now = Date.now();
  const f = await fixture(t, { clock: () => now, loginLimit: 2, loginWindowMs: 1000, sessionTtlMs: 1000 });
  for (let i = 0; i < 2; i++) assert.equal((await f.send('/api/admin/login', { method: 'POST', body: { username: 'test-admin', password: 'wrong' } })).status, 401);
  assert.equal((await f.send('/api/admin/login', { method: 'POST', body: { username: 'test-admin', password: 'isolated-api-password' } })).status, 429);
  now += 1001; const admin = await f.login();
  assert.equal((await f.send('/api/admin/dashboard', admin)).status, 200);
  now += 1001;
  assert.equal((await f.send('/api/admin/session', admin)).status, 401);
  assert.equal((await f.send('/api/admin/equipment/camera', { ...admin, method: 'PATCH', body: { operationalStatus: 'maintenance' } })).status, 401);
  assert.equal(f.store.catalog().find(row => row.id === 'camera').operationalStatus, 'active');
});

test('会话撤销竞态：已开始的慢速写请求在正文到达后重新校验，退出后不得修改设备', async t => {
  const f = await fixture(t), admin = await f.login(), prior = f.store.catalog().find(row => row.id === 'camera').name;
  let entered;
  const incoming = new Promise(resolve => { entered = resolve; });
  f.app.once('request', () => entered());
  let pending;
  const response = new Promise((resolveResult, reject) => {
    pending = request(new URL('/api/admin/equipment/camera', f.base), { method: 'PATCH', headers: { Origin: f.base, Cookie: admin.cookie, 'X-Admin-CSRF': admin.csrf, 'Content-Type': 'application/json' } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolveResult({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    pending.on('error', reject); pending.write('{"name":');
  });
  await incoming;
  assert.equal((await f.send('/api/admin/logout', { ...admin, method: 'POST', body: {} })).status, 200);
  pending.end('"不应写入的设备名称"}');
  assert.equal((await response).status, 401);
  assert.equal(f.store.catalog().find(row => row.id === 'camera').name, prior);
});

test('会话撤销竞态：AI在途退出后不得保存周报或写入生成审计', async t => {
  const f = await fixture(t), admin = await f.login();
  let entered, finish;
  const incoming = new Promise(resolve => { entered = resolve; });
  f.assistant.assist = async () => {
    entered();
    return new Promise(resolve => { finish = () => resolve({ model: 'isolated-test-model', text: '退出期间的独立测试报告，不能保存', sections: [], source: bookingContext([]).stats }); });
  };
  const generation = f.send('/api/admin/reports', { ...admin, method: 'POST', body: {} });
  await incoming;
  assert.equal((await f.send('/api/admin/logout', { ...admin, method: 'POST', body: {} })).status, 200);
  finish(); assert.equal((await generation).status, 401);
  assert.equal(f.store.admin.reports().total, 0);
});

test('显式HTTPS管理Origin可使用配置域名，默认仍限制回环Host且Cookie标记Secure', async t => {
  const origin = 'https://admin.borrow.example', f = await fixture(t, {}, { adminOrigin: origin });
  const response = await f.send('/api/admin/login', { method: 'POST', origin, headers: { Host: 'admin.borrow.example' }, body: { username: 'test-admin', password: 'isolated-api-password' } });
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /; Secure$/);
  assert.equal((await f.send('/api/admin/login', { method: 'POST', origin: 'http://admin.borrow.example', headers: { Host: 'admin.borrow.example' }, body: { username: 'test-admin', password: 'isolated-api-password' } })).status, 403);
});
