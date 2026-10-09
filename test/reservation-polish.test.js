import test from 'node:test';
import assert from 'node:assert/strict';
import {reservationSections,rebookingTime,reservationStatus} from '../public/reservation-view.js';

const user='student-a';
const at=time=>new Date('2026-10-09T'+time+':00+08:00');
const row=(id,values={})=>({id,userId:user,equipmentId:'camera',date:'2026-10-09',slot:'09:00–11:00',status:'active',createdAt:'2026-10-08T12:00:00Z',...values});

test('当前、到期、已取消采用当前身份的同一份真实记录，取消不混入有效预约',()=>{
 const records=[row('using'),row('future',{date:'2026-10-10'}),row('expired',{date:'2026-10-08'}),row('cancelled',{date:'2026-10-08',status:'cancelled'}),row('other',{userId:'student-b'})],before=structuredClone(records);
 const sections=reservationSections(records,user,at('10:00'));
 assert.deepEqual(sections.current.map(item=>item.id),['using','future']);
 assert.deepEqual(sections.past.map(item=>item.id),['expired']);
 assert.deepEqual(sections.cancelled.map(item=>item.id),['cancelled']);
 assert.deepEqual(records,before);
 assert.deepEqual(reservationSections(records,'student-b',at('10:00')).current.map(item=>item.id),['other']);
 assert.deepEqual(reservationSections(records,'',at('10:00')),{current:[],past:[],cancelled:[]});
});

test('到期边界不依赖缓存的past分组，同一条记录在分钟时钟更新后转入历史',()=>{
 const records=[row('ending')];
 const before=reservationSections(records,user,at('10:59')),after=reservationSections(records,user,at('11:00'));
 assert.equal(before.current.length,1);assert.equal(before.past.length,0);
 assert.equal(after.current.length,0);assert.equal(after.past.length,1);
 assert.equal(after.past[0].id,'ending');
 assert.equal(reservationStatus(after.past[0],at('11:00')).label,'已到期');
});

test('取消记录在过期后仍保留在已取消区域，不能变成历史有效预约',()=>{
 const records=[row('cancelled',{status:'cancelled'})],after=reservationSections(records,user,at('21:00'));
 assert.equal(after.current.length,0);assert.equal(after.past.length,0);
 assert.equal(after.cancelled.length,1);
 assert.equal(reservationStatus(after.cancelled[0],at('21:00')).label,'已取消');
});

test('当前安排按时间升序，历史及取消按时间降序，相同时间用稳定ID打破并列',()=>{
 const records=[row('z',{date:'2026-10-08'}),row('a',{date:'2026-10-08'}),row('older',{date:'2026-10-07'}),row('future-z',{date:'2026-10-10'}),row('future-a',{date:'2026-10-10'}),row('cancel-old',{date:'2026-10-05',status:'cancelled'}),row('cancel-new',{date:'2026-10-06',status:'cancelled'})];
 const first=reservationSections(records,user,at('12:00')),second=reservationSections([...records].reverse(),user,at('12:00'));
 assert.deepEqual(first,second);
 assert.deepEqual(first.past.map(item=>item.id),['a','z','older']);
 assert.deepEqual(first.current.map(item=>item.id),['future-a','future-z']);
 assert.deepEqual(first.cancelled.map(item=>item.id),['cancel-new','cancel-old']);
});

test('再次预约仅保留未结束的原时间；过期或非法旧时间清空，不能偷偷改到明天',()=>{
 const cancelled=row('cancelled',{status:'cancelled'});
 assert.deepEqual(rebookingTime(cancelled,at('10:59')),{date:'2026-10-09',slot:'09:00–11:00'});
 assert.deepEqual(rebookingTime(cancelled,at('11:00')),{date:'',slot:''});
 assert.deepEqual(rebookingTime({...cancelled,date:'2026-10-08'},at('08:00')),{date:'',slot:''});
 assert.deepEqual(rebookingTime({...cancelled,date:'2026-10-10'},at('21:00')),{date:'2026-10-10',slot:'09:00–11:00'});
 assert.deepEqual(rebookingTime({...cancelled,slot:'25:00–27:00'},at('08:00')),{date:'',slot:''});
 assert.deepEqual(rebookingTime({...cancelled,date:'2026-02-30'},at('08:00')),{date:'',slot:''});
});
