import test from 'node:test';
import assert from 'node:assert/strict';
import {createCarousel} from '../public/carousel.js';
import {addEquipment,replaceEquipment,scenarioQuestion} from '../public/plan-flow.js';
import {equipment,heroSlides} from '../src/catalog.js';
import {creativeScenes} from '../src/creative.js';
import {recommendCreative} from '../src/creative.js';
import {localDate} from '../src/booking.js';
import {addDays} from '../src/planning.js';

test('首页轮播：5秒循环、手动切换重置计时、不进入永久暂停',()=>{
 let time=0,next=0;const timers=new Map(),seen=[];
 const scheduler={set(fn,ms){const id=++next;timers.set(id,{fn,at:time+ms,ms});return id;},clear(id){timers.delete(id);}};
 const advance=ms=>{const end=time+ms;while([...timers.values()].some(t=>t.at<=end)){const [id,t]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];time=t.at;timers.delete(id);t.fn();}time=end;};
 const carousel=createCarousel({count:5,interval:5000,resumeOnInteraction:true,scheduler,onChange:index=>seen.push(index)});
 advance(4999);assert.equal(carousel.state().index,0);
 advance(1);assert.equal(carousel.state().index,1);
 advance(3000);carousel.go(4);assert.equal(carousel.state().paused,false);
 advance(4999);assert.equal(carousel.state().index,4);
 advance(1);assert.equal(carousel.state().index,0);
 assert.deepEqual(seen,[1,4,0]);assert.equal(timers.size,1);
 carousel.pause('reduced',true);advance(10000);assert.equal(carousel.state().index,0);
 carousel.dispose();assert.equal(timers.size,0);
});

test('方案加件：保留原组合、去重、最多8件、拒绝不存在或维护设备',()=>{
 const ids=['camera'];assert.deepEqual(addEquipment(ids,'gimbal-g1',equipment),['camera','gimbal-g1']);assert.deepEqual(ids,['camera']);
 assert.deepEqual(addEquipment(ids,'camera',equipment),ids);
 assert.throws(()=>addEquipment(ids,'not-real',equipment));assert.throws(()=>addEquipment(ids,'drone-a2',equipment));
 const eight=equipment.filter(e=>e.operationalStatus==='active').slice(0,8).map(e=>e.id);
 assert.throws(()=>addEquipment(eight,equipment.filter(e=>e.operationalStatus==='active')[8].id,equipment));
});

test('兴趣引导：六个场景生成可继续编辑的2至4件装备问题；五张Hero专属海报不重复',()=>{
 for(const scene of creativeScenes.slice(0,6)){const q=scenarioQuestion(scene);assert.ok(q.includes(scene.name));assert.match(q,/2～4/);assert.ok(q.length<=300);}
 assert.deepEqual(new Set(heroSlides.map(s=>s.visual)),new Set(['cinema','vlog','outdoor','voice','presentation']));
});

test('智能建议固定2至4件真实设备，单件补足、过长收敛、未知设备不会进入方案',()=>{
 const base={sceneId:'interview',date:addDays(localDate(),1),slot:'14:00–16:00'};
 const one=recommendCreative({...base,equipmentIds:['camera']},[]);assert.equal(one.total,2);
 const long=recommendCreative({...base,equipmentIds:equipment.slice(0,8).map(e=>e.id)},[]);assert.equal(long.total,4);
 const missing=recommendCreative({...base,equipmentIds:['not-real']},[]);assert.equal(missing.total,4);assert.ok(missing.notice);
 for(const plan of [one,long,missing])assert.ok(plan.items.every(e=>equipment.some(real=>real.id===e.id)));
});

test('方案主动替换：原位置不变、没有重复、维护和失效目标拒绝、8件满额仍可换',()=>{
 const ids=['camera','projector'];assert.deepEqual(replaceEquipment(ids,'camera','gimbal-g1',equipment),['gimbal-g1','projector']);assert.deepEqual(ids,['camera','projector']);
 assert.throws(()=>replaceEquipment(ids,'camera','projector',equipment));assert.throws(()=>replaceEquipment(ids,'camera','drone-a2',equipment));assert.throws(()=>replaceEquipment(ids,'missing','gimbal-g1',equipment));
 const active=equipment.filter(e=>e.operationalStatus==='active'),eight=active.slice(0,8).map(e=>e.id);assert.equal(replaceEquipment(eight,eight[2],active[8].id,equipment).length,8);
});
