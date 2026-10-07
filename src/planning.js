import { equipment, slots, localDate } from './booking.js';

export function addDays(date, count) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + count);
  return localDate(value);
}
export function freeSlots(records, date, equipmentId, now = new Date()) {
  return slots.filter(slot => {
    const [hour, minute] = slot.slice(-5).split(':').map(Number);
    const ended = date < localDate(now) || (date === localDate(now) && now.getHours() * 60 + now.getMinutes() >= hour * 60 + minute);
    return !ended && !records.some(record => record.date === date && record.equipmentId === equipmentId && record.slot === slot);
  });
}
export function planSummary(records, start = localDate()) {
  const end = addDays(start, 6);
  const inWeek = records.filter(record => record.date >= start && record.date <= end);
  const devices = equipment.map(item => {
    const booked = inWeek.filter(record => record.equipmentId === item.id).length;
    return { id: item.id, name: item.name, booked, capacity: 7 * slots.length, percent: Math.round(booked / (7 * slots.length) * 100) };
  });
  return { start, end, total: inWeek.length, capacity: devices.length * 7 * slots.length, devices };
}
