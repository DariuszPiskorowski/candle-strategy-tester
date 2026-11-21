import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parsePineHeader,parsePineInputs} from '../src/lib/strategy/jarvis.ts';
import {applyParamsFile} from '../src/lib/strategy/params-file.ts';
import {runSolHa4LS} from '../src/strategies/sol-ha4-ls/engine.ts';
import {positionQty,estimatedLiquidation,maintenanceMargin} from '../src/strategies/sol-ha4-ls/sizing.ts';
import {rangeDetector} from '../src/strategies/sol-ha4/indicators.ts';
import {detectEngine} from '../src/strategies/registry.ts';
const code=readFileSync('src/strategies/sol-ha4-ls/strategy.txt','utf8');
const header=parsePineHeader(code), time=Date.UTC(2026,0,1)/1000;
const bar=(i,o,c,low=Math.min(o,c)-1,high=Math.max(o,c)+1)=>({time:time+i*14400,open:o,close:c,low,high,volume:10});
const base={haL1L:1,haL2L:1,haL1S:1,haL2S:1,useDayL:false,useDayS:false,useRngL:false,useRngS:false,useSLL:false,useSLS:false,useLong:true,useShort:false};
const run=(cs,p={},end=cs.at(-1).time+14400)=>runSolHa4LS(cs,{...base,...p},header,[],{startTime:time,endTime:end});
test('source defaults preserve 1000 USDC, 0.05% fee, 2x exchange leverage, 1.5x exposure and 0.1 SOL step/minimum',()=>{
 const p=Object.fromEntries(parsePineInputs(code).map(p=>[p.name,p.value]));
 assert.equal(header.initialCapital,1000);assert.equal(header.commissionPct,0.05);
 assert.equal(p.exchLev,2);assert.equal(p.targetL,1.5);assert.equal(p.targetS,1.5);assert.equal(p.qtyStep,0.1);assert.equal(p.minQty,0.1);
 assert.equal(p.haL1L,45);assert.equal(p.haL2L,15);assert.equal(p.haL1S,55);assert.equal(p.haL2S,20);assert.equal(p.dL1L,8);assert.equal(p.dL1S,3);assert.equal(p.kL,1.5);assert.equal(p.kS,2.5);assert.equal(p.dwellL,32);assert.equal(p.dwellS,36);assert.equal(p.useBbw,true);
 assert.deepEqual(parsePineInputs(applyParamsFile(code,readFileSync('src/strategies/sol-ha4-ls/params.txt','utf8'))),parsePineInputs(code));
 assert.equal(detectEngine(code)?.id,'sol-ha4-ls');
});
test('target exposure is capped by exchange leverage and quantity is rounded down to 0.1 SOL',()=>{
 assert.equal(positionQty(1000,110,1.5,2,0.1,0.1),13.600000000000001);
 assert.equal(positionQty(1000,100,3,2,0.1,0.1),20);
 assert.equal(positionQty(1,100,1.5,2,0.1,0.1),0);
 assert.equal(positionQty(1000,100,1.5,2,0,0.1),0);
});
test('BUY quantity is fixed at signal close; execution and fees use the following open',()=>{
 const cs=[bar(0,100,100),bar(1,100,110),bar(2,115,120),bar(3,120,80),bar(4,75,70)];
 const r=run(cs),t=r.trades[0];
 assert.equal(t.entryTime,cs[2].time);assert.equal(t.entryPrice,115);assert.equal(t.exitTime,cs[4].time);assert.equal(t.exitPrice,75);
 assert.ok(Math.abs(t.qty-13.6)<1e-10);assert.ok(Math.abs(t.pnl-(13.6*(75-115)-13.6*(115+75)*0.0005))<1e-8);
 assert.ok(Math.abs(r.stats.finalEquity-(1000+t.pnl))<1e-8);assert.equal(r.stats.suiBalance,0);
});
test('SELL is a derivative: price decline earns USDC without buying or holding spot SOL',()=>{
 const cs=[bar(0,100,100),bar(1,100,90),bar(2,90,80),bar(3,80,140),bar(4,130,135)];
 const r=run(cs,{useLong:false,useShort:true}),t=r.trades[0];
 assert.equal(t.side,'SELL');assert.equal(t.entryTime,cs[1].time);assert.equal(t.exitPrice,130);
 assert.ok(Math.abs(t.pnl-(15*(100-130)-15*(100+130)*0.0005))<1e-8);
 const open=run(cs.slice(0,3),{useLong:false,useShort:true});
 assert.equal(open.stats.positionSide,'SELL');assert.equal(open.stats.suiBalance,0);
 assert.ok(Math.abs(open.derivatives.unrealizedPnl-300)<1e-8);assert.ok(Math.abs(open.stats.totalUsdc-1299.25)<1e-8);
 assert.equal(open.derivatives.fundingIncluded,false);
});
test('one account cannot reverse on the candle that generates an exit',()=>{
 const cs=[bar(0,100,100),bar(1,100,110),bar(2,115,120),bar(3,120,80),bar(4,75,70),bar(5,70,65)];
 const r=run(cs,{useShort:true,useDayS:true}); // no completed previous day: SELL filtered out
 assert.equal(r.trades.length,1);
 const both=run(cs,{useShort:true});
 for(let i=1;i<both.trades.length;i++)assert.ok(both.trades[i].entryTime>both.trades[i-1].exitTime);
});
test('unfinished candle never generates an order, but a prior confirmed order can fill',()=>{
 const cs=[bar(0,100,100),bar(1,100,110),bar(2,115,120)];
 assert.equal(run(cs,{},cs[1].time+100).trades.length,0);
 assert.equal(run(cs,{},cs[2].time+100).trades[0].entryTime,cs[2].time);
});
test('SELL stop is signal close plus 2.5 ATR; a gap fills at open on the entry candle',()=>{
 const cs=[bar(0,100,100,99,101),bar(1,110,105,104,112),bar(2,105,100)];
 const r=run(cs,{useLong:false,useShort:true,useSLS:true,slAtrLen:1,kS:2.5}),t=r.trades[0];
 assert.equal(t.stop,105);assert.equal(t.entryPrice,110);assert.equal(t.exitPrice,110);assert.equal(t.exitReason,'STOP_LOSS');
 assert.equal(r.plots.find(p=>p.stopSide==='SELL').data[1].value,105);
 assert.ok(Number.isNaN(r.plots.find(p=>p.stopSide==='BUY').data[1].value));
});
test('BUY stop is signal close minus 1.5 ATR and fragments are absent outside the position',()=>{
 const cs=[bar(0,100,100,99,101),bar(1,100,110,99,111),bar(2,115,120,90,121),bar(3,120,130)];
 const r=run(cs,{useSLL:true,slAtrLen:1,kL:1.5});
 assert.equal(r.trades[0].stop,92);assert.equal(r.trades[0].exitPrice,92);assert.equal(r.trades[0].exitReason,'STOP_LOSS');
 const line=r.plots.find(p=>p.stopSide==='BUY');assert.ok(Number.isNaN(line.data[1].value));assert.equal(line.data[2].value,92);assert.ok(Number.isNaN(line.data[3].value));
});
test('SELL waits after SL for green HA and a fresh red HA before reentry',()=>{
 const cs=[bar(0,100,100),bar(1,100,90,89,102),bar(2,90,80),bar(3,80,70),bar(4,70,200),bar(5,60,40),bar(6,40,30)];
 const r=run(cs,{useLong:false,useShort:true,useSLS:true,slAtrLen:1,kS:0.1});
 assert.equal(r.trades[0].exitReason,'STOP_LOSS');assert.equal(r.trades[1].entryTime,cs[6].time);assert.equal(r.trades.length,2);
});
test('turning off BBW removes its vote and denominator, separately from range dwell settings',()=>{
 const cs=Array.from({length:70},(_,i)=>bar(i,100+i,101+i));
 const p={adxLen:2,atrLen:2,chopLen:2,erLen:2,bbLen:2,bbwLookback:2,slopeLen:1,smoothLen:1,adxMax:101,chopMin:-1,erMax:2,slopeMax:100,bbwPctMax:0,enterRange:0.9,exitRange:-1,confirmBars:4,minDwell:32,breakoutAtr:1000};
 const on=rangeDetector(cs,p),off=rangeDetector(cs,{...p,useBbw:false});
 assert.equal(on.score[10],0.8);assert.equal(off.score[10],1);assert.equal(on.inRange.indexOf(true),-1);assert.equal(off.inRange.indexOf(true),34);
});
test('cross liquidation estimate uses current SOL 2.5% maintenance, not the configured exchange leverage',()=>{
 assert.equal(maintenanceMargin(1500),37.5);assert.equal(maintenanceMargin(80_000_000),2_250_000);
 assert.ok(Math.abs(estimatedLiquidation('BUY',100,15,1000)-(1500-1000)/(15*0.975))<1e-9);
 assert.ok(Math.abs(estimatedLiquidation('SELL',100,15,1000)-(1500+1000)/(15*1.025))<1e-9);
 const cs=[bar(0,100,100),bar(1,100,110),bar(2,110,40,30,111)];
 const r=run(cs);assert.equal(r.trades[0].exitReason,'LIQUIDATION');assert.equal(r.derivatives.liquidations,1);
});
test('warmup cannot trade and visual switches cannot affect account results',()=>{
 const cs=Array.from({length:30},(_,i)=>bar(i,100+i,101+i));
 const a=run(cs),b=run(cs,{showBg:false,showStop:false,showTable:false});
 assert.deepEqual(a.stats,b.stats);assert.deepEqual(a.trades,b.trades);
 const warm=runSolHa4LS(cs,base,header,[],{startTime:cs[10].time,endTime:cs.at(-1).time+14400});
 assert.equal(warm.trades[0].entryTime,cs[11].time);
});
