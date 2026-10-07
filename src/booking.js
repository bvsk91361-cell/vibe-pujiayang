export const equipment = [
  { id: 'camera', name: '数码相机', icon: '📷', description: '课程拍摄、活动记录', color: 'peach' },
  { id: 'projector', name: '便携投影仪', icon: '📽️', description: '小组汇报、作品演示', color: 'purple' },
  { id: 'recorder', name: '录音笔', icon: '🎙️', description: '采访录音、课堂采集', color: 'green' }
];
export const slots = ['09:00–11:00', '14:00–16:00', '19:00–21:00'];
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export class BookingError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
export function validateBooking(input, records, today = localDate()) {
  if (!input || typeof input !== 'object') throw new BookingError('请填写预约信息。');
  const { equipmentId, date, slot } = input;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 30) throw new BookingError('姓名需填写 1–30 个字符。');
  if (!equipment.some(item => item.id === equipmentId)) throw new BookingError('请选择有效器材。');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BookingError('请选择有效日期。');
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime()) || localDate(parsed) !== date || date < today) throw new BookingError('请选择今天或以后的有效日期。');
  if (!slots.includes(slot)) throw new BookingError('请选择有效时段。');
  if (records.some(item => item.equipmentId === equipmentId && item.date === date && item.slot === slot)) {
    throw new BookingError('这个器材在该时段已被预约，请换一个时段。', 409);
  }
  return { equipmentId, date, slot, name };
}
