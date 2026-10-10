import test from 'node:test';
import assert from 'node:assert/strict';
import {lineChart,stateChart,heatmapChart,horizontalBars} from '../public/admin-charts.js';

test('admin charts expose real values through text and keyboard alternatives',()=>{
  const line=lineChart([{date:'2026-10-10',count:3,cancelled:1},{date:'2026-10-11',count:0,cancelled:0}]);
  assert.match(line,/2026-10-10，预约 3 次，取消 1 次/);
  assert.match(line,/tabindex="0"/);
  assert.match(line,/<summary>查看图表数据<\/summary>/);
  const ring=stateChart({available:20,occupied:3,maintenance:5});
  assert.match(ring,/可预约 20 件，当前时段占用 3 件，维护中 5 件/);
  assert.match(ring,/>28<\/text>/);
});

test('admin heatmap preserves ledger occupancy and makes the same cell filterable',()=>{
  const html=heatmapChart({dates:['2026-10-10'],slots:['09:00–11:00'],cells:[{date:'2026-10-10',slot:'09:00–11:00',activeBookings:7,availableEquipment:21,capacity:28,occupancyRate:25}]});
  assert.match(html,/有效预约 7 件，可用设备 21 件，占用 25\.0%/);
  assert.match(html,/data-heat-date="2026-10-10"/);
  assert.match(html,/data-heat-slot="09:00–11:00"/);
});

test('admin chart labels escape untrusted equipment names and never create fake empty records',()=>{
  const html=horizontalBars([{name:'<img src=x onerror=alert(1)>',bookings:2}]);
  assert.doesNotMatch(html,/<img/);
  assert.match(html,/&lt;img/);
  assert.match(horizontalBars([]),/暂无预约记录/);
  assert.doesNotMatch(horizontalBars([]),/<li>/);
  assert.match(lineChart([]),/暂无数据/);
});
