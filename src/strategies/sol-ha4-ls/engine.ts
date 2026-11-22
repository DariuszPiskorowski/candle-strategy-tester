import type { Candle } from '../../lib/candles.ts';
import { detectInterval } from '../../lib/candles.ts';
import type { BacktestOptions, PineHeader, StrategyColor, StrategyResult, Trade } from '../../lib/strategy/jarvis.ts';
import type { StrategyEngine } from '../types.ts';
import { dailyHa, rangeDetector, smoothedHa, rma, trueRanges } from '../sol-ha4/indicators.ts';
import { spotStats } from '../sol-ha4/simulation.ts';
import { estimatedLiquidation, positionQty } from './sizing.ts';

export function runSolHa4LS(candles: Candle[], p: Record<string, number|string|boolean>, header: PineHeader, colors: StrategyColor[] = [], options: BacktestOptions = {}): StrategyResult {
  const now=options.endTime ?? Math.floor(Date.now()/1000);
  candles=candles.filter(c=>c.time<=now);
  const interval=candles.length>=3?detectInterval(candles):14400;
  const num=(k:string,d:number)=>typeof p[k]==='number'?Number(p[k]):d;
  const len=(k:string,d:number)=>Math.max(1,Math.round(num(k,d)));
  const bool=(k:string,d:boolean)=>typeof p[k]==='boolean'?Boolean(p[k]):d;
  const date=new Date(now*1000); date.setUTCMonth(date.getUTCMonth()-4);
  const start=options.startTime ?? Math.floor(date.getTime()/1000);
  const greenL=smoothedHa(candles,len('haL1L',45),len('haL2L',15)).green;
  const greenS=smoothedHa(candles,len('haL1S',55),len('haL2S',20)).green;
  const dayL=dailyHa(candles,interval,len('dL1L',8),len('dL2L',8));
  const dayS=dailyHa(candles,interval,len('dL1S',3),len('dL2S',3));
  const rangeL=rangeDetector(candles,{...p,smoothLen:len('smoothL',3),confirmBars:len('confL',4),minDwell:len('dwellL',32)});
  const rangeS=rangeDetector(candles,{...p,smoothLen:len('smoothS',3),confirmBars:len('confS',4),minDwell:len('dwellS',36)});
  const atr=rma(trueRanges(candles),len('slAtrLen',14));
  const trades: Trade[]=[], equity: StrategyResult['equity']=[], plots: StrategyResult['plots']=[];
  const stops={BUY:[] as {time:number;value:number}[],SELL:[] as {time:number;value:number}[]};
  let cash=header.initialCapital, peak=cash, dd=0, waitL=false, waitS=false, j=-1;
  type Position={side:'BUY'|'SELL'; idx:number; price:number; qty:number; notional:number; fee:number; stop:number; liquidation:number};
  let pos:Position|null=null;
  let pending:{kind:'entry';side:'BUY'|'SELL';qty:number;stop:number}|{kind:'exit'}|null=null;
  const feeRate=header.commissionPct/100, leverage=num('exchLev',2);
  const mark=(value:number)=>{peak=Math.max(peak,value); if(peak>0) dd=Math.max(dd,(peak-value)/peak*100);};
  const floating=(position:Position,price:number)=>(position.side==='BUY'?1:-1)*position.qty*(price-position.price);
  const exit=(i:number,price:number,reason:Trade['exitReason'])=>{
    if(!pos)return;
    const fee=pos.qty*price*feeRate, pnl=floating(pos,price)-pos.fee-fee;
    cash+=floating(pos,price)-fee;
    trades.push({side:pos.side,entryTime:candles[pos.idx].time,entryPrice:pos.price,exitTime:candles[i].time,exitPrice:price,qty:pos.qty,notional:pos.notional,stop:pos.stop,exitReason:reason,pnl,pnlPct:pnl/pos.notional*100,commission:pos.fee+fee,bars:i-pos.idx});
    pos=null;
  };
  for(let i=0;i<candles.length;i++) {
    const c=candles[i], confirmed=c.time+interval<=now;
    if(confirmed)j=i;
    if(c.time<start)continue;
    // Market exit at the next open comes before the intrabar protective orders.
    let active=pos;
    if(pending?.kind==='exit' && pos)exit(i,c.open,pos.side==='BUY'?'Strategy SELL':'Strategy BUY');
    if(pending?.kind==='entry' && !pos) {
      const notional=pending.qty*c.open, fee=notional*feeRate;
      if(leverage>=1 && leverage<=20 && notional/leverage+fee<=cash) {
        cash-=fee;
        pos={side:pending.side,idx:i,price:c.open,qty:pending.qty,notional,fee,stop:pending.stop,liquidation:estimatedLiquidation(pending.side,c.open,pending.qty,cash)};
        active=pos;
      }
    }
    pending=null;
    if(pos) {
      const isBuy=pos.side==='BUY', finiteStop=Number.isFinite(pos.stop), finiteLiq=Number.isFinite(pos.liquidation);
      const stopFirst=finiteStop && (!finiteLiq || (isBuy?pos.stop>=pos.liquidation:pos.stop<=pos.liquidation));
      const barrier=stopFirst?pos.stop:pos.liquidation;
      const reason=stopFirst?'STOP_LOSS':'LIQUIDATION';
      const hit=Number.isFinite(barrier) && (isBuy?c.low<=barrier:c.high>=barrier);
      const gap=Number.isFinite(barrier) && (isBuy?c.open<=barrier:c.open>=barrier);
      if(!gap) mark(cash+floating(pos,isBuy?c.high:c.low));
      mark(cash+floating(pos,hit?(gap?c.open:barrier):(isBuy?c.low:c.high)));
      if(hit) {
        const side=pos.side; exit(i,gap?c.open:barrier,reason);
        if(side==='BUY')waitL=true;else waitS=true;
      }
    }
    if(confirmed) {
      if(waitL && !greenL[i])waitL=false;
      if(waitS && greenS[i])waitS=false;
      const blockL=bool('useRngL',true)&&rangeL.inRange[i], blockS=bool('useRngS',true)&&rangeS.inRange[i];
      if(pos) {
        if(pos.side==='BUY'?(!greenL[i]||blockL):(greenS[i]||blockS))pending={kind:'exit'};
      } else {
        // Original source gives BUY priority; no reversal on a close-generated exit.
        const longSignal=bool('useLong',true)&&greenL[i]&&(!bool('useDayL',true)||dayL[i]===true)&&!blockL&&!waitL;
        const shortSignal=bool('useShort',true)&&!greenS[i]&&(!bool('useDayS',true)||dayS[i]===false)&&!blockS&&!waitS&&!longSignal;
        const side=longSignal?'BUY':shortSignal?'SELL':null;
        if(side) {
          const qty=positionQty(cash,c.close,num(side==='BUY'?'targetL':'targetS',1.5),leverage,num('qtyStep',0.1),num('minQty',0.1));
          const useStop=bool(side==='BUY'?'useSLL':'useSLS',true);
          const stop=useStop?c.close+(side==='BUY'?-1:1)*num(side==='BUY'?'kL':'kS',side==='BUY'?1.5:2.5)*atr[i]:NaN;
          if(qty>0)pending={kind:'entry',side,qty,stop};
        }
      }
    }
    for(const side of ['BUY','SELL'] as const) stops[side].push({time:c.time,value:active?.side===side?active.stop:NaN});
    const value=cash+(pos?floating(pos,c.close):0); mark(value); equity.push({time:c.time,value});
  }
  const last=candles.at(-1);
  if(pos&&last) {
    const pnl=floating(pos,last.close)-pos.fee;
    trades.push({side:pos.side,entryTime:candles[pos.idx].time,entryPrice:pos.price,exitTime:last.time,exitPrice:last.close,qty:pos.qty,notional:pos.notional,stop:pos.stop,exitReason:'Otwarta',pnl,pnlPct:pnl/pos.notional*100,commission:pos.fee,bars:candles.length-1-pos.idx});
  }
  if(bool('showStop',true)) for(const side of ['BUY','SELL'] as const) plots.push({title:`Stop loss (${side})`,stopSide:side,color:colors.find(c=>c.key==='stop')?.value??'#ff9800',width:1,data:stops[side]});
  // Range filter preview: box bounds from range start, extended by the minimum bars left (presentation only).
  const last0=candles.at(-1);
  if(j>=0&&last0) {
    for(const [name,on,r,dw,cf] of [['BUY',bool('useRngL',true),rangeL,len('dwellL',32),len('confL',4)],['SELL',bool('useRngS',true),rangeS,len('dwellS',36),len('confS',4)]] as const) {
      if(!on||!r.inRange[j])continue;
      let s0=j; while(s0>0&&r.inRange[s0-1])s0--;
      const left=Math.max(dw-r.dwells[j],cf-r.streaks[j],1);
      const endT=candles[j].time+left*interval;
      // The counter sits above the upper bound line, never above the candles.
      const levels: [number, 'upper' | 'lower'][] = [[r.upper[j], 'upper'], [r.lower[j], 'lower']];
      for(const [lvl,kind] of levels) {
        const data:{time:number;value:number}[]=[];
        for(let k=s0;k<candles.length;k++)data.push({time:candles[k].time,value:lvl});
        for(let t=last0.time+interval;t<=endT;t+=interval)data.push({time:t,value:lvl});
        plots.push({title:`Boczniak ${name}`,color:'rgba(255,193,7,0.9)',width:1,data,
          ...(kind==='upper'?{marker:{time:last0.time,text:`Boczniak ${name}: trwa ${j-s0+1} św., min. ${left} św.`}}:{})});
      }
    }
  }
  const stats=spotStats(candles,trades,equity,header,cash,0,dd);
  const unrealized=pos&&last?floating(pos,last.close):0, positionValue=pos&&last?pos.qty*last.close:0;
  stats.positionSide=pos?.side??null; stats.signalExits=trades.filter(t=>t.exitReason==='Strategy BUY'||t.exitReason==='Strategy SELL').length;
  return {trades,equity,plots,stats,
    derivatives:{exchangeLeverage:leverage,targetLong:num('targetL',1.5),targetShort:num('targetS',1.5),marginMode:'cross',positionQty:pos?.qty??0,positionValue,marginUsed:positionValue/leverage,unrealizedPnl:unrealized,liquidationPrice:pos?.liquidation??NaN,liquidations:trades.filter(t=>t.exitReason==='LIQUIDATION').length,fundingIncluded:false},
    status:bool('showTable',true)?pos?`${pos.side} SOL`:'Poza rynkiem (USDC)':undefined,
    latestSignals:bool('showTable',true)?[
      {name:'HA 4H — BUY',signal:j<0?'BRAK DANYCH':greenL[j]?'BUY':'SELL'},
      {name:'HA 4H — SELL',signal:j<0?'BRAK DANYCH':greenS[j]?'BUY':'SELL'},
      ...(bool('useDayL',true)?[{name:'HA dzienny — BUY',signal:j<0||dayL[j]===undefined?'BRAK DANYCH' as const:dayL[j]?'BUY' as const:'SELL' as const}]:[]),
      ...(bool('useDayS',true)?[{name:'HA dzienny — SELL',signal:j<0||dayS[j]===undefined?'BRAK DANYCH' as const:dayS[j]?'BUY' as const:'SELL' as const}]:[])]:[],
    backgrounds:bool('showBg',true)?candles.map((c,i)=>({time:c.time,color:trades.some(t=>t.side==='BUY'&&c.time>=t.entryTime&&(t.exitReason==='Otwarta'||c.time<t.exitTime))?'rgba(8,153,129,0.12)':trades.some(t=>t.side==='SELL'&&c.time>=t.entryTime&&(t.exitReason==='Otwarta'||c.time<t.exitTime))?'rgba(242,54,69,0.12)':(bool('useRngL',true)&&rangeL.inRange[i])||(bool('useRngS',true)&&rangeS.inRange[i])?'rgba(255,193,7,0.10)':'transparent'})):undefined,
  };
}
const engine:StrategyEngine={id:'sol-ha4-ls',name:'SOL HA-4H BUY + SELL (1,5×)',detect:code=>/smoothedHaGreen\s*\(/.test(code)&&/\bgoShort\b/.test(code)&&/\bexchLev\b/.test(code),parseColors:()=>[{key:'stop',title:'Stop loss',value:'#ff9800'}],run:runSolHa4LS};
export default engine;
