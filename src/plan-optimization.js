import { BookingError } from './booking.js';
import { inspectPlan } from './creative.js';

// A small, server-derived choice set. The model never sees names or unrelated bookings.
export function optimizationContext(plan, records, catalog) {
  if (!plan || typeof plan.name !== 'string' || plan.name.length > 60) throw new BookingError('请先选择要优化的方案。', 422);
  const checked = inspectPlan(plan, records, catalog);
  if(!checked.total||!plan.date||!plan.slot)throw new BookingError('先选设备和时间，再优化搭配。',422);
  const items = checked.items.map(item => ({
    id: item.id, name: item.name, capability: item.capability, specs: item.specs.slice(0, 2),
    available: item.available, secured: item.secured,
    alternatives: item.alternatives.slice(0, 2).map(({id,name,capability,specs}) => ({id,name,capability,specs:specs.slice(0,2),available:true}))
  }));
  return { scene: plan.sceneId || 'custom', name: plan.name, date: plan.date, slot: plan.slot, items };
}

export function applyOptimization(value, original, context, records, catalog) {
  if (!value || !Array.isArray(value.keep) || !Array.isArray(value.replace) || !Array.isArray(value.remove)) throw new BookingError('顾问没有返回完整调整，请重新尝试。', 502);
  if (value.keep.length + value.replace.length + value.remove.length !== original.equipmentIds.length) throw new BookingError('顾问未逐件确认原方案，已保留原搭配。', 502);
  const assignments = new Map();
  for (const id of value.keep) {
    if (assignments.has(id) || !original.equipmentIds.includes(id)) throw new BookingError('调整包含无效设备，已保留原搭配。', 502);
    assignments.set(id,id);
  }
  const changes = [];
  for (const change of value.replace) {
    const item = context.items.find(row => row.id === change?.from);
    if (!item || assignments.has(item.id) || !item.alternatives.some(row => row.id === change.to)) throw new BookingError('替代设备不在当前可用候选中，已保留原搭配。', 502);
    assignments.set(item.id,change.to);
    const replacement = catalog.find(row => row.id === change.to);
    changes.push({from:item.id,to:change.to,reason:item.available?'同用途设备，目标时段可用':'原设备此时不可用，替代设备可约',name:replacement.name});
  }
  for (const id of value.remove) {
    if (assignments.has(id) || !original.equipmentIds.includes(id)) throw new BookingError('移除设备无效，已保留原搭配。', 502);
    assignments.set(id,null);
  }
  const equipmentIds = original.equipmentIds.map(id => assignments.get(id)).filter(Boolean);
  if (!equipmentIds.length || new Set(equipmentIds).size !== equipmentIds.length) throw new BookingError('调整造成空方案或重复设备，已保留原搭配。', 502);
  return {...inspectPlan({...original,equipmentIds},records,catalog),changes,notice:typeof value.reason==='string'?value.reason.slice(0,140):null};
}
