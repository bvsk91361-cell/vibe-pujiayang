import test from 'node:test';
import assert from 'node:assert/strict';
import {openDialog,closeDialog} from '../public/navigation.js';
function dialog(){const classes=new Set(),listeners={};return {open:true,closed:0,classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},addEventListener:(name,fn)=>listeners[name]=fn,showModal(){this.open=true;},close(){this.open=false;this.closed++;listeners.close?.();}};}
test('快速重新打开弹层取消旧关闭，旧计时器不能关闭新上下文',async()=>{const d=dialog();closeDialog(d,{duration:10});openDialog(d);await new Promise(resolve=>setTimeout(resolve,20));assert.equal(d.open,true);assert.equal(d.closed,0);closeDialog(d,{reduce:true});assert.equal(d.open,false);});
test('重复关闭只执行一次，后续可以正常再次打开',async()=>{const d=dialog();openDialog(d);closeDialog(d,{duration:5});closeDialog(d,{duration:5});await new Promise(resolve=>setTimeout(resolve,15));assert.equal(d.closed,1);openDialog(d);assert.equal(d.open,true);});

test('收藏导致入口重新渲染后，关闭详情仍恢复同一设备入口、滚动和背景锁',t=>{
 const saved={document:globalThis.document,window:globalThis.window,scrollY:globalThis.scrollY};
 t.after(()=>{for(const [key,value]of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 let focused=null,position=null;
 const target=()=>({isConnected:true,id:'',getAttribute:()=> '查看无线麦克风套装详情',getClientRects:()=>[{}],closest:()=>null,focus(options){focused={target:this,options};}});
 const original=target(),replacement=target();
 globalThis.document={activeElement:original,body:{style:{overflow:'auto'},dataset:{view:'equipment'}},getElementById:()=>null,querySelectorAll:()=>[replacement]};
 globalThis.scrollY=624;globalThis.window={scrollTo:value=>position=value};
 const d=dialog();d.open=false;openDialog(d);assert.equal(document.body.style.overflow,'hidden');
 original.isConnected=false;document.activeElement={id:'close-detail',getAttribute:()=> '关闭设备详情'};
 closeDialog(d,{reduce:true});assert.equal(focused.target,replacement);assert.equal(focused.options.preventScroll,true);
 assert.equal(position.top,624);assert.equal(document.body.style.overflow,'auto');
});
