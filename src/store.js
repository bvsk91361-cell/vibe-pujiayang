import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateBooking, BookingError } from './booking.js';

export function createStore(file) {
  let queue = Promise.resolve();
  async function list() {
    try {
      const records = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(records)) throw new Error('Invalid reservation storage');
      return records;
    } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async function save(records) {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await writeFile(temporary, JSON.stringify(records, null, 2), 'utf8');
    await rename(temporary, file);
  }
  function serialized(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }
  return {
    list: () => queue.then(list),
    add: input => serialized(async () => {
      const records = await list();
      const booking = { ...validateBooking(input, records), id: randomUUID(), createdAt: new Date().toISOString() };
      await save([...records, booking]);
      return booking;
    }),
    cancel: id => serialized(async () => {
      const records = await list();
      if (!records.some(item => item.id === id)) throw new BookingError('预约不存在或已取消。', 404);
      await save(records.filter(item => item.id !== id));
    })
  };
}
