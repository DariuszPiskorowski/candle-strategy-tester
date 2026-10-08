import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { test } from 'node:test';
const moduleURL=(path, replacements={})=>{
 let js=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [key,value] of Object.entries(replacements)) js=js.replaceAll(`'${key}'`,JSON.stringify(value)).replaceAll(`"${key}"`,JSON.stringify(value));
 return 'data:text/javascript;base64,'+Buffer.from(js).toString('base64');
};
const {runUploadedPine}=await import(moduleURL('../src/lib/strategy/pine-runtime.ts',{'pinets':import.meta.resolve('pinets'),'../candles':moduleURL('../src/lib/candles.ts')}));
const candles=Array.from({length:120},(_,i)=>({time:Date.UTC(2026,0,1)/1000+i*3600,open:100+i,high:102+i,low:99+i,close:101+i,volume:100}));
const request={candles,interval:3600,symbol:'TEST',tickSize:.01,qtyStep:.1};
const source=(bar)=>`//@version=5
const float FEE = 0.25
strategy("Source test", initial_capital=300, commission_type=strategy.commission.percent, commission_value=FEE, process_orders_on_close=true)
if bar_index == ${bar}
    strategy.entry("L", strategy.long, qty=1)
if bar_index == 5
    strategy.close("L")
plot(close, title="Price")
`;
test('source controls orders; constants charge fees',async()=>{
 for(const bar of [1,3]){const out=await runUploadedPine({...request,code:source(bar)});assert.equal(out.result.trades.length,1);assert.equal(out.result.trades[0].entryPrice,101+bar);assert.equal(out.header.commissionPct,.25);assert.ok(out.result.stats.commission>0);}
});
test('no code or invalid code never falls back to Jarvis',async()=>{
 await assert.rejects(runUploadedPine({...request,code:''}));
 await assert.rejects(runUploadedPine({...request,code:'//@version=5\nstrategy("Bad")\nmissingIdentifier(1)'}));
});
test('warmup suppresses orders but retains bar indices',async()=>{
 const out=await runUploadedPine({...request,code:source(1),startTime:candles[3].time});assert.equal(out.result.trades.length,0);assert.equal(out.result.equity[0].time,candles[3].time);
 const later=await runUploadedPine({...request,code:source(3),startTime:candles[3].time});assert.equal(later.result.trades.length,1);
});
test('end date stops simulation and leaves open position marked to market',async()=>{
 const out=await runUploadedPine({...request,code:source(1),endTime:candles[3].time+3599});assert.equal(out.result.trades[0].exitReason,'Otwarta');assert.equal(out.result.trades[0].exitPrice,104);
});
test('confirmed HTF values have no next-day close leakage',async()=>{
 const out=await runUploadedPine({...request,code:`//@version=5
strategy("HTF")
p = request.security(syminfo.tickerid, "D", close[1], lookahead=barmerge.lookahead_on)
plot(p, title="Previous")`});
 const series=out.result.plots.find(p=>p.title==='Previous').data.filter(p=>Number.isFinite(p.value));
 assert.equal(series[0].time,candles[24].time);assert.equal(series[0].value,124);assert.equal(series.find(p=>p.time===candles[48].time).value,148);
});
test('different stop source produces different exits',async()=>{
 for(const stop of [99,100]){
 const code=`//@version=5
strategy("Stop", initial_capital=300, process_orders_on_close=true)
if bar_index == 0
    strategy.entry("L", strategy.long, qty=1)
    strategy.exit("S", from_entry="L", stop=${stop}, comment="STOP_LOSS")`;
 const cs=candles.slice(0,3).map((c,i)=>i===1?{...c,low:98}:c);
 const out=await runUploadedPine({...request,candles:cs,code});assert.equal(out.result.trades[0].exitPrice,stop);
 }
});
export {runUploadedPine};
test('runtime input metadata and overrides come from script',async()=>{
 const code=`//@version=5
strategy("Inputs", initial_capital=300)
n = input.int(2, title="Entry bar")
if bar_index == n
    strategy.entry("L", strategy.long, qty=1)`;
 const out=await runUploadedPine({...request,code,inputs:{'Entry bar':4}});
 assert.equal(out.result.trades[0].entryTime,candles[5].time);
 assert.equal(out.params[0].title,'Entry bar');assert.equal(out.params[0].value,4);
});
