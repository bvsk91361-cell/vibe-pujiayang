import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleReservations, reservationStatus } from '../public/reservation-view.js';
test('我的预约：按去空格姓名精确筛选，全部视图不遗漏他人', () => {
  const records = [{ name: '蒲嘉洋' }, { name: '同学' }];
  assert.deepEqual(visibleReservations(records, ' 蒲嘉洋 ', true), [records[0]]);
  assert.deepEqual(visibleReservations(records, '', true), []);
  assert.deepEqual(visibleReservations(records, '蒲嘉洋', false), records);
});
test('到期页面标记：过去日期、时段结束边界、使用中与未来日期', () => {
  const record = { date: '2026-10-07', slot: '09:00–11:00' };
  assert.equal(reservationStatus(record, new Date('2026-10-07T08:59:00+08:00')).label, '待使用');
  assert.equal(reservationStatus(record, new Date('2026-10-07T09:00:00+08:00')).label, '使用时段中');
  assert.equal(reservationStatus(record, new Date('2026-10-07T11:00:00+08:00')).expired, true);
  assert.equal(reservationStatus({ ...record, date: '2026-10-06' }, new Date('2026-10-07T08:00:00+08:00')).expired, true);
  assert.equal(reservationStatus({ ...record, date: '2026-10-08' }, new Date('2026-10-07T20:00:00+08:00')).label, '待使用');
});
