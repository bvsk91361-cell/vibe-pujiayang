import { equipment, slots, localDate } from './booking.js';

export function addDays(date, count) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + count);
  return localDate(value);
}
export function freeSlots(records, date, equipmentId, now = new Date()) {
  if(equipment.find(item=>item.id===equipmentId)?.operationalStatus==='maintenance')return [];
  return slots.filter(slot => {
    const [hour, minute] = slot.slice(-5).split(':').map(Number);
    const ended = date < localDate(now) || (date === localDate(now) && now.getHours() * 60 + now.getMinutes() >= hour * 60 + minute);
    return !ended && !records.some(record => record.date === date && record.equipmentId === equipmentId && record.slot === slot);
  });
}
export function planSummary(records, start = localDate(), catalog = equipment) {
  const end = addDays(start, 6);
  const inWeek = records.filter(record => record.date >= start && record.date <= end);
  const devices = catalog.map(item => {
    const booked = inWeek.filter(record => record.equipmentId === item.id).length;
    const capacity=item.operationalStatus==='maintenance'?0:7*slots.length;
    return { id: item.id, name: item.name, booked, capacity, percent: capacity?Math.round(booked/capacity*100):0 };
  });
  return { start, end, total: inWeek.length, capacity: devices.reduce((sum,item)=>sum+item.capacity,0), devices };
}
