import { equipment } from './catalog.js';
export { equipment };
export const slots = ['09:00–11:00', '14:00–16:00', '19:00–21:00'];
export const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
// The reservation calendar is always UTC+8, independent of the host/browser zone.
const businessOffset = 8 * 60 * 60 * 1000;
export function localDate(date = new Date()) {
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + businessOffset).toISOString().slice(0, 10);
}
export function businessMinutes(date = new Date()) {
  const value = new Date(date.getTime() + businessOffset);
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}
export function businessMoment(date, time) {
  return new Date(`${date}T${time}:00+08:00`);
}
export function isBusinessDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && localDate(businessMoment(date, '12:00')) === date;
}
export class BookingError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
export function validateBooking(input, records, today = localDate(), now = new Date()) {
  if (!input || typeof input !== 'object') throw new BookingError('请填写预约信息。');
  const { equipmentId, date, slot } = input;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 30) throw new BookingError('姓名需填写 1–30 个字符。');
  if (!equipment.some(item => item.id === equipmentId)) throw new BookingError('请选择有效器材。');
  if (equipment.find(item=>item.id===equipmentId).operationalStatus==='maintenance') throw new BookingError('这件设备正在维护，请选择其他设备。');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BookingError('请选择有效日期。');
  if (!isBusinessDate(date) || date < today) throw new BookingError('请选择今天或以后的有效日期。');
  if (!slots.includes(slot)) throw new BookingError('请选择有效时段。');
  if (date === localDate(now)) {
    const [hour, minute] = slot.slice(-5).split(':').map(Number);
    if (businessMinutes(now) >= hour * 60 + minute) throw new BookingError('这个时段已经结束，请选择后续时段。');
  }
  if (records.some(item => item.status !== 'cancelled' && item.equipmentId === equipmentId && item.date === date && item.slot === slot)) {
    throw new BookingError('这个器材在该时段已被预约，请换一个时段。', 409);
  }
  return { equipmentId, date, slot, name };
}
