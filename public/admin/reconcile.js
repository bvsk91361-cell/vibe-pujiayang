// Patch retained native DOM nodes so business updates preserve focus, SVG motion
// and Canvas contexts. Event handlers stay delegated to the stable Admin Shell.
const sources=new WeakMap();
function key(node){
 if(node.nodeType!==1)return null;
 if(node.id)return `id:${node.id}`;
 const data=node.dataset;
 if(data.detail&&data.id)return `detail:${data.detail}:${data.id}`;
 if(data.heatDate)return `pulse:${data.heatDate}:${data.heatSlot}`;
 if(data.pageNumber)return `page:${data.pageNumber}`;
 if(data.countKey)return `count:${data.countKey}`;
 return null;
}
function compatible(a,b){return a.nodeType===b.nodeType&&(a.nodeType!==1||(a.localName===b.localName&&a.namespaceURI===b.namespaceURI));}
function patchNode(current,next){
 if(!compatible(current,next)){current.replaceWith(next.cloneNode(true));return;}
 if(current.nodeType!==1){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return;}
 for(const attr of [...current.attributes]){
  // These belong to the animation engine or to the user's current disclosure.
  if(attr.name==='style'||attr.name.startsWith('data-motion-')||(current.localName==='details'&&attr.name==='open')||(current.localName==='canvas'&&['width','height'].includes(attr.name)))continue;
  if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
 }
 for(const attr of [...next.attributes])if(current.getAttribute(attr.name)!==attr.value){
  // A retained Canvas backing store belongs to its renderer. Setting either
  // dimension clears its pixels even when the Canvas/context objects survive.
  if((current.localName==='canvas'&&['width','height'].includes(attr.name))||
    (current.localName==='details'&&attr.name==='open')||attr.name.startsWith('data-motion-'))continue;
  if(attr.name==='style'){
   const oldStyles=current.style;
   // Reconcile authored coordinates while retaining active motion properties.
   for(const property of [...oldStyles])if(!next.style.getPropertyValue(property)&&!property.startsWith('--pointer')&&!['translate','transform','opacity','filter','stroke-dasharray','stroke-dashoffset'].includes(property))oldStyles.removeProperty(property);
   for(const property of [...next.style])oldStyles.setProperty(property,next.style.getPropertyValue(property),next.style.getPropertyPriority(property));
  }else current.setAttribute(attr.name,attr.value);
 }
 const keyed=new Map([...current.childNodes].map(node=>[key(node),node]).filter(([id])=>id));
 let position=current.firstChild;
 for(const child of [...next.childNodes]){
  const id=key(child),retained=id?keyed.get(id):position&&!key(position)&&compatible(position,child)?position:null;
  if(retained&&compatible(retained,child)){
   if(retained!==position)current.insertBefore(retained,position);
   patchNode(retained,child);position=retained.nextSibling;
  }else{const inserted=child.cloneNode(true);current.insertBefore(inserted,position);}
 }
 while(position){const after=position.nextSibling;position.remove();position=after;}
}
export function reconcile(target,html){
 if(!target||sources.get(target)===html)return false;
 const focused=document.activeElement;
 const retainFocus=focused&&focused!==document.body&&target.contains(focused);
 const selection=retainFocus&&typeof focused.selectionStart==='number'
  ?{start:focused.selectionStart,end:focused.selectionEnd,direction:focused.selectionDirection}:null;
 const template=document.createElement('template');template.innerHTML=html;
 const holder=document.createElement(target.localName||'div');holder.append(template.content);
 // Only children: root attributes (aria-busy, live region) belong to the caller.
 const next=target.cloneNode(false);next.append(...holder.childNodes);
 patchNode(target,next);sources.set(target,html);
 // Moving a keyed element with insertBefore can blur its focused descendant.
 // Restore only that same surviving control; deleted records never gain focus.
 if(retainFocus&&focused.isConnected&&target.contains(focused)&&document.activeElement!==focused){
  focused.focus({preventScroll:true});
  if(selection)focused.setSelectionRange(selection.start,selection.end,selection.direction);
 }
 return true;
}
