import fs from 'node:fs';
import path from 'node:path';
import { parseCandles } from '../src/lib/candles.ts';
import { parsePineInputs, parsePineHeader, runJarvis } from '../src/lib/strategy/jarvis.ts';

const upload = process.argv[2];
const output = process.argv[3];
if (!upload || !output) throw new Error('Usage: node scripts/tune-sui.mjs UPLOAD_DIRECTORY OUTPUT_DIRECTORY');
fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync(path.join(upload, 'jarvis_sui_spot_100pct(1).txt'), 'utf8');
const initial = Object.fromEntries(parsePineInputs(source).map(p => [p.name, p.value]));
const header = parsePineHeader(source);
const files = ['poczatek.customization_4(1).customization', 'poczatek.customization_5(1).customization', 'poczatek.customization_6(1).customization', 'do 29.06.26(2).customization'];
const merged = new Map();
const conflicts = [];
let duplicates = 0;
for (const file of files) {
  for (const c of parseCandles(fs.readFileSync(path.join(upload, file), 'utf8'))) {
    if (merged.has(c.time)) {
      duplicates++;
      if (JSON.stringify(merged.get(c.time)) !== JSON.stringify(c)) conflicts.push({time:c.time, previous:merged.get(c.time), selected:c, file});
    }
    // The later download overwrites the unfinished last candle of the older file.
    merged.set(c.time, c);
  }
}
const candles = [...merged.values()].sort((a,b) => a.time-b.time);
for(let i=1;i<candles.length;i++) if(candles[i].time-candles[i-1].time!==14400) throw new Error('Missing or inconsistent 4H candle');
const options = { startTime:Date.parse('2026-06-01T00:00:00Z')/1000, endTime:Date.parse('2026-09-30T23:59:59Z')/1000 };
const parameterOrder = [
  ['sidewaysLookback',1,2,40],
  ['sidewaysMaxRangePct',1,0.1,15],
  ['sidewaysMaxAvgBodyPct',1,0.1,8],
  ['period',1,2,40],
  ['conversionPeriod',1,1,40],
  ['basePeriod',1,2,80],
  ['laggingSpanPeriod',1,1,60],
  ['macdLength',1,1,40],
  ['macdFastLength',1,2,60],
  ['macdSlowLength',1,3,100],
  ['swingLookback',1,1,60],
  ['swingBuffer',0.05,0,3],
];
const cache = new Map();
const trials = [];
const changes = [];
let calls = 0;
function summarize(r) {
  const open = r.trades.find(t=>t.exitReason==='Otwarta');
  const estimatedExitFee = open ? open.qty*open.exitPrice*header.commissionPct/100 : 0;
  const liquidationEquity = r.stats.finalEquity-estimatedExitFee;
  return {...r.stats, liquidationEquity, liquidationProfitPct:(liquidationEquity/header.initialCapital-1)*100,
    conservativeDDPct:Math.max(r.stats.maxDrawdownPct,r.stats.maxIntrabarDrawdownPct),
    expectancyPct:r.trades.filter(t=>t.exitReason!=='Otwarta').reduce((a,t)=>a+t.pnlPct,0)/(r.stats.totalTrades||1),
    payoffRatio:r.stats.avgLoss<0?r.stats.avgWin/-r.stats.avgLoss:null,
    openPosition:open??null};
}
function evaluate(p,meta={}) {
  const key=JSON.stringify(p);
  if(!cache.has(key)) {
    const r=runJarvis(candles,p,header,undefined,options);
    cache.set(key,{params:{...p},stats:summarize(r)});
    calls++;
  }
  const result=cache.get(key);
  trials.push({trial:trials.length+1,...meta,...result});
  return result;
}
function compare(a,b) {
  const x=a.stats,y=b.stats;
  const eligible=s=>s.conservativeDDPct<=30+1e-9 && s.totalTrades>0;
  if(eligible(x)!==eligible(y)) return eligible(x)?1:-1;
  if(!eligible(x) && Math.abs(x.conservativeDDPct-y.conservativeDDPct)>1e-9) return y.conservativeDDPct-x.conservativeDDPct;
  // Lexicographic priorities; no weighted artificial score.
  for(const [key,sign] of [['liquidationProfitPct',1],['conservativeDDPct',-1],['profitFactor',1],['expectancyPct',1],['payoffRatio',1],['winRate',1]]) {
    const xv=x[key]??0,yv=y[key]??0;
    if(xv===yv) continue;
    if(Math.abs(xv-yv)>1e-9) return sign*(xv-yv);
  }
  return 0;
}
function allowed(p,key,value,min,max) {
  if(value<min-1e-9 || value>max+1e-9) return false;
  const q={...p,[key]:value};
  return q.macdFastLength<q.macdSlowLength;
}
const baseline=evaluate(initial,{stage:'baseline'});
const documented=evaluate({...initial,sidewaysLookback:8,sidewaysMaxRangePct:6,sidewaysMaxAvgBodyPct:3,swingLookback:15},{stage:'documented_reference'});
console.log('BASELINE',JSON.stringify(baseline.stats));
console.log('DOCUMENTED',JSON.stringify(documented.stats));
// Retain the best already tested starting point rather than discard a known better reference.
let current=process.argv[4]==="baseline"?baseline:(compare(documented,baseline)>0?documented:baseline);
const startingPoint=current===documented?"documented_reference":"baseline";
let converged=false;
for(let pass=1;pass<=12;pass++) {
  let changed=false;
  for(const [key,step,min,max] of parameterOrder) {
    const anchor=current;
    let best=anchor;
    for(const direction of [1,-1]) {
      let previous=anchor;
      let flats=0;
      for(let distance=1;distance<=100;distance++) {
        const value=Number((anchor.params[key]+direction*step*distance).toFixed(8));
        if(!allowed(anchor.params,key,value,min,max)) break;
        const candidate=evaluate({...anchor.params,[key]:value},{stage:'tuning',pass,parameter:key,direction,distance});
        if(compare(candidate,best)>0) best=candidate;
        const versusPrevious=compare(candidate,previous);
        if(versusPrevious<0) break;
        if(versusPrevious===0) {if(++flats>=3) break;} else flats=0;
        previous=candidate;
      }
    }
    if(compare(best,current)>0) {
      changes.push({pass,parameter:key,from:current.params[key],to:best.params[key],before:current.stats,after:best.stats});
      current=best;
      changed=true;
      console.log('PROMOTE',pass,key,anchor.params[key],'->',best.params[key],best.stats.liquidationProfitPct.toFixed(4),'DD',best.stats.conservativeDDPct.toFixed(4));
    }
  }
// Verify percentage thresholds at the 0.1 pp resolution exposed by the Pine inputs.
for(const key of ['sidewaysMaxRangePct','sidewaysMaxAvgBodyPct']) {
  const anchor=current;
  let best=anchor;
  for(let j=-10;j<=10;j++) {
    const value=Number((anchor.params[key]+j*0.1).toFixed(8));
    if(value<0.1) continue;
    const candidate=evaluate({...anchor.params,[key]:value},{stage:'fine_threshold',pass,parameter:key});
    if(compare(candidate,best)>0) best=candidate;
  }
  if(compare(best,current)>0) {
    changes.push({pass,parameter:key,from:current.params[key],to:best.params[key],before:current.stats,after:best.stats});
    current=best;
    changed=true;
    console.log("PROMOTE FINE",pass,key,anchor.params[key],"->",best.params[key]);
  }
}
  console.log('PASS',pass,'unique tests',calls,'PnL%',current.stats.liquidationProfitPct.toFixed(4));
  if(!changed) {converged=true;break;}
  if(calls>=600) break;
}
const neighbors=[];
for(const [key,step,min,max] of parameterOrder) {
  for(const direction of [-1,1]) {
    const value=Number((current.params[key]+direction*step).toFixed(8));
    if(allowed(current.params,key,value,min,max)) neighbors.push({parameter:key,value,...evaluate({...current.params,[key]:value},{stage:'neighbors',parameter:key})});
  }
}
const months=[];
for(let month=6;month<=9;month++) {
  const start=Date.UTC(2026,month-1,1)/1000,end=Date.UTC(2026,month,1)/1000-1;
  for(const [version,p] of [['baseline',initial],['tuned',current.params]]) {
    months.push({month,version,...summarize(runJarvis(candles,p,header,undefined,{startTime:start,endTime:end}))});
  }
}
const finalResult=runJarvis(candles,current.params,header,undefined,options);
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({sourceCommit:'802b1dee9f0ddee166df191c2b34168ea388bb6e',header,options,parameterOrder,baseline,documented,best:current,startingPoint,converged,calls,trials,changes,neighbors,months,data:{count:candles.length,duplicates,conflicts,start:candles[0].time,end:candles.at(-1).time,testCount:candles.filter(c=>c.time>=options.startTime).length},trades:finalResult.trades,equity:finalResult.equity},null,2));
fs.writeFileSync(path.join(output,'merged-candles.json'),JSON.stringify(candles));
console.log('BEST',JSON.stringify(current.params));
console.log('STATS',JSON.stringify(current.stats));
console.log('Unique optimization tests:',calls,'converged:',converged);
