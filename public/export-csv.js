export function exportCsv(records, equipment, papa = globalThis.Papa) {
  if (!papa?.unparse) throw new Error('CSV 组件未加载，请刷新页面后重试。');
  return papa.unparse({
    fields: ['器材', '预约人', '日期', '时段'],
    data: records.map(record => [equipment.find(item => item.id === record.equipmentId)?.name || record.equipmentId, record.name, record.date, record.slot])
  }, { escapeFormulae: true });
}
