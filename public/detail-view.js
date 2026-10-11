import {deviceSvg} from './device-art.js';
import {specLabel} from './creative-client.js';
import {freeSlots} from './planning.js';
import {dateLabel} from './plan-state.js';

export function renderDetail({content,title,extra,item,date,records}) {
  const visual=document.createElement('div');
  visual.className='detail-art visual-'+(item.visualClass||'standard')+' family-'+item.category;
  visual.innerHTML=deviceSvg(item,'detail');
  const info=document.createElement('div');info.className='detail-information';
  title.textContent=item.name;
  const intro=document.createElement('p');intro.className='detail-intro';intro.textContent=item.description;
  const free=freeSlots(records,date,item.id,undefined,[item]);
  const state=document.createElement('p');state.className='detail-availability'+(!free.length?' is-busy':'');
  state.textContent=item.operationalStatus==='maintenance'?'正在维护':`${dateLabel(date)} · ${free.length ? free.length+'个可用时段':'暂无空闲时段'}`;
  const specifications=document.createElement('details');specifications.className='detail-specs';
  const label=document.createElement('summary');label.textContent='设备规格';
  const specs=document.createElement('div');specs.className='detail-grid';
  for(const value of item.specs) {
    const card=document.createElement('div');card.className='visual-spec';
    const number=document.createElement('strong');number.textContent=specLabel(value);
    const copy=document.createElement('span');copy.textContent=value;
    card.append(number,copy);specs.append(card);
  }
  specifications.append(label,specs);
  info.append(title,intro,state,specifications,extra);
  content.replaceChildren(visual,info);
}
