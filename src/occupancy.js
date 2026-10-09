import {equipment,slots,localDate,businessMoment,isBusinessDate} from './booking.js';
import {addDays} from './planning.js';

// Reservation occupancy is not measured equipment usage. Cancelled rows release a cell.
export function occupancyHeatmap(records,start=localDate(),catalog=equipment,now=new Date()){
 if(!isBusinessDate(start))throw new Error('统计日期无效');
 const dates=Array.from({length:7},(_,i)=>addDays(start,i));
 const valid=records.filter(row=>row.status!=='cancelled'&&catalog.some(item=>item.id===row.equipmentId)&&slots.includes(row.slot));
 const occupied=new Set(valid.map(row=>[row.equipmentId,row.date,row.slot].join('|')));
 const devices=catalog.map(item=>({id:item.id,name:item.name,maintenance:item.operationalStatus!=='active',days:dates.map(date=>{
  const cells=slots.map(slot=>({slot,state:item.operationalStatus!=='active'?'maintenance':occupied.has([item.id,date,slot].join('|'))?'reserved':businessMoment(date,slot.slice(-5))<=now?'elapsed':'free'}));
  return {date,cells,booked:cells.filter(cell=>cell.state==='reserved').length,free:cells.filter(cell=>cell.state==='free').length,capacity:item.operationalStatus==='active'?slots.length:0};
 })}));
 const days=dates.map(date=>{const values=devices.map(item=>item.days.find(day=>day.date===date)),capacity=values.reduce((n,day)=>n+day.capacity,0),booked=values.reduce((n,day)=>n+day.booked,0);return {date,booked,capacity,free:values.reduce((n,day)=>n+day.free,0),percent:capacity?Math.round(booked/capacity*1000)/10:0};});
 return {start,end:dates.at(-1),metric:'reservation-occupancy',dates,days,devices};
}
