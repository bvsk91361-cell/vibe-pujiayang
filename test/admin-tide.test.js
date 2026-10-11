import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateDemandTides} from '../public/admin-charts.js';

const slots = ['09:00–11:00','14:00–16:00','19:00–21:00'];
const categories = [{id:'camera',name:'摄影设备'},{id:'sound',name:'音频设备'},{id:'quiet',name:'支撑设备'}];
const catalog = [
  {id:'cam-a',category:'camera',operationalStatus:'active',nextFreeSlot:{date:'2026-10-12',slot:slots[1]}},
  {id:'cam-b',category:'camera',operationalStatus:'active',nextFreeSlot:{date:'2026-10-11',slot:slots[2]}},
  {id:'cam-maintenance',category:'camera',operationalStatus:'maintenance',nextFreeSlot:{date:'2026-10-11',slot:slots[0]}},
  {id:'mic-a',category:'sound',operationalStatus:'active',nextFreeSlot:null},
  {id:'stand-a',category:'quiet',operationalStatus:'active',nextFreeSlot:null}
];
const row = (equipmentId,date,slot=slots[1],extra={}) => ({id:[equipmentId,date,slot].join('|'),equipmentId,date,slot,status:'active',...extra});
const aggregate = extra => aggregateDemandTides({catalog,categories,dates:['2026-10-10','2026-10-11','2026-10-12'],slots,today:'2026-10-11',...extra});

test('tides count physical slots once across all pages and exclude cancelled, unknown and invalid records',()=>{
  const records = [row('cam-a','2026-10-10'),row('cam-a','2026-10-10',slots[1],{id:'duplicate-page-id'}),row('cam-b','2026-10-10'),row('mic-a','2026-10-11'),
    row('cam-a','2026-10-11',slots[0],{status:'cancelled'}),row('cam-b','2026-10-11',slots[0],{state:'cancelled'}),row('ghost','2026-10-11'),row('cam-a','2026-02-30'),row('cam-a','2026-10-10','14:00–18:00')];
  const result=aggregate({records}), camera=result.tracks.find(track=>track.id==='camera');
  assert.equal(result.total,3);
  assert.equal(camera.total,2);
  assert.deepEqual(camera.peak,{date:'2026-10-10',slot:slots[1],count:2,operationalCount:2,capacity:2,occupancyRate:100,intensity:1});
  assert.equal(camera.nodes.length,9);
  assert.equal(camera.nodes.find(node=>node.date==='2026-10-10'&&node.slot===slots[1]).intensity,1);
  assert.equal(result.tracks.find(track=>track.id==='sound').nodes.find(node=>node.count).intensity,.5);
  assert.equal(camera.operationalTotal,2);
  assert.equal(camera.capacity,18);
  assert.equal(camera.occupancyRate,11.1);
});

test('historical maintenance demand remains visible without inflating current operational capacity or free availability',()=>{
  const result=aggregate({records:[row('cam-a','2026-10-10'),row('cam-maintenance','2026-10-10')]}), camera=result.tracks.find(track=>track.id==='camera');
  assert.equal(camera.deviceCount,3);
  assert.equal(camera.operationalDevices,2);
  assert.equal(camera.total,2);
  assert.equal(camera.operationalTotal,1);
  assert.equal(camera.nodes.find(node=>node.count).occupancyRate,50);
  assert.deepEqual(camera.nextFreeSlot,{date:'2026-10-11',slot:slots[2]});
  const maintenanceOnly=aggregateDemandTides({catalog:[catalog[2]],categories,dates:['2026-10-10'],slots,today:'2026-10-11',records:[row('cam-maintenance','2026-10-10')]});
  assert.equal(maintenanceOnly.tracks[0].total,1);
  assert.equal(maintenanceOnly.tracks[0].occupancyRate,null);
  assert.equal(maintenanceOnly.tracks[0].nextFreeSlot,null);
});

test('weekly comparison uses equal complete historical weeks and never turns future bookings into past growth',()=>{
  const records=[row('cam-a','2026-09-27'),row('cam-a','2026-10-03'),row('cam-a','2026-10-04'),row('cam-a','2026-10-10'),row('cam-b','2026-10-10'),row('cam-a','2026-10-11'),row('cam-a','2026-10-12'),row('cam-b','2026-10-12'),row('cam-a','2026-10-09',slots[0],{status:'cancelled'})];
  const result=aggregate({records}), camera=result.tracks.find(track=>track.id==='camera');
  assert.deepEqual(result.comparisonRange,{current:{start:'2026-10-04',end:'2026-10-10',days:7},previous:{start:'2026-09-27',end:'2026-10-03',days:7}});
  assert.deepEqual(camera.comparison,{current:3,previous:2,change:1,percent:50,direction:'up'});
  assert.equal(camera.total,5); // display scope is independent from comparison scope.
});

test('zero and new demand remain truthful without fake peaks or infinite percentage growth',()=>{
  const result=aggregate({records:[row('mic-a','2026-10-10')]}), quiet=result.tracks.find(track=>track.id==='quiet'), sound=result.tracks.find(track=>track.id==='sound');
  assert.equal(quiet.total,0);
  assert.equal(quiet.peak,null);
  assert.equal(quiet.peakSlot,null);
  assert.equal(quiet.occupancyRate,0);
  assert.ok(quiet.nodes.every(node=>node.count===0&&node.intensity===0));
  assert.deepEqual(quiet.comparison,{current:0,previous:0,change:0,percent:0,direction:'flat'});
  assert.deepEqual(sound.comparison,{current:1,previous:0,change:1,percent:null,direction:'new'});
  const empty=aggregate({records:[]});
  assert.equal(empty.maxCount,0);
  assert.ok(empty.tracks.flatMap(track=>track.nodes).every(node=>node.intensity===0));
});

test('tide timeline normalizes input without changing catalog, records or allowing invalid availability',()=>{
  const input={catalog:[{id:'mic-a',category:'sound',operationalStatus:'active',nextFreeSlot:{date:'2026-10-10',slot:slots[0]}}],categories,records:[row('mic-a','2026-10-11')],dates:['2026-10-12','2026-10-11','2026-10-11','2026-02-30'],slots:[slots[2],slots[1],slots[1],'25:00–26:00'],today:'invalid'};
  const original=structuredClone(input), result=aggregateDemandTides(input);
  assert.deepEqual(input,original);
  assert.deepEqual(result.dates,['2026-10-11','2026-10-12']);
  assert.deepEqual(result.slots,[slots[1],slots[2]]);
  assert.equal(result.tracks.length,1);
  assert.equal(result.tracks[0].nextFreeSlot,null);
  assert.equal(result.tracks[0].comparison,null);
  assert.equal(result.comparisonRange,null);
});

test('only categories backed by real device IDs participate and labels remain source values',()=>{
  const name='<img src=x onerror=alert(1)>', result=aggregateDemandTides({catalog:[{id:'real',category:'real-type',operationalStatus:'active'},{id:'uncategorized',category:'unknown',operationalStatus:'active'}],categories:[{id:'real-type',name},{id:'empty-type',name:'无设备类别'}],records:[row('real','2026-10-11'),row('uncategorized','2026-10-11')],dates:['2026-10-11'],slots,today:'2026-10-11'});
  assert.equal(result.tracks.length,1);
  assert.equal(result.total,1);
  assert.equal(result.tracks[0].id,'real-type');
  assert.equal(result.tracks[0].name,name); // rendering escapes labels, aggregation never rewrites them.
});
