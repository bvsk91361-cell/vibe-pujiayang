import {occupancyHeatmap} from './occupancy.js';
import {dateLabel} from './plan-state.js';

export function renderOccupancy(target,records,catalog){
 const value=occupancyHeatmap(records,undefined,catalog),table=document.createElement('table');table.className='occupancy-table';
 const caption=document.createElement('caption');caption.textContent='未来七天预约占用';table.append(caption);
 const head=document.createElement('thead'),titles=document.createElement('tr');
 for(const title of ['设备',...value.dates.map(date=>dateLabel(date))]){const cell=document.createElement('th');cell.scope='col';cell.textContent=title;titles.append(cell);}head.append(titles);table.append(head);
 const body=document.createElement('tbody');
 for(const device of value.devices){const row=document.createElement('tr'),name=document.createElement('th');name.scope='row';name.textContent=device.name;row.append(name);
  for(const day of device.days){const cell=document.createElement('td'),mark=document.createElement('span');mark.className='occupancy-cell occupancy-'+(device.maintenance?'maintenance':day.booked===3?'full':day.booked>0?'partial':day.free?'empty':'elapsed');mark.textContent=device.maintenance?'维护':day.booked?day.booked+'/3':day.free?'空闲':'已结束';
   const description=day.cells.map(cell=>cell.slot+' '+({maintenance:'维护中',reserved:'已预约',elapsed:'已结束',free:'可预约'})[cell.state]).join('；');mark.title=description;mark.setAttribute('aria-label',dateLabel(day.date)+'，'+device.name+'：'+description);cell.append(mark);row.append(cell);
  }body.append(row);
 }table.append(body);target.replaceChildren(table);
}
