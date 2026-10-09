import {localDate,slots,isBusinessDate} from './booking.js';
import {addDays} from './planning.js';

const aliases={camera:['相机','摄像机'],lens:['镜头'],drone:['无人机','航拍设备'],gimbal:['云台相机','口袋相机','云台'],microphone:['麦克风','无线麦','话筒'],light:['补光灯','灯光'],projector:['投影仪','投影机','投影设备'],support:['三脚架','稳定器'],recorder:['录音笔','录音机','录音设备'],capture:['采集卡','采集设备']};
const weekDays={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':0,'天':0};
// Only recognize unambiguous availability questions. Other intentions stay with the model.
export function parseAvailabilityQuestion(question,catalog,now=new Date()){
 if(typeof question!=='string')return null;
 const text=question.replace(/\s+/g,'').replace(/：/g,':');
 // This single-turn endpoint has no selected-device conversation state.
 // Resolve the reference explicitly instead of letting a model guess an id.
 if(/(?:这|那|该|此)(?:台|件|个)?(?:设备|器材)|(?:这|那)一(?:台|件)|它(?:们)?/.test(text))return {error:'请先选择具体设备，或直接告诉我设备名称'};
 const otherTimes=/其他时间|其它时间|别的时间|其他时段|其它时段/.test(text);
 if(!/(空闲|有空|可用|可借|可约|可预约|可以(?:借|预约)|能借|能约|能预约|能不能(?:借|约)|有没有|有什么|有哪些|哪些设备|有[吗么]|有.+[吗么？?]|查.*(?:设备|投影|相机|麦克风))/.test(text)||/(推荐|建议|搭配|一套|替代|替换|高峰|最忙|多久|连续|之间)/.test(text)||(/如果/.test(text)&&!otherTimes))return null;
 const candidates=[...catalog.flatMap(item=>[item.name,item.productName].filter(Boolean).map(word=>({word,id:item.id}))),...Object.entries(aliases).flatMap(([category,words])=>words.map(word=>({word,category})))].map(token=>({...token,start:text.toLowerCase().indexOf(token.word.toLowerCase())})).filter(token=>token.start>=0).sort((a,b)=>b.word.length-a.word.length);
 const matched=[];for(const token of candidates)if(!matched.some(existing=>token.start>=existing.start&&token.start+token.word.length<=existing.start+existing.word.length))matched.push(token);
 const recording=/适合录音的设备|录音用的设备/.test(text);
 const ids=[...new Set(matched.flatMap(token=>token.id?[token.id]:catalog.filter(item=>item.category===token.category).map(item=>item.id)))];
 const equipmentIds=ids.length?ids:recording?catalog.filter(item=>item.category==='recorder').map(item=>item.id):/(哪些设备|所有设备|全部设备|设备(?:可以|能|有).*(?:借|约|空闲)|(?:能|可以|可)(?:预约|借)(?:什么|哪些))/.test(text)?null:undefined;
 if(equipmentIds===undefined)return null;
 const today=localDate(now),explicit=text.match(/\d{4}-\d{2}-\d{2}/),month=text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})(?:日|号)?/),relative=text.match(/后天|明天|今天|今晚|明晚|明早|今早/),week=text.match(/(下周|本周|这周|周|星期)([一二三四五六日天])/);
 if((text.match(/\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}(?:日|号)?|后天|明天|今天|今晚|明晚|明早|今早|(下周|本周|这周|周|星期)[一二三四五六日天]/g)||[]).length>1)return {error:'请一次查询一个日期'};
 if(/昨天|前天|上周|每|几天|\d+天后|[一二三四五六七八九十]+天后|周末|月底/.test(text))return null;
 let date=today;
 if(explicit)date=explicit[0];
 else if(month)date=`${month[1]||today.slice(0,4)}-${month[2].padStart(2,'0')}-${month[3].padStart(2,'0')}`;
 else if(relative)date=addDays(today,relative[0]==='后天'?2:relative[0].startsWith('明')?1:0);
 else if(week){const current=new Date(today+'T12:00:00Z').getUTCDay(),target=weekDays[week[2]],next=week[1]==='下周'?7-((current+6)%7)+(target+6)%7:['本周','这周'].includes(week[1])?(target+6)%7-(current+6)%7:(target-current+7)%7;date=addDays(today,next);}
 if(!isBusinessDate(date)||date<today||date>addDays(today,365))return {error:'请选择今天至未来一年内的有效日期'};
 const parts=[/上午|早上|早晨|今早|明早/.test(text),/下午/.test(text),/晚上|晚间|今晚|明晚/.test(text)];
 if(parts.filter(Boolean).length>1)return {error:'请一次选择一个时段：上午、下午或晚上'};
 let slot=parts.some(Boolean)?slots[parts.indexOf(true)]:null;
 const range=text.match(/(\d{1,2}:\d{2})(?:[-–—~～]|到|至)(\d{1,2}:\d{2})/);
 if(range){const value=range[1].padStart(5,'0')+'–'+range[2].padStart(5,'0');if(!slots.includes(value))return {error:'请选择 09:00–11:00、14:00–16:00 或 19:00–21:00'};if(slot&&slot!==value)return {error:'时段描述不一致，请明确需要的时间'};slot=value;}
 else if(/\d{1,2}(?:点|:\d{2})|中午|夜里/.test(text))return null;
 let rest=text;for(const token of matched)rest=rest.replaceAll(token.word,'');
 rest=rest.replace(/适合录音的设备|录音用的设备|其他时间|其它时间|别的时间|其他时段|其它时段|没空的话|没空|如果|\d{4}-\d{2}-\d{2}|(?:(\d{4})年)?\d{1,2}月\d{1,2}(?:日|号)?|后天|明天|今天|今晚|明晚|明早|今早|(下周|本周|这周|周|星期)[一二三四五六日天]|\d{1,2}:\d{2}(?:[-–—~～]|到|至)\d{1,2}:\d{2}|上午|早上|早晨|下午|晚上|晚间/g,'').replace(/哪些|所有|全部|设备|有空闲|空闲|有空|可用|预约|借用|有没有|可以|是否|一下|帮我|看看|查|请|我|想|有|什么|哪|些|能|不|约|借|吗|么|呢|的|在|还|可|台|件|和|及|或|与|[，。？！、,.;:!?]/g,'');
 if(rest)return null;
 return {intent:otherTimes?'other-times':'availability',date,slot,equipmentId:equipmentIds?.length===1?equipmentIds[0]:null,...(equipmentIds?{equipmentIds}:{})};
}
