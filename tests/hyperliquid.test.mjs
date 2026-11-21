import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHyperliquidCandles,HYPERLIQUID_MARKET,HYPERLIQUID_INFO,fetchHyperliquidLatest,fetchHyperliquidHistory} from '../src/lib/hyperliquid.ts';
test('Hyperliquid SOL candles preserve exchange timestamps and token-denominated OHLC',()=>{
 const row={t:1700000000000,o:'100.123',h:'102.456',l:'99.789',c:'101.111',v:'12.34'};
 assert.deepEqual(parseHyperliquidCandles([row,row]),[{time:1700000000,open:100.123,high:102.456,low:99.789,close:101.111,volume:12.34}]);
 assert.throws(()=>parseHyperliquidCandles([{...row,h:'1'}]));
});
test('market requests SOL directly from Hyperliquid, never another venue',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  assert.equal(url,HYPERLIQUID_INFO);assert.equal(HYPERLIQUID_MARKET,'HL_SOL');
  assert.deepEqual(JSON.parse(init.body),{type:'candleSnapshot',req:{coin:'SOL',interval:'4h',startTime:1000,endTime:2000}});
  return new Response('[]',{status:200});
 };
 try{assert.deepEqual(await fetchHyperliquidLatest('4h',1000,2000),[]);}finally{globalThis.fetch=original;}
});
test('incomplete six-month history is rejected rather than silently used for a four-month test',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify([{t:Date.now(),o:'100',h:'101',l:'99',c:'100',v:'1'}]));
 try{await assert.rejects(fetchHyperliquidHistory('4h',6),/pełnych sześciu miesięcy/);}finally{globalThis.fetch=original;}
});
