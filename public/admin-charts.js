// Small, dependency-free visualizations. Every value also has a text alternative.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const dateShort = value => String(value || '').slice(5).replace('-', '/');

const tideDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
const tideSlot = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d–([01]\d|2[0-3]):[0-5]\d$/.test(value) && value.slice(0,5) < value.slice(-5);
const tideDay = (date, offset) => new Date(Date.parse(date+'T12:00:00Z') + offset*86400000).toISOString().slice(0,10);
const tideRate = (count, capacity) => capacity ? Math.round(count/capacity*1000)/10 : null;

// Demand counts distinct persisted equipment/date/slot reservations, never a synthetic wave.
// Capacity describes currently operational equipment; historic maintenance durations are unknown.
export function aggregateDemandTides({catalog = [], categories = [], records = [], dates = [], slots = [], today} = {}) {
  const timelineDates = [...new Set(dates.filter(tideDate))].sort();
  const timelineSlots = [...new Set(slots.filter(tideSlot))].sort();
  const acceptedSlots = new Set(timelineSlots), displayedDates = new Set(timelineDates);
  const devices = new Map(catalog.filter(item => item && typeof item.id === 'string' && typeof item.category === 'string').map(item => [item.id,item]));
  const groups = [...new Map(categories.filter(item => item && typeof item.id === 'string').map(item => [item.id,item])).values()];
  const knownCategories = new Set(groups.map(item => item.id));
  const distinct = new Map();
  for (const record of records) {
    const device = record && devices.get(record.equipmentId);
    if (!device || !knownCategories.has(device.category) || record.status === 'cancelled' || record.state === 'cancelled' || !tideDate(record.date) || !acceptedSlots.has(record.slot)) continue;
    distinct.set(JSON.stringify([device.id,record.date,record.slot]), {...record,category:device.category,operational:device.operationalStatus === 'active'});
  }
  const active = [...distinct.values()];
  const comparisonRange = tideDate(today) ? {
    current:{start:tideDay(today,-7),end:tideDay(today,-1),days:7},
    previous:{start:tideDay(today,-14),end:tideDay(today,-8),days:7}
  } : null;
  const tracks = groups.map(group => {
    const ownDevices = [...devices.values()].filter(item => item.category === group.id);
    const operationalDevices = ownDevices.filter(item => item.operationalStatus === 'active');
    const own = active.filter(record => record.category === group.id);
    const visible = own.filter(record => displayedDates.has(record.date));
    const nodes = timelineDates.flatMap(date => timelineSlots.map(slot => {
      const matching = visible.filter(record => record.date === date && record.slot === slot);
      const count = matching.length, operationalCount = matching.filter(record => record.operational).length, capacity = operationalDevices.length;
      return {date,slot,count,operationalCount,capacity,occupancyRate:tideRate(operationalCount,capacity),intensity:0};
    }));
    const peak = nodes.reduce((best,node) => node.count > (best?.count || 0) ? node : best,null);
    const slotTotals = timelineSlots.map(slot => ({slot,count:visible.filter(record => record.slot === slot).length}));
    const peakSlot = slotTotals.reduce((best,row) => row.count > (best?.count || 0) ? {...row} : best,null);
    const total = visible.length, operationalTotal = visible.filter(record => record.operational).length;
    const capacity = operationalDevices.length*timelineDates.length*timelineSlots.length;
    const suppliedFreeSlots = operationalDevices.map(item => item.nextFreeSlot).filter(slot => slot && tideDate(slot.date) && acceptedSlots.has(slot.slot) && (!tideDate(today) || slot.date >= today)).sort((a,b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
    const next = suppliedFreeSlots[0];
    let comparison = null;
    if (comparisonRange) {
      const current = own.filter(row => row.date >= comparisonRange.current.start && row.date <= comparisonRange.current.end).length;
      const previous = own.filter(row => row.date >= comparisonRange.previous.start && row.date <= comparisonRange.previous.end).length;
      const change = current-previous;
      comparison = {current,previous,change,percent:previous ? Math.round(change/previous*1000)/10 : current ? null : 0,direction:change > 0 ? previous ? 'up' : 'new' : change < 0 ? 'down' : 'flat'};
    }
    return {id:group.id,name:group.name || group.id,deviceCount:ownDevices.length,operationalDevices:operationalDevices.length,total,operationalTotal,capacity,occupancyRate:tideRate(operationalTotal,capacity),nodes,peak,slotTotals,peakSlot,nextFreeSlot:next ? {date:next.date,slot:next.slot} : null,comparison};
  }).filter(track => track.deviceCount);
  const maxCount = Math.max(0,...tracks.flatMap(track => track.nodes.map(node => node.count)));
  for (const track of tracks) for (const node of track.nodes) node.intensity = maxCount ? node.count/maxCount : 0;
  return {dates:timelineDates,slots:timelineSlots,tracks,total:tracks.reduce((sum,track) => sum+track.total,0),maxCount,comparisonRange};
}

export function lineChart(rows = [], {id = 'trend', label = '预约趋势', showCancelled = false} = {}) {
  if (!rows.length) return '<div class="chart-empty">此统计周期暂无数据</div>';
  const width = 760, height = 210, left = 38, right = 18, top = 20, bottom = 36;
  const max = Math.max(4, ...rows.map(row => Math.max(number(row.count),showCancelled?number(row.cancelled):0))), steps = Math.ceil(max / 4), ceiling = steps * 4;
  const x = index => left + (width-left-right) * index / Math.max(1,rows.length-1);
  const y = count => height-bottom-(height-top-bottom)*number(count)/ceiling;
  const points = rows.map((row,index) => `${x(index)},${y(row.count)}`).join(' ');
  const cancelledPoints = rows.map((row,index) => `${x(index)},${y(row.cancelled)}`).join(' ');
  const area = `M${left},${height-bottom} L${points.replaceAll(' ', ' L')} L${x(rows.length-1)},${height-bottom} Z`;
  const grid = Array.from({length:5},(_,index) => {
    const count = index*steps, yy = y(count);
    return `<line x1="${left}" x2="${width-right}" y1="${yy}" y2="${yy}" class="chart-grid"/><text x="${left-12}" y="${yy+4}" text-anchor="end">${count}</text>`;
  }).join('');
  const every = Math.max(1, Math.ceil(rows.length/8));
  const dots = rows.map((row,index) => `<g tabindex="0" role="img" aria-label="${escapeHtml(row.date)}，预约 ${number(row.count)} 次，取消 ${number(row.cancelled)} 次"><title>${escapeHtml(row.date)} · 预约 ${number(row.count)} 次 · 取消 ${number(row.cancelled)} 次</title><circle class="chart-hit" cx="${x(index)}" cy="${y(row.count)}" r="12"/><circle class="chart-dot" cx="${x(index)}" cy="${y(row.count)}" r="4"/>${showCancelled?`<circle class="chart-cancelled-dot" cx="${x(index)}" cy="${y(row.cancelled)}" r="3"/>`:''}${index%every===0||index===rows.length-1?`<text x="${x(index)}" y="${height-8}" text-anchor="${index===0?'start':index===rows.length-1?'end':'middle'}">${dateShort(row.date)}</text>`:''}</g>`).join('');
  return `<div class="line-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title"><title id="${id}-title">${escapeHtml(label)}，共 ${rows.reduce((sum,row)=>sum+number(row.count),0)} 次预约</title><defs><linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8291ff" stop-opacity=".32"/><stop offset="1" stop-color="#8291ff" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#${id}-fill)"/><polyline class="trend-line" ${showCancelled?'data-light-track':'pathLength="1"'} points="${points}"/>${showCancelled?`<polyline class="cancelled-trend-line" points="${cancelledPoints}"/>`:''}${dots}</svg><details class="chart-text"><summary>查看图表数据</summary><table><thead><tr><th>日期</th><th>预约</th><th>取消</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escapeHtml(row.date)}</td><td>${number(row.count)}</td><td>${number(row.cancelled)}</td></tr>`).join('')}</tbody></table></details></div>`;
}

export function stateChart(states = {}) {
  const data = [{name:'可预约',value:number(states.available),color:'#73dac0'}, {name:'当前时段占用',value:number(states.occupied),color:'#8794ff'}, {name:'维护中',value:number(states.maintenance),color:'#d9b178'}];
  const total = data.reduce((sum,row)=>sum+row.value,0), circumference = 2*Math.PI*65;
  let offset = 0;
  const circles = data.map(row => {
    const length = total ? row.value/total*circumference : 0;
    const result = `<circle cx="95" cy="95" r="65" fill="none" stroke="${row.color}" stroke-width="17" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}"/>`;
    offset += length; return result;
  }).join('');
  return `<div class="state-chart"><svg viewBox="0 0 190 190" role="img" aria-label="设备状态分布：${data.map(row=>`${row.name} ${row.value} 件`).join('，')}"><circle cx="95" cy="95" r="65" fill="none" stroke="#253149" stroke-width="17"/><g transform="rotate(-90 95 95)">${circles}</g><text x="95" y="93" class="ring-total" text-anchor="middle">${total}</text><text x="95" y="116" class="ring-label" text-anchor="middle">设备总量</text></svg><ul class="state-legend">${data.map(row=>`<li><span class="legend-dot" style="--dot:${row.color}"></span><span>${row.name}</span><strong>${row.value}</strong></li>`).join('')}</ul></div>`;
}

