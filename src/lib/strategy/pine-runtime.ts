import { Indicator, PineTS } from 'pinets';
import { aggregate, type Candle } from '../candles';
import type { PineHeader, PineInput, StrategyResult, Trade } from './jarvis';

export type PineRequest = {
  code: string; candles: Candle[]; interval: number; startTime?: number | undefined; endTime?: number | undefined;
  symbol: string; tickSize: number; qtyStep: number;
  inputs?: Record<string, number | string | boolean>;
};
export type PineResponse = { header: PineHeader; result: StrategyResult; params: PineInput[]; warnings: string[] };
// PineTS 0.11's dynamic runtime declarations are intentionally contained here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Runtime = any;
const scalar = (v: Runtime): Runtime => v && typeof v.get === 'function' ? v.get(0) : v;
function finite(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Nieprawidłowa wartość ${name}. Wynik odrzucony.`);
  return v;
}
function tfSeconds(tf: string): number {
  if (/^\d+$/.test(tf)) return Number(tf) * 60;
  const m = /^(\d*)(D|W)$/.exec(tf);
  if (!m) throw new Error(`Nieobsługiwany interwał danych: ${tf}`);
  return Number(m[1] || 1) * (m[2] === 'D' ? 86400 : 604800);
}
export async function runUploadedPine(req: PineRequest): Promise<PineResponse> {
  if (!req.code.trim()) throw new Error('Wczytaj plik strategii Pine.');
  if (!/^\s*\/\/@version=[56]\b/m.test(req.code)) throw new Error('Wymagany plik Pine v5 lub v6 z deklaracją //@version.');
  if (!(req.tickSize > 0 && req.qtyStep > 0 && req.interval > 0)) throw new Error('Podaj dodatnie kroki ceny, ilości i interwał.');
  const candles = req.candles.filter(c => req.endTime === undefined || c.time + req.interval - 1 <= req.endTime);
  if (!candles.length || !candles.some(c => req.startTime === undefined || c.time >= req.startTime)) throw new Error('Brak zamkniętych świec w wybranym zakresie.');
  candles.forEach((c, i) => {
    for (const k of ['time','open','high','low','close','volume'] as const) finite(c[k], k);
    if (c.low <= 0 || c.high < Math.max(c.open,c.close,c.low) || c.low > Math.min(c.open,c.close) || c.volume < 0) throw new Error(`Niepoprawne OHLCV: świeca ${i}.`);
    if (i && c.time - candles[i-1].time !== req.interval) throw new Error('Dane mają luki lub nie odpowiadają wybranemu interwałowi.');
  });
  const asKlines = (cs: Candle[], seconds: number) => cs.map(c => ({...c,openTime:c.time*1000,closeTime:(c.time+seconds)*1000}));
  const provider: Runtime = {
    configure() {},
    async getSymbolInfo() { return {tickerid:req.symbol,ticker:req.symbol,main_tickerid:req.symbol,prefix:'UPLOADED',root:req.symbol,
      mintick:req.tickSize,mincontract:req.qtyStep,pointvalue:1,minmove:1,pricescale:1/req.tickSize,
      timezone:'Etc/UTC',session:'24x7',type:'crypto',currency:'USD',basecurrency:'',description:'Uploaded OHLCV'}; },
    async getMarketData(symbol: string, tf: string) {
      if (symbol !== req.symbol) throw new Error(`Brak wczytanych danych dla symbolu ${symbol}.`);
      const sec = tfSeconds(tf);
      if (sec < req.interval || sec % req.interval) throw new Error(`Nie można utworzyć ${tf} z wczytanego interwału.`);
      if (sec >= 604800 && sec !== req.interval) throw new Error('Agregacja tygodniowa request.security nie jest jeszcze obsługiwana.');
      const rows = sec === req.interval ? candles : aggregate(candles,sec).filter(c =>
        c.time >= candles[0].time && c.time + sec <= candles.at(-1)!.time + req.interval);
      if (!rows.length) throw new Error(`Brak kompletnych świec ${tf}.`);
      return asKlines(rows,sec);
    },
  };
  const script = new Indicator(req.code, req.inputs ?? {});
  const prepared = script.prepare();
  const original = prepared.fn;
  const installed = new WeakSet<object>();
  // Entry/order suppression during warm-up changes no indicator calculations.
  prepared.fn = async (ctx: Runtime) => {
    if (!installed.has(ctx)) {
      installed.add(ctx);
      const ns = ctx.pine.strategy;
      const declare = ns.any.bind(ns);
      ns.any = (...args: Runtime[]) => {
        const value = declare(...args);
        if (ctx.strategy) {
          // Unbox const-series declaration values: a confirmed 0.11.0 defect.
          for (const key of Object.keys(ctx.strategy.config)) ctx.strategy.config[key] = scalar(ctx.strategy.config[key]);
          const cfg = ctx.strategy.config;
          if (cfg.calc_on_every_tick || cfg.calc_on_order_fills || cfg.use_bar_magnifier) throw new Error('Ten tryb przeliczania wymaga danych intrabar i nie jest obsługiwany.');
          if (cfg.commission_type !== 'percent') throw new Error('Obsługiwane są obecnie prowizje procentowe.');
        }
        return value;
      };
      for (const method of ['entry','order']) {
        const call = ns[method].bind(ns);
        ns[method] = (...args: Runtime[]) => {
          const now = ctx.marketData[ctx.idx].openTime / 1000;
          if (req.startTime !== undefined && now < req.startTime) return;
          return call(...args);
        };
      }
    }
    const value = await original(ctx);
    return value;
  };
  Object.assign(prepared.fn, original);
  const engine = new PineTS(provider, req.symbol, String(req.interval/60));
  engine.setMaxLoops(100000);
  const ctx = await engine.run(script);
  const s = ctx.strategy;
  if (!s) throw new Error('Plik nie zadeklarował strategy(). Brak wyników strategii.');
  const initial = finite(s.initial_capital,'kapitału początkowego');
  const finalEquity = finite(s.equity,'kapitału końcowego');
  if (!(initial > 0)) throw new Error('Kapitał początkowy musi być dodatni.');
  const all = [...s.closedtrades,...s.opentrades];
  if (all.some(t=>t.size<=0)) throw new Error('Ten panel obsługuje obecnie strategie Long. Wykryto Short; wynik odrzucony.');
  const trades: Trade[] = all.map(t => {
    const opened = t.status === 'open';
    const entryPrice = finite(t.entry_price,'ceny wejścia');
    const qty = finite(t.size,'ilości');
    const exitPrice = opened ? candles.at(-1)!.close : finite(t.exit_price,'ceny wyjścia');
    const commission = finite(t.commission ?? 0,'prowizji');
    const pnl = opened ? qty*(exitPrice-entryPrice)-commission : finite(t.profit,'wyniku transakcji');
    const exitReason = opened ? 'Otwarta' : /STOP_LOSS|\bSL\b/i.test(t.exit_comment ?? t.exit_id ?? '') ? 'STOP_LOSS' : (t.exit_comment || t.exit_id || 'Wyjście');
    return {entryTime:t.entry_time/1000,entryPrice,exitTime:opened?candles.at(-1)!.time:t.exit_time!/1000,
      exitPrice,qty,notional:qty*entryPrice,stop:NaN,exitReason,pnl,pnlPct:pnl/(qty*entryPrice)*100,commission,
      bars:(opened?candles.length-1:t.exit_bar_index!)-t.entry_bar_index};
  });
  // Rebuild bar-close account value from fills, including same-bar round trips.
  const fee = finite(s.config.commission_value,'stawki prowizji')/100;
  const equity = candles.filter(c=>req.startTime===undefined||c.time>=req.startTime).map(c=> {
    let value=initial;
    for(const t of trades) if(t.entryTime<=c.time) {
      if(t.exitReason!=='Otwarta' && t.exitTime<=c.time) value+=t.pnl;
      else value+=t.qty*(c.close-t.entryPrice)-t.notional*fee;
    }
    return {time:c.time,value};
  });
  if (Math.abs(equity.at(-1)!.value-finalEquity)>0.011) throw new Error('Niezgodność salda z historią transakcji. Wynik odrzucony.');
  let peak=initial,maxDrawdown=0,maxDrawdownPct=0;
  for(const e of equity){peak=Math.max(peak,e.value);maxDrawdown=Math.max(maxDrawdown,peak-e.value);maxDrawdownPct=Math.max(maxDrawdownPct,(peak-e.value)/peak*100);}
  const closed=trades.filter(t=>t.exitReason!=='Otwarta'),wins=closed.filter(t=>t.pnl>0),losses=closed.filter(t=>t.pnl<=0);
  const sum=(ts:Trade[])=>ts.reduce((a,t)=>a+t.pnl,0),grossProfit=sum(wins),grossLoss=-sum(losses);
  const plots: StrategyResult['plots']=[];
  for(const [title,plot] of Object.entries(ctx.plots) as [string,Runtime][]) {
    if(title.startsWith('__')||!Array.isArray(plot.data))continue;
    const data=plot.data.filter((p:Runtime)=>Number.isFinite(p.time)).map((p:Runtime)=>({time:p.time/1000,value:Number.isFinite(p.value)?p.value:NaN,color:p.options?.color})).filter((p:Runtime)=>req.startTime===undefined||p.time>=req.startTime);
    plots.push({title,color:data[0]?.color??'#2196f3',width:1,data});
  }
  const params: PineInput[]=script.getInputsMeta().flatMap((m:Runtime)=> {
    const kind=m.type ?? m.kind;
    if(!['int','float','bool','timeframe'].includes(kind))return [];
    const value=req.inputs?.[m.title] ?? script.input[m.title];
    return [{name:m.title,title:m.title,kind,value,step:m.step} as PineInput];
  });
  return {header:{title:s.config.title,initialCapital:initial,commissionPct:fee*100},params,
    warnings:[...new Set(ctx.warnings.map(w=>w.message)), 'PineTS 0.11.0: zgodność z TradingView nie jest pełna. Linie rysunkowe i wypełnienia nie są renderowane.'],
    result:{trades,equity,plots,stats:{initialCapital:initial,finalEquity,netProfit:finalEquity-initial,netProfitPct:(finalEquity/initial-1)*100,
      grossProfit,grossLoss,profitFactor:grossLoss?grossProfit/grossLoss:grossProfit?Infinity:0,totalTrades:closed.length,winners:wins.length,losers:losses.length,
      winRate:closed.length?wins.length/closed.length*100:0,avgTrade:closed.length?sum(closed)/closed.length:0,avgWin:wins.length?grossProfit/wins.length:0,avgLoss:losses.length?-grossLoss/losses.length:0,
      largestWin:wins.length?Math.max(...wins.map(t=>t.pnl)):0,largestLoss:losses.length?Math.min(...losses.map(t=>t.pnl)):0,
      maxDrawdown,maxDrawdownPct,maxIntrabarDrawdownPct:NaN,commission:trades.reduce((a,t)=>a+t.commission,0),buyHoldPct:(candles.at(-1)!.close/candles.find(c=>req.startTime===undefined||c.time>=req.startTime)!.close-1)*100,
      avgBars:closed.length?closed.reduce((a,t)=>a+t.bars,0)/closed.length:0,stopExits:closed.filter(t=>t.exitReason==='STOP_LOSS').length,signalExits:closed.filter(t=>t.exitReason!=='STOP_LOSS').length}}};
}
