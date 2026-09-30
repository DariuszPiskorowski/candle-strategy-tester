import { useState } from "react";
import type { PineHeader, PineInput, StrategyResult } from "@/lib/strategy/jarvis";

type Props = {
  header: PineHeader;
  params: PineInput[];
  onParams: (p: PineInput[]) => void;
  result: StrategyResult | null;
  showPlots: boolean;
  onShowPlots: (v: boolean) => void;
  dec: number;
  onPdf?: () => Promise<void>;
};

const fmt = (v: number, d = 2) =>
  Number.isFinite(v) ? v.toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d }) : "∞";
const dt = (t: number) =>
  new Date(t * 1000).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function StrategyPanel({ header, params, onParams, result, showPlots, onShowPlots, dec, onPdf }: Props) {
  const [tab, setTab] = useState<"stats" | "trades" | "params">("stats");
  const [pdfBusy, setPdfBusy] = useState(false);
  const s = result?.stats;
  const cls = (v: number) => (v >= 0 ? "text-bull" : "text-bear");

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold">{header.title}</div>
      <div className="text-[11px] text-muted-foreground">
        Kapitał {header.initialCapital} USD · prowizja {header.commissionPct}% · tylko Long
      </div>
      {result && onPdf && (
        <button
          className="tv-btn w-full"
          disabled={pdfBusy}
          onClick={async () => {
            setPdfBusy(true);
            try {
              await onPdf();
            } finally {
              setPdfBusy(false);
            }
          }}
        >
          {pdfBusy ? "Generowanie PDF…" : "Pobierz raport PDF"}
        </button>
      )}
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" className="tv-check" checked={showPlots} onChange={(e) => onShowPlots(e.target.checked)} />
        Pokaż linie strategii na wykresie
      </label>

      <div className="flex gap-0.5">
        {(["stats", "trades", "params"] as const).map((t) => (
          <button key={t} className={`tv-tf flex-1 ${tab === t ? "tv-tf-active" : ""}`} onClick={() => setTab(t)}>
            {t === "stats" ? "Wyniki" : t === "trades" ? "Transakcje" : "Parametry"}
          </button>
        ))}
      </div>

      {!result && <p className="text-[11px] text-muted-foreground">Za mało świec do symulacji (min. 50).</p>}

      {result && s && tab === "stats" && (
        <div className="space-y-1 font-mono text-[11px]">
          {(
            [
              ["Zysk netto", `${fmt(s.netProfit)} USD`, s.netProfit],
              ["Zysk netto %", `${fmt(s.netProfitPct)}%`, s.netProfitPct],
              ["Kapitał końcowy", `${fmt(s.finalEquity)} USD`],
              ["Kup i trzymaj", `${fmt(s.buyHoldPct)}%`, s.buyHoldPct],
              ["Transakcje", `${s.totalTrades}`],
              ["Zyskowne", `${s.winners} (${fmt(s.winRate, 1)}%)`],
              ["Stratne", `${s.losers}`],
              ["Profit factor", fmt(s.profitFactor)],
              ["Zysk brutto", `${fmt(s.grossProfit)} USD`, 1],
              ["Strata brutto", `${fmt(-s.grossLoss)} USD`, -1],
              ["Śr. transakcja", `${fmt(s.avgTrade)} USD`, s.avgTrade],
              ["Śr. zysk / strata", `${fmt(s.avgWin)} / ${fmt(s.avgLoss)}`],
              ["Największy zysk", `${fmt(s.largestWin)} USD`, 1],
              ["Największa strata", `${fmt(s.largestLoss)} USD`, -1],
              ["Maks. obsunięcie", `${fmt(s.maxDrawdown)} USD (${fmt(s.maxDrawdownPct)}%)`, -1],
              ["Prowizje", `${fmt(s.commission)} USD`],
              ["Śr. długość", `${fmt(s.avgBars, 1)} świec`],
              ["Wyjścia SELL / SL", `${s.signalExits} / ${s.stopExits}`],
            ] as [string, string, number?][]
          ).map(([k, v, sign]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-border/50 py-0.5">
              <span className="text-muted-foreground">{k}</span>
              <span className={sign === undefined ? "" : cls(sign)}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {result && tab === "trades" && (
        <div className="space-y-1.5">
          {result.trades.length === 0 && <p className="text-[11px] text-muted-foreground">Brak transakcji.</p>}
          {[...result.trades].reverse().map((t, i) => (
            <div key={t.entryTime} className="rounded border border-border bg-card p-1.5 font-mono text-[10.5px] leading-snug">
              <div className="flex justify-between">
                <span>#{result.trades.length - i} Long</span>
                <span className={cls(t.pnl)}>
                  {t.pnl >= 0 ? "+" : ""}
                  {fmt(t.pnl)} USD ({fmt(t.pnlPct)}%)
                </span>
              </div>
              <div className="text-muted-foreground">
                Wejście {dt(t.entryTime)} @ {t.entryPrice.toFixed(dec)}
              </div>
              <div className="text-muted-foreground">
                Wyjście {dt(t.exitTime)} @ {t.exitPrice.toFixed(dec)} ·{" "}
                <span className={t.exitReason === "STOP_LOSS" ? "text-bear" : ""}>{t.exitReason}</span>
              </div>
              <div className="text-muted-foreground">
                Wartość {fmt(t.notional)} USD · SL {t.stop.toFixed(dec)} · {t.bars} świec
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "params" && (
        <div className="space-y-1.5">
          {params.map((p, idx) => (
            <label key={p.name} className="flex items-center gap-2 text-[11px]">
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={p.title}>
                {p.title}
              </span>
              {p.kind === "source" ? (
                <span className="font-mono">close</span>
              ) : p.kind === "bool" ? (
                <input
                  type="checkbox"
                  className="tv-check"
                  checked={p.value === true}
                  onChange={(e) => {
                    const next = [...params];
                    next[idx] = { ...p, value: e.target.checked };
                    onParams(next);
                  }}
                />
              ) : (
                <input
                  className="tv-input w-20"
                  type={p.kind === "timeframe" ? "text" : "number"}
                  step={p.step ?? (p.kind === "float" ? 0.1 : 1)}
                  value={p.value as number | string}
                  onChange={(e) => {
                    const next = [...params];
                    next[idx] = {
                      ...p,
                      value: p.kind === "timeframe" ? e.target.value : Number(e.target.value) || 0,
                    };
                    onParams(next);
                  }}
                />
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
