import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parsePineHeader,parsePineInputs} from '../src/lib/strategy/jarvis.ts';
import {runSolHa4} from '../src/strategies/sol-ha4/engine.ts';
import {dailyHa,smoothedHa,rma,rangeDetector} from '../src/strategies/sol-ha4/indicators.ts';
import {applyParamsFile} from '../src/lib/strategy/params-file.ts';

const source=readFileSync('src/strategies/sol-ha4/strategy.txt','utf8');
const header=parsePineHeader(source);
const time=Date.UTC(2026,0,1)/1000;
const bar=(i,o,c,lo=Math.min(o,c)-1,hi=Math.max(o,c)+1)=>({time:time+i*14400,open:o,close:c,low:lo,high:hi,volume:10});
const params={haL1:1,haL2:1,useDaily:false,useRange:false,useSL:false};
const run=(cs,p=params,end=cs.at(-1).time+14400)=>runSolHa4(cs,p,header,undefined,{startTime:time,endTime:end});

test('uploaded capital 1000 and commission 0.05% are read across the multiline header',()=>{
  assert.equal(header.initialCapital,1000); assert.equal(header.commissionPct,0.05);
  assert.equal(header.title,'SOL HA-4H (Kup / Trzymaj / Sprzedaj SOL)');
  const p=Object.fromEntries(parsePineInputs(source).map(p=>[p.name,p.value]));
  assert.equal(p.haL1,45); assert.equal(p.haL2,15); assert.equal(p.slMult,1.5); assert.equal(p.bbwLookback,540);
  assert.deepEqual(parsePineInputs(applyParamsFile(source,readFileSync('src/strategies/sol-ha4/params.txt','utf8'))),parsePineInputs(source));
});
test('HA EMA starts with first sample and Wilder ATR uses the length 14 SMA seed',()=>{
  const ha=smoothedHa([bar(0,100,110),bar(1,110,120)],45,15);
  assert.equal(ha.open[0],105); assert.equal(ha.close[0],105);
  const atr=rma(Array.from({length:15},(_,i)=>i+1),14);
  assert.ok(Number.isNaN(atr[12])); assert.equal(atr[13],7.5); assert.equal(atr[14],(7.5*13+15)/14);
});
test('BUY and SELL signals execute at the next open, never open a short, spend all cash including fees',()=>{
  const cs=[bar(0,100,100),bar(1,100,110),bar(2,115,120),bar(3,120,80),bar(4,75,70)];
  const r=run(cs),t=r.trades[0];
  assert.equal(r.trades.length,1); assert.equal(t.side,'BUY'); assert.equal(t.entryTime,cs[2].time); assert.equal(t.entryPrice,115);
  assert.equal(t.exitTime,cs[4].time); assert.equal(t.exitPrice,75); assert.equal(t.exitReason,'Strategy SELL');
  assert.ok(Math.abs(t.notional*(1+0.0005)-1000)<1e-8);
  assert.ok(Math.abs(t.commission-(t.notional+t.qty*75)*0.0005)<1e-8);
  assert.ok(Math.abs(r.stats.finalEquity-(1000+t.pnl))<1e-8); assert.equal(r.stats.suiBalance,0);
});
test('unfinished green candle does not issue an entry; previous confirmed signal may fill at its open',()=>{
  const cs=[bar(0,100,100),bar(1,100,110),bar(2,115,120)];
  assert.equal(run(cs,params,cs[1].time+100).trades.length,0);
  const r=run(cs,params,cs[2].time+100);
  assert.equal(r.trades.length,1); assert.equal(r.trades[0].entryTime,cs[2].time); assert.equal(r.trades[0].exitReason,'Otwarta');
});
test('stop is signal close minus 1.5 ATR and a downside gap fills at its open, including entry-bar stop',()=>{
  const cs=[bar(0,100,100,99,101),bar(1,100,110,99,111),bar(2,90,95,85,96),bar(3,95,110)];
  const r=run(cs,{...params,useSL:true,slAtrLen:1,slMult:1.5});
  assert.equal(r.trades[0].stop,92); assert.equal(r.trades[0].entryPrice,90); assert.equal(r.trades[0].exitPrice,90);
  assert.equal(r.trades[0].exitReason,'STOP_LOSS'); assert.equal(r.trades[0].entryTime,r.trades[0].exitTime);
});
test('after stop green HA cannot re-enter until a red then green cycle',()=>{
  const cs=[bar(0,100,100),bar(1,100,110),bar(2,110,120,90,121),bar(3,120,130),bar(4,130,140),bar(5,140,60),bar(6,60,200),bar(7,200,210)];
  const r=run(cs,{...params,useSL:true,slAtrLen:1,slMult:0.1});
  assert.equal(r.trades[0].exitReason,'STOP_LOSS'); assert.equal(r.trades[1].entryTime,cs[7].time); assert.equal(r.trades.length,2);
});
test('daily filter uses yesterday only and future daily prices cannot change past decisions',()=>{
  const cs=Array.from({length:18},(_,i)=>bar(i,100+i,101+i));
  const a=dailyHa(cs,14400,1,1); assert.equal(a[5],undefined); assert.equal(a[6],false); assert.equal(a[12],true);
  const altered=cs.map((c,i)=>i>=6?{...c,high:1000,close:1,low:1}:c);
  assert.deepEqual(dailyHa(altered,14400,1,1).slice(6,12),a.slice(6,12));
  const r=run(cs,{...params,useDaily:true,dL1:1,dL2:1});
  assert.equal(r.trades[0].entryTime,cs[13].time);
});
test('intrabar low fills an active stop exactly at its price; no stop line between positions',()=>{
  const cs=[bar(0,100,100,99,101),bar(1,100,110,99,111),bar(2,115,120,90,121),bar(3,120,130)];
  const r=run(cs,{...params,useSL:true,slAtrLen:1,slMult:1.5});
  assert.equal(r.trades[0].exitPrice,92); assert.equal(r.trades[0].exitReason,'STOP_LOSS');
  assert.ok(Number.isNaN(r.plots[0].data[1].value)); assert.equal(r.plots[0].data[2].value,92); assert.ok(Number.isNaN(r.plots[0].data[3].value));
});
test('range confirmation 4 and minimum dwell 32 block entries and trigger next-open liquidation',()=>{
  const cs=Array.from({length:70},(_,i)=>bar(i,100+i,101+i));
  const p={...params,useRange:true,adxLen:2,atrLen:2,chopLen:2,erLen:2,bbLen:2,slopeLen:1,smoothLen:1,adxMax:101,chopMin:-1,erMax:2,slopeMax:100,enterRange:0.6,exitRange:-1,confirmBars:4,minDwell:32,breakoutAtr:1000};
  const state=rangeDetector(cs,p),i=state.inRange.indexOf(true);
  assert.equal(i,34); const r=run(cs,p); assert.equal(r.trades.length,1); assert.equal(r.trades[0].exitTime,cs[i+1].time);
});
test('warmup cannot trade and future candles do not change a fixed historical test',()=>{
  const cs=Array.from({length:30},(_,i)=>bar(i,100+i,101+i));
  const end=cs[19].time+14400;
  const a=runSolHa4(cs,params,header,undefined,{startTime:cs[10].time,endTime:end});
  const b=runSolHa4(cs.slice(0,21),params,header,undefined,{startTime:cs[10].time,endTime:end});
  assert.deepEqual(a,b); assert.equal(a.trades[0].entryTime,cs[11].time);
});
test('visual settings and plot colors cannot change trades or account balances',()=>{
  const cs=Array.from({length:70},(_,i)=>bar(i,100+i,101+i));
  const a=run(cs),b=run(cs,{...params,showStop:false,showBg:false,showBounds:true,showHaBars:true,showTable:false});
  assert.deepEqual(a.trades,b.trades); assert.deepEqual(a.stats,b.stats); assert.deepEqual(a.equity,b.equity);
});