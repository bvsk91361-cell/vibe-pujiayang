import { localDate, businessMinutes, businessMoment, isBusinessDate, slots } from './booking.js';
export function visibleReservations(records, name, onlyMine) {
  const current = name.trim();
  return onlyMine ? records.filter(record => current && record.name === current) : records;
}
export function reservationStatus(record, now = new Date()) {
  if (record.status === 'cancelled') return { label: '已取消', expired: false };
  const today = localDate(now);
  const minutes = businessMinutes(now);
  const [start, end] = record.slot.split('–').map(time => {
    const [hours, minute] = time.split(':').map(Number); return hours * 60 + minute;
  });
  if (record.date < today || (record.date === today && minutes >= end)) return { label: '已到期', expired: true };
  if (record.date === today && minutes >= start) return { label: '使用时段中', expired: false };
  return { label: '待使用', expired: false };
}
// Repartition the current identity's actual history at the clock boundary.
// Cancelled records belong to their own section even after their date expires.
export function reservationSections(records, userId, now = new Date()) {
  const result = {current: [], past: [], cancelled: []};
  if (!userId || !Array.isArray(records)) return result;
  for (const row of records) {
    if (row.userId !== userId) continue;
    const section = row.status === 'cancelled' ? 'cancelled' : reservationStatus(row, now).expired ? 'past' : 'current';
    result[section].push(row);
  }
  const byMoment = (a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot);
  const tieBreak = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || String(a.id).localeCompare(String(b.id));
  result.current.sort((a, b) => byMoment(a, b) || tieBreak(a, b));
  for (const key of ['past', 'cancelled']) result[key].sort((a, b) => byMoment(b, a) || tieBreak(a, b));
  return result;
}
// A cancelled status is not evidence that its original time is still bookable.
// Keep an unexpired original time; otherwise ask the user to choose a new one.
export function rebookingTime(record, now = new Date()) {
  return isBusinessDate(record?.date) && slots.includes(record?.slot) && businessMoment(record.date, record.slot.slice(-5)) > now
    ? {date: record.date, slot: record.slot}
    : {date: '', slot: ''};
}