export function heatmapChart(value = {}, {interactive = true} = {}) {
  const dates = value.dates || [...new Set((value.cells||[]).map(cell=>cell.date))];
  const slots = value.slots || [...new Set((value.cells||[]).map(cell=>cell.slot))];
  if (!dates.length || !slots.length) return '<div class="chart-empty">暂无可展示的预约时段</div>';
  const cells = new Map((value.cells||[]).map(cell=>[`${cell.date}|${cell.slot}`,cell]));
  return `<div class="heatmap"><div class="heat-grid" style="--heat-columns:${dates.length}"><span class="heat-corner">预约时段</span>${dates.map(date=>`<div class="heat-day"><strong>${new Intl.DateTimeFormat('zh-CN',{weekday:'short',timeZone:'Asia/Shanghai'}).format(new Date(`${date}T12:00:00+08:00`))}</strong><span>${dateShort(date)}</span></div>`).join('')}${slots.map(slot=>`<div class="heat-slot">${escapeHtml(slot)}</div>${dates.map((date,index)=>{
    const cell=cells.get(`${date}|${slot}`)||{}, rate=number(cell.occupancyRate), count=number(cell.activeBookings), available=number(cell.availableEquipment), level=rate===0?0:rate<25?1:rate<50?2:rate<75?3:4;
    const description=`${date}，${slot}，有效预约 ${count} 件，可用设备 ${available} 件，占用 ${rate.toFixed(1)}%`;
    return `<button class="heat-cell heat-level-${level} ${index===dates.length-1?'heat-end':index===0?'heat-start':''}" type="button" ${interactive?`data-heat-date="${date}" data-heat-slot="${escapeHtml(slot)}"`:''} aria-label="${escapeHtml(description)}"><span>${count}</span><span class="heat-tip" role="tooltip"><strong>${escapeHtml(date)} · ${escapeHtml(slot)}</strong><span>有效预约 <b>${count}</b> · 可用设备 <b>${available}</b></span><span>预约占用 ${rate.toFixed(1)}%</span>${interactive?'<em>点击查看此时段预约</em>':''}</span></button>`;
  }).join('')}`).join('')}</div><div class="heat-footer"><span>颜色表示可运营设备的预约占用比例</span><div class="heat-scale"><span>低</span>${[0,1,2,3,4].map(level=>`<i class="heat-level-${level}"></i>`).join('')}<span>高</span></div></div></div>`;
}

export function horizontalBars(rows = [], {nameKey='name',valueKey='bookings',unit='次',empty='暂无预约记录'} = {}) {
  if (!rows.length) return `<div class="chart-empty">${escapeHtml(empty)}</div>`;
  const max = Math.max(1,...rows.map(row=>number(row[valueKey])));
  return `<ol class="rank-list">${rows.map((row,index)=>`<li><span class="rank-index">${String(index+1).padStart(2,'0')}</span><div class="rank-main"><div><span>${escapeHtml(row[nameKey]||row.categoryName||row.category)}</span><strong>${number(row[valueKey])}<small>${escapeHtml(unit)}</small></strong></div><div class="bar-track"><i style="width:${number(row[valueKey])/max*100}%"></i></div></div></li>`).join('')}</ol>`;
}
