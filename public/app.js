import { createBrowserApi } from './browser-api.js';
import { exportCsv } from './export-csv.js';
import { visibleReservations, reservationStatus } from './reservation-view.js';
const staticMode = document.querySelector('meta[name="storage-mode"]')?.content === 'browser';
const browserApi = staticMode ? createBrowserApi(localStorage) : null;
const form = document.querySelector('#booking-form');
const message = document.querySelector('#message');
let equipment = [];
let allRecords = [];
function dateToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
async function api(path, options) {
  if (staticMode) return browserApi(path, options);
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败，请稍后再试。');
  return result;
}
function notify(text, failed = false) { message.textContent = text; message.classList.toggle('error', failed); }
function selectEquipment(id) {
  form.elements.equipmentId.value = id;
  document.querySelector('#selection').textContent = `已选：${equipment.find(item => item.id === id).name}`;
  document.querySelectorAll('.card').forEach(card => card.classList.toggle('selected', card.dataset.id === id));
}
async function refresh() {
  allRecords = await api('/api/reservations');
  renderRecords();
}
function renderRecords() {
  const mine = document.querySelector('#mine').checked;
  const records = visibleReservations(allRecords, form.elements.name.value, mine);
  const list = document.querySelector('#reservations');
  list.replaceChildren();
  if (!records.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = mine ? '这个姓名下还没有预约；请先填写上方预约人。' : '还没有预约，选一件器材开启你的下一次创作。'; list.append(empty); return; }
  for (const record of [...records].sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot))) {
    const row = document.createElement('article'); row.className = 'reservation';
    const detail = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = `${equipment.find(item => item.id === record.equipmentId)?.name || '器材'} · ${record.name}`;
    const text = document.createElement('p'); text.textContent = `${record.date} / ${record.slot}`;
    const status = reservationStatus(record);
    const badge = document.createElement('span'); badge.className = `reservation-status${status.expired ? ' expired' : ''}`; badge.textContent = status.label;
    const cancel = document.createElement('button'); cancel.className = 'cancel'; cancel.type = 'button'; cancel.textContent = '取消预约';
    cancel.setAttribute('aria-label', `取消${record.name}的${record.date}预约`);
    cancel.addEventListener('click', async () => {
      if (!confirm('确认取消这条预约？')) return;
      cancel.disabled = true;
      try { await api(`/api/reservations/${record.id}`, { method: 'DELETE' }); await refresh(); notify('预约已取消，该时段可以重新预约。'); }
      catch (error) { notify(error.message, true); cancel.disabled = false; }
    });
    detail.append(title, text, badge); row.append(detail, cancel); list.append(row);
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = form.querySelector('[type=submit]'); submit.disabled = true;
  try {
    const input = Object.fromEntries(new FormData(form));
    await api('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    await refresh(); notify('预约成功！记录已保存，刷新页面也不会丢失。');
  } catch (error) { notify(error.message, true); }
  finally { submit.disabled = false; }
});
form.elements.equipmentId.addEventListener('change', () => selectEquipment(form.elements.equipmentId.value));
document.querySelector('#refresh').addEventListener('click', () => refresh().catch(error => notify(error.message, true)));
document.querySelector('#mine').addEventListener('change', renderRecords);
form.elements.name.addEventListener('input', renderRecords);
setInterval(renderRecords, 60000);
document.querySelector('#export').addEventListener('click', async () => {
  try {
    const csv = exportCsv(await api('/api/reservations'), equipment);
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = '器材预约.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); notify('预约记录已导出为 CSV。');
  } catch (error) { notify(error.message, true); }
});
async function initialize() {
  if (staticMode) document.querySelector('footer span').textContent = '在线演示 · 预约保存在当前浏览器，设备之间不共享；请用测试姓名';
  const catalog = await api('/api/equipment'); equipment = catalog.equipment;
  for (const item of equipment) {
    form.elements.equipmentId.add(new Option(item.name, item.id));
    const card = document.createElement('article'); card.className = 'card'; card.dataset.id = item.id;
    const art = document.createElement('div'); art.className = `device-art ${item.color}`; art.textContent = item.icon; art.setAttribute('aria-hidden', 'true');
    const title = document.createElement('h3'); title.textContent = item.name;
    const description = document.createElement('p'); description.textContent = item.description;
    const bottom = document.createElement('div'); bottom.className = 'card-bottom';
    const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = '可选择时段';
    const button = document.createElement('button'); button.textContent = '预约 ↗'; button.type = 'button'; button.setAttribute('aria-label', `预约${item.name}`);
    button.addEventListener('click', () => { selectEquipment(item.id); form.elements.date.focus(); });
    bottom.append(tag, button); card.append(art, title, description, bottom); document.querySelector('#equipment').append(card);
  }
  for (const slot of catalog.slots) form.elements.slot.add(new Option(slot, slot));
  form.elements.date.min = dateToday(); form.elements.date.value = dateToday();
  selectEquipment(equipment[0].id); await refresh();
}
initialize().catch(error => notify(`加载失败：${error.message}`, true));
