import { equipment, slots, localDate, businessMinutes, businessMoment } from './booking.js';

export function addDays(date, count) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0,10);
}
export function freeSlots(records, date, equipmentId, now = new Date()) {
  if(equipment.find(item=>item.id===equipmentId)?.operationalStatus==='maintenance')return [];
  return slots.filter(slot => {
    const [hour, minute] = slot.slice(-5).split(':').map(Number);
    const ended = date < localDate(now) || (date === localDate(now) && businessMinutes(now) >= hour * 60 + minute);
    return !ended && !records.some(record => record.status !== 'cancelled' && record.date === date && record.equipmentId === equipmentId && record.slot === slot);
  });
}
export function planSummary(records, start = localDate(), catalog = equipment) {
  const end = addDays(start, 6);
  const inWeek = records.filter(record => record.status !== 'cancelled' && record.date >= start && record.date <= end && catalog.some(item=>item.id===record.equipmentId));
  const devices = catalog.map(item => {
    const booked = inWeek.filter(record => record.equipmentId === item.id).length;
    const capacity=item.operationalStatus==='maintenance'?0:7*slots.length;
    return { id: item.id, name: item.name, booked, capacity, percent: capacity?Math.round(booked/capacity*100):0 };
  });
  return { start, end, total: inWeek.length, capacity: devices.reduce((sum,item)=>sum+item.capacity,0), devices };
}

export function commonAvailability(plan, records, catalog = equipment, start = localDate(), now = new Date()) {
  const ids = [...new Set(plan.equipmentIds || [])];
  if (!ids.length || ids.some(id => !catalog.some(item => item.id === id))) return [];
  return Array.from({length:7}, (_, index) => {
    const date = addDays(start,index);
    const moments = slots.map(slot => {
      const ended = date < localDate(now) || (date === localDate(now) && businessMoment(date,slot.slice(-5)) <= now);
      let reserved=0,reservable=0,covered=0;
      for(const id of ids){
        const item = catalog.find(row => row.id === id);
        const secured = !!plan.userId && records.some(row => row.status !== 'cancelled' && row.userId === plan.userId && row.equipmentId === id && row.date === date && row.slot === slot);
        if(!ended&&secured)reserved++;
        if(!ended && item.operationalStatus !== 'maintenance'){
          if(secured)covered++;
          else if(freeSlots(records,date,id,now).includes(slot)){reservable++;covered++;}
        }
      }
      // `available` stays compatible with existing readiness / AI consumers.
      // UI uses the distinct reserved / reservable counts instead.
      const available=covered;
      return {date,slot,available,covered:available,reserved,reservable,blocked:ids.length-available,total:ids.length,complete:available===ids.length};
    }).filter(row => date > localDate(now) || businessMoment(date,row.slot.slice(-5)) > now);
    const best = [...moments].sort((a,b)=>b.available-a.available || Number(b.slot===plan.slot)-Number(a.slot===plan.slot))[0] || null;
    return {date,moments,best,complete: moments.filter(row=>row.complete).length};
  });
}
export function availabilityLabel(moment){
 if(!moment)return '暂无可约时段';
 if(moment.reserved){return [moment.reserved+' 已预约',moment.reservable?moment.reservable+' 可预约':'',moment.blocked?moment.blocked+' 待处理':''].filter(Boolean).join(' · ');}
 return `${moment.reservable??moment.available} / ${moment.total} 可预约`;
}
// The selected day describes the selected slot, even if a different slot is freer.
export function displayedAvailability(day,plan){
 return day.date===plan.date?(day.moments.find(moment=>moment.slot===plan.slot)||day.best):day.best;
}
