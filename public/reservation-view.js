import { localDate } from './booking.js';
export function visibleReservations(records, name, onlyMine) {
  const current = name.trim();
  return onlyMine ? records.filter(record => current && record.name === current) : records;
}
export function reservationStatus(record, now = new Date()) {
  const today = localDate(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [start, end] = record.slot.split('–').map(time => {
    const [hours, minute] = time.split(':').map(Number); return hours * 60 + minute;
  });
  if (record.date < today || (record.date === today && minutes >= end)) return { label: '已到期', expired: true };
  if (record.date === today && minutes >= start) return { label: '使用时段中', expired: false };
  return { label: '待使用', expired: false };
}
