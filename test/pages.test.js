import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createBrowserApi } from '../public/browser-api.js';
import { exportCsv } from '../public/export-csv.js';
import { equipment } from '../src/booking.js';
const input = { name: '=1+1', equipmentId: 'camera', date: '2099-10-07', slot: '09:00–11:00' };
test('在线存储：预约、重复拒绝、刷新保留、取消后重约', async () => {
  const data = new Map(); const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const api = createBrowserApi(storage); const post = () => api('/api/reservations', { method: 'POST', body: JSON.stringify(input) });
  const record = await post();
  await assert.rejects(post(), error => error.status === 409);
  assert.equal((await createBrowserApi(storage)('/api/reservations'))[0].id, record.id);
  await api(`/api/reservations/${record.id}`, { method: 'DELETE' });
  assert.deepEqual(await api('/api/reservations'), []); await post();
});
test('存储不可用时拒绝保存，不显示虚假的预约成功', async () => {
  const api = createBrowserApi({ getItem: () => '[]', setItem: () => { throw new Error('quota'); } });
  await assert.rejects(api('/api/reservations', { method: 'POST', body: JSON.stringify(input) }), /没有保存成功/);
});
test('外部CSV组件：中文表头、逗号引号换行与公式注入防护', async () => {
  const context = {}; vm.createContext(context);
  vm.runInContext(await readFile('public/vendor/papaparse.min.js', 'utf8'), context);
  const csv = exportCsv([{ ...input, name: '甲,"乙"\n丙' }, input], equipment, context.Papa);
  const parsed = context.Papa.parse(csv, { header: true });
  assert.equal(parsed.data[0]['预约人'], '甲,"乙"\n丙');
  assert.equal(parsed.data[1]['预约人'], "'=1+1");
  assert.equal(parsed.data[0]['器材'], '数码相机');
  assert.throws(() => exportCsv([], equipment, {}), /未加载/);
});
