import assert from 'node:assert/strict';
import test from 'node:test';
import { runJarvis } from '../src/lib/strategy/jarvis.ts';

const start = Date.UTC(2026,0,1)/1000;
const candles = Array.from({length:360},(_,i)=> {
  const close=100+i*0.07+3*Math.sin(i/10)+Math.sin(i/3);
  const open=i?100+(i-1)*0.07+3*Math.sin((i-1)/10)+Math.sin((i-1)/3):100;
  return {time:start+i*14400,open,close,high:Math.max(open,close)+0.8,low:Math.min(open,close)-0.8,volume:1000};
});
const params={period:5,res:'D',swingLookback:5,swingBuffer:0.35,useSidewaysFilter:false,conversionPeriod:8,basePeriod:25,laggingSpanPeriod:11,macdLength:9,macdFastLength:13,macdSlowLength:27};
const header={title:'Test',initialCapital:300,commissionPct:0.25};

test('every entry spends the available spot balance including BUY fee',()=> {
  const r=runJarvis(candles,params,header);
  assert.ok(r.trades.length>2,'fixture must exercise multiple entries and exits');
  let cash=300;
  for(const t of r.trades) {
    const entryFee=t.notional*0.0025;
    assert.ok(Math.abs(t.notional+entryFee-cash)<1e-8);
    assert.ok(Math.abs(t.qty*t.entryPrice-t.notional)<1e-8);
    if(t.exitReason!=='Otwarta') cash+=t.pnl;
  }
  const open=r.trades.find(t=>t.exitReason==='Otwarta');
  const expected=open?cash+open.pnl:cash;
  assert.ok(Math.abs(r.stats.finalEquity-expected)<1e-8);
});

test('legacy risk and reserve inputs no longer affect sizing',()=> {
  const a=runJarvis(candles,{...params,riskPerTrade:0.1,maxSinglePosition:1,maxMarketExposure:1,minimumReserve:99},header);
  const b=runJarvis(candles,{...params,riskPerTrade:100,maxSinglePosition:100,maxMarketExposure:100,minimumReserve:0},header);
  assert.deepEqual(a,b);
});

test('warmup candles produce indicators but no positions or equity before trading start',()=> {
  const startTime=candles[180].time;
  const r=runJarvis(candles,params,header,undefined,{startTime});
  assert.equal(r.equity.length,180);
  assert.ok(r.trades.length>0);
  assert.ok(r.trades.every(t=>t.entryTime>=startTime));
  assert.equal(r.equity[0].time,startTime);
});

test('future candles do not alter trades or equity before the test end',()=> {
  const endTime=candles[239].time;
  const a=runJarvis(candles,params,header,undefined,{endTime});
  const b=runJarvis(candles.slice(0,240),params,header);
  assert.deepEqual(a,b);
  assert.ok(a.stats.maxIntrabarDrawdownPct>=a.stats.maxDrawdownPct-1e-9);
});
