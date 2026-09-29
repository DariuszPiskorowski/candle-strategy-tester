import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { TradingChart, type IndicatorSettings } from "@/components/chart/TradingChart";
import { aggregate, detectInterval, parseCandles, TIMEFRAMES, type Candle } from "@/lib/candles";
import { smaCrossBacktest } from "@/lib/backtest";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CandleLab — wykres świecowy do testowania wskaźników" },
      {
        name: "description",
        content:
          "Wgraj własny plik ze świecami (czas, O, H, L, C) i analizuj go na wykresie ze wskaźnikami oraz testerem strategii.",
      },
      { property: "og:title", content: "CandleLab — wykres świecowy dla własnych danych" },
      {
        property: "og:description",
        content:
          "Własny terminal wykresowy: świece, wolumen, MA, Bollinger, RSI, MACD i tester strategii na Twoich danych.",
      },
    ],
  }),
  component: Index,
});

const DEFAULTS: IndicatorSettings = {
  ma1: { on: true, length: 50, type: "SMA" },
  ma2: { on: true, length: 200, type: "SMA" },
  bb: { on: false, length: 20, mult: 2 },
  volume: true,
  rsi: { on: true, length: 14 },
  macd: { on: false, fast: 12, slow: 26, signal: 9 },
};

function Index() {
  const [raw, setRaw] = useState<Candle[]>([]);
  const [fileName, setFileName] = useState("demo-candles.json");
  const [error, setError] = useState<string | null>(null);
  const [tf, setTf] = useState<number | null>(null);
  const [chartType, setChartType] = useState<"candles" | "bars" | "line" | "area">("candles");
  const [ind, setInd] = useState<IndicatorSettings>(DEFAULTS);
  const [hover, setHover] = useState<Candle | null>(null);
  const [strategyOn, setStrategyOn] = useState(false);
  const [fastLen, setFastLen] = useState(20);
  const [slowLen, setSlowLen] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [indMenuOpen, setIndMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const indMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!indMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!indMenuRef.current?.contains(e.target as Node)) setIndMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIndMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [indMenuOpen]);

  useEffect(() => {
    fetch("/data/demo-candles.json")
      .then((r) => r.text())
      .then((t) => setRaw(parseCandles(t)))
      .catch(() => setError("Nie udało się wczytać danych demo."));
  }, []);

  const baseInterval = useMemo(() => (raw.length ? detectInterval(raw) : 60), [raw]);
  const candles = useMemo(
    () => (tf && tf > baseInterval ? aggregate(raw, tf) : raw),
    [raw, tf, baseInterval],
  );
  const backtest = useMemo(
    () => (strategyOn && candles.length ? smaCrossBacktest(candles, fastLen, slowLen) : null),
    [strategyOn, candles, fastLen, slowLen],
  );

  async function loadFiles(files: File[], merge: boolean) {
    try {
      const lists: Candle[][] = [];
      for (const f of files) {
        const parsed = parseCandles(await f.text());
        if (!parsed.length) throw new Error(`Brak rozpoznanych świec w pliku ${f.name}.`);
        lists.push(parsed);
      }
      const base = merge ? raw : [];
      const intervals = [...(base.length ? [base] : []), ...lists].map(detectInterval);
      if (new Set(intervals).size > 1)
        throw new Error("Pliki mają różne interwały świec — nie można ich połączyć.");
      const map = new Map<number, Candle>();
      for (const c of base) map.set(c.time, c);
      for (const l of lists) for (const c of l) map.set(c.time, c);
      const mergedList = [...map.values()].sort((a, b) => a.time - b.time);
      setRaw(mergedList);
      const names = files.map((f) => f.name).join(" + ");
      setFileName(merge && base.length ? `${fileName} + ${names}` : names);
      setTf(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się odczytać pliku.");
    }
  }
  const mergeRef = useRef<HTMLInputElement>(null);

  const last = hover ?? candles[candles.length - 1];
  const prev = last ? candles[candles.indexOf(last) - 1] : undefined;
  const changePct = last && prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const dec = last && last.close < 10 ? 5 : 2;

  return (
    <div
      className="flex h-screen flex-col bg-background text-foreground"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const fs = Array.from(e.dataTransfer.files ?? []);
        if (fs.length) void loadFiles(fs, true);
      }}
    >
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="mr-2 font-mono text-sm font-semibold tracking-tight text-primary">
          CandleLab
        </span>
        <button className="tv-btn" onClick={() => inputRef.current?.click()}>
          Wczytaj plik
        </button>
        <button
          className="tv-btn"
          title="Połącz z aktualnymi danymi (np. wcześniejszy zakres dat)"
          onClick={() => mergeRef.current?.click()}
        >
          + Dołącz plik
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".customization,.json,.txt,.csv"
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            if (fs.length) void loadFiles(fs, false);
            e.target.value = "";
          }}
        />
        <input
          ref={mergeRef}
          type="file"
          multiple
          accept=".customization,.json,.txt,.csv"
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            if (fs.length) void loadFiles(fs, true);
            e.target.value = "";
          }}
        />
        <span className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
          {fileName} · {candles.length} świec
        </span>

        <div className="tv-divider" />
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.filter((t) => t.sec >= baseInterval).map((t) => (
            <button
              key={t.label}
              className={`tv-tf ${(tf ?? baseInterval) === t.sec ? "tv-tf-active" : ""}`}
              onClick={() => setTf(t.sec)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="tv-divider" />
        <div className="relative" ref={indMenuRef}>
          <button
            className={`tv-btn ${indMenuOpen ? "tv-tf-active" : ""}`}
            onClick={() => setIndMenuOpen((v) => !v)}
          >
            Wskaźniki ▾
          </button>
          {indMenuOpen && (
            <div className="absolute left-0 top-full z-40 mt-1 w-[260px] space-y-2 rounded-md border border-border bg-card p-3 shadow-xl">
              <h2 className="tv-h">Wskaźniki</h2>
              {([1, 2] as const).map((n) => {
                const key = n === 1 ? "ma1" : "ma2";
                const cfg = ind[key];
                return (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="tv-check"
                      checked={cfg.on}
                      onChange={(e) => setInd({ ...ind, [key]: { ...cfg, on: e.target.checked } })}
                    />
                    <select
                      className="tv-input w-16"
                      value={cfg.type}
                      onChange={(e) =>
                        setInd({ ...ind, [key]: { ...cfg, type: e.target.value as "SMA" | "EMA" } })
                      }
                    >
                      <option>SMA</option>
                      <option>EMA</option>
                    </select>
                    <input
                      type="number"
                      className="tv-input w-16"
                      value={cfg.length}
                      min={1}
                      onChange={(e) =>
                        setInd({ ...ind, [key]: { ...cfg, length: Number(e.target.value) || 1 } })
                      }
                    />
                    <span
                      className="h-1 w-5 rounded"
                      style={{ background: n === 1 ? "#f7c744" : "#7e57c2" }}
                    />
                  </div>
                );
              })}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="tv-check"
                  checked={ind.bb.on}
                  onChange={(e) => setInd({ ...ind, bb: { ...ind.bb, on: e.target.checked } })}
                />
                <span className="flex-1 text-xs">Bollinger</span>
                <input
                  type="number"
                  className="tv-input w-14"
                  value={ind.bb.length}
                  onChange={(e) =>
                    setInd({ ...ind, bb: { ...ind.bb, length: Number(e.target.value) || 1 } })
                  }
                />
                <input
                  type="number"
                  step={0.5}
                  className="tv-input w-14"
                  value={ind.bb.mult}
                  onChange={(e) =>
                    setInd({ ...ind, bb: { ...ind.bb, mult: Number(e.target.value) || 2 } })
                  }
                />
              </div>

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="tv-check"
                  checked={ind.volume}
                  onChange={(e) => setInd({ ...ind, volume: e.target.checked })}
                />
                Wolumen
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="tv-check"
                  checked={ind.rsi.on}
                  onChange={(e) => setInd({ ...ind, rsi: { ...ind.rsi, on: e.target.checked } })}
                />
                <span className="flex-1 text-xs">RSI</span>
                <input
                  type="number"
                  className="tv-input w-14"
                  value={ind.rsi.length}
                  onChange={(e) =>
                    setInd({ ...ind, rsi: { ...ind.rsi, length: Number(e.target.value) || 1 } })
                  }
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="tv-check"
                  checked={ind.macd.on}
                  onChange={(e) => setInd({ ...ind, macd: { ...ind.macd, on: e.target.checked } })}
                />
                <span className="flex-1 text-xs">MACD</span>
                <input
                  type="number"
                  className="tv-input w-12"
                  value={ind.macd.fast}
                  onChange={(e) =>
                    setInd({ ...ind, macd: { ...ind.macd, fast: Number(e.target.value) || 12 } })
                  }
                />
                <input
                  type="number"
                  className="tv-input w-12"
                  value={ind.macd.slow}
                  onChange={(e) =>
                    setInd({ ...ind, macd: { ...ind.macd, slow: Number(e.target.value) || 26 } })
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="tv-divider" />
        <div className="flex items-center gap-0.5">
          {(["candles", "bars", "line", "area"] as const).map((t) => (
            <button
              key={t}
              className={`tv-tf ${chartType === t ? "tv-tf-active" : ""}`}
              onClick={() => setChartType(t)}
            >
              {t === "candles" ? "Świece" : t === "bars" ? "Bary" : t === "line" ? "Linia" : "Obszar"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Chart area */}
        <main className="relative min-w-0 flex-1">
          {last && (
            <div className="pointer-events-none absolute left-3 top-2 z-10 flex flex-wrap items-center gap-3 font-mono text-xs">
              <span className="text-muted-foreground">
                O <span className="text-foreground">{last.open.toFixed(dec)}</span>
              </span>
              <span className="text-muted-foreground">
                H <span className="text-bull">{last.high.toFixed(dec)}</span>
              </span>
              <span className="text-muted-foreground">
                L <span className="text-bear">{last.low.toFixed(dec)}</span>
              </span>
              <span className="text-muted-foreground">
                C <span className="text-foreground">{last.close.toFixed(dec)}</span>
              </span>
              <span className={changePct >= 0 ? "text-bull" : "text-bear"}>
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
              </span>
              <span className="text-muted-foreground">
                Vol <span className="text-foreground">{last.volume.toLocaleString("pl-PL")}</span>
              </span>
            </div>
          )}
          {error && (
            <div className="absolute inset-x-0 top-10 z-20 mx-auto w-fit rounded-md border border-bear/40 bg-card px-3 py-1.5 text-xs text-bear">
              {error}
            </div>
          )}
          {dragging && (
            <div className="absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-primary bg-background/70 text-sm">
              Upuść plik ze świecami
            </div>
          )}
          <ClientOnly fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Ładowanie wykresu…</div>}>
            <TradingChart
              candles={candles}
              indicators={ind}
              chartType={chartType}
              backtest={backtest}
              onHover={setHover}
            />
          </ClientOnly>
        </main>

        {/* Right panel */}
        <aside className="w-[270px] shrink-0 space-y-4 overflow-y-auto border-l border-border p-3">
          <section className="space-y-2">
            <h2 className="tv-h">Tester strategii</h2>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="tv-check"
                checked={strategyOn}
                onChange={(e) => setStrategyOn(e.target.checked)}
              />
              Przecięcie średnich (long)
            </label>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex-1 text-muted-foreground">Szybka / wolna</span>
              <input
                type="number"
                className="tv-input w-14"
                value={fastLen}
                onChange={(e) => setFastLen(Number(e.target.value) || 1)}
              />
              <input
                type="number"
                className="tv-input w-14"
                value={slowLen}
                onChange={(e) => setSlowLen(Number(e.target.value) || 1)}
              />
            </div>
            {backtest && (
              <dl className="space-y-1 font-mono text-xs">
                <Stat label="Wynik" value={`${backtest.totalPct.toFixed(2)}%`} good={backtest.totalPct >= 0} />
                <Stat label="Transakcje" value={String(backtest.trades.length)} />
                <Stat label="Trafność" value={`${backtest.winRate.toFixed(1)}%`} />
                <Stat label="Max obsunięcie" value={`${backtest.maxDrawdownPct.toFixed(2)}%`} good={false} />
              </dl>
            )}
          </section>

          <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            Wczytaj plik .customization / .json / .csv ze świecami. Obsługiwane formaty: tablice
            Binance kline oraz obiekty z polami time/open/high/low/close/volume.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={good === undefined ? "" : good ? "text-bull" : "text-bear"}>{value}</dd>
    </div>
  );
}
