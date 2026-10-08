import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {runUploadedPine} from './pine-runtime.test.mjs';
const source=readFileSync(new URL('../examples/jarvis_spot_swing_sl.pine',import.meta.url),'utf8');
const block=source.split('    // SWING_SL_BEGIN')[1].split('    // SWING_SL_END')[0].split('\n').map(l=>l.startsWith('    ')?l.slice(4):l).join('\n');
async function stops(lows, newest=false, delay=5){
 const candles=lows.map((low,i)=>({time:1767225600+i*3600,open:120,close:120,high:125,low,volume:100}));
 const code=`//@version=5
strategy("Stop logic")
swingDelay = ${delay}
swingLookback = 15
stopBufferPct = 0.0025
useNewestLow = ${newest}
var float activeStop = 80.0
var int stopAnchorBar = -1
${block}
plot(activeStop, title="SL")`;
 const out=await runUploadedPine({code,candles,interval:3600,symbol:'TEST',tickSize:.01,qtyStep:.1});
 return out.result.plots.find(p=>p.title==='SL').data.map(p=>p.value);
}
test('swing stop waits five closed bars after the pivot; then uses buffered low',async()=>{
 const s=await stops([100,90,101,102,103,104,105]);
 assert.deepEqual(s.slice(0,6),[80,80,80,80,80,80]);assert.equal(s[6],89.77);
});
test('rising prices without a pivot never move SL',async()=>{
 assert.ok((await stops([90,91,92,93,94,95,96,97,98,99])).every(v=>v===80));
});
test('newest and lowest mode choose different mature pivots',async()=>{
 // Isolate selection from prior SL updates: both pivots are mature at the final bar.
 const lows=[100,90,110,100,110,111,112,113,114];
 async function last(newest){
  const code=`//@version=5\nstrategy("Selection")\nswingDelay = 5\nswingLookback = 15\nstopBufferPct = 0.0025\nuseNewestLow = ${newest}\nfloat activeStop = 80.0\nint stopAnchorBar = -1\n${block}\nplot(activeStop, title="SL")`;
  const candles=lows.map((low,i)=>({time:1767225600+i*3600,open:120,close:120,high:125,low,volume:1}));
  const out=await runUploadedPine({code,candles,interval:3600,symbol:'TEST',tickSize:.01,qtyStep:.1});
  return out.result.plots.find(p=>p.title==='SL').data.at(-1).value;
 }
 assert.equal(await last(false),89.77);assert.equal(await last(true),99.75);
});
test('later lower pivot never lowers an existing stop',async()=>{
 const s=await stops([110,100,111,112,113,114,115,95,110,111,112,113,114]);
 assert.equal(s[6],99.75);assert.equal(s.at(-1),99.75);
});
test('full uploaded example runs and exposes all SL parameters',async()=>{
 const candles=Array.from({length:240},(_,i)=>({time:1767225600+i*3600,open:100+i/10,close:100.1+i/10,high:101+i/10,low:99+i/10,volume:1}));
 const out=await runUploadedPine({code:source,candles,interval:3600,symbol:'TEST',tickSize:.01,qtyStep:.1});
 assert.equal(out.params.find(p=>p.title==='SL: newest local low (off = lowest)').value,false);
 assert.equal(out.params.find(p=>p.title==='Closed bars after local low').value,5);
});
