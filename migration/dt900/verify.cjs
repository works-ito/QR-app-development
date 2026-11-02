'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const core=require('./compatibility.cjs');
const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const events=[...core.expandSimple(fixture.simpleRows),...core.expandIndividual(fixture.individualRows),...core.expandSimple(fixture.repairRows,'簡易個体修理管理ログ')];
const snapshots=fixture.masterIds.map(id=>core.resolve(id,events,fixture.photos));
const results=[];function test(n,f){f();results.push(n)}
const sample=events.find(e=>!e.cancelled);const mk=(over={})=>({...sample,...over,source:{...sample.source,...over.source}});
test('13 master IDs match source and current display',()=>{assert.equal(snapshots.length,13);for(const s of snapshots){const d=fixture.displayStates.find(d=>d.id===s.id);assert.equal(s.status,({出庫:'出庫中',返却:'未点検',完成機:'在庫あり'})[d.action]);}});
test('101 source records retained, including six cancellations',()=>{assert.equal(events.length,101);assert.equal(events.filter(e=>e.cancelled).length,6);assert.equal(snapshots.reduce((n,s)=>n+s.history.length,0),101)});
test('Expected 5 out, 5 ready, 3 uninspected',()=>{assert.deepEqual(snapshots.reduce((m,s)=>(m[s.status]=(m[s.status]||0)+1,m),{}),{'出庫中':5,'在庫あり':5,'未点検':3})});
test('All five shipments retain exact send ID, time, customer, site',()=>{for(const s of snapshots.filter(s=>s.status==='出庫中')){assert.ok(s.shippedAt);assert.ok(s.customerName);assert.ok(s.siteName);assert.equal(s.sendId,s.cancelCandidate.sendId);assert.ok(core.cancellationTarget(s).logId)}});
test('3/4 digits and fullwidth normalize',()=>{assert.equal(core.key('dt900-001'),core.key('ＤＴ９００－０００１'));assert.throws(()=>core.key('DT900-12'))});
test('Cancelled newer checkout does not hide previous state',()=>{assert.equal(core.resolve(sample.id,[mk({action:'返却',time:'2026-10-01T10:00:00+09:00'}),mk({action:'出庫',time:'2026-10-02T10:00:00+09:00',cancelled:true})]).status,'未点検')});
test('New individual return overrides legacy checkout',()=>{assert.equal(core.resolve(sample.id,[mk({action:'出庫',time:'2026-10-01T10:00:00+09:00'}),mk({action:'返却',time:'2026-10-02T10:00:00+09:00',source:{sheet:'個体機管理ログ'}})]).status,'未点検')});
test('Legacy repair overrides older normal event',()=>{assert.equal(core.resolve(sample.id,[sample,mk({action:'修理中',time:'2026-12-01T10:00:00+09:00',source:{sheet:'簡易個体修理管理ログ'}})]).status,'修理中')});
test('Location move preserves checkout and original shipment date',()=>{const s=core.resolve(sample.id,[mk({action:'出庫'}),mk({action:'拠点移動',time:'2026-12-01T10:00:00+09:00',location:'MF'})]);assert.equal(s.status,'出庫中');assert.equal(s.location,'MF');assert.equal(s.shippedAt,Date.parse(sample.time))});
test('No unknown state fallback',()=>{assert.throws(()=>core.resolve(sample.id,[]));assert.throws(()=>core.resolve(sample.id,[mk({action:'不明'})]));assert.throws(()=>core.resolve(sample.id,[mk({time:'2026/11/02'})]))});
test('Ambiguous same-time cross-source state rejected',()=>assert.throws(()=>core.resolve(sample.id,[sample,mk({action:'返却',source:{sheet:'個体機管理ログ'}})])));
test('Cancellation blocked without log ID or with multiple numbers',()=>{for(const over of [{logId:''},{source:{numberCount:2}}])assert.throws(()=>core.cancellationTarget(core.resolve(sample.id,[mk({action:'出庫',...over})])))});
test('Batch send ID alone never deduplicates machines or events',()=>{const e=mk({sendId:'BATCH-X'}),e2=mk({sendId:'BATCH-X',id:'DT900-2006'});assert.equal(core.resolve(e.id,[e,e2]).history.length,1);assert.equal(core.resolve(e2.id,[e,e2]).history.length,1)});
test('Pilot disabled by default and refuses mismatched master',()=>{assert.equal(core.selectPilotItem(sample.id,null,'数量',false),null);assert.throws(()=>core.selectPilotItem(sample.id,snapshots[0],'数量',true));assert.equal(core.selectPilotItem(snapshots[0].id,snapshots[0],'個体',true).managementType,'individual')});
// Run the existing source-state loader against an in-memory sheet, never GAS.
const gas=fs.readFileSync(process.argv[3],'utf8');
const fn=gas.slice(gas.indexOf('function loadSimpleStatesFromSource_('),gas.indexOf('function recordClientTelemetry_('));
const toDates=rows=>rows.map(r=>{const a=r.slice();if(a[0])a[0]=new Date(a[0]);return a});
const tables={'簡易個体管理ログ':toDates(fixture.simpleRows),'簡易個体修理管理ログ':toDates(fixture.repairRows)};
const ss={getSheetByName(name){const rows=tables[name];return {getLastRow:()=>rows.length+1,getRange:()=>({getValues:()=>rows})}}};
const ctx=vm.createContext({Date,Map,Set,isRecRecord_:()=>false,normalizeManagementId_:v=>String(v).trim().toUpperCase(),getSheetOrThrow_:(ss,n)=>ss.getSheetByName(n)});vm.runInContext(fn,ctx);
test('Existing GAS source loader agrees on all 13 actual states',()=>{const r=ctx.loadSimpleStatesFromSource_(ss,fixture.masterIds.map(qr=>({qr,mode:'出庫',managementType:'simple'})),null);for(const s of snapshots)assert.equal(r.get(s.id),s.status)});

// Reproduce current browser routing from the actual production checkout.
const app=fs.readFileSync(process.argv[5]||require('path').join(__dirname,'../../app.js'),'utf8');
const routing=app.slice(app.indexOf('    function findManagedItemLocal('),app.indexOf('    function getManagedDisplayName('));
const browser=vm.createContext({normalizeLookupKey:v=>String(v).toLowerCase(),normalizeManagedIdKey:v=>core.key(v).toLowerCase(),simpleItemMap:new Map([['dt900-1001',{状態:'出庫中'}]]),individualItemMap:new Map([['dt900-1001',{状態:'未点検'}]]),managedMasterItemMap:new Map(),recItemMap:new Map()});
vm.runInContext(routing,browser);
test('Current browser reproduces stale simple priority despite individual presence',()=>assert.equal(browser.findManagedItemLocal('DT900-1001').managementType,'simple'));
test('Proposed pilot selector uses verified individual state first',()=>assert.equal(core.selectPilotItem(snapshots[0].id,snapshots[0],'個体',true).managementType,'individual'));

fs.writeFileSync(process.argv[4],JSON.stringify({passed:results.length,results,snapshots},null,2));
console.log(JSON.stringify({passed:results.length,checks:results},null,2));
