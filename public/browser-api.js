import { equipment, slots, validateBooking, BookingError } from './booking.js';
const key = 'vibe-pujiayang-reservations-v1';
export function createBrowserApi(storage) {
  function read() {
    let value;
    try { value = JSON.parse(storage.getItem(key) || '[]'); }
    catch { throw new Error('无法读取预约记录，请检查浏览器存储权限或数据。'); }
    if (!Array.isArray(value)) throw new Error('预约数据损坏，请先导出或备份后处理。');
    return value;
  }
  function save(value) {
    try { storage.setItem(key, JSON.stringify(value)); }
    catch { throw new Error('预约没有保存成功，请检查浏览器存储权限或空间。'); }
  }
  return async (path, options = {}) => {
    const method = options.method || 'GET';
    if (path === '/api/equipment' && method === 'GET') return { equipment, slots };
    if (path === '/api/reservations' && method === 'GET') return read();
    if (path === '/api/reservations' && method === 'POST') {
      const records = read();
      const input = validateBooking(JSON.parse(options.body), records);
      const record = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      save([...records, record]); return record;
    }
    if (path.startsWith('/api/reservations/') && method === 'DELETE') {
      const records = read(); const id = path.split('/').pop();
      if (!records.some(record => record.id === id)) throw new BookingError('预约不存在或已取消。', 404);
      save(records.filter(record => record.id !== id)); return { ok: true };
    }
    throw new BookingError('接口不存在。', 404);
  };
}
