'use strict';
// Preparation only. Pure functions; no Google services, fetch, timers or writes.
// Integration requires confirmation of the deployed GAS source.
const STATE = Object.freeze({出庫:'出庫中',返却:'未点検',完成機:'在庫あり',修理中:'修理中'});
const MOVE = new Set(['拠点移動','拠点間移動']);
function key(value) {
 const s=String(value??'').normalize('NFKC').trim().toUpperCase();
 const m=s.match(/^([A-Z0-9]+)-(\d{3,4})$/);
 if(!m) throw Error('Invalid management ID: '+s);
 return m[1]+'-'+String(Number(m[2])).padStart(4,'0');
}
function expandSimple(rows, sheet='簡易個体管理ログ') {
 const repair=sheet==='簡易個体修理管理ログ';
 return rows.flatMap((r,i)=>{
  const model=String(r[repair?4:3]??'').match(/[（(](DT900)[）)]\s*$/);
  if(!model) return [];
  const numbers=String(r[repair?5:6]??'').normalize('NFKC').trim().split(/\s+/).filter(Boolean);
  return numbers.map(n=>({id:key(model[1]+'-'+n),time:r[0],action:String(r[repair?3:2]??'').trim(),user:r[1],location:r[repair?2:5],photo:r[7]||'',memo:r[repair?6:8]||'',logId:repair?'':String(r[9]||''),cancelTarget:repair?'':String(r[10]||''),cancelled:!repair&&String(r[11]||'').trim()==='取消済',sendId:repair?'':String(r[12]||''),source:{sheet,row:i+2,logId:repair?'':String(r[9]||''),numberCount:numbers.length}}));
 });
}
function expandIndividual(rows) {
 return rows.flatMap((r,i)=>{
  if(!/^DT900-/i.test(String(r[1]||'')))return [];
  return [{id:key(r[1]),time:r[0],action:String(r[5]||'').trim(),user:r[6],location:r[7],photo:r[8]||'',memo:r[9]||'',logId:String(r[17]||''),cancelTarget:String(r[18]||''),cancelled:String(r[19]||'').trim()==='取消済',sendId:String(r[20]||''),source:{sheet:'個体機管理ログ',row:i+2,logId:String(r[17]||''),numberCount:1}}];
 });
}
function timestamp(value){
 // Date, epoch ms or ISO with timezone only; reject ambiguous text dates.
 const n=value instanceof Date?value.getTime():typeof value==='number'?value:typeof value==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)?Date.parse(value):NaN;
 if(!Number.isFinite(n)||n<Date.UTC(2000,0,1)||n>=Date.UTC(2100,0,1))throw Error('Unverified timestamp');
 return n;
}
function resolve(id,events,photos=[]) {
 const canonical=key(id);
 if(!canonical.startsWith('DT900-'))throw Error('Outside pilot');
 const history=events.filter(e=>key(e.id)===canonical).map(e=>({...e,time:timestamp(e.time)}));
 // Keep repeated rows visible. Do not silently dedupe on sendId (one batch has many machines).
 const valid=history.filter(e=>!e.cancelled&&!e.cancelTarget).sort((a,b)=>b.time-a.time||b.source.row-a.source.row);
 if(!valid.length)throw Error(canonical+': no verified state');
 for(const e of valid)if(!STATE[e.action]&&!MOVE.has(e.action))throw Error(canonical+': unsupported action '+e.action);
 const stateEvents=valid.filter(e=>!MOVE.has(e.action));
 if(!stateEvents.length)throw Error(canonical+': only location events');
 const latest=stateEvents[0];
 const tie=stateEvents.filter(e=>e.time===latest.time);
 if(tie.some(e=>e.action!==latest.action||e.source.sheet!==latest.source.sheet))throw Error(canonical+': ambiguous simultaneous state');
 const p=latest.action==='出庫'?photos.filter(p=>p.sendId===latest.sendId&&!p.cancelled):[];
 if(p.length>1)throw Error(canonical+': ambiguous shipment photo');
 return {id:canonical,status:STATE[latest.action],location:valid[0].location,user:valid[0].user,lastStateTime:latest.time,shippedAt:latest.action==='出庫'?latest.time:null,customerName:p[0]?.customerName||'',siteName:p[0]?.siteName||'',caseTitle:p[0]?.caseTitle||'',sendId:latest.sendId,history,cancelCandidate:latest.action==='出庫'?latest:null};
}
function cancellationTarget(snapshot){
 const e=snapshot.cancelCandidate;
 if(!e)throw Error('Latest state is not checkout');
 if(!e.logId)throw Error('Missing source log ID');
 if(e.source.numberCount!==1)throw Error('Use existing batch cancellation for multiple numbers');
 return {...e.source,expectedId:snapshot.id,expectedTime:e.time,expectedSendId:e.sendId};
}
function selectPilotItem(id, snapshot, masterType, enabled){
 if(!enabled)return null; // Existing path remains untouched until deliberate integration.
 if(!key(id).startsWith('DT900-'))throw Error('Outside pilot');
 if(!snapshot||key(snapshot.id)!==key(id))throw Error('Missing verified pilot snapshot');
 if(masterType!=='個体')throw Error('Pilot master is not individual');
 return {managementType:'individual',item:snapshot};
}
module.exports={key,expandSimple,expandIndividual,resolve,cancellationTarget,selectPilotItem};
