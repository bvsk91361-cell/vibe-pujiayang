import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { createStore } from '../src/store.js';
import { validateBooking, BookingError } from '../src/booking.js';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const today = '2026-10-07';
const example = { name: '蒲嘉洋', equipmentId: 'camera', date: '2099-10-07', slot: '09:00–11:00' };
test('业务规则1：有效预约保留器材、日期、时段，并去掉姓名两端空格', () => {
  assert.deepEqual(validateBooking({ ...example, name: ' 蒲嘉洋 ' }, [], today), example);
});
test('业务规则2：同器材、同日期、同时段的重复预约返回409', () => {
  assert.throws(() => validateBooking({ ...example, name: '另一位同学' }, [example], today), error => error instanceof BookingError && error.status === 409);
});
test('业务规则3：不同器材或日期或时段不会被误判为重复', () => {
  for (const change of [{ equipmentId: 'projector' }, { date: '2099-10-08' }, { slot: '14:00–16:00' }]) {
    assert.doesNotThrow(() => validateBooking({ ...example, ...change }, [example], today));
  }
});
test('业务规则4：空姓名、未知器材和非法时段必须被拒绝', () => {
  for (const change of [{ name: ' ' }, { name: 'a'.repeat(31) }, { equipmentId: 'missing' }, { slot: '25:00–27:00' }]) {
    assert.throws(() => validateBooking({ ...example, ...change }, [], today), BookingError);
  }
});
test('业务规则5：过去日期、不存在的日期和错误日期格式必须被拒绝', () => {
  for (const date of ['2026-10-06', '2099-02-30', '2099-13-01', '2099-1-1', 'not-a-date']) {
    assert.throws(() => validateBooking({ ...example, date }, [], today), BookingError);
  }
  assert.doesNotThrow(() => validateBooking({ ...example, date: today }, [], today));
});
test('接口闭环：预约保存、重建存储后读取、重复拒绝、取消后重新预约', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vibe-pjy-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'reservations.json');
  const store = createStore(file);
  const app = createApp(store);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = input => fetch(`${base}/api/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const catalog = await (await fetch(`${base}/api/equipment`)).json();
  assert.equal(catalog.equipment.length, 3);
  assert.equal(catalog.slots.length, 3);
  const created = await post(example);
  assert.equal(created.status, 201);
  const record = await created.json();
  assert.equal(record.name, '蒲嘉洋');
  assert.ok(record.id);
  assert.equal((await createStore(file).list())[0].id, record.id);
  const list = await (await fetch(`${base}/api/reservations`)).json();
  assert.equal(list[0].id, record.id);
  const duplicate = await post(example);
  assert.equal(duplicate.status, 409);
  assert.match((await duplicate.json()).error, /已被预约/);
  assert.equal((await fetch(`${base}/api/reservations/${record.id}`, { method: 'DELETE' })).status, 200);
  assert.deepEqual(await store.list(), []);
  assert.equal((await post(example)).status, 201);
  assert.equal((await fetch(`${base}/api/reservations/not-found`, { method: 'DELETE' })).status, 404);
  assert.equal((await post({ ...example, name: '' })).status, 422);
  assert.equal((await fetch(`${base}/api/reservations`, { method: 'POST', body: '{bad json' })).status, 400);
  assert.equal((await fetch(`${base}/not-an-asset`)).status, 404);
  assert.equal((await fetch(`${base}/`)).status, 200);
});
test('并发护栏：同时提交两个重复预约，只允许一个写入', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vibe-pjy-race-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createStore(join(directory, 'reservations.json'));
  const results = await Promise.allSettled([store.add(example), store.add(example)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
  assert.equal((await store.list()).length, 1);
});

test('HTTP分块UTF-8：中文姓名跨数据块时必须原样保存', async t => {
  const app = createApp({ add: async input => input });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const body = Buffer.from(JSON.stringify(example));
  const split = body.indexOf(Buffer.from('蒲')) + 1;
  const result = await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: app.address().port, path: '/api/reservations', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      const parts = []; res.on('data', part => parts.push(part));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(parts).toString('utf8')) }));
    });
    req.on('error', reject); req.write(body.subarray(0, split));
    delay(20).then(() => req.end(body.subarray(split)));
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.name, '蒲嘉洋');
});
